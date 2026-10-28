"use client";

/**
 * My appointments — the customer view over GET /api/appointments.
 *
 * The list is split client-side into Upcoming (BOOKED and not started yet,
 * sorted ascending) and History (everything else, sorted descending).
 * Upcoming cards carry cancel / reschedule actions; history is read-only.
 */

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, CalendarClock, History } from "lucide-react";
import { RequireRole } from "@/components/require-role";
import { useClinicTimezone } from "@/components/providers";
import { AppointmentCard } from "@/components/booking/appointment-card";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import type { AppointmentDTO } from "@/lib/types";

function AppointmentListSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading appointments">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="rounded-xl border bg-card p-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-7 w-20" />
          <Skeleton className="mt-4 h-5 w-2/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <Skeleton className="mt-4 h-9 w-44" />
        </div>
      ))}
    </div>
  );
}

export default function AppointmentsPage() {
  const tz = useClinicTimezone();
  const [now] = useState(() => new Date());

  const appointmentsQuery = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api<{ appointments: AppointmentDTO[] }>("/api/appointments"),
  });

  const appointments = appointmentsQuery.data?.appointments ?? [];

  const { upcoming, history } = useMemo(() => {
    const upcomingList: AppointmentDTO[] = [];
    const historyList: AppointmentDTO[] = [];
    for (const appointment of appointments) {
      if (appointment.status === "BOOKED" && new Date(appointment.startsAt) >= now) {
        upcomingList.push(appointment);
      } else {
        historyList.push(appointment);
      }
    }
    upcomingList.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    historyList.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return { upcoming: upcomingList, history: historyList };
  }, [appointments, now]);

  const listClassName =
    "flex max-h-[36rem] flex-col gap-4 overflow-y-auto pr-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent";

  let content: ReactNode;

  if (appointmentsQuery.isLoading) {
    content = <AppointmentListSkeleton />;
  } else if (appointmentsQuery.isError) {
    content = (
      <ErrorBlock
        message="Could not load your appointments. Please try again."
        onRetry={() => appointmentsQuery.refetch()}
      />
    );
  } else {
    content = (
      <Tabs defaultValue="upcoming" className="gap-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto">
          <TabsTrigger value="upcoming" className="gap-2">
            <CalendarClock className="h-4 w-4" aria-hidden />
            Upcoming ({upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" aria-hidden />
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-0">
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyBlock
                icon={CalendarClock}
                title="No upcoming appointments"
                description={`You have no visits coming up in ${tz} clinic time — book your first one in under a minute.`}
              />
              <Button asChild className="gap-2">
                <Link href="/book">
                  <CalendarCheck2 className="h-4 w-4" aria-hidden />
                  Book an appointment
                </Link>
              </Button>
            </div>
          ) : (
            <ul className={listClassName}>
              {upcoming.map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentCard appointment={appointment} showActions />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          {history.length === 0 ? (
            <EmptyBlock
              icon={History}
              title="No past appointments yet"
              description="Your completed and cancelled visits will appear here."
            />
          ) : (
            <ul className={listClassName}>
              {history.map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentCard appointment={appointment} showActions={false} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <RequireRole roles={["CUSTOMER"]}>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              My appointments
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your upcoming visits and browse your history. All times are in
              clinic local time ({tz}).
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/book">
              <CalendarCheck2 className="h-4 w-4" aria-hidden />
              Book appointment
            </Link>
          </Button>
        </header>

        {content}
      </div>
    </RequireRole>
  );
}
