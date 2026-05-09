import { cloneImageInputPayload, cloneImageInputPayloadList } from "./useImageInputs";

export function createChatNodeFactory(options = {}) {
  const {
    ensureNodeLayout,
    formatNowTimeText,
    normalizeGenerationMode,
    normalizeImageAspectRatio,
    normalizeImageBatchCount,
    normalizeImageQuality,
    normalizeOptionalNonNegativeNumber,
    parseModelTag,
    renderStreamingMarkdown,
    allocateTopicId,
    topicBaseX,
    questionBaseY
  } = options;

  function createQuestionNode(text, fullPrompt, topicStartX, createOptions = {}) {
    const safeText = (text || "").trim();
    const safeFullPrompt = (fullPrompt || safeText).trim();
    const id = allocateTopicId();
    const mode = normalizeGenerationMode(createOptions.generationMode);
    const imageCount = normalizeImageBatchCount(createOptions.imageCount);
    const imageAspectRatio = normalizeImageAspectRatio(createOptions.imageAspectRatio);
    const imageQuality = normalizeImageQuality(createOptions.imageQuality);
    const imageInputs = cloneImageInputPayloadList(createOptions.imageInputs);
    const imageInput = cloneImageInputPayload(createOptions.imageInput) || cloneImageInputPayload(imageInputs[0]);
    const parentModelKey = String(createOptions.parentModelKey || "").trim();
    const rawQuestionY = Number(createOptions.questionY);
    const questionY = Number.isFinite(rawQuestionY) ? Math.round(rawQuestionY) : questionBaseY;
    return {
      id,
      text: safeText,
      fullPrompt: safeFullPrompt,
      generationMode: mode,
      imageCount,
      imageAspectRatio,
      imageQuality,
      imageInputs,
      imageInput,
      parentModelKey,
      timeText: formatNowTimeText(),
      x: Math.max(topicBaseX, topicStartX + 100),
      y: questionY,
      width: 520,
      height: 104
    };
  }

  function createModelState(model, index = 0, createOptions = {}) {
    const sourceModel = (createOptions.sourceModel || model || "").trim();
    const parsedTag = parseModelTag(sourceModel);
    const modelKey = (model || "").trim();
    const mode = normalizeGenerationMode(createOptions.generationMode);
    const imageCount = normalizeImageBatchCount(createOptions.imageCount);
    const imageAspectRatio = normalizeImageAspectRatio(createOptions.imageAspectRatio);
    const imageQuality = normalizeImageQuality(createOptions.imageQuality);
    const imageInputs = cloneImageInputPayloadList(createOptions.imageInputs);
    const imageInput = cloneImageInputPayload(createOptions.imageInput) || cloneImageInputPayload(imageInputs[0]);
    ensureNodeLayout(modelKey, index);
    return {
      model: modelKey,
      sourceModel,
      questionId: createOptions.questionId || "",
      promptText: createOptions.promptText || "",
      generationMode: mode,
      imageCount,
      imageAspectRatio,
      imageQuality,
      imageInputs,
      imageInput,
      title: parsedTag.title || modelKey,
      timeText: formatNowTimeText(),
      content: "",
      pendingDelta: "",
      renderedHtml: renderStreamingMarkdown(""),
      usage: null,
      inputPricePerMillion: normalizeOptionalNonNegativeNumber(createOptions.inputPricePerMillion),
      outputPricePerMillion: normalizeOptionalNonNegativeNumber(createOptions.outputPricePerMillion),
      done: false,
      error: ""
    };
  }

  return {
    createModelState,
    createQuestionNode
  };
}
