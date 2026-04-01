import { get, patch, post, put, remove } from "./http";

export function fetchConfigs() {
  return get("/api/configs");
}

export function createConfig(payload) {
  return post("/api/configs", payload);
}

export function updateConfig(id, payload) {
  return put(`/api/configs/${id}`, payload);
}

export function deleteConfig(id) {
  return remove(`/api/configs/${id}`);
}

export function toggleConfig(id) {
  return patch(`/api/configs/${id}/toggle`, {});
}
