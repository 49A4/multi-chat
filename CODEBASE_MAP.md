# Codebase Map

This project is a Spring Boot backend plus a Vue canvas frontend. The frontend is currently the denser side of the codebase, and most product behavior is routed through `ChatView.vue`.

## Fast Entry Points

- Frontend page shell: `frontend/src/views/ChatView.vue`
- Frontend page styles: `frontend/src/views/ChatView.css`
- Frontend API wrappers: `frontend/src/api/`
- Frontend canvas helpers: `frontend/src/views/chat/`
- Backend HTTP controllers: `backend/src/main/java/com/multichat/controller/`
- Backend request DTOs: `backend/src/main/java/com/multichat/dto/`
- Backend provider client: `backend/src/main/java/com/multichat/service/OpenAiCompatClient.java`
- Backend orchestration service: `backend/src/main/java/com/multichat/service/ChatService.java`
- Backend file-backed stores: `backend/src/main/java/com/multichat/store/`

## When Debugging Common Issues

- Invite/login popups: start with `frontend/src/api/auth.js`, then `ChatView.vue` auth helpers, then `backend/.../auth/` and `AuthController`.
- Canvas history restore/delete: start with `frontend/src/api/canvasSnapshots.js`, then `ChatView.vue` snapshot helpers, then `CanvasSnapshotController` and `CanvasSnapshotStore`.
- Text or image generation request shape: start with `frontend/src/api/chat.js`, then `ChatView.vue` `send/regenerate*`, then `ChatService`.
- Provider-specific image behavior: start with `OpenAiCompatClient`. This is where multipart image edit requests and provider fallbacks are assembled.
- Markdown rendering stalls: start with `frontend/src/views/chat/markdownRenderer.js`, then deferred restore rendering in `ChatView.vue`.
- Dragging, panning, selection, and canvas coordinates: start with `frontend/src/views/chat/canvasInteractionManager.js` and `graphUtils.js`.

## Refactor Direction

The safest path is incremental extraction from `ChatView.vue`, not a rewrite. Preserve behavior first, then move one responsibility at a time.

Recommended extraction order:

1. Move image upload/reference-image state into a composable such as `useImageInputs`.
2. Move canvas snapshot state into `useCanvasSnapshots`.
3. Move auth dialog/session state into `useInviteAuth`.
4. Move API config sidebar state into `useApiConfigs`.
5. Keep `ChatView.vue` as the visual coordinator that wires composables together.

## Review Heuristics

- If a bug involves "it jumped somewhere", inspect selected module state, parent model resolution, `canvasOffset`, and `ensureTopicVisible`.
- If a bug involves "history disappeared", inspect owner/client-id resolution on both frontend headers and backend snapshot queries.
- If a bug involves "reference image order", inspect `imageInputs` from UI to `ChatRequest` to `OpenAiCompatClient`.
- If a bug involves "server returned HTML/502", inspect backend service health and Java heap before changing frontend code.

