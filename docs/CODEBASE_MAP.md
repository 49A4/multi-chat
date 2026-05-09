# Codebase Map

This project is a Spring Boot backend plus a Vue canvas frontend. The frontend is currently the denser side of the codebase, and most product behavior is routed through `ChatView.vue`.

## Fast Entry Points

- Refactor roadmap: `docs/REFACTOR_PLAN.md`
- Frontend page shell: `frontend/src/views/ChatView.vue`
- Frontend page styles: `frontend/src/views/ChatView.css`
- Frontend API wrappers: `frontend/src/api/`
- Frontend canvas helpers: `frontend/src/views/chat/`
- Frontend page components: `frontend/src/views/chat/components/`
- Backend HTTP controllers: `backend/src/main/java/com/multichat/controller/`
- Backend request DTOs: `backend/src/main/java/com/multichat/dto/`
- Backend provider client: `backend/src/main/java/com/multichat/service/OpenAiCompatClient.java`
- Backend orchestration service: `backend/src/main/java/com/multichat/service/ChatService.java`
- Backend file-backed stores: `backend/src/main/java/com/multichat/store/`

## When Debugging Common Issues

- Invite/login popups: start with `frontend/src/views/chat/useInviteAuth.js`, then `frontend/src/api/auth.js`, then `backend/.../auth/` and `AuthController`.
- Canvas history list/save/delete/autosave: start with `frontend/src/views/chat/useCanvasSnapshots.js`, then `frontend/src/api/canvasSnapshots.js`, then `CanvasSnapshotController` and `CanvasSnapshotStore`.
- Canvas history drawer UI: start with `frontend/src/views/chat/components/HistorySidebar.vue`.
- Canvas board UI/question/model/summary blocks: start with `frontend/src/views/chat/components/FlowBoard.vue`, then `ChatView.vue` for orchestration.
- Canvas snapshot payload/title and layout cache: start with `frontend/src/views/chat/useCanvasPersistence.js`.
- Canvas history structure restore: start with `ChatView.vue` `restoreCanvasFromSnapshot`, because graph/model/summary restoration still lives in the page coordinator.
- Reference image upload/order/compression: start with `frontend/src/views/chat/useImageInputs.js`, then request shaping in `ChatView.vue` `send/regenerate*`.
- Bottom prompt composer/reference-image strip UI: start with `frontend/src/views/chat/components/ChatInputPanel.vue`.
- Image hover preview/full-screen viewer: start with `frontend/src/views/chat/useImageViewer.js`.
- Text or image generation request shape: start with `frontend/src/api/chat.js`, then `ChatView.vue` `send/regenerate*`, then `ChatService`.
- Provider-specific image behavior: start with `OpenAiCompatClient`. This is where multipart image edit requests and provider fallbacks are assembled.
- Markdown rendering stalls: start with `frontend/src/views/chat/markdownRenderer.js`, then deferred restore rendering in `ChatView.vue`.
- Rendered markdown clicks/copy buttons: start with `frontend/src/views/chat/useMarkdownActions.js`.
- Dragging, panning, selection, and canvas coordinates: start with `frontend/src/views/chat/canvasInteractionManager.js` and `graphUtils.js`.
- Selected module action menu/retry affordances: start with `frontend/src/views/chat/useModuleSelection.js`, then check `ChatView.vue` delete/regenerate handlers.
- Module deletion/cleanup: start with `frontend/src/views/chat/useModuleDeletion.js`.
- API/model sidebar UI: start with `frontend/src/views/chat/components/ModelSidebar.vue`, then `frontend/src/views/chat/useApiConfigs.js`.

## Refactor Direction

The safest path is incremental extraction from `ChatView.vue`, not a rewrite. Preserve behavior first, then move one responsibility at a time.

Recommended extraction order:

1. Done: image upload/reference-image state lives in `frontend/src/views/chat/useImageInputs.js`.
2. Partly done: snapshot API state and autosave scheduling live in `frontend/src/views/chat/useCanvasSnapshots.js`; graph/model/summary restoration still lives in `ChatView.vue`.
3. Done: auth dialog/session state lives in `frontend/src/views/chat/useInviteAuth.js`.
4. Done: API config sidebar state lives in `frontend/src/views/chat/useApiConfigs.js`.
5. Done: selected module/action-menu state lives in `frontend/src/views/chat/useModuleSelection.js`.
6. Done: canvas snapshot payload/title and layout cache live in `frontend/src/views/chat/useCanvasPersistence.js`.
7. Done: history sidebar, model sidebar, and bottom composer UI live in `frontend/src/views/chat/components/`.
8. Done: canvas board UI lives in `frontend/src/views/chat/components/FlowBoard.vue`.
9. Done: module deletion and cleanup lives in `frontend/src/views/chat/useModuleDeletion.js`.
10. Keep `ChatView.vue` as the visual coordinator that wires composables together.

## Review Heuristics

- If a bug involves "it jumped somewhere", inspect selected module state, parent model resolution, `canvasOffset`, and `ensureTopicVisible`.
- If a bug involves "history disappeared", inspect owner/client-id resolution on both frontend headers and backend snapshot queries.
- If a bug involves "reference image order", inspect `imageInputs` metadata (`order`, `role`, `name`) from `useImageInputs.js` to `frontend/src/api/chat.js` to `ChatRequest` to `OpenAiCompatClient`.
- If a bug involves "server returned HTML/502", inspect backend service health and Java heap before changing frontend code.
