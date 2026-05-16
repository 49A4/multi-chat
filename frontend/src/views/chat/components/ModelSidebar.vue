<template>
  <button
    ref="peekRef"
    class="sidebar-peek"
    :class="{ open: visible }"
    type="button"
    @click="$emit('toggle')"
    :title="visible ? '收起侧边栏' : '展开侧边栏'"
  >
    {{ visible ? "›" : "‹" }}
  </button>

  <aside
    ref="panelRef"
    :class="['model-sidebar-panel', { open: visible }]"
  >
    <div class="sidebar-head">
      <div class="sidebar-head-main">
        <h3>模型侧栏</h3>
        <div v-if="authUserDisplayName" class="sidebar-user-chip" :title="`当前账号：${authUserDisplayName}`">
          {{ authUserDisplayName }}
        </div>
      </div>
      <div class="sidebar-head-actions">
        <el-button text size="small" class="switch-account-btn" @click="$emit('switch-account')">
          切换账号
        </el-button>
      </div>
    </div>
    <div class="sidebar-actions">
      <el-button size="small" @click="$emit('load-configs')">刷新模型</el-button>
      <el-button size="small" type="primary" plain @click="$emit('create-config')">新增 API</el-button>
    </div>
    <div v-if="apiConfigs.length > 0" class="sidebar-api-switch">
      <el-button
        size="small"
        :type="sidebarApiView === apiTypeText ? 'primary' : 'default'"
        :plain="sidebarApiView !== apiTypeText"
        @click="$emit('switch-api-view', apiTypeText)"
      >
        文字 API ({{ textApiCount }})
      </el-button>
      <el-button
        size="small"
        :type="sidebarApiView === apiTypeImage ? 'primary' : 'default'"
        :plain="sidebarApiView !== apiTypeImage"
        @click="$emit('switch-api-view', apiTypeImage)"
      >
        图片 API ({{ imageApiCount }})
      </el-button>
    </div>

    <div v-if="apiConfigs.length === 0" class="api-empty">暂无配置，请先添加模型 API。</div>
    <div v-else-if="filteredApiConfigs.length === 0" class="api-empty">
      当前没有{{ sidebarApiViewLabel }} API 配置。
    </div>
    <div v-else class="sidebar-api-table-wrap">
      <el-table
        :data="filteredApiConfigs"
        size="small"
        border
        stripe
        class="sidebar-api-table"
        @row-click="(row) => $emit('row-click', row)"
      >
        <el-table-column label="AI" min-width="170">
          <template #default="scope">
            <div class="sidebar-ai-cell">
              <strong>{{ scope.row.name }}</strong>
              <span class="sidebar-ai-model">{{ scope.row.modelName }}</span>
              <span class="sidebar-ai-url" :title="scope.row.baseUrl">{{ scope.row.baseUrl }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="生成" width="72" align="center">
          <template #default="scope">
            {{ normalizeGenerateCount(scope.row.generateCount) }} 次
          </template>
        </el-table-column>
        <el-table-column label="状态" width="76" align="center">
          <template #default="scope">
            <el-switch
              :model-value="scope.row.enabled"
              :loading="Boolean(sidebarConfigTogglePending[resolveConfigId(scope.row.id)])"
              :disabled="Boolean(sidebarConfigTogglePending[resolveConfigId(scope.row.id)])"
              @click.stop
              @change="(value) => $emit('toggle-config', scope.row, value)"
            />
          </template>
        </el-table-column>
      </el-table>
      <div class="sidebar-config-hint">点击任意一行可编辑；新增在弹窗内完成</div>
    </div>
  </aside>

  <el-dialog
    :model-value="editorVisible"
    :title="editingConfigId ? '编辑 API 配置' : '新增 API 配置'"
    width="760px"
    class="api-config-dialog"
    destroy-on-close
    @update:model-value="(value) => $emit('update:editorVisible', value)"
    @close="$emit('close-editor')"
  >
    <el-form :model="configForm" label-position="top" size="small" class="sidebar-config-form">
      <el-form-item label="显示名称" required>
        <el-input v-model="configForm.name" placeholder="例如：GPT-4o" />
      </el-form-item>
      <el-form-item label="Model 名称" required>
        <el-input v-model="configForm.modelName" placeholder="gpt-4o-mini" />
      </el-form-item>
      <el-form-item label="Base URL" required>
        <el-input v-model="configForm.baseUrl" placeholder="https://api.openai.com" />
      </el-form-item>
      <el-form-item label="API Key" required>
        <el-input v-model="configForm.apiKey" show-password placeholder="sk-..." />
      </el-form-item>
      <div class="sidebar-config-grid dialog-config-grid">
        <el-form-item label="模型类型" required>
          <el-select v-model="configForm.apiType" style="width: 100%">
            <el-option :value="apiTypeText" label="文字" />
            <el-option :value="apiTypeImage" label="图片" />
          </el-select>
        </el-form-item>
        <el-form-item label="每轮生成次数">
          <el-input-number
            v-model="configForm.generateCount"
            :min="1"
            :max="20"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </div>
      <div class="sidebar-config-grid dialog-config-grid">
        <el-form-item label="Max Tokens">
          <el-input-number
            v-model="configForm.maxTokens"
            :min="1"
            :max="16384"
            :step="128"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Temperature">
          <el-input-number
            v-model="configForm.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </div>
      <div class="sidebar-config-grid dialog-config-grid">
        <el-form-item label="输入单价 (USD/百万Token)">
          <el-input-number
            v-model="configForm.inputPricePerMillion"
            :min="0"
            :step="0.1"
            :precision="6"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="输出单价 (USD/百万Token)">
          <el-input-number
            v-model="configForm.outputPricePerMillion"
            :min="0"
            :step="0.1"
            :precision="6"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </div>
      <el-form-item label="启用">
        <el-switch v-model="configForm.enabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="sidebar-config-editor-actions">
        <el-button size="small" @click="$emit('close-editor')">取消</el-button>
        <el-button
          v-if="editingConfigId"
          size="small"
          type="danger"
          plain
          :loading="deleting"
          @click="$emit('delete-config')"
        >
          删除
        </el-button>
        <el-button size="small" type="primary" :loading="saving" @click="$emit('save-config')">
          {{ editingConfigId ? "保存" : "创建" }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  authUserDisplayName: { type: String, default: "" },
  apiConfigs: { type: Array, default: () => [] },
  filteredApiConfigs: { type: Array, default: () => [] },
  sidebarApiView: { type: String, required: true },
  sidebarApiViewLabel: { type: String, default: "" },
  textApiCount: { type: Number, default: 0 },
  imageApiCount: { type: Number, default: 0 },
  sidebarConfigTogglePending: { type: Object, default: () => ({}) },
  editorVisible: { type: Boolean, default: false },
  editingConfigId: { type: String, default: "" },
  configForm: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  deleting: { type: Boolean, default: false },
  apiTypeText: { type: String, required: true },
  apiTypeImage: { type: String, required: true },
  normalizeGenerateCount: { type: Function, required: true },
  resolveConfigId: { type: Function, required: true },
  panelRefTarget: { type: Object, default: null },
  peekRefTarget: { type: Object, default: null }
});

defineEmits([
  "toggle",
  "switch-account",
  "load-configs",
  "create-config",
  "switch-api-view",
  "row-click",
  "toggle-config",
  "update:editorVisible",
  "close-editor",
  "delete-config",
  "save-config"
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
