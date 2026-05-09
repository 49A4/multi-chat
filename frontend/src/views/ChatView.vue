<template>
  <div class="demo-page">
    <HistorySidebar
      :visible="historySidebarVisible"
      :pinned="historySidebarPinned"
      :active-title="activeCanvasSnapshotTitle"
      :active-id="activeCanvasSnapshotId"
      :loading="snapshotLoading"
      :snapshots="canvasSnapshots"
      :panel-ref-target="historySidebarPanelRef"
      :peek-ref-target="historySidebarPeekRef"
      @peek-enter="openHistorySidebar"
      @peek-leave="onHistorySidebarLeave"
      @toggle="toggleHistorySidebar"
      @panel-enter="onHistorySidebarEnter"
      @panel-leave="onHistorySidebarLeave"
      @toggle-pinned="toggleHistorySidebarPinned"
      @create-fresh="createFreshCanvas"
      @load="loadCanvasSnapshots"
      @restore="restoreCanvasSnapshot"
      @remove="removeCanvasSnapshot"
    />

    <FlowBoard
      :sidebar-visible="sidebarVisible"
      :history-sidebar-visible="historySidebarVisible"
      :flow-canvas-ref="flowCanvasRef"
      :drag-ghost-ref="dragGhostRef"
      :module-action-menu-ref="moduleActionMenuRef"
      :drag-state="dragState"
      :pan-state="panState"
      :flow-canvas-style="flowCanvasStyle"
      :flow-layer-style="flowLayerStyle"
      :question-connections="questionConnections"
      :follow-up-connections="followUpConnections"
      :question-nodes="questionNodes"
      :model-list="modelList"
      :drag-ghost="dragGhost"
      :drag-ghost-style="dragGhostStyle"
      :show-module-action-menu="showModuleActionMenu"
      :module-action-menu-style="moduleActionMenuStyle"
      :can-retry-selected-module="canRetrySelectedModule"
      :selected-module-retrying="selectedModuleRetrying"
      :summary-blocks="summaryBlocks"
      :summary-create-state="summaryCreateState"
      :summary-draft-style="summaryDraftStyle"
      :state-map="stateMap"
      :question-node-style="questionNodeStyle"
      :node-style="nodeStyle"
      :summary-block-style="summaryBlockStyle"
      :is-question-selected="isQuestionSelected"
      :is-model-selected="isModelSelected"
      :format-question-total-cost-cny="formatQuestionTotalCostCny"
      :format-usage-cost="formatUsageCost"
      :format-token-usage="formatTokenUsage"
      @markdown-action="handleMarkdownAction"
      @canvas-pointer-down="onCanvasPointerDown"
      @canvas-wheel="onCanvasWheel"
      @question-pointer-down="onQuestionPointerDown"
      @select-question="selectQuestionModule"
      @model-card-pointer-down="onModelCardPointerDown"
      @model-click="onModelModuleClick"
      @node-pointer-down="onNodePointerDown"
      @model-content-pointer-down="onModelContentPointerDown"
      @image-hover="handleImageHover"
      @image-click="handleImageClick"
      @retry-selected="retrySelectedModule"
      @delete-selected="deleteSelectedModule"
      @run-summary="runSummaryBlock"
      @refresh-summary="refreshSummarySelection"
      @remove-summary="removeSummaryBlock"
    />

    <ModelSidebar
      v-model:editor-visible="sidebarConfigEditorVisible"
      :visible="sidebarVisible"
      :pinned="sidebarPinned"
      :auth-user-display-name="authUserDisplayName"
      :api-configs="apiConfigs"
      :filtered-api-configs="filteredApiConfigs"
      :sidebar-api-view="sidebarApiView"
      :sidebar-api-view-label="sidebarApiViewLabel"
      :text-api-count="textApiCount"
      :image-api-count="imageApiCount"
      :sidebar-config-toggle-pending="sidebarConfigTogglePending"
      :editing-config-id="sidebarEditingConfigId"
      :config-form="sidebarConfigForm"
      :saving="sidebarConfigSaving"
      :deleting="sidebarConfigDeleting"
      :api-type-text="API_TYPE_TEXT"
      :api-type-image="API_TYPE_IMAGE"
      :normalize-generate-count="normalizeGenerateCount"
      :resolve-config-id="resolveConfigId"
      :panel-ref-target="sidebarPanelRef"
      :peek-ref-target="sidebarPeekRef"
      @open="openSidebar"
      @toggle="toggleSidebar"
      @enter="onSidebarEnter"
      @leave="onSidebarLeave"
      @close="sidebarVisible = false"
      @toggle-pinned="toggleSidebarPinned"
      @switch-account="switchAccount"
      @load-configs="loadConfigs"
      @create-config="openSidebarCreateForm"
      @switch-api-view="switchSidebarApiView"
      @row-click="onSidebarApiRowClick"
      @toggle-config="onSidebarToggleConfig"
      @close-editor="closeSidebarConfigEditor"
      @delete-config="deleteSidebarConfig"
      @save-config="saveSidebarConfig"
    />

    <ChatInputPanel
      v-model:prompt="prompt"
      v-model:generation-mode="generationMode"
      v-model:image-batch-count="imageBatchCount"
      v-model:image-aspect-ratio="imageAspectRatio"
      v-model:image-quality="imageQuality"
      :sidebar-visible="sidebarVisible"
      :history-sidebar-visible="historySidebarVisible"
      :input-collapsed="inputCollapsed"
      :prompt-contexts="promptContexts"
      :image-drop-active="imageDropActive"
      :selected-image-inputs="selectedImageInputs"
      :selected-image-preview-list="selectedImagePreviewList"
      :image-preview-drag-from-index="imagePreviewDragFromIndex"
      :image-preview-drag-over-index="imagePreviewDragOverIndex"
      :auth-ready="authReady"
      :max-reference-images="MAX_REFERENCE_IMAGES"
      :text-mode="TEXT_MODE"
      :image-mode="IMAGE_MODE"
      :image-batch-min="IMAGE_BATCH_MIN"
      :image-batch-max="IMAGE_BATCH_MAX"
      :image-aspect-ratio-options="IMAGE_ASPECT_RATIO_OPTIONS"
      :image-quality-options="IMAGE_QUALITY_OPTIONS"
      :image-input-ref="imageInputRef"
      @toggle-input="toggleInputPanel"
      @remove-context="removePromptContext"
      @prompt-keydown="onPromptKeydown"
      @image-input-change="onImageInputChange"
      @clear-image-input="clearImageInput"
      @image-drag-enter="onImageDragEnter"
      @image-drag-over="onImageDragOver"
      @image-drag-leave="onImageDragLeave"
      @image-drop="onImageDrop"
      @paste="onInputCardPaste"
      @preview-grid-drag-over="onImagePreviewGridDragOver"
      @preview-grid-drop="onImagePreviewGridDrop"
      @preview-drag-start="onImagePreviewDragStart"
      @preview-drag-enter="onImagePreviewDragEnter"
      @preview-drag-over="onImagePreviewDragOver"
      @preview-drop="onImagePreviewDrop"
      @preview-drag-end="onImagePreviewDragEnd"
      @image-hover="handleImageHover"
      @image-click="handleImageClick"
      @remove-image-input="removeSelectedImageInput"
      @send="send"
    />

    <el-dialog
      v-model="authDialogVisible"
      title="邀请码验证"
      width="420px"
      append-to-body
      destroy-on-close
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :z-index="12050"
      class="auth-invite-dialog"
    >
      <div class="auth-invite-tip">请输入邀请码后才能使用系统。</div>
      <el-input
        v-model="authInviteCode"
        type="password"
        show-password
        placeholder="请输入邀请码"
        autocomplete="off"
        @keydown.enter.prevent="submitInviteLogin"
      />
      <template #footer>
        <el-button type="primary" :loading="authSubmitting" @click="submitInviteLogin">
          进入系统
        </el-button>
      </template>
    </el-dialog>

    <!-- 图片悬停预览浮层 -->
    <div
      v-if="imageHover.visible"
      class="image-hover-preview"
      :style="{ left: imageHover.x + 'px', top: imageHover.y + 'px' }"
    >
      <img :src="imageHover.src" alt="" />
    </div>

    <!-- 图片全屏查看 -->
    <div v-if="imageViewer.visible" class="image-viewer-overlay" @click="closeImageViewer">
      <img :src="imageViewer.src" class="image-viewer-img" alt="" @click.stop />
    </div>

  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { sendPromptStream } from "../api/chat";
import { getAuthExpiredEventName } from "../api/http";
import {
  buildRenderedContent,
  renderMarkdownPreservingMath,
  renderMarkdownWithCollapsibleThinking,
  renderStreamingMarkdown
} from "./chat/markdownRenderer";
import { buildModelTagFromConfig, normalizeGenerateCount, parseModelTag } from "./chat/modelTag";
import { createStreamOrchestrator } from "./chat/streamOrchestrator";
import { createContextSummaryManager } from "./chat/contextSummaryManager";
import { createPanelVisibilityManager } from "./chat/panelVisibilityManager";
import { createCanvasInteractionManager } from "./chat/canvasInteractionManager";
import { createChatNodeFactory } from "./chat/chatNodeFactory";
import HistorySidebar from "./chat/components/HistorySidebar.vue";
import ModelSidebar from "./chat/components/ModelSidebar.vue";
import ChatInputPanel from "./chat/components/ChatInputPanel.vue";
import FlowBoard from "./chat/components/FlowBoard.vue";
import {
  MAX_REFERENCE_IMAGES,
  cloneImageInputPayload,
  cloneImageInputPayloadList,
  useImageInputs
} from "./chat/useImageInputs";
import { formatSnapshotTime, useCanvasSnapshots } from "./chat/useCanvasSnapshots";
import {
  API_TYPE_IMAGE,
  API_TYPE_TEXT,
  normalizeOptionalNonNegativeNumber,
  resolveConfigId,
  requiresReferenceImage,
  supportsReferenceImageEditing,
  useApiConfigs
} from "./chat/useApiConfigs";
import { useInviteAuth } from "./chat/useInviteAuth";
import { useModuleSelection } from "./chat/useModuleSelection";
import { useImageViewer } from "./chat/useImageViewer";
import { useMarkdownActions } from "./chat/useMarkdownActions";
import { useCanvasPersistence } from "./chat/useCanvasPersistence";
import { useModuleDeletion } from "./chat/useModuleDeletion";
import {
  DEFAULT_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_BATCH_COUNT,
  DEFAULT_IMAGE_PROMPT,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_MARKDOWN_PROMPT,
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_BATCH_MAX,
  IMAGE_BATCH_MIN,
  IMAGE_MODE,
  IMAGE_QUALITY_OPTIONS,
  TEXT_MODE,
  normalizeGenerationMode,
  normalizeImageAspectRatio,
  normalizeImageBatchCount,
  normalizeImageQuality
} from "./chat/generationOptions";
import { createSnapshotRestoreHelpers } from "./chat/snapshotRestore";
import { createUsageCostHelpers, formatTokenUsage } from "./chat/usageCost";
import {
  collectModelsInRect as collectModelsInRectUtil,
  computeNextTopicStartX as computeNextTopicStartXUtil,
  ensureTopicVisible as ensureTopicVisibleUtil,
  getModelCardBounds as getModelCardBoundsUtil
} from "./chat/graphUtils";
import {
  buildContextChipTitle,
  buildPromptWithSelectedContexts as buildPromptWithSelectedContextsUtil,
  buildSelectedModelSections as buildSelectedModelSectionsUtil,
  clampScale,
  clientToLayerPoint as clientToLayerPointUtil,
  formatNowTimeText,
  getCanvasViewportPoint as getCanvasViewportPointUtil,
  getCurrentTouchPair as getCurrentTouchPairUtil,
  getDefaultPosition as getDefaultPositionUtil,
  getSafeScale,
  getTouchDistance,
  getTouchMidpoint,
  intersectsRect,
  nodeStyleByLayout,
  normalizeRect,
  normalizeWheelDelta,
  questionNodeStyle,
  summaryBlockStyle
} from "./chat/viewUtils";

// Maintainer note:
// This page is still the product coordinator for auth, canvas history, API configs,
// image references, streaming, and graph layout. Keep new low-level behavior in
// ./chat helpers where possible, and use docs/CODEBASE_MAP.md when orienting.

const prompt = ref(DEFAULT_MARKDOWN_PROMPT);
const generationMode = ref(TEXT_MODE);
const imageBatchCount = ref(DEFAULT_IMAGE_BATCH_COUNT);
const imageAspectRatio = ref(DEFAULT_IMAGE_ASPECT_RATIO);
const imageQuality = ref(DEFAULT_IMAGE_QUALITY);
const promptContexts = ref([]);
const sidebarVisible = ref(false);
const historySidebarVisible = ref(false);
const historySidebarPinned = ref(false);
const lastSentPrompt = ref("");
const inputCollapsed = ref(false);
const sidebarPinned = ref(false);

const stateMap = reactive({});
const retryingMap = reactive({});
const streamControllers = new Map();
const retryControllers = new Map();
const acceptIncomingEvents = ref(true);
const STREAM_FLUSH_MS = 180;
const flowCanvasRef = ref(null);
const dragGhostRef = ref(null);
const historySidebarPanelRef = ref(null);
const historySidebarPeekRef = ref(null);
const sidebarPanelRef = ref(null);
const sidebarPeekRef = ref(null);
const TOPIC_BASE_X = 120;
const QUESTION_BASE_Y = 24;
const RESULT_CARD_BASE_X = 20;
const RESULT_CARD_BASE_Y = 220;
const RESULT_CARD_WIDTH = 340;
const RESULT_CARD_GAP_X = 20;
const RESULT_CARD_STEP_X = RESULT_CARD_WIDTH + RESULT_CARD_GAP_X;
const TOPIC_GROUP_GAP = 180;
const FOLLOW_UP_QUESTION_GAP_Y = 28;
const QUESTION_TO_RESULT_GAP_Y = 92;
const MIN_SAFE_CANVAS_SCALE = 1e-12;
const MAX_CANVAS_SCALE = 2.4;
let flowTopZ = 1;
const promptContextSeq = ref(1);
const nodeLayoutMap = reactive({});
const questionNodes = ref([]);
const canvasScale = ref(1);
let topicSeq = 1;
let historySidebarCloseTimer = null;

// Interaction state: dragging/panning/touch state is owned by canvasInteractionManager.
const dragState = reactive({
  active: false,
  model: ""
});
const dragMeta = {
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  width: 340,
  height: 230
};
const dragGhost = reactive({
  active: false,
  title: "",
  x: 0,
  y: 0,
  width: 340,
  height: 230
});

const panState = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  allowPinch: true
});
const activeTouchPoints = new Map();
const pinchState = reactive({
  active: false,
  startDistance: 0,
  startScale: 1,
  anchorWorldX: 0,
  anchorWorldY: 0
});

const summaryBlocks = ref([]);
const summaryCreateState = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0
});
const summaryControllers = new Map();
let summaryBlockSeq = 1;
const questionDragState = reactive({
  active: false,
  questionId: "",
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0
});

const canvasOffset = reactive({
  x: 0,
  y: 0
});

const flowCanvasStyle = computed(() => {
  const safeScale = Math.max(MIN_SAFE_CANVAS_SCALE, canvasScale.value);
  const gridSize = Math.max(2, Math.round(24 * Math.max(safeScale, 0.06)));
  return {
    backgroundPosition: `${Math.round(canvasOffset.x)}px ${Math.round(canvasOffset.y)}px`,
    backgroundSize: `${gridSize}px ${gridSize}px`
  };
});

const flowLayerStyle = computed(() => ({
  transform: `translate3d(${Math.round(canvasOffset.x)}px, ${Math.round(canvasOffset.y)}px, 0) scale(${canvasScale.value})`,
  transformOrigin: "0 0"
}));

const summaryDraftStyle = computed(() => {
  const rect = normalizeRect(
    summaryCreateState.startX,
    summaryCreateState.startY,
    summaryCreateState.currentX,
    summaryCreateState.currentY
  );
  return {
    transform: `translate3d(${Math.round(rect.x)}px, ${Math.round(rect.y)}px, 0)`,
    width: `${Math.round(rect.width)}px`,
    height: `${Math.round(rect.height)}px`
  };
});

const dragGhostStyle = computed(() => ({
  transform: `translate3d(${Math.round(dragGhost.x)}px, ${Math.round(dragGhost.y)}px, 0)`,
  width: `${Math.round(dragGhost.width)}px`,
  minHeight: `${Math.max(72, Math.round(dragGhost.height))}px`
}));

const modelList = computed(() => Object.values(stateMap));

// Side panels and auth state are owned by useInviteAuth.

function buildConnectionPath(startX, startY, endX, endY) {
  const safeStartX = Math.round(startX);
  const safeStartY = Math.round(startY);
  const safeEndX = Math.round(endX);
  const safeEndY = Math.round(endY);
  const verticalGap = Math.max(24, Math.abs(safeEndY - safeStartY) * 0.5);
  const ctrlStartY = Math.round(safeStartY + verticalGap);
  const ctrlEndY = Math.round(safeEndY - verticalGap);
  return `M ${safeStartX} ${safeStartY} C ${safeStartX} ${ctrlStartY}, ${safeEndX} ${ctrlEndY}, ${safeEndX} ${safeEndY}`;
}

const questionConnections = computed(() => {
  if (!questionNodes.value.length) {
    return [];
  }
  return questionNodes.value.flatMap((question) => {
    const startX = question.x + question.width / 2;
    const startY = question.y + question.height;
    return modelList.value
      .filter((item) => item.questionId === question.id)
      .map((item) => {
        const layout = nodeLayoutMap[item.model];
        if (!layout) {
          return null;
        }
        const escapedModel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(item.model) : item.model.replace(/"/g, '\\"');
        const cardEl = flowCanvasRef.value?.querySelector?.(`.flow-node[data-model="${escapedModel}"]`);
        const cardWidth = cardEl?.offsetWidth || 340;
        const endX = layout.x + cardWidth / 2;
        const endY = layout.y;
        const path = buildConnectionPath(startX, startY, endX, endY);
        return { key: `${question.id}-${item.model}`, path };
      })
      .filter(Boolean);
  });
});

const followUpConnections = computed(() => {
  if (!questionNodes.value.length) {
    return [];
  }

  return questionNodes.value
    .map((question) => {
      const parentModelKey = String(question.parentModelKey || "").trim();
      if (!parentModelKey) {
        return null;
      }
      const parentBounds = getModelCardBounds(parentModelKey);
      if (!parentBounds) {
        return null;
      }
      const startX = parentBounds.x + parentBounds.width / 2;
      const startY = parentBounds.y + parentBounds.height;
      const endX = question.x + question.width / 2;
      const endY = question.y;
      return {
        key: `${question.id}-${parentModelKey}`,
        path: buildConnectionPath(startX, startY, endX, endY)
      };
    })
    .filter(Boolean);
});

// Snapshot network operations and autosave scheduling are owned by useCanvasSnapshots.

function getDefaultPosition(index) {
  return getDefaultPositionUtil(index, {
    baseX: RESULT_CARD_BASE_X,
    stepX: RESULT_CARD_STEP_X,
    baseY: RESULT_CARD_BASE_Y
  });
}

// API config sidebar state is owned by useApiConfigs.

// Reference image state is owned by useImageInputs. Keep request-shaping helpers imported above.
function findQuestionNodeById(questionId) {
  return questionNodes.value.find((item) => item.id === questionId);
}

// Graph node creation, layout, and cost display.
function computeNextTopicStartX() {
  return computeNextTopicStartXUtil(
    questionNodes.value,
    modelList.value,
    nodeLayoutMap,
    RESULT_CARD_WIDTH,
    RESULT_CARD_BASE_X,
    TOPIC_GROUP_GAP
  );
}

function pickInitialPosition(model, index) {
  const saved = flowLayoutCache.value[model];
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return { x: saved.x, y: saved.y };
  }
  return getDefaultPosition(index);
}

function ensureNodeLayout(model, index = 0) {
  if (nodeLayoutMap[model]) {
    return nodeLayoutMap[model];
  }

  const pos = pickInitialPosition(model, index);
  nodeLayoutMap[model] = {
    x: pos.x,
    y: pos.y,
    z: ++flowTopZ
  };
  return nodeLayoutMap[model];
}

const {
  createModelState,
  createQuestionNode
} = createChatNodeFactory({
  allocateTopicId: () => `topic-${topicSeq++}`,
  ensureNodeLayout,
  formatNowTimeText,
  normalizeGenerationMode,
  normalizeImageAspectRatio,
  normalizeImageBatchCount,
  normalizeImageQuality,
  normalizeOptionalNonNegativeNumber,
  parseModelTag,
  renderStreamingMarkdown,
  topicBaseX: TOPIC_BASE_X,
  questionBaseY: QUESTION_BASE_Y
});

function nodeStyle(item) {
  return nodeStyleByLayout(nodeLayoutMap[item.model]);
}

function clampCanvasScale(value) {
  return clampScale(value, {
    fallback: canvasScale.value,
    min: MIN_SAFE_CANVAS_SCALE,
    max: MAX_CANVAS_SCALE
  });
}

function getSafeCanvasScale() {
  return getSafeScale(canvasScale.value, MIN_SAFE_CANVAS_SCALE);
}

function getCanvasViewportPoint(clientX, clientY) {
  return getCanvasViewportPointUtil(flowCanvasRef.value, clientX, clientY);
}

function getCurrentTouchPair() {
  return getCurrentTouchPairUtil(activeTouchPoints);
}

function clientToLayerPoint(clientX, clientY) {
  return clientToLayerPointUtil(
    flowCanvasRef.value,
    clientX,
    clientY,
    canvasOffset,
    canvasScale.value,
    MIN_SAFE_CANVAS_SCALE
  );
}

function getModelCardBounds(model) {
  return getModelCardBoundsUtil(model, nodeLayoutMap, flowCanvasRef.value, {
    defaultWidth: 340,
    defaultHeight: 260
  });
}

function collectModelsInRect(rect) {
  return collectModelsInRectUtil(rect, modelList.value, getModelCardBounds, intersectsRect);
}

function buildSelectedModelSections(modelKeys) {
  return buildSelectedModelSectionsUtil(modelKeys, stateMap);
}

function buildPromptWithSelectedContexts(basePrompt, contextItems = promptContexts.value) {
  return buildPromptWithSelectedContextsUtil(basePrompt, contextItems);
}

function buildPromptWithAllConversationContexts(basePrompt) {
  const currentPrompt = String(basePrompt || "").trim();
  const blocks = [];

  questionNodes.value.forEach((question, index) => {
    const questionText = String(question?.text || "").trim();
    const answers = modelList.value
      .filter((item) => item.questionId === question.id)
      .map((item) => {
        const content = String(item?.content || "").trim();
        if (!content) {
          return "";
        }
        const title = String(item?.title || item?.model || "回答").trim() || "回答";
        return `#### ${title}\n${content}`;
      })
      .filter(Boolean);

    if (!questionText && answers.length === 0) {
      return;
    }

    let block = `### 历史问题 ${index + 1}\n${questionText || "(空)"}`;
    if (answers.length > 0) {
      block += `\n\n${answers.join("\n\n")}`;
    }
    blocks.push(block);
  });

  if (blocks.length === 0) {
    return currentPrompt;
  }

  const history = `以下是本会话里已有的全部问题与回答，请基于这些上下文继续回答：\n\n${blocks.join("\n\n---\n\n")}`;
  if (!currentPrompt) {
    return history;
  }
  return `${history}\n\n---\n\n### 当前问题\n${currentPrompt}`;
}

const {
  openInputPanel,
  toggleInputPanel,
  openSidebar,
  toggleSidebar,
  onSidebarEnter,
  onSidebarLeave,
  onWindowMouseMoveForSidebar,
  toggleSidebarPinned,
  dispose: disposePanelVisibilityManager
} = createPanelVisibilityManager({
  sidebarVisible,
  sidebarPinned,
  inputCollapsed,
  sidebarPanelRef,
  sidebarPeekRef,
  dragState,
  panState,
  questionDragState,
  summaryCreateState,
  saveChatUiState
});

const {
  apiConfigs,
  sidebarApiView,
  sidebarConfigEditorVisible,
  sidebarConfigSaving,
  sidebarConfigDeleting,
  sidebarConfigTogglePending,
  sidebarEditingConfigId,
  sidebarConfigForm,
  textApiCount,
  imageApiCount,
  filteredApiConfigs,
  sidebarApiViewLabel,
  switchSidebarApiView,
  syncSidebarApiViewWithGenerationMode,
  loadConfigs,
  onSidebarApiRowClick,
  openSidebarCreateForm,
  closeSidebarConfigEditor,
  saveSidebarConfig,
  deleteSidebarConfig,
  onSidebarToggleConfig
} = useApiConfigs({
  normalizeGenerateCount
});

const {
  formatQuestionTotalCostCny,
  formatUsageCost
} = createUsageCostHelpers({
  apiConfigs,
  modelList,
  normalizeOptionalNonNegativeNumber,
  questionNodes,
  resolveConfigId,
  stateMap
});

const {
  authReady,
  authDialogVisible,
  authInviteCode,
  authSubmitting,
  authUserProfile,
  authUserDisplayName,
  requireInviteLogin,
  handleInviteAuthFailure,
  ensureAuthenticatedSession,
  submitInviteLogin,
  switchAccount,
  onAuthExpired
} = useInviteAuth({
  resetWorkspaceForAccountSwitch,
  bootstrapWorkspaceAfterAuth: async () => {
    await Promise.all([loadConfigs(), loadCanvasSnapshots()]);
  }
});

const {
  imageInputRef,
  selectedImageInputs,
  selectedImageInput,
  selectedImageSourceModel,
  imagePreviewDragFromIndex,
  imagePreviewDragOverIndex,
  imageDropActive,
  selectedImagePreviewList,
  addSelectedImageInputPayloadList,
  clearImagePreviewDragState,
  onImagePreviewDragStart,
  onImagePreviewDragEnter,
  onImagePreviewDragOver,
  onImagePreviewDrop,
  onImagePreviewGridDragOver,
  onImagePreviewGridDrop,
  onImagePreviewDragEnd,
  removeSelectedImageInput,
  applyModelImageAsImageInput,
  resetImageDragState,
  onImageInputChange,
  onImageDragEnter,
  onImageDragOver,
  onImageDragLeave,
  onImageDrop,
  onInputCardPaste,
  clearImageInput
} = useImageInputs({
  generationMode,
  imageMode: IMAGE_MODE,
  normalizeGenerationMode,
  saveChatUiState: () => saveChatUiState(),
  openInputPanel,
  stateMap
});

const {
  flowLayoutCache,
  loadFlowLayout,
  saveChatUiState,
  restoreChatUiState,
  clearChatUiStateStorage,
  clearFlowLayoutStorage,
  saveFlowLayout,
  cloneJson,
  buildSnapshotTitleFromCanvas,
  buildCanvasSnapshotPayload
} = useCanvasPersistence({
  prompt,
  lastSentPrompt,
  generationMode,
  imageBatchCount,
  imageAspectRatio,
  imageQuality,
  selectedImageInputs,
  selectedImageInput,
  selectedImageSourceModel,
  promptContexts,
  questionNodes,
  modelList,
  nodeLayoutMap,
  summaryBlocks,
  canvasOffset,
  canvasScale,
  normalizeGenerationMode,
  normalizeImageBatchCount,
  normalizeImageAspectRatio,
  normalizeImageQuality,
  cloneImageInputPayloadList,
  getTopicSeq: () => topicSeq,
  getSummaryBlockSeq: () => summaryBlockSeq,
  getFlowTopZ: () => flowTopZ,
  scheduleSnapshotAutoSave: () => scheduleSnapshotAutoSave()
});

const {
  imageHover,
  imageViewer,
  hideImageHoverPreview,
  handleImageHover,
  handleImageClick,
  closeImageViewer,
  onImageViewerKeydown
} = useImageViewer();

const {
  handleMarkdownAction
} = useMarkdownActions({
  ElMessage
});

const {
  selectedModule,
  moduleActionMenuRef,
  isQuestionSelected,
  isModelSelected,
  selectQuestionModule,
  selectModelModule,
  onModelModuleClick,
  clearSelectedModule,
  canRetrySelectedModule,
  selectedModuleRetrying,
  showModuleActionMenu,
  moduleActionMenuStyle,
  retrySelectedModule,
  updateModuleActionMenuDuringDrag
} = useModuleSelection({
  stateMap,
  retryingMap,
  streamControllers,
  modelList,
  prompt,
  lastSentPrompt,
  findQuestionNodeById,
  getModelCardBounds,
  regenerateModel,
  regenerateQuestion,
  applyModelImageAsImageInput
});

const {
  cancelDeferredRestoreRendering,
  restoreCanvasFromSnapshot
} = createSnapshotRestoreHelpers({
  acceptIncomingEvents,
  abortAllStreams,
  buildRenderedContent,
  canvasOffset,
  canvasScale,
  clampCanvasScale,
  clearModelStates,
  clearSelectedModule,
  createModelState,
  defaultImageAspectRatio: DEFAULT_IMAGE_ASPECT_RATIO,
  defaultImageQuality: DEFAULT_IMAGE_QUALITY,
  defaultMarkdownPrompt: DEFAULT_MARKDOWN_PROMPT,
  ensureNodeLayout,
  formatNowTimeText,
  generationMode,
  getNextFlowTopZ: () => ++flowTopZ,
  imageAspectRatio,
  imageBatchCount,
  imageQuality,
  lastSentPrompt,
  modelList,
  nextTick,
  nodeLayoutMap,
  normalizeGenerationMode,
  normalizeImageAspectRatio,
  normalizeImageBatchCount,
  normalizeImageQuality,
  normalizeOptionalNonNegativeNumber,
  prompt,
  promptContexts,
  questionBaseY: QUESTION_BASE_Y,
  questionNodes,
  renderStreamingMarkdown,
  saveFlowLayout,
  selectedImageInput,
  selectedImageInputs,
  selectedImageSourceModel,
  setFlowTopZ: (value) => {
    flowTopZ = value;
  },
  setSummaryBlockSeq: (value) => {
    summaryBlockSeq = value;
  },
  setTopicSeq: (value) => {
    topicSeq = value;
  },
  stateMap,
  summaryBlocks,
  topicBaseX: TOPIC_BASE_X
});

const {
  canvasSnapshots,
  snapshotLoading,
  snapshotSaving,
  snapshotRestoring,
  activeCanvasSnapshotId,
  activeCanvasSnapshotTitle,
  loadCanvasSnapshots,
  persistCanvasSnapshot,
  cancelSnapshotAutoSave,
  scheduleSnapshotAutoSave,
  restoreCanvasSnapshot,
  removeCanvasSnapshot,
  createFreshCanvas
} = useCanvasSnapshots({
  buildSnapshotPayload: buildCanvasSnapshotPayload,
  buildSnapshotTitle: buildSnapshotTitleFromCanvas,
  restoreSnapshotPayload: restoreCanvasFromSnapshot,
  hasSnapshotContent: () => questionNodes.value.length > 0 || modelList.value.length > 0,
  clearCanvas: clear,
  formatTime: formatSnapshotTime
});

const {
  removePromptContext,
  refreshSummarySelection,
  removeSummaryBlock,
  startSummaryDraft,
  stopSummaryDraft,
  runSummaryBlock
} = createContextSummaryManager({
  ElMessage,
  stateMap,
  apiConfigs,
  promptContexts,
  promptContextSeq,
  summaryBlocks,
  summaryControllers,
  summaryCreateState,
  openInputPanel,
  collectModelsInRect,
  clientToLayerPoint,
  normalizeRect,
  buildContextChipTitle,
  buildSelectedModelSections,
  buildModelTagFromConfig,
  parseModelTag,
  sendPromptStream,
  renderMarkdownPreservingMath,
  renderStreamingMarkdown,
  renderMarkdownWithCollapsibleThinking
});

function bringToFront(layout) {
  if (!layout) {
    return;
  }
  layout.z = ++flowTopZ;
}

const {
  onQuestionPointerDown,
  onNodePointerDown,
  onModelCardPointerDown,
  onModelContentPointerDown,
  onCanvasPointerDown,
  onCanvasWheel,
  onWindowPointerMove,
  onWindowPointerUp,
  stopDragging,
  stopCanvasPanning,
  stopQuestionDragging,
  stopPinch,
  dispose: disposeCanvasInteractionManager
} = createCanvasInteractionManager({
  nextTick,
  stateMap,
  nodeLayoutMap,
  modelList,
  canvasOffset,
  canvasScale,
  flowCanvasRef,
  dragGhostRef,
  dragState,
  dragMeta,
  dragGhost,
  panState,
  activeTouchPoints,
  pinchState,
  questionDragState,
  summaryCreateState,
  getSafeCanvasScale,
  getCanvasViewportPoint,
  getCurrentTouchPair,
  getTouchDistance,
  getTouchMidpoint,
  clampCanvasScale,
  clientToLayerPoint,
  findQuestionNodeById,
  isQuestionSelected,
  selectQuestionModule,
  selectModelModule,
  clearSelectedModule,
  startSummaryDraft,
  stopSummaryDraft,
  bringToFront,
  saveFlowLayout,
  updateModuleActionMenuDuringDrag,
  normalizeWheelDelta
});

const {
  removeModelModules,
  deleteQuestionModule,
  deleteModelModule,
  deleteSelectedModule
} = useModuleDeletion({
  stateMap,
  retryingMap,
  nodeLayoutMap,
  retryControllers,
  streamControllers,
  summaryControllers,
  promptContexts,
  selectedImageSourceModel,
  summaryBlocks,
  questionNodes,
  questionDragState,
  modelList,
  selectedModule,
  stopQuestionDragging,
  saveFlowLayout,
  scheduleSnapshotAutoSave,
  clearSelectedModule
});

function resetLayout() {
  canvasOffset.x = 0;
  canvasOffset.y = 0;
  canvasScale.value = 1;
  modelList.value.forEach((item, index) => {
    const pos = getDefaultPosition(index);
    const layout = ensureNodeLayout(item.model, index);
    layout.x = pos.x;
    layout.y = pos.y;
    bringToFront(layout);
  });
  saveFlowLayout();
}

const {
  applyStreamEventToModel,
  onStreamEvent,
  flushDirtyModelsNow,
  clearDirtyQueue,
  dispose: disposeStreamOrchestrator
} = createStreamOrchestrator({
  stateMap,
  retryingMap,
  saveChatUiState,
  buildRenderedContent,
  flowCanvasRef,
  nextTick,
  parseModelTag,
  acceptIncomingEvents,
  flushIntervalMs: STREAM_FLUSH_MS
});

onMounted(async () => {
  flowLayoutCache.value = {};
  clearFlowLayoutStorage();
  clearChatUiStateStorage();
  prompt.value = DEFAULT_MARKDOWN_PROMPT;
  lastSentPrompt.value = "";
  questionNodes.value = [];
  canvasOffset.x = 0;
  canvasOffset.y = 0;
  canvasScale.value = 1;
  activeTouchPoints.clear();
  stopPinch();
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);
  window.addEventListener("mousemove", onWindowMouseMoveForSidebar);
  window.addEventListener("mousemove", onWindowMouseMoveForHistorySidebar);
  window.addEventListener("keydown", onImageViewerKeydown);
  window.addEventListener(getAuthExpiredEventName(), onAuthExpired);
  const authenticated = await ensureAuthenticatedSession();
  if (!authenticated) {
    return;
  }
  await bootstrapWorkspaceAfterAuth();
});

onBeforeUnmount(() => {
  cancelDeferredRestoreRendering();
  cancelSnapshotAutoSave();
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerUp);
  window.removeEventListener("mousemove", onWindowMouseMoveForSidebar);
  window.removeEventListener("mousemove", onWindowMouseMoveForHistorySidebar);
  window.removeEventListener("keydown", onImageViewerKeydown);
  window.removeEventListener(getAuthExpiredEventName(), onAuthExpired);
  clearHistorySidebarCloseTimer();
  disposePanelVisibilityManager();
  stopCanvasPanning();
  activeTouchPoints.clear();
  stopPinch();
  stopQuestionDragging();
  stopDragging();
  disposeCanvasInteractionManager();
  abortAllStreams();
  summaryControllers.forEach((ctrl) => ctrl.abort());
  summaryControllers.clear();
  flushDirtyModelsNow();
  disposeStreamOrchestrator();
});

// API config network operations are owned by useApiConfigs.

// Send/regenerate orchestration.
function clearModelStates() {
  cancelDeferredRestoreRendering();
  stopDragging();
  stopCanvasPanning();
  stopQuestionDragging();
  stopSummaryDraft();
  activeTouchPoints.clear();
  stopPinch();
  clearSelectedModule();
  flushDirtyModelsNow();
  clearDirtyQueue();
  questionNodes.value = [];
  topicSeq = 1;
  promptContexts.value = [];
  promptContextSeq.value = 1;
  selectedImageSourceModel.value = "";
  Object.keys(retryingMap).forEach((key) => delete retryingMap[key]);
  Object.keys(stateMap).forEach((key) => delete stateMap[key]);
  Object.keys(nodeLayoutMap).forEach((key) => delete nodeLayoutMap[key]);
  summaryControllers.forEach((ctrl) => ctrl.abort());
  summaryControllers.clear();
  summaryBlocks.value = [];
  saveChatUiState();
}

function resetWorkspaceForAccountSwitch() {
  acceptIncomingEvents.value = false;
  abortAllStreams();
  cancelSnapshotAutoSave();
  clearModelStates();
  clearImageInput();
  prompt.value = DEFAULT_MARKDOWN_PROMPT;
  generationMode.value = TEXT_MODE;
  imageBatchCount.value = DEFAULT_IMAGE_BATCH_COUNT;
  imageAspectRatio.value = DEFAULT_IMAGE_ASPECT_RATIO;
  imageQuality.value = DEFAULT_IMAGE_QUALITY;
  lastSentPrompt.value = "";
  canvasOffset.x = 0;
  canvasOffset.y = 0;
  canvasScale.value = 1;
  flowLayoutCache.value = {};
  clearFlowLayoutStorage();
  clearChatUiStateStorage();
}

function abortAllStreams() {
  streamControllers.forEach((ctrl) => ctrl.abort());
  streamControllers.clear();

  retryControllers.forEach((ctrl) => ctrl.abort());
  retryControllers.clear();
}

function appendPanelsForTopic(topicPrompt, fullPrompt, enabledConfigs, options = {}) {
  const mode = normalizeGenerationMode(options.mode);
  const imageCount = normalizeImageBatchCount(options.imageCount);
  const imageAspectRatio = normalizeImageAspectRatio(options.imageAspectRatio);
  const imageQuality = normalizeImageQuality(options.imageQuality);
  const imageInputs = cloneImageInputPayloadList(options.imageInputs);
  const imageInput = cloneImageInputPayload(options.imageInput) || cloneImageInputPayload(imageInputs[0]);
  const parentModelKey = String(options.parentModelKey || "").trim();
  const parentBounds = parentModelKey ? getModelCardBounds(parentModelKey) : null;
  const parentCenterX = parentBounds ? parentBounds.x + parentBounds.width / 2 : NaN;
  const totalPanelCount = enabledConfigs.reduce(
    (sum, cfg) => sum + normalizeGenerateCount(cfg?.generateCount),
    0
  );
  const questionY = parentBounds
    ? Math.round(parentBounds.y + parentBounds.height + FOLLOW_UP_QUESTION_GAP_Y)
    : QUESTION_BASE_Y;
  let topicStartX = computeNextTopicStartX();
  if (parentBounds && Number.isFinite(parentCenterX)) {
    const totalCardsWidth = totalPanelCount > 0
      ? totalPanelCount * RESULT_CARD_WIDTH + Math.max(0, totalPanelCount - 1) * RESULT_CARD_GAP_X
      : RESULT_CARD_WIDTH;
    topicStartX = Math.round(parentCenterX - totalCardsWidth / 2);
  }
  const question = createQuestionNode(topicPrompt, fullPrompt, topicStartX, {
    generationMode: mode,
    imageCount,
    imageAspectRatio,
    imageQuality,
    imageInputs,
    imageInput,
    parentModelKey,
    questionY
  });
  if (parentBounds && Number.isFinite(parentCenterX)) {
    question.x = Math.round(parentCenterX - question.width / 2);
  }
  const topicBaseY = parentBounds
    ? Math.round(question.y + question.height + QUESTION_TO_RESULT_GAP_Y)
    : RESULT_CARD_BASE_Y;
  questionNodes.value.push(question);

  const routeMap = {};
  let maxCardRight = Number.NEGATIVE_INFINITY;
  let minCardLeft = Number.POSITIVE_INFINITY;
  let panelIndex = 0;
  enabledConfigs.forEach((cfg) => {
    const repeatCount = normalizeGenerateCount(cfg?.generateCount);
    for (let replicaIndex = 1; replicaIndex <= repeatCount; replicaIndex += 1) {
      const sourceModel = buildModelTagFromConfig(cfg, replicaIndex);
      const sourceKey = parseModelTag(sourceModel).key;
      const modelKey = `${question.id}::${sourceKey}`;
        const state = createModelState(modelKey, panelIndex, {
          sourceModel,
          questionId: question.id,
          promptText: fullPrompt,
          generationMode: mode,
          imageCount,
          imageAspectRatio,
          imageQuality,
          imageInputs,
          imageInput,
          inputPricePerMillion: cfg?.inputPricePerMillion,
          outputPricePerMillion: cfg?.outputPricePerMillion
      });
      stateMap[modelKey] = state;
      routeMap[sourceKey] = modelKey;

      const layout = ensureNodeLayout(modelKey, panelIndex);
      layout.x = topicStartX + panelIndex * RESULT_CARD_STEP_X;
      layout.y = topicBaseY;
      bringToFront(layout);
      maxCardRight = Math.max(maxCardRight, layout.x + RESULT_CARD_WIDTH);
      minCardLeft = Math.min(minCardLeft, layout.x);
      panelIndex += 1;
    }
  });

  let minLeft = question.x;
  let maxRight = question.x + question.width;
  if (Number.isFinite(minCardLeft) && Number.isFinite(maxCardRight)) {
    const centerX = parentBounds && Number.isFinite(parentCenterX)
      ? parentCenterX
      : (minCardLeft + maxCardRight) / 2;
    question.x = Math.round(centerX - question.width / 2);
    minLeft = Math.min(question.x, minCardLeft);
    maxRight = Math.max(question.x + question.width, maxCardRight);
  }

  ensureTopicVisible(minLeft, maxRight);
  return {
    questionId: question.id,
    routeMap
  };
}

function ensureTopicVisible(minLeft, maxRight) {
  ensureTopicVisibleUtil({
    canvas: flowCanvasRef.value,
    minLeft,
    maxRight,
    canvasOffset,
    safeScale: getSafeCanvasScale(),
    padding: 32
  });
}

function resolveFollowUpParentModel(mode) {
  if (normalizeGenerationMode(mode) === IMAGE_MODE) {
    const imageSourceModel = String(selectedImageSourceModel.value || "").trim();
    if (imageSourceModel && stateMap[imageSourceModel]) {
      return imageSourceModel;
    }
  }
  if (selectedModule.type === "model" && stateMap[selectedModule.id]) {
    return selectedModule.id;
  }
  return "";
}

function markRouteModelsAsFailed(routeMap, message, onlyUnfinished = false) {
  const safeMessage = String(message || "").trim() || "请求失败，请重试";
  if (!routeMap || typeof routeMap !== "object") {
    return;
  }

  Object.values(routeMap).forEach((modelKey) => {
    const key = String(modelKey || "").trim();
    if (!key) {
      return;
    }
    const item = stateMap[key];
    if (!item) {
      return;
    }
    if (onlyUnfinished && item.done) {
      return;
    }

    applyStreamEventToModel(key, {
      model: item.sourceModel || item.model || key,
      delta: "",
      done: true,
      error: safeMessage
    });
  });
  flushDirtyModelsNow();
}

async function send() {
  if (!authReady.value) {
    requireInviteLogin();
    ElMessage.warning("请先输入邀请码登录");
    return;
  }
  const text = prompt.value.trim();
  const mode = normalizeGenerationMode(generationMode.value);
  const parentModelKey = resolveFollowUpParentModel(mode);
  const isFollowUp = Boolean(parentModelKey);
  const safeImageCount = normalizeImageBatchCount(imageBatchCount.value);
  const safeImageAspectRatio = normalizeImageAspectRatio(imageAspectRatio.value);
  const safeImageQuality = normalizeImageQuality(imageQuality.value);
  const imageInputs = mode === IMAGE_MODE ? cloneImageInputPayloadList(selectedImageInputs.value) : [];
  const imageInput = mode === IMAGE_MODE
    ? (cloneImageInputPayload(selectedImageInput.value) || cloneImageInputPayload(imageInputs[0]))
    : null;
  const payloadPrompt = mode === TEXT_MODE
    ? (isFollowUp ? buildPromptWithAllConversationContexts(text) : buildPromptWithSelectedContexts(text))
    : buildPromptWithSelectedContexts(text);
  if (!payloadPrompt) {
    ElMessage.warning("请输入内容后再发送");
    return;
  }
  const displayPrompt = text || "基于已选上下文继续";

  let activeQuestionId = "";
  let activeRouteMap = null;
  try {
    await loadConfigs();
    const expectedApiType = mode === IMAGE_MODE ? API_TYPE_IMAGE : API_TYPE_TEXT;
    let enabled = apiConfigs.value.filter((cfg) => cfg.enabled && cfg.apiType === expectedApiType);
    if (enabled.length === 0) {
      ElMessage.warning(mode === IMAGE_MODE ? "请先配置并启用至少一个图片 API" : "请先配置并启用至少一个文字 API");
      return;
    }
    if (mode === IMAGE_MODE && imageInputs.length === 0) {
      const withoutReferenceCompatible = enabled.filter((cfg) => !requiresReferenceImage(cfg));
      if (withoutReferenceCompatible.length === 0) {
        ElMessage.warning("当前启用的图片模型需要参考图，请先上传参考图");
        return;
      }
      if (withoutReferenceCompatible.length < enabled.length) {
        ElMessage.info("已自动跳过需要参考图的模型");
      }
      enabled = withoutReferenceCompatible;
    }
    if (mode === IMAGE_MODE && imageInputs.length > 0) {
      const editableModels = enabled.filter((cfg) => supportsReferenceImageEditing(cfg));
      if (editableModels.length === 0) {
    ElMessage.warning("当前启用的图片模型不支持参考图编辑。请启用 GPT-Image-2-All / Qwen-Image-2.0 / Qwen-Image-Edit / NanoBanana。");
        return;
      }
      if (editableModels.length < enabled.length) {
        ElMessage.info("已自动跳过不支持参考图编辑的模型");
      }
      enabled = editableModels;
    }

    const { questionId, routeMap } = appendPanelsForTopic(displayPrompt, payloadPrompt, enabled, {
      mode,
      imageCount: safeImageCount,
      imageAspectRatio: safeImageAspectRatio,
      imageQuality: safeImageQuality,
      imageInputs,
      imageInput,
      parentModelKey
    });
    activeQuestionId = questionId;
    activeRouteMap = routeMap;
    lastSentPrompt.value = payloadPrompt;
    acceptIncomingEvents.value = true;

    const streamController = new AbortController();
    streamControllers.set(questionId, streamController);
    await sendPromptStream(
      "",
      payloadPrompt,
      (event) => {
        if (handleInviteAuthFailure(event?.error)) {
          return;
        }
        onStreamEvent(event, routeMap);
      },
      streamController.signal,
        {
          mode,
          imageCount: mode === IMAGE_MODE ? safeImageCount : undefined,
          imageAspectRatio: mode === IMAGE_MODE ? safeImageAspectRatio : undefined,
          imageQuality: mode === IMAGE_MODE ? safeImageQuality : undefined,
          imageInput: mode === IMAGE_MODE ? imageInput || undefined : undefined,
          imageInputs: mode === IMAGE_MODE && imageInputs.length > 0 ? imageInputs : undefined
        }
      );
    markRouteModelsAsFailed(
      activeRouteMap,
      "未收到模型返回，请重试或检查该模型配置",
      true
    );
  } catch (error) {
    if (error?.name !== "AbortError") {
      if (handleInviteAuthFailure(error.message)) {
        return;
      }
      markRouteModelsAsFailed(activeRouteMap, error.message || "流式请求失败");
      ElMessage.error(error.message || "流式请求失败");
    }
  } finally {
    flushDirtyModelsNow();
    if (activeQuestionId) {
      streamControllers.delete(activeQuestionId);
    }
    await persistCanvasSnapshot({ silent: true });
  }
}

async function regenerateQuestion(questionId) {
  if (!questionId) {
    return;
  }

  const question = findQuestionNodeById(questionId);
  if (!question) {
    ElMessage.warning("未找到该问题模块");
    return;
  }

  const questionModels = modelList.value.filter((item) => item.questionId === questionId);
  if (!questionModels.length) {
    ElMessage.warning("该问题下暂无回答模块可重试");
    return;
  }

  const basePrompt = (
    question.fullPrompt ||
    questionModels[0]?.promptText ||
    question.text ||
    lastSentPrompt.value ||
    prompt.value ||
    ""
  ).trim();
  if (!basePrompt) {
    ElMessage.warning("没有可重试的提问内容，请先发送一次消息");
    return;
  }
  const retryMode = normalizeGenerationMode(question.generationMode || questionModels[0]?.generationMode);
  const retryImageCount = normalizeImageBatchCount(question.imageCount || questionModels[0]?.imageCount);
  const retryImageAspectRatio = normalizeImageAspectRatio(
    question.imageAspectRatio || questionModels[0]?.imageAspectRatio || imageAspectRatio.value
  );
  const retryImageQuality = normalizeImageQuality(
    question.imageQuality || questionModels[0]?.imageQuality || imageQuality.value
  );
  let retryImageInputs = cloneImageInputPayloadList(question.imageInputs);
  if (retryImageInputs.length === 0) {
    retryImageInputs = cloneImageInputPayloadList(questionModels[0]?.imageInputs);
  }
  let retryImageInput = cloneImageInputPayload(question.imageInput || questionModels[0]?.imageInput);
  if (!retryImageInput && retryImageInputs.length > 0) {
    retryImageInput = cloneImageInputPayload(retryImageInputs[0]);
  }
  if (retryImageInputs.length === 0 && retryImageInput) {
    retryImageInputs = [cloneImageInputPayload(retryImageInput)];
  }

  const routeMap = {};
  const targetModelSet = new Set();
  questionModels.forEach((item) => {
    const sourceModel = (item.sourceModel || item.model || "").trim();
    if (!sourceModel) {
      return;
    }

    const sourceKey = parseModelTag(sourceModel).key;
    routeMap[sourceKey] = item.model;
    targetModelSet.add(sourceModel);

      item.promptText = basePrompt;
      item.generationMode = retryMode;
      item.imageCount = retryImageCount;
      item.imageAspectRatio = retryImageAspectRatio;
      item.imageQuality = retryImageQuality;
      item.imageInputs = cloneImageInputPayloadList(retryImageInputs);
      item.imageInput = cloneImageInputPayload(retryImageInput);
      item.content = "";
    item.pendingDelta = "";
    item.error = "";
    item.done = false;
    item.timeText = formatNowTimeText();
    item.renderedHtml = renderStreamingMarkdown("");

    const existingRetryController = retryControllers.get(item.model);
    if (existingRetryController) {
      existingRetryController.abort();
      retryControllers.delete(item.model);
    }
    delete retryingMap[item.model];
  });

  const targetModels = Array.from(targetModelSet);
  if (!targetModels.length) {
    ElMessage.warning("未找到可重试的目标模型");
    return;
  }

  const existingStreamController = streamControllers.get(questionId);
  if (existingStreamController) {
    existingStreamController.abort();
  }
  const questionRetryController = new AbortController();
  streamControllers.set(questionId, questionRetryController);

  question.timeText = formatNowTimeText();
  question.fullPrompt = basePrompt;
  question.generationMode = retryMode;
  question.imageCount = retryImageCount;
  question.imageAspectRatio = retryImageAspectRatio;
  question.imageQuality = retryImageQuality;
  question.imageInputs = cloneImageInputPayloadList(retryImageInputs);
  question.imageInput = cloneImageInputPayload(retryImageInput);
  lastSentPrompt.value = basePrompt;
  acceptIncomingEvents.value = true;
  saveChatUiState();

  try {
    await sendPromptStream("", basePrompt, (event) => {
      if (handleInviteAuthFailure(event?.error)) {
        return;
      }
      onStreamEvent(event, routeMap);
    }, questionRetryController.signal, {
      targetModels,
        appendUserMessage: true,
        mode: retryMode,
        imageCount: retryMode === IMAGE_MODE ? retryImageCount : undefined,
        imageAspectRatio: retryMode === IMAGE_MODE ? retryImageAspectRatio : undefined,
        imageQuality: retryMode === IMAGE_MODE ? retryImageQuality : undefined,
        imageInput: retryMode === IMAGE_MODE ? retryImageInput || undefined : undefined,
        imageInputs: retryMode === IMAGE_MODE && retryImageInputs.length > 0 ? retryImageInputs : undefined
      });
    markRouteModelsAsFailed(
      routeMap,
      "未收到模型返回，请重试或检查该模型配置",
      true
    );
  } catch (error) {
    if (error?.name !== "AbortError") {
      if (handleInviteAuthFailure(error.message)) {
        return;
      }
      markRouteModelsAsFailed(routeMap, error.message || "问题重试失败", true);
      ElMessage.error(error.message || "问题重试失败");
    }
  } finally {
    flushDirtyModelsNow();
    if (streamControllers.get(questionId) === questionRetryController) {
      streamControllers.delete(questionId);
    }
    saveChatUiState();
    await persistCanvasSnapshot({ silent: true });
  }
}

async function regenerateModel(model) {
  if (!model) {
    return;
  }

  const item = stateMap[model];
  if (!item) {
    ElMessage.warning("未找到该模型卡片");
    return;
  }
  const basePrompt = (item.promptText || lastSentPrompt.value || prompt.value || "").trim();
  if (!basePrompt) {
    ElMessage.warning("没有可重试的提问内容，请先发送一次消息");
    return;
  }
  const sourceModel = (item.sourceModel || model).trim();
  const sourceModelKey = parseModelTag(sourceModel).key;
  const mode = normalizeGenerationMode(item.generationMode);
  const safeImageCount = normalizeImageBatchCount(item.imageCount);
  const safeImageAspectRatio = normalizeImageAspectRatio(item.imageAspectRatio || imageAspectRatio.value);
  const safeImageQuality = normalizeImageQuality(item.imageQuality || imageQuality.value);
  let imageInputs = cloneImageInputPayloadList(item.imageInputs);
  let imageInput = cloneImageInputPayload(item.imageInput);
  if (!imageInput && imageInputs.length > 0) {
    imageInput = cloneImageInputPayload(imageInputs[0]);
  }
  if (imageInputs.length === 0 && imageInput) {
    imageInputs = [cloneImageInputPayload(imageInput)];
  }

  item.content = "";
  item.pendingDelta = "";
  item.error = "";
  item.done = false;
  item.timeText = formatNowTimeText();
  item.imageAspectRatio = safeImageAspectRatio;
  item.imageQuality = safeImageQuality;
  item.imageInputs = cloneImageInputPayloadList(imageInputs);
  item.imageInput = cloneImageInputPayload(imageInput);
  item.renderedHtml = renderStreamingMarkdown("");
  retryingMap[model] = true;
  acceptIncomingEvents.value = true;
  saveChatUiState();

  const existingRetryController = retryControllers.get(model);
  if (existingRetryController) {
    existingRetryController.abort();
  }
  const retryController = new AbortController();
  retryControllers.set(model, retryController);
  const onRetryStreamEvent = (event) => {
    if (handleInviteAuthFailure(event?.error)) {
      return;
    }
    const eventModel = parseModelTag(event?.model || "Unknown").key;
    if (eventModel !== sourceModelKey) {
      return;
    }
    applyStreamEventToModel(model, event);
  };
  try {
    await sendPromptStream(
      "",
      basePrompt,
      onRetryStreamEvent,
      retryController.signal,
        {
          targetModels: [sourceModel],
          appendUserMessage: true,
          mode,
          imageCount: mode === IMAGE_MODE ? safeImageCount : undefined,
          imageAspectRatio: mode === IMAGE_MODE ? safeImageAspectRatio : undefined,
          imageQuality: mode === IMAGE_MODE ? safeImageQuality : undefined,
          imageInput: mode === IMAGE_MODE ? imageInput || undefined : undefined,
          imageInputs: mode === IMAGE_MODE && imageInputs.length > 0 ? imageInputs : undefined
        }
      );
  } catch (error) {
    if (error?.name !== "AbortError") {
      if (handleInviteAuthFailure(error.message)) {
        return;
      }
      item.error = error.message || "重试失败";
      item.done = true;
      item.renderedHtml = buildRenderedContent(item);
      ElMessage.error(item.error);
    }
  } finally {
    retryControllers.delete(model);
    delete retryingMap[model];
    flushDirtyModelsNow();
    saveChatUiState();
    await persistCanvasSnapshot({ silent: true });
  }
}

function onPromptKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
    return;
  }
  event.preventDefault();
  void send();
}

async function clear() {
  acceptIncomingEvents.value = false;
  abortAllStreams();

  prompt.value = DEFAULT_MARKDOWN_PROMPT;
  generationMode.value = TEXT_MODE;
  imageBatchCount.value = DEFAULT_IMAGE_BATCH_COUNT;
  imageAspectRatio.value = DEFAULT_IMAGE_ASPECT_RATIO;
  imageQuality.value = DEFAULT_IMAGE_QUALITY;
  clearImageInput();
  lastSentPrompt.value = "";
  clearModelStates();
  canvasOffset.x = 0;
  canvasOffset.y = 0;
  canvasScale.value = 1;
  flowLayoutCache.value = {};
  clearFlowLayoutStorage();
  clearChatUiStateStorage();
  ElMessage.success("已开启全新对话");
}

watch(prompt, () => {
  saveChatUiState();
});

watch(lastSentPrompt, () => {
  saveChatUiState();
});

watch(
  generationMode,
  (mode, previousMode) => {
    const normalizedMode = normalizeGenerationMode(mode);
    const normalizedPreviousMode = normalizeGenerationMode(previousMode);
    const modeChanged = previousMode !== undefined && normalizedMode !== normalizedPreviousMode;
    syncSidebarApiViewWithGenerationMode(normalizedMode);
    if (modeChanged) {
      clearSelectedModule();
      selectedImageSourceModel.value = "";
      hideImageHoverPreview();
      closeImageViewer();
      stopDragging();
      stopCanvasPanning();
      stopQuestionDragging();
      stopSummaryDraft();
    }
    if (normalizedMode !== IMAGE_MODE) {
      resetImageDragState();
      return;
    }
    const trimmedPrompt = String(prompt.value || "").trim();
    if (!trimmedPrompt || trimmedPrompt === DEFAULT_MARKDOWN_PROMPT) {
      prompt.value = DEFAULT_IMAGE_PROMPT;
    }
  },
  { immediate: true }
);

watch(
  () => [canvasOffset.x, canvasOffset.y],
  () => {
    saveChatUiState();
  }
);
</script>

<style src="./ChatView.css"></style>



