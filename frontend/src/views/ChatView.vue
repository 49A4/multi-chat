<template>
  <div class="demo-page">
    <section :class="['workspace', { 'with-sidebar': sidebarVisible }]">
      <section class="flow-board" @click="handleMarkdownAction">
        <div
          ref="flowCanvasRef"
          :class="['flow-canvas', { dragging: dragState.active || panState.active }]"
          :style="flowCanvasStyle"
          title="Shift+空白拖拽创建总结块，普通空白拖拽平移画布"
          @pointerdown="onCanvasPointerDown"
          @wheel="onCanvasWheel"
        >
          <div class="flow-layer" :style="flowLayerStyle">
            <svg
              v-if="showQuestionNode && questionConnections.length > 0 && !dragState.active"
              class="flow-links"
            >
              <path
                v-for="conn in questionConnections"
                :key="conn.key"
                class="flow-link"
                :d="conn.path"
              />
            </svg>

            <section
              v-if="showQuestionNode"
              class="question-node question-drag-handle"
              :style="questionNodeStyle"
              @pointerdown="onQuestionPointerDown"
            >
              <div class="question-chip">我的问题</div>
              <div class="question-text">{{ questionNode.text }}</div>
              <div class="question-meta">{{ questionNode.timeText }}</div>
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
                  'drag-source-hidden': dragState.active && dragState.model === item.model
                }
              ]"
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

            <section
              v-if="dragGhost.active"
              ref="dragGhostRef"
              class="drag-ghost"
              :style="dragGhostStyle"
            >
              <div class="drag-ghost-title">{{ dragGhost.title }}</div>
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
                  @click="runSummaryBlock(block)"
                >
                  执行总结
                </el-button>
                <el-button size="small" @click="refreshSummarySelection(block)">
                  刷新范围
                </el-button>
                <el-button size="small" text type="danger" @click="removeSummaryBlock(block.id)">
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
              <div v-else class="content markdown-body summary-content" v-html="block.renderedHtml"></div>
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

    <button
      ref="sidebarPeekRef"
      class="sidebar-peek"
      :class="{ open: sidebarVisible }"
      type="button"
      @mouseenter="openSidebar"
      @click="toggleSidebar"
      :title="sidebarPinned ? '侧边栏已固定' : (sidebarVisible ? '收起侧边栏' : '展开侧边栏')"
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
        <div class="sidebar-head-actions">
          <el-button
            text
            size="small"
            class="pin-icon-btn"
            :class="{ active: sidebarPinned }"
            :title="sidebarPinned ? '取消固定侧边栏' : '固定侧边栏'"
            @click="toggleSidebarPinned"
          >
            固定
          </el-button>
          <el-button text size="small" @click="sidebarVisible = false">收起</el-button>
        </div>
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
      :title="inputPinned ? '输入栏已固定' : (inputCollapsed ? '展开输入栏' : '收起输入栏')"
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
          <el-button
            text
            size="small"
            class="pin-icon-btn pin-btn"
            :class="{ active: inputPinned }"
            :title="inputPinned ? '取消固定输入栏' : '固定输入栏'"
            @click="toggleInputPinned"
          >
            固定
          </el-button>
          <el-button @click="resetLayout">重置布局</el-button>
          <el-button @click="clear">新建对话</el-button>
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

const DEFAULT_MARKDOWN_PROMPT = "展示md的所有常见语法";

const prompt = ref(DEFAULT_MARKDOWN_PROMPT);
const loading = ref(false);
const configDialogVisible = ref(false);
const sidebarVisible = ref(false);
const apiConfigs = ref([]);
const lastSentPrompt = ref("");
const inputCollapsed = ref(false);
const sidebarPinned = ref(false);
const inputPinned = ref(true);

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
let dragRafId = 0;
let dragLatestClientX = 0;
let dragLatestClientY = 0;
let dragRenderX = 0;
let dragRenderY = 0;
const flowCanvasRef = ref(null);
const dragGhostRef = ref(null);
const sidebarPanelRef = ref(null);
const sidebarPeekRef = ref(null);
const FLOW_LAYOUT_STORAGE_KEY = "multi-chat-flow-layout-v1";
const CHAT_UI_STORAGE_KEY = "multi-chat-ui-state-v1";
let flowTopZ = 1;
const flowLayoutCache = ref({});
const nodeLayoutMap = reactive({});
const questionNode = reactive({
  text: "",
  timeText: "",
  x: 360,
  y: 24,
  width: 520,
  height: 104
});

const dragState = reactive({
  active: false,
  model: ""
});
const dragMeta = {
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  width: 340,
  height: 230
};
const dragGhost = reactive({
  active: false,
  title: "",
  x: 0,
  y: 0,
  width: 340,
  height: 230
});

const panState = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0
});

const summaryBlocks = ref([]);
const summaryCreateState = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0
});
const summaryControllers = new Map();
let summaryBlockSeq = 1;
const questionDragState = reactive({
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

const summaryDraftStyle = computed(() => {
  const rect = normalizeRect(
    summaryCreateState.startX,
    summaryCreateState.startY,
    summaryCreateState.currentX,
    summaryCreateState.currentY
  );
  return {
    transform: `translate3d(${Math.round(rect.x)}px, ${Math.round(rect.y)}px, 0)`,
    width: `${Math.round(rect.width)}px`,
    height: `${Math.round(rect.height)}px`
  };
});

const dragGhostStyle = computed(() => ({
  transform: `translate3d(${Math.round(dragGhost.x)}px, ${Math.round(dragGhost.y)}px, 0)`,
  width: `${Math.round(dragGhost.width)}px`,
  minHeight: `${Math.max(72, Math.round(dragGhost.height))}px`
}));

const modelList = computed(() => Object.values(stateMap));
const showQuestionNode = computed(() => Boolean((questionNode.text || "").trim()));
const questionNodeStyle = computed(() => ({
  transform: `translate3d(${Math.round(questionNode.x)}px, ${Math.round(questionNode.y)}px, 0)`,
  width: `${Math.round(questionNode.width)}px`,
  minHeight: `${Math.round(questionNode.height)}px`
}));
const questionConnections = computed(() => {
  if (!showQuestionNode.value) {
    return [];
  }
  const startX = questionNode.x + questionNode.width / 2;
  const startY = questionNode.y + questionNode.height;
  return modelList.value
    .map((item) => {
      const layout = nodeLayoutMap[item.model];
      if (!layout) {
        return null;
      }
      const escapedModel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(item.model) : item.model.replace(/"/g, '\\"');
      const cardEl = flowCanvasRef.value?.querySelector?.(`.flow-node[data-model="${escapedModel}"]`);
      const cardWidth = cardEl?.offsetWidth || 340;
      const endX = layout.x + cardWidth / 2;
      const endY = layout.y;
      const ctrlY = Math.round((startY + endY) / 2);
      const path = `M ${Math.round(startX)} ${Math.round(startY)} C ${Math.round(startX)} ${ctrlY}, ${Math.round(endX)} ${ctrlY}, ${Math.round(endX)} ${Math.round(endY)}`;
      return { key: item.model, path };
    })
    .filter(Boolean);
});

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
  return {};
}

function saveChatUiState() {
  return;
}

function restoreChatUiState() {
  return;
}

function clearChatUiStateStorage() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(CHAT_UI_STORAGE_KEY);
}

function clearFlowLayoutStorage() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(FLOW_LAYOUT_STORAGE_KEY);
}

function saveFlowLayout() {
  const map = {};
  Object.keys(nodeLayoutMap).forEach((model) => {
    const layout = nodeLayoutMap[model];
    if (!layout) {
      return;
    }
    map[model] = { x: layout.x, y: layout.y };
  });
  flowLayoutCache.value = map;
}

function getDefaultPosition(index) {
  const safeIndex = Number.isFinite(index) ? index : 0;
  const col = safeIndex % 3;
  const row = Math.floor(safeIndex / 3);
  return {
    x: 20 + col * 360,
    y: 220 + row * 280
  };
}

function setQuestionNodeContent(text) {
  questionNode.text = (text || "").trim();
  if (!questionNode.text) {
    questionNode.timeText = "";
    return;
  }
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  questionNode.timeText = `${mm}-${dd} ${hh}:${min}`;
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

function summaryBlockStyle(block) {
  return {
    transform: `translate3d(${Math.round(block.x)}px, ${Math.round(block.y)}px, 0)`,
    width: `${Math.round(block.width)}px`,
    minHeight: `${Math.round(block.height)}px`,
    zIndex: 999
  };
}

function normalizeRect(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { x, y, width, height };
}

function clientToLayerPoint(clientX, clientY) {
  const canvas = flowCanvasRef.value;
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left - canvasOffset.x,
    y: clientY - rect.top - canvasOffset.y
  };
}

function intersectsRect(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function getModelCardBounds(model) {
  const layout = nodeLayoutMap[model];
  if (!layout) {
    return null;
  }
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(model) : model.replace(/"/g, '\\"');
  const cardEl = flowCanvasRef.value?.querySelector?.(`.flow-node[data-model="${escaped}"]`);
  return {
    x: layout.x,
    y: layout.y,
    width: cardEl?.offsetWidth || 340,
    height: cardEl?.offsetHeight || 260
  };
}

function collectModelsInRect(rect) {
  return modelList.value
    .map((item) => item.model)
    .filter((model) => {
      const bounds = getModelCardBounds(model);
      if (!bounds) {
        return false;
      }
      return intersectsRect(rect, bounds);
    });
}

function refreshSummarySelection(block) {
  const rect = { x: block.x, y: block.y, width: block.width, height: block.height };
  block.selectedModels = collectModelsInRect(rect);
}

function removeSummaryBlock(blockId) {
  const existing = summaryControllers.get(blockId);
  if (existing) {
    existing.abort();
    summaryControllers.delete(blockId);
  }
  summaryBlocks.value = summaryBlocks.value.filter((item) => item.id !== blockId);
}

function startSummaryDraft(event) {
  const point = clientToLayerPoint(event.clientX, event.clientY);
  summaryCreateState.active = true;
  summaryCreateState.pointerId = event.pointerId;
  summaryCreateState.startX = point.x;
  summaryCreateState.startY = point.y;
  summaryCreateState.currentX = point.x;
  summaryCreateState.currentY = point.y;
}

function stopSummaryDraft() {
  if (!summaryCreateState.active) {
    return;
  }
  const rect = normalizeRect(
    summaryCreateState.startX,
    summaryCreateState.startY,
    summaryCreateState.currentX,
    summaryCreateState.currentY
  );

  summaryCreateState.active = false;
  summaryCreateState.pointerId = null;

  if (rect.width < 32 || rect.height < 32) {
    return;
  }

  const selectedModels = collectModelsInRect(rect);
  summaryBlocks.value.push({
    id: `summary-${summaryBlockSeq++}`,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    selectedModels,
    instruction: "总结这些回答",
    content: "",
    renderedHtml: renderMarkdownPreservingMath("_等待总结输出..._"),
    loading: false,
    error: ""
  });
}

async function runSummaryBlock(block) {
  if (!block || block.loading) {
    return;
  }

  refreshSummarySelection(block);
  if (!block.selectedModels.length) {
    ElMessage.warning("总结块内没有命中的回答卡片");
    return;
  }

  const enabled = apiConfigs.value.filter((cfg) => cfg.enabled);
  if (!enabled.length) {
    ElMessage.warning("请先配置并启用至少一个 API");
    return;
  }

  const instruction = (block.instruction || "").trim() || "总结这些回答";
  const sections = block.selectedModels
    .map((modelKey) => {
      const item = stateMap[modelKey];
      if (!item || !item.content) {
        return "";
      }
      return `### ${item.title || item.model}\n${item.content}`;
    })
    .filter(Boolean);

  if (!sections.length) {
    ElMessage.warning("命中卡片暂无可用文本");
    return;
  }

  const payloadPrompt = `${instruction}

请仅基于以下回答进行处理：

${sections.join("\n\n---\n\n")}`;

  const targetModel = buildModelTagFromConfig(enabled[0]);
  const previousCtrl = summaryControllers.get(block.id);
  if (previousCtrl) {
    previousCtrl.abort();
  }
  const summaryCtrl = new AbortController();
  summaryControllers.set(block.id, summaryCtrl);
  block.loading = true;
  block.error = "";
  block.content = "";
  block.renderedHtml = renderMarkdownPreservingMath("_总结中..._");

  try {
    await sendPromptStream(
      "",
      payloadPrompt,
      (event) => {
        const eventModel = parseModelTag(event?.model || "").key;
        if (eventModel && eventModel !== parseModelTag(targetModel).key) {
          return;
        }
        if (event.delta) {
          block.content += event.delta;
          block.renderedHtml = renderStreamingMarkdown(block.content);
        }
        if (event.error) {
          block.error = event.error;
        }
      },
      summaryCtrl.signal,
      {
        targetModels: [targetModel],
        appendUserMessage: true
      }
    );
    if (!block.error) {
      block.renderedHtml = renderMarkdownWithCollapsibleThinking(block.content || "_模型未返回文本_");
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      block.error = error?.message || "总结失败";
    }
  } finally {
    block.loading = false;
    if (block.error) {
      block.renderedHtml = renderMarkdownPreservingMath(`**Error:** ${block.error}`);
    }
    summaryControllers.delete(block.id);
  }
}

function bringToFront(layout) {
  if (!layout) {
    return;
  }
  layout.z = ++flowTopZ;
}

function onQuestionPointerDown(event) {
  if (event.button !== 0) {
    return;
  }
  questionDragState.active = true;
  questionDragState.pointerId = event.pointerId;
  questionDragState.startX = event.clientX;
  questionDragState.startY = event.clientY;
  questionDragState.originX = questionNode.x;
  questionDragState.originY = questionNode.y;
  if (event.currentTarget?.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  event.stopPropagation();
  event.preventDefault();
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
  dragMeta.pointerId = event.pointerId;
  activeDragEl = event.currentTarget?.closest?.(".flow-node") || null;
  dragMeta.startX = event.clientX;
  dragMeta.startY = event.clientY;
  dragMeta.originX = layout.x;
  dragMeta.originY = layout.y;
  dragMeta.width = activeDragEl?.offsetWidth || 340;
  dragMeta.height = activeDragEl?.offsetHeight || 230;
  dragLatestClientX = event.clientX;
  dragLatestClientY = event.clientY;
  dragRenderX = layout.x;
  dragRenderY = layout.y;
  dragGhost.active = true;
  dragGhost.title = stateMap[model]?.title || model;
  dragGhost.x = layout.x;
  dragGhost.y = layout.y;
  dragGhost.width = dragMeta.width;
  dragGhost.height = dragMeta.height;
  nextTick(() => {
    const ghostEl = dragGhostRef.value;
    if (ghostEl) {
      ghostEl.style.willChange = "transform";
      ghostEl.style.transform = `translate3d(${Math.round(dragRenderX)}px, ${Math.round(dragRenderY)}px, 0)`;
    }
  });
  if (event.currentTarget?.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  event.stopPropagation();
  event.preventDefault();
}

function onCanvasPointerDown(event) {
  if (event.button !== 0 || dragState.active || summaryCreateState.active || questionDragState.active) {
    return;
  }

  const target = event.target;
  if (target instanceof Element && target.closest(".flow-node, .summary-block, .question-node")) {
    return;
  }

  if (event.shiftKey) {
    startSummaryDraft(event);
  } else {
    panState.active = true;
    panState.pointerId = event.pointerId;
    panState.startX = event.clientX;
    panState.startY = event.clientY;
    panState.originX = canvasOffset.x;
    panState.originY = canvasOffset.y;
  }
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

  if (summaryCreateState.active) {
    if (summaryCreateState.pointerId != null && event.pointerId !== summaryCreateState.pointerId) {
      return;
    }
    const point = clientToLayerPoint(event.clientX, event.clientY);
    summaryCreateState.currentX = point.x;
    summaryCreateState.currentY = point.y;
    event.preventDefault();
    return;
  }

  if (questionDragState.active) {
    if (questionDragState.pointerId != null && event.pointerId !== questionDragState.pointerId) {
      return;
    }
    questionNode.x = Math.round(questionDragState.originX + (event.clientX - questionDragState.startX));
    questionNode.y = Math.round(questionDragState.originY + (event.clientY - questionDragState.startY));
    event.preventDefault();
    return;
  }

  if (!dragState.active || !dragState.model) {
    return;
  }

  if (dragMeta.pointerId != null && event.pointerId !== dragMeta.pointerId) {
    return;
  }

  const layout = nodeLayoutMap[dragState.model];
  if (!layout) {
    return;
  }

  dragLatestClientX = event.clientX;
  dragLatestClientY = event.clientY;

  if (!dragRafId) {
    dragRafId = window.requestAnimationFrame(() => {
      dragRafId = 0;
      dragRenderX = dragMeta.originX + (dragLatestClientX - dragMeta.startX);
      dragRenderY = dragMeta.originY + (dragLatestClientY - dragMeta.startY);
      const ghostEl = dragGhostRef.value;
      if (ghostEl) {
        ghostEl.style.transform = `translate3d(${Math.round(dragRenderX)}px, ${Math.round(dragRenderY)}px, 0)`;
      }
    });
  }
}

function stopDragging() {
  if (!dragState.active) {
    return;
  }

  if (dragRafId) {
    window.cancelAnimationFrame(dragRafId);
    dragRafId = 0;
  }

  if (dragState.model && nodeLayoutMap[dragState.model]) {
    nodeLayoutMap[dragState.model].x = Math.round(dragRenderX);
    nodeLayoutMap[dragState.model].y = Math.round(dragRenderY);
  }

  if (dragGhostRef.value) {
    dragGhostRef.value.style.willChange = "auto";
  }

  dragGhost.active = false;
  dragGhost.title = "";
  dragState.active = false;
  dragState.model = "";
  dragMeta.pointerId = null;
  dragMeta.startX = 0;
  dragMeta.startY = 0;
  dragMeta.originX = 0;
  dragMeta.originY = 0;
  dragLatestClientX = 0;
  dragLatestClientY = 0;
  dragRenderX = 0;
  dragRenderY = 0;
  dragGhost.x = 0;
  dragGhost.y = 0;
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

function stopQuestionDragging() {
  if (!questionDragState.active) {
    return;
  }
  questionDragState.active = false;
  questionDragState.pointerId = null;
}

function onWindowPointerUp() {
  stopSummaryDraft();
  stopCanvasPanning();
  stopQuestionDragging();
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
  flowLayoutCache.value = {};
  clearFlowLayoutStorage();
  clearChatUiStateStorage();
  prompt.value = DEFAULT_MARKDOWN_PROMPT;
  lastSentPrompt.value = "";
  setQuestionNodeContent("");
  canvasOffset.x = 0;
  canvasOffset.y = 0;
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);
  window.addEventListener("mousemove", onWindowMouseMoveForSidebar);
  await loadConfigs();
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerUp);
  window.removeEventListener("mousemove", onWindowMouseMoveForSidebar);
  clearSidebarCloseTimer();
  clearInputPanelCloseTimer();
  stopCanvasPanning();
  stopQuestionDragging();
  stopDragging();
  abortAllStreams();
  summaryControllers.forEach((ctrl) => ctrl.abort());
  summaryControllers.clear();
  if (mathTypesetTimer) {
    clearTimeout(mathTypesetTimer);
    mathTypesetTimer = null;
  }
  flushDirtyModelsNow();
});

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
  saveChatUiState();
}

function onInputPanelLeave() {
  if (inputPinned.value) {
    clearInputPanelCloseTimer();
    return;
  }
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
  saveChatUiState();
}

function onSidebarEnter() {
  openSidebar();
}

function onSidebarLeave() {
  if (sidebarPinned.value) {
    clearSidebarCloseTimer();
    return;
  }
  if (sidebarCloseTimer) {
    return;
  }
  sidebarCloseTimer = setTimeout(() => {
    sidebarVisible.value = false;
    sidebarCloseTimer = null;
  }, 120);
}

function onWindowMouseMoveForSidebar(event) {
  if (dragState.active || panState.active || questionDragState.active || summaryCreateState.active) {
    return;
  }
  if (!sidebarVisible.value || sidebarPinned.value) {
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

function toggleSidebarPinned() {
  sidebarPinned.value = !sidebarPinned.value;
  if (sidebarPinned.value) {
    clearSidebarCloseTimer();
    sidebarVisible.value = true;
  }
  saveChatUiState();
}

function toggleInputPinned() {
  inputPinned.value = !inputPinned.value;
  if (inputPinned.value) {
    clearInputPanelCloseTimer();
    inputCollapsed.value = false;
  }
  saveChatUiState();
}

function clearModelStates() {
  stopDragging();
  stopQuestionDragging();
  stopSummaryDraft();
  flushDirtyModelsNow();
  dirtyModels.clear();
  activeModelKeys.value = new Set();
  Object.keys(retryingMap).forEach((key) => delete retryingMap[key]);
  Object.keys(stateMap).forEach((key) => delete stateMap[key]);
  Object.keys(nodeLayoutMap).forEach((key) => delete nodeLayoutMap[key]);
  summaryControllers.forEach((ctrl) => ctrl.abort());
  summaryControllers.clear();
  summaryBlocks.value = [];
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
    await loadConfigs();
    const enabled = apiConfigs.value.filter((cfg) => cfg.enabled);
    if (enabled.length === 0) {
      ElMessage.warning("请先配置并启用至少一个 API");
      return;
    }

    initPanelsByEnabledConfigs();
    lastSentPrompt.value = text;
    setQuestionNodeContent(text);
    acceptIncomingEvents.value = true;

    abortAllStreams();
    controller = new AbortController();
    await sendPromptStream("", text, onStreamEvent, controller.signal);
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
  const onRetryStreamEvent = (event) => {
    const eventModel = parseModelTag(event?.model || "Unknown").key;
    if (eventModel !== model) {
      return;
    }
    onStreamEvent(event);
  };
  try {
    await sendPromptStream(
      "",
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

  prompt.value = DEFAULT_MARKDOWN_PROMPT;
  lastSentPrompt.value = "";
  setQuestionNodeContent("");
  clearModelStates();
  canvasOffset.x = 0;
  canvasOffset.y = 0;
  flowLayoutCache.value = {};
  clearFlowLayoutStorage();
  clearChatUiStateStorage();
  ElMessage.success("已开启全新对话");
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

.pin-btn {
  margin-right: auto;
}

.pin-icon-btn {
  padding: 4px;
  min-width: 28px;
}

.pin-icon-btn.active {
  color: #2563eb;
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

.flow-links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.flow-link {
  fill: none;
  stroke: rgba(71, 85, 105, 0.5);
  stroke-width: 1.6;
  stroke-dasharray: 6 6;
}

.question-node {
  position: absolute;
  left: 0;
  top: 0;
  border: 1px solid #2f3b52;
  border-bottom: 0;
  background: linear-gradient(160deg, #222834 0%, #1b2230 100%);
  border-radius: 18px;
  box-shadow: 0 12px 26px rgba(2, 6, 23, 0.32);
  padding: 14px 16px 4px;
  color: #e5e7eb;
  z-index: 2;
}

.question-drag-handle {
  cursor: grab;
  user-select: none;
}

.question-drag-handle:active {
  cursor: grabbing;
}

.question-chip {
  display: inline-block;
  font-size: 12px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.4);
  border-radius: 999px;
  padding: 2px 8px;
  margin-bottom: 8px;
}

.question-text {
  font-size: 15px;
  line-height: 1.55;
  color: #f8fafc;
  font-weight: 600;
  word-break: break-word;
}

.question-meta {
  margin-top: 4px;
  margin-bottom: 0;
  line-height: 1.1;
  font-size: 12px;
  color: #94a3b8;
}

.summary-draft {
  position: absolute;
  left: 0;
  top: 0;
  border: 1px dashed #2563eb;
  background: rgba(37, 99, 235, 0.1);
  pointer-events: none;
}

.summary-block {
  position: absolute;
  left: 0;
  top: 0;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.summary-block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #334155;
}

.summary-block-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-selected-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.summary-empty-tip {
  font-size: 12px;
  color: #8a93a1;
}

.summary-error {
  color: #dc2626;
  font-size: 13px;
}

.summary-content {
  max-height: 240px;
  overflow: auto;
}

.flow-canvas.dragging {
  cursor: grabbing;
}

.result-card {
  border: 1px solid #dfe4f0;
  min-height: 230px;
  width: 340px;
  border-radius: 16px;
  overflow: hidden;
}

.flow-node {
  position: absolute;
  margin: 0;
  will-change: transform;
  contain: layout paint;
  backface-visibility: hidden;
  transform-style: preserve-3d;
  transition: none !important;
}

.flow-node.dragging {
  box-shadow: none;
  pointer-events: none;
}

.drag-source-hidden {
  visibility: hidden;
}

.drag-ghost {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.16);
  padding: 12px 14px;
  z-index: 40;
  pointer-events: none;
}

.drag-ghost-title {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
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

.sidebar-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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


