// 占位 - 在实际构建中，Tauri 会通过 `tauri icon` 命令生成真实图标
// 这里放置简单的占位 PNG（用户需要替换为自己的图标）

如需生成图标，请运行：
```
cd rustdesk-workspace-backend
cargo tauri icon path/to/source-icon.png
```

或者在 `src-tauri/icons/` 中放置以下文件：
- 32x32.png
- 128x128.png
- 128x128@2x.png
- icon.icns (macOS)
- icon.ico (Windows)