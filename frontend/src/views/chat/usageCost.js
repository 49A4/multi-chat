export const DEFAULT_USD_TO_CNY_RATE = 7;

function readList(source) {
  if (Array.isArray(source)) {
    return source;
  }
  if (Array.isArray(source?.value)) {
    return source.value;
  }
  return [];
}

function normalizeQuestionId(rawId) {
  return String(rawId || "").trim();
}

export function formatTokenUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return "";
  }

  const promptTokens = Number.isFinite(Number(usage.promptTokens)) ? Math.floor(Number(usage.promptTokens)) : null;
  const completionTokens = Number.isFinite(Number(usage.completionTokens)) ? Math.floor(Number(usage.completionTokens)) : null;
  const totalTokens = Number.isFinite(Number(usage.totalTokens)) ? Math.floor(Number(usage.totalTokens)) : null;

  if (totalTokens != null) {
    return `Token ${totalTokens}`;
  }
  if (promptTokens != null && completionTokens != null) {
    return `Token ${promptTokens}+${completionTokens}`;
  }
  if (promptTokens != null) {
    return `Token ${promptTokens}`;
  }
  if (completionTokens != null) {
    return `Token ${completionTokens}`;
  }
  return "";
}

export function createUsageCostHelpers(options = {}) {
  const {
    apiConfigs,
    modelList,
    questionNodes,
    stateMap,
    normalizeOptionalNonNegativeNumber,
    resolveConfigId,
    usdToCnyRate = DEFAULT_USD_TO_CNY_RATE
  } = options;

  function extractConfigIdFromModelTag(rawModelTag) {
    const modelTag = String(rawModelTag || "").trim();
    if (!modelTag) {
      return "";
    }
    const sep = modelTag.lastIndexOf("||");
    if (sep <= 0 || sep >= modelTag.length - 2) {
      return "";
    }
    let tail = modelTag.slice(sep + 2);
    const replicaSep = tail.indexOf("::");
    if (replicaSep >= 0) {
      tail = tail.slice(0, replicaSep);
    }
    return resolveConfigId(tail);
  }

  function resolvePricePerMillion(item, priceFieldName) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const directPrice = normalizeOptionalNonNegativeNumber(item[priceFieldName]);
    if (directPrice != null) {
      return directPrice;
    }

    const configId = extractConfigIdFromModelTag(item.sourceModel || item.model);
    if (!configId) {
      return null;
    }
    const cfg = readList(apiConfigs).find((row) => resolveConfigId(row?.id) === configId);
    if (!cfg) {
      return null;
    }
    return normalizeOptionalNonNegativeNumber(cfg?.[priceFieldName]);
  }

  function computeUsageCostUsd(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const usage = item.usage;
    if (!usage || typeof usage !== "object") {
      return null;
    }

    const promptTokens = Number.isFinite(Number(usage.promptTokens)) ? Math.floor(Number(usage.promptTokens)) : null;
    const completionTokens = Number.isFinite(Number(usage.completionTokens)) ? Math.floor(Number(usage.completionTokens)) : null;
    const totalTokens = Number.isFinite(Number(usage.totalTokens)) ? Math.floor(Number(usage.totalTokens)) : null;
    if (promptTokens == null && completionTokens == null && totalTokens == null) {
      return null;
    }

    const inputRate = resolvePricePerMillion(item, "inputPricePerMillion");
    const outputRate = resolvePricePerMillion(item, "outputPricePerMillion");
    const hasPromptTokenWithoutRate = promptTokens != null && promptTokens > 0 && inputRate == null;
    const hasCompletionTokenWithoutRate = completionTokens != null && completionTokens > 0 && outputRate == null;
    if (hasPromptTokenWithoutRate || hasCompletionTokenWithoutRate) {
      return null;
    }

    let totalCostUsd = 0;
    if (promptTokens != null && inputRate != null) {
      totalCostUsd += (promptTokens * inputRate) / 1000000;
    }
    if (completionTokens != null && outputRate != null) {
      totalCostUsd += (completionTokens * outputRate) / 1000000;
    }

    if (promptTokens == null && completionTokens == null && totalTokens != null) {
      if (inputRate == null || outputRate == null) {
        return null;
      }
      if (Math.abs(inputRate - outputRate) > 1e-9) {
        return null;
      }
      totalCostUsd += (totalTokens * inputRate) / 1000000;
    }

    return Number(totalCostUsd.toFixed(8));
  }

  function formatUsageCost(item) {
    const costUsd = computeUsageCostUsd(item);
    if (costUsd == null) {
      return "";
    }
    const costCny = Number((costUsd * usdToCnyRate).toFixed(8));
    const display = costCny >= 0.01 ? costCny.toFixed(4) : costCny.toFixed(6);
    return `¥${display}`;
  }

  function buildQuestionChildrenMap() {
    const childrenMap = new Map();
    readList(questionNodes).forEach((question) => {
      const childQuestionId = normalizeQuestionId(question?.id);
      if (!childQuestionId) {
        return;
      }
      const parentModelKey = String(question?.parentModelKey || "").trim();
      if (!parentModelKey) {
        return;
      }
      const parentQuestionId = normalizeQuestionId(stateMap?.[parentModelKey]?.questionId);
      if (!parentQuestionId) {
        return;
      }
      const children = childrenMap.get(parentQuestionId) || [];
      children.push(childQuestionId);
      childrenMap.set(parentQuestionId, children);
    });
    return childrenMap;
  }

  function buildDirectQuestionCostMap() {
    const directCostMap = new Map();
    readList(modelList).forEach((item) => {
      const ownerQuestionId = normalizeQuestionId(item?.questionId);
      if (!ownerQuestionId) {
        return;
      }
      const costUsd = computeUsageCostUsd(item);
      if (costUsd == null) {
        return;
      }
      const prev = Number(directCostMap.get(ownerQuestionId) || 0);
      directCostMap.set(ownerQuestionId, prev + costUsd);
    });
    return directCostMap;
  }

  function computeQuestionTotalCostUsd(questionId) {
    const normalizedQuestionId = normalizeQuestionId(questionId);
    if (!normalizedQuestionId) {
      return 0;
    }
    const childrenMap = buildQuestionChildrenMap();
    const directCostMap = buildDirectQuestionCostMap();

    let totalCostUsd = 0;
    const visited = new Set();
    const stack = [normalizedQuestionId];
    while (stack.length > 0) {
      const currentQuestionId = normalizeQuestionId(stack.pop());
      if (!currentQuestionId || visited.has(currentQuestionId)) {
        continue;
      }
      visited.add(currentQuestionId);
      totalCostUsd += Number(directCostMap.get(currentQuestionId) || 0);
      const childQuestionIds = childrenMap.get(currentQuestionId) || [];
      childQuestionIds.forEach((childQuestionId) => {
        if (!visited.has(childQuestionId)) {
          stack.push(childQuestionId);
        }
      });
    }

    return Number(totalCostUsd.toFixed(8));
  }

  function formatQuestionTotalCostCny(questionId) {
    const totalUsd = computeQuestionTotalCostUsd(questionId);
    const totalCny = Number((totalUsd * usdToCnyRate).toFixed(8));
    const display = totalCny >= 0.01 ? totalCny.toFixed(4) : totalCny.toFixed(6);
    return `总 ¥${display}`;
  }

  return {
    computeQuestionTotalCostUsd,
    computeUsageCostUsd,
    formatQuestionTotalCostCny,
    formatUsageCost
  };
}
