## Sim4SideMarkdown (React + Electron text editor)

A desktop text/Markdown editor with **multi tabs**, **live Markdown preview (split view)**, **cross-platform menus & shortcuts**, and **common text encodings** (UTF-8 / UTF-16LE / GBK / GB18030 / ANSI Win-1252). Built and packaged with **electron-builder** for Windows and macOS.

### Tech stack

- **Renderer**: React 18 + TypeScript + Vite
- **Main/Preload**: Electron + tsup (compiled into `dist-electron/`)
- **Markdown**: `marked` + `highlight.js` + `dompurify` (safe HTML sanitization)
- **Encoding**: `chardet` (detection) + `iconv-lite` (decode/encode)
- **Packaging**: electron-builder (Win: nsis + portable; macOS: dmg + zip)

### Project structure

- `electron/main.ts`: main process (window, menus, IPC, file I/O)
- `electron/preload.ts`: preload script (`contextBridge` exposes a safe API)
- `src/`: React renderer (multi-tab editor, Markdown preview, status bar, etc.)

### Development

1) Install dependencies

```bash
npm i
```

2) Start dev mode (Vite + tsup watch + Electron)

```bash
npm run dev
```

### Build & release (electron-builder)

Build renderer + main/preload first:

```bash
npm run build
```

#### macOS (macOS 12+)

```bash
npm run dist:mac
```

Artifacts will be in `release/` (`dmg` + `zip`).

#### Windows (Win10/11)

```bash
npm run dist:win
```

Artifacts will be in `release/` (NSIS installer + portable exe).

### Notes (cross-platform packaging)

- **Build on the target OS**: build macOS apps on macOS, Windows apps on Windows (toolchains/signing/system components differ).
- This project ships **without code signing** by default (`dmg.sign=false`). For production releases, add certificates and signing.

### Features

- **File**: New / Open (multi-select) / Save / Save As / Close Tab / Quit
- **Edit**: Undo/Redo, Cut/Copy/Paste, Select All, Find/Replace, Go to Line, Insert Date/Time
- **Format/View**: Word wrap, Font settings, Status bar toggle, Markdown edit/preview/split toggle
- **Encoding**: UTF-8 / UTF-16LE / GBK / GB18030 / ANSI (Win-1252)


