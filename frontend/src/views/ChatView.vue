<template>
  <div class="demo-page">
    <header class="demo-header">
      <div class="header-top">
        <div>
          <h2>多模型并发流式聊天</h2>
          <p>每个已启用 API 对应一个返回框，并发流式输出。</p>
        </div>
        <el-button type="primary" plain @click="openConfigDialog">API 配置</el-button>
      </div>
    </header>

    <section class="api-card">
      <div class="api-head">
        <h3>已配置 API</h3>
        <el-button size="small" @click="loadConfigs">刷新</el-button>
      </div>

      <div v-if="apiConfigs.length === 0" class="api-empty">暂无配置，请点击右上角 API 配置 按钮添加。</div>
      <div v-else class="api-list">
        <div v-for="item in apiConfigs" :key="item.id" class="api-item">
          <div class="api-main">
            <strong>{{ item.name }}</strong>
            <span>{{ item.modelName }}</span>
            <el-tag :type="item.enabled ? 'success' : 'info'" size="small">
              {{ item.enabled ? "启用" : "停用" }}
            </el-tag>
          </div>
          <div class="api-url">{{ item.baseUrl }}</div>
        </div>
      </div>
    </section>

    <section class="input-card">
      <el-input
        v-model="prompt"
        type="textarea"
        :rows="4"
        resize="none"
        placeholder="例如：请解释一下并发流式渲染"
        @keydown.ctrl.enter.prevent="send"
      />
      <div class="actions">
        <el-button @click="clear">清空输出</el-button>
        <el-button type="primary" :loading="loading" @click="send">发送 (Ctrl+Enter)</el-button>
      </div>
    </section>

    <section v-if="modelList.length === 0" class="empty-result">
      发送消息后，这里会按“已启用 API”数量动态展示返回框。
    </section>

    <section v-else class="result-grid">
      <el-card v-for="item in modelList" :key="item.model" shadow="never" class="result-card">
        <template #header>
          <div class="card-head">
            <strong>{{ item.model }}</strong>
            <el-tag v-if="item.error" type="danger" size="small">异常</el-tag>
            <el-tag v-else-if="item.done" type="success" size="small">完成</el-tag>
            <el-tag v-else type="info" size="small">流式中</el-tag>
          </div>
        </template>
        <div class="content markdown-body" v-html="renderModelContent(item)"></div>
      </el-card>
    </section>

    <ApiConfigDialog v-model="configDialogVisible" @saved="onConfigSaved" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import ApiConfigDialog from "../components/ApiConfigDialog.vue";
import { sendPromptStream } from "../api/chat";
import { fetchConfigs } from "../api/configs";
import { createSession, deleteSession } from "../api/sessions";

const prompt = ref("");
const loading = ref(false);
const sessionId = ref("");
const configDialogVisible = ref(false);
const apiConfigs = ref([]);

const stateMap = reactive({});
let controller = null;

const modelList = computed(() => Object.values(stateMap));

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return `<pre><code class="hljs">${hljs.highlight(code, { language: lang }).value}</code></pre>`;
    }
    return `<pre><code class="hljs">${markdown.utils.escapeHtml(code)}</code></pre>`;
  }
});

function normalizeBreakTags(text) {
  return (text || "").replace(/<br\s*\/?>/gi, "\n");
}

function renderMarkdownWithCollapsibleThinking(text) {
  const source = normalizeBreakTags(text);
  const thinkingBlockRegex =
    /<think>([\s\S]*?)<\/think>|<thinking>([\s\S]*?)<\/thinking>|```thinking\s*([\s\S]*?)```|```thoughts?\s*([\s\S]*?)```/gi;

  const blocks = [];
  let lastIndex = 0;
  let match;

  while ((match = thinkingBlockRegex.exec(source)) !== null) {
    const plainPart = source.slice(lastIndex, match.index);
    if (plainPart.trim()) {
      blocks.push({ type: "plain", content: plainPart });
    }

    const thinkingPart = (match[1] || match[2] || match[3] || match[4] || "").trim();
    if (thinkingPart) {
      blocks.push({ type: "thinking", content: thinkingPart });
    }

    lastIndex = thinkingBlockRegex.lastIndex;
  }

  const tail = source.slice(lastIndex);
  if (tail.trim()) {
    blocks.push({ type: "plain", content: tail });
  }

  if (blocks.length === 0) {
    return markdown.render(source);
  }

  return blocks
    .map((block) => {
      if (block.type === "plain") {
        return markdown.render(block.content);
      }

      return `<details class="thought-block">
<summary>思考过程（点击展开）</summary>
<div class="thought-content">${markdown.render(block.content)}</div>
</details>`;
    })
    .join("");
}

function renderModelContent(item) {
  if (item.error) {
    return renderMarkdownWithCollapsibleThinking(`**Error:** ${item.error}`);
  }
  if (item.content) {
    return renderMarkdownWithCollapsibleThinking(item.content);
  }
  if (item.done) {
    return renderMarkdownWithCollapsibleThinking("_模型未返回文本，请检查 API/模型配置_");
  }
  return renderMarkdownWithCollapsibleThinking("_等待输出..._");
}

onMounted(async () => {
  await Promise.all([initSession(), loadConfigs()]);
});

async function initSession() {
  try {
    const session = await createSession("Chat Session");
    sessionId.value = session.id;
  } catch (error) {
    ElMessage.error(error.message || "初始化会话失败");
  }
}

async function loadConfigs() {
  try {
    apiConfigs.value = await fetchConfigs();
  } catch (error) {
    ElMessage.error(error.message || "加载配置失败");
  }
}

function openConfigDialog() {
  configDialogVisible.value = true;
}

function onConfigSaved() {
  loadConfigs();
}

function clearModelStates() {
  Object.keys(stateMap).forEach((key) => delete stateMap[key]);
}

function initPanelsByEnabledConfigs() {
  clearModelStates();
  apiConfigs.value
    .filter((cfg) => cfg.enabled)
    .forEach((cfg) => {
      const modelTag = cfg.name?.trim() || cfg.modelName;
      stateMap[modelTag] = {
        model: modelTag,
        content: "",
        done: false,
        error: ""
      };
    });
}

async function send() {
  const text = prompt.value.trim();
  if (!text) {
    ElMessage.warning("请输入内容后再发送");
    return;
  }

  if (!sessionId.value) {
    ElMessage.error("会话尚未初始化");
    return;
  }

  await loadConfigs();
  const enabled = apiConfigs.value.filter((cfg) => cfg.enabled);
  if (enabled.length === 0) {
    ElMessage.warning("请先配置并启用至少一个 API");
    return;
  }

  initPanelsByEnabledConfigs();
  loading.value = true;

  if (controller) {
    controller.abort();
  }
  controller = new AbortController();

  try {
    await sendPromptStream(sessionId.value, text, onStreamEvent, controller.signal);
  } catch (error) {
    ElMessage.error(error.message || "流式请求失败");
  } finally {
    loading.value = false;
    controller = null;
  }
}

function onStreamEvent(event) {
  const model = event.model || "Unknown";
  if (!stateMap[model]) {
    stateMap[model] = { model, content: "", done: false, error: "" };
  }

  if (event.delta) {
    stateMap[model].content += event.delta;
  }
  if (event.error) {
    stateMap[model].error = event.error;
  }
  if (event.done) {
    stateMap[model].done = true;
  }
}

async function clear() {
  if (controller) {
    controller.abort();
    controller = null;
  }
  loading.value = false;

  const oldSessionId = sessionId.value;
  prompt.value = "";
  clearModelStates();

  try {
    if (oldSessionId) {
      await deleteSession(oldSessionId);
    }
  } catch {
    // Ignore delete failures and still create a fresh session.
  }

  await initSession();
  ElMessage.success("已清空并重置上下文");
}
</script>

<style scoped>
.demo-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.demo-header h2 {
  margin: 0;
}

.demo-header p {
  margin-top: 8px;
  color: #5f6673;
}

.api-card,
.input-card {
  margin-top: 16px;
  background: #fff;
  border: 1px solid #dfe4f0;
  border-radius: 12px;
  padding: 14px;
}

.api-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.api-head h3 {
  margin: 0;
  font-size: 16px;
}

.api-empty,
.empty-result {
  color: #7b8190;
  font-size: 13px;
  margin-top: 12px;
  background: #fff;
  border: 1px dashed #d7ddea;
  border-radius: 10px;
  padding: 14px;
}

.api-list {
  display: grid;
  gap: 8px;
}

.api-item {
  border: 1px solid #e3e7f1;
  border-radius: 8px;
  padding: 10px;
  background: #fafcff;
}

.api-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.api-url {
  margin-top: 6px;
  font-size: 12px;
  color: #5f6673;
  word-break: break-all;
}

.actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.result-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}

.result-card {
  border: 1px solid #dfe4f0;
  min-height: 230px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.content {
  word-break: break-word;
  line-height: 1.7;
}

.content :deep(p) {
  margin: 0 0 10px;
}

.content :deep(p:last-child) {
  margin-bottom: 0;
}

.content :deep(pre) {
  margin: 10px 0;
  background: #1f2937;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  overflow: auto;
}

.content :deep(code:not(pre code)) {
  background: #eef2f8;
  border-radius: 4px;
  padding: 1px 4px;
}

.content :deep(ul),
.content :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.content :deep(a) {
  color: var(--primary-color);
}

.content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #d7ddea;
  border-radius: 8px;
  overflow: hidden;
  margin: 12px 0;
  background: #ffffff;
}

.content :deep(th),
.content :deep(td) {
  border: 1px solid #d7ddea;
  padding: 10px 12px;
  vertical-align: top;
}

.content :deep(th) {
  background: #f5f8ff;
  font-weight: 700;
}

.content :deep(tbody tr:nth-child(even)) {
  background: #fafcff;
}

.content :deep(.thought-block) {
  margin: 12px 0;
  padding: 8px 10px;
  border: 1px dashed #c9d4ea;
  border-radius: 8px;
  background: #f8fbff;
}

.content :deep(.thought-block > summary) {
  cursor: pointer;
  user-select: none;
  color: #4b5563;
  font-weight: 600;
}

.content :deep(.thought-content) {
  margin-top: 8px;
}
</style>
