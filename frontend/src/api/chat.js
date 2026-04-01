import { streamPost } from "./http";

export function sendPromptStream(sessionId, prompt, onEvent, signal) {
  return streamPost(
    "/api/chat/stream",
    {
      sessionId,
      prompt
    },
    onEvent,
    signal
  );
}
