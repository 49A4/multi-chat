export function getModelCardBounds(model, nodeLayoutMap, flowCanvasEl, options = {}) {
  const layout = nodeLayoutMap[model];
  if (!layout) {
    return null;
  }
  const { defaultWidth = 340, defaultHeight = 260 } = options;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(model) : model.replace(/"/g, '\\"');
  const cardEl = flowCanvasEl?.querySelector?.(`.flow-node[data-model="${escaped}"]`);
  return {
    x: layout.x,
    y: layout.y,
    width: cardEl?.offsetWidth || defaultWidth,
    height: cardEl?.offsetHeight || defaultHeight
  };
}

export function collectModelsInRect(rect, modelItems, getBounds, intersectsRect) {
  return (modelItems || [])
    .map((item) => item.model)
    .filter((model) => {
      const bounds = getBounds(model);
      if (!bounds) {
        return false;
      }
      return intersectsRect(rect, bounds);
    });
}

export function computeNextTopicStartX(
  questionNodes,
  modelItems,
  nodeLayoutMap,
  resultCardWidth,
  defaultStartX,
  topicGroupGap
) {
  let maxRight = Number.NEGATIVE_INFINITY;

  (questionNodes || []).forEach((question) => {
    maxRight = Math.max(maxRight, question.x + question.width);
  });
  (modelItems || []).forEach((item) => {
    const layout = nodeLayoutMap[item.model];
    if (!layout) {
      return;
    }
    maxRight = Math.max(maxRight, layout.x + resultCardWidth);
  });

  if (!Number.isFinite(maxRight)) {
    return defaultStartX;
  }
  return Math.round(maxRight + topicGroupGap);
}

export function ensureTopicVisible({ canvas, minLeft, maxRight, canvasOffset, safeScale, padding = 32 }) {
  if (!canvas) {
    return;
  }
  const viewportWidth = canvas.clientWidth || 0;
  if (viewportWidth <= 0 || !Number.isFinite(safeScale) || safeScale <= 0) {
    return;
  }

  const visibleLeft = -canvasOffset.x / safeScale;
  const visibleRight = visibleLeft + viewportWidth / safeScale;
  if (maxRight + padding > visibleRight) {
    canvasOffset.x -= (maxRight + padding - visibleRight) * safeScale;
  }

  const nextVisibleLeft = -canvasOffset.x / safeScale;
  if (minLeft - padding < nextVisibleLeft) {
    canvasOffset.x += (nextVisibleLeft - (minLeft - padding)) * safeScale;
  }
}
