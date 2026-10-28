"use client";

/** Change password page (all roles). Demo accounts are blocked server-side. */

import { useState } from "react";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RequireRole } from "@/components/require-role";
import { useMe } from "@/hooks/use-auth";
import { api, ApiClientError } from "@/lib/api-client";
import { DEMO_EMAIL_SUFFIX, ROLES } from "@/lib/constants";

function ChangePasswordForm() {
  const { me } = useMe();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isDemoAccount = Boolean(me?.email?.endsWith(DEMO_EMAIL_SUFFIX));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      toast.success("Password updated", {
        description: "Use your new password the next time you sign in.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not change the password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden /> Change password
        </CardTitle>
        <CardDescription>
          Signed in as {me?.email} (
          {me?.role === ROLES.ADMIN
            ? "administrator"
            : me?.role === ROLES.STAFF
              ? "doctor"
              : "patient"}
          )
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isDemoAccount && (
          <Alert>
            <Lock className="h-4 w-4" aria-hidden />
            <AlertTitle>Demo account</AlertTitle>
            <AlertDescription>
              Shared demo accounts cannot change their password so the demo
              credentials keep working for everyone. Register your own account
              to try this feature.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              disabled={isDemoAccount}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new">New password</Label>
            <Input
              id="new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
              disabled={isDemoAccount}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-new">Confirm new password</Label>
            <Input
              id="confirm-new"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
              minLength={8}
              disabled={isDemoAccount}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            At least 8 characters. Your session stays signed in after the change.
          </p>
          <Button type="submit" disabled={submitting || isDemoAccount} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AccountPage() {
  return (
    <RequireRole roles={["ADMIN", "STAFF", "CUSTOMER"]}>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Account settings</h1>
        <ChangePasswordForm />
      </div>
    </RequireRole>
  );
}
