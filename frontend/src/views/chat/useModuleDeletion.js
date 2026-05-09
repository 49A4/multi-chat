export function useModuleDeletion(options = {}) {
  const {
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
  } = options;

  function removeModelModules(modelKeys) {
    const keySet = new Set((modelKeys || []).filter(Boolean));
    if (!keySet.size) {
      return;
    }

    keySet.forEach((modelKey) => {
      const retryCtrl = retryControllers.get(modelKey);
      if (retryCtrl) {
        retryCtrl.abort();
        retryControllers.delete(modelKey);
      }
      delete retryingMap[modelKey];
      delete stateMap[modelKey];
      delete nodeLayoutMap[modelKey];
    });

    promptContexts.value = promptContexts.value.filter((ctx) => !keySet.has(ctx.modelKey));
    if (selectedImageSourceModel.value && keySet.has(selectedImageSourceModel.value)) {
      selectedImageSourceModel.value = "";
    }

    summaryBlocks.value = summaryBlocks.value.filter((block) => {
      const nextSelected = block.selectedModels.filter((modelKey) => !keySet.has(modelKey));
      if (nextSelected.length === block.selectedModels.length) {
        return true;
      }
      if (nextSelected.length === 0) {
        const ctrl = summaryControllers.get(block.id);
        if (ctrl) {
          ctrl.abort();
          summaryControllers.delete(block.id);
        }
        return false;
      }
      block.selectedModels = nextSelected;
      return true;
    });
  }

  function deleteQuestionModule(questionId) {
    if (!questionId) {
      return;
    }

    const streamCtrl = streamControllers.get(questionId);
    if (streamCtrl) {
      streamCtrl.abort();
      streamControllers.delete(questionId);
    }

    if (questionDragState.active && questionDragState.questionId === questionId) {
      stopQuestionDragging();
    }

    const modelKeys = modelList.value
      .filter((item) => item.questionId === questionId)
      .map((item) => item.model);

    removeModelModules(modelKeys);
    questionNodes.value = questionNodes.value.filter((question) => question.id !== questionId);
    saveFlowLayout();
    scheduleSnapshotAutoSave();
  }

  function deleteModelModule(modelKey) {
    if (!modelKey || !stateMap[modelKey]) {
      return;
    }
    removeModelModules([modelKey]);
    saveFlowLayout();
    scheduleSnapshotAutoSave();
  }

  function deleteSelectedModule() {
    if (selectedModule.type === "question") {
      deleteQuestionModule(selectedModule.id);
    } else if (selectedModule.type === "model") {
      deleteModelModule(selectedModule.id);
    }
    clearSelectedModule();
  }

  return {
    removeModelModules,
    deleteQuestionModule,
    deleteModelModule,
    deleteSelectedModule
  };
}
