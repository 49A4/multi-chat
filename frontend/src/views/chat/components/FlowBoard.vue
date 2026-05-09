<template>
  <section :class="['workspace', { 'with-sidebar': sidebarVisible, 'with-history-sidebar': historySidebarVisible }]">
    <section class="flow-board" @click="$emit('markdown-action', $event)">
      <div class="flow-board-head">
        <div class="flow-board-title-group">
          <span class="flow-board-kicker">CANVAS</span>
          <strong>多模型对话画布</strong>
        </div>
        <span class="flow-board-tip">拖拽排布、并排对比、框选总结</span>
      </div>
      <div
        :ref="setFlowCanvasRef"
        :class="['flow-canvas', { dragging: dragState.active || panState.active }]"
        :style="flowCanvasStyle"
        title="Shift+空白拖拽框选回答并加载到输入框上下文，普通空白拖拽平移画布"
        @pointerdown="$emit('canvas-pointer-down', $event)"
        @wheel="$emit('canvas-wheel', $event)"
      >
        <div class="flow-layer" :style="flowLayerStyle">
          <svg
            v-if="(questionConnections.length > 0 || followUpConnections.length > 0) && !dragState.active"
            class="flow-links"
          >
            <path
              v-for="conn in questionConnections"
              :key="conn.key"
              class="flow-link"
              :d="conn.path"
            />
            <path
              v-for="conn in followUpConnections"
              :key="conn.key"
              class="flow-link flow-link-follow-up"
              :d="conn.path"
            />
          </svg>

          <section
            v-for="question in questionNodes"
            :key="question.id"
            :class="['question-node', 'question-drag-handle', { selected: isQuestionSelected(question.id) }]"
            :style="questionNodeStyle(question)"
            @pointerdown="$emit('question-pointer-down', $event, question.id)"
            @click.stop="$emit('select-question', question.id)"
          >
            <div class="question-head">
              <div class="question-chip">我的问题</div>
              <div class="question-head-right">
                <div class="question-meta">{{ question.timeText }}</div>
                <div class="question-cost">{{ formatQuestionTotalCostCny(question.id) }}</div>
              </div>
            </div>
            <div class="question-text">{{ question.text }}</div>
          </section>

          <el-card
            v-for="item in modelList"
            :key="item.model"
            :data-model="item.model"
            shadow="never"
            :class="[
              'result-card',
              'flow-node',
              {
                dragging: dragState.active && dragState.model === item.model,
                'drag-source-hidden': dragState.active && dragState.model === item.model,
                selected: isModelSelected(item.model)
              }
            ]"
            :style="nodeStyle(item)"
            @pointerdown="$emit('model-card-pointer-down', $event, item.model)"
            @click.stop="$emit('model-click', item.model)"
          >
            <template #header>
              <div class="card-head drag-handle" @pointerdown="$emit('node-pointer-down', $event, item.model)">
                <strong class="card-title">{{ item.title || item.model }}</strong>
                <span class="card-time">{{ item.timeText }}</span>
                <div class="card-meta">
                  <el-tag v-if="formatUsageCost(item)" size="small" effect="plain" type="danger">
                    {{ formatUsageCost(item) }}
                  </el-tag>
                  <el-tag v-else-if="formatTokenUsage(item.usage)" size="small" effect="plain" type="warning">
                    {{ formatTokenUsage(item.usage) }}
                  </el-tag>
                </div>
              </div>
            </template>
            <div
              class="content markdown-body"
              v-html="item.renderedHtml"
              @pointerdown.capture="$emit('model-content-pointer-down', $event, item.model)"
              @mouseover="$emit('image-hover', $event)"
              @mouseout="$emit('image-hover', $event)"
              @click="$emit('image-click', $event)"
            ></div>
          </el-card>

          <section
            v-if="dragGhost.active"
            :ref="setDragGhostRef"
            class="drag-ghost"
            :style="dragGhostStyle"
          >
            <div class="drag-ghost-title">{{ dragGhost.title }}</div>
          </section>

          <section
            v-if="showModuleActionMenu"
            :ref="setModuleActionMenuRef"
            class="module-action-menu"
            :style="moduleActionMenuStyle"
            @pointerdown.stop
            @click.stop
          >
            <el-button
              v-if="canRetrySelectedModule"
              size="small"
              :loading="selectedModuleRetrying"
              @click="$emit('retry-selected')"
            >
              重试
            </el-button>
            <el-button size="small" type="danger" @click="$emit('delete-selected')">
              删除模块
            </el-button>
          </section>

          <section
            v-for="block in summaryBlocks"
            :key="block.id"
            class="summary-block"
            :style="summaryBlockStyle(block)"
          >
            <header class="summary-block-head">
              <strong>总结块</strong>
              <span>{{ block.selectedModels.length }} 个回答</span>
            </header>
            <el-input
              v-model="block.instruction"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="例如：总结这些回答，提炼一致结论和差异点"
            />
            <div class="summary-block-actions">
              <el-button
                size="small"
                type="primary"
                :loading="block.loading"
                @click="$emit('run-summary', block)"
              >
                执行总结
              </el-button>
              <el-button size="small" @click="$emit('refresh-summary', block)">
                刷新范围
              </el-button>
              <el-button size="small" text type="danger" @click="$emit('remove-summary', block.id)">
                删除
              </el-button>
            </div>
            <div class="summary-selected-list">
              <el-tag
                v-for="key in block.selectedModels"
                :key="`${block.id}-${key}`"
                size="small"
                effect="plain"
              >
                {{ stateMap[key]?.title || key }}
              </el-tag>
              <span v-if="block.selectedModels.length === 0" class="summary-empty-tip">未命中回答卡片</span>
            </div>
            <div v-if="block.error" class="summary-error">{{ block.error }}</div>
            <div
              v-else
              class="content markdown-body summary-content"
              v-html="block.renderedHtml"
              @mouseover="$emit('image-hover', $event)"
              @mouseout="$emit('image-hover', $event)"
              @click="$emit('image-click', $event)"
            ></div>
          </section>

          <div
            v-if="summaryCreateState.active"
            class="summary-draft"
            :style="summaryDraftStyle"
          ></div>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup>
const props = defineProps({
  sidebarVisible: { type: Boolean, default: false },
  historySidebarVisible: { type: Boolean, default: false },
  flowCanvasRef: { type: Object, default: null },
  dragGhostRef: { type: Object, default: null },
  moduleActionMenuRef: { type: Object, default: null },
  dragState: { type: Object, required: true },
  panState: { type: Object, required: true },
  flowCanvasStyle: { type: Object, default: () => ({}) },
  flowLayerStyle: { type: Object, default: () => ({}) },
  questionConnections: { type: Array, default: () => [] },
  followUpConnections: { type: Array, default: () => [] },
  questionNodes: { type: Array, default: () => [] },
  modelList: { type: Array, default: () => [] },
  dragGhost: { type: Object, required: true },
  dragGhostStyle: { type: Object, default: () => ({}) },
  showModuleActionMenu: { type: Boolean, default: false },
  moduleActionMenuStyle: { type: Object, default: () => ({}) },
  canRetrySelectedModule: { type: Boolean, default: false },
  selectedModuleRetrying: { type: Boolean, default: false },
  summaryBlocks: { type: Array, default: () => [] },
  summaryCreateState: { type: Object, required: true },
  summaryDraftStyle: { type: Object, default: () => ({}) },
  stateMap: { type: Object, default: () => ({}) },
  questionNodeStyle: { type: Function, required: true },
  nodeStyle: { type: Function, required: true },
  summaryBlockStyle: { type: Function, required: true },
  isQuestionSelected: { type: Function, required: true },
  isModelSelected: { type: Function, required: true },
  formatQuestionTotalCostCny: { type: Function, required: true },
  formatUsageCost: { type: Function, required: true },
  formatTokenUsage: { type: Function, required: true }
});

defineEmits([
  "markdown-action",
  "canvas-pointer-down",
  "canvas-wheel",
  "question-pointer-down",
  "select-question",
  "model-card-pointer-down",
  "model-click",
  "node-pointer-down",
  "model-content-pointer-down",
  "image-hover",
  "image-click",
  "retry-selected",
  "delete-selected",
  "run-summary",
  "refresh-summary",
  "remove-summary"
]);

function setFlowCanvasRef(el) {
  if (props.flowCanvasRef) {
    props.flowCanvasRef.value = el;
  }
}

function setDragGhostRef(el) {
  if (props.dragGhostRef) {
    props.dragGhostRef.value = el;
  }
}

function setModuleActionMenuRef(el) {
  if (props.moduleActionMenuRef) {
    props.moduleActionMenuRef.value = el;
  }
}
</script>
