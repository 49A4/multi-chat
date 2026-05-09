# Refactor Plan

This plan is optimized for Codex-driven development: faster orientation, smaller edit radius, safer deployment, and fewer accidental regressions.

## Current Snapshot

- `frontend/src/views/ChatView.vue`: about 3.4k lines. It still coordinates auth, sidebars, graph layout, snapshot restore, config editing, cost display, send/retry flows, and image/viewer UI.
- `frontend/src/views/ChatView.css`: about 1.3k lines. It mixes page shell, canvas graph, input desk, sidebars, markdown content, image preview, and dialogs.
- `backend/src/main/java/com/multichat/service/OpenAiCompatClient.java`: about 1.1k lines. It mixes OpenAI-compatible chat streaming, image generation, image edit multipart logic, DashScope/Qwen/Wan, Gemini/APIYi, response parsing, retry/error classification, and URL construction.
- `frontend/src/views/chat/useImageInputs.js`: about 900 lines. It is now isolated, but it can be split again into pure image utilities plus Vue state.
- Temporary files such as `tmp_*` exist in the repo root. They should be isolated from production code.

## Target Shape

- `ChatView.vue` should become a coordinator around 900-1400 lines, mostly template and wiring.
- CSS should be split by feature area so visual edits do not require searching one huge stylesheet.
- Backend provider logic should be split by protocol/provider, with `OpenAiCompatClient` becoming a small router/facade.
- Key flows should have stable docs and smoke checks: auth, send, image references, canvas history, deploy.

## Guiding Rules

- Prefer incremental extraction over rewrites.
- Move one responsibility per step.
- Keep public function names stable where possible, then clean internals after build passes.
- After every frontend step, run `npm run build`.
- After every backend step, run `mvn -q -DskipTests compile`.
- Deploy by default according to `AGENTS.md`.
- Do not mix behavioral fixes into pure extraction steps unless necessary.

## Phase 1: Finish Frontend State Extraction

### Step 1. Extract invite auth

Status: done in `frontend/src/views/chat/useInviteAuth.js`.

Move:

- `authReady`
- `authDialogVisible`
- `authInviteCode`
- `authSubmitting`
- `authUserProfile`
- `authUserDisplayName`
- `normalizeAuthProfile`
- `requireInviteLogin`
- `ensureAuthenticatedSession`
- `submitInviteLogin`
- `switchAccount`
- `onAuthExpired`
- `handleInviteAuthFailure`

Keep callbacks injected from `ChatView.vue`:

- `resetWorkspaceForAccountSwitch`
- `bootstrapWorkspaceAfterAuth`

Success criteria:

- Invite dialog still opens on missing/expired auth.
- Login still loads configs/history.
- `ChatView.vue` loses roughly 120-180 lines.

### Step 2. Extract API config sidebar

Status: done in `frontend/src/views/chat/useApiConfigs.js`.

Move:

- `apiConfigs`
- `sidebarApiView`
- `sidebarConfigEditorVisible`
- `sidebarConfigSaving`
- `sidebarConfigDeleting`
- `sidebarConfigTogglePending`
- `sidebarEditingConfigId`
- `sidebarConfigForm`
- config normalization
- load/create/update/delete/toggle config functions
- text/image API counts and filtered configs

Success criteria:

- Sidebar still filters text/image APIs.
- Create/edit/delete/toggle still works.
- `ChatView.vue` loses roughly 350-450 lines.

### Step 3. Extract canvas restore normalization

Create `frontend/src/views/chat/useCanvasRestore.js` or `snapshotRestore.js`.

Move pure/mostly-pure restore helpers:

- `deriveNextTopicSeq`
- `deriveNextSummarySeq`
- `normalizeSnapshotQuestionNode`
- `normalizeSnapshotModelState`
- deferred rendering helpers if they can be injected with render callbacks

Keep `restoreCanvasFromSnapshot` in `ChatView.vue` until the graph state has a composable.

Success criteria:

- Restoring history still paints structure first and Markdown later.
- `ChatView.vue` loses roughly 180-250 lines.

### Step 4. Extract cost/usage formatting

Create `frontend/src/views/chat/usageCost.js`.

Move:

- `formatTokenUsage`
- `extractConfigIdFromModelTag`
- `resolvePricePerMillion`
- `computeUsageCostUsd`
- `formatUsageCost`
- `buildQuestionChildrenMap`
- `buildDirectQuestionCostMap`
- `computeQuestionTotalCostUsd`
- `formatQuestionTotalCostCny`

Success criteria:

- Cost badges remain identical.
- Cost calculation can be unit-tested later.
- `ChatView.vue` loses roughly 180-220 lines.

### Step 5. Extract chat send/retry orchestration

Create `frontend/src/views/chat/useChatGeneration.js`.

Move:

- `appendPanelsForTopic`
- `ensureTopicVisible`
- `resolveFollowUpParentModel`
- `markRouteModelsAsFailed`
- `send`
- `regenerateQuestion`
- `regenerateModel`

This is high-risk because it touches streaming and graph layout. Do it after earlier extractions reduce noise.

Success criteria:

- Text send works.
- Image send works.
- Retry question/model works.
- Autosave still happens after send/retry.
- `ChatView.vue` approaches 1200-1600 lines.

## Phase 2: Split Styles

### Step 6. Split `ChatView.css`

Create a folder:

- `frontend/src/views/chat/styles/page.css`
- `frontend/src/views/chat/styles/inputDesk.css`
- `frontend/src/views/chat/styles/canvasGraph.css`
- `frontend/src/views/chat/styles/sidebars.css`
- `frontend/src/views/chat/styles/markdownContent.css`
- `frontend/src/views/chat/styles/imagePreview.css`

Use a single `ChatView.css` as an import aggregator if Vite handles it cleanly, or import the CSS files from `ChatView.vue`.

Success criteria:

- No visual regression in input desk, history sidebar, model sidebar, canvas, markdown, image viewer.
- CSS files are mostly below 400 lines each.

## Phase 3: Backend Provider Refactor

### Step 7. Split `OpenAiCompatClient`

Target package:

- `backend/src/main/java/com/multichat/provider/`

Suggested classes:

- `OpenAiChatClient`: streaming chat completions and SSE parsing.
- `OpenAiImageClient`: OpenAI-compatible image generation/edit requests.
- `ApiYiGeminiImageClient`: Gemini/APIYi image edit protocol.
- `DashScopeImageClient`: Qwen/Wan image protocols.
- `ProviderResponseParsers`: image/text/usage extraction from JSON.
- `ProviderErrorClassifier`: retryable/rate-limit/server error classification.
- `ProviderUrlBuilder`: endpoint construction.

Keep `OpenAiCompatClient` temporarily as a facade so `ChatService` does not need a large rewrite.

Success criteria:

- Backend compile passes after each extraction.
- Existing model configs still work.
- Provider-specific bugs can be traced to one class.

### Step 8. Add structured reference image metadata

Status: done for frontend request payloads, backend DTO normalization, GPT-Image-2/APIYi-Gemini prompt role rules, and Qwen multi-image forwarding.

Added optional fields to `ImageInput`:

- `order`
- `role`
- `name`

Propagate from frontend to backend:

- `useImageInputs.js`
- `frontend/src/api/chat.js`
- `ChatRequest`
- `ChatService`
- provider clients

Roles:

- first image: `target`
- second image: `face_reference`
- additional images: `reference`

Success criteria:

- Logs and backend request-building know which image is target/source.
- Prompt enhancement can be generated from structured metadata.

## Phase 4: Project Hygiene And Guardrails

### Step 9. Move scratch files

Create `scratch/` or delete old temporary files after confirming they are not needed.

Move:

- `tmp_apiyi_endpoints.txt`
- `tmp_apiyi_js/`
- `tmp_docs_changelog_en.html`
- `tmp_main_apiyi.js`

Success criteria:

- Production search results are not polluted by experiments.
- `rg` over source is cleaner.

### Step 10. Add smoke test docs/scripts

Create `docs/SMOKE_TESTS.md`.

Cover:

- Invite login.
- Text send.
- Image send without reference.
- Image edit with 2 references.
- Restore canvas history.
- Delete missing canvas history.
- Deploy check.

Optional scripts later:

- `scripts/smoke-frontend.ps1`
- `scripts/smoke-backend.ps1`

## Suggested Execution Order

1. Extract `useInviteAuth`.
2. Extract `useApiConfigs`.
3. Extract snapshot restore helpers.
4. Extract usage/cost helpers.
5. Split CSS.
6. Extract chat send/retry orchestration.
7. Split backend provider client.
8. Add reference image metadata.
9. Clean scratch files.
10. Add smoke test docs/scripts.

## Stop Conditions

Pause and verify manually if any step touches:

- auth/session bootstrap
- SSE stream routing
- canvas restore
- model retry
- image reference ordering
- backend provider request format

These areas have caused real bugs before, so each deserves a build plus manual smoke test after extraction.
