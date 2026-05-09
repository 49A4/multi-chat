import { get } from "./http";

export function fetchMyUsage() {
  return get("/api/usage/me");
}

export function fetchMyUsageEvents(limit = 50) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;
  return get(`/api/usage/me/events?limit=${safeLimit}`);
}

export function fetchUsageUsers(limit = 50) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;
  return get(`/api/usage/users?limit=${safeLimit}`);
}
