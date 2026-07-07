/**
 * Font family options used by preview, export and persisted preferences.
 * @module display-fonts
 */

export const BODY_FONT_FAMILY_DEFAULT = 'theme';

export const BODY_FONT_FAMILY_OPTIONS = [
  {
    label: '跟随主题',
    value: BODY_FONT_FAMILY_DEFAULT,
    meta: '保留模板',
    css: ''
  },
  {
    label: '微软雅黑',
    value: 'microsoft-yahei',
    meta: '稳妥通用',
    css: '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif'
  },
  {
    label: '等线',
    value: 'dengxian',
    meta: '清爽理性',
    css: 'DengXian, "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif'
  },
  {
    label: '宋体',
    value: 'simsun',
    meta: '传统书面',
    css: 'SimSun, "Songti SC", STSong, "Noto Serif SC", serif'
  },
  {
    label: '思源宋体',
    value: 'noto-serif-sc',
    meta: '书面质感',
    css: '"Noto Serif SC", "Source Han Serif SC", SimSun, "Songti SC", STSong, serif'
  },
  {
    label: '楷体',
    value: 'kai',
    meta: '题记引用',
    css: '"Kaiti SC", KaiTi, STKaiti, "楷体", serif'
  },
  {
    label: '仿宋',
    value: 'fangsong',
    meta: '正式古典',
    css: 'FangSong, STFangsong, "仿宋", SimSun, serif'
  },
  {
    label: '幼圆',
    value: 'youyuan',
    meta: '柔和圆润',
    css: 'YouYuan, "幼圆", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
  }
];

const FONT_OPTION_MAP = new Map(BODY_FONT_FAMILY_OPTIONS.map((option) => [option.value, option]));

export function isBodyFontFamilyValue(value) {
  return FONT_OPTION_MAP.has(value);
}

export function resolveBodyFontFamily(value) {
  const option = FONT_OPTION_MAP.get(value);
  return option?.css || '';
}
