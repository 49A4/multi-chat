# Chat View Helper Map

`ChatView.vue` is intentionally supported by the helper modules in this folder. When adding new canvas behavior, prefer extending one of these helpers instead of growing the page component.

## Modules

- `components/HistorySidebar.vue`: canvas history drawer and snapshot list UI.
- `components/ModelSidebar.vue`: API/model sidebar and API config editor dialog.
- `components/ChatInputPanel.vue`: bottom prompt composer, generation controls, and reference-image preview strip.
- `components/FlowBoard.vue`: canvas board UI, question/model cards, summary blocks, module action menu, and connection paths.
- `canvasInteractionManager.js`: pointer interactions, node dragging, canvas panning, pinch zoom, and summary rectangle creation.
- `contextSummaryManager.js`: summary block creation and prompt context extraction.
- `useCanvasPersistence.js`: canvas layout cache, no-op UI state hooks, snapshot title, and snapshot payload assembly.
- `graphUtils.js`: geometry helpers for model bounds, topic placement, and viewport focusing.
- `markdownRenderer.js`: markdown, math, code copy buttons, thinking blocks, and streaming placeholders.
- `useMarkdownActions.js`: click handlers for rendered markdown interactions such as code-block copy buttons.
- `modelTag.js`: model tag parsing/building and replica count normalization.
- `panelVisibilityManager.js`: hover/pin behavior for side panels.
- `streamOrchestrator.js`: streaming event batching, dirty model flushing, and rendered HTML updates.
- `useCanvasSnapshots.js`: canvas history list, save/delete/restore API calls, active snapshot state, and autosave scheduling.
- `useInviteAuth.js`: invite-code session bootstrap, auth dialog state, login/logout, and auth-failure handling.
- `useApiConfigs.js`: model API sidebar state, config CRUD/toggle, text/image filtering, and config normalization.
- `useImageInputs.js`: reference image upload, compression, dedupe, ordering, paste/drop handling, and adopting generated images as references.
- `useImageViewer.js`: generated/reference image hover previews, full-screen viewing, and Escape-key close behavior.
- `useModuleSelection.js`: selected question/model state, module action menu placement, and selected-module retry affordances.
- `useModuleDeletion.js`: model/question module deletion, controller aborts, layout cleanup, and summary selection pruning.
- `viewUtils.js`: small shared view utilities for styles, coordinates, prompts, and formatting.

## Local Rules

- Keep helpers DOM-light unless they are explicitly about interaction.
- Do not put API calls in these helpers; keep network calls in `frontend/src/api/` and orchestration in `ChatView.vue` or a future composable.
- For future extraction, move whole state clusters together. For example, do not move `selectedImageInputs` without also moving reorder, paste, upload, compression, and preview helpers.
