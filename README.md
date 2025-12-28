## Sim4SideMarkdown（React + Electron 文本编辑器）

一个桌面端文本/Markdown 编辑器：**多 Tab**、**Markdown 实时预览（分栏）**、**跨平台菜单与快捷键**、**常见编码读写（UTF-8 / UTF-16LE / GBK / GB18030 / ANSI Win-1252）**，并使用 **electron-builder** 打包 Windows 与 macOS。

### 技术栈

- **Renderer**: React 18 + TypeScript + Vite
- **Main/Preload**: Electron + tsup（编译到 `dist-electron/`）
- **Markdown**: `marked` + `highlight.js` + `dompurify`（安全渲染）
- **编码**: `chardet`（检测） + `iconv-lite`（解码/编码）
- **打包**: electron-builder（Win: nsis + portable；macOS: dmg + zip）

### 目录结构

- `electron/main.ts`: 主进程（窗口、菜单、IPC、文件读写）
- `electron/preload.ts`: 预加载脚本（`contextBridge` 暴露安全 API）
- `src/`: React 渲染进程（多 Tab 编辑器、Markdown 预览、状态栏等）

### 开发运行

1) 安装依赖

```bash
npm i
```

2) 启动开发模式（Vite + tsup watch + Electron）

```bash
npm run dev
```

### 打包发布（electron-builder）

先统一构建 renderer + main/preload：

```bash
npm run build
```

#### macOS（macOS 12+）

```bash
npm run dist:mac
```

产物在 `release/` 下（`dmg` + `zip`）。

#### Windows（Win10/11）

```bash
npm run dist:win
```

产物在 `release/` 下（`nsis` 安装包 + `portable` 免安装版）。

### 重要说明（跨平台打包）

- **建议在目标系统上打包对应平台**：macOS 打 macOS；Windows 打 Windows（签名/工具链/系统组件差异会影响打包体验）。
- 本项目默认未做签名（`dmg.sign=false`），正式发布请补齐证书与签名流程。

### 功能速览

- **文件**：新建 / 打开（多选） / 保存 / 另存为 / 关闭 Tab / 退出
- **编辑**：撤销/重做、剪切/复制/粘贴、全选、查找/替换、转到行、插入时间/日期
- **格式/视图**：自动换行、字体设置、状态栏显示/隐藏、Markdown 编辑/预览/分栏切换
- **编码**：UTF-8 / UTF-16LE / GBK / GB18030 / ANSI（Win-1252）


