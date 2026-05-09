import { reactive } from "vue";

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 240;
const VIEWPORT_PADDING = 10;

function findImageElementFromEvent(event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const img = target.closest("img");
  if (!img) {
    return null;
  }
  const src = String(img.getAttribute("src") || "").trim();
  return src ? img : null;
}

export function useImageViewer() {
  const imageHover = reactive({ visible: false, src: "", x: 0, y: 0 });
  const imageViewer = reactive({ visible: false, src: "" });

  function showImageHoverPreview(imgEl) {
    if (!(imgEl instanceof Element)) {
      return;
    }
    const src = String(imgEl.getAttribute("src") || "").trim();
    if (!src) {
      return;
    }

    const rect = imgEl.getBoundingClientRect();
    let x = rect.left + rect.width / 2 - PREVIEW_WIDTH / 2;
    x = Math.max(VIEWPORT_PADDING, Math.min(x, window.innerWidth - PREVIEW_WIDTH - VIEWPORT_PADDING));

    let y = rect.bottom + 8;
    if (y + PREVIEW_HEIGHT > window.innerHeight - VIEWPORT_PADDING) {
      y = Math.max(VIEWPORT_PADDING, rect.top - PREVIEW_HEIGHT - 8);
    }

    imageHover.src = src;
    imageHover.x = Math.round(x);
    imageHover.y = Math.round(y);
    imageHover.visible = true;
  }

  function hideImageHoverPreview() {
    imageHover.visible = false;
  }

  function handleImageHover(event) {
    const img = findImageElementFromEvent(event);
    if (!img) {
      if (event?.type === "mouseout") {
        hideImageHoverPreview();
      }
      return;
    }

    if (event.type === "mouseover") {
      showImageHoverPreview(img);
      return;
    }

    if (event.type === "mouseout") {
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Element && img.contains(relatedTarget)) {
        return;
      }
      hideImageHoverPreview();
    }
  }

  function handleImageClick(event) {
    const img = findImageElementFromEvent(event);
    if (!img) {
      return;
    }
    event.stopPropagation();
    hideImageHoverPreview();
    imageViewer.src = String(img.getAttribute("src") || "").trim();
    imageViewer.visible = true;
  }

  function closeImageViewer() {
    imageViewer.visible = false;
    imageViewer.src = "";
  }

  function onImageViewerKeydown(event) {
    if (event.key === "Escape" && imageViewer.visible) {
      closeImageViewer();
    }
  }

  return {
    imageHover,
    imageViewer,
    hideImageHoverPreview,
    handleImageHover,
    handleImageClick,
    closeImageViewer,
    onImageViewerKeydown
  };
}
