"use client";

/**
 * Admin dashboard (ADMIN only) — today at a glance, a 7-day bookings chart
 * (Recharts), today's appointment list across all doctors and top services.
 */

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  CalendarRange,
  CalendarX,
  Settings2,
  Star,
  TrendingDown,
} from "lucide-react";
import { RequireRole } from "@/components/require-role";
import { useClinicTimezone } from "@/components/providers";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { dateKeyOf, formatFullDayLabel, formatTimeInTz } from "@/lib/time";
import type { AdminStats, AppointmentDTO } from "@/lib/types";

export default function AdminPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <AdminDashboard />
    </RequireRole>
  );
}

function AdminDashboard() {
  const tz = useClinicTimezone();
  const [now] = useState(() => new Date());
  const todayLabel = formatFullDayLabel(dateKeyOf(now, tz));

  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api<{ stats: AdminStats }>("/api/admin/stats"),
    staleTime: 30_000,
  });

  const stats = statsQuery.data?.stats ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Clinic dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clinic activity for {todayLabel} · all times in {tz}
          </p>
        </div>
        <Button asChild className="gap-2 self-start sm:self-auto">
          <Link href="/admin/manage">
            <Settings2 className="h-4 w-4" aria-hidden />
            Manage services &amp; doctors
          </Link>
        </Button>
      </header>

      <div className="mt-6">
        {!stats && statsQuery.isError ? (
          <ErrorBlock
            message={
              statsQuery.error instanceof ApiClientError
                ? statsQuery.error.message
                : "Could not load clinic statistics."
            }
            onRetry={() => void statsQuery.refetch()}
          />
        ) : !stats ? (
          <DashboardSkeleton />
        ) : (
          <DashboardBody stats={stats} tz={tz} />
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Loading dashboard"
      aria-busy="true"
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[340px] rounded-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

function DashboardBody({ stats, tz }: { stats: AdminStats; tz: string }) {
  const topService = stats.topServices[0] ?? null;
  const topServices = [...stats.topServices].sort((a, b) => b.count - a.count);
  const maxCount = topServices[0]?.count ?? 0;
  const todayAppointments = [...stats.todayAppointments].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Appointments today"
          value={String(stats.todayCount)}
          icon={CalendarDays}
          iconClass="bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
        />
        <StatCard
          label="Next 7 days"
          value={String(stats.next7DaysCount)}
          icon={CalendarRange}
          iconClass="bg-muted text-muted-foreground"
        />
        <StatCard
          label="Cancellation rate"
          value={`${stats.cancellationRate}%`}
          caption={`cancelled / total: ${stats.totals.cancelled}/${stats.totals.total}`}
          icon={TrendingDown}
          iconClass={
            stats.cancellationRate > 20
              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              : "bg-muted text-muted-foreground"
          }
        />
        <StatCard
          label="Top service"
          value={topService?.name ?? "—"}
          caption={
            topService ? `${topService.count} bookings (30d)` : "no bookings yet"
          }
          icon={Star}
          iconClass="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bookings — next 7 days</CardTitle>
          <CardDescription>
            Booked appointments per day across all doctors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.next7DaysCount === 0 ? (
            <EmptyBlock
              title="No bookings in the next 7 days."
              description="New bookings will appear here as patients reserve slots."
              icon={CalendarX}
            />
          ) : (
            <div className="w-full">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={stats.bookingsPerDay}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                  />
                  <XAxis
                    dataKey="label"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={28}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip cursor={{ fill: "var(--muted)" }} />
                  <Bar
                    dataKey="bookings"
                    name="Bookings"
                    fill="#0d9488"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appointments today</CardTitle>
            <CardDescription>
              {stats.todayCount === 0
                ? "No visits scheduled."
                : `${stats.todayCount} visits across all doctors.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {todayAppointments.length === 0 ? (
              <EmptyBlock title="No appointments today." icon={CalendarX} />
            ) : (
              <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                {todayAppointments.map((appointment) => (
                  <TodayRow
                    key={appointment.id}
                    appointment={appointment}
                    tz={tz}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top services</CardTitle>
            <CardDescription>
              Most booked services in the last 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topServices.length === 0 ? (
              <EmptyBlock
                title="No bookings yet."
                description="Service popularity appears here once appointments exist."
                icon={Star}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {topServices.map((service) => (
                  <div
                    key={service.serviceId}
                    className="flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">
                        {service.name}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {service.count}
                      </span>
                    </div>
                    <Progress
                      value={
                        maxCount > 0 ? (service.count / maxCount) * 100 : 0
                      }
                      aria-label={`${service.count} bookings for ${service.name}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: typeof CalendarDays;
  iconClass: string;
}) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 truncate text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </p>
      {caption && (
        <p className="mt-1.5 text-xs text-muted-foreground">{caption}</p>
      )}
    </Card>
  );
}

function TodayRow({
  appointment,
  tz,
}: {
  appointment: AppointmentDTO;
  tz: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">
        {formatTimeInTz(new Date(appointment.startsAt), tz)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {appointment.customer?.name ?? "—"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {appointment.staff.name} · {appointment.service.name}
        </p>
      </div>
      <StatusBadge status={appointment.status} />
    </li>
  );
}
