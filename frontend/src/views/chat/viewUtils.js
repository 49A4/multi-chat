export function questionNodeStyle(question) {
  return {
    transform: `translate3d(${Math.round(question.x)}px, ${Math.round(question.y)}px, 0)`,
    width: `${Math.round(question.width)}px`,
    minHeight: `${Math.round(question.height)}px`
  };
}

export function nodeStyleByLayout(layout) {
  if (!layout) {
    return {
      transform: "translate3d(0px, 0px, 0)",
      zIndex: 1
    };
  }
  return {
    transform: `translate3d(${layout.x}px, ${layout.y}px, 0)`,
    zIndex: layout.z
  };
}

export function summaryBlockStyle(block) {
  return {
    transform: `translate3d(${Math.round(block.x)}px, ${Math.round(block.y)}px, 0)`,
    width: `${Math.round(block.width)}px`,
    minHeight: `${Math.round(block.height)}px`,
    zIndex: 999
  };
}

export function normalizeRect(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { x, y, width, height };
}

export function clampScale(value, { fallback, min, max }) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return min;
  }
  return Math.min(max, value);
}

export function getSafeScale(scale, minScale) {
  return Math.max(scale, minScale);
}

export function getCanvasViewportPoint(canvas, clientX, clientY) {
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

export function getCurrentTouchPair(activeTouchPoints) {
  const points = Array.from(activeTouchPoints.values());
  if (points.length < 2) {
    return null;
  }
  return [points[0], points[1]];
}

export function getTouchDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function getTouchMidpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

export function clientToLayerPoint(canvas, clientX, clientY, canvasOffset, canvasScale, minScale) {
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  const safeScale = getSafeScale(canvasScale, minScale);
  return {
    x: (clientX - rect.left - canvasOffset.x) / safeScale,
    y: (clientY - rect.top - canvasOffset.y) / safeScale
  };
}

export function intersectsRect(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

export function normalizeWheelDelta(delta, deltaMode, viewportHeight = 800) {
  if (!Number.isFinite(delta)) {
    return 0;
  }
  if (deltaMode === 1) {
    return delta * 16;
  }
  if (deltaMode === 2) {
    return delta * viewportHeight;
  }
  return delta;
}

export function getDefaultPosition(index, { baseX, stepX, baseY }) {
  const safeIndex = Number.isFinite(index) ? index : 0;
  return {
    x: baseX + safeIndex * stepX,
    y: baseY
  };
}

export function formatNowTimeText() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

export function buildSelectedModelSections(modelKeys, stateMap) {
  return (modelKeys || [])
    .map((modelKey) => {
      const item = stateMap[modelKey];
      if (!item || !item.content) {
        return "";
      }
      return `### ${item.title || item.model}\n${item.content}`;
    })
    .filter(Boolean);
}

export function buildContextChipTitle(item, maxLength = 22) {
  const fallback = (item?.title || item?.model || "上下文").trim() || "上下文";
  const firstLine = (item?.content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
  const normalized = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^>\s+/, "")
    .trim();
  const source = normalized || fallback;
  if (source.length <= maxLength) {
    return source;
  }
  return `${source.slice(0, maxLength)}...`;
}

export function buildPromptWithSelectedContexts(basePrompt, contextItems = []) {
  const promptText = (basePrompt || "").trim();
  const sections = (contextItems || [])
    .map((ctx) => {
      if (!ctx?.content) {
        return "";
      }
      const title = (ctx.sourceTitle || ctx.title || "上下文").trim() || "上下文";
      return `### ${title}\n${ctx.content}`;
    })
    .filter(Boolean);

  if (!sections.length) {
    return promptText;
  }
  const contextText = `请结合以下上下文继续回答：\n\n${sections.join("\n\n---\n\n")}`;
  if (!promptText) {
    return contextText;
  }
  return `${promptText}\n\n${contextText}`;
}
