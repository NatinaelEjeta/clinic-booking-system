"use client";

/** Session hooks used by every page and the navbar. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_HOME, type Role } from "@/lib/constants";
import type { UserDTO } from "@/lib/types";
import { api } from "@/lib/api-client";

interface MeResponse {
  user: UserDTO;
}

/** Current signed-in user, or null when signed out. */
export function useMe() {
  const query = useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/auth/me"),
    retry: false,
    staleTime: 60_000,
  });

  return {
    me: query.data?.user ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<MeResponse>("/api/auth/login", { method: "POST", body: input }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries();
      router.push(ROLE_HOME[data.user.role as Role] ?? "/");
      router.refresh();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    onSuccess: async () => {
      queryClient.clear();
      router.push("/");
      router.refresh();
    },
  });
}

/** Role check helpers shared by pages and the navbar. */
export const roleMatches = (user: UserDTO | null, ...roles: Role[]) =>
  Boolean(user && roles.includes(user.role));

export const isAdmin = (user: UserDTO | null) => roleMatches(user, ROLES.ADMIN);
export const isStaff = (user: UserDTO | null) => roleMatches(user, ROLES.STAFF);
export const isCustomer = (user: UserDTO | null) => roleMatches(user, ROLES.CUSTOMER);
