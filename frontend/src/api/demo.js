import { streamPost } from "./http";

export function sendDemoPrompt(sessionId, prompt, onEvent, signal) {
  return streamPost(
    "/api/demo/stream",
    {
      sessionId,
      prompt
    },
    onEvent,
    signal
  );
}
