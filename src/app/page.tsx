"use client";

/** Public landing page: hero, live services & doctors directory, demo accounts. */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarCheck2,
  Clock,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { LoadingBlock, ErrorBlock } from "@/components/states";
import { useMe } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import { formatDuration, formatPrice } from "@/lib/format";
import type { ServiceDTO, StaffDTO } from "@/lib/types";

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@clinic.demo", password: "Admin123!", hint: "manage everything" },
  { label: "Doctor", email: "doctor@clinic.demo", password: "Doctor123!", hint: "see the calendar" },
  { label: "Patient", email: "patient@clinic.demo", password: "Patient123!", hint: "book a visit" },
];

export default function LandingPage() {
  const { me } = useMe();
  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: () => api<{ services: ServiceDTO[] }>("/api/services"),
  });
  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => api<{ staff: StaffDTO[] }>("/api/staff"),
  });

  const services = servicesQuery.data?.services ?? [];
  const doctors = staffQuery.data?.staff ?? [];
  const hasData = !servicesQuery.isLoading && !staffQuery.isLoading;

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/10 via-background to-background">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="flex flex-col items-start gap-5">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Online booking, open 24/7
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Healthcare scheduling that respects your time
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              Browse services, choose your doctor and lock in a time in under a
              minute. Free cancellation up to 24 hours before your visit.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="gap-2">
                <Link href={me ? (me.role === "CUSTOMER" ? "/book" : "/") : "/login"}>
                  <CalendarCheck2 className="h-4 w-4" aria-hidden />
                  {me ? (me.role === "CUSTOMER" ? "Book an appointment" : "Go to my dashboard") : "Book an appointment"}
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#services">Browse services</Link>
              </Button>
            </div>
            <div className="flex items-center gap-4 pt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Secure accounts
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" aria-hidden /> 24h free cancellation
              </span>
            </div>
          </div>

          {/* Decorative appointment card */}
          <div className="hidden items-center justify-center lg:flex" aria-hidden>
            <div className="w-full max-w-sm rotate-1 rounded-2xl border bg-card p-5 shadow-xl transition-transform hover:rotate-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Next appointment</p>
                <Badge className="bg-teal-600 hover:bg-teal-600">Confirmed</Badge>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Avatar className="h-11 w-11">
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                    ST
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">Dr. Sara Tesfaye</p>
                  <p className="text-sm text-muted-foreground">General Medicine</p>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CalendarCheck2 className="h-4 w-4" aria-hidden /> Tomorrow, 09:30
                </span>
                <span className="font-medium">30 min</span>
              </div>
              <Separator className="my-4" />
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="h-4 w-4" aria-hidden /> General Consultation
                </span>
                <span className="font-semibold">ETB 500</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b bg-card">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-x px-4 sm:px-6 md:grid-cols-4">
          {[
            { value: String(doctors.length || "3"), label: "Expert doctors" },
            { value: String(services.length || "6"), label: "Clinic services" },
            { value: "24/7", label: "Online booking" },
            { value: "24 h", label: "Free cancellation" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 px-4 py-6">
              <span className="text-2xl font-bold text-primary">{stat.value}</span>
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Our services</h2>
            <p className="mt-1 text-muted-foreground">
              Transparent pricing and visit lengths — pick what fits your day.
            </p>
          </div>
        </div>

        <div className="mt-8">
          {servicesQuery.isLoading ? (
            <LoadingBlock label="Loading services…" />
          ) : servicesQuery.isError ? (
            <ErrorBlock
              message="Could not load services. Please try again."
              onRetry={() => servicesQuery.refetch()}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <Card
                  key={service.id}
                  className="transition-shadow hover:shadow-md"
                >
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold leading-snug">{service.name}</h3>
                      <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">
                        {formatPrice(service.price)}
                      </span>
                    </div>
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" aria-hidden />
                      {formatDuration(service.durationMinutes)}
                    </p>
                    <Button variant="outline" size="sm" className="mt-auto w-fit gap-2" asChild>
                      <Link href={me?.role === "CUSTOMER" ? "/book" : "/login"}>
                        Book this service
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {hasData && services.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No services are published yet — please check back soon.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Doctors */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Meet the doctors</h2>
          <p className="mt-1 text-muted-foreground">
            Experienced specialists across general medicine, dentistry and pediatrics.
          </p>

          <div className="mt-8">
            {staffQuery.isLoading ? (
              <LoadingBlock label="Loading doctors…" />
            ) : staffQuery.isError ? (
              <ErrorBlock
                message="Could not load the doctors directory."
                onRetry={() => staffQuery.refetch()}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {doctors.map((doctor) => (
                  <Card key={doctor.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                            {doctor.name
                              .replace("Dr. ", "")
                              .split(" ")
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold">{doctor.name}</h3>
                          <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {doctor.services.slice(0, 4).map((service) => (
                          <Badge key={service.id} variant="secondary" className="font-normal">
                            {service.name}
                          </Badge>
                        ))}
                        {doctor.services.length > 4 && (
                          <Badge variant="secondary" className="font-normal">
                            +{doctor.services.length - 4}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How it works + demo accounts */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-6 flex flex-col gap-5">
            {[
              {
                icon: Stethoscope,
                title: "Choose a service and doctor",
                text: "Browse the catalog and pick the care you need — or leave the doctor as “first available”.",
              },
              {
                icon: CalendarCheck2,
                title: "Pick an open time slot",
                text: "Live availability straight from each doctor’s calendar, in your clinic’s timezone.",
              },
              {
                icon: ShieldCheck,
                title: "Confirm and relax",
                text: "You get an email confirmation and a reminder 24 hours before the visit.",
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <Card className="h-fit bg-gradient-to-b from-primary/5 to-transparent">
          <CardContent className="flex flex-col gap-4 p-6">
            <div>
              <h2 className="text-lg font-semibold">Try the demo accounts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                One click on the login page signs you in as each role.
              </p>
            </div>
            <ul className="flex flex-col gap-2.5">
              {DEMO_ACCOUNTS.map((account) => (
                <li
                  key={account.email}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{account.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {account.hint}
                  </Badge>
                </li>
              ))}
            </ul>
            <Button asChild className="gap-2">
              <Link href="/login">
                Open the login page
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
