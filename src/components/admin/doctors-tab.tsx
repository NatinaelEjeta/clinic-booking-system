"use client";

/**
 * Admin console — Doctors tab: doctor cards with offered-service badges
 * plus a create dialog (account credentials) and an edit dialog
 * (name, specialty, services). Accounts are never deleted.
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { api } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";
import type { ServiceDTO, StaffDTO } from "@/lib/types";

type DoctorDialogState =
  | { mode: "create" }
  | { mode: "edit"; doctor: StaffDTO }
  | null;

function initialsOf(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

/** Checkbox list of all services (including inactive ones). */
function ServiceChecklist({
  services,
  selectedIds,
  onToggle,
}: {
  services: ServiceDTO[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (services.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No services in the catalog yet — add some in the Services tab first.
      </p>
    );
  }
  return (
    <ScrollArea className="max-h-48 rounded-lg border [&>[data-radix-scroll-area-viewport]]:max-h-48">
      <div className="flex flex-col gap-0.5 p-2">
        {services.map((service) => (
          <label
            key={service.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Checkbox
              checked={selectedIds.has(service.id)}
              onCheckedChange={() => onToggle(service.id)}
              aria-label={`Offer ${service.name}`}
            />
            <span className="min-w-0 flex-1 truncate">{service.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDuration(service.durationMinutes)}
            </span>
            {!service.active && (
              <Badge variant="outline" className="shrink-0 font-normal">
                inactive
              </Badge>
            )}
          </label>
        ))}
      </div>
    </ScrollArea>
  );
}

/**
 * Create / edit dialog. Rendered conditionally by the parent so the fields
 * can be prefilled via useState initializers.
 */
function DoctorDialog({
  doctor,
  onClose,
}: {
  doctor?: StaffDTO;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = doctor !== undefined;

  const [name, setName] = useState(() => doctor?.name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialty, setSpecialty] = useState(() => doctor?.specialty ?? "");
  const [serviceIds, setServiceIds] = useState<Set<string>>(
    () => new Set(doctor?.services.map((service) => service.id) ?? []),
  );

  const servicesQuery = useQuery({
    queryKey: ["services", "all"],
    queryFn: () => api<{ services: ServiceDTO[] }>("/api/services?all=1"),
  });
  const services = servicesQuery.data?.services ?? [];

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const formValid =
    name.trim().length >= 2 &&
    specialty.trim().length >= 2 &&
    (isEdit || (emailValid && password.length >= 8));

  const mutation = useMutation({
    mutationFn: () => {
      const serviceIdList = [...serviceIds];
      return isEdit
        ? api<{ staff: StaffDTO }>(`/api/staff/${doctor.id}`, {
            method: "PATCH",
            body: {
              name: name.trim(),
              specialty: specialty.trim(),
              serviceIds: serviceIdList,
            },
          })
        : api<{ staff: StaffDTO }>("/api/staff", {
            method: "POST",
            body: {
              name: name.trim(),
              email: email.trim(),
              password,
              specialty: specialty.trim(),
              serviceIds: serviceIdList,
            },
          });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success(isEdit ? "Doctor updated" : "Doctor added");
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  function toggleService(id: string) {
    setServiceIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (formValid && !mutation.isPending) mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit doctor" : "Add doctor"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the profile and the services this doctor offers."
              : "Create a doctor account — they sign in with the email and password you set."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="doctor-name">Name</Label>
              <Input
                id="doctor-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={80}
                placeholder="e.g. Dr. Sara Tesfaye"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="doctor-specialty">Specialty</Label>
              <Input
                id="doctor-specialty"
                value={specialty}
                onChange={(event) => setSpecialty(event.target.value)}
                required
                minLength={2}
                maxLength={120}
                placeholder="e.g. General Medicine"
              />
            </div>
          </div>

          {isEdit ? (
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{doctor.email}</span> — the
              email and password cannot be changed here.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="doctor-email">Email</Label>
                <Input
                  id="doctor-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={120}
                  placeholder="doctor@clinic.example"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="doctor-password">Password</Label>
                <Input
                  id="doctor-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  maxLength={100}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 8 characters — share it with the doctor.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Offered services</Label>
            {servicesQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : servicesQuery.isError ? (
              <p className="text-sm text-destructive">
                Could not load the service list — please try again.
              </p>
            ) : (
              <ServiceChecklist
                services={services}
                selectedIds={serviceIds}
                onToggle={toggleService}
              />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formValid || mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {isEdit ? "Save changes" : "Create doctor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DoctorsTab() {
  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => api<{ staff: StaffDTO[] }>("/api/staff"),
  });

  const [dialog, setDialog] = useState<DoctorDialogState>(null);

  const doctors = staffQuery.data?.staff ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Doctors</h2>
            <p className="text-sm text-muted-foreground">
              Accounts, specialties and the services they offer.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add doctor
          </Button>
        </div>

        {staffQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : staffQuery.isError ? (
          <ErrorBlock
            message="Could not load doctors. Please try again."
            onRetry={() => staffQuery.refetch()}
          />
        ) : doctors.length === 0 ? (
          <EmptyBlock
            title="No doctors yet"
            description="Add the first doctor account so patients can book visits."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {doctors.map((doctor) => (
              <div
                key={doctor.id}
                className="flex flex-col gap-4 rounded-xl border p-5"
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                      {initialsOf(doctor.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{doctor.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {doctor.email}
                    </p>
                    <p className="text-sm">{doctor.specialty}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-2"
                    onClick={() => setDialog({ mode: "edit", doctor })}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {doctor.services.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No services assigned yet.
                    </span>
                  ) : (
                    doctor.services.map((service) => (
                      <Badge
                        key={service.id}
                        variant="secondary"
                        className="font-normal"
                      >
                        {service.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Doctors keep their appointment history — accounts are never deleted.
        </p>
      </CardContent>

      {dialog && (
        <DoctorDialog
          key={dialog.mode === "edit" ? dialog.doctor.id : "create"}
          doctor={dialog.mode === "edit" ? dialog.doctor : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}
