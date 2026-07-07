/**
 * Toast 通知工具
 * @module toast
 */

/**
 * 创建 Toast 通知管理器
 * @param {Function} triggerUpdate - 触发 Vue 响应式更新的回调
 * @returns {{ show: Function, getState: Function }}
 */
export function createToast(triggerUpdate) {
  let state = { show: false, message: '', type: 'success' };
  let _timer = null;

  return {
    /**
     * 显示 Toast 通知
     * @param {string} message - 消息内容
     * @param {'success'|'error'|'info'} type - 类型
     * @param {number} duration - 持续时间（毫秒）
     */
    show(message, type = 'success', duration = 3000) {
      if (_timer) clearTimeout(_timer);

      state = { show: true, message, type };
      triggerUpdate();

      _timer = setTimeout(() => {
        state.show = false;
        triggerUpdate();
      }, duration);
    },

    /** 获取当前 Toast 状态 */
    getState() {
      return { ...state };
    }
  };
}
