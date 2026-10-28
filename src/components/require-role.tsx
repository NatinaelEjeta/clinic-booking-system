"use client";

/**
 * Client-side role guard for pages. The server re-checks roles on every API
 * call anyway — this only avoids rendering protected UI to the wrong role
 * and handles redirects with a nice loading state.
 */

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ROLE_HOME, type Role } from "@/lib/constants";
import { useMe } from "@/hooks/use-auth";

export function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: ReactNode;
}) {
  const { me, isLoading, isError } = useMe();
  const router = useRouter();

  const allowed = Boolean(me && roles.includes(me.role));

  useEffect(() => {
    if (isLoading) return;
    if (isError || !me) {
      router.replace("/login");
    } else if (!roles.includes(me.role)) {
      router.replace(ROLE_HOME[me.role] ?? "/");
    }
  }, [isLoading, isError, me, roles, router]);

  if (isLoading || !allowed) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        role="status"
        aria-label="Loading"
      >
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
