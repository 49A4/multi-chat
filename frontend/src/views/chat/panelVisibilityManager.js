export function createPanelVisibilityManager(options) {
  const {
    sidebarVisible,
    inputCollapsed,
    dragState,
    panState,
    questionDragState,
    summaryCreateState,
    saveChatUiState
  } = options;

  function clearSidebarCloseTimer() {
  }

  function openInputPanel() {
    inputCollapsed.value = false;
  }

  function toggleInputPanel() {
    inputCollapsed.value = !inputCollapsed.value;
    saveChatUiState();
  }

  function toggleSidebar() {
    sidebarVisible.value = !sidebarVisible.value;
    saveChatUiState();
  }

  function onSidebarEnter() {
  }

  function onSidebarLeave() {
  }

  function onWindowMouseMoveForSidebar(event) {
    if (dragState.active || panState.active || questionDragState.active || summaryCreateState.active) {
      return;
    }
  }

  function dispose() {
    clearSidebarCloseTimer();
  }

  return {
    clearSidebarCloseTimer,
    openInputPanel,
    toggleInputPanel,
    toggleSidebar,
    onSidebarEnter,
    onSidebarLeave,
    onWindowMouseMoveForSidebar,
    dispose
  };
}
