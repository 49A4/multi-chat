import { get, post, remove } from "./http";

export function fetchCanvasSnapshots() {
  return get("/api/canvas-snapshots");
}

export function fetchCanvasSnapshotDetail(id) {
  return get(`/api/canvas-snapshots/${encodeURIComponent(id)}`);
}

export function saveCanvasSnapshot(payload) {
  return post("/api/canvas-snapshots", payload || {});
}

export function deleteCanvasSnapshot(id) {
  return remove(`/api/canvas-snapshots/${encodeURIComponent(id)}`);
}
