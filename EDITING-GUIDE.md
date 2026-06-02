# 自己维护网站内容指南

> 这个网站 = 一堆 **纯文本文件**（Markdown + YAML）。改文件 → 保存 → 预览自动刷新。**不需要写代码**。
> 这个文件只是给你看的说明，不会出现在网站上。

---

## 1. 启动本地预览

任选一种，改完保存后浏览器 <http://localhost:1313> 会自动刷新：

- **RStudio**：打开 `academic-cv.Rproj` → 控制台运行 `blogdown::serve_site()`（停止：`blogdown::stop_server()`）
- **终端**（RStudio 的 Terminal 或 PowerShell）：
  ```powershell
  . F:\dev\env.ps1      # 加载工具链（装在 F 盘）
  cd H:\academic-cv-main
  pnpm dev
  ```

---

## 2. 哪个文件管哪一块

| 想改的东西 | 改这个文件 |
|---|---|
| 姓名 / 头衔 / 简介 / 链接 / 教育 / 兴趣 | `data/authors/me.yaml` |
| 头像 | `assets/media/authors/me.jpg`（换成同名文件即可） |
| 站点名 / 标语 / 主题色 / SEO 描述 | `config/_default/params.yaml` |
| 顶部导航菜单 | `config/_default/menus.yaml` |
| 网址 baseURL | `config/_default/hugo.yaml` |
| 首页板块与文案 | `content/_index.md` |
| **每一篇论文** | `content/publications/<英文短名>/index.md` |
| **每一个学术报告** | `content/events/<英文短名>/index.md` |

---

## 3. 补充 / 新增一篇论文 ⭐（你问的重点）

每篇论文是一个**文件夹**，里面一个 `index.md`。最省事的做法：**复制一个已有的论文文件夹 → 改个名 → 改内容**。

下面是一个**带注释的完整模板**，所有字段都列出来了，用不到的整行删掉即可：

```yaml
---
# ── 必填 ───────────────────────────────────────────────
title: "论文标题（按原文，中文或英文都行）"
authors:
  - me                 # 写 me = 自动替换成你的名字并加粗高亮
  - Qijun Ruan         # 其他作者写 “名 姓”（拼音）
  - Hao Li
date: "2025-04-08"     # 发表日期 YYYY-MM-DD（列表按此日期倒序排）
publication_types: ["article-journal"]   # 类型见第 5 节速查表

# ── 期刊 / 会议信息（可选）──────────────────────────────
publication:
  name: "期刊或会议名称"
  volume: 122          # 卷
  issue: 14            # 期
  pages: "1642–1666"   # 页码
  publisher: ""        # 出版社（书的章节才用）

# ── 是否精选（首页 Featured Publications 板块）─────────────
featured: false        # 改成 true 就会出现在首页精选

# ── 标识符：填了会自动生成对应链接按钮 ──────────────────────
hugoblox:
  ids:
    doi: "10.1073/pnas.2418029122"   # 有 DOI 强烈建议填
    arxiv: ""                         # arXiv 号，如 2401.01234

# ── 手动加链接按钮（可选）────────────────────────────────
links:
  - type: pdf          # 可选 type: pdf / code / dataset / preprint / video / source
    url: "https://……/paper.pdf"
  - type: code
    url: "https://github.com/……"

# ── 其余可选字段 ──────────────────────────────────────────
author_notes:          # 和 authors 顺序一一对应，显示成上标注释
  - ''
  - 'Corresponding author'
tags:
  - Lithic Technology
abstract: "把摘要全文放这里，会显示在论文详情页。"
summary: "一句话简介，显示在论文列表里。"
peer_reviewed: true
open_access: true
---

这条横线下面可以用 Markdown 自由写正文、补充说明、贴图或表格，
会显示在该论文的详情页（点开论文标题进去看）。
```

### 给某篇论文“补细节”的常见操作

- **加 PDF 全文**：把 PDF 命名为 **和文件夹同名**，放进该论文文件夹。
  例：`content/publications/quina-east-asia-pnas/quina-east-asia-pnas.pdf` → 自动出现下载按钮。
- **加 BibTeX 引用**：把一个 `cite.bib` 放进该文件夹 → 自动出现“Cite”按钮并生成引用。
- **加封面缩略图**：把图片命名为 `featured.jpg` 放进文件夹 → 显示在 Featured 网格里。
- **加 DOI / arXiv / 链接**：填上面的 `hugoblox.ids` 或 `links`。
- **设为精选**：把 `featured:` 改成 `true`。
- **调整排序**：改 `date:`（越新越靠前）。

---

## 4. 新增一个学术报告（Talk）

新建 `content/events/<英文短名>/index.md`，模板：

```yaml
---
title: "报告题目"
date: '2026-05-06'
event_name: "会议全称"
event_url: "https://……"
location: "City, Country"
address:
  city: San Francisco
  region: CA
  country: United States
summary: "一句话说明。"
event_start: '2026-05-06T09:00:00Z'
event_end: '2026-05-10T17:00:00Z'
event_all_day: false
authors:
  - me
tags:
  - Lithic Technology
featured: false
---
```

---

## 5. `publication_types` 类型速查（CSL 标准）

| 写法 | 含义 |
|---|---|
| `article-journal` | 期刊论文 |
| `paper-conference` | 会议论文 |
| `chapter` | 书的章节 |
| `book` | 专著 |
| `thesis` | 学位论文 |
| `report` | 报告 |
| `manuscript` | 预印本 / 工作论文 |

---

## 6. 发布上线

本地改完、确认没问题后：把改动用 git 提交并推送到 GitHub，GitHub Actions 会自动重新构建并发布。
（第一次部署的仓库 + Actions 配置，让 Claude 帮你弄一次即可，以后就只剩 “改文件 → push” 两步。）

---

## 7. 小抄

```text
改个人信息   → data/authors/me.yaml
换头像       → 覆盖 assets/media/authors/me.jpg
加论文       → 复制 content/publications/ 里任一文件夹，改名改内容
加报告       → 复制 content/events/ 里任一文件夹，改名改内容
看效果       → 本地预览 http://localhost:1313（保存即刷新）
上线         → git commit & push（Actions 自动发布）
```
