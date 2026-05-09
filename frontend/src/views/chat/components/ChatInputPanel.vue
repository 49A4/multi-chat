<template>
  <section
    :class="[
      'input-card',
      {
        'with-sidebar': sidebarVisible,
        'with-history-sidebar': historySidebarVisible,
        collapsed: inputCollapsed,
        'image-drop-active': generationMode === imageMode && imageDropActive
      }
    ]"
    @dragenter="$emit('image-drag-enter', $event)"
    @dragover="$emit('image-drag-over', $event)"
    @dragleave="$emit('image-drag-leave', $event)"
    @drop="$emit('image-drop', $event)"
    @paste="$emit('paste', $event)"
  >
    <button
      class="input-peek"
      :class="{ open: !inputCollapsed }"
      type="button"
      :title="inputCollapsed ? '展开输入栏' : '收起输入栏'"
      @click="$emit('toggle-input')"
    >
      {{ inputCollapsed ? "▴" : "▾" }}
    </button>
    <template v-if="!inputCollapsed">
      <div v-if="promptContexts.length" class="prompt-context-strip">
        <span v-for="ctx in promptContexts" :key="ctx.id" class="prompt-context-chip" :title="ctx.sourceTitle || ctx.title">
          <span class="prompt-context-chip-text"># {{ ctx.title }}</span>
          <button
            type="button"
            class="prompt-context-chip-close"
            :title="`移除上下文：${ctx.title}`"
            @click="$emit('remove-context', ctx.id)"
          >
            ×
          </button>
        </span>
      </div>
      <div class="generation-controls">
        <el-radio-group v-model="modeModel" size="small" class="mode-switch">
          <el-radio-button :label="textMode">文字模式</el-radio-button>
          <el-radio-button :label="imageMode">图片模式</el-radio-button>
        </el-radio-group>
        <div v-if="generationMode === imageMode" class="image-batch-control">
          <span>每模型</span>
          <el-input-number
            v-model="batchCountModel"
            :min="imageBatchMin"
            :max="imageBatchMax"
            size="small"
            controls-position="right"
          />
          <span>张</span>
        </div>
        <div v-if="generationMode === imageMode" class="image-advanced-control">
          <span>比例</span>
          <el-select v-model="aspectRatioModel" size="small" class="image-control-select">
            <el-option
              v-for="item in imageAspectRatioOptions"
              :key="`ratio-${item.value}`"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <span>清晰度</span>
          <el-select v-model="qualityModel" size="small" class="image-control-select">
            <el-option
              v-for="item in imageQualityOptions"
              :key="`quality-${item.value}`"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>
      </div>
      <el-input
        v-model="promptModel"
        type="textarea"
        :rows="2"
        resize="none"
        :placeholder="
          generationMode === imageMode
            ? '例如：生成一张写实风格的海边日落插画'
            : '例如：请解释一下并发流式渲染'
        "
        @keydown="$emit('prompt-keydown', $event)"
      />
      <div v-if="generationMode === imageMode" class="image-input-bar">
        <label class="image-input-upload">
          <input
            :ref="setImageInputRef"
            class="image-input-file"
            type="file"
            accept="image/*"
            multiple
            @change="$emit('image-input-change', $event)"
          />
          <span>{{ selectedImageInputs.length > 0 ? "追加参考图" : "上传参考图" }}</span>
        </label>
        <span v-if="selectedImageInputs.length > 0" class="image-input-meta">
          已添加 {{ selectedImageInputs.length }} 张参考图（最多 {{ maxReferenceImages }} 张）
        </span>
        <span class="image-input-tip">支持拖拽或粘贴上传</span>
        <el-button v-if="selectedImageInputs.length > 0" text size="small" @click="$emit('clear-image-input')">
          清空图片
        </el-button>
      </div>
      <div v-if="generationMode === imageMode && selectedImagePreviewList.length > 0" class="image-input-preview-wrap">
        <div
          class="image-input-preview-grid"
          @dragover.stop.prevent="$emit('preview-grid-drag-over', $event)"
          @drop.stop.prevent="$emit('preview-grid-drop', $event)"
        >
          <div
            v-for="(preview, index) in selectedImagePreviewList"
            :key="`preview-${index}-${preview.src}`"
            :class="[
              'image-input-preview-item',
              {
                dragging: imagePreviewDragFromIndex === index,
                'drag-over': imagePreviewDragOverIndex === index && imagePreviewDragFromIndex !== index
              }
            ]"
            draggable="true"
            @dragstart.stop="$emit('preview-drag-start', $event, index)"
            @dragenter.stop.prevent="$emit('preview-drag-enter', $event, index)"
            @dragover.stop.prevent="$emit('preview-drag-over', $event, index)"
            @drop.stop.prevent="$emit('preview-drop', $event, index)"
            @dragend.stop="$emit('preview-drag-end', $event)"
          >
            <div class="image-input-order-badge">{{ index + 1 }}</div>
            <img
              :src="preview.src"
              class="image-input-preview"
              :alt="`参考图预览 ${index + 1}`"
              draggable="false"
              @mouseover="$emit('image-hover', $event)"
              @mouseout="$emit('image-hover', $event)"
              @click="$emit('image-click', $event)"
            />
            <button
              type="button"
              class="image-input-remove-btn"
              :title="`移除第 ${index + 1} 张参考图`"
              @click="$emit('remove-image-input', index)"
            >
              ×
            </button>
            <div class="image-input-preview-meta">
              {{ preview.name }}<template v-if="preview.sizeText"> · {{ preview.sizeText }}</template>
            </div>
          </div>
        </div>
      </div>
      <div :class="['actions', { 'with-image-previews': generationMode === imageMode && selectedImagePreviewList.length > 0 }]">
        <el-button type="primary" :disabled="!authReady" @click="$emit('send')">
          {{ generationMode === imageMode ? "生成图片" : "发送" }} (Enter)
        </el-button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  prompt: { type: String, default: "" },
  generationMode: { type: String, required: true },
  imageBatchCount: { type: Number, required: true },
  imageAspectRatio: { type: String, required: true },
  imageQuality: { type: String, required: true },
  sidebarVisible: { type: Boolean, default: false },
  historySidebarVisible: { type: Boolean, default: false },
  inputCollapsed: { type: Boolean, default: false },
  promptContexts: { type: Array, default: () => [] },
  imageDropActive: { type: Boolean, default: false },
  selectedImageInputs: { type: Array, default: () => [] },
  selectedImagePreviewList: { type: Array, default: () => [] },
  imagePreviewDragFromIndex: { type: Number, default: -1 },
  imagePreviewDragOverIndex: { type: Number, default: -1 },
  authReady: { type: Boolean, default: false },
  maxReferenceImages: { type: Number, required: true },
  textMode: { type: String, required: true },
  imageMode: { type: String, required: true },
  imageBatchMin: { type: Number, required: true },
  imageBatchMax: { type: Number, required: true },
  imageAspectRatioOptions: { type: Array, default: () => [] },
  imageQualityOptions: { type: Array, default: () => [] },
  imageInputRef: { type: Object, default: null }
});

const emit = defineEmits([
  "update:prompt",
  "update:generationMode",
  "update:imageBatchCount",
  "update:imageAspectRatio",
  "update:imageQuality",
  "toggle-input",
  "remove-context",
  "prompt-keydown",
  "image-input-change",
  "clear-image-input",
  "image-drag-enter",
  "image-drag-over",
  "image-drag-leave",
  "image-drop",
  "paste",
  "preview-grid-drag-over",
  "preview-grid-drop",
  "preview-drag-start",
  "preview-drag-enter",
  "preview-drag-over",
  "preview-drop",
  "preview-drag-end",
  "image-hover",
  "image-click",
  "remove-image-input",
  "send"
]);

const promptModel = computed({
  get: () => props.prompt,
  set: (value) => emit("update:prompt", value)
});

const modeModel = computed({
  get: () => props.generationMode,
  set: (value) => emit("update:generationMode", value)
});

const batchCountModel = computed({
  get: () => props.imageBatchCount,
  set: (value) => emit("update:imageBatchCount", value)
});

const aspectRatioModel = computed({
  get: () => props.imageAspectRatio,
  set: (value) => emit("update:imageAspectRatio", value)
});

const qualityModel = computed({
  get: () => props.imageQuality,
  set: (value) => emit("update:imageQuality", value)
});

function setImageInputRef(el) {
  if (props.imageInputRef) {
    props.imageInputRef.value = el;
  }
}
</script>
