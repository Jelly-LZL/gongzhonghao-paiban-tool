/**
 * Code block theme definitions and highlight palette helpers.
 * @module code-themes
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(hex) {
  const value = String(hex || '').trim();
  if (!value.startsWith('#')) return null;

  const raw = value.slice(1);
  if (raw.length === 3) {
    return `#${raw.split('').map((char) => char + char).join('')}`;
  }

  if (raw.length === 6) {
    return `#${raw}`;
  }

  return null;
}

function parseRgbColor(value) {
  const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;

  return {
    r: clamp(Math.round(parts[0]), 0, 255),
    g: clamp(Math.round(parts[1]), 0, 255),
    b: clamp(Math.round(parts[2]), 0, 255)
  };
}

function parseColor(value) {
  const hex = normalizeHex(value);
  if (hex) {
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16)
    };
  }

  return parseRgbColor(value);
}

function rgbToHex({ r, g, b }) {
  const toHex = (channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColors(colorA, colorB, ratio = 0.5) {
  const parsedA = parseColor(colorA);
  const parsedB = parseColor(colorB);

  if (!parsedA && !parsedB) return colorA || colorB || '#666666';
  if (!parsedA) return rgbToHex(parsedB);
  if (!parsedB) return rgbToHex(parsedA);

  const weight = clamp(ratio, 0, 1);
  return rgbToHex({
    r: parsedA.r * weight + parsedB.r * (1 - weight),
    g: parsedA.g * weight + parsedB.g * (1 - weight),
    b: parsedA.b * weight + parsedB.b * (1 - weight)
  });
}

function getRelativeLuminance(color) {
  const parsed = parseColor(color);
  if (!parsed) return 1;

  const toLinear = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(parsed.r);
  const g = toLinear(parsed.g);
  const b = toLinear(parsed.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isDarkColor(color) {
  return getRelativeLuminance(color) < 0.45;
}

function getContrastRatio(colorA, colorB) {
  const luminanceA = getRelativeLuminance(colorA);
  const luminanceB = getRelativeLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureReadableColor(color, bg, fallback, minContrast = 3) {
  if (!color) return fallback;
  if (getContrastRatio(color, bg) >= minContrast) return color;
  if (fallback && getContrastRatio(fallback, bg) >= minContrast) return fallback;

  const darkMode = isDarkColor(bg);
  const anchor = darkMode ? '#f3f4f6' : '#1f2937';
  const base = fallback || color;
  const firstAttempt = mixColors(base, anchor, 0.72);
  if (getContrastRatio(firstAttempt, bg) >= minContrast) return firstAttempt;

  const secondAttempt = mixColors(anchor, base, 0.78);
  if (getContrastRatio(secondAttempt, bg) >= minContrast) return secondAttempt;

  return anchor;
}

function extractStyleValue(styleText, property) {
  if (!styleText || !property) return null;
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(styleText).match(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : null;
}

function extractColorToken(value) {
  if (!value) return null;
  const colorMatch = String(value).match(/(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/);
  return colorMatch ? colorMatch[1] : null;
}

function getColorFromStyle(styleText, properties) {
  for (const property of properties) {
    const value = extractStyleValue(styleText, property);
    const color = extractColorToken(value);
    if (color) return color;
  }
  return null;
}

function buildTokenPalette({
  textColor,
  bg,
  primary,
  secondary,
  tertiary,
  quaternary,
  number,
  comment,
  type,
  punctuation,
  meta
}) {
  return {
    keyword: primary,
    string: tertiary,
    number,
    title: secondary,
    comment,
    meta: meta || secondary,
    attr: number,
    attribute: type,
    property: quaternary,
    variable: textColor,
    literal: number,
    builtIn: secondary,
    type,
    operator: mixColors(primary, textColor, 0.75),
    punctuation: punctuation || mixColors(textColor, bg, isDarkColor(bg) ? 0.78 : 0.64),
    function: secondary,
    class: type,
    regexp: tertiary,
    subst: textColor,
    params: mixColors(textColor, secondary, 0.72),
    tag: primary,
    selector: primary,
    link: secondary
  };
}

function createCodeTheme({
  name,
  description,
  bg,
  headerBg,
  textColor,
  borderColor,
  primary,
  secondary,
  tertiary,
  quaternary,
  number,
  comment,
  type,
  punctuation,
  meta
}) {
  const tokens = buildTokenPalette({
    textColor,
    bg,
    primary,
    secondary,
    tertiary,
    quaternary,
    number,
    comment,
    type,
    punctuation,
    meta
  });

  return {
    name,
    description,
    bg,
    headerBg,
    textColor,
    borderColor,
    tokens,
    syntaxHighlight: tokens
  };
}

const PREVIEW_TOKENS = [
  [
    { text: 'function', token: 'keyword' },
    { text: ' ', token: null },
    { text: 'hello', token: 'function' },
    { text: '()', token: 'punctuation' },
    { text: ' ', token: null },
    { text: '{', token: 'punctuation' }
  ],
  [
    { text: '  ', token: null },
    { text: 'return', token: 'keyword' },
    { text: ' ', token: null },
    { text: '"world"', token: 'string' },
    { text: ';', token: 'punctuation' }
  ],
  [
    { text: '}', token: 'punctuation' }
  ]
];

export const CODE_THEMES = {
  'github-light': createCodeTheme({
    name: 'GitHub Light',
    description: 'Classic light theme',
    bg: '#f6f8fa',
    headerBg: '#e8ecf0',
    textColor: '#24292e',
    borderColor: '#d1d5da',
    primary: '#cf222e',
    secondary: '#8250df',
    tertiary: '#0a3069',
    quaternary: '#116329',
    number: '#0550ae',
    comment: '#6e7781',
    type: '#953800'
  }),
  'github-dark': createCodeTheme({
    name: 'GitHub Dark',
    description: 'GitHub dark mode',
    bg: '#0d1117',
    headerBg: '#010409',
    textColor: '#c9d1d9',
    borderColor: '#30363d',
    primary: '#ff7b72',
    secondary: '#d2a8ff',
    tertiary: '#a5d6ff',
    quaternary: '#7ee787',
    number: '#79c0ff',
    comment: '#8b949e',
    type: '#ffa657'
  }),
  'one-dark': createCodeTheme({
    name: 'One Dark',
    description: 'VS Code inspired',
    bg: '#282c34',
    headerBg: '#21252b',
    textColor: '#abb2bf',
    borderColor: '#181a1f',
    primary: '#c678dd',
    secondary: '#61afef',
    tertiary: '#98c379',
    quaternary: '#56b6c2',
    number: '#d19a66',
    comment: '#5c6370',
    type: '#e5c07b'
  }),
  monokai: createCodeTheme({
    name: 'Monokai',
    description: 'Classic editor theme',
    bg: '#272822',
    headerBg: '#1e1f1c',
    textColor: '#f8f8f2',
    borderColor: '#1a1b18',
    primary: '#f92672',
    secondary: '#a6e22e',
    tertiary: '#e6db74',
    quaternary: '#66d9ef',
    number: '#ae81ff',
    comment: '#75715e',
    type: '#fd971f'
  }),
  dracula: createCodeTheme({
    name: 'Dracula',
    description: 'Purple-leaning dark theme',
    bg: '#282a36',
    headerBg: '#21222c',
    textColor: '#f8f8f2',
    borderColor: '#191a21',
    primary: '#ff79c6',
    secondary: '#8be9fd',
    tertiary: '#f1fa8c',
    quaternary: '#50fa7b',
    number: '#bd93f9',
    comment: '#6272a4',
    type: '#ffb86c'
  }),
  'solarized-light': createCodeTheme({
    name: 'Solarized Light',
    description: 'Warm light theme',
    bg: '#fdf6e3',
    headerBg: '#eee8d5',
    textColor: '#586e75',
    borderColor: '#d3cbb7',
    primary: '#859900',
    secondary: '#268bd2',
    tertiary: '#2aa198',
    quaternary: '#657b83',
    number: '#d33682',
    comment: '#93a1a1',
    type: '#b58900'
  }),
  'solarized-dark': createCodeTheme({
    name: 'Solarized Dark',
    description: 'Solarized dark mode',
    bg: '#002b36',
    headerBg: '#001f27',
    textColor: '#93a1a1',
    borderColor: '#073642',
    primary: '#859900',
    secondary: '#268bd2',
    tertiary: '#2aa198',
    quaternary: '#b58900',
    number: '#d33682',
    comment: '#586e75',
    type: '#cb4b16'
  }),
  'night-owl': createCodeTheme({
    name: 'Night Owl',
    description: 'High-contrast dark theme',
    bg: '#011627',
    headerBg: '#01101d',
    textColor: '#d6deeb',
    borderColor: '#001122',
    primary: '#c792ea',
    secondary: '#82aaff',
    tertiary: '#ecc48d',
    quaternary: '#7fdbca',
    number: '#f78c6c',
    comment: '#637777',
    type: '#ffcb8b'
  }),
  nord: createCodeTheme({
    name: 'Nord',
    description: 'Arctic blue palette',
    bg: '#2e3440',
    headerBg: '#242933',
    textColor: '#d8dee9',
    borderColor: '#3b4252',
    primary: '#81a1c1',
    secondary: '#88c0d0',
    tertiary: '#a3be8c',
    quaternary: '#8fbcbb',
    number: '#b48ead',
    comment: '#616e88',
    type: '#ebcb8b'
  }),
  'gruvbox-light': createCodeTheme({
    name: 'Gruvbox Light',
    description: 'Retro warm light theme',
    bg: '#fbf1c7',
    headerBg: '#ebdbb2',
    textColor: '#3c3836',
    borderColor: '#d5c4a1',
    primary: '#9d0006',
    secondary: '#076678',
    tertiary: '#79740e',
    quaternary: '#427b58',
    number: '#8f3f71',
    comment: '#928374',
    type: '#b57614'
  }),
  'gruvbox-dark': createCodeTheme({
    name: 'Gruvbox Dark',
    description: 'Retro warm dark theme',
    bg: '#282828',
    headerBg: '#1d2021',
    textColor: '#ebdbb2',
    borderColor: '#3c3836',
    primary: '#fb4934',
    secondary: '#83a598',
    tertiary: '#b8bb26',
    quaternary: '#8ec07c',
    number: '#d3869b',
    comment: '#928374',
    type: '#fabd2f'
  }),
  'catppuccin-mocha': createCodeTheme({
    name: 'Catppuccin Mocha',
    description: 'Soft pastel dark theme',
    bg: '#1e1e2e',
    headerBg: '#181825',
    textColor: '#cdd6f4',
    borderColor: '#313244',
    primary: '#cba6f7',
    secondary: '#89b4fa',
    tertiary: '#a6e3a1',
    quaternary: '#94e2d5',
    number: '#fab387',
    comment: '#6c7086',
    type: '#f9e2af'
  }),
  'catppuccin-latte': createCodeTheme({
    name: 'Catppuccin Latte',
    description: 'Soft pastel light theme',
    bg: '#eff1f5',
    headerBg: '#e6e9ef',
    textColor: '#4c4f69',
    borderColor: '#ccd0da',
    primary: '#8839ef',
    secondary: '#1e66f5',
    tertiary: '#40a02b',
    quaternary: '#179299',
    number: '#fe640b',
    comment: '#8c8fa1',
    type: '#df8e1d'
  }),
  'tokyo-night': createCodeTheme({
    name: 'Tokyo Night',
    description: 'Neon city dark theme',
    bg: '#1a1b26',
    headerBg: '#16161e',
    textColor: '#c0caf5',
    borderColor: '#24283b',
    primary: '#bb9af7',
    secondary: '#7aa2f7',
    tertiary: '#9ece6a',
    quaternary: '#2ac3de',
    number: '#ff9e64',
    comment: '#565f89',
    type: '#e0af68'
  }),
  oxocarbon: createCodeTheme({
    name: 'Oxocarbon',
    description: 'Carbon-inspired theme',
    bg: '#262626',
    headerBg: '#1a1a1a',
    textColor: '#eeeeee',
    borderColor: '#333333',
    primary: '#be95ff',
    secondary: '#78a9ff',
    tertiary: '#42be65',
    quaternary: '#3ddbd9',
    number: '#ff7eb6',
    comment: '#6f6f6f',
    type: '#ffb000'
  }),
  'vitesse-dark': createCodeTheme({
    name: 'Vitesse Dark',
    description: 'Vitesse-inspired dark theme',
    bg: '#1a1b26',
    headerBg: '#16161e',
    textColor: '#c0caf5',
    borderColor: '#24283b',
    primary: '#4d9375',
    secondary: '#bd976a',
    tertiary: '#c98a7d',
    quaternary: '#4c9a91',
    number: '#b8a965',
    comment: '#758575',
    type: '#6394bf'
  })
};

const LEGACY_THEME_ALIASES = {
  ' Gruvbox Light': 'gruvbox-light'
};

export const DEFAULT_CODE_THEME = 'one-dark';
export const FOLLOW_THEME_CODE_STYLE = 'follow-theme';

function resolveThemeKey(key) {
  if (!key) return null;
  if (CODE_THEMES[key]) return key;
  return LEGACY_THEME_ALIASES[key] || null;
}

export function getCodeTheme(key) {
  const themeKey = resolveThemeKey(key);
  return themeKey ? CODE_THEMES[themeKey] : null;
}

export function isCodeThemeSelection(key) {
  if (!key) return false;
  return key === FOLLOW_THEME_CODE_STYLE || Boolean(resolveThemeKey(key));
}

export function resolveCodeTheme(key) {
  if (!key || key === FOLLOW_THEME_CODE_STYLE) return null;
  const themeKey = resolveThemeKey(key);
  return themeKey ? CODE_THEMES[themeKey] : CODE_THEMES[DEFAULT_CODE_THEME];
}

export function getCodeHighlightTheme(codeTheme, styleConfig) {
  if (codeTheme?.tokens || codeTheme?.syntaxHighlight) {
    return normalizeHighlightTheme(codeTheme);
  }

  return deriveThemeAwareHighlightTheme(styleConfig);
}

function normalizeHighlightTheme(theme) {
  const tokens = theme?.tokens || theme?.syntaxHighlight || {};
  return {
    ...theme,
    tokens,
    syntaxHighlight: tokens
  };
}

function createCodeThemePreview(theme) {
  const resolvedTheme = normalizeHighlightTheme(theme);
  return {
    bg: resolvedTheme.bg,
    headerBg: resolvedTheme.headerBg || mixColors(resolvedTheme.bg, resolvedTheme.borderColor, 0.88),
    textColor: resolvedTheme.textColor,
    borderColor: resolvedTheme.borderColor,
    tokens: resolvedTheme.tokens,
    lines: PREVIEW_TOKENS.map((line) => line.map((segment) => ({
      text: segment.text,
      color: segment.token ? (resolvedTheme.tokens[segment.token] || resolvedTheme.textColor) : resolvedTheme.textColor
    })))
  };
}

function deriveThemeAwareHighlightTheme(styleConfig) {
  const styles = styleConfig?.styles || {};
  const preStyle = styles.pre || '';
  const codeStyle = styles.code || '';
  const containerStyle = styles.container || '';
  const linkStyle = styles.a || '';
  const h1Style = styles.h1 || '';
  const h2Style = styles.h2 || '';
  const h3Style = styles.h3 || '';
  const strongStyle = styles.strong || '';
  const emStyle = styles.em || '';

  const bg = getColorFromStyle(preStyle, ['background-color', 'background'])
    || getColorFromStyle(codeStyle, ['background-color', 'background'])
    || '#f6f8fa';
  const textColor = getColorFromStyle(codeStyle, ['color'])
    || getColorFromStyle(preStyle, ['color'])
    || getColorFromStyle(containerStyle, ['color'])
    || '#24292e';
  const borderColor = getColorFromStyle(preStyle, ['border-color', 'border'])
    || mixColors(textColor, bg, isDarkColor(bg) ? 0.28 : 0.18);
  const accent = getColorFromStyle(linkStyle, ['color'])
    || getColorFromStyle(h2Style, ['border-left', 'border-bottom', 'color'])
    || getColorFromStyle(h1Style, ['border-bottom', 'color'])
    || '#3b82f6';
  const headingColor = getColorFromStyle(h2Style, ['color'])
    || getColorFromStyle(h3Style, ['color'])
    || getColorFromStyle(strongStyle, ['color'])
    || accent;
  const emphasisColor = getColorFromStyle(emStyle, ['color'])
    || mixColors(textColor, bg, isDarkColor(bg) ? 0.65 : 0.52);
  const darkMode = isDarkColor(bg);

  const secondary = headingColor !== textColor
    ? headingColor
    : mixColors(accent, darkMode ? '#d2a8ff' : '#8250df', 0.42);
  const tertiary = mixColors(accent, darkMode ? '#a5d6ff' : '#0a3069', 0.34);
  const quaternary = mixColors(accent, darkMode ? '#7ee787' : '#116329', 0.28);
  const number = mixColors(accent, darkMode ? '#79c0ff' : '#0550ae', 0.38);
  const comment = mixColors(emphasisColor, bg, darkMode ? 0.62 : 0.48);
  const type = mixColors(headingColor, darkMode ? '#ffa657' : '#953800', 0.34);
  const punctuation = mixColors(textColor, bg, darkMode ? 0.8 : 0.68);
  const meta = mixColors(accent, textColor, darkMode ? 0.7 : 0.58);
  const baseTokens = buildTokenPalette({
    textColor,
    bg,
    primary: accent,
    secondary,
    tertiary,
    quaternary,
    number,
    comment,
    type,
    punctuation,
    meta
  });
  const readableFallback = ensureReadableColor(accent, bg, textColor, 3.2);
  const tokens = Object.fromEntries(
    Object.entries(baseTokens).map(([token, color]) => {
      const minContrast = token === 'comment' || token === 'punctuation' ? 2.4 : 3;
      return [token, ensureReadableColor(color, bg, readableFallback, minContrast)];
    })
  );

  return {
    name: '跟随主题风格',
    description: '默认的文章样式风格',
    bg,
    headerBg: bg,
    textColor,
    borderColor,
    tokens,
    syntaxHighlight: tokens
  };
}

export function getCodeThemeList() {
  const followPreviewTheme = normalizeHighlightTheme(CODE_THEMES[DEFAULT_CODE_THEME]);

  return [
    {
      key: FOLLOW_THEME_CODE_STYLE,
      name: '跟随主题风格',
      description: '默认的文章样式风格',
      preview: createCodeThemePreview(followPreviewTheme)
    },
    ...Object.entries(CODE_THEMES).map(([key, value]) => ({
      key,
      name: value.name,
      description: value.description,
      preview: createCodeThemePreview(value)
    }))
  ];
}
