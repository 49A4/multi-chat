const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const CLIENT_ID_STORAGE_KEY = "multi-chat-client-id-v1";
const ACCESS_TOKEN_STORAGE_KEY = "multi-chat-access-token-v1";
const AUTH_PROFILE_STORAGE_KEY = "multi-chat-auth-profile-v1";
const AUTH_EXPIRED_EVENT_NAME = "multi-chat-auth-expired";
const CLIENT_ID_HEADER = "X-Client-Id";
const ACCESS_TOKEN_HEADER = "X-Access-Token";

function buildUrl(path) {
  return `${BASE_URL}${path}`;
}

function generateClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStorage(key) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function removeStorage(key) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function normalizeText(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}

function getClientId() {
  if (typeof window === "undefined") {
    return "web-server";
  }
  const existing = normalizeText(readStorage(CLIENT_ID_STORAGE_KEY));
  if (existing) {
    return existing;
  }
  const created = generateClientId();
  writeStorage(CLIENT_ID_STORAGE_KEY, created);
  return created;
}

export function getStoredAccessToken() {
  return normalizeText(readStorage(ACCESS_TOKEN_STORAGE_KEY));
}

export function setStoredAccessToken(accessToken) {
  const normalized = normalizeText(accessToken);
  if (!normalized) {
    removeStorage(ACCESS_TOKEN_STORAGE_KEY);
    return null;
  }
  writeStorage(ACCESS_TOKEN_STORAGE_KEY, normalized);
  return normalized;
}

export function getStoredAuthProfile() {
  const raw = readStorage(AUTH_PROFILE_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const userId = normalizeText(parsed.userId);
    if (!userId) {
      return null;
    }
    return {
      userId,
      displayName: normalizeText(parsed.displayName) || userId,
      expiresAt: Number.isFinite(Number(parsed.expiresAt)) ? Number(parsed.expiresAt) : null
    };
  } catch {
    return null;
  }
}

export function setStoredAuthProfile(profile) {
  if (!profile || typeof profile !== "object") {
    removeStorage(AUTH_PROFILE_STORAGE_KEY);
    return null;
  }
  const userId = normalizeText(profile.userId);
  if (!userId) {
    removeStorage(AUTH_PROFILE_STORAGE_KEY);
    return null;
  }
  const normalized = {
    userId,
    displayName: normalizeText(profile.displayName) || userId,
    expiresAt: Number.isFinite(Number(profile.expiresAt)) ? Number(profile.expiresAt) : null
  };
  writeStorage(AUTH_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearStoredAuthSession(options = {}) {
  removeStorage(ACCESS_TOKEN_STORAGE_KEY);
  removeStorage(AUTH_PROFILE_STORAGE_KEY);
  if (options.notify !== false && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT_NAME));
  }
}

export function getAuthExpiredEventName() {
  return AUTH_EXPIRED_EVENT_NAME;
}

function buildClientHeaders(extraHeaders = {}) {
  const accessToken = getStoredAccessToken();
  const authHeaders = accessToken
    ? {
      [ACCESS_TOKEN_HEADER]: accessToken,
      Authorization: `Bearer ${accessToken}`
    }
    : {};
  return {
    "Content-Type": "application/json",
    [CLIENT_ID_HEADER]: getClientId(),
    ...authHeaders,
    ...extraHeaders
  };
}

async function readErrorMessage(response, fallback) {
  try {
    const body = await response.clone().json();
    if (body && typeof body.message === "string" && body.message.trim()) {
      return body.message.trim();
    }
  } catch {
    // ignore json parse failures
  }
  try {
    const text = await response.text();
    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  } catch {
    // ignore text parse failures
  }
  return fallback;
}

function normalizeHttpErrorMessage(status, message, fallback) {
  const text = typeof message === "string" ? message.trim() : "";
  if (status === 413) {
    return "上传内容过大（413）。已自动压缩图片；如仍失败，请减少图片张数或分辨率。";
  }
  if (!text) {
    return fallback;
  }
  return text;
}

function handleUnauthorizedResponse() {
  clearStoredAuthSession({ notify: true });
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    headers: buildClientHeaders(options.headers || {}),
    ...options
  });

  if (!response.ok) {
    const rawMessage = await readErrorMessage(response, `${response.status} ${response.statusText}`);
    const message = normalizeHttpErrorMessage(response.status, rawMessage, `${response.status} ${response.statusText}`);
    if (response.status === 401) {
      handleUnauthorizedResponse();
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function get(path) {
  return request(path, { method: "GET" });
}

export function post(path, body) {
  return request(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export function put(path, body) {
  return request(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
}

export function patch(path, body) {
  return request(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
}

export function remove(path) {
  return request(path, { method: "DELETE" });
}

export async function streamPost(path, body, onEvent, signal) {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: buildClientHeaders({ Accept: "text/event-stream" }),
    body: JSON.stringify(body ?? {}),
    signal
  });

  if (!response.ok || !response.body) {
    const rawMessage = await readErrorMessage(response, `Stream request failed: ${response.status} ${response.statusText}`);
    const message = normalizeHttpErrorMessage(
      response.status,
      rawMessage,
      `Stream request failed: ${response.status} ${response.statusText}`
    );
    if (response.status === 401) {
      handleUnauthorizedResponse();
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      if (buffer.trim().length > 0) {
        consumeEvents(`${buffer}\n\n`, onEvent);
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = consumeEvents(buffer, onEvent);
  }
}

function consumeEvents(buffer, onEvent) {
  let boundary = buffer.indexOf("\n\n");

  while (boundary !== -1) {
    const block = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);

    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (dataLines.length > 0) {
      const raw = dataLines.join("\n");
      try {
        onEvent(JSON.parse(raw));
      } catch {
        // ignore invalid event blocks
      }
    }

    boundary = buffer.indexOf("\n\n");
  }

  return buffer;
}
