/**
 * 右侧面板状态管理
 * @module panel-manager
 */

/**
 * 创建面板管理器
 * @param {Function} triggerUpdate - 触发 Vue 响应式更新的回调
 * @returns {{ toggle: Function, getActivePanel: Function, close: Function }}
 */
export function createPanelManager(triggerUpdate) {
  let activePanel = null;

  return {
    /**
     * 切换面板展开/折叠
     * @param {string} panelName - 面板名称 ('theme'|'code'|'file'|'settings')
     */
    toggle(panelName) {
      activePanel = activePanel === panelName ? null : panelName;
      triggerUpdate();
    },

    /** 获取当前展开的面板名称 */
    getActivePanel() {
      return activePanel;
    },

    /** 关闭所有面板 */
    close() {
      activePanel = null;
      triggerUpdate();
    },

    /** 检查指定面板是否展开 */
    isOpen(panelName) {
      return activePanel === panelName;
    }
  };
}
