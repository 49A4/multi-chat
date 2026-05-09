export const DEFAULT_MARKDOWN_PROMPT = "展示md的所有常见语法";
export const DEFAULT_IMAGE_PROMPT = "生成一只狗";

export const TEXT_MODE = "text";
export const IMAGE_MODE = "image";

export const IMAGE_BATCH_MIN = 1;
export const IMAGE_BATCH_MAX = 8;
export const DEFAULT_IMAGE_BATCH_COUNT = 1;

export const IMAGE_ASPECT_RATIO_VALUES = Object.freeze(["1:1", "3:4", "4:3", "9:16", "16:9"]);
export const DEFAULT_IMAGE_ASPECT_RATIO = "3:4";
export const IMAGE_ASPECT_RATIO_OPTIONS = Object.freeze([
  { label: "1:1（方图）", value: "1:1" },
  { label: "3:4（竖图）", value: "3:4" },
  { label: "4:3（横图）", value: "4:3" },
  { label: "9:16（竖屏）", value: "9:16" },
  { label: "16:9（横屏）", value: "16:9" }
]);

export const IMAGE_QUALITY_VALUES = Object.freeze(["low", "medium", "high"]);
export const DEFAULT_IMAGE_QUALITY = "high";
export const IMAGE_QUALITY_OPTIONS = Object.freeze([
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" }
]);

export function normalizeGenerationMode(rawMode) {
  return String(rawMode || "")
    .trim()
    .toLowerCase() === IMAGE_MODE
    ? IMAGE_MODE
    : TEXT_MODE;
}

export function normalizeImageBatchCount(rawCount) {
  const numeric = Number(rawCount);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_IMAGE_BATCH_COUNT;
  }
  return Math.min(IMAGE_BATCH_MAX, Math.max(IMAGE_BATCH_MIN, Math.floor(numeric)));
}

export function normalizeImageAspectRatio(rawRatio) {
  const value = String(rawRatio || "").trim();
  if (!value) {
    return DEFAULT_IMAGE_ASPECT_RATIO;
  }
  if (IMAGE_ASPECT_RATIO_VALUES.includes(value)) {
    return value;
  }
  return DEFAULT_IMAGE_ASPECT_RATIO;
}

export function normalizeImageQuality(rawQuality) {
  const value = String(rawQuality || "").trim().toLowerCase();
  if (!value) {
    return DEFAULT_IMAGE_QUALITY;
  }
  if (IMAGE_QUALITY_VALUES.includes(value)) {
    return value;
  }
  return DEFAULT_IMAGE_QUALITY;
}
