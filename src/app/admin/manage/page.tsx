"use client";

/**
 * Admin management console (/admin/manage, ADMIN only):
 * Services | Doctors | Hours & time off | All appointments.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireRole } from "@/components/require-role";
import { ServicesTab } from "@/components/admin/services-tab";
import { DoctorsTab } from "@/components/admin/doctors-tab";
import { HoursTab } from "@/components/admin/hours-tab";
import { AppointmentsTab } from "@/components/admin/appointments-tab";

function ManageConsole() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Manage clinic
          </h1>
          <p className="text-muted-foreground">
            Keep the service catalog, doctor accounts, schedules and
            appointments up to date.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="w-fit gap-2">
          <Link href="/admin">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="services" className="mt-6 gap-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="doctors">Doctors</TabsTrigger>
          <TabsTrigger value="hours">Hours &amp; time off</TabsTrigger>
          <TabsTrigger value="appointments">All appointments</TabsTrigger>
        </TabsList>
        <TabsContent value="services">
          <ServicesTab />
        </TabsContent>
        <TabsContent value="doctors">
          <DoctorsTab />
        </TabsContent>
        <TabsContent value="hours">
          <HoursTab />
        </TabsContent>
        <TabsContent value="appointments">
          <AppointmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ManagePage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <ManageConsole />
    </RequireRole>
  );
}
