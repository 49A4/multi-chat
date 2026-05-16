export function createCanvasInteractionManager(options) {
  const {
    nextTick,
    stateMap,
    nodeLayoutMap,
    modelList,
    canvasOffset,
    canvasScale,
    flowCanvasRef,
    dragGhostRef,
    dragState,
    dragMeta,
    dragGhost,
    panState,
    activeTouchPoints,
    pinchState,
    questionDragState,
    summaryCreateState,
    getSafeCanvasScale,
    getCanvasViewportPoint,
    getCurrentTouchPair,
    getTouchDistance,
    getTouchMidpoint,
    clampCanvasScale,
    clientToLayerPoint,
    findQuestionNodeById,
    isQuestionSelected,
    selectQuestionModule,
    selectModelModule,
    clearSelectedModule,
    startSummaryDraft,
    stopSummaryDraft,
    bringToFront,
    saveFlowLayout,
    updateModuleActionMenuDuringDrag,
    normalizeWheelDelta
  } = options;

  let activeDragEl = null;
  let dragRafId = 0;
  let dragLatestClientX = 0;
  let dragLatestClientY = 0;
  let dragRenderX = 0;
  let dragRenderY = 0;
  let dragGrabOffsetX = 0;
  let dragGrabOffsetY = 0;
  let panRafId = 0;
  let panLatestClientX = 0;
  let panLatestClientY = 0;
  let questionDragModelOrigins = [];

  function stopPinch() {
    pinchState.active = false;
    pinchState.startDistance = 0;
    pinchState.startScale = canvasScale.value;
  }

  function getPointerLayerPoint(clientX, clientY) {
    const canvasEl = flowCanvasRef.value;
    const canvasRect = canvasEl?.getBoundingClientRect?.();
    const safeScale = getSafeCanvasScale();
    return {
      x: canvasRect ? (clientX - canvasRect.left - canvasOffset.x) / safeScale : clientX,
      y: canvasRect ? (clientY - canvasRect.top - canvasOffset.y) / safeScale : clientY
    };
  }

  function stopCanvasPanning() {
    if (panRafId) {
      window.cancelAnimationFrame(panRafId);
      panRafId = 0;
    }
    panLatestClientX = 0;
    panLatestClientY = 0;
    panState.active = false;
    panState.pointerId = null;
    panState.allowPinch = true;
  }

  function startPinchIfReady() {
    const pair = getCurrentTouchPair();
    if (!pair) {
      return false;
    }
    const [a, b] = pair;
    const distance = getTouchDistance(a, b);
    if (!Number.isFinite(distance) || distance <= 0) {
      return false;
    }

    const midpoint = getTouchMidpoint(a, b);
    const viewport = getCanvasViewportPoint(midpoint.x, midpoint.y);
    const safeScale = getSafeCanvasScale();

    stopCanvasPanning();
    pinchState.active = true;
    pinchState.startDistance = distance;
    pinchState.startScale = canvasScale.value;
    pinchState.anchorWorldX = (viewport.x - canvasOffset.x) / safeScale;
    pinchState.anchorWorldY = (viewport.y - canvasOffset.y) / safeScale;
    return true;
  }

  function updatePinchTransform() {
    const pair = getCurrentTouchPair();
    if (!pair) {
      stopPinch();
      return;
    }
    if (!pinchState.active && !startPinchIfReady()) {
      return;
    }

    const [a, b] = pair;
    const distance = getTouchDistance(a, b);
    if (!Number.isFinite(distance) || distance <= 0) {
      return;
    }

    const ratio = distance / Math.max(pinchState.startDistance, 1);
    const nextScale = clampCanvasScale(pinchState.startScale * ratio);
    const midpoint = getTouchMidpoint(a, b);
    const viewport = getCanvasViewportPoint(midpoint.x, midpoint.y);

    canvasScale.value = nextScale;
    canvasOffset.x = viewport.x - pinchState.anchorWorldX * nextScale;
    canvasOffset.y = viewport.y - pinchState.anchorWorldY * nextScale;
  }

  function beginCanvasPanFromPointerDown(event, options = {}) {
    const allowPinch = options.allowPinch !== false;
    const lockSinglePointer = options.lockSinglePointer === true;
    if (event.pointerType === "touch") {
      if (!allowPinch || lockSinglePointer) {
        activeTouchPoints.clear();
        stopPinch();
      }
      activeTouchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (allowPinch && !lockSinglePointer && activeTouchPoints.size >= 2) {
        startPinchIfReady();
        const captureTarget = flowCanvasRef.value || event.currentTarget;
        if (captureTarget?.setPointerCapture) {
          captureTarget.setPointerCapture(event.pointerId);
        }
        return "pinch";
      }
    }

    panState.active = true;
    panState.pointerId = event.pointerId;
    panState.startX = event.clientX;
    panState.startY = event.clientY;
    panState.originX = canvasOffset.x;
    panState.originY = canvasOffset.y;
    panState.allowPinch = allowPinch;
    panLatestClientX = event.clientX;
    panLatestClientY = event.clientY;
    const captureTarget = flowCanvasRef.value || event.currentTarget;
    if (captureTarget?.setPointerCapture) {
      captureTarget.setPointerCapture(event.pointerId);
    }
    return "pan";
  }

  function tryPromotePanToPinch(event) {
    if (!event || event.pointerType !== "touch") {
      return false;
    }
    if (!panState.active) {
      return false;
    }

    activeTouchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activeTouchPoints.size >= 2) {
      startPinchIfReady();
      const captureTarget = flowCanvasRef.value || event.currentTarget;
      if (captureTarget?.setPointerCapture) {
        captureTarget.setPointerCapture(event.pointerId);
      }
    }
    event.preventDefault();
    return true;
  }

  function stopQuestionDragging() {
    if (!questionDragState.active) {
      return;
    }
    questionDragState.active = false;
    questionDragState.questionId = "";
    questionDragState.pointerId = null;
    questionDragModelOrigins = [];
    saveFlowLayout();
  }

  function onQuestionPointerDown(event, questionId) {
    if (event.button !== 0) {
      return;
    }
    if (tryPromotePanToPinch(event)) {
      event.stopPropagation();
      return;
    }
    if (panState.active || dragState.active || summaryCreateState.active) {
      return;
    }
    const question = findQuestionNodeById(questionId);
    if (!question) {
      return;
    }

    if (event.pointerType === "mouse" && !isQuestionSelected(questionId)) {
      selectQuestionModule(questionId);
      return;
    }

    if (!isQuestionSelected(questionId)) {
      selectQuestionModule(questionId);
      beginCanvasPanFromPointerDown(event, { allowPinch: true, lockSinglePointer: true });
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    questionDragState.active = true;
    questionDragState.questionId = questionId;
    questionDragState.pointerId = event.pointerId;
    questionDragState.startX = event.clientX;
    questionDragState.startY = event.clientY;
    questionDragState.originX = question.x;
    questionDragState.originY = question.y;
    questionDragModelOrigins = modelList.value
      .filter((item) => item.questionId === questionId)
      .map((item) => {
        const layout = nodeLayoutMap[item.model];
        if (!layout) {
          return null;
        }
        return {
          model: item.model,
          x: layout.x,
          y: layout.y
        };
      })
      .filter(Boolean);
    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.stopPropagation();
    event.preventDefault();
  }

  function beginModelDragFromPointerDown(event, model, dragSourceEl = null) {
    const layout = nodeLayoutMap[model];
    if (!layout) {
      return false;
    }

    const pointerLayer = getPointerLayerPoint(event.clientX, event.clientY);

    bringToFront(layout);
    dragState.active = true;
    dragState.model = model;
    dragMeta.pointerId = event.pointerId;
    activeDragEl = dragSourceEl || event.currentTarget?.closest?.(".flow-node") || null;
    dragMeta.startX = event.clientX;
    dragMeta.startY = event.clientY;
    dragMeta.originX = layout.x;
    dragMeta.originY = layout.y;
    dragGrabOffsetX = Math.max(0, pointerLayer.x - layout.x);
    dragGrabOffsetY = Math.max(0, pointerLayer.y - layout.y);
    dragMeta.width = activeDragEl?.offsetWidth || 340;
    dragMeta.height = activeDragEl?.offsetHeight || 230;
    dragLatestClientX = event.clientX;
    dragLatestClientY = event.clientY;
    dragRenderX = Math.round(pointerLayer.x - dragGrabOffsetX);
    dragRenderY = Math.round(pointerLayer.y - dragGrabOffsetY);
    dragGhost.active = true;
    dragGhost.title = stateMap[model]?.title || model;
    dragGhost.x = dragRenderX;
    dragGhost.y = dragRenderY;
    dragGhost.width = dragMeta.width;
    dragGhost.height = dragMeta.height;
    nextTick(() => {
      const ghostEl = dragGhostRef.value;
      if (ghostEl) {
        ghostEl.style.willChange = "transform";
        ghostEl.style.transform = `translate3d(${Math.round(dragGhost.x)}px, ${Math.round(dragGhost.y)}px, 0)`;
      }
    });
    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    return true;
  }

  function onNodePointerDown(event, model) {
    if (event.button !== 0) {
      return;
    }
    if (tryPromotePanToPinch(event)) {
      event.stopPropagation();
      return;
    }

    selectModelModule(model);
    if (!beginModelDragFromPointerDown(event, model)) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
  }

  function onModelCardPointerDown(event, model) {
    if (event.button !== 0) {
      return;
    }
    const interactiveTarget =
      event?.target instanceof Element &&
      Boolean(
        event.target.closest(
          ".code-copy-btn, details > summary, .thought-block > summary, a, button, input, textarea, select, label"
        )
      );
    if (tryPromotePanToPinch(event)) {
      event.stopPropagation();
      return;
    }
    if (dragState.active || questionDragState.active || summaryCreateState.active || panState.active) {
      return;
    }

    selectModelModule(model);
    if (event.pointerType === "mouse") {
      return;
    }
    if (interactiveTarget) {
      return;
    }
    beginCanvasPanFromPointerDown(event, { allowPinch: true, lockSinglePointer: true });
    event.stopPropagation();
    event.preventDefault();
  }

  function onModelContentPointerDown(event, model) {
    if (!(event?.target instanceof Element)) {
      return;
    }
    if (event.target.closest(".code-copy-btn")) {
      return;
    }
    if (!event.target.closest(".code-block, .code-block pre, .code-block code")) {
      return;
    }
    onModelCardPointerDown(event, model);
  }

  function onCanvasPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    if (tryPromotePanToPinch(event)) {
      return;
    }
    if (dragState.active || summaryCreateState.active || questionDragState.active || panState.active) {
      return;
    }

    const target = event.target;
    let insideNode = false;
    if (target instanceof Element) {
      if (target.closest(".module-action-menu, .summary-block")) {
        return;
      }
      if (target.closest(".question-node.selected")) {
        return;
      }
      insideNode = Boolean(target.closest(".question-node, .flow-node"));
    }
    if (!insideNode) {
      clearSelectedModule();
    }
    if (insideNode && event.pointerType === "mouse") {
      return;
    }

    if (event.shiftKey && !insideNode) {
      startSummaryDraft(event);
    } else {
      beginCanvasPanFromPointerDown(event);
    }
    event.preventDefault();
  }

  function onCanvasWheel(event) {
    const deltaY = normalizeWheelDelta(
      event.deltaY,
      event.deltaMode,
      typeof window !== "undefined" ? window.innerHeight : 800
    );
    if (!deltaY) {
      return;
    }

    if (event.ctrlKey) {
      const viewport = getCanvasViewportPoint(event.clientX, event.clientY);
      const safeScale = getSafeCanvasScale();
      const worldX = (viewport.x - canvasOffset.x) / safeScale;
      const worldY = (viewport.y - canvasOffset.y) / safeScale;
      const zoomFactor = Math.exp(-deltaY * 0.00125);
      const nextScale = clampCanvasScale(canvasScale.value * zoomFactor);

      canvasScale.value = nextScale;
      canvasOffset.x = viewport.x - worldX * nextScale;
      canvasOffset.y = viewport.y - worldY * nextScale;
      event.preventDefault();
      return;
    }

    canvasOffset.y -= deltaY;
    event.preventDefault();
  }

  function onWindowPointerMove(event) {
    if (event.pointerType === "touch" && activeTouchPoints.has(event.pointerId)) {
      activeTouchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const canPinchNow = activeTouchPoints.size >= 2 && (pinchState.active || panState.active);
      if (canPinchNow && activeTouchPoints.size >= 2) {
        updatePinchTransform();
        event.preventDefault();
        return;
      }
    }

    if (panState.active) {
      if (panState.pointerId != null && event.pointerId !== panState.pointerId) {
        return;
      }

      panLatestClientX = event.clientX;
      panLatestClientY = event.clientY;
      if (!panRafId) {
        panRafId = window.requestAnimationFrame(() => {
          panRafId = 0;
          canvasOffset.x = panState.originX + (panLatestClientX - panState.startX);
          canvasOffset.y = panState.originY + (panLatestClientY - panState.startY);
        });
      }
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
      const question = findQuestionNodeById(questionDragState.questionId);
      if (!question) {
        stopQuestionDragging();
        return;
      }
      const safeScale = getSafeCanvasScale();
      const deltaX = (event.clientX - questionDragState.startX) / safeScale;
      const deltaY = (event.clientY - questionDragState.startY) / safeScale;
      question.x = Math.round(questionDragState.originX + deltaX);
      question.y = Math.round(questionDragState.originY + deltaY);
      questionDragModelOrigins.forEach((origin) => {
        const layout = nodeLayoutMap[origin.model];
        if (!layout) {
          return;
        }
        layout.x = Math.round(origin.x + deltaX);
        layout.y = Math.round(origin.y + deltaY);
      });
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
        const pointerLayer = getPointerLayerPoint(dragLatestClientX, dragLatestClientY);
        dragRenderX = Math.round(pointerLayer.x - dragGrabOffsetX);
        dragRenderY = Math.round(pointerLayer.y - dragGrabOffsetY);
        dragGhost.x = dragRenderX;
        dragGhost.y = dragRenderY;
        const ghostEl = dragGhostRef.value;
        if (ghostEl) {
          ghostEl.style.transform = `translate3d(${Math.round(dragGhost.x)}px, ${Math.round(dragGhost.y)}px, 0)`;
        }
        updateModuleActionMenuDuringDrag(dragState.model, dragRenderX, dragRenderY, dragMeta.width || 340);
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
    dragGrabOffsetX = 0;
    dragGrabOffsetY = 0;
    dragGhost.x = 0;
    dragGhost.y = 0;
    activeDragEl = null;
    saveFlowLayout();
  }

  function onWindowPointerUp(event) {
    if (!event) {
      return;
    }

    if (event.pointerType === "touch") {
      activeTouchPoints.delete(event.pointerId);
      if (activeTouchPoints.size < 2) {
        stopPinch();
      }
    }

    if (summaryCreateState.active) {
      if (summaryCreateState.pointerId == null || summaryCreateState.pointerId === event.pointerId) {
        stopSummaryDraft();
      }
    }
    if (panState.active) {
      if (panState.pointerId == null || panState.pointerId === event.pointerId) {
        stopCanvasPanning();
      }
    }
    if (questionDragState.active) {
      if (questionDragState.pointerId == null || questionDragState.pointerId === event.pointerId) {
        stopQuestionDragging();
      }
    }
    if (dragState.active) {
      if (dragMeta.pointerId == null || dragMeta.pointerId === event.pointerId) {
        stopDragging();
      }
    }
  }

  function dispose() {
    if (dragRafId) {
      window.cancelAnimationFrame(dragRafId);
      dragRafId = 0;
    }
    if (panRafId) {
      window.cancelAnimationFrame(panRafId);
      panRafId = 0;
    }
  }

  return {
    onQuestionPointerDown,
    onNodePointerDown,
    onModelCardPointerDown,
    onModelContentPointerDown,
    onCanvasPointerDown,
    onCanvasWheel,
    onWindowPointerMove,
    onWindowPointerUp,
    stopDragging,
    stopCanvasPanning,
    stopQuestionDragging,
    stopPinch,
    dispose
  };
}
