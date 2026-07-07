/**
 * Local layout preset persistence.
 * A preset stores presentation settings, not article content.
 * @module layout-presets
 */

const STORAGE_KEY = 'zhizi-wechat-md:layoutPresets';

function parseJSON(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function normalizePreset(preset) {
  if (!preset || typeof preset !== 'object') return null;
  if (typeof preset.id !== 'string' || typeof preset.name !== 'string') return null;

  return {
    id: preset.id,
    name: preset.name.trim() || '未命名排版',
    createdAt: typeof preset.createdAt === 'number' ? preset.createdAt : Date.now(),
    updatedAt: typeof preset.updatedAt === 'number' ? preset.updatedAt : Date.now(),
    styleKey: typeof preset.styleKey === 'string' ? preset.styleKey : 'wechat-default',
    codeTheme: typeof preset.codeTheme === 'string' ? preset.codeTheme : 'follow-theme',
    codeBlockSettings: preset.codeBlockSettings && typeof preset.codeBlockSettings === 'object'
      ? preset.codeBlockSettings
      : {},
    displaySettings: preset.displaySettings && typeof preset.displaySettings === 'object'
      ? preset.displaySettings
      : {}
  };
}

export function loadLayoutPresets() {
  try {
    const presets = parseJSON(localStorage.getItem(STORAGE_KEY), []);
    if (!Array.isArray(presets)) return [];

    return presets
      .map(normalizePreset)
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (_error) {
    return [];
  }
}

export function saveLayoutPresets(presets) {
  try {
    const normalized = Array.isArray(presets)
      ? presets.map(normalizePreset).filter(Boolean)
      : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (_error) {
    console.error('保存我的主题失败');
    return loadLayoutPresets();
  }
}
