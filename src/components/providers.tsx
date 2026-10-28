"use client";

/**
 * Global client providers: TanStack Query, theme (next-themes), the clinic
 * timezone context (injected from the server layout) and the toast layer.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_CLINIC_TIMEZONE } from "@/lib/constants";

const ClinicTimezoneContext = createContext<string>(DEFAULT_CLINIC_TIMEZONE);

/** The clinic's IANA timezone — use for ALL schedule display formatting. */
export function useClinicTimezone(): string {
  return useContext(ClinicTimezoneContext);
}

export function Providers({
  children,
  timezone,
}: {
  children: ReactNode;
  timezone: string;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <ClinicTimezoneContext.Provider value={timezone}>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </ClinicTimezoneContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
