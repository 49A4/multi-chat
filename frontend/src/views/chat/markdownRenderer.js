import MarkdownIt from "markdown-it";
import hljs from "highlight.js";

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
});

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
  const original = (value || "").trim();
  const raw = original.toLowerCase();
  if (!raw) {
    return false;
  }
  if (raw.startsWith("data:")) {
    return /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(original);
  }
  if (
    raw.startsWith("javascript:") ||
    raw.startsWith("vbscript:") ||
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

export function renderMarkdownPreservingMath(source) {
  const normalized = normalizeBreakTags(source);
  const { text, segments } = extractMathSegments(normalized);
  const rendered = markdown.render(text);
  const withTasks = enhanceTaskListHtml(rendered);
  const withMath = restoreMathSegments(withTasks, segments);
  return sanitizeRenderedHtml(withMath);
}

export function renderMarkdownWithCollapsibleThinking(text) {
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

export function renderStreamingMarkdown(text) {
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

export function buildRenderedContent(item) {
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
