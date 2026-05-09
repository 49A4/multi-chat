export function parseModelTag(rawModelTag) {
  const text = (rawModelTag || "").trim();
  const sep = text.lastIndexOf("||");
  if (sep <= 0 || sep >= text.length - 2) {
    return { key: text, title: text };
  }
  const title = text.slice(0, sep).trim();
  const identifier = text.slice(sep + 2).trim();
  return {
    key: identifier || text,
    title: title || text
  };
}

export function normalizeGenerateCount(rawCount) {
  const value = Number(rawCount);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(20, Math.max(1, Math.floor(value)));
}

export function buildModelTagFromConfig(cfg, replicaIndex = 1) {
  const title = (cfg?.name || "").trim() || cfg?.modelName || "Unknown";
  const id = (cfg?.id || "").trim();
  const safeReplicaIndex = Math.max(1, Math.floor(Number(replicaIndex) || 1));
  if (safeReplicaIndex > 1) {
    if (!id) {
      return `${title} #${safeReplicaIndex}`;
    }
    return `${title} #${safeReplicaIndex}||${id}::rep${safeReplicaIndex}`;
  }
  if (!id) {
    return title;
  }
  return `${title}||${id}`;
}
