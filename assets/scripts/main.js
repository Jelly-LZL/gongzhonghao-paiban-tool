/**
 * Application entrypoint.
 * @module main
 */

import { ImageStore } from './core/image-store.js';
import { ImageCompressor } from './core/image-compressor.js';
import { createMarkdownEngine } from './core/markdown-engine.js';
import { createTurndownService, createPasteHandler } from './core/paste-handler.js';
import { renderPipeline } from './core/render-pipeline.js?v=20260702-quote-font';
import { prepareWechatCopyPayload, writeWechatCopyPayload } from './export/clipboard-exporter.js?v=20260702-quote-font';
import { copyToX } from './export/x-clipboard-exporter.js';
import { getCategorizedThemes, getStyleName, isRecommended, getStarredStyles, toggleStarStyle } from './ui/theme-manager.js';
import {
  getCodeThemeList,
  FOLLOW_THEME_CODE_STYLE,
  isCodeThemeSelection,
  resolveCodeTheme
} from './ui/code-themes.js';
import { createToast } from './ui/toast.js';
import { loadPreferences, savePreferences, debounceSaveContent, getDefaultCodeBlockSettings, getDefaultDisplaySettings } from './storage/preferences.js?v=20260702-quote-font';
import { loadLayoutPresets, saveLayoutPresets } from './storage/layout-presets.js?v=20260702-layout-presets';
import { BODY_FONT_FAMILY_OPTIONS, isBodyFontFamilyValue } from './core/display-fonts.js?v=20260702-quote-font';
import { STYLES } from '../styles/themes/index.js';

const { createApp, ref, watch, nextTick, onMounted, computed } = window.Vue;

const UNTITLED_PREFIX = '新文章';
const CODE_THEME_STORAGE_KEY = 'zhizi-wechat-md:currentCodeTheme';
const DEFAULT_SAMPLE_IMAGE = './assets/images/avatar.jpg';

const markdownInput = ref('');
const renderedContent = ref('');
const currentStyle = ref('wechat-default');
const starredStyles = ref([]);
const currentCodeTheme = ref(FOLLOW_THEME_CODE_STYLE);
const documents = ref([]);
const activeDocumentId = ref(null);
const currentDocumentTitle = ref('');
const documentSearch = ref('');
const layoutPresets = ref([]);
const previewMode = ref('desktop');
const tocVisible = ref(false);
const isDraggingOver = ref(false);
const copySuccess = ref(false);
const mdCopySuccess = ref(false);
const copyPreparing = ref(false);

const activePanel = ref('layout');
const settingsOpen = ref(false);
const toastState = ref({ show: false, message: '', type: 'success' });
const sidebarOpen = ref(false);
const deleteConfirm = ref({ show: false, docId: null, docTitle: '' });
const layoutPresetDialog = ref({ show: false, mode: 'save', presetId: null, name: '' });

const wordCount = ref(0);
const charCount = ref(0);
const readTime = ref(0);
const lastSavedTime = ref('--');
const currentSaveState = ref('saved');

const editorWidth = ref(null);
const rightPanelWidth = ref(null);
const syncScrollEnabled = ref(true);
const codeBlockSettings = ref(getDefaultCodeBlockSettings());
const displaySettings = ref(getDefaultDisplaySettings());
const editorSelection = ref({ start: 0, end: 0 });

const categorizedThemes = ref(getCategorizedThemes());
const codeThemeList = getCodeThemeList();
const bodyFontFamilyOptions = BODY_FONT_FAMILY_OPTIONS;
const fontScaleOptions = [
  { label: '更小', value: 0.75, meta: '0.75x' },
  { label: '稍小', value: 0.85, meta: '0.85x' },
  { label: '推荐', value: 1, meta: '1.0x' },
  { label: '稍大', value: 1.15, meta: '1.15x' },
  { label: '更大', value: 1.3, meta: '1.3x' },
  { label: '超大', value: 1.5, meta: '1.5x' }
];
const imageStyleModeOptions = [
  { label: '默认', value: 'theme', meta: '跟随主题' },
  { label: '自定义', value: 'custom', meta: '覆盖样式' }
];
const imageRadiusModeOptions = [
  { label: '圆角', value: 'px' },
  { label: '圆形', value: 'circle' }
];

const toast = createToast(() => { toastState.value = toast.getState(); });

let md = null;
let imageStore = null;
let imageCompressor = null;
let turndownService = null;
let pasteHandler = null;
let suppressEditorSync = false;
let suppressTitleSync = false;
let syncLock = false;
let preparedWechatCopyPayload = null;
let preparedWechatCopyKey = '';
let prepareCopyTimer = null;
let prepareCopyRunId = 0;

const filteredDocuments = computed(() => {
  const keyword = documentSearch.value.trim().toLowerCase();

  return [...documents.value]
    .filter((doc) => {
      if (!keyword) return true;
      const haystack = [
        doc.manualTitle,
        extractMarkdownTitle(doc.content),
        doc.content
      ].join('\n').toLowerCase();
      return haystack.includes(keyword);
    })
    .sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt - b.createdAt;
    });
});

const isImageStyleCustom = computed(() => displaySettings.value.imageStyleMode === 'custom');

const hasLayoutPresets = computed(() => layoutPresets.value.length > 0);

const tocItems = computed(() => {
  if (!renderedContent.value) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(renderedContent.value, 'text/html');

  return Array.from(doc.querySelectorAll('h1, h2, h3'))
    .map((heading) => ({
      id: heading.getAttribute('id') || '',
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent || '').trim()
    }))
    .filter((item) => item.id && item.text);
});

function setLayoutPanelTab(tab) {
  activePanel.value = tab;
}

function toggleSettingsPanel() {
  settingsOpen.value = !settingsOpen.value;
}

function createDocumentId(prefix = 'doc') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function extractMarkdownTitle(content) {
  const match = (content || '').match(/^\s*#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : '';
}

function getUntitledIndex(list = documents.value) {
  let maxIndex = 0;
  const pattern = new RegExp(`^${UNTITLED_PREFIX}\\s+(\\d+)$`);

  list.forEach((doc) => {
    const displayTitle = (doc.manualTitle || doc.title || '').trim();
    const match = displayTitle.match(pattern);
    if (match) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  });

  return maxIndex + 1;
}

function getUntitledTitle(list = documents.value) {
  return `${UNTITLED_PREFIX} ${getUntitledIndex(list)}`;
}

function buildDocument({
  id = createDocumentId(),
  manualTitle = '',
  title = '',
  content = '',
  createdAt = Date.now(),
  updatedAt = createdAt,
  sortOrder = documents.value.length,
  dirty = false
} = {}) {
  return {
    id,
    manualTitle,
    title,
    content: replaceLegacySampleImages(content),
    createdAt,
    updatedAt,
    sortOrder,
    dirty
  };
}

function replaceLegacySampleImages(content) {
  if (typeof content !== 'string') return content;

  return content
    .replace(
      /!\[童年照片\]\([^)]+\)(?:\{[^}\n]*\})?/g,
      `![头像示例](${DEFAULT_SAMPLE_IMAGE}){width=42% radius=999 caption=头像示例}`
    )
    .replace(
      /!\[生活切片\]\([^)]+\)(?:\{[^}\n]*\})?/g,
      `![排版示例](${DEFAULT_SAMPLE_IMAGE}){width=42% radius=999 caption=排版示例}`
    );
}

function getActiveDocument() {
  return documents.value.find((doc) => doc.id === activeDocumentId.value) || null;
}

function resolveDocumentDisplayTitle(doc) {
  if (!doc) return UNTITLED_PREFIX;
  return doc.manualTitle?.trim() || extractMarkdownTitle(doc.content) || doc.title?.trim() || UNTITLED_PREFIX;
}

function sanitizeFilename(name) {
  return (name || 'article')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'article';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDateTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })}`;
}

function formatFullDateTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })}`;
}

function getSaveStateLabel() {
  return {
    saving: '保存中',
    saved: '已保存',
    error: '保存失败'
  }[currentSaveState.value];
}

function getSaveStateClass() {
  return `status-${currentSaveState.value}`;
}

function syncEditorFromActiveDocument() {
  const activeDoc = getActiveDocument();
  suppressEditorSync = true;
  suppressTitleSync = true;
  markdownInput.value = activeDoc ? activeDoc.content : '';
  currentDocumentTitle.value = activeDoc ? (activeDoc.manualTitle || '') : '';
  editorSelection.value = { start: 0, end: 0 };
  updateStats();
}

function markCurrentDocumentDirty() {
  const activeDoc = getActiveDocument();
  if (!activeDoc) return;
  activeDoc.updatedAt = Date.now();
  activeDoc.dirty = true;
  currentSaveState.value = 'saving';
}

function buildSavePayload() {
  const activeDoc = getActiveDocument();
  return {
    currentStyle: currentStyle.value,
    content: activeDoc ? activeDoc.content : markdownInput.value,
    documents: documents.value,
    activeDocumentId: activeDocumentId.value,
    codeBlockSettings: codeBlockSettings.value,
    tocVisible: tocVisible.value,
    displaySettings: displaySettings.value
  };
}

function handleSaveSuccess(payload = null) {
  const documentId = payload?.activeDocumentId || activeDocumentId.value;
  const savedDoc = documents.value.find((doc) => doc.id === documentId);
  if (savedDoc) savedDoc.dirty = false;
  currentSaveState.value = 'saved';
  lastSavedTime.value = formatFullDateTime(Date.now());
}

function handleSaveError() {
  currentSaveState.value = 'error';
}

function persistDocumentState() {
  const success = savePreferences(
    currentStyle.value,
    getActiveDocument()?.content || markdownInput.value,
    documents.value,
    activeDocumentId.value,
    codeBlockSettings.value,
    tocVisible.value,
    displaySettings.value
  );

  if (success) {
    handleSaveSuccess();
  } else {
    handleSaveError();
  }

  return success;
}

function schedulePersistDocumentState() {
  debounceSaveContent(buildSavePayload(), 5000, {
    onSuccess: handleSaveSuccess,
    onError: handleSaveError
  });
}

function updateStats() {
  const text = markdownInput.value;
  if (!text) {
    wordCount.value = 0;
    charCount.value = 0;
    readTime.value = 0;
    return;
  }

  charCount.value = text.length;
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const englishWords = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').split(/\s+/).filter(Boolean).length;
  const total = chineseChars + englishWords;
  wordCount.value = total;
  readTime.value = Math.max(1, Math.ceil(total / 300));
}

function getResolvedCodeTheme() {
  return resolveCodeTheme(currentCodeTheme.value);
}

function toggleToc() {
  tocVisible.value = !tocVisible.value;
  persistDocumentState();
}

function scrollToTocHeading(id) {
  if (!id) return;

  nextTick(() => {
    const preview = document.querySelector('.preview-content');
    const heading = document.getElementById(id);
    if (!preview || !heading) return;

    const previewRect = preview.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const offset = headingRect.top - previewRect.top + preview.scrollTop - 16;
    preview.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  });
}

async function renderMarkdown() {
  if (!markdownInput.value.trim()) {
    renderedContent.value = '';
    preparedWechatCopyPayload = null;
    preparedWechatCopyKey = '';
    return;
  }
  if (!md) return;

  const styleConfig = STYLES[currentStyle.value];
  if (!styleConfig) return;

  try {
    renderedContent.value = await renderPipeline({
      markdown: markdownInput.value,
      md,
      imageStore,
      styleConfig,
      codeTheme: getResolvedCodeTheme(),
      displaySettings: displaySettings.value
    });
    schedulePrepareWechatCopyPayload();
  } catch (error) {
    console.error('渲染失败:', error);
  }
}

function buildWechatCopyKey() {
  return JSON.stringify({
    renderedHTML: renderedContent.value,
    style: currentStyle.value,
    codeTheme: currentCodeTheme.value,
    displaySettings: displaySettings.value
  });
}

function schedulePrepareWechatCopyPayload(delay = 300) {
  if (prepareCopyTimer) clearTimeout(prepareCopyTimer);
  if (!renderedContent.value || !imageStore) {
    preparedWechatCopyPayload = null;
    preparedWechatCopyKey = '';
    return;
  }

  prepareCopyTimer = setTimeout(() => {
    prepareWechatCopyPayloadSilently();
  }, delay);
}

async function prepareWechatCopyPayloadSilently({ notify = false } = {}) {
  if (!renderedContent.value || !imageStore) return false;

  const styleConfig = STYLES[currentStyle.value];
  if (!styleConfig) return false;

  const key = buildWechatCopyKey();
  const runId = ++prepareCopyRunId;
  copyPreparing.value = true;

  try {
    const payload = await prepareWechatCopyPayload({
      renderedHTML: renderedContent.value,
      styleConfig,
      imageStore,
      showToast: notify ? (message, type) => toast.show(message, type) : () => {},
      codeTheme: getResolvedCodeTheme(),
      displaySettings: displaySettings.value
    });

    if (runId !== prepareCopyRunId || key !== buildWechatCopyKey()) return false;

    preparedWechatCopyPayload = payload;
    preparedWechatCopyKey = key;
    return true;
  } catch (error) {
    if (runId === prepareCopyRunId) {
      preparedWechatCopyPayload = null;
      preparedWechatCopyKey = '';
    }
    console.warn('准备公众号复制内容失败:', error);
    return false;
  } finally {
    if (runId === prepareCopyRunId) {
      copyPreparing.value = false;
    }
  }
}

function sortDocumentsByCurrentOrder() {
  documents.value.forEach((doc, index) => {
    doc.sortOrder = index;
  });
}

function ensureActiveDocument() {
  if (documents.value.length === 0) {
    const doc = buildDocument({ title: getUntitledTitle([]), content: loadDefaultExample() });
    documents.value = [doc];
    activeDocumentId.value = doc.id;
  }

  if (!documents.value.some((doc) => doc.id === activeDocumentId.value)) {
    activeDocumentId.value = documents.value[0]?.id || null;
  }
}

function switchDocument(documentId) {
  if (!documentId || documentId === activeDocumentId.value) return;
  persistDocumentState();
  activeDocumentId.value = documentId;
  syncEditorFromActiveDocument();
  renderMarkdown();
}

function createNewDocument(content = '', manualTitle = '') {
  const doc = buildDocument({
    manualTitle,
    title: manualTitle || getUntitledTitle(),
    content,
    sortOrder: documents.value.length
  });

  documents.value.push(doc);
  sortDocumentsByCurrentOrder();
  activeDocumentId.value = doc.id;
  syncEditorFromActiveDocument();
  persistDocumentState();
  return doc;
}

function renameDocument(documentId) {
  if (documentId !== activeDocumentId.value) {
    switchDocument(documentId);
  }

  nextTick(() => {
    const input = document.querySelector('.document-title-input');
    input?.focus();
    input?.select();
  });
}

function duplicateDocument(documentId) {
  const source = documents.value.find((doc) => doc.id === documentId);
  if (!source) return;

  const duplicateTitle = `${resolveDocumentDisplayTitle(source)} 副本`;
  const doc = buildDocument({
    manualTitle: duplicateTitle,
    title: duplicateTitle,
    content: source.content,
    sortOrder: documents.value.length
  });

  documents.value.push(doc);
  sortDocumentsByCurrentOrder();
  activeDocumentId.value = doc.id;
  syncEditorFromActiveDocument();
  persistDocumentState();
}

function deleteDocument(documentId) {
  const target = documents.value.find((doc) => doc.id === documentId);
  if (!target) return;

  deleteConfirm.value = {
    show: true,
    docId: documentId,
    docTitle: resolveDocumentDisplayTitle(target)
  };
}

function showDeleteConfirm(doc) {
  if (!doc?.id) return;
  const target = documents.value.find((item) => item.id === doc.id);
  if (!target) return;

  deleteConfirm.value = {
    show: true,
    docId: target.id,
    docTitle: resolveDocumentDisplayTitle(target)
  };
}

function cancelDelete() {
  deleteConfirm.value = { show: false, docId: null, docTitle: '' };
}

function confirmDelete() {
  const docId = deleteConfirm.value.docId;
  if (!docId) {
    cancelDelete();
    return;
  }

  const sorted = filteredDocuments.value;
  const currentIndex = sorted.findIndex((doc) => doc.id === docId);
  const nextCandidate = sorted[currentIndex + 1] || sorted[currentIndex - 1] || documents.value.find((doc) => doc.id !== docId);

  documents.value = documents.value.filter((doc) => doc.id !== docId);

  if (documents.value.length === 0) {
    const fallbackDoc = buildDocument({
      title: getUntitledTitle([]),
      manualTitle: '',
      content: '',
      sortOrder: 0
    });
    documents.value = [fallbackDoc];
    activeDocumentId.value = fallbackDoc.id;
  } else {
    activeDocumentId.value = nextCandidate?.id || activeDocumentId.value;
    ensureActiveDocument();
  }

  sortDocumentsByCurrentOrder();
  syncEditorFromActiveDocument();
  persistDocumentState();

  cancelDelete();
}

function moveDocument(documentId, direction) {
  const ordered = filteredDocuments.value;
  const index = ordered.findIndex((doc) => doc.id === documentId);
  if (index < 0) return;

  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= ordered.length) return;

  const currentDoc = ordered[index];
  const swapDoc = ordered[swapIndex];

  const currentOrder = currentDoc.sortOrder;
  currentDoc.sortOrder = swapDoc.sortOrder;
  swapDoc.sortOrder = currentOrder;

  documents.value = [...documents.value];
  persistDocumentState();
}

async function handleImageUpload(file, textarea) {
  if (!file.type.startsWith('image/')) {
    toast.show('请上传图片文件', 'error');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    toast.show('图片大小不能超过 10MB', 'error');
    return;
  }

  const imageName = file.name.replace(/\.[^/.]+$/, '') || '图片';
  const originalSize = file.size;

  try {
    toast.show('正在压缩图片...', 'success');
    const compressedBlob = await imageCompressor.compress(file);
    const compressedSize = compressedBlob.size;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(0);
    const imageId = createDocumentId('img');

    await imageStore.saveImage(imageId, compressedBlob, {
      name: imageName,
      originalName: file.name,
      originalSize,
      compressedSize,
      compressionRatio,
      mimeType: compressedBlob.type || file.type
    });

    const markdownImage = `![${imageName}](img://${imageId})`;
    insertAtCursor(markdownImage, {
      textarea,
      selectionStart: markdownImage.length
    });

    if (compressionRatio > 10) {
      toast.show(`已保存 (${ImageCompressor.formatSize(originalSize)} → ${ImageCompressor.formatSize(compressedSize)})`, 'success');
    } else {
      toast.show(`已保存 (${ImageCompressor.formatSize(compressedSize)})`, 'success');
    }
  } catch (error) {
    console.error('图片处理失败:', error);
    toast.show(`图片处理失败: ${error.message}`, 'error');
  }
}

function initPasteHandler() {
  turndownService = createTurndownService();
  pasteHandler = createPasteHandler({
    turndownService,
    handleImageUpload,
    showToast: (message, type) => toast.show(message, type),
    getInput: () => markdownInput.value,
    setInput: (value) => { markdownInput.value = value; },
    nextTick
  });
}

async function onPaste(event) {
  if (pasteHandler) {
    await pasteHandler(event);
  }
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  isDraggingOver.value = false;

  const file = event.dataTransfer.files[0];
  if (!file) return;

  if (file.type.startsWith('image/')) {
    handleImageUpload(file, event.target);
  } else {
    toast.show('仅支持拖拽图片文件', 'error');
  }
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'copy';
  isDraggingOver.value = true;
}

function handleDragEnter(event) {
  event.preventDefault();
  isDraggingOver.value = true;
}

function handleDragLeave(event) {
  event.preventDefault();
  if (event.target.classList.contains('markdown-input')) {
    isDraggingOver.value = false;
  }
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    const content = loadEvent.target.result || '';
    const fileTitle = file.name.replace(/\.(md|markdown)$/i, '');
    createNewDocument(content, fileTitle);
  };
  reader.onerror = () => toast.show('文件读取失败', 'error');
  reader.readAsText(file);
  event.target.value = '';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportMarkdown() {
  const activeDoc = getActiveDocument();
  const blob = new Blob([markdownInput.value], { type: 'text/markdown' });
  downloadBlob(blob, `${sanitizeFilename(resolveDocumentDisplayTitle(activeDoc))}.md`);
  toast.show('已导出 Markdown', 'success');
}

async function copyMarkdown() {
  const text = markdownInput.value.trim();
  if (!text) {
    toast.show('没有 Markdown 可复制', 'error');
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdownInput.value);
    } else {
      copyPlainTextFallback(markdownInput.value);
    }

    mdCopySuccess.value = true;
    toast.show('已复制 Markdown', 'success');
    setTimeout(() => { mdCopySuccess.value = false; }, 2000);
  } catch (error) {
    try {
      copyPlainTextFallback(markdownInput.value);
      mdCopySuccess.value = true;
      toast.show('已复制 Markdown（兼容模式）', 'success');
      setTimeout(() => { mdCopySuccess.value = false; }, 2000);
    } catch (fallbackError) {
      console.error('复制 Markdown 失败:', error, fallbackError);
      toast.show('复制 Markdown 失败，请检查浏览器剪贴板权限', 'error');
    }
  }
}

function copyPlainTextFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand('copy');
  textarea.remove();

  if (!success) {
    throw new Error('execCommand copy failed');
  }
}

async function inlineImagesForStandaloneHtml(html) {
  if (!html) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const images = Array.from(doc.querySelectorAll('img'));
  if (!images.length) return html;

  let convertedCount = 0;
  let failedCount = 0;

  for (const img of images) {
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) continue;

    try {
      const imageId = img.getAttribute('data-image-id');
      let blob = null;

      if (imageId && imageStore) {
        if (typeof imageStore.getImageRecord === 'function') {
          const record = await imageStore.getImageRecord(imageId);
          blob = record?.blob || null;
        }

        if (!blob && typeof imageStore.getImageBlob === 'function') {
          blob = await imageStore.getImageBlob(imageId);
        }
      }

      if (!blob) {
        const absoluteSrc = new URL(src, window.location.href).href;
        const response = await fetch(absoluteSrc);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        blob = await response.blob();
      }

      if (!blob) throw new Error('Image blob is empty');
      img.setAttribute('src', await blobToDataURL(blob));
      convertedCount += 1;
    } catch (error) {
      console.warn('导出 HTML 时图片内嵌失败，保留原地址:', src, error);
      failedCount += 1;
    }
  }

  if (convertedCount > 0) {
    toast.show(failedCount > 0 ? `已内嵌 ${convertedCount} 张图片，${failedCount} 张失败` : `已内嵌 ${convertedCount} 张图片`, failedCount > 0 ? 'error' : 'success');
  }

  return doc.body.innerHTML;
}

function buildStandaloneHtml(title, content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f7f2ee; }
    body {
      color: #24312c;
      font-family: "Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
    }
    .export-shell {
      width: min(760px, calc(100% - 32px));
      margin: 32px auto;
      padding: 24px 18px 56px;
      border-radius: 24px;
      background: #fff;
      box-shadow: 0 18px 60px rgba(36, 49, 44, 0.08);
    }
    img { max-width: 100% !important; height: auto !important; }
    table { width: 100%; border-collapse: collapse; }
    @media print {
      html, body { background: #fff; }
      .export-shell { width: auto; margin: 0; padding: 0; border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <main class="export-shell">${content}</main>
</body>
</html>`;
}

async function writePrintableDocument(printWindow, filenameBase) {
  const title = resolveDocumentDisplayTitle(getActiveDocument());
  const printableContent = await inlineImagesForStandaloneHtml(renderedContent.value);
  const printHtml = buildPrintableHtml(title, printableContent);

  printWindow.document.open();
  printWindow.document.write(printHtml);
  printWindow.document.close();

  try {
    printWindow.document.title = `${filenameBase}.pdf`;
  } catch (_error) {
    // ignore
  }
}

async function exportPDF() {
  if (!renderedContent.value) {
    toast.show('没有可导出的 PDF 内容', 'error');
    return;
  }

  const activeDoc = getActiveDocument();
  const filenameBase = sanitizeFilename(resolveDocumentDisplayTitle(activeDoc));
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    toast.show('浏览器拦截了 PDF 打印窗口，请允许弹出窗口后重试', 'error');
    return;
  }

  try {
    await writePrintableDocument(printWindow, filenameBase);
    toast.show('请在新窗口选择另存为 PDF', 'success');
  } catch (error) {
    if (!printWindow.closed) printWindow.close();
    console.error('导出 PDF 失败:', error);
    toast.show(`导出 PDF 失败：${error?.message || '请稍后再试'}`, 'error');
  }
}

function buildPrintableHtml(title, content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      color: #24312c;
      font-family: "Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-shell {
      max-width: 760px;
      margin: 0 auto;
      padding: 24px 18px 56px;
      background: #fff;
    }
    img { max-width: 100% !important; height: auto !important; break-inside: avoid; }
    pre, blockquote, table, figure { break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; }
    @page { size: A4; margin: 18mm 14mm; }
    @media print {
      .print-shell { max-width: none; padding: 0; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main class="print-shell">${content}</main>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 300);
    });
  <\/script>
</body>
</html>`;
}

async function exportHTML() {
  const activeDoc = getActiveDocument();
  if (!renderedContent.value) {
    toast.show('没有可导出的 HTML 内容', 'error');
    return;
  }

  try {
    const title = resolveDocumentDisplayTitle(activeDoc);
    const standaloneContent = await inlineImagesForStandaloneHtml(renderedContent.value);
    const standaloneHtml = buildStandaloneHtml(title, standaloneContent);
    const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, `${sanitizeFilename(title)}.html`);
    toast.show('已导出 HTML', 'success');
  } catch (error) {
    console.error('导出 HTML 失败:', error);
    toast.show(`导出 HTML 失败：${error?.message || '请稍后再试'}`, 'error');
  }
}

async function doCopy() {
  if (!renderedContent.value) {
    toast.show('没有内容可复制', 'error');
    return;
  }

  const key = buildWechatCopyKey();
  if (!preparedWechatCopyPayload || preparedWechatCopyKey !== key) {
    toast.show(copyPreparing.value ? '复制内容正在准备中，请稍后再点一次' : '正在准备复制内容，请稍后再点一次', 'success');
    prepareWechatCopyPayloadSilently({ notify: true });
    return;
  }

  const success = await writeWechatCopyPayload(
    preparedWechatCopyPayload,
    (message, type) => toast.show(message, type)
  );

  if (success) {
    copySuccess.value = true;
    setTimeout(() => { copySuccess.value = false; }, 2000);
  }
}

async function copyToTwitter() {
  if (!renderedContent.value) return;

  // Reserved for future platform-specific copy targets.
  await copyToX({
    renderedHTML: renderedContent.value,
    showToast: (message, type) => toast.show(message, type)
  });
}

function selectTheme(key) {
  currentStyle.value = key;
}

function openSaveLayoutPresetDialog() {
  const styleName = getStyleName(currentStyle.value);
  layoutPresetDialog.value = {
    show: true,
    mode: 'save',
    presetId: null,
    name: `${styleName}排版`
  };

  nextTick(() => {
    const input = document.querySelector('.layout-preset-name-input');
    input?.focus();
    input?.select();
  });
}

function openRenameLayoutPresetDialog(preset) {
  if (!preset?.id) return;

  layoutPresetDialog.value = {
    show: true,
    mode: 'rename',
    presetId: preset.id,
    name: preset.name
  };

  nextTick(() => {
    const input = document.querySelector('.layout-preset-name-input');
    input?.focus();
    input?.select();
  });
}

function cancelSaveLayoutPreset() {
  layoutPresetDialog.value = { show: false, mode: 'save', presetId: null, name: '' };
}

function confirmSaveLayoutPreset() {
  const name = layoutPresetDialog.value.name.trim();
  if (!name) {
    toast.show('请先给这个排版起个名字', 'error');
    return;
  }

  if (layoutPresetDialog.value.mode === 'rename') {
    const now = Date.now();
    let renamed = false;
    layoutPresets.value = saveLayoutPresets(layoutPresets.value.map((preset) => {
      if (preset.id !== layoutPresetDialog.value.presetId) return preset;
      renamed = true;
      return {
        ...preset,
        name,
        updatedAt: now
      };
    }));

    if (renamed) {
      toast.show('已重命名这个排版', 'success');
    }
    cancelSaveLayoutPreset();
    return;
  }

  const now = Date.now();
  const preset = {
    id: createDocumentId('layout'),
    name,
    createdAt: now,
    updatedAt: now,
    styleKey: currentStyle.value,
    codeTheme: currentCodeTheme.value,
    codeBlockSettings: clonePlain(codeBlockSettings.value),
    displaySettings: clonePlain(displaySettings.value)
  };

  layoutPresets.value = saveLayoutPresets([preset, ...layoutPresets.value]);
  cancelSaveLayoutPreset();
  toast.show('已保存到我的主题', 'success');
}

function applyLayoutPreset(preset) {
  if (!preset) return;

  if (STYLES[preset.styleKey]) {
    currentStyle.value = preset.styleKey;
  }

  if (isCodeThemeSelection(preset.codeTheme)) {
    currentCodeTheme.value = preset.codeTheme;
    try {
      localStorage.setItem(CODE_THEME_STORAGE_KEY, preset.codeTheme);
    } catch (_error) {
      // ignore
    }
  }

  codeBlockSettings.value = {
    ...getDefaultCodeBlockSettings(),
    ...clonePlain(preset.codeBlockSettings)
  };
  displaySettings.value = {
    ...getDefaultDisplaySettings(),
    ...clonePlain(preset.displaySettings)
  };

  renderMarkdown();
  persistDocumentState();
  toast.show(`已应用「${preset.name}」`, 'success');
}

function deleteLayoutPreset(presetId) {
  layoutPresets.value = saveLayoutPresets(layoutPresets.value.filter((preset) => preset.id !== presetId));
  toast.show('已删除这个排版预设', 'success');
}

function toggleStar(key) {
  toggleStarStyle(key);
  starredStyles.value = getStarredStyles();
  categorizedThemes.value = getCategorizedThemes();
}

function selectCodeTheme(key) {
  if (!isCodeThemeSelection(key)) return;
  currentCodeTheme.value = key;
  try {
    localStorage.setItem(CODE_THEME_STORAGE_KEY, key);
  } catch (_error) {
    // ignore
  }
  renderMarkdown();
}

function clampNumber(value, min, max, fallback, precision = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.min(max, Math.max(min, number));
  if (precision <= 0) return Math.round(clamped);
  return Number(clamped.toFixed(precision));
}

function updateDisplaySettings(nextSettings) {
  displaySettings.value = {
    ...displaySettings.value,
    ...nextSettings
  };
}

function setFontScale(value) {
  updateDisplaySettings({ fontScale: value });
}

function setBodyFontFamily(value) {
  if (!isBodyFontFamilyValue(value)) return;
  updateDisplaySettings({ bodyFontFamily: value });
}

function setQuoteFontFamily(value) {
  if (!isBodyFontFamilyValue(value)) return;
  updateDisplaySettings({ quoteFontFamily: value });
}

function updateTypographyMetric(field, value, min, max, precision = 0) {
  updateDisplaySettings({
    [field]: clampNumber(value, min, max, displaySettings.value[field] ?? min, precision)
  });
}

function updateTypographyColor(field, value) {
  const normalized = String(value || '').trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) return;
  updateDisplaySettings({ [field]: normalized });
}

function setImageStyleMode(value) {
  if (!['theme', 'custom'].includes(value)) return;
  updateDisplaySettings({ imageStyleMode: value });
}

function updateImageDisplaySettings(nextSettings) {
  updateDisplaySettings({
    imageStyleMode: 'custom',
    ...nextSettings
  });
}

function updateImageMetric(field, value, min, max) {
  updateImageDisplaySettings({
    [field]: clampNumber(value, min, max, displaySettings.value[field] ?? min)
  });
}

function setImageRadiusMode(value) {
  if (!['px', 'circle'].includes(value)) return;
  updateImageDisplaySettings({ imageRadiusMode: value });
}

function updateImageShadowOpacity(value) {
  updateImageDisplaySettings({
    imageShadowOpacity: clampNumber(
      Number(value) / 100,
      0,
      1,
      displaySettings.value.imageShadowOpacity ?? 0,
      2
    )
  });
}

function updateImageShadowColor(value) {
  const normalized = String(value || '').trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) return;
  updateImageDisplaySettings({ imageShadowColor: normalized });
}

function getTextarea() {
  return document.querySelector('.markdown-input');
}

function syncEditorSelection(event) {
  const textarea = event?.target || getTextarea();
  if (!textarea) return;

  editorSelection.value = {
    start: textarea.selectionStart ?? 0,
    end: textarea.selectionEnd ?? 0
  };
}

function getEditorSelection(textarea = getTextarea()) {
  if (!textarea) {
    return {
      start: editorSelection.value.start ?? 0,
      end: editorSelection.value.end ?? 0
    };
  }

  if (document.activeElement === textarea) {
    syncEditorSelection({ target: textarea });
  }

  return {
    start: editorSelection.value.start ?? 0,
    end: editorSelection.value.end ?? 0
  };
}

function insertAtCursor(text, options = {}) {
  const textarea = options.textarea || getTextarea();
  const { start, end } = getEditorSelection(textarea);
  const before = markdownInput.value.slice(0, start);
  const after = markdownInput.value.slice(end);

  markdownInput.value = `${before}${text}${after}`;

  nextTick(() => {
    const target = textarea || getTextarea();
    if (!target) return;

    const position = start + (options.selectionStart ?? text.length);
    const selectionEnd = options.selectionEnd != null ? start + options.selectionEnd : position;
    target.focus();
    target.selectionStart = position;
    target.selectionEnd = selectionEnd;
    syncEditorSelection({ target });
  });
}

function wrapSelection(before, after, placeholder = '文本') {
  const textarea = getTextarea();
  const { start, end } = getEditorSelection(textarea);
  const selected = markdownInput.value.substring(start, end) || placeholder;
  const text = `${before}${selected}${after}`;

  markdownInput.value = `${markdownInput.value.substring(0, start)}${text}${markdownInput.value.substring(end)}`;

  nextTick(() => {
    if (!textarea) return;
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
    syncEditorSelection({ target: textarea });
  });
}

function insertHeading(level) {
  insertAtCursor(`${'#'.repeat(level)} `);
}

function insertQuote() {
  insertAtCursor('> ');
}

function insertUnderline() {
  wrapSelection('<u>', '</u>', 'text');
}

function insertLink() {
  wrapSelection('[', '](https://example.com)', 'text');
}

function insertInlineCode() {
  wrapSelection('`', '`', 'code');
}

function applyListToSelection(type = 'unordered') {
  const textarea = getTextarea();
  const { start, end } = getEditorSelection(textarea);
  const source = markdownInput.value;

  if (start === end) {
    insertAtCursor(type === 'ordered' ? '1. ' : '- ');
    return;
  }

  const blockStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const blockEndIndex = source.indexOf('\n', end);
  const blockEnd = blockEndIndex === -1 ? source.length : blockEndIndex;
  const block = source.slice(blockStart, blockEnd);
  const lines = block.split('\n');

  const nextBlock = lines
    .map((line, index) => {
      if (!line.trim()) return line;
      const stripped = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, '');
      return type === 'ordered' ? `${index + 1}. ${stripped}` : `- ${stripped}`;
    })
    .join('\n');

  markdownInput.value = `${source.slice(0, blockStart)}${nextBlock}${source.slice(blockEnd)}`;

  nextTick(() => {
    const target = textarea || getTextarea();
    if (!target) return;
    target.focus();
    target.selectionStart = blockStart;
    target.selectionEnd = blockStart + nextBlock.length;
    syncEditorSelection({ target });
  });
}

function insertOrderedList() {
  applyListToSelection('ordered');
}

function insertUnorderedList() {
  applyListToSelection('unordered');
}

function insertDivider() {
  insertAtCursor('\n---\n');
}

function insertCodeBlock() {
  const textarea = getTextarea();
  const { start, end } = getEditorSelection(textarea);
  const selected = markdownInput.value.substring(start, end);
  const snippet = `\`\`\`\n${selected}\n\`\`\``;

  markdownInput.value = `${markdownInput.value.substring(0, start)}${snippet}${markdownInput.value.substring(end)}`;

  nextTick(() => {
    if (!textarea) return;
    textarea.focus();
    if (selected) {
      textarea.selectionStart = start + 4;
      textarea.selectionEnd = start + 4 + selected.length;
    } else {
      textarea.selectionStart = start + 4;
      textarea.selectionEnd = start + 4;
    }
    syncEditorSelection({ target: textarea });
  });
}

function insertImageSyntax() {
  insertAtCursor('![]()', { selectionStart: 4 });
}

function insertTable() {
  const table = '\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n';
  insertAtCursor(table);
}

function handleToolbarImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  handleImageUpload(file, getTextarea());
  event.target.value = '';
}

function handleKeydown(event) {
  const isMod = event.ctrlKey || event.metaKey;

  if (isMod && event.key.toLowerCase() === 's') {
    event.preventDefault();
    persistDocumentState();
    toast.show('已保存', 'success');
    return;
  }

  if (isMod && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    wrapSelection('**', '**');
    return;
  }

  if (isMod && event.key.toLowerCase() === 'i') {
    event.preventDefault();
    wrapSelection('*', '*');
    return;
  }

  if (isMod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    wrapSelection('[', '](url)');
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
  }
}

function setupSyncScroll() {
  const editor = getTextarea();
  const preview = document.querySelector('.preview-content');
  if (!editor || !preview) return;

  const sync = (source, target) => {
    if (syncLock || !syncScrollEnabled.value) return;
    syncLock = true;
    const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
    target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
    requestAnimationFrame(() => { syncLock = false; });
  };

  editor.addEventListener('scroll', () => sync(editor, preview));
  preview.addEventListener('scroll', () => sync(preview, editor));
}

function loadDefaultExample() {
  return `# AI 时代的创作

## AI 时代写作者的存档与表达

我想把文章写在 Obsidian 里，因为这里更像一个长期仓库：想法、草稿、发布版本都能留在同一套系统中。

写作不只是把内容发出去，也是在给未来的自己留下一条线索。每一次修改、每一张图片、每一个标题，都是那条线索上的节点。

![头像示例](${DEFAULT_SAMPLE_IMAGE}){width=42% radius=999 caption=头像示例}

### 为什么要做这个排版台

我希望 Markdown 写完之后，不需要再到公众号编辑器里重新排版。左侧继续写作，右侧直接预览，最后复制到公众号即可。

![排版示例](${DEFAULT_SAMPLE_IMAGE}){width=42% radius=999 caption=排版示例}

> 最理想的工作流，是写作、存档、排版和发布都在同一条路径上自然发生。

## 使用小提示

- 顶部工具栏可以快速插入标题、加粗、链接、引用和图片语法。
- 右侧「排版」面板可以调整字号、行距、段距、页边距、标题颜色和图片样式。
- 图片也可以在 Markdown 后面写参数，例如 \`{width=80% height=auto fit=contain radius=16}\`。`;
}

function initResizeHandles() {
  const resizeState = {
    handle: null,
    startX: 0,
    startEditorWidth: 0,
    startRightWidth: 0,
    type: null
  };

  document.addEventListener('mousedown', (event) => {
    const handle = event.target.closest('.resize-handle');
    if (!handle) return;

    resizeState.handle = handle;
    resizeState.startX = event.clientX;
    resizeState.type = handle.dataset.handle;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const editorPanel = document.querySelector('.editor-panel');
    const rightPanel = document.querySelector('.right-panel');

    if (resizeState.type === 'editor-preview') {
      resizeState.startEditorWidth = editorPanel?.offsetWidth || 0;
    } else if (resizeState.type === 'preview-right') {
      resizeState.startRightWidth = rightPanel?.offsetWidth || 0;
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (!resizeState.handle) return;

    const mainArea = document.querySelector('.main-area');
    const editorPanel = document.querySelector('.editor-panel');
    const rightPanel = document.querySelector('.right-panel');
    if (!mainArea) return;

    const delta = event.clientX - resizeState.startX;
    const mainWidth = mainArea.offsetWidth;

    if (resizeState.type === 'editor-preview' && editorPanel) {
      const newWidth = resizeState.startEditorWidth + delta;
      const clampedWidth = Math.max(200, Math.min(mainWidth * 0.6, newWidth));
      editorWidth.value = (clampedWidth / mainWidth * 100).toFixed(2);
    } else if (resizeState.type === 'preview-right' && rightPanel) {
      const newWidth = resizeState.startRightWidth + delta;
      rightPanelWidth.value = Math.max(280, Math.min(500, newWidth));
    }
  });

  document.addEventListener('mouseup', () => {
    if (!resizeState.handle) return;
    resizeState.handle.classList.remove('dragging');
    resizeState.handle = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

const app = createApp({
  setup() {
    watch(markdownInput, (value) => {
      renderMarkdown();
      updateStats();

      if (suppressEditorSync) {
        suppressEditorSync = false;
        return;
      }

      const activeDoc = getActiveDocument();
      if (!activeDoc) return;

      activeDoc.content = value;
      markCurrentDocumentDirty();
      schedulePersistDocumentState();
    });

    watch(currentDocumentTitle, (value) => {
      if (suppressTitleSync) {
        suppressTitleSync = false;
        return;
      }

      const activeDoc = getActiveDocument();
      if (!activeDoc) return;

      activeDoc.manualTitle = value;
      activeDoc.title = value || activeDoc.title;
      markCurrentDocumentDirty();
      schedulePersistDocumentState();
    });

    watch(currentStyle, () => {
      renderMarkdown();
      persistDocumentState();
    });

    watch(codeBlockSettings, () => {
      renderMarkdown();
      persistDocumentState();
    }, { deep: true });

    watch(displaySettings, () => {
      renderMarkdown();
      persistDocumentState();
    }, { deep: true });

    onMounted(async () => {
      starredStyles.value = getStarredStyles();
      layoutPresets.value = loadLayoutPresets();

      const preferences = loadPreferences();
      currentStyle.value = preferences.currentStyle;
      codeBlockSettings.value = preferences.codeBlockSettings;
      displaySettings.value = preferences.displaySettings;
      tocVisible.value = preferences.tocVisible;

      try {
        const savedCodeTheme = localStorage.getItem(CODE_THEME_STORAGE_KEY);
        if (isCodeThemeSelection(savedCodeTheme)) {
          currentCodeTheme.value = savedCodeTheme;
        }
      } catch (_error) {
        // ignore
      }

      initResizeHandles();

      imageStore = new ImageStore();
      try {
        await imageStore.init();
      } catch (error) {
        console.error('ImageStore 初始化失败:', error);
      }

      imageCompressor = new ImageCompressor({ maxWidth: 1920, maxHeight: 1920, quality: 0.85 });
      md = createMarkdownEngine();
      initPasteHandler();

      if (preferences.documents.length > 0) {
        documents.value = preferences.documents.map((doc, index) => buildDocument({ ...doc, sortOrder: doc.sortOrder ?? index }));
      } else if (preferences.content) {
        documents.value = [buildDocument({ content: preferences.content, title: getUntitledTitle([]), manualTitle: '' })];
      } else {
        documents.value = [buildDocument({ content: loadDefaultExample(), title: getUntitledTitle([]), manualTitle: '' })];
      }

      activeDocumentId.value = preferences.activeDocumentId;
      ensureActiveDocument();
      syncEditorFromActiveDocument();
      renderMarkdown();
      persistDocumentState();

      nextTick(() => setupSyncScroll());
    });

    return {
      markdownInput,
      renderedContent,
      currentStyle,
      starredStyles,
      currentCodeTheme,
      documents,
      activeDocumentId,
      currentDocumentTitle,
      documentSearch,
      layoutPresets,
      hasLayoutPresets,
      filteredDocuments,
      isImageStyleCustom,
      previewMode,
      tocVisible,
      tocItems,
      isDraggingOver,
      copySuccess,
      mdCopySuccess,
      activePanel,
      settingsOpen,
      toastState,
      sidebarOpen,
      deleteConfirm,
      layoutPresetDialog,
      wordCount,
      charCount,
      readTime,
      lastSavedTime,
      currentSaveState,
      syncScrollEnabled,
      editorWidth,
      rightPanelWidth,
      categorizedThemes,
      codeThemeList,
      bodyFontFamilyOptions,
      fontScaleOptions,
      imageStyleModeOptions,
      imageRadiusModeOptions,
      codeBlockSettings,
      displaySettings,
      STYLES,
      renderMarkdown,
      setLayoutPanelTab,
      toggleSettingsPanel,
      toggleToc,
      scrollToTocHeading,
      doCopy,
      copyMarkdown,
      copyToTwitter,
      onPaste,
      handleDrop,
      handleDragOver,
      handleDragEnter,
      handleDragLeave,
      handleFileUpload,
      handleToolbarImageUpload,
      exportMarkdown,
      exportPDF,
      exportHTML,
      selectTheme,
      openSaveLayoutPresetDialog,
      openRenameLayoutPresetDialog,
      cancelSaveLayoutPreset,
      confirmSaveLayoutPreset,
      applyLayoutPreset,
      deleteLayoutPreset,
      toggleStar,
      selectCodeTheme,
      setBodyFontFamily,
      setQuoteFontFamily,
      setImageStyleMode,
      setFontScale,
      updateTypographyMetric,
      updateTypographyColor,
      setImageRadiusMode,
      updateImageMetric,
      updateImageShadowOpacity,
      updateImageShadowColor,
      handleKeydown,
      syncEditorSelection,
      insertHeading,
      insertQuote,
      insertUnderline,
      insertLink,
      insertInlineCode,
      insertOrderedList,
      insertUnorderedList,
      insertCodeBlock,
      insertDivider,
      insertImageSyntax,
      insertTable,
      wrapSelection,
      getStyleName,
      isRecommended,
      getDocumentDisplayTitle: resolveDocumentDisplayTitle,
      formatDateTime,
      switchDocument,
      createNewDocument,
      renameDocument,
      duplicateDocument,
      deleteDocument,
      moveDocument,
      showDeleteConfirm,
      cancelDelete,
      confirmDelete,
      getSaveStateLabel,
      getSaveStateClass
    };
  }
});

app.mount('#app');
