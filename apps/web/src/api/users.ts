// Calls to the public /api/users endpoint and the hook the profile page
// uses.
import { useQuery } from "@tanstack/react-query";
import { userProfileSchema, type UserProfile } from "@goldrush/shared";
import { apiGet } from "./client.ts";

export function profileKey(username: string) {
  return ["profile", username] as const;
}

export function fetchProfile(username: string): Promise<UserProfile> {
  return apiGet(
    `/api/users/${encodeURIComponent(username)}`,
    userProfileSchema,
  );
}

export function useProfile(username: string) {
  return useQuery({
    queryKey: profileKey(username),
    queryFn: () => fetchProfile(username),
  });
}
