export function createContextSummaryManager(options) {
  const {
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
  } = options;

  function loadSelectedModelsIntoPrompt(modelKeys) {
    const loadedContexts = [];
    (modelKeys || []).forEach((modelKey) => {
      const item = stateMap[modelKey];
      if (!item || !item.content) {
        return;
      }
      const context = {
        id: `ctx-${promptContextSeq.value++}`,
        modelKey,
        title: buildContextChipTitle(item),
        sourceTitle: item.title || item.model,
        content: item.content
      };
      const existingIndex = promptContexts.value.findIndex((ctx) => ctx.modelKey === modelKey);
      if (existingIndex >= 0) {
        promptContexts.value[existingIndex] = {
          ...promptContexts.value[existingIndex],
          title: context.title,
          sourceTitle: context.sourceTitle,
          content: context.content
        };
      } else {
        promptContexts.value.push(context);
        loadedContexts.push(context);
      }
    });

    if (!loadedContexts.length) {
      if (promptContexts.value.length) {
        ElMessage.success("已更新输入框上下文");
        return true;
      }
      ElMessage.warning("命中卡片暂无可用文本");
      return false;
    }

    openInputPanel();
    ElMessage.success(`已加载 ${loadedContexts.length} 条上下文`);
    return true;
  }

  function removePromptContext(contextId) {
    promptContexts.value = promptContexts.value.filter((ctx) => ctx.id !== contextId);
  }

  function refreshSummarySelection(block) {
    const rect = { x: block.x, y: block.y, width: block.width, height: block.height };
    block.selectedModels = collectModelsInRect(rect);
  }

  function removeSummaryBlock(blockId) {
    const existing = summaryControllers.get(blockId);
    if (existing) {
      existing.abort();
      summaryControllers.delete(blockId);
    }
    summaryBlocks.value = summaryBlocks.value.filter((item) => item.id !== blockId);
  }

  function startSummaryDraft(event) {
    const point = clientToLayerPoint(event.clientX, event.clientY);
    summaryCreateState.active = true;
    summaryCreateState.pointerId = event.pointerId;
    summaryCreateState.startX = point.x;
    summaryCreateState.startY = point.y;
    summaryCreateState.currentX = point.x;
    summaryCreateState.currentY = point.y;
  }

  function stopSummaryDraft() {
    if (!summaryCreateState.active) {
      return;
    }
    const rect = normalizeRect(
      summaryCreateState.startX,
      summaryCreateState.startY,
      summaryCreateState.currentX,
      summaryCreateState.currentY
    );

    summaryCreateState.active = false;
    summaryCreateState.pointerId = null;

    if (rect.width < 32 || rect.height < 32) {
      return;
    }

    const selectedModels = collectModelsInRect(rect);
    if (!selectedModels.length) {
      ElMessage.warning("选区内没有命中的回答卡片");
      return;
    }
    loadSelectedModelsIntoPrompt(selectedModels);
  }

  async function runSummaryBlock(block) {
    if (!block || block.loading) {
      return;
    }

    refreshSummarySelection(block);
    if (!block.selectedModels.length) {
      ElMessage.warning("总结块内没有命中的回答卡片");
      return;
    }

    const enabled = apiConfigs.value.filter((cfg) => cfg.enabled);
    if (!enabled.length) {
      ElMessage.warning("请先配置并启用至少一个 API");
      return;
    }

    const instruction = (block.instruction || "").trim() || "总结这些回答";
    const sections = buildSelectedModelSections(block.selectedModels);

    if (!sections.length) {
      ElMessage.warning("命中卡片暂无可用文本");
      return;
    }

    const payloadPrompt = `${instruction}

请仅基于以下回答进行处理：

${sections.join("\n\n---\n\n")}`;

    const targetModel = buildModelTagFromConfig(enabled[0]);
    const previousCtrl = summaryControllers.get(block.id);
    if (previousCtrl) {
      previousCtrl.abort();
    }
    const summaryCtrl = new AbortController();
    summaryControllers.set(block.id, summaryCtrl);
    block.loading = true;
    block.error = "";
    block.content = "";
    block.renderedHtml = renderMarkdownPreservingMath("_总结中..._");

    try {
      await sendPromptStream(
        "",
        payloadPrompt,
        (event) => {
          const eventModel = parseModelTag(event?.model || "").key;
          if (eventModel && eventModel !== parseModelTag(targetModel).key) {
            return;
          }
          if (event.delta) {
            block.content += event.delta;
            block.renderedHtml = renderStreamingMarkdown(block.content);
          }
          if (event.error) {
            block.error = event.error;
          }
        },
        summaryCtrl.signal,
        {
          targetModels: [targetModel],
          appendUserMessage: true
        }
      );
      if (!block.error) {
        block.renderedHtml = renderMarkdownWithCollapsibleThinking(block.content || "_模型未返回文本_");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        block.error = error?.message || "总结失败";
      }
    } finally {
      block.loading = false;
      if (block.error) {
        block.renderedHtml = renderMarkdownPreservingMath(`**Error:** ${block.error}`);
      }
      summaryControllers.delete(block.id);
    }
  }

  return {
    loadSelectedModelsIntoPrompt,
    removePromptContext,
    refreshSummarySelection,
    removeSummaryBlock,
    startSummaryDraft,
    stopSummaryDraft,
    runSummaryBlock
  };
}
