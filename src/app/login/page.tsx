"use client";

/** Login page with one-click demo account quick-fill buttons. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarCheck2, Loader2, ShieldCheck, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiClientError } from "@/lib/api-client";

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@clinic.demo", password: "Admin123!" },
  { label: "Doctor", email: "doctor@clinic.demo", password: "Doctor123!" },
  { label: "Patient", email: "patient@clinic.demo", password: "Patient123!" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Show a server-side session-expired hint when returning from a redirect.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("expired=1")) {
      setError("Your session has expired. Please sign in again.");
    }
  }, []);

  async function handleSubmit(input: { email: string; password: string }) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiClientError(
          response.status,
          data?.error?.message ?? "Sign in failed.",
          data?.error?.code,
        );
      }
      // Full reload so the navbar/session state re-initializes cleanly.
      const role: string = data?.user?.role ?? "CUSTOMER";
      const home =
        role === "ADMIN" ? "/admin" : role === "STAFF" ? "/schedule" : "/book";
      window.location.assign(home);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Sign in failed.";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Stethoscope className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to book and manage your appointments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your CarePoint Clinic account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit({ email, password });
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden />
              )}
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <p className="relative flex justify-center text-xs uppercase text-muted-foreground">
              <span className="bg-card px-2">Or use a demo account</span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                  toast.info(`Signing in as ${account.label}…`);
                  void handleSubmit({ email: account.email, password: account.password });
                }}
              >
                {account.label}
              </Button>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground">
            New patient?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden />
        Free cancellation up to 24 hours before your visit
      </p>
    </div>
  );
}
