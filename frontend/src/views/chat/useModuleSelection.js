import { computed, reactive, ref } from "vue";

export function useModuleSelection(options = {}) {
  const {
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
  } = options;

  const selectedModule = reactive({
    type: "",
    id: ""
  });
  const moduleActionMenuRef = ref(null);

  function isQuestionSelected(questionId) {
    return selectedModule.type === "question" && selectedModule.id === questionId;
  }

  function isModelSelected(modelKey) {
    return selectedModule.type === "model" && selectedModule.id === modelKey;
  }

  function selectQuestionModule(questionId) {
    selectedModule.type = "question";
    selectedModule.id = questionId;
  }

  function selectModelModule(modelKey) {
    selectedModule.type = "model";
    selectedModule.id = modelKey;
  }

  function onModelModuleClick(modelKey) {
    selectModelModule(modelKey);
    if (typeof applyModelImageAsImageInput === "function") {
      void applyModelImageAsImageInput(modelKey);
    }
  }

  function clearSelectedModule() {
    selectedModule.type = "";
    selectedModule.id = "";
  }

  const canRetrySelectedModule = computed(() => {
    if (selectedModule.type === "model") {
      return Boolean(stateMap?.[selectedModule.id]);
    }
    if (selectedModule.type === "question") {
      const question = findQuestionNodeById?.(selectedModule.id);
      if (!question) {
        return false;
      }
      const questionModels = (modelList?.value || []).filter((item) => item.questionId === question.id);
      if (!questionModels.length) {
        return false;
      }
      const basePrompt = (
        question.text ||
        questionModels[0]?.promptText ||
        lastSentPrompt?.value ||
        prompt?.value ||
        ""
      ).trim();
      return Boolean(basePrompt);
    }
    return false;
  });

  const selectedModuleRetrying = computed(() => {
    if (selectedModule.type === "model") {
      return canRetrySelectedModule.value ? Boolean(retryingMap?.[selectedModule.id]) : false;
    }
    if (selectedModule.type === "question") {
      return Boolean(streamControllers?.has(selectedModule.id));
    }
    return false;
  });

  const selectedModuleBounds = computed(() => {
    if (selectedModule.type === "question") {
      const question = findQuestionNodeById?.(selectedModule.id);
      if (!question) {
        return null;
      }
      return {
        x: question.x,
        y: question.y,
        width: question.width,
        height: question.height
      };
    }
    if (selectedModule.type === "model") {
      return getModelCardBounds?.(selectedModule.id) || null;
    }
    return null;
  });

  const showModuleActionMenu = computed(() => Boolean(selectedModuleBounds.value));

  const moduleActionMenuStyle = computed(() => {
    const bounds = selectedModuleBounds.value;
    if (!bounds) {
      return {};
    }
    const x = Math.max(8, Math.round(bounds.x + bounds.width + 10));
    const y = Math.max(8, Math.round(bounds.y));
    return {
      transform: `translate3d(${x}px, ${y}px, 0)`
    };
  });

  function retrySelectedModule() {
    if (!canRetrySelectedModule.value) {
      return;
    }
    if (selectedModule.type === "model") {
      void regenerateModel?.(selectedModule.id);
      return;
    }
    if (selectedModule.type === "question") {
      void regenerateQuestion?.(selectedModule.id);
    }
  }

  function updateModuleActionMenuDuringDrag(modelKey, renderX, renderY, width = 340) {
    if (selectedModule.type !== "model" || selectedModule.id !== modelKey) {
      return;
    }
    const menuEl = moduleActionMenuRef.value;
    if (!menuEl) {
      return;
    }
    const x = Math.max(8, Math.round(renderX + (width || 340) + 10));
    const y = Math.max(8, Math.round(renderY));
    menuEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  return {
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
    selectedModuleBounds,
    showModuleActionMenu,
    moduleActionMenuStyle,
    retrySelectedModule,
    updateModuleActionMenuDuringDrag
  };
}
