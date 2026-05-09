import { streamPost } from "./http";

export function sendPromptStream(sessionId, prompt, onEvent, signal, options = {}) {
  const body = { prompt };

  if (typeof sessionId === "string" && sessionId.trim()) {
    body.sessionId = sessionId.trim();
  }

  if (Array.isArray(options.targetModels) && options.targetModels.length > 0) {
    body.targetModels = options.targetModels;
  }

  if (typeof options.appendUserMessage === "boolean") {
    body.appendUserMessage = options.appendUserMessage;
  }

  if (typeof options.mode === "string" && options.mode.trim()) {
    body.mode = options.mode.trim();
  }

  const imageCount = Number(options.imageCount);
  if (Number.isFinite(imageCount)) {
    body.imageCount = Math.max(1, Math.floor(imageCount));
  }

  if (typeof options.imageAspectRatio === "string" && options.imageAspectRatio.trim()) {
    body.imageAspectRatio = options.imageAspectRatio.trim();
  }

  if (typeof options.imageQuality === "string" && options.imageQuality.trim()) {
    body.imageQuality = options.imageQuality.trim();
  }

  if (options.imageInput && typeof options.imageInput === "object") {
    const mimeType = String(options.imageInput.mimeType || "").trim();
    const data = String(options.imageInput.data || "").trim();
    if (mimeType && data) {
      body.imageInput = normalizeImageInputForRequest(options.imageInput, 0);
    }
  }

  if (Array.isArray(options.imageInputs) && options.imageInputs.length > 0) {
    const normalizedInputs = options.imageInputs
      .map((item, index) => {
        return normalizeImageInputForRequest(item, index);
      })
      .filter(Boolean);
    if (normalizedInputs.length > 0) {
      body.imageInputs = normalizedInputs;
    }
  }

  return streamPost(
    "/api/chat/stream",
    body,
    onEvent,
    signal
  );
}

function normalizeImageInputForRequest(item, fallbackIndex = -1) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const mimeType = String(item?.mimeType || "").trim();
  const data = String(item?.data || "").trim();
  if (!mimeType || !data) {
    return null;
  }
  const rawOrder = Number(item?.order);
  const order = Number.isFinite(rawOrder) && rawOrder > 0
    ? Math.floor(rawOrder)
    : (fallbackIndex >= 0 ? fallbackIndex + 1 : undefined);
  const role = String(item?.role || "").trim();
  const name = String(item?.name || "").trim();
  const normalized = { mimeType, data };
  if (Number.isFinite(order)) {
    normalized.order = order;
  }
  if (role) {
    normalized.role = role;
  }
  if (name) {
    normalized.name = name;
  }
  return normalized;
}
