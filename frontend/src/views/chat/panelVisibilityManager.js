export function createPanelVisibilityManager(options) {
  const {
    sidebarVisible,
    sidebarPinned,
    inputCollapsed,
    sidebarPanelRef,
    sidebarPeekRef,
    dragState,
    panState,
    questionDragState,
    summaryCreateState,
    saveChatUiState
  } = options;

  let sidebarCloseTimer = null;

  function clearSidebarCloseTimer() {
    if (sidebarCloseTimer) {
      clearTimeout(sidebarCloseTimer);
      sidebarCloseTimer = null;
    }
  }

  function openInputPanel() {
    inputCollapsed.value = false;
  }

  function toggleInputPanel() {
    inputCollapsed.value = !inputCollapsed.value;
    saveChatUiState();
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

  function dispose() {
    clearSidebarCloseTimer();
  }

  return {
    clearSidebarCloseTimer,
    openInputPanel,
    toggleInputPanel,
    openSidebar,
    toggleSidebar,
    onSidebarEnter,
    onSidebarLeave,
    onWindowMouseMoveForSidebar,
    toggleSidebarPinned,
    dispose
  };
}
