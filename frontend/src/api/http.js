const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function buildUrl(path) {
  return `${BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.message) {
        message = body.message;
      }
    } catch {
      // ignore parse failures
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
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify(body ?? {}),
    signal
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream request failed: ${response.status} ${response.statusText}`);
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
