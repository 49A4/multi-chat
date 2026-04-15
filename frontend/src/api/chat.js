import { streamPost } from "./http";

export function sendPromptStream(sessionId, prompt, onEvent, signal, options = {}) {
  const body = {
    sessionId,
    prompt
  };

  if (Array.isArray(options.targetModels) && options.targetModels.length > 0) {
    body.targetModels = options.targetModels;
  }

  if (typeof options.appendUserMessage === "boolean") {
    body.appendUserMessage = options.appendUserMessage;
  }

  return streamPost(
    "/api/chat/stream",
    body,
    onEvent,
    signal
  );
}
