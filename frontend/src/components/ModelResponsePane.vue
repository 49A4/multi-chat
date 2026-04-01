<template>
  <el-card class="model-card" shadow="never">
    <template #header>
      <div class="card-header">
        <div class="title-wrap">
          <span class="model-name">{{ state.model }}</span>
          <el-tag v-if="state.error" type="danger" size="small">异常</el-tag>
          <el-tag v-else-if="state.done" type="success" size="small">完成</el-tag>
          <el-tag v-else type="info" size="small">输出中</el-tag>
        </div>
        <el-button
          size="small"
          type="primary"
          :disabled="!state.done || !!state.error || !adoptableContent"
          @click="emit('adopt', adoptableContent)"
        >
          采纳
        </el-button>
      </div>
    </template>

    <div class="markdown-body" v-html="renderedHtml"></div>
  </el-card>
</template>

<script setup>
import { computed } from "vue";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";

const props = defineProps({
  state: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["adopt"]);

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return `<pre><code class="hljs">${hljs.highlight(code, { language: lang }).value}</code></pre>`;
    }
    return `<pre><code class="hljs">${md.utils.escapeHtml(code)}</code></pre>`;
  }
});

const adoptableContent = computed(() => props.state.fullContent || props.state.content || "");

const renderedHtml = computed(() => {
  if (props.state.error) {
    return md.render(`**Error:** ${props.state.error}`);
  }
  if (!props.state.content) {
    return md.render("_等待模型输出中..._");
  }
  return md.render(props.state.content);
});
</script>

<style scoped>
.model-card {
  border: 1px solid var(--border-color);
  min-height: 220px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-name {
  font-weight: 600;
}

.markdown-body {
  min-height: 160px;
  white-space: normal;
  word-break: break-word;
}

.markdown-body :deep(pre) {
  background: #1f2937;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  overflow: auto;
}
</style>
