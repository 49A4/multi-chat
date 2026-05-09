<template>
  <button
    ref="peekRef"
    class="history-sidebar-peek"
    :class="{ open: visible }"
    type="button"
    @mouseenter="$emit('peek-enter')"
    @mouseleave="$emit('peek-leave')"
    @click="$emit('toggle')"
    :title="pinned ? '历史侧栏已固定' : (visible ? '收起历史侧栏' : '展开历史侧栏')"
  >
    {{ visible ? "‹" : "›" }}
  </button>

  <aside
    ref="panelRef"
    :class="['history-sidebar-panel', { open: visible }]"
    @mouseenter="$emit('panel-enter')"
    @mouseleave="$emit('panel-leave')"
  >
    <section class="snapshot-sidebar">
      <div class="snapshot-sidebar-head">
        <strong>画布历史</strong>
        <div class="snapshot-sidebar-head-actions">
          <span v-if="activeTitle" class="snapshot-active-tag" :title="activeTitle">
            当前：{{ activeTitle }}
          </span>
          <el-button
            text
            size="small"
            class="pin-icon-btn"
            :class="{ active: pinned }"
            :title="pinned ? '取消固定历史侧栏' : '固定历史侧栏'"
            @click="$emit('toggle-pinned')"
          >
            固定
          </el-button>
        </div>
      </div>
      <div class="snapshot-sidebar-actions">
        <el-button size="small" plain @click="$emit('create-fresh')">
          新建画布
        </el-button>
        <el-button size="small" @click="$emit('load')">
          刷新历史
        </el-button>
      </div>
      <div v-if="loading" class="snapshot-empty">正在加载历史画布...</div>
      <div v-else-if="snapshots.length === 0" class="snapshot-empty">
        暂无历史画布，点击“新建画布”或发送消息后会自动保存。
      </div>
      <div v-else class="snapshot-list">
        <button
          v-for="snapshot in snapshots"
          :key="snapshot.id"
          type="button"
          :class="['snapshot-item', { active: snapshot.id === activeId }]"
          :title="snapshot.title"
          @click="$emit('restore', snapshot.id)"
          @keydown.enter.prevent="$emit('restore', snapshot.id)"
          @keydown.space.prevent="$emit('restore', snapshot.id)"
        >
          <span class="snapshot-item-title">{{ snapshot.title }}</span>
          <span class="snapshot-item-time">{{ formatSnapshotTime(snapshot.updatedAt || snapshot.createdAt) }}</span>
          <el-button
            class="snapshot-item-delete"
            text
            type="danger"
            size="small"
            @click.stop="$emit('remove', snapshot.id)"
          >
            删除
          </el-button>
        </button>
      </div>
    </section>
  </aside>
</template>

<script setup>
import { ref, watch } from "vue";
import { formatSnapshotTime } from "../useCanvasSnapshots";

const props = defineProps({
  visible: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  activeTitle: { type: String, default: "" },
  activeId: { type: String, default: "" },
  loading: { type: Boolean, default: false },
  snapshots: { type: Array, default: () => [] },
  panelRefTarget: { type: Object, default: null },
  peekRefTarget: { type: Object, default: null }
});

defineEmits([
  "peek-enter",
  "peek-leave",
  "toggle",
  "panel-enter",
  "panel-leave",
  "toggle-pinned",
  "create-fresh",
  "load",
  "restore",
  "remove"
]);

const panelRef = ref(null);
const peekRef = ref(null);

watch(panelRef, (value) => {
  if (props.panelRefTarget) {
    props.panelRefTarget.value = value;
  }
});

watch(peekRef, (value) => {
  if (props.peekRefTarget) {
    props.peekRefTarget.value = value;
  }
});
</script>
