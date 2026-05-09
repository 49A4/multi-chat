export function useMarkdownActions(options = {}) {
  const { ElMessage } = options;

  async function handleMarkdownAction(event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    const button = event.target.closest(".code-copy-btn");
    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

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
      ElMessage?.warning?.("复制失败，请手动复制");
    }
  }

  return {
    handleMarkdownAction
  };
}
