import {
  buildDisplayImageInputFromPayload,
  cloneImageInputPayload,
  cloneImageInputPayloadList,
  normalizeImageInputPayload,
  normalizeImageInputPayloadList
} from "./useImageInputs";

const RESTORE_RENDER_BATCH_SIZE = 4;
const RESTORE_SUMMARY_RENDER_BATCH_SIZE = 2;
const RESTORE_RENDER_PLACEHOLDER_HTML = '<p class="stream-placeholder">正在恢复内容...</p>';

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function deriveNextTopicSeq(questions) {
  let maxSeq = 0;
  (questions || []).forEach((item) => {
    const id = String(item?.id || "").trim();
    const match = id.match(/^topic-(\d+)$/i);
    if (!match) {
      return;
    }
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      maxSeq = Math.max(maxSeq, Math.floor(value));
    }
  });
  return Math.max(1, maxSeq + 1);
}

function deriveNextSummarySeq(blocks) {
  let maxSeq = 0;
  (blocks || []).forEach((item) => {
    const id = String(item?.id || "").trim();
    const match = id.match(/^summary-(\d+)$/i);
    if (!match) {
      return;
    }
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      maxSeq = Math.max(maxSeq, Math.floor(value));
    }
  });
  return Math.max(1, maxSeq + 1);
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

export function createSnapshotRestoreHelpers(options = {}) {
  const {
    acceptIncomingEvents,
    abortAllStreams,
    buildRenderedContent,
    clampCanvasScale,
    clearModelStates,
    clearSelectedModule,
    createModelState,
    canvasOffset,
    canvasScale,
    defaultImageAspectRatio,
    defaultImageQuality,
    defaultMarkdownPrompt,
    ensureNodeLayout,
    formatNowTimeText,
    generationMode,
    getNextFlowTopZ,
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
    questionBaseY,
    questionNodes,
    renderStreamingMarkdown,
    saveFlowLayout,
    selectedImageInput,
    selectedImageInputs,
    selectedImageSourceModel,
    setFlowTopZ,
    setSummaryBlockSeq,
    setTopicSeq,
    stateMap,
    summaryBlocks,
    topicBaseX
  } = options;

  let deferredRestoreRenderJobId = 0;

  function normalizeSnapshotQuestionNode(rawQuestion, index = 0) {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      return null;
    }
    const id = String(rawQuestion.id || `topic-${index + 1}`).trim();
    if (!id) {
      return null;
    }
    const rawX = Number(rawQuestion.x);
    const rawY = Number(rawQuestion.y);
    const rawWidth = Number(rawQuestion.width);
    const rawHeight = Number(rawQuestion.height);
    const normalizedImageInputs = cloneImageInputPayloadList(rawQuestion.imageInputs);
    const normalizedLegacyImageInput = cloneImageInputPayload(rawQuestion.imageInput);
    const mergedImageInputs = normalizedImageInputs.length > 0
      ? normalizedImageInputs
      : (normalizedLegacyImageInput ? [normalizedLegacyImageInput] : []);

    return {
      id,
      text: String(rawQuestion.text || "").trim(),
      fullPrompt: String(rawQuestion.fullPrompt || rawQuestion.text || "").trim(),
      generationMode: normalizeGenerationMode(rawQuestion.generationMode),
      imageCount: normalizeImageBatchCount(rawQuestion.imageCount),
      imageAspectRatio: normalizeImageAspectRatio(rawQuestion.imageAspectRatio || defaultImageAspectRatio),
      imageQuality: normalizeImageQuality(rawQuestion.imageQuality || defaultImageQuality),
      imageInputs: mergedImageInputs,
      imageInput: normalizedLegacyImageInput || cloneImageInputPayload(mergedImageInputs[0]),
      parentModelKey: String(rawQuestion.parentModelKey || "").trim(),
      timeText: String(rawQuestion.timeText || "").trim() || formatNowTimeText(),
      x: Number.isFinite(rawX) ? Math.round(rawX) : topicBaseX,
      y: Number.isFinite(rawY) ? Math.round(rawY) : questionBaseY,
      width: Number.isFinite(rawWidth) && rawWidth > 80 ? Math.round(rawWidth) : 520,
      height: Number.isFinite(rawHeight) && rawHeight > 40 ? Math.round(rawHeight) : 104
    };
  }

  function normalizeSnapshotModelState(rawModelState, index = 0) {
    if (!rawModelState || typeof rawModelState !== "object") {
      return null;
    }
    const modelKey = String(rawModelState.model || "").trim();
    if (!modelKey) {
      return null;
    }

    const normalizedImageInputs = cloneImageInputPayloadList(rawModelState.imageInputs);
    const normalizedLegacyImageInput = cloneImageInputPayload(rawModelState.imageInput);
    const mergedImageInputs = normalizedImageInputs.length > 0
      ? normalizedImageInputs
      : (normalizedLegacyImageInput ? [normalizedLegacyImageInput] : []);

    const normalized = createModelState(modelKey, index, {
      sourceModel: rawModelState.sourceModel || modelKey,
      questionId: String(rawModelState.questionId || "").trim(),
      promptText: String(rawModelState.promptText || "").trim(),
      generationMode: normalizeGenerationMode(rawModelState.generationMode),
      imageCount: normalizeImageBatchCount(rawModelState.imageCount),
      imageAspectRatio: normalizeImageAspectRatio(rawModelState.imageAspectRatio || defaultImageAspectRatio),
      imageQuality: normalizeImageQuality(rawModelState.imageQuality || defaultImageQuality),
      imageInputs: mergedImageInputs,
      imageInput: normalizedLegacyImageInput || cloneImageInputPayload(mergedImageInputs[0]),
      inputPricePerMillion: normalizeOptionalNonNegativeNumber(rawModelState.inputPricePerMillion),
      outputPricePerMillion: normalizeOptionalNonNegativeNumber(rawModelState.outputPricePerMillion)
    });

    normalized.title = String(rawModelState.title || normalized.title || modelKey).trim() || modelKey;
    normalized.timeText = String(rawModelState.timeText || normalized.timeText || "").trim() || formatNowTimeText();
    normalized.content = String(rawModelState.content || "").trim();
    normalized.pendingDelta = "";
    normalized.error = String(rawModelState.error || "").trim();
    normalized.done = rawModelState.done === true;
    normalized.usage = rawModelState.usage && typeof rawModelState.usage === "object"
      ? cloneJson(rawModelState.usage, null)
      : null;
    normalized.renderedHtml = RESTORE_RENDER_PLACEHOLDER_HTML;
    return normalized;
  }

  function cancelDeferredRestoreRendering() {
    deferredRestoreRenderJobId += 1;
  }

  async function renderRestoredSnapshotContentDeferred(restoredModels, restoredSummaryBlocks) {
    const jobId = ++deferredRestoreRenderJobId;
    await nextTick();
    await waitForNextFrame();

    for (let index = 0; index < restoredModels.length; index += RESTORE_RENDER_BATCH_SIZE) {
      if (jobId !== deferredRestoreRenderJobId) {
        return;
      }
      restoredModels
        .slice(index, index + RESTORE_RENDER_BATCH_SIZE)
        .forEach((item) => {
          const target = stateMap[item.model];
          if (!target) {
            return;
          }
          target.renderedHtml = buildRenderedContent(target);
        });
      await waitForNextFrame();
    }

    for (let index = 0; index < restoredSummaryBlocks.length; index += RESTORE_SUMMARY_RENDER_BATCH_SIZE) {
      if (jobId !== deferredRestoreRenderJobId) {
        return;
      }
      restoredSummaryBlocks
        .slice(index, index + RESTORE_SUMMARY_RENDER_BATCH_SIZE)
        .forEach((block) => {
          const target = summaryBlocks.value.find((item) => item.id === block.id);
          if (!target) {
            return;
          }
          target.renderedHtml = target.content ? renderStreamingMarkdown(target.content) : "";
        });
      await waitForNextFrame();
    }
  }

  function restoreCanvasFromSnapshot(snapshot) {
    const payload = snapshot && typeof snapshot === "object" ? snapshot : {};

    cancelDeferredRestoreRendering();
    acceptIncomingEvents.value = false;
    abortAllStreams();
    clearModelStates();

    prompt.value = String(payload.prompt || "").trim() || defaultMarkdownPrompt;
    lastSentPrompt.value = String(payload.lastSentPrompt || "").trim();
    generationMode.value = normalizeGenerationMode(payload.generationMode);
    imageBatchCount.value = normalizeImageBatchCount(payload.imageBatchCount);
    imageAspectRatio.value = normalizeImageAspectRatio(payload.imageAspectRatio || defaultImageAspectRatio);
    imageQuality.value = normalizeImageQuality(payload.imageQuality || defaultImageQuality);

    let restoredImageInputs = normalizeImageInputPayloadList(payload.selectedImageInputs);
    if (restoredImageInputs.length === 0) {
      const normalizedImageInput = normalizeImageInputPayload(payload.selectedImageInput);
      if (normalizedImageInput) {
        const rawImageInput = payload.selectedImageInput || {};
        restoredImageInputs = [buildDisplayImageInputFromPayload(rawImageInput)];
      }
    }
    selectedImageInputs.value = restoredImageInputs;
    selectedImageInput.value = selectedImageInputs.value[0] || null;

    const restoredQuestions = Array.isArray(payload.questionNodes)
      ? payload.questionNodes
          .map((item, index) => normalizeSnapshotQuestionNode(item, index))
          .filter(Boolean)
      : [];
    questionNodes.value = restoredQuestions;

    const restoredModels = Array.isArray(payload.modelStates)
      ? payload.modelStates
          .map((item, index) => normalizeSnapshotModelState(item, index))
          .filter(Boolean)
      : [];
    restoredModels.forEach((item) => {
      stateMap[item.model] = item;
    });

    Object.keys(nodeLayoutMap).forEach((key) => delete nodeLayoutMap[key]);
    const rawLayouts = payload.nodeLayouts && typeof payload.nodeLayouts === "object"
      ? payload.nodeLayouts
      : {};
    Object.entries(rawLayouts).forEach(([modelKey, rawLayout]) => {
      const key = String(modelKey || "").trim();
      if (!key || !rawLayout || typeof rawLayout !== "object") {
        return;
      }
      const x = Number(rawLayout.x);
      const y = Number(rawLayout.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      const z = Number(rawLayout.z);
      nodeLayoutMap[key] = {
        x: Math.round(x),
        y: Math.round(y),
        z: Number.isFinite(z) ? Math.max(1, Math.floor(z)) : getNextFlowTopZ()
      };
    });
    modelList.value.forEach((item, index) => {
      ensureNodeLayout(item.model, index);
    });
    saveFlowLayout();

    const rawOffsetX = Number(payload?.canvasOffset?.x);
    const rawOffsetY = Number(payload?.canvasOffset?.y);
    canvasOffset.x = Number.isFinite(rawOffsetX) ? Math.round(rawOffsetX) : 0;
    canvasOffset.y = Number.isFinite(rawOffsetY) ? Math.round(rawOffsetY) : 0;
    canvasScale.value = clampCanvasScale(payload.canvasScale);

    promptContexts.value = Array.isArray(payload.promptContexts)
      ? cloneJson(payload.promptContexts, []).filter((ctx) => ctx && typeof ctx === "object")
      : [];

    summaryBlocks.value = Array.isArray(payload.summaryBlocks)
      ? cloneJson(payload.summaryBlocks, []).map((block, index) => {
        const id = String(block?.id || `summary-${index + 1}`).trim() || `summary-${index + 1}`;
        const content = String(block?.content || "").trim();
        return {
          id,
          x: Number.isFinite(Number(block?.x)) ? Math.round(Number(block.x)) : 0,
          y: Number.isFinite(Number(block?.y)) ? Math.round(Number(block.y)) : 0,
          width: Number.isFinite(Number(block?.width)) ? Math.round(Number(block.width)) : 380,
          height: Number.isFinite(Number(block?.height)) ? Math.round(Number(block.height)) : 260,
          instruction: String(block?.instruction || "").trim(),
          selectedModels: Array.isArray(block?.selectedModels)
            ? block.selectedModels.map((key) => String(key || "").trim()).filter(Boolean)
            : [],
          content,
          renderedHtml: content ? RESTORE_RENDER_PLACEHOLDER_HTML : "",
          loading: false,
          error: String(block?.error || "").trim()
        };
      })
      : [];

    setTopicSeq(Number.isFinite(Number(payload.topicSeq))
      ? Math.max(1, Math.floor(Number(payload.topicSeq)))
      : deriveNextTopicSeq(questionNodes.value));
    setSummaryBlockSeq(Number.isFinite(Number(payload.summaryBlockSeq))
      ? Math.max(1, Math.floor(Number(payload.summaryBlockSeq)))
      : deriveNextSummarySeq(summaryBlocks.value));

    const maxZ = Object.values(nodeLayoutMap).reduce((maxValue, layout) => {
      const z = Number(layout?.z);
      if (!Number.isFinite(z)) {
        return maxValue;
      }
      return Math.max(maxValue, Math.floor(z));
    }, 1);
    setFlowTopZ(Number.isFinite(Number(payload.flowTopZ))
      ? Math.max(maxZ, Math.floor(Number(payload.flowTopZ)))
      : maxZ);

    const restoredSourceModel = String(payload.selectedImageSourceModel || "").trim();
    selectedImageSourceModel.value = restoredSourceModel && stateMap[restoredSourceModel]
      ? restoredSourceModel
      : "";
    clearSelectedModule();
    acceptIncomingEvents.value = true;
    void renderRestoredSnapshotContentDeferred(restoredModels, summaryBlocks.value);
  }

  return {
    cancelDeferredRestoreRendering,
    restoreCanvasFromSnapshot
  };
}
