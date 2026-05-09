import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  deleteCanvasSnapshot,
  fetchCanvasSnapshotDetail,
  fetchCanvasSnapshots,
  saveCanvasSnapshot
} from "../../api/canvasSnapshots";

export const SNAPSHOT_AUTOSAVE_DELAY_MS = 1200;

export function formatSnapshotTime(rawTime) {
  const time = Number(rawTime);
  if (!Number.isFinite(time) || time <= 0) {
    return "";
  }
  const date = new Date(time);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

export function normalizeSnapshotSummary(item) {
  const id = String(item?.id || "").trim();
  if (!id) {
    return null;
  }
  const title = String(item?.title || "").trim() || "未命名画布";
  const createdAt = Number(item?.createdAt);
  const updatedAt = Number(item?.updatedAt);
  return {
    id,
    title,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Number.isFinite(createdAt) ? createdAt : Date.now()
  };
}

export function useCanvasSnapshots(options = {}) {
  const {
    buildSnapshotPayload,
    buildSnapshotTitle,
    restoreSnapshotPayload,
    hasSnapshotContent,
    clearCanvas,
    formatTime = formatSnapshotTime
  } = options;

  const canvasSnapshots = ref([]);
  const snapshotLoading = ref(false);
  const snapshotSaving = ref(false);
  const snapshotRestoring = ref(false);
  const activeCanvasSnapshotId = ref("");
  let snapshotAutoSaveTimer = null;

  const activeCanvasSnapshotTitle = computed(() => {
    const currentId = String(activeCanvasSnapshotId.value || "").trim();
    if (!currentId) {
      return "";
    }
    const target = canvasSnapshots.value.find((item) => String(item?.id || "").trim() === currentId);
    return String(target?.title || "").trim();
  });

  function upsertCanvasSnapshotSummary(snapshot) {
    const normalized = normalizeSnapshotSummary(snapshot);
    if (!normalized) {
      return;
    }
    const next = canvasSnapshots.value.filter((item) => item.id !== normalized.id);
    next.unshift(normalized);
    next.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
    canvasSnapshots.value = next;
  }

  async function loadCanvasSnapshots() {
    snapshotLoading.value = true;
    try {
      const list = await fetchCanvasSnapshots();
      canvasSnapshots.value = Array.isArray(list)
        ? list.map((item) => normalizeSnapshotSummary(item)).filter(Boolean)
        : [];
    } catch (error) {
      ElMessage.error(error.message || "加载画布历史失败");
    } finally {
      snapshotLoading.value = false;
    }
  }

  async function persistCanvasSnapshot(persistOptions = {}) {
    const silent = persistOptions.silent === true;
    const forceCreate = persistOptions.forceCreate === true;
    const allowEmpty = persistOptions.allowEmpty === true;
    const customTitle = String(persistOptions.title || "").trim();
    if (snapshotSaving.value || snapshotLoading.value || snapshotRestoring.value) {
      return null;
    }
    if (!allowEmpty && typeof hasSnapshotContent === "function" && !hasSnapshotContent()) {
      if (!silent) {
        ElMessage.warning("当前画布为空，暂无可保存内容");
      }
      return null;
    }

    snapshotSaving.value = true;
    try {
      const payload = {
        id: forceCreate ? "" : String(activeCanvasSnapshotId.value || "").trim(),
        title: customTitle || buildSnapshotTitle(),
        snapshot: buildSnapshotPayload()
      };
      const saved = await saveCanvasSnapshot(payload);
      if (saved && typeof saved === "object") {
        const savedId = String(saved.id || "").trim();
        if (savedId) {
          activeCanvasSnapshotId.value = savedId;
        }
        upsertCanvasSnapshotSummary(saved);
      }
      if (!silent) {
        ElMessage.success("画布已保存");
      }
      return saved;
    } catch (error) {
      if (!silent) {
        ElMessage.error(error.message || "保存画布失败");
      }
      return null;
    } finally {
      snapshotSaving.value = false;
    }
  }

  function cancelSnapshotAutoSave() {
    if (snapshotAutoSaveTimer == null) {
      return;
    }
    clearTimeout(snapshotAutoSaveTimer);
    snapshotAutoSaveTimer = null;
  }

  function scheduleSnapshotAutoSave() {
    if (snapshotLoading.value || snapshotRestoring.value) {
      return;
    }
    cancelSnapshotAutoSave();
    snapshotAutoSaveTimer = setTimeout(() => {
      snapshotAutoSaveTimer = null;
      void persistCanvasSnapshot({ silent: true });
    }, SNAPSHOT_AUTOSAVE_DELAY_MS);
  }

  async function restoreCanvasSnapshot(snapshotId, restoreOptions = {}) {
    const id = String(snapshotId || "").trim();
    if (!id) {
      return;
    }
    const silent = restoreOptions.silent === true;
    cancelSnapshotAutoSave();
    snapshotRestoring.value = true;
    try {
      const detail = await fetchCanvasSnapshotDetail(id);
      const snapshot = detail?.snapshot && typeof detail.snapshot === "object" ? detail.snapshot : {};
      restoreSnapshotPayload(snapshot);
      activeCanvasSnapshotId.value = id;
      upsertCanvasSnapshotSummary(detail);
      if (!silent) {
        ElMessage.success("已恢复历史画布");
      }
    } catch (error) {
      ElMessage.error(error.message || "恢复画布失败");
    } finally {
      snapshotRestoring.value = false;
    }
  }

  async function removeCanvasSnapshot(snapshotId) {
    const id = String(snapshotId || "").trim();
    if (!id) {
      return;
    }
    try {
      await ElMessageBox.confirm("确认删除这个历史画布吗？删除后无法恢复。", "删除画布", {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消"
      });
    } catch {
      return;
    }

    try {
      await deleteCanvasSnapshot(id);
      canvasSnapshots.value = canvasSnapshots.value.filter((item) => item.id !== id);
      if (activeCanvasSnapshotId.value === id) {
        activeCanvasSnapshotId.value = "";
      }
      ElMessage.success("历史画布已删除");
    } catch (error) {
      if (String(error?.message || "").includes("Canvas snapshot not found")) {
        canvasSnapshots.value = canvasSnapshots.value.filter((item) => item.id !== id);
        if (activeCanvasSnapshotId.value === id) {
          activeCanvasSnapshotId.value = "";
        }
        ElMessage.warning("该历史画布已不存在，列表已刷新");
        await loadCanvasSnapshots();
        return;
      }
      ElMessage.error(error.message || "删除画布失败");
    }
  }

  async function createFreshCanvas() {
    cancelSnapshotAutoSave();
    activeCanvasSnapshotId.value = "";
    await clearCanvas();
    const now = Date.now();
    await persistCanvasSnapshot({
      silent: true,
      forceCreate: true,
      allowEmpty: true,
      title: `新建画布 ${formatTime(now)}`
    });
    await loadCanvasSnapshots();
  }

  return {
    canvasSnapshots,
    snapshotLoading,
    snapshotSaving,
    snapshotRestoring,
    activeCanvasSnapshotId,
    activeCanvasSnapshotTitle,
    upsertCanvasSnapshotSummary,
    loadCanvasSnapshots,
    persistCanvasSnapshot,
    cancelSnapshotAutoSave,
    scheduleSnapshotAutoSave,
    restoreCanvasSnapshot,
    removeCanvasSnapshot,
    createFreshCanvas
  };
}

