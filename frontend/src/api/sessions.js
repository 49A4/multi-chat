import { get, post, remove } from "./http";

export function fetchSessions() {
  return get("/api/sessions");
}

export function createSession(title) {
  return post("/api/sessions", title ? { title } : {});
}

export function fetchSessionDetail(id) {
  return get(`/api/sessions/${id}`);
}

export function deleteSession(id) {
  return remove(`/api/sessions/${id}`);
}

export function adoptMessage(id, content) {
  return post(`/api/sessions/${id}/adopt`, { content });
}
