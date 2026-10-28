"use client";

/**
 * Admin console — Services tab: the full catalog (including inactive
 * services) with an inline activate toggle plus create/edit dialogs.
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { api } from "@/lib/api-client";
import { formatDuration, formatPrice } from "@/lib/format";
import type { ServiceDTO } from "@/lib/types";

type ServiceDialogState =
  | { mode: "create" }
  | { mode: "edit"; service: ServiceDTO }
  | null;

/**
 * Create / edit dialog. Rendered conditionally by the parent so the fields
 * can be initialized from the server data via useState initializers.
 */
function ServiceDialog({
  service,
  onClose,
}: {
  service?: ServiceDTO;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = service !== undefined;

  const [name, setName] = useState(() => service?.name ?? "");
  const [duration, setDuration] = useState(() =>
    service ? String(service.durationMinutes) : "30",
  );
  const [price, setPrice] = useState(() => (service ? String(service.price) : ""));
  const [active, setActive] = useState(() => service?.active ?? true);

  const parsedDuration = Number(duration);
  const parsedPrice = Number(price);
  const formValid =
    name.trim().length >= 2 &&
    Number.isInteger(parsedDuration) &&
    parsedDuration >= 5 &&
    parsedDuration <= 480 &&
    Number.isFinite(parsedPrice) &&
    parsedPrice >= 0;

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        durationMinutes: parsedDuration,
        price: parsedPrice,
        active,
      };
      return isEdit
        ? api<{ service: ServiceDTO }>(`/api/services/${service.id}`, {
            method: "PATCH",
            body,
          })
        : api<{ service: ServiceDTO }>("/api/services", {
            method: "POST",
            body,
          });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", "all"] });
      toast.success(isEdit ? "Service updated" : "Service created");
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (formValid && !mutation.isPending) mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit service" : "Add service"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the catalog details below."
              : "Create a new bookable service for the clinic."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="e.g. Dental cleaning"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="service-duration">Duration (minutes)</Label>
              <Input
                id="service-duration"
                type="number"
                min={5}
                max={480}
                step={1}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="service-price">Price (ETB)</Label>
              <Input
                id="service-price"
                type="number"
                min={0}
                step={1}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0">
              <Label htmlFor="service-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive services keep their history but cannot be booked.
              </p>
            </div>
            <Switch
              id="service-active"
              checked={active}
              onCheckedChange={setActive}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formValid || mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {isEdit ? "Save changes" : "Create service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServicesTab() {
  const queryClient = useQueryClient();

  const servicesQuery = useQuery({
    queryKey: ["services", "all"],
    queryFn: () => api<{ services: ServiceDTO[] }>("/api/services?all=1"),
  });

  const [dialog, setDialog] = useState<ServiceDialogState>(null);

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api<{ service: ServiceDTO }>(`/api/services/${input.id}`, {
        method: "PATCH",
        body: { active: input.active },
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["services", "all"] });
      toast.success(variables.active ? "Service activated" : "Service deactivated");
    },
    onError: (error) => {
      toast.error(error.message);
      // Refetch so the switch snaps back to the server truth.
      queryClient.invalidateQueries({ queryKey: ["services", "all"] });
    },
  });

  const services = servicesQuery.data?.services ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Services</h2>
            <p className="text-sm text-muted-foreground">
              The bookable catalog — durations, prices and availability.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add service
          </Button>
        </div>

        {servicesQuery.isLoading ? (
          <TableSkeleton rows={5} />
        ) : servicesQuery.isError ? (
          <ErrorBlock
            message="Could not load services. Please try again."
            onRetry={() => servicesQuery.refetch()}
          />
        ) : services.length === 0 ? (
          <EmptyBlock
            title="No services yet"
            description="Add the first service patients can book online."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Duration</TableHead>
                  <TableHead className="hidden md:table-cell">Price</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => (
                  <TableRow
                    key={service.id}
                    className={service.active ? undefined : "opacity-60"}
                  >
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatDuration(service.durationMinutes)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatPrice(service.price)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={service.active}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({
                            id: service.id,
                            active: checked,
                          })
                        }
                        disabled={
                          toggleMutation.isPending &&
                          toggleMutation.variables?.id === service.id
                        }
                        aria-label={
                          service.active
                            ? `Deactivate ${service.name}`
                            : `Activate ${service.name}`
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setDialog({ mode: "edit", service })}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {dialog && (
        <ServiceDialog
          key={dialog.mode === "edit" ? dialog.service.id : "create"}
          service={dialog.mode === "edit" ? dialog.service : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}
