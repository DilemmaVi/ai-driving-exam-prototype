# 全安智能驾考系统（高保真原型）

## 目标
- 承载“智能驾考培训系统”的高保真原型，并可通过 GitHub Pages 在线访问。
- 作为后续用 Codex/ACP 进行迭代开发的项目基座。

## 当前内容
- `index.html`：单页高保真原型（TailwindCSS + FontAwesome + Chart.js）。

## 运行方式（本地）
- 直接双击打开 `index.html` 即可预览。
- 或使用本地静态服务器（推荐，避免某些浏览器限制）：
  - `python3 -m http.server 5173`
  - 打开：`http://localhost:5173/`

## 发布（GitHub Pages）
- 计划：部署 `main` 分支根目录的静态站点。

## 约定
- 后续开发在此目录进行（不要在 workspace 根目录散落文件）。
- 如需要拆分为多页面/工程化（Vite/Next.js），在此项目内演进。
