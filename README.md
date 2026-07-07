# 属于自己的芝子 - 公众号排版台

一个面向微信公众号写作的本地 Markdown 排版工具。它适合把文章写在 Obsidian 或其他 Markdown 编辑器里，再在网页中预览、微调样式，并复制到公众号编辑器。

## 在线试用

[点击打开公众号排版台](https://jelly-lzl.github.io/gongzhonghao-paiban-tool/)

## 功能

- Markdown 编辑与实时预览，支持桌面、平板、手机视图。
- 工具栏快捷插入标题、加粗、斜体、引用、链接、代码块、图片和表格。
- 右侧排版面板支持调整主题、代码块、正文/引用字体、字号、行距、段距、页边距、字间距、标题颜色和图片样式。
- 支持保存自己的排版预设，后续可在「我的主题」中复用、重命名和删除。
- 图片可粘贴、拖拽或上传，写入浏览器 IndexedDB 后在预览和公众号复制中复用。
- 支持复制到公众号、复制 Markdown、导入 Markdown、导出 Markdown、导出 PDF、导出 HTML。
- 导出 HTML 和 PDF 时会尽量把本地图片内嵌进文件，减少图片丢失。

## 本地运行

推荐通过本地静态服务打开，不建议直接双击 `index.html`，因为浏览器会限制 ES Modules 和剪贴板能力。

Windows PowerShell:

```powershell
.\start.ps1
```

macOS / Linux:

```bash
./start.sh
```

也可以手动启动：

```bash
python -m http.server 8765
```

然后访问：

```text
http://127.0.0.1:8765/
```

## GitHub Pages

这个项目是纯前端静态页面，没有构建步骤。上传 GitHub 后，可以在仓库的 `Settings -> Pages` 中选择：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

启用后，别人就可以直接通过 GitHub Pages 链接在线试用。

## 图片写法

普通 Markdown 图片：

```markdown
![图片说明](./assets/images/avatar.jpg)
```

带局部样式参数：

```markdown
![头像示例](./assets/images/avatar.jpg){width=80% height=auto fit=contain radius=16 caption=头像示例}
```

常用参数：

- `width`: 图片宽度，例如 `80%`、`320px`。
- `height`: 图片高度，推荐保持 `auto`。
- `fit`: 裁剪/缩放方式，常用 `contain` 或 `cover`。
- `radius`: 圆角大小，例如 `16` 或 `16px`。
- `caption`: 图片下方小字说明。

## 项目结构

```text
.
├── index.html
├── README.md
├── LICENSE
├── start.ps1
├── start.sh
└── assets/
    ├── images/
    │   └── avatar.jpg
    ├── scripts/
    │   ├── main.js
    │   ├── core/
    │   ├── export/
    │   ├── storage/
    │   └── ui/
    ├── styles/
    │   ├── base.css
    │   ├── editor.css
    │   ├── panel.css
    │   └── themes/
    └── vendor/
```

## 说明

浏览器本地存储使用 `zhizi-wechat-md:` 前缀。清理浏览器数据会删除本地草稿、图片缓存和自定义排版预设，正式文章建议同时导出 Markdown 备份。

本项目保留原始 MIT License。后续如果继续公开发布，建议保留 `LICENSE` 文件。
