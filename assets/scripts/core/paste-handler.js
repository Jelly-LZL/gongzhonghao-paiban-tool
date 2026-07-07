/**
 * 智能粘贴处理 - HTML 转 Markdown + 图片粘贴 + 格式检测
 * @module paste-handler
 */

/**
 * 创建 Turndown 服务实例
 * @returns {Object|null} TurndownService 实例，库未加载时返回 null
 */
export function createTurndownService() {
  if (typeof window.TurndownService === 'undefined') {
    console.warn('Turndown 库未加载，智能粘贴功能将不可用');
    return null;
  }

  const service = new window.TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  });

  service.keep(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td']);

  // 表格规则
  service.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return '';

      let markdown = '\n\n';
      let headerProcessed = false;

      rows.forEach((row, index) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const cellContents = cells.map(cell =>
          cell.textContent.replace(/\n/g, ' ').trim()
        );

        if (cellContents.length > 0) {
          markdown += '| ' + cellContents.join(' | ') + ' |\n';
          if (index === 0 || (!headerProcessed && row.querySelector('th'))) {
            markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
            headerProcessed = true;
          }
        }
      });

      return markdown + '\n';
    }
  });

  // 图片规则
  service.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const alt = node.alt || '图片';
      const src = node.src || '';
      const title = node.title || '';

      if (src.startsWith('data:image')) {
        const type = src.match(/data:image\/(\w+);/)?.[1] || 'image';
        return `![${alt}](data:image/${type};base64,...)${title ? ` "${title}"` : ''}\n`;
      }

      return `![${alt}](${src})${title ? ` "${title}"` : ''}\n`;
    }
  });

  return service;
}

/**
 * 检测文本是否为 Markdown 格式
 * @param {string} text
 * @returns {boolean}
 */
export function isMarkdown(text) {
  if (!text) return false;

  const patterns = [
    /^#{1,6}\s+/m,
    /\*\*[^*]+\*\*/,
    /\*[^*\n]+\*/,
    /\[[^\]]+\]\([^)]+\)/,
    /!\[[^\]]*\]\([^)]+\)/,
    /^[\*\-\+]\s+/m,
    /^\d+\.\s+/m,
    /^>\s+/m,
    /`[^`]+`/,
    /```[\s\S]*?```/,
    /^\|.*\|$/m,
    /<!--.*?-->/,
    /^---+$/m
  ];

  const matchCount = patterns.filter(p => p.test(text)).length;
  return matchCount >= 2 || text.includes('<!-- img:');
}

/**
 * 检测 HTML 是否来自 IDE/代码编辑器
 * @param {string} htmlData
 * @param {string} textData
 * @returns {boolean}
 */
export function isIDEFormattedHTML(htmlData, textData) {
  if (!htmlData || !textData) return false;

  const ideSignatures = [
    /<meta\s+charset=['"]utf-8['"]/i,
    /<div\s+class=["']ace_line["']/,
    /style=["'][^"']*font-family:\s*['"]?(?:Consolas|Monaco|Menlo|Courier)/i,
    (html) => {
      const hasDivSpan = /<(?:div|span)[\s>]/.test(html);
      const hasSemanticTags = /<(?:p|h[1-6]|strong|em|ul|ol|li|blockquote)[\s>]/i.test(html);
      return hasDivSpan && !hasSemanticTags;
    },
    (html) => {
      const strippedHtml = html.replace(/<[^>]+>/g, '').trim();
      return strippedHtml === textData.trim();
    }
  ];

  let matchCount = 0;
  for (const sig of ideSignatures) {
    if (typeof sig === 'function' ? sig(htmlData) : sig.test(htmlData)) {
      matchCount++;
    }
  }

  return matchCount >= 2;
}

/**
 * 创建智能粘贴处理器
 * @param {Object} deps
 * @param {Object|null} deps.turndownService - Turndown 服务实例
 * @param {Function} deps.handleImageUpload - 图片上传回调 (file, textarea) => Promise
 * @param {Function} deps.showToast - Toast 提示函数
 * @param {Function} deps.getInput - 获取当前编辑器内容 () => string
 * @param {Function} deps.setInput - 设置编辑器内容 (value) => void
 * @param {Function} deps.nextTick - Vue nextTick (cb) => void
 * @returns {Function} pasteHandler(event)
 */
export function createPasteHandler(deps) {
  const { turndownService, handleImageUpload, showToast, getInput, setInput, nextTick } = deps;

  return async function handleSmartPaste(event) {
    const clipboardData = event.clipboardData || event.originalEvent?.clipboardData;
    if (!clipboardData) return;

    // 检查文件（图片）
    if (clipboardData.files && clipboardData.files.length > 0) {
      const file = clipboardData.files[0];
      if (file && file.type && file.type.startsWith('image/')) {
        event.preventDefault();
        await handleImageUpload(file, event.target);
        return;
      }
    }

    // 检查 items
    const items = clipboardData.items;
    if (items) {
      for (const item of items) {
        if (item.kind === 'file' && item.type && item.type.indexOf('image') !== -1) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await handleImageUpload(file, event.target);
            return;
          }
        }
      }
    }

    const htmlData = clipboardData.getData('text/html');
    const textData = clipboardData.getData('text/plain');

    // 检查图片占位符文本
    if (textData && /^\[Image\s*#?\d*\]$/i.test(textData.trim())) {
      showToast('⚠️ 请尝试：截图工具 / 浏览器复制 / 拖拽文件', 'error');
      event.preventDefault();
      return;
    }

    // IDE 格式检测
    const isFromIDE = isIDEFormattedHTML(htmlData, textData);
    if (isFromIDE && textData && isMarkdown(textData)) return;

    // HTML 转 Markdown
    if (htmlData && htmlData.trim() !== '' && turndownService) {
      const hasPreTag = /<pre[\s>]/.test(htmlData);
      const hasCodeTag = /<code[\s>]/.test(htmlData);
      const isMainlyCode = (hasPreTag || hasCodeTag) && !htmlData.includes('<p') && !htmlData.includes('<div');
      if (isMainlyCode) return;

      if (htmlData.includes('file:///') || htmlData.includes('src="file:')) {
        showToast('⚠️ 本地图片请直接拖拽文件到编辑器', 'error');
        event.preventDefault();
        return;
      }

      event.preventDefault();

      try {
        let markdown = turndownService.turndown(htmlData);
        markdown = markdown.replace(/\n{3,}/g, '\n\n');

        const textarea = event.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = getInput();

        setInput(value.substring(0, start) + markdown + value.substring(end));

        nextTick(() => {
          textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
          textarea.focus();
        });

        showToast('✨ 已智能转换为 Markdown 格式', 'success');
      } catch (_e) {
        // 转换失败，使用纯文本
        const textarea = event.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = getInput();
        setInput(value.substring(0, start) + textData + value.substring(end));
        nextTick(() => {
          textarea.selectionStart = textarea.selectionEnd = start + textData.length;
          textarea.focus();
        });
      }
    } else if (textData && isMarkdown(textData)) {
      return; // 已是 Markdown，使用默认行为
    }
  };
}
