export function createStreamOrchestrator(options) {
  const {
    stateMap,
    retryingMap,
    saveChatUiState,
    buildRenderedContent,
    flowCanvasRef,
    nextTick,
    parseModelTag,
    acceptIncomingEvents,
    flushIntervalMs = 180
  } = options;

  const dirtyModels = new Set();
  let flushTimer = null;
  let mathTypesetTimer = null;

  function normalizeTokenCount(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return null;
    }
    return Math.floor(num);
  }

  function flushDirtyModels() {
    if (dirtyModels.size === 0) {
      return;
    }

    const models = Array.from(dirtyModels);
    dirtyModels.clear();

    models.forEach((model) => {
      const item = stateMap[model];
      if (!item) {
        return;
      }

      if (item.pendingDelta) {
        item.content += item.pendingDelta;
        item.pendingDelta = "";
      }

      item.renderedHtml = buildRenderedContent(item);
    });

    saveChatUiState();
    scheduleMathTypeset();
  }

  function flushDirtyModelsNow() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushDirtyModels();
  }

  function scheduleModelFlush(model) {
    dirtyModels.add(model);

    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushDirtyModels();
    }, flushIntervalMs);
  }

  function scheduleMathTypeset() {
    if (mathTypesetTimer) {
      return;
    }

    mathTypesetTimer = setTimeout(() => {
      mathTypesetTimer = null;
      void typesetMath();
    }, 80);
  }

  async function typesetMath() {
    if (typeof window === "undefined" || !window.MathJax) {
      return;
    }

    try {
      if (window.MathJax.startup?.promise) {
        await window.MathJax.startup.promise;
      }
      if (!window.MathJax.typesetPromise) {
        return;
      }

      await nextTick();
      const root = flowCanvasRef.value;
      if (!root) {
        return;
      }

      if (window.MathJax.typesetClear) {
        window.MathJax.typesetClear([root]);
      }
      await window.MathJax.typesetPromise([root]);
    } catch {
      // Ignore math render failures to avoid blocking chat rendering.
    }
  }

  function applyStreamEventToModel(modelKey, event) {
    const item = stateMap[modelKey];
    if (!item) {
      return;
    }

    const promptTokens = normalizeTokenCount(event.promptTokens);
    const completionTokens = normalizeTokenCount(event.completionTokens);
    let totalTokens = normalizeTokenCount(event.totalTokens);
    if (totalTokens == null && promptTokens != null && completionTokens != null) {
      totalTokens = promptTokens + completionTokens;
    }
    if (promptTokens != null || completionTokens != null || totalTokens != null) {
      item.usage = {
        promptTokens,
        completionTokens,
        totalTokens
      };
    }

    const hasFullContent = typeof event.fullContent === "string" && event.fullContent.length > 0;
    if (hasFullContent) {
      item.pendingDelta = "";
      item.content = event.fullContent;
    }

    if (event.delta) {
      item.pendingDelta += event.delta;
      scheduleModelFlush(modelKey);
    }
    if (event.error) {
      item.error = event.error;
      item.done = true;
      delete retryingMap[modelKey];
      scheduleModelFlush(modelKey);
      flushDirtyModelsNow();
    }
    if (event.done) {
      item.done = true;
      delete retryingMap[modelKey];
      scheduleModelFlush(modelKey);
      flushDirtyModelsNow();
    }
  }

  function onStreamEvent(event, routeMap) {
    if (!acceptIncomingEvents.value) {
      return;
    }

    if (!routeMap) {
      return;
    }
    const sourceModelKey = parseModelTag(event.model || "Unknown").key;
    const modelKey = routeMap[sourceModelKey];
    if (!modelKey) {
      return;
    }
    if (!stateMap[modelKey] && !retryingMap[modelKey]) {
      return;
    }
    applyStreamEventToModel(modelKey, event);
  }

  function clearDirtyQueue() {
    dirtyModels.clear();
  }

  function dispose() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (mathTypesetTimer) {
      clearTimeout(mathTypesetTimer);
      mathTypesetTimer = null;
    }
    dirtyModels.clear();
  }

  return {
    applyStreamEventToModel,
    onStreamEvent,
    flushDirtyModelsNow,
    clearDirtyQueue,
    dispose
  };
}
