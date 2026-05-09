import { computed, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { createConfig, deleteConfig, fetchConfigs, toggleConfig, updateConfig } from "../../api/configs";

export const API_TYPE_TEXT = "text";
export const API_TYPE_IMAGE = "image";

export function clampNumber(rawValue, min, max, fallback) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

export function normalizeOptionalNonNegativeNumber(rawValue, precision = 6) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Number(Math.max(0, value).toFixed(precision));
}

export function resolveConfigId(rawId) {
  const text = String(rawId || "").trim();
  if (!text) {
    return "";
  }
  const match = text.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (match && match[0]) {
    return match[0];
  }
  return text;
}

export function normalizeModelNameForCompatibility(rawModelName) {
  const modelName = String(rawModelName || "").trim();
  if (!modelName) {
    return "";
  }
  if (modelName.toLowerCase() === "gpt-image-2") {
    return "gpt-image-2-all";
  }
  return modelName;
}

export function normalizeApiType(rawType, modelName = "") {
  const value = String(rawType || "")
    .trim()
    .toLowerCase();
  const normalizedModelName = normalizeModelNameForCompatibility(modelName).toLowerCase();

  if (normalizedModelName === "gpt-image-2" || normalizedModelName.startsWith("gpt-image-")) {
    return API_TYPE_IMAGE;
  }
  if (value === API_TYPE_IMAGE) {
    return API_TYPE_IMAGE;
  }
  if (value === API_TYPE_TEXT) {
    return API_TYPE_TEXT;
  }
  if (
    normalizedModelName.includes("image") ||
    normalizedModelName.startsWith("wan2.") ||
    normalizedModelName.startsWith("wan-")
  ) {
    return API_TYPE_IMAGE;
  }
  return API_TYPE_TEXT;
}

export function createDefaultSidebarConfigForm(apiType = API_TYPE_TEXT) {
  return {
    name: "",
    baseUrl: "",
    apiKey: "",
    modelName: "",
    apiType: normalizeApiType(apiType),
    generateCount: 1,
    enabled: true,
    maxTokens: 2048,
    temperature: 0.7,
    inputPricePerMillion: null,
    outputPricePerMillion: null
  };
}

export function supportsReferenceImageEditing(config) {
  if (!config || typeof config !== "object") {
    return false;
  }
  const modelName = String(config.modelName || "")
    .trim()
    .toLowerCase();
  if (!modelName) {
    return false;
  }
  if (modelName.startsWith("gpt-image-2")) {
    return true;
  }
  const baseUrl = String(config.baseUrl || "")
    .trim()
    .toLowerCase();
  if (!baseUrl) {
    return false;
  }
  const supportsApiYiNanoBanana =
    baseUrl.includes("apiyi") &&
    (modelName.includes("nanobanana") || modelName.includes("gemini-3.1-flash-image-preview"));
  if (supportsApiYiNanoBanana) {
    return true;
  }
  const supportsDashScopeQwenEdit =
    (baseUrl.includes("dashscope") || baseUrl.includes("aliyuncs.com")) &&
    (modelName.includes("qwen-image-edit") || modelName.startsWith("qwen-image-2.0"));
  return supportsDashScopeQwenEdit;
}

export function requiresReferenceImage(config) {
  if (!config || typeof config !== "object") {
    return false;
  }
  const modelName = String(config.modelName || "")
    .trim()
    .toLowerCase();
  if (!modelName) {
    return false;
  }
  return modelName.includes("qwen-image-edit");
}

export function useApiConfigs(options = {}) {
  const { normalizeGenerateCount } = options;
  const safeNormalizeGenerateCount = typeof normalizeGenerateCount === "function"
    ? normalizeGenerateCount
    : (value) => Math.max(1, Math.floor(Number(value) || 1));

  const apiConfigs = ref([]);
  const sidebarApiView = ref(API_TYPE_TEXT);
  const sidebarConfigEditorVisible = ref(false);
  const sidebarConfigSaving = ref(false);
  const sidebarConfigDeleting = ref(false);
  const sidebarConfigTogglePending = reactive({});
  const sidebarEditingConfigId = ref("");
  const sidebarConfigForm = reactive(createDefaultSidebarConfigForm());

  const textApiCount = computed(
    () => apiConfigs.value.filter((cfg) => cfg.apiType === API_TYPE_TEXT).length
  );
  const imageApiCount = computed(
    () => apiConfigs.value.filter((cfg) => cfg.apiType === API_TYPE_IMAGE).length
  );
  const filteredApiConfigs = computed(() =>
    apiConfigs.value.filter((cfg) => cfg.apiType === sidebarApiView.value)
  );
  const sidebarApiViewLabel = computed(() =>
    sidebarApiView.value === API_TYPE_IMAGE ? "图片" : "文字"
  );

  function normalizeSidebarConfigRecord(rawConfig = {}) {
    const modelName = normalizeModelNameForCompatibility(rawConfig?.modelName);
    return {
      ...rawConfig,
      id: resolveConfigId(rawConfig?.id),
      modelName,
      apiType: normalizeApiType(rawConfig?.apiType, modelName),
      generateCount: safeNormalizeGenerateCount(rawConfig?.generateCount),
      enabled: rawConfig?.enabled !== false,
      inputPricePerMillion: normalizeOptionalNonNegativeNumber(rawConfig?.inputPricePerMillion),
      outputPricePerMillion: normalizeOptionalNonNegativeNumber(rawConfig?.outputPricePerMillion)
    };
  }

  function switchSidebarApiView(type) {
    sidebarApiView.value = type === API_TYPE_IMAGE ? API_TYPE_IMAGE : API_TYPE_TEXT;
  }

  function getSidebarApiViewForGenerationMode(mode, imageMode = API_TYPE_IMAGE) {
    return String(mode || "").trim().toLowerCase() === imageMode ? API_TYPE_IMAGE : API_TYPE_TEXT;
  }

  function syncSidebarApiViewWithGenerationMode(mode, imageMode = API_TYPE_IMAGE) {
    const expectedView = getSidebarApiViewForGenerationMode(mode, imageMode);
    if (sidebarApiView.value !== expectedView) {
      sidebarApiView.value = expectedView;
    }
  }

  function applySidebarConfigForm(payload = {}) {
    const merged = Object.assign(
      {},
      createDefaultSidebarConfigForm(payload?.apiType || sidebarApiView.value),
      payload || {}
    );
    merged.name = String(merged.name || "").trim();
    merged.baseUrl = String(merged.baseUrl || "").trim();
    merged.apiKey = String(merged.apiKey || "").trim();
    merged.modelName = normalizeModelNameForCompatibility(merged.modelName);
    merged.apiType = normalizeApiType(merged.apiType, merged.modelName);
    merged.generateCount = safeNormalizeGenerateCount(merged.generateCount);
    merged.enabled = merged.enabled !== false;
    merged.maxTokens = Math.round(clampNumber(merged.maxTokens, 1, 16384, 2048));
    merged.temperature = Number(clampNumber(merged.temperature, 0, 2, 0.7).toFixed(1));
    merged.inputPricePerMillion = normalizeOptionalNonNegativeNumber(merged.inputPricePerMillion);
    merged.outputPricePerMillion = normalizeOptionalNonNegativeNumber(merged.outputPricePerMillion);
    Object.assign(sidebarConfigForm, merged);
  }

  function syncSidebarEditorWithConfigs() {
    if (!sidebarConfigEditorVisible.value || !sidebarEditingConfigId.value) {
      return;
    }
    const currentEditingId = resolveConfigId(sidebarEditingConfigId.value);
    const target = apiConfigs.value.find((cfg) => resolveConfigId(cfg?.id) === currentEditingId);
    if (!target) {
      closeSidebarConfigEditor();
      return;
    }
    applySidebarConfigForm(target);
    sidebarApiView.value = normalizeApiType(target.apiType, target.modelName);
  }

  function upsertSidebarConfigRecord(rawConfig = {}) {
    const normalized = normalizeSidebarConfigRecord(rawConfig);
    const configId = resolveConfigId(normalized?.id);
    if (!configId) {
      return;
    }
    const index = apiConfigs.value.findIndex((cfg) => resolveConfigId(cfg?.id) === configId);
    if (index >= 0) {
      apiConfigs.value.splice(index, 1, {
        ...apiConfigs.value[index],
        ...normalized
      });
    } else {
      apiConfigs.value.push(normalized);
    }
    syncSidebarEditorWithConfigs();
  }

  function setSidebarConfigEnabled(configId, enabled) {
    const id = resolveConfigId(configId);
    if (!id) {
      return;
    }
    const index = apiConfigs.value.findIndex((cfg) => resolveConfigId(cfg?.id) === id);
    if (index < 0) {
      return;
    }
    apiConfigs.value.splice(index, 1, {
      ...apiConfigs.value[index],
      enabled: enabled !== false
    });
    syncSidebarEditorWithConfigs();
  }

  async function loadConfigs() {
    try {
      const list = await fetchConfigs();
      apiConfigs.value = Array.isArray(list)
        ? list.map((cfg) => normalizeSidebarConfigRecord(cfg))
        : [];
      syncSidebarEditorWithConfigs();
    } catch (error) {
      ElMessage.error(error.message || "加载配置失败");
    }
  }

  function onSidebarApiRowClick(row) {
    openSidebarEditForm(row);
  }

  function openSidebarCreateForm() {
    sidebarEditingConfigId.value = "";
    applySidebarConfigForm(createDefaultSidebarConfigForm(sidebarApiView.value));
    sidebarConfigEditorVisible.value = true;
  }

  function openSidebarEditForm(row) {
    if (!row || typeof row !== "object") {
      return;
    }
    const configId = resolveConfigId(row.id);
    if (!configId) {
      return;
    }
    sidebarEditingConfigId.value = configId;
    applySidebarConfigForm(row);
    sidebarApiView.value = normalizeApiType(row.apiType, row.modelName);
    sidebarConfigEditorVisible.value = true;
  }

  function closeSidebarConfigEditor() {
    sidebarConfigEditorVisible.value = false;
    sidebarEditingConfigId.value = "";
    applySidebarConfigForm(createDefaultSidebarConfigForm(sidebarApiView.value));
  }

  function validateSidebarConfigForm() {
    if (!sidebarConfigForm.name) {
      ElMessage.warning("请输入显示名称");
      return false;
    }
    if (!sidebarConfigForm.modelName) {
      ElMessage.warning("请输入 Model 名称");
      return false;
    }
    if (!sidebarConfigForm.baseUrl) {
      ElMessage.warning("请输入 Base URL");
      return false;
    }
    if (!sidebarConfigForm.apiKey) {
      ElMessage.warning("请输入 API Key");
      return false;
    }
    return true;
  }

  function buildSidebarConfigPayload() {
    const modelName = normalizeModelNameForCompatibility(sidebarConfigForm.modelName);
    const apiType = normalizeApiType(sidebarConfigForm.apiType, modelName);
    return {
      name: String(sidebarConfigForm.name || "").trim(),
      baseUrl: String(sidebarConfigForm.baseUrl || "").trim(),
      apiKey: String(sidebarConfigForm.apiKey || "").trim(),
      modelName,
      apiType,
      generateCount: safeNormalizeGenerateCount(sidebarConfigForm.generateCount),
      enabled: sidebarConfigForm.enabled !== false,
      maxTokens: Math.round(clampNumber(sidebarConfigForm.maxTokens, 1, 16384, 2048)),
      temperature: Number(clampNumber(sidebarConfigForm.temperature, 0, 2, 0.7).toFixed(1)),
      inputPricePerMillion: normalizeOptionalNonNegativeNumber(sidebarConfigForm.inputPricePerMillion),
      outputPricePerMillion: normalizeOptionalNonNegativeNumber(sidebarConfigForm.outputPricePerMillion)
    };
  }

  async function saveSidebarConfig() {
    if (sidebarConfigSaving.value) {
      return;
    }
    if (!validateSidebarConfigForm()) {
      return;
    }
    const payload = buildSidebarConfigPayload();
    const editingId = resolveConfigId(sidebarEditingConfigId.value);
    sidebarConfigSaving.value = true;
    try {
      if (editingId) {
        await updateConfig(editingId, payload);
        ElMessage.success("配置已更新");
      } else {
        await createConfig(payload);
        ElMessage.success("配置已创建");
      }
      sidebarApiView.value = payload.apiType;
      await loadConfigs();
      closeSidebarConfigEditor();
    } catch (error) {
      ElMessage.error(error.message || "保存配置失败");
    } finally {
      sidebarConfigSaving.value = false;
    }
  }

  async function deleteSidebarConfig() {
    if (sidebarConfigDeleting.value) {
      return;
    }
    const configId = resolveConfigId(sidebarEditingConfigId.value);
    if (!configId) {
      return;
    }
    const target = apiConfigs.value.find((cfg) => resolveConfigId(cfg?.id) === configId);
    const name = String(target?.name || "").trim() || "该配置";
    try {
      await ElMessageBox.confirm(`确定删除配置 ${name} 吗？`, "删除确认", {
        type: "warning"
      });
    } catch {
      return;
    }
    sidebarConfigDeleting.value = true;
    try {
      await deleteConfig(configId);
      ElMessage.success("配置已删除");
      await loadConfigs();
      closeSidebarConfigEditor();
    } catch (error) {
      if (String(error?.message || "").includes("Config not found")) {
        ElMessage.warning("该配置已不存在，列表已刷新");
        await loadConfigs();
        closeSidebarConfigEditor();
        return;
      }
      ElMessage.error(error.message || "删除配置失败");
    } finally {
      sidebarConfigDeleting.value = false;
    }
  }

  async function onSidebarToggleConfig(row, nextEnabled) {
    const configId = resolveConfigId(row?.id);
    if (!configId) {
      return;
    }
    if (sidebarConfigTogglePending[configId]) {
      return;
    }
    const previousEnabled = row?.enabled !== false;
    const targetEnabled = typeof nextEnabled === "boolean" ? nextEnabled : !previousEnabled;
    if (targetEnabled === previousEnabled) {
      return;
    }
    setSidebarConfigEnabled(configId, targetEnabled);
    sidebarConfigTogglePending[configId] = true;
    try {
      const updated = await toggleConfig(configId);
      if (updated && typeof updated === "object") {
        upsertSidebarConfigRecord(updated);
      }
    } catch (error) {
      setSidebarConfigEnabled(configId, previousEnabled);
      ElMessage.error(error.message || "切换启停失败");
    } finally {
      delete sidebarConfigTogglePending[configId];
    }
  }

  return {
    apiConfigs,
    sidebarApiView,
    sidebarConfigEditorVisible,
    sidebarConfigSaving,
    sidebarConfigDeleting,
    sidebarConfigTogglePending,
    sidebarEditingConfigId,
    sidebarConfigForm,
    textApiCount,
    imageApiCount,
    filteredApiConfigs,
    sidebarApiViewLabel,
    switchSidebarApiView,
    syncSidebarApiViewWithGenerationMode,
    loadConfigs,
    onSidebarApiRowClick,
    openSidebarCreateForm,
    openSidebarEditForm,
    closeSidebarConfigEditor,
    saveSidebarConfig,
    deleteSidebarConfig,
    onSidebarToggleConfig
  };
}

