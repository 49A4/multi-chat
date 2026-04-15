<template>
  <div class="demo-page">
    <section :class="['workspace', { 'with-sidebar': sidebarVisible }]">
      <section class="flow-board" @click="handleMarkdownAction">
        <div
          ref="flowCanvasRef"
          :class="['flow-canvas', { dragging: dragState.active || panState.active }]"
          :style="flowCanvasStyle"
          @pointerdown="onCanvasPointerDown"
          @wheel="onCanvasWheel"
        >
          <div class="flow-layer" :style="flowLayerStyle">
            <el-card
              v-for="item in modelList"
              :key="item.model"
              shadow="never"
              :class="['result-card', 'flow-node', { dragging: dragState.active && dragState.model === item.model }]"
              :style="nodeStyle(item)"
            >
              <template #header>
                <div class="card-head drag-handle" @pointerdown="onNodePointerDown($event, item.model)">
                  <strong>{{ item.title || item.model }}</strong>
                  <div class="card-meta">
                    <el-button
                      text
                      size="small"
                      class="retry-btn"
                      :loading="Boolean(retryingMap[item.model])"
                      @pointerdown.stop
                      @click.stop="regenerateModel(item.model)"
                    >
                      重试
                    </el-button>
                    <el-tag v-if="item.error" type="danger" size="small">异常</el-tag>
                    <el-tag v-else-if="item.done" type="success" size="small">完成</el-tag>
                    <el-tag v-else type="info" size="small">流式中</el-tag>
                  </div>
                </div>
              </template>
              <div class="content markdown-body" v-html="item.renderedHtml"></div>
            </el-card>
          </div>
        </div>
      </section>
    </section>

    <button
      ref="sidebarPeekRef"
      class="sidebar-peek"
      :class="{ open: sidebarVisible }"
      type="button"
      @mouseenter="openSidebar"
      @click="toggleSidebar"
      :title="sidebarVisible ? '收起侧边栏' : '展开侧边栏'"
    >
      {{ sidebarVisible ? "›" : "‹" }}
    </button>

    <aside
      ref="sidebarPanelRef"
      :class="['model-sidebar-panel', { open: sidebarVisible }]"
      @mouseenter="onSidebarEnter"
      @mouseleave="onSidebarLeave"
    >
      <div class="sidebar-head">
        <h3>模型侧栏</h3>
        <el-button text @click="sidebarVisible = false">收起</el-button>
      </div>
      <div class="sidebar-actions">
        <el-button size="small" @click="loadConfigs">刷新模型</el-button>
        <el-button size="small" type="primary" plain @click="openConfigDialog">API 配置</el-button>
      </div>

      <div v-if="apiConfigs.length === 0" class="api-empty">暂无配置，请先添加模型 API。</div>
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
    </aside>

    <button
      class="input-peek"
      :class="{ open: !inputCollapsed, 'with-sidebar': sidebarVisible }"
      type="button"
      :title="inputCollapsed ? '展开输入栏' : '收起输入栏'"
      @mouseenter="openInputPanel"
      @click="toggleInputPanel"
    >
      {{ inputCollapsed ? "▴" : "▾" }}
    </button>

    <section
      :class="['input-card', { 'with-sidebar': sidebarVisible, collapsed: inputCollapsed }]"
      @mouseenter="openInputPanel"
      @mouseleave="onInputPanelLeave"
    >
      <template v-if="!inputCollapsed">
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="3"
          resize="none"
          placeholder="例如：请解释一下并发流式渲染"
          @keydown="onPromptKeydown"
        />
        <div class="actions">
          <el-button @click="resetLayout">重置布局</el-button>
          <el-button @click="clear">清空输出</el-button>
          <el-button type="primary" :loading="loading" @click="send">发送 (Enter)</el-button>
        </div>
      </template>
    </section>

    <ApiConfigDialog v-model="configDialogVisible" @saved="onConfigSaved" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
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
const sidebarVisible = ref(false);
const apiConfigs = ref([]);
const lastSentPrompt = ref("");
const inputCollapsed = ref(false);

const stateMap = reactive({});
const retryingMap = reactive({});
const activeModelKeys = ref(new Set());
let controller = null;
const retryControllers = new Map();
const acceptIncomingEvents = ref(true);
const dirtyModels = new Set();
const STREAM_FLUSH_MS = 180;
let flushTimer = null;
let mathTypesetTimer = null;
let sidebarCloseTimer = null;
let inputPanelCloseTimer = null;
let activeDragEl = null;
const flowCanvasRef = ref(null);
const sidebarPanelRef = ref(null);
const sidebarPeekRef = ref(null);
const FLOW_LAYOUT_STORAGE_KEY = "multi-chat-flow-layout-v1";
const CHAT_UI_STORAGE_KEY = "multi-chat-ui-state-v1";
let flowTopZ = 1;
const flowLayoutCache = ref({});
const nodeLayoutMap = reactive({});

const dragState = reactive({
  active: false,
  model: "",
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  pendingX: 0,
  pendingY: 0,
  rafId: 0
});

const panState = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0
});

const canvasOffset = reactive({
  x: 0,
  y: 0
});

const flowCanvasStyle = computed(() => ({
  backgroundPosition: `${Math.round(canvasOffset.x)}px ${Math.round(canvasOffset.y)}px`
}));

const flowLayerStyle = computed(() => ({
  transform: `translate3d(${Math.round(canvasOffset.x)}px, ${Math.round(canvasOffset.y)}px, 0)`
}));

const modelList = computed(() => Object.values(stateMap));

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
});

function parseModelTag(rawModelTag) {
  const text = (rawModelTag || "").trim();
  const sep = text.lastIndexOf("||");
  if (sep <= 0 || sep >= text.length - 2) {
    return { key: text, title: text };
  }
  return {
    key: text,
    title: text.slice(0, sep)
  };
}

function buildModelTagFromConfig(cfg) {
  const title = (cfg?.name || "").trim() || cfg?.modelName || "Unknown";
  const id = (cfg?.id || "").trim();
  if (!id) {
    return title;
  }
  return `${title}||${id}`;
}

function renderCodeBlock(code, info) {
  const normalizedCode = (code || "").replace(/\n$/, "");
  const rawLang = (info || "").trim().split(/\s+/)[0] || "text";
  const normalizedLang = rawLang.toLowerCase();
  const langClass = normalizedLang.replace(/[^a-z0-9_+-]/g, "") || "text";
  const langLabel = markdown.utils.escapeHtml(normalizedLang);
  const highlighted = hljs.getLanguage(normalizedLang)
    ? hljs.highlight(normalizedCode, { language: normalizedLang }).value
    : markdown.utils.escapeHtml(normalizedCode);

  return `<div class="code-block">
<div class="code-toolbar">
<span class="code-lang">${langLabel}</span>
<button type="button" class="code-copy-btn" aria-label="Copy code">复制</button>
</div>
<pre><code class="hljs language-${langClass}">${highlighted}</code></pre>
</div>`;
}

markdown.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  return renderCodeBlock(token.content, token.info);
};

markdown.renderer.rules.table_open = () => '<div class="table-scroll"><table>';
markdown.renderer.rules.table_close = () => "</table></div>";

function normalizeBreakTags(text) {
  return (text || "").replace(/<br\s*\/?>/gi, "\n");
}

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "button",
  "code",
  "del",
  "details",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
]);

const BLOCKED_HTML_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta"]);
const GLOBAL_ALLOWED_ATTRS = new Set(["class", "title", "role", "aria-label", "aria-hidden"]);
const TAG_ALLOWED_ATTRS = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  input: new Set(["type", "checked", "disabled"]),
  button: new Set(["type"]),
  details: new Set(["open"]),
  code: new Set(["class"]),
  span: new Set(["class"]),
  div: new Set(["class"]),
  pre: new Set(["class"])
};

function isSafeUrl(value) {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) {
    return false;
  }
  if (
    raw.startsWith("javascript:") ||
    raw.startsWith("vbscript:") ||
    raw.startsWith("data:") ||
    raw.startsWith("file:")
  ) {
    return false;
  }
  return (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("/") ||
    raw.startsWith("./") ||
    raw.startsWith("../") ||
    raw.startsWith("#")
  );
}

function sanitizeRenderedHtml(html) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html || ""}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) {
    return html;
  }

  sanitizeElementTree(root);
  return root.innerHTML;
}

function sanitizeElementTree(root) {
  Array.from(root.children).forEach((child) => sanitizeElementNode(child));
}

function sanitizeElementNode(el) {
  if (!(el instanceof Element)) {
    return;
  }

  const tag = el.tagName.toLowerCase();

  if (BLOCKED_HTML_TAGS.has(tag)) {
    el.remove();
    return;
  }

  if (!ALLOWED_HTML_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) {
      el.remove();
      return;
    }

    const childElements = Array.from(el.children);
    const fragment = document.createDocumentFragment();
    while (el.firstChild) {
      fragment.appendChild(el.firstChild);
    }
    parent.replaceChild(fragment, el);
    childElements.forEach((child) => sanitizeElementNode(child));
    return;
  }

  sanitizeElementAttributes(el, tag);
  Array.from(el.children).forEach((child) => sanitizeElementNode(child));
}

function sanitizeElementAttributes(el, tag) {
  const attrs = Array.from(el.attributes);
  const tagAllowed = TAG_ALLOWED_ATTRS[tag] || new Set();

  attrs.forEach((attr) => {
    const name = attr.name.toLowerCase();
    const value = attr.value || "";

    if (name.startsWith("on")) {
      el.removeAttribute(attr.name);
      return;
    }

    const isAllowed = GLOBAL_ALLOWED_ATTRS.has(name) || tagAllowed.has(name);
    if (!isAllowed) {
      el.removeAttribute(attr.name);
      return;
    }

    if ((name === "href" || name === "src") && !isSafeUrl(value)) {
      el.removeAttribute(attr.name);
      return;
    }

    if (tag === "a" && name === "target" && value === "_blank") {
      const currentRel = (el.getAttribute("rel") || "").trim();
      const relSet = new Set(currentRel ? currentRel.split(/\s+/) : []);
      relSet.add("noopener");
      relSet.add("noreferrer");
      el.setAttribute("rel", Array.from(relSet).join(" "));
    }
  });
}

function extractMathSegments(text) {
  const segments = [];
  let output = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\") {
      output += text.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (ch === "$") {
      const isDisplay = text[i + 1] === "$";
      const delimiterLength = isDisplay ? 2 : 1;
      let j = i + delimiterLength;
      let end = -1;

      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }

        if (isDisplay) {
          if (text[j] === "$" && text[j + 1] === "$") {
            end = j;
            break;
          }
        } else if (text[j] === "$") {
          end = j;
          break;
        }
        j += 1;
      }

      if (end !== -1) {
        const tex = text.slice(i + delimiterLength, end);
        const token = `@@MATH_${segments.length}@@`;
        segments.push({ tex, display: isDisplay });
        output += token;
        i = end + delimiterLength;
        continue;
      }
    }

    output += ch;
    i += 1;
  }

  return { text: output, segments };
}

function restoreMathSegments(html, segments) {
  if (!segments.length) {
    return html;
  }

  return html.replace(/@@MATH_(\d+)@@/g, (raw, index) => {
    const segment = segments[Number(index)];
    if (!segment) {
      return raw;
    }

    const tex = segment.display ? normalizeDisplayMathTex(segment.tex) : segment.tex;
    const escapedTex = markdown.utils.escapeHtml(tex);
    if (segment.display) {
      return `<div class="math-block">\\[${escapedTex}\\]</div>`;
    }
    return `<span class="math-inline">\\(${escapedTex}\\)</span>`;
  });
}

function normalizeDisplayMathTex(tex) {
  const source = tex || "";
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return source;
  }

  // Keep original content if user already uses TeX environments or explicit line breaks.
  if (/\\\\|\\begin\s*\{[^}]+\}/.test(source)) {
    return source;
  }

  return `\\begin{aligned}\n${lines.join(" \\\\\n")}\n\\end{aligned}`;
}

function enhanceTaskListHtml(html) {
  if (!html || html.indexOf("<li>") === -1) {
    return html;
  }

  const withTaskItems = html.replace(/<li>\s*\[( |x|X)\]\s*/g, (_, marker) => {
    const checked = String(marker).toLowerCase() === "x" ? " checked" : "";
    return `<li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox"${checked} disabled> `;
  });

  return withTaskItems.replace(/<ul>\s*(?=<li class="task-list-item")/g, '<ul class="contains-task-list">');
}

function renderMarkdownPreservingMath(source) {
  const normalized = normalizeBreakTags(source);
  const { text, segments } = extractMathSegments(normalized);
  const rendered = markdown.render(text);
  const withTasks = enhanceTaskListHtml(rendered);
  const withMath = restoreMathSegments(withTasks, segments);
  return sanitizeRenderedHtml(withMath);
}

function stripThinkingBlocks(text) {
  if (!text) {
    return "";
  }

  const thinkingBlockRegex =
    /<think>[\s\S]*?<\/think>|<thinking>[\s\S]*?<\/thinking>|```thinking\s*[\s\S]*?```|```thoughts?\s*[\s\S]*?```/gi;

  const withoutThinking = text.replace(thinkingBlockRegex, "");

  return withoutThinking
    .replace(/^\s*(?:or|或者)\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    return renderMarkdownPreservingMath(source);
  }

  return blocks
    .map((block) => {
      if (block.type === "plain") {
        return renderMarkdownPreservingMath(block.content);
      }

      return `<details class="thought-block">
<summary>思考过程（点击展开）</summary>
<div class="thought-content">${renderMarkdownPreservingMath(block.content)}</div>
</details>`;
    })
    .join("");
}

function renderStreamingText(text) {
  const escaped = markdown.utils.escapeHtml(text || "");
  if (!escaped) {
    return `<p class="stream-placeholder">等待输出...</p>`;
  }
  return `<div class="stream-plain">${escaped.replace(/\n/g, "<br>")}</div>`;
}

function renderStreamingMarkdown(text) {
  if (!text) {
    return renderStreamingText("");
  }
  try {
    const rendered = renderMarkdownWithCollapsibleThinking(text);
    if (rendered && rendered.trim()) {
      return rendered;
    }
  } catch {
    // Fallback to escaped plain text when markdown cannot be incrementally parsed.
  }
  return renderStreamingText(text);
}

function buildRenderedContent(item) {
  if (item.error) {
    const renderedError = renderMarkdownWithCollapsibleThinking(`**Error:** ${item.error}`);
    return renderedError || renderMarkdownPreservingMath("**Error:** 未知错误");
  }
  if (!item.done) {
    return renderStreamingMarkdown(item.content);
  }
  if (!item.content) {
    return renderMarkdownWithCollapsibleThinking("_模型未返回文本，请检查 API/模型配置_");
  }
  const rendered = renderMarkdownWithCollapsibleThinking(item.content);
  if (rendered) {
    return rendered;
  }
  return renderMarkdownWithCollapsibleThinking("_模型未返回可展示内容（已隐藏思考过程）_");
}

function loadFlowLayout() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(FLOW_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveChatUiState() {
  if (typeof window === "undefined") {
    return;
  }

  const models = modelList.value.map((item) => ({
    model: item.model,
    title: item.title || item.model,
    content: `${item.content || ""}${item.pendingDelta || ""}`,
    done: Boolean(item.done),
    error: item.error || ""
  }));

  const payload = {
    prompt: prompt.value || "",
    lastSentPrompt: lastSentPrompt.value || "",
    canvasOffset: {
      x: Number.isFinite(canvasOffset.x) ? canvasOffset.x : 0,
      y: Number.isFinite(canvasOffset.y) ? canvasOffset.y : 0
    },
    models
  };

  window.localStorage.setItem(CHAT_UI_STORAGE_KEY, JSON.stringify(payload));
}

function restoreChatUiState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = window.localStorage.getItem(CHAT_UI_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }

    prompt.value = typeof parsed.prompt === "string" ? parsed.prompt : "";
    lastSentPrompt.value = typeof parsed.lastSentPrompt === "string" ? parsed.lastSentPrompt : "";

    const savedOffset = parsed.canvasOffset || {};
    canvasOffset.x = Number.isFinite(savedOffset.x) ? savedOffset.x : 0;
    canvasOffset.y = Number.isFinite(savedOffset.y) ? savedOffset.y : 0;

    const models = Array.isArray(parsed.models) ? parsed.models : [];
    if (!models.length) {
      return;
    }

    clearModelStates();
    models.forEach((saved, index) => {
      const modelTag = (saved?.model || "").trim();
      if (!modelTag) {
        return;
      }
      const parsedTag = parseModelTag(modelTag);
      const title = (saved?.title || "").trim() || parsedTag.title || parsedTag.key;
      ensureNodeLayout(parsedTag.key, index);
      const restored = {
        model: parsedTag.key,
        title,
        content: typeof saved.content === "string" ? saved.content : "",
        pendingDelta: "",
        renderedHtml: "",
        done: Boolean(saved.done),
        error: typeof saved.error === "string" ? saved.error : ""
      };
      restored.renderedHtml = buildRenderedContent(restored);
      stateMap[model] = restored;
    });
    scheduleMathTypeset();
  } catch {
    // Ignore corrupted local cache.
  }
}

function clearChatUiStateStorage() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(CHAT_UI_STORAGE_KEY);
}

function saveFlowLayout() {
  if (typeof window === "undefined") {
    return;
  }

  const map = {};
  Object.keys(nodeLayoutMap).forEach((model) => {
    const layout = nodeLayoutMap[model];
    if (!layout) {
      return;
    }
    map[model] = { x: layout.x, y: layout.y };
  });
  flowLayoutCache.value = map;
  window.localStorage.setItem(FLOW_LAYOUT_STORAGE_KEY, JSON.stringify(map));
}

function getDefaultPosition(index) {
  const safeIndex = Number.isFinite(index) ? index : 0;
  const col = safeIndex % 3;
  const row = Math.floor(safeIndex / 3);
  return {
    x: 20 + col * 360,
    y: 20 + row * 260
  };
}

function pickInitialPosition(model, index) {
  const saved = flowLayoutCache.value[model];
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return { x: saved.x, y: saved.y };
  }
  return getDefaultPosition(index);
}

function ensureNodeLayout(model, index = 0) {
  if (nodeLayoutMap[model]) {
    return nodeLayoutMap[model];
  }

  const pos = pickInitialPosition(model, index);
  nodeLayoutMap[model] = {
    x: pos.x,
    y: pos.y,
    z: ++flowTopZ
  };
  return nodeLayoutMap[model];
}

function createModelState(model, index = 0) {
  const parsedTag = parseModelTag(model);
  const modelKey = parsedTag.key || model;
  ensureNodeLayout(modelKey, index);
  return {
    model: modelKey,
    title: parsedTag.title || modelKey,
    content: "",
    pendingDelta: "",
    renderedHtml: renderStreamingMarkdown(""),
    done: false,
    error: ""
  };
}

function nodeStyle(item) {
  const layout = nodeLayoutMap[item.model];
  if (!layout) {
    return {
      transform: "translate3d(0px, 0px, 0)",
      zIndex: 1
    };
  }
  return {
    transform: `translate3d(${layout.x}px, ${layout.y}px, 0)`,
    zIndex: layout.z
  };
}

function bringToFront(layout) {
  if (!layout) {
    return;
  }
  layout.z = ++flowTopZ;
}

function onNodePointerDown(event, model) {
  if (event.button !== 0) {
    return;
  }

  const layout = nodeLayoutMap[model];
  if (!layout) {
    return;
  }

  bringToFront(layout);
  dragState.active = true;
  dragState.model = model;
  dragState.pointerId = event.pointerId;
  activeDragEl = event.currentTarget?.closest?.(".flow-node") || null;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.originX = layout.x;
  dragState.originY = layout.y;
  dragState.pendingX = layout.x;
  dragState.pendingY = layout.y;
  if (activeDragEl) {
    activeDragEl.style.willChange = "transform";
  }
  if (event.currentTarget?.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  event.stopPropagation();
  event.preventDefault();
}

function onCanvasPointerDown(event) {
  if (event.button !== 0 || dragState.active) {
    return;
  }

  const target = event.target;
  if (target instanceof Element && target.closest(".flow-node")) {
    return;
  }

  panState.active = true;
  panState.pointerId = event.pointerId;
  panState.startX = event.clientX;
  panState.startY = event.clientY;
  panState.originX = canvasOffset.x;
  panState.originY = canvasOffset.y;
  if (event.currentTarget?.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
}

function normalizeWheelDelta(delta, deltaMode) {
  if (!Number.isFinite(delta)) {
    return 0;
  }
  if (deltaMode === 1) {
    return delta * 16;
  }
  if (deltaMode === 2) {
    return delta * (typeof window !== "undefined" ? window.innerHeight : 800);
  }
  return delta;
}

function onCanvasWheel(event) {
  if (event.ctrlKey) {
    return;
  }

  const target = event.target;
  if (target instanceof Element && target.closest(".code-block pre, .mjx-container")) {
    return;
  }

  const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);
  if (!deltaY) {
    return;
  }

  canvasOffset.y -= deltaY;
  event.preventDefault();
}

function onWindowPointerMove(event) {
  if (panState.active) {
    if (panState.pointerId != null && event.pointerId !== panState.pointerId) {
      return;
    }

    canvasOffset.x = panState.originX + (event.clientX - panState.startX);
    canvasOffset.y = panState.originY + (event.clientY - panState.startY);
    event.preventDefault();
    return;
  }

  if (!dragState.active || !dragState.model) {
    return;
  }

  if (dragState.pointerId != null && event.pointerId !== dragState.pointerId) {
    return;
  }

  const layout = nodeLayoutMap[dragState.model];
  if (!layout) {
    return;
  }

  dragState.pendingX = dragState.originX + (event.clientX - dragState.startX);
  dragState.pendingY = dragState.originY + (event.clientY - dragState.startY);
  event.preventDefault();

  if (!dragState.rafId) {
    dragState.rafId = window.requestAnimationFrame(() => {
      dragState.rafId = 0;
      if (activeDragEl) {
        activeDragEl.style.transform = `translate3d(${Math.round(dragState.pendingX)}px, ${Math.round(dragState.pendingY)}px, 0)`;
      }
    });
  }
}

function stopDragging() {
  if (!dragState.active) {
    return;
  }

  if (dragState.rafId) {
    window.cancelAnimationFrame(dragState.rafId);
    dragState.rafId = 0;
  }

  if (dragState.model && nodeLayoutMap[dragState.model]) {
    nodeLayoutMap[dragState.model].x = Math.round(dragState.pendingX);
    nodeLayoutMap[dragState.model].y = Math.round(dragState.pendingY);
  }

  if (activeDragEl) {
    activeDragEl.style.willChange = "auto";
  }

  dragState.active = false;
  dragState.model = "";
  dragState.pointerId = null;
  activeDragEl = null;
  saveFlowLayout();
}

function stopCanvasPanning() {
  if (!panState.active) {
    return;
  }

  panState.active = false;
  panState.pointerId = null;
}

function onWindowPointerUp() {
  stopCanvasPanning();
  stopDragging();
}

function resetLayout() {
  canvasOffset.x = 0;
  canvasOffset.y = 0;
  modelList.value.forEach((item, index) => {
    const pos = getDefaultPosition(index);
    const layout = ensureNodeLayout(item.model, index);
    layout.x = pos.x;
    layout.y = pos.y;
    bringToFront(layout);
  });
  saveFlowLayout();
}

function flushDirtyModels() {
  if (dirtyModels.size === 0) {
    return;
  }

  const models = Array.from(dirtyModels);
  dirtyModels.clear();

  models.forEach((model) => {
    const item = stateMap[model];
    if (!item) {
      return;
    }

    if (item.pendingDelta) {
      item.content += item.pendingDelta;
      item.pendingDelta = "";
    }

    item.renderedHtml = buildRenderedContent(item);
  });

  saveChatUiState();
  scheduleMathTypeset();
}

function flushDirtyModelsNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushDirtyModels();
}

function scheduleModelFlush(model) {
  dirtyModels.add(model);

  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushDirtyModels();
  }, STREAM_FLUSH_MS);
}

function scheduleMathTypeset() {
  if (mathTypesetTimer) {
    return;
  }

  mathTypesetTimer = setTimeout(() => {
    mathTypesetTimer = null;
    void typesetMath();
  }, 80);
}

async function typesetMath() {
  if (typeof window === "undefined" || !window.MathJax) {
    return;
  }

  try {
    if (window.MathJax.startup?.promise) {
      await window.MathJax.startup.promise;
    }
    if (!window.MathJax.typesetPromise) {
      return;
    }

    await nextTick();
    const root = flowCanvasRef.value;
    if (!root) {
      return;
    }

    if (window.MathJax.typesetClear) {
      window.MathJax.typesetClear([root]);
    }
    await window.MathJax.typesetPromise([root]);
  } catch {
    // Ignore math render failures to avoid blocking chat rendering.
  }
}

onMounted(async () => {
  flowLayoutCache.value = loadFlowLayout();
  restoreChatUiState();
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);
  window.addEventListener("mousemove", onWindowMouseMoveForSidebar);
  await Promise.all([initSession(), loadConfigs()]);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerUp);
  window.removeEventListener("mousemove", onWindowMouseMoveForSidebar);
  clearSidebarCloseTimer();
  clearInputPanelCloseTimer();
  stopCanvasPanning();
  stopDragging();
  abortAllStreams();
  if (mathTypesetTimer) {
    clearTimeout(mathTypesetTimer);
    mathTypesetTimer = null;
  }
  flushDirtyModelsNow();
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

function clearSidebarCloseTimer() {
  if (sidebarCloseTimer) {
    clearTimeout(sidebarCloseTimer);
    sidebarCloseTimer = null;
  }
}

function clearInputPanelCloseTimer() {
  if (inputPanelCloseTimer) {
    clearTimeout(inputPanelCloseTimer);
    inputPanelCloseTimer = null;
  }
}

function openInputPanel() {
  clearInputPanelCloseTimer();
  inputCollapsed.value = false;
}

function toggleInputPanel() {
  clearInputPanelCloseTimer();
  inputCollapsed.value = !inputCollapsed.value;
}

function onInputPanelLeave() {
  clearInputPanelCloseTimer();
  inputPanelCloseTimer = setTimeout(() => {
    inputCollapsed.value = true;
    inputPanelCloseTimer = null;
  }, 160);
}

function openSidebar() {
  clearSidebarCloseTimer();
  sidebarVisible.value = true;
}

function toggleSidebar() {
  clearSidebarCloseTimer();
  sidebarVisible.value = !sidebarVisible.value;
}

function onSidebarEnter() {
  openSidebar();
}

function onSidebarLeave() {
  if (sidebarCloseTimer) {
    return;
  }
  sidebarCloseTimer = setTimeout(() => {
    sidebarVisible.value = false;
    sidebarCloseTimer = null;
  }, 120);
}

function onWindowMouseMoveForSidebar(event) {
  if (!sidebarVisible.value) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    onSidebarLeave();
    return;
  }

  const panel = sidebarPanelRef.value;
  const peek = sidebarPeekRef.value;
  const insidePanel = panel ? panel.contains(target) : false;
  const insidePeek = peek ? peek.contains(target) : false;

  if (insidePanel || insidePeek) {
    clearSidebarCloseTimer();
    return;
  }

  onSidebarLeave();
}

function clearModelStates() {
  stopDragging();
  flushDirtyModelsNow();
  dirtyModels.clear();
  activeModelKeys.value = new Set();
  Object.keys(retryingMap).forEach((key) => delete retryingMap[key]);
  Object.keys(stateMap).forEach((key) => delete stateMap[key]);
  Object.keys(nodeLayoutMap).forEach((key) => delete nodeLayoutMap[key]);
  saveChatUiState();
}

function abortAllStreams() {
  if (controller) {
    controller.abort();
    controller = null;
  }

  retryControllers.forEach((ctrl) => ctrl.abort());
  retryControllers.clear();
}

function initPanelsByEnabledConfigs() {
  clearModelStates();
  const keys = new Set();
  apiConfigs.value
    .filter((cfg) => cfg.enabled)
    .forEach((cfg, index) => {
      const modelTag = buildModelTagFromConfig(cfg);
      keys.add(parseModelTag(modelTag).key);
      stateMap[modelTag] = createModelState(modelTag, index);
    });
  activeModelKeys.value = keys;
}

async function send() {
  if (loading.value) {
    return;
  }

  const text = prompt.value.trim();
  if (!text) {
    ElMessage.warning("请输入内容后再发送");
    return;
  }

  loading.value = true;

  try {
    if (!sessionId.value) {
      await initSession();
    }
    if (!sessionId.value) {
      ElMessage.error("会话初始化失败，请稍后重试");
      return;
    }

    await loadConfigs();
    const enabled = apiConfigs.value.filter((cfg) => cfg.enabled);
    if (enabled.length === 0) {
      ElMessage.warning("请先配置并启用至少一个 API");
      return;
    }

    initPanelsByEnabledConfigs();
    lastSentPrompt.value = text;
    acceptIncomingEvents.value = true;

    abortAllStreams();
    controller = new AbortController();
    await sendPromptStream(sessionId.value, text, onStreamEvent, controller.signal);
  } catch (error) {
    ElMessage.error(error.message || "流式请求失败");
  } finally {
    flushDirtyModelsNow();
    loading.value = false;
    controller = null;
  }
}

function onStreamEvent(event) {
  if (!acceptIncomingEvents.value) {
    return;
  }

  const model = parseModelTag(event.model || "Unknown").key;
  if (!activeModelKeys.value.has(model) && !retryingMap[model]) {
    return;
  }
  if (!stateMap[model] && !loading.value && !retryingMap[model]) {
    return;
  }
  if (!stateMap[model]) {
    stateMap[model] = createModelState(model, modelList.value.length);
  }

  if (event.delta) {
    stateMap[model].pendingDelta += event.delta;
    scheduleModelFlush(model);
  }
  if (event.error) {
    stateMap[model].error = event.error;
    stateMap[model].done = true;
    delete retryingMap[model];
    scheduleModelFlush(model);
    flushDirtyModelsNow();
  }
  if (event.done) {
    stateMap[model].done = true;
    delete retryingMap[model];
    scheduleModelFlush(model);
    flushDirtyModelsNow();
  }
}

async function regenerateModel(model) {
  if (!model || loading.value) {
    return;
  }

  const basePrompt = (lastSentPrompt.value || prompt.value || "").trim();
  if (!basePrompt) {
    ElMessage.warning("没有可重试的提问内容，请先发送一次消息");
    return;
  }

  const item = stateMap[model];
  if (!item) {
    ElMessage.warning("未找到该模型卡片");
    return;
  }

  item.content = "";
  item.pendingDelta = "";
  item.error = "";
  item.done = false;
  item.renderedHtml = renderStreamingMarkdown("");
  retryingMap[model] = true;
  acceptIncomingEvents.value = true;
  saveChatUiState();

  const existingRetryController = retryControllers.get(model);
  if (existingRetryController) {
    existingRetryController.abort();
  }
  const retryController = new AbortController();
  retryControllers.set(model, retryController);
  let retrySessionId = "";
  const onRetryStreamEvent = (event) => {
    const eventModel = parseModelTag(event?.model || "Unknown").key;
    if (eventModel !== model) {
      return;
    }
    onStreamEvent(event);
  };
  try {
    const tempSession = await createSession(`Retry-${model}`);
    retrySessionId = tempSession.id;
    await sendPromptStream(
      retrySessionId,
      basePrompt,
      onRetryStreamEvent,
      retryController.signal,
      {
        targetModels: [model],
        appendUserMessage: true
      }
    );
  } catch (error) {
    if (error?.name !== "AbortError") {
      item.error = error.message || "重试失败";
      item.done = true;
      item.renderedHtml = buildRenderedContent(item);
      ElMessage.error(item.error);
    }
  } finally {
    if (retrySessionId) {
      try {
        await deleteSession(retrySessionId);
      } catch {
        // Ignore cleanup failure for retry temp session.
      }
    }
    retryControllers.delete(model);
    delete retryingMap[model];
    flushDirtyModelsNow();
    saveChatUiState();
  }
}

function onPromptKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
    return;
  }
  event.preventDefault();
  void send();
}

async function clear() {
  acceptIncomingEvents.value = false;
  abortAllStreams();
  loading.value = false;

  const oldSessionId = sessionId.value;
  prompt.value = "";
  lastSentPrompt.value = "";
  clearModelStates();
  clearChatUiStateStorage();

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

async function handleMarkdownAction(event) {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest(".code-copy-btn");
  if (!button) {
    return;
  }

  const block = button.closest(".code-block");
  const codeEl = block?.querySelector("code");
  const codeText = codeEl?.textContent || "";
  if (!codeText.trim()) {
    return;
  }

  try {
    await navigator.clipboard.writeText(codeText);
    const original = button.textContent;
    button.textContent = "已复制";
    setTimeout(() => {
      button.textContent = original || "复制";
    }, 1200);
  } catch {
    ElMessage.warning("复制失败，请手动复制");
  }
}

watch(prompt, () => {
  saveChatUiState();
});

watch(lastSentPrompt, () => {
  saveChatUiState();
});

watch(
  () => [canvasOffset.x, canvasOffset.y],
  () => {
    saveChatUiState();
  }
);
</script>

<style scoped>
.demo-page {
  height: 100vh;
  width: 100%;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.input-card {
  margin-top: 10px;
  background: #fff;
  border: 1px solid #dfe4f0;
  border-radius: 12px;
  padding: 10px 12px;
  flex-shrink: 0;
  transition: margin-right 160ms ease, padding 160ms ease, min-height 160ms ease;
}

.input-card.collapsed {
  padding: 0;
  min-height: 6px;
  border-color: transparent;
  background: transparent;
}

.input-card.with-sidebar {
  margin-right: 336px;
}

.input-peek {
  position: fixed;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  width: 36px;
  height: 22px;
  border: 1px solid #cfd6e3;
  border-radius: 10px 10px 0 0;
  background: rgba(255, 255, 255, 0.96);
  color: #334155;
  cursor: pointer;
  z-index: 70;
  line-height: 1;
  font-size: 14px;
}

.input-peek:hover {
  background: #f8fafc;
}

.input-peek.with-sidebar {
  left: calc(50% - 168px);
}

.input-peek.open {
  bottom: 122px;
}

.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  transition: margin-right 160ms ease;
}

.workspace.with-sidebar {
  margin-right: 336px;
}

.sidebar-peek {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  width: 24px;
  height: 70px;
  border: 1px solid #cfd6e3;
  border-right: 0;
  border-radius: 8px 0 0 8px;
  background: rgba(255, 255, 255, 0.96);
  color: #334155;
  font-size: 18px;
  cursor: pointer;
  z-index: 60;
}

.sidebar-peek.open {
  right: 336px;
}

.model-sidebar-panel {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 336px;
  padding: 12px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.98);
  border-left: 1px solid #dbe3f0;
  transform: translateX(100%);
  transition: transform 160ms ease;
  z-index: 55;
  overflow-y: auto;
}

.model-sidebar-panel.open {
  transform: translateX(0);
}

.api-empty {
  color: #7b8190;
  font-size: 13px;
  margin: 0;
  background: #fff;
  border: 1px dashed #d7ddea;
  border-radius: 10px;
  padding: 16px;
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
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.flow-board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.flow-canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 1px solid #dfe4f0;
  border-radius: 12px;
  overflow: hidden;
  background-color: #f8fafd;
  background-image:
    linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.14) 1px, transparent 1px);
  background-size: 24px 24px;
}

.flow-layer {
  position: relative;
  width: 100%;
  height: 100%;
}

.flow-canvas.dragging {
  cursor: grabbing;
}

.result-card {
  border: 1px solid #dfe4f0;
  min-height: 230px;
  width: 340px;
}

.flow-node {
  position: absolute;
  margin: 0;
  will-change: transform;
  contain: layout paint;
}

.flow-node.dragging {
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.retry-btn {
  padding: 0 6px;
}

.drag-handle {
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.flow-node.dragging .drag-handle {
  cursor: grabbing;
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-head h3 {
  margin: 0;
  font-size: 18px;
}

.sidebar-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.content {
  word-break: break-word;
  line-height: 1.7;
  overflow-x: auto;
}

.content :deep(p) {
  margin: 0 0 10px;
}

.content :deep(p:last-child) {
  margin-bottom: 0;
}

.content :deep(.code-block) {
  margin: 12px 0;
  border: 1px solid #d9dce3;
  border-bottom: none;
  border-radius: 10px;
  overflow: hidden;
  background: #eceef2;
}

.content :deep(.code-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #e4e7ec;
  border-bottom: 1px solid #d5d8df;
}

.content :deep(.code-lang) {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
  text-transform: lowercase;
}

.content :deep(.code-copy-btn) {
  border: 1px solid #c7cdd8;
  background: rgba(248, 249, 251, 0.92);
  color: #1f2937;
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 12px;
  cursor: pointer;
}

.content :deep(.code-copy-btn:hover) {
  background: #eef2f7;
}

.content :deep(.code-block pre) {
  margin: 0;
  padding: 0;
  background: #f3f4f6;
  overflow: auto;
}

.content :deep(.code-block pre code) {
  display: block;
  margin: 0;
  padding: 16px;
  font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace;
  font-size: 14px;
  line-height: 1.65;
  background: transparent !important;
  border: 0;
  box-shadow: none;
}

.content :deep(.code-block pre code.hljs) {
  padding: 16px;
  background: transparent !important;
}

.content :deep(code:not(pre code)) {
  background: #eef2f8;
  border-radius: 4px;
  padding: 1px 4px;
}

.content :deep(strong) {
  font-weight: 600;
  padding: 0 2px;
  border-radius: 2px;
  background: linear-gradient(transparent 35%, #ffd37a 35%, #ffd37a 88%, transparent 88%);
}

.content :deep(em) {
  color: #2563eb;
}

.content :deep(ul),
.content :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.content :deep(ul.contains-task-list) {
  list-style: none;
  padding-left: 0;
}

.content :deep(li.task-list-item) {
  list-style: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.content :deep(.task-list-item-checkbox) {
  width: 16px;
  height: 16px;
  margin-top: 4px;
  accent-color: #2563eb;
  pointer-events: none;
}

.content :deep(a) {
  color: var(--primary-color);
}

.content :deep(blockquote) {
  margin: 12px 0;
  padding: 16px 18px;
  border-left: 6px solid #eef1f5;
  border-radius: 12px;
  background: #c0c4cc;
  color: #111827;
}

.content :deep(blockquote > :first-child) {
  margin-top: 0;
}

.content :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

.content :deep(blockquote blockquote) {
  margin: 12px 0 0;
  background: #aab0ba;
  border-left-color: #f3f5f8;
}

.content :deep(blockquote blockquote blockquote) {
  background: #969daa;
}

.content :deep(table) {
  width: max-content;
  min-width: 100%;
  table-layout: auto;
  border-collapse: collapse;
  border: 1px solid #d7ddea;
  border-radius: 8px;
  overflow: hidden;
  margin: 0;
  background: #ffffff;
}

.content :deep(.table-scroll) {
  width: 100%;
  margin: 12px 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-gutter: stable;
  padding-bottom: 4px;
}

.content :deep(.table-scroll::-webkit-scrollbar) {
  height: 8px;
}

.content :deep(.table-scroll::-webkit-scrollbar-thumb) {
  background: #c2cad9;
  border-radius: 999px;
}

.content :deep(.table-scroll::-webkit-scrollbar-track) {
  background: #e9edf5;
  border-radius: 999px;
}

.content :deep(th),
.content :deep(td) {
  border: 1px solid #d7ddea;
  padding: 10px 12px;
  vertical-align: top;
  white-space: nowrap;
  word-break: keep-all;
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

.content :deep(.stream-placeholder) {
  margin: 0;
  color: #7b8190;
  font-style: italic;
}

.content :deep(.stream-plain) {
  margin: 0;
  color: #222;
}

.content :deep(.mjx-container) {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.content :deep(.mjx-container[display="true"]) {
  margin: 10px 0 !important;
}

.content :deep(.math-block) {
  margin: 10px 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.content :deep(.math-inline) {
  display: inline;
}
</style>
