<template>
  <el-drawer
    :model-value="modelValue"
    title="API 配置管理"
    size="780px"
    @close="onClose"
  >
    <template #header>
      <div class="drawer-header">
        <span>API 配置管理</span>
        <el-button type="primary" @click="openCreate">新增配置</el-button>
      </div>
    </template>

    <el-table v-loading="loading" :data="configs" border stripe>
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="modelName" label="模型" min-width="130" />
      <el-table-column prop="baseUrl" label="Base URL" min-width="220" show-overflow-tooltip />
      <el-table-column label="启用" width="90" align="center">
        <template #default="scope">
          <el-switch :model-value="scope.row.enabled" @change="() => handleToggle(scope.row)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" align="center">
        <template #default="scope">
          <el-space>
            <el-button size="small" @click="openEdit(scope.row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(scope.row)">删除</el-button>
          </el-space>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="editorVisible"
      :title="editingId ? '编辑 API 配置' : '新增 API 配置'"
      width="560px"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item prop="name" label="显示名称">
          <el-input v-model="form.name" placeholder="例如：GPT-4o" />
        </el-form-item>
        <el-form-item prop="baseUrl" label="Base URL">
          <el-input v-model="form.baseUrl" placeholder="https://api.openai.com" />
        </el-form-item>
        <el-form-item prop="apiKey" label="API Key">
          <el-input v-model="form.apiKey" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item prop="modelName" label="Model 名称">
          <el-input v-model="form.modelName" placeholder="gpt-4o-mini" />
        </el-form-item>
        <el-form-item prop="maxTokens" label="Max Tokens">
          <el-input-number v-model="form.maxTokens" :min="1" :max="16384" :step="128" style="width: 100%" />
        </el-form-item>
        <el-form-item prop="temperature" label="Temperature">
          <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" show-input />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-space>
          <el-button @click="editorVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
        </el-space>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup>
import { reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { createConfig, deleteConfig, fetchConfigs, toggleConfig, updateConfig } from "../api/configs";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["update:modelValue", "saved"]);

const loading = ref(false);
const saving = ref(false);
const configs = ref([]);
const formRef = ref(null);
const editorVisible = ref(false);
const editingId = ref("");

const form = reactive(defaultForm());

const rules = {
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  baseUrl: [{ required: true, message: "请输入 Base URL", trigger: "blur" }],
  apiKey: [{ required: true, message: "请输入 API Key", trigger: "blur" }],
  modelName: [{ required: true, message: "请输入 Model 名称", trigger: "blur" }]
};

watch(
  () => props.modelValue,
  async (visible) => {
    if (visible) {
      await loadAll();
    }
  }
);

function defaultForm() {
  return {
    id: "",
    name: "",
    baseUrl: "",
    apiKey: "",
    modelName: "",
    enabled: true,
    maxTokens: 2048,
    temperature: 0.7
  };
}

function assignForm(payload) {
  Object.assign(form, defaultForm(), payload || {});
}

function onClose() {
  emit("update:modelValue", false);
}

async function loadAll() {
  loading.value = true;
  try {
    configs.value = await fetchConfigs();
  } catch (error) {
    ElMessage.error(error.message || "加载配置失败");
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = "";
  assignForm(defaultForm());
  editorVisible.value = true;
}

function openEdit(row) {
  editingId.value = row.id;
  assignForm(row);
  editorVisible.value = true;
}

async function submit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  saving.value = true;
  try {
    const payload = {
      name: form.name,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      modelName: form.modelName,
      enabled: form.enabled,
      maxTokens: form.maxTokens,
      temperature: form.temperature
    };

    if (editingId.value) {
      await updateConfig(editingId.value, payload);
      ElMessage.success("配置已更新");
    } else {
      await createConfig(payload);
      ElMessage.success("配置已创建");
    }

    editorVisible.value = false;
    await loadAll();
    emit("saved");
  } catch (error) {
    ElMessage.error(error.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleToggle(row) {
  try {
    await toggleConfig(row.id);
    await loadAll();
    emit("saved");
  } catch (error) {
    ElMessage.error(error.message || "切换失败");
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除配置 ${row.name} 吗？`, "删除确认", {
      type: "warning"
    });
    await deleteConfig(row.id);
    ElMessage.success("配置已删除");
    await loadAll();
    emit("saved");
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error.message || "删除失败");
    }
  }
}
</script>

<style scoped>
.drawer-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
