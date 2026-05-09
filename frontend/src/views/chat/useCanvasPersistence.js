import { ref } from "vue";

const FLOW_LAYOUT_STORAGE_KEY = "multi-chat-flow-layout-v1";
const CHAT_UI_STORAGE_KEY = "multi-chat-ui-state-v1";

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function useCanvasPersistence(options = {}) {
  const {
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
    getTopicSeq,
    getSummaryBlockSeq,
    getFlowTopZ,
    scheduleSnapshotAutoSave
  } = options;

  const flowLayoutCache = ref({});

  function loadFlowLayout() {
    return {};
  }

  function saveChatUiState() {
    return;
  }

  function restoreChatUiState() {
    return;
  }

  function clearChatUiStateStorage() {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(CHAT_UI_STORAGE_KEY);
  }

  function clearFlowLayoutStorage() {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(FLOW_LAYOUT_STORAGE_KEY);
  }

  function saveFlowLayout() {
    const map = {};
    Object.keys(nodeLayoutMap || {}).forEach((model) => {
      const layout = nodeLayoutMap[model];
      if (!layout) {
        return;
      }
      map[model] = { x: layout.x, y: layout.y };
    });
    flowLayoutCache.value = map;
    scheduleSnapshotAutoSave?.();
  }

  function buildSnapshotTitleFromCanvas() {
    const firstQuestion = questionNodes.value.find((item) => String(item?.text || "").trim());
    const base = String(firstQuestion?.text || prompt.value || "未命名画布")
      .replace(/\s+/g, " ")
      .trim();
    if (!base) {
      return "未命名画布";
    }
    return base.length > 80 ? `${base.slice(0, 80)}` : base;
  }

  function buildCanvasSnapshotPayload() {
    return {
      version: 1,
      prompt: String(prompt.value || ""),
      lastSentPrompt: String(lastSentPrompt.value || ""),
      generationMode: normalizeGenerationMode(generationMode.value),
      imageBatchCount: normalizeImageBatchCount(imageBatchCount.value),
      imageAspectRatio: normalizeImageAspectRatio(imageAspectRatio.value),
      imageQuality: normalizeImageQuality(imageQuality.value),
      selectedImageInputs: cloneImageInputPayloadList(selectedImageInputs.value),
      selectedImageInput: selectedImageInput.value ? cloneJson(selectedImageInput.value, null) : null,
      selectedImageSourceModel: String(selectedImageSourceModel.value || "").trim(),
      promptContexts: cloneJson(promptContexts.value, []),
      questionNodes: cloneJson(questionNodes.value, []),
      modelStates: cloneJson(modelList.value, []),
      nodeLayouts: cloneJson(nodeLayoutMap, {}),
      summaryBlocks: cloneJson(summaryBlocks.value, []),
      canvasOffset: { x: Number(canvasOffset.x) || 0, y: Number(canvasOffset.y) || 0 },
      canvasScale: Number(canvasScale.value) || 1,
      topicSeq: getTopicSeq(),
      summaryBlockSeq: getSummaryBlockSeq(),
      flowTopZ: getFlowTopZ()
    };
  }

  return {
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
  };
}
