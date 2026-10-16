// Calls to /api/auth and the hooks pages use to read or change who is signed
// in. The current user lives in the TanStack Query cache under
// currentUserKey, and every mutation here writes its result there, so the
// header and RequireUser update without refetching.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authResponseSchema,
  currentUserResponseSchema,
  type RegisterRequest,
  type SignInRequest,
  type User,
} from "@goldrush/shared";
import { apiGet, apiPost } from "./client.ts";

export const currentUserKey = ["currentUser"] as const;

export async function fetchCurrentUser(): Promise<User | null> {
  const { user } = await apiGet("/api/auth/me", currentUserResponseSchema);
  return user;
}

export async function register(request: RegisterRequest): Promise<User> {
  const { user } = await apiPost(
    "/api/auth/register",
    request,
    authResponseSchema,
  );
  return user;
}

export async function signIn(request: SignInRequest): Promise<User> {
  const { user } = await apiPost(
    "/api/auth/login",
    request,
    authResponseSchema,
  );
  return user;
}

export async function signOut(): Promise<void> {
  await apiPost("/api/auth/logout", {}, currentUserResponseSchema);
}

// `data` is the signed-in user, null for a visitor, or undefined while
// loading.
export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: fetchCurrentUser,
    staleTime: Infinity,
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => queryClient.setQueryData(currentUserKey, user),
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signIn,
    onSuccess: (user) => queryClient.setQueryData(currentUserKey, user),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      // Drop everything cached for the old user before marking them out.
      queryClient.clear();
      queryClient.setQueryData(currentUserKey, null);
    },
  });
}
