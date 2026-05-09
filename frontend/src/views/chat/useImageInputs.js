import { computed, ref } from "vue";
import { ElMessage } from "element-plus";

export const MAX_REFERENCE_IMAGES = 5;
export const IMAGE_UPLOAD_TARGET_BYTES = 1800 * 1024;
export const IMAGE_UPLOAD_MAX_EDGE = 2048;
export const IMAGE_UPLOAD_MIN_EDGE = 640;
export const IMAGE_UPLOAD_SCALE_STEP = 0.86;
export const IMAGE_UPLOAD_MAX_ATTEMPTS = 8;
export const IMAGE_UPLOAD_PNG_FALLBACK_QUALITY = 0.88;
export const IMAGE_UPLOAD_SKIP_MIME_TYPES = new Set(["image/gif", "image/svg+xml", "image/x-icon"]);

export function normalizeImageInputPayload(rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    return null;
  }
  const mimeType = String(rawInput.mimeType || "").trim();
  const data = String(rawInput.data || "").trim();
  if (!mimeType || !data) {
    return null;
  }
  const order = Number(rawInput.order);
  const normalizedOrder = Number.isFinite(order) && order > 0 ? Math.floor(order) : null;
  const role = String(rawInput.role || "").trim();
  const name = String(rawInput.name || "").trim();
  return {
    mimeType,
    data,
    order: normalizedOrder,
    role,
    name
  };
}

function inferImageInputRole(index, rawRole = "") {
  const normalizedRole = String(rawRole || "").trim();
  if (normalizedRole) {
    return normalizedRole;
  }
  if (index === 0) {
    return "target";
  }
  if (index === 1) {
    return "face_reference";
  }
  return "reference";
}

export function buildDisplayImageInputFromPayload(rawInput = {}) {
  const normalized = normalizeImageInputPayload(rawInput);
  if (!normalized) {
    return null;
  }
  const name = String(rawInput?.name || "image").trim() || "image";
  const sizeText = String(rawInput?.sizeText || "").trim();
  const rawDataUrl = String(rawInput?.dataUrl || "").trim();
  const dataUrl = rawDataUrl || `data:${normalized.mimeType};base64,${normalized.data}`;
  return {
    name,
    order: Number.isFinite(Number(rawInput?.order)) ? Math.max(1, Math.floor(Number(rawInput.order))) : null,
    role: String(rawInput?.role || "").trim(),
    sizeText,
    mimeType: normalized.mimeType,
    data: normalized.data,
    dataUrl
  };
}

export function cloneImageInputPayload(rawInput) {
  const normalized = normalizeImageInputPayload(rawInput);
  if (!normalized) {
    return null;
  }
  return {
    mimeType: normalized.mimeType,
    data: normalized.data,
    order: normalized.order,
    role: normalized.role,
    name: normalized.name
  };
}

export function normalizeImageInputPayloadList(rawInputs) {
  if (!Array.isArray(rawInputs)) {
    return [];
  }
  const dedup = new Set();
  const normalized = [];
  rawInputs.forEach((rawInput, index) => {
    const displayInput = buildDisplayImageInputFromPayload(rawInput);
    if (!displayInput) {
      return;
    }
    const dedupKey = `${displayInput.mimeType}::${displayInput.data}`;
    if (dedup.has(dedupKey)) {
      return;
    }
    dedup.add(dedupKey);
    const order = Number.isFinite(Number(displayInput.order)) ? Math.max(1, Math.floor(Number(displayInput.order))) : normalized.length + 1;
    normalized.push({
      ...displayInput,
      order,
      role: inferImageInputRole(index, displayInput.role)
    });
  });
  return normalized.slice(0, MAX_REFERENCE_IMAGES).map((item, index) => ({
    ...item,
    order: index + 1,
    role: inferImageInputRole(index, item.role)
  }));
}

export function cloneImageInputPayloadList(rawInputs) {
  return normalizeImageInputPayloadList(rawInputs).map((item) => ({
    name: item.name,
    order: item.order,
    role: item.role,
    sizeText: item.sizeText,
    mimeType: item.mimeType,
    data: item.data,
    dataUrl: item.dataUrl
  }));
}

function formatFileSize(bytes) {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  if (numeric < 1024) {
    return `${Math.round(numeric)} B`;
  }
  if (numeric < 1024 * 1024) {
    return `${(numeric / 1024).toFixed(1)} KB`;
  }
  return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function estimateBase64Bytes(base64Text) {
  const text = String(base64Text || "").trim();
  if (!text) {
    return 0;
  }
  const padding = text.endsWith("==") ? 2 : (text.endsWith("=") ? 1 : 0);
  return Math.max(0, Math.floor((text.length * 3) / 4) - padding);
}

function canCompressImageMimeType(mimeType) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (!normalized.startsWith("image/")) {
    return false;
  }
  if (IMAGE_UPLOAD_SKIP_MIME_TYPES.has(normalized)) {
    return false;
  }
  return true;
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败，请换一张图片重试"));
    image.src = dataUrl;
  });
}

function renderCompressedImageDataUrl(image, mimeType, width, height, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("浏览器不支持图片压缩上下文");
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  if (normalizedMimeType === "image/jpeg" || normalizedMimeType === "image/jpg" || normalizedMimeType === "image/webp") {
    return canvas.toDataURL(normalizedMimeType === "image/jpg" ? "image/jpeg" : normalizedMimeType, quality);
  }
  return canvas.toDataURL(normalizedMimeType || "image/png");
}

async function compressImagePayloadIfNeeded(payload) {
  const normalized = normalizeImageDataUrlPayload(payload?.dataUrl || "");
  if (!normalized) {
    return payload;
  }

  const mimeType = String(normalized.mimeType || "").trim().toLowerCase();
  const originalBytes = estimateBase64Bytes(normalized.data);
  if (!canCompressImageMimeType(mimeType) || originalBytes <= IMAGE_UPLOAD_TARGET_BYTES) {
    return {
      ...payload,
      mimeType: normalized.mimeType,
      data: normalized.data,
      dataUrl: normalized.dataUrl,
      sizeBytes: originalBytes,
      compressed: false
    };
  }

  const image = await loadImageElement(normalized.dataUrl);
  const naturalWidth = Math.max(1, Number(image.naturalWidth) || 1);
  const naturalHeight = Math.max(1, Number(image.naturalHeight) || 1);
  const maxEdge = Math.max(naturalWidth, naturalHeight);
  const initialScale = maxEdge > IMAGE_UPLOAD_MAX_EDGE ? (IMAGE_UPLOAD_MAX_EDGE / maxEdge) : 1;

  let width = Math.max(1, Math.round(naturalWidth * initialScale));
  let height = Math.max(1, Math.round(naturalHeight * initialScale));
  let bestPayload = {
    mimeType: normalized.mimeType,
    data: normalized.data,
    dataUrl: normalized.dataUrl,
    sizeBytes: originalBytes
  };

  for (let attempt = 0; attempt < IMAGE_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    const encodedDataUrl = renderCompressedImageDataUrl(image, normalized.mimeType, width, height, 0.9);
    const parsed = normalizeImageDataUrlPayload(encodedDataUrl);
    if (!parsed) {
      break;
    }
    const bytes = estimateBase64Bytes(parsed.data);
    if (bytes < bestPayload.sizeBytes) {
      bestPayload = {
        mimeType: parsed.mimeType,
        data: parsed.data,
        dataUrl: parsed.dataUrl,
        sizeBytes: bytes
      };
    }
    if (bytes <= IMAGE_UPLOAD_TARGET_BYTES) {
      break;
    }

    const nextWidth = Math.max(IMAGE_UPLOAD_MIN_EDGE, Math.round(width * IMAGE_UPLOAD_SCALE_STEP));
    const nextHeight = Math.max(IMAGE_UPLOAD_MIN_EDGE, Math.round(height * IMAGE_UPLOAD_SCALE_STEP));
    if (nextWidth === width && nextHeight === height) {
      break;
    }
    width = nextWidth;
    height = nextHeight;
  }

  if (bestPayload.sizeBytes > IMAGE_UPLOAD_TARGET_BYTES && mimeType === "image/png") {
    const jpegDataUrl = renderCompressedImageDataUrl(image, "image/jpeg", width, height, IMAGE_UPLOAD_PNG_FALLBACK_QUALITY);
    const jpegPayload = normalizeImageDataUrlPayload(jpegDataUrl);
    if (jpegPayload) {
      const jpegBytes = estimateBase64Bytes(jpegPayload.data);
      if (jpegBytes < bestPayload.sizeBytes) {
        bestPayload = {
          mimeType: jpegPayload.mimeType,
          data: jpegPayload.data,
          dataUrl: jpegPayload.dataUrl,
          sizeBytes: jpegBytes
        };
      }
    }
  }

  return {
    ...payload,
    mimeType: bestPayload.mimeType,
    data: bestPayload.data,
    dataUrl: bestPayload.dataUrl,
    sizeBytes: bestPayload.sizeBytes,
    compressed: bestPayload.sizeBytes < originalBytes
  };
}

function extractMimeAndBase64(dataUrl) {
  const text = String(dataUrl || "").trim();
  const match = text.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1].trim(),
    data: match[2].trim()
  };
}

export function normalizeImageDataUrlPayload(dataUrl) {
  const parsed = extractMimeAndBase64(dataUrl);
  const mimeType = String(parsed?.mimeType || "").trim();
  const data = String(parsed?.data || "").trim();
  if (!mimeType.startsWith("image/") || !data) {
    return null;
  }
  return {
    mimeType,
    data,
    dataUrl: `data:${mimeType};base64,${data}`
  };
}

export function extractFirstImageSourceFromHtml(html) {
  const raw = String(html || "").trim();
  if (!raw) {
    return "";
  }
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${raw}</div>`, "text/html");
      const source = String(doc.body.querySelector("img")?.getAttribute("src") || "").trim();
      if (source) {
        return source;
      }
    } catch {
      // fallback to regex below
    }
  }
  const match = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
  return String(match?.[1] || "").trim();
}

export function extractFirstMarkdownImageSource(markdownText) {
  const raw = String(markdownText || "").trim();
  if (!raw) {
    return "";
  }
  const match = raw.match(/!\[[^\]]*\]\(([^)\s]+(?:\s+["'][^"']*["'])?)\)/);
  if (!match) {
    return "";
  }
  const source = String(match[1] || "").trim();
  return source.split(/\s+/)[0].trim();
}

function isImageLikeFile(file) {
  if (!file) {
    return false;
  }
  const mimeType = String(file.type || "")
    .trim()
    .toLowerCase();
  if (mimeType.startsWith("image/")) {
    return true;
  }
  const name = String(file.name || "")
    .trim()
    .toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic|heif)$/.test(name);
}

function guessMimeTypeByName(fileName) {
  const name = String(fileName || "")
    .trim()
    .toLowerCase();
  if (name.endsWith(".png")) {
    return "image/png";
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (name.endsWith(".webp")) {
    return "image/webp";
  }
  if (name.endsWith(".gif")) {
    return "image/gif";
  }
  if (name.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (name.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (name.endsWith(".ico")) {
    return "image/x-icon";
  }
  if (name.endsWith(".avif")) {
    return "image/avif";
  }
  if (name.endsWith(".heic")) {
    return "image/heic";
  }
  if (name.endsWith(".heif")) {
    return "image/heif";
  }
  return "";
}

function extractImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) {
    return [];
  }
  const files = Array.from(dataTransfer.files || []).filter((file) => isImageLikeFile(file));
  if (files.length > 0) {
    return files;
  }

  const items = Array.from(dataTransfer.items || []);
  const resolvedFiles = [];
  for (const item of items) {
    if (item?.kind !== "file") {
      continue;
    }
    const file = item.getAsFile?.();
    if (file && isImageLikeFile(file)) {
      resolvedFiles.push(file);
    }
  }
  return resolvedFiles;
}

function dataTransferHasFiles(dataTransfer) {
  if (!dataTransfer || !dataTransfer.types) {
    return false;
  }
  const types = dataTransfer.types;
  if (typeof types.includes === "function") {
    return types.includes("Files");
  }
  if (typeof types.contains === "function") {
    return types.contains("Files");
  }
  return Array.from(types).includes("Files");
}

export function useImageInputs(options = {}) {
  const {
    generationMode,
    imageMode,
    normalizeGenerationMode,
    saveChatUiState = () => {},
    openInputPanel = () => {},
    stateMap = {}
  } = options;

  const imageInputRef = ref(null);
  const selectedImageInputs = ref([]);
  const selectedImageInput = ref(null);
  const selectedImageSourceModel = ref("");
  const imagePreviewDragFromIndex = ref(-1);
  const imagePreviewDragOverIndex = ref(-1);
  const imageDropActive = ref(false);
  let imageDragCounter = 0;

  const selectedImagePreviewList = computed(() => {
    return selectedImageInputs.value
      .map((input, index) => {
        const dataUrl = String(input?.dataUrl || "").trim();
        const src = dataUrl || (input?.mimeType && input?.data ? `data:${input.mimeType};base64,${input.data}` : "");
        if (!src) {
          return null;
        }
        const normalized = normalizeImageInputPayload(input);
        return {
          src,
          name: String(input?.name || `参考图 ${index + 1}`).trim() || `参考图 ${index + 1}`,
          sizeText: String(input?.sizeText || "").trim(),
          mimeType: normalized?.mimeType || "",
          data: normalized?.data || ""
        };
      })
      .filter(Boolean);
  });

  function setSelectedImageInputPayload(payload, setOptions = {}) {
    const displayInput = buildDisplayImageInputFromPayload(payload);
    if (!displayInput) {
      return false;
    }
    selectedImageInputs.value = [displayInput];
    selectedImageInput.value = displayInput;
    selectedImageSourceModel.value = String(setOptions.sourceModel || "").trim();
    saveChatUiState();
    return true;
  }

  function addSelectedImageInputPayloadList(payloads, addOptions = {}) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      return false;
    }
    const current = cloneImageInputPayloadList(selectedImageInputs.value);
    const incoming = normalizeImageInputPayloadList(payloads);
    if (!incoming.length) {
      return false;
    }

    const dedup = new Set(current.map((item) => `${item.mimeType}::${item.data}`));
    incoming.forEach((item) => {
      const dedupKey = `${item.mimeType}::${item.data}`;
      if (dedup.has(dedupKey)) {
        return;
      }
      dedup.add(dedupKey);
      current.push(item);
    });

    const limited = current.slice(0, MAX_REFERENCE_IMAGES);
    selectedImageInputs.value = limited;
    selectedImageInput.value = limited[0] || null;
    selectedImageSourceModel.value = String(addOptions.sourceModel || selectedImageSourceModel.value || "").trim();
    saveChatUiState();
    return true;
  }

  function clearImagePreviewDragState() {
    imagePreviewDragFromIndex.value = -1;
    imagePreviewDragOverIndex.value = -1;
  }

  function normalizeImagePreviewIndex(rawIndex, length) {
    const safeLength = Number(length);
    const numericIndex = Number(rawIndex);
    if (!Number.isFinite(safeLength) || safeLength <= 0 || !Number.isFinite(numericIndex)) {
      return -1;
    }
    const safeIndex = Math.floor(numericIndex);
    if (safeIndex < 0 || safeIndex >= safeLength) {
      return -1;
    }
    return safeIndex;
  }

  function reorderSelectedImageInputs(fromIndex, toIndex) {
    const list = cloneImageInputPayloadList(selectedImageInputs.value);
    const sourceIndex = normalizeImagePreviewIndex(fromIndex, list.length);
    const targetIndex = normalizeImagePreviewIndex(toIndex, list.length);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return false;
    }

    const [movedItem] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, movedItem);
    selectedImageInputs.value = list;
    selectedImageInput.value = list[0] || null;
    saveChatUiState();
    return true;
  }

  function onImagePreviewDragStart(event, index) {
    const safeIndex = normalizeImagePreviewIndex(index, selectedImagePreviewList.value.length);
    if (safeIndex < 0) {
      clearImagePreviewDragState();
      return;
    }
    event?.stopPropagation?.();
    imagePreviewDragFromIndex.value = safeIndex;
    imagePreviewDragOverIndex.value = safeIndex;

    const dataTransfer = event?.dataTransfer;
    if (!dataTransfer) {
      return;
    }
    dataTransfer.effectAllowed = "move";
    try {
      dataTransfer.setData("text/plain", String(safeIndex));
    } catch {
      // ignore browser-specific failures
    }
  }

  function isImageMode() {
    return normalizeGenerationMode(generationMode?.value) === imageMode;
  }

  function onImagePreviewDragEnter(event, index) {
    if (dataTransferHasFiles(event?.dataTransfer)) {
      event?.stopPropagation?.();
      if (event?.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      if (isImageMode()) {
        imageDropActive.value = true;
      }
      return;
    }
    const safeIndex = normalizeImagePreviewIndex(index, selectedImagePreviewList.value.length);
    if (safeIndex < 0) {
      return;
    }
    event?.stopPropagation?.();
    imagePreviewDragOverIndex.value = safeIndex;
    if (event?.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function onImagePreviewDragOver(event, index) {
    if (dataTransferHasFiles(event?.dataTransfer)) {
      event?.stopPropagation?.();
      if (event?.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      if (isImageMode()) {
        imageDropActive.value = true;
      }
      return;
    }
    const safeIndex = normalizeImagePreviewIndex(index, selectedImagePreviewList.value.length);
    if (safeIndex < 0) {
      return;
    }
    event?.stopPropagation?.();
    imagePreviewDragOverIndex.value = safeIndex;
    if (event?.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  async function onImagePreviewDrop(event, index) {
    event?.stopPropagation?.();
    const files = extractImageFilesFromDataTransfer(event?.dataTransfer);
    if (files.length > 0) {
      const ok = await setImageInputsFromFiles(files);
      if (!ok && selectedImageInputs.value.length === 0) {
        clearImageInput();
      }
      resetImageDragState();
      clearImagePreviewDragState();
      return;
    }

    const targetIndex = normalizeImagePreviewIndex(index, selectedImagePreviewList.value.length);
    if (targetIndex < 0) {
      clearImagePreviewDragState();
      return;
    }

    let sourceIndex = imagePreviewDragFromIndex.value;
    const dataTransfer = event?.dataTransfer;
    if (dataTransfer) {
      try {
        const parsed = normalizeImagePreviewIndex(
          dataTransfer.getData("text/plain"),
          selectedImagePreviewList.value.length
        );
        if (parsed >= 0) {
          sourceIndex = parsed;
        }
      } catch {
        // ignore browser-specific failures
      }
    }

    reorderSelectedImageInputs(sourceIndex, targetIndex);
    clearImagePreviewDragState();
  }

  function onImagePreviewGridDragOver(event) {
    if (dataTransferHasFiles(event?.dataTransfer)) {
      event?.stopPropagation?.();
      if (event?.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      if (isImageMode()) {
        imageDropActive.value = true;
      }
      return;
    }
    if (imagePreviewDragFromIndex.value < 0) {
      return;
    }
    event?.stopPropagation?.();
    if (event?.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  async function onImagePreviewGridDrop(event) {
    event?.stopPropagation?.();
    const files = extractImageFilesFromDataTransfer(event?.dataTransfer);
    if (files.length > 0) {
      const ok = await setImageInputsFromFiles(files);
      if (!ok && selectedImageInputs.value.length === 0) {
        clearImageInput();
      }
      resetImageDragState();
      clearImagePreviewDragState();
      return;
    }

    const listLength = selectedImagePreviewList.value.length;
    if (listLength <= 1) {
      clearImagePreviewDragState();
      return;
    }
    const sourceIndex = normalizeImagePreviewIndex(imagePreviewDragFromIndex.value, listLength);
    if (sourceIndex < 0) {
      clearImagePreviewDragState();
      return;
    }
    const targetIndex = listLength - 1;
    reorderSelectedImageInputs(sourceIndex, targetIndex);
    clearImagePreviewDragState();
  }

  function onImagePreviewDragEnd() {
    clearImagePreviewDragState();
  }

  function removeSelectedImageInput(index) {
    const safeIndex = Number(index);
    if (!Number.isFinite(safeIndex)) {
      return;
    }
    const list = cloneImageInputPayloadList(selectedImageInputs.value);
    if (safeIndex < 0 || safeIndex >= list.length) {
      return;
    }
    list.splice(safeIndex, 1);
    selectedImageInputs.value = list;
    selectedImageInput.value = list[0] || null;
    if (!list.length) {
      selectedImageSourceModel.value = "";
    }
    saveChatUiState();
  }

  function extractFirstImageSourceFromModel(item) {
    if (!item || typeof item !== "object") {
      return "";
    }
    const fromRendered = extractFirstImageSourceFromHtml(item.renderedHtml);
    if (fromRendered) {
      return fromRendered;
    }
    return extractFirstMarkdownImageSource(item.content);
  }

  async function applyModelImageAsImageInput(modelKey) {
    const item = stateMap[modelKey];
    if (!item) {
      return;
    }
    const imageSource = extractFirstImageSourceFromModel(item);
    if (!imageSource) {
      return;
    }

    try {
      let payload = normalizeImageDataUrlPayload(imageSource);
      let sizeText = "";
      let fallbackSizeBytes = 0;
      if (!payload) {
        const response = await fetch(imageSource);
        if (!response.ok) {
          throw new Error(`下载参考图失败（HTTP ${response.status}）`);
        }
        const blob = await response.blob();
        fallbackSizeBytes = blob.size;
        const dataUrl = await readFileAsDataUrl(blob);
        payload = normalizeImageDataUrlPayload(dataUrl);
        if (!payload) {
          throw new Error("模块图片解析失败，请换一张图重试");
        }
      }

      const processed = await compressImagePayloadIfNeeded({
        mimeType: payload.mimeType,
        data: payload.data,
        dataUrl: payload.dataUrl
      });
      if (processed && processed.compressed) {
        ElMessage.info("已自动压缩该参考图以适配上传限制");
      }
      const finalMimeType = String(processed?.mimeType || payload.mimeType || "").trim();
      const finalData = String(processed?.data || payload.data || "").trim();
      if (!finalMimeType.startsWith("image/") || !finalData) {
        throw new Error("模块图片压缩失败，请换一张图重试");
      }
      sizeText = formatFileSize(processed?.sizeBytes || fallbackSizeBytes);

      const alreadySelected = selectedImageInputs.value.some(
        (selectedItem) =>
          String(selectedItem?.mimeType || "").trim() === finalMimeType &&
          String(selectedItem?.data || "").trim() === finalData
      );
      generationMode.value = imageMode;
      addSelectedImageInputPayloadList([
        {
          name: `${item.title || item.model}-参考图`,
          sizeText,
          mimeType: finalMimeType,
          data: finalData
        }
      ], { sourceModel: modelKey });
      openInputPanel();
      if (!alreadySelected) {
        ElMessage.success("已将该模块图片加入参考图");
      }
    } catch (error) {
      ElMessage.warning(error?.message || "加载模块图片失败");
    }
  }

  function resetImageDragState() {
    imageDragCounter = 0;
    imageDropActive.value = false;
  }

  async function setImageInputsFromFiles(files, setOptions = {}) {
    const replace = setOptions.replace === true;
    const sourceModel = String(setOptions.sourceModel || "").trim();
    const candidates = Array.isArray(files) ? files.filter(Boolean) : [];
    if (candidates.length === 0) {
      return false;
    }

    const validFiles = candidates.filter((file) => isImageLikeFile(file));
    if (validFiles.length === 0) {
      ElMessage.warning("请选择图片文件");
      return false;
    }

    const remainSlots = Math.max(
      0,
      MAX_REFERENCE_IMAGES - (replace ? 0 : selectedImageInputs.value.length)
    );
    if (remainSlots <= 0) {
      ElMessage.warning(`参考图最多支持 ${MAX_REFERENCE_IMAGES} 张`);
      return false;
    }

    const limitedFiles = validFiles.slice(0, remainSlots);
    const payloads = [];
    let compressedCount = 0;

    for (const file of limitedFiles) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const parsed = normalizeImageDataUrlPayload(dataUrl);
        const fallbackMimeType = String(file.type || "").trim() || guessMimeTypeByName(file.name);
        const mimeType = String(parsed?.mimeType || fallbackMimeType || "").trim();
        const base64Data = String(parsed?.data || "").trim();
        if (!mimeType.startsWith("image/") || !base64Data) {
          continue;
        }
        const processed = await compressImagePayloadIfNeeded({
          name: file.name || "image",
          mimeType,
          data: base64Data,
          dataUrl: `data:${mimeType};base64,${base64Data}`
        });
        if (!processed || !processed.mimeType || !processed.data) {
          continue;
        }
        if (processed.compressed) {
          compressedCount += 1;
        }
        payloads.push({
          name: file.name || "image",
          sizeText: formatFileSize(processed.sizeBytes || file.size),
          mimeType: processed.mimeType,
          data: processed.data
        });
      } catch {
        // ignore single file parse failures
      }
    }

    if (payloads.length === 0) {
      ElMessage.warning("图片解析失败，请换一张图片重试");
      return false;
    }

    if (replace) {
      selectedImageInputs.value = normalizeImageInputPayloadList(payloads);
      selectedImageInput.value = selectedImageInputs.value[0] || null;
      selectedImageSourceModel.value = sourceModel;
      if (compressedCount > 0) {
        ElMessage.info(`已自动压缩 ${compressedCount} 张参考图以适配上传限制`);
      }
      saveChatUiState();
      return true;
    }

    const added = addSelectedImageInputPayloadList(payloads, { sourceModel });
    if (added && compressedCount > 0) {
      ElMessage.info(`已自动压缩 ${compressedCount} 张参考图以适配上传限制`);
    }
    if (added && validFiles.length > remainSlots) {
      ElMessage.info(`最多保留 ${MAX_REFERENCE_IMAGES} 张，已自动截断`);
    }
    return added;
  }

  async function onImageInputChange(event) {
    const files = Array.from(event?.target?.files || []).filter(Boolean);
    if (!files.length) {
      return;
    }
    try {
      const ok = await setImageInputsFromFiles(files);
      if (!ok && selectedImageInputs.value.length === 0) {
        clearImageInput();
      }
    } finally {
      if (imageInputRef.value) {
        imageInputRef.value.value = "";
      }
    }
  }

  function onImageDragEnter(event) {
    const hasFiles = dataTransferHasFiles(event?.dataTransfer);
    if (!hasFiles) {
      return;
    }
    event.preventDefault();
    if (!isImageMode()) {
      return;
    }
    imageDragCounter += 1;
    imageDropActive.value = true;
  }

  function onImageDragOver(event) {
    const hasFiles = dataTransferHasFiles(event?.dataTransfer);
    if (!hasFiles) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    if (!isImageMode()) {
      return;
    }
    if (!imageDropActive.value) {
      imageDropActive.value = true;
    }
  }

  function onImageDragLeave(event) {
    const hasFiles = dataTransferHasFiles(event?.dataTransfer);
    if (!hasFiles) {
      return;
    }
    if (imageDragCounter > 0) {
      imageDragCounter -= 1;
    }
    if (imageDragCounter <= 0) {
      resetImageDragState();
    }
  }

  async function onImageDrop(event) {
    const hasFiles = dataTransferHasFiles(event?.dataTransfer);
    if (hasFiles) {
      event.preventDefault();
    }
    const files = extractImageFilesFromDataTransfer(event?.dataTransfer);
    resetImageDragState();
    if (!isImageMode()) {
      return;
    }
    if (!files.length) {
      if (event?.dataTransfer?.files?.length) {
        ElMessage.warning("仅支持拖拽图片文件");
      }
      return;
    }
    const ok = await setImageInputsFromFiles(files);
    if (!ok && selectedImageInputs.value.length === 0) {
      clearImageInput();
    }
  }

  async function onInputCardPaste(event) {
    if (!isImageMode()) {
      return;
    }
    const files = extractImageFilesFromDataTransfer(event?.clipboardData);
    if (!files.length) {
      return;
    }
    event.preventDefault();
    const ok = await setImageInputsFromFiles(files);
    if (!ok && selectedImageInputs.value.length === 0) {
      clearImageInput();
    }
  }

  function clearImageInput() {
    resetImageDragState();
    clearImagePreviewDragState();
    selectedImageInputs.value = [];
    selectedImageInput.value = null;
    selectedImageSourceModel.value = "";
    if (imageInputRef.value) {
      imageInputRef.value.value = "";
    }
    saveChatUiState();
  }

  return {
    imageInputRef,
    selectedImageInputs,
    selectedImageInput,
    selectedImageSourceModel,
    imagePreviewDragFromIndex,
    imagePreviewDragOverIndex,
    imageDropActive,
    selectedImagePreviewList,
    setSelectedImageInputPayload,
    addSelectedImageInputPayloadList,
    clearImagePreviewDragState,
    reorderSelectedImageInputs,
    onImagePreviewDragStart,
    onImagePreviewDragEnter,
    onImagePreviewDragOver,
    onImagePreviewDrop,
    onImagePreviewGridDragOver,
    onImagePreviewGridDrop,
    onImagePreviewDragEnd,
    removeSelectedImageInput,
    applyModelImageAsImageInput,
    resetImageDragState,
    setImageInputsFromFiles,
    onImageInputChange,
    onImageDragEnter,
    onImageDragOver,
    onImageDragLeave,
    onImageDrop,
    onInputCardPaste,
    clearImageInput
  };
}
