/**
 * Markdown engine setup with CJK emphasis patching.
 * @module markdown-engine
 */

const EMPHASIS_MARKERS = new Set([0x2A, 0x5F, 0x7E]);

function isCjkLetter(charCode) {
  if (!charCode || charCode < 0) return false;

  return (
    (charCode >= 0x3400 && charCode <= 0x4DBF) ||
    (charCode >= 0x4E00 && charCode <= 0x9FFF) ||
    (charCode >= 0xF900 && charCode <= 0xFAFF) ||
    (charCode >= 0xFF01 && charCode <= 0xFF60) ||
    (charCode >= 0xFF61 && charCode <= 0xFF9F) ||
    (charCode >= 0xFFA0 && charCode <= 0xFFDC)
  );
}

function createSafeLeadingPunctuationChecker() {
  const fallbackChars = '「」『』（）【】〔〕《》〈〉"\'；：？！';
  const fallbackSet = new Set(fallbackChars.split('').map((char) => char.codePointAt(0)));

  let unicodeRegex = null;
  try {
    unicodeRegex = new RegExp('[\\p{Ps}\\p{Pi}]', 'u');
  } catch (_error) {
    unicodeRegex = null;
  }

  return (charCode, marker) => {
    if (!EMPHASIS_MARKERS.has(marker)) return false;
    if (unicodeRegex && unicodeRegex.test(String.fromCharCode(charCode))) return true;
    return fallbackSet.has(charCode);
  };
}

function patchMarkdownScanner(md) {
  if (!md?.inline?.State) return;

  const utils = md.utils;
  const StateInline = md.inline.State;
  const allowLeadingPunctuation = createSafeLeadingPunctuationChecker();
  const originalScanDelims = StateInline.prototype.scanDelims;

  StateInline.prototype.scanDelims = function scanDelims(start, canSplitWord) {
    const max = this.posMax;
    const marker = this.src.charCodeAt(start);

    if (!EMPHASIS_MARKERS.has(marker)) {
      return originalScanDelims.call(this, start, canSplitWord);
    }

    const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20;
    let pos = start;
    while (pos < max && this.src.charCodeAt(pos) === marker) pos += 1;

    const count = pos - start;
    const nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20;
    const isLastWhiteSpace = utils.isWhiteSpace(lastChar);
    const isNextWhiteSpace = utils.isWhiteSpace(nextChar);

    let isLastPunctChar = utils.isMdAsciiPunct(lastChar) || utils.isPunctChar(String.fromCharCode(lastChar));
    let isNextPunctChar = utils.isMdAsciiPunct(nextChar) || utils.isPunctChar(String.fromCharCode(nextChar));

    if (isNextPunctChar && allowLeadingPunctuation(nextChar, marker)) {
      isNextPunctChar = false;
    }

    if (marker === 0x5F) {
      if (!isLastWhiteSpace && !isLastPunctChar && isCjkLetter(lastChar)) isLastPunctChar = true;
      if (!isNextWhiteSpace && !isNextPunctChar && isCjkLetter(nextChar)) isNextPunctChar = true;
    }

    const leftFlanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
    const rightFlanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);

    return {
      can_open: leftFlanking && (canSplitWord || !rightFlanking || isLastPunctChar),
      can_close: rightFlanking && (canSplitWord || !leftFlanking || isNextPunctChar),
      length: count
    };
  };
}

function renderCodeBlock(str, lang, md) {
  const codeContent = md.utils.escapeHtml(str);
  const language = (lang || '').trim();
  const safeLanguage = md.utils.escapeHtml(language);
  const codeClasses = ['md-code-block-code'];
  if (language) codeClasses.push(`language-${safeLanguage}`);

  return `
    <div class="md-code-block" data-code-block="true"${safeLanguage ? ` data-language="${safeLanguage}"` : ''}>
      <pre class="md-code-block-pre"><code class="${codeClasses.join(' ')}"${safeLanguage ? ` data-language="${safeLanguage}"` : ''}>${codeContent}</code></pre>
    </div>
  `;
}

export function createMarkdownEngine() {
  const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: false
  });

  patchMarkdownScanner(md);
  registerMathPlugin(md);

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const language = info ? info.split(/\s+/g)[0] : '';
    return renderCodeBlock(token.content, language, md);
  };

  return md;
}

function registerMathPlugin(md) {
  const texmath = window.texmath;
  const katex = window.katex;

  if (typeof texmath !== 'function' || !katex) return;

  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: {
      throwOnError: false,
      strict: 'ignore',
      output: 'htmlAndMathml'
    }
  });
}

export function preprocessMarkdown(content) {
  let normalized = content;
  normalized = normalizeImageAttributes(normalized);
  normalized = normalized.replace(/^(\s*(?:\d+\.|-|\*)\s+[^:\n]+)\n\s*:\s*(.+?)$/gm, '$1: $2');
  normalized = normalized.replace(/^(\s*(?:\d+\.|-|\*)\s+.+?:)\s*\n\s+(.+?)$/gm, '$1 $2');
  normalized = normalized.replace(/^(\s*(?:\d+\.|-|\*)\s+[^:\n]+)\n:\s*(.+?)$/gm, '$1: $2');
  normalized = normalized.replace(/^(\s*(?:\d+\.|-|\*)\s+.+?)\n\n\s+(.+?)$/gm, '$1 $2');
  return normalized;
}

function normalizeImageAttributes(content) {
  return String(content || '').replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)\{([^}]+)\}/g,
    (_match, alt, src, attrs) => {
      const parsed = parseImageAttributeText(attrs);
      const width = parsed.width ? ` data-md-width="${escapeHtmlAttribute(parsed.width)}"` : '';
      const height = parsed.height ? ` data-md-height="${escapeHtmlAttribute(parsed.height)}"` : '';
      const radius = parsed.radius ? ` data-md-radius="${escapeHtmlAttribute(parsed.radius)}"` : '';
      const fit = parsed.fit ? ` data-md-fit="${escapeHtmlAttribute(parsed.fit)}"` : '';
      const image = `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}"${width}${height}${radius}${fit}>`;
      if (!parsed.caption) return image;

      return `<figure data-md-figure="true">${image}<figcaption data-md-caption="true">${escapeHtmlText(parsed.caption)}</figcaption></figure>`;
    }
  );
}

function parseImageAttributeText(text) {
  const result = {};
  const attrPattern = /([A-Za-z][\w-]*)=("([^"]*)"|'([^']*)'|[^\s]+)/g;
  let match;

  while ((match = attrPattern.exec(String(text || ''))) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[3] ?? match[4] ?? match[2];
    if (key && value != null) result[key] = value;
  }

  return result;
}

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
