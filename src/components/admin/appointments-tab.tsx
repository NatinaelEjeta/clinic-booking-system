"use client";

/**
 * Admin console — All appointments tab: server-side status / clinic-local date
 * filters plus client-side search across patient, doctor and service names.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClinicTimezone } from "@/components/providers";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBlock } from "@/components/states";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { api } from "@/lib/api-client";
import { formatDateTimeInTz } from "@/lib/time";
import type { AppointmentDTO } from "@/lib/types";

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "BOOKED", label: "Booked" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "NO_SHOW", label: "No-show" },
] as const;

const DISPLAY_CAP = 100;

export function AppointmentsTab() {
  const tz = useClinicTimezone();
  const [status, setStatus] = useState<string>("all");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", "admin", status, date || "all"],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (date !== "") params.set("date", date);
      const query = params.toString();
      return api<{ appointments: AppointmentDTO[] }>(
        `/api/appointments${query ? `?${query}` : ""}`,
      );
    },
  });

  const appointments = appointmentsQuery.data?.appointments ?? [];

  const needle = search.trim().toLowerCase();
  const filtered =
    needle === ""
      ? appointments
      : appointments.filter((appointment) =>
          [
            appointment.customer?.name,
            appointment.staff.name,
            appointment.service.name,
          ].some(
            (value) =>
              value !== undefined && value.toLowerCase().includes(needle),
          ),
        );
  const shown = filtered.slice(0, DISPLAY_CAP);

  const hasActiveFilters = status !== "all" || date !== "" || search !== "";

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">All appointments</h2>
          <p className="text-sm text-muted-foreground">
            Every booking in the clinic — filter, search and audit.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger
              className="w-full sm:w-44"
              aria-label="Filter by status"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-label="Filter by clinic-local date"
            className="w-full sm:w-44"
          />
          <div className="relative w-full flex-1 sm:min-w-56">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient, doctor or service…"
              aria-label="Search appointments"
              className="pl-9"
            />
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => {
                setStatus("all");
                setDate("");
                setSearch("");
              }}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden /> Reset
            </Button>
          )}
        </div>

        {appointmentsQuery.isLoading ? (
          <TableSkeleton rows={8} />
        ) : appointmentsQuery.isError ? (
          <ErrorBlock
            message="Could not load appointments. Please try again."
            onRetry={() => appointmentsQuery.refetch()}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="max-h-[520px] overflow-y-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date &amp; time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead className="hidden lg:table-cell">Doctor</TableHead>
                    <TableHead className="hidden sm:table-cell">Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No appointments match the filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    shown.map((appointment) => (
                      <TableRow key={appointment.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {formatDateTimeInTz(new Date(appointment.startsAt), tz)}
                        </TableCell>
                        <TableCell className="max-w-40 truncate">
                          {appointment.customer?.name ?? "—"}
                        </TableCell>
                        <TableCell className="hidden max-w-40 truncate lg:table-cell">
                          {appointment.staff.name}
                        </TableCell>
                        <TableCell className="hidden max-w-40 truncate sm:table-cell">
                          {appointment.service.name}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={appointment.status} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span
                            className="block max-w-48 truncate"
                            title={appointment.notes || undefined}
                          >
                            {appointment.notes || "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {filtered.length > DISPLAY_CAP
                ? "Showing the 100 most recent appointments."
                : `${filtered.length} ${
                    filtered.length === 1 ? "appointment" : "appointments"
                  } found.`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
