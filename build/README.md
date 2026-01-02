把应用图标源文件放到这里：

- `build/icon.png`：源 PNG（建议 1024×1024 或至少 512×512）
- `build/icon.icns`：由脚本生成的 macOS 图标文件（供 electron-builder 使用）

生成 icns：

```bash
npm run icon:mac
```

