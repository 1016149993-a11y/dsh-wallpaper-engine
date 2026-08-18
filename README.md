# dsh-wallpaper-engine

把 **Wallpaper Engine** 的壁纸作为 **DeepSeek Harness Web GUI** 的背景。
完全透明对话背景 + 字体变色 + 大图预览，两列网格切换。

> A zero-dependency Node server + a browser injection script that turns your
> local Wallpaper Engine videos into the background of the DeepSeek Harness
> web GUI, with a fully transparent shell, font-color control and a
> wallpaper preview overlay.

## Features

- 🎞 **Wallpaper Engine 视频壁纸**作为 GUI 全屏背景（静音、循环、自动播放），支持 HTTP Range 流式传输，无需复制文件
- 🧊 **完全透明**：应用外壳（侧栏 / 对话区 / 工作区）全部透明，壁纸完整透出
- 🎨 **字体变色**：8 个预设色 + 自定义取色 + 恢复默认 + 文字描边开关，选择持久保存
- 👁 **壁纸预览**：两列大图网格（16:9 缩略图，无标题）；点缩略图应用，点「预览」开大画面浮层一键应用
- 🔄 **一键刷新**：新增 Steam 订阅后，点面板里的「刷新」立即重扫壁纸文件夹（无需刷新页面、无需重启服务器，清单本身每 30 秒自动重建）
- ⏱ **播放速度**：1x / 0.75x / 0.5x 循环调节
- ⌨️ **快捷键**：`Alt + W` 随机切换，`Alt + P` 播放/暂停
- 🔒 **安全**：媒体服务器只绑定 `127.0.0.1`，不对外网开放

## Files

| File | Purpose |
| --- | --- |
| `server.js` | Zero-dependency Node media server (default port 8899): wallpaper list API + Range video stream + injection script |
| `inject.js` | Browser injection: fullscreen background layer, transparent shell, control panel (switch / speed / font color / preview) |
| `start.ps1` | One-click server launcher |

## Requirements

- Node.js ≥ 18
- Wallpaper Engine with Steam workshop content downloaded to the default location:
  `D:\Program Files (x86)\Steam\steamapps\workshop\content\431960`
- DeepSeek Harness web GUI running at `http://127.0.0.1:3080`

## Install

### 1. Start the media server (keep it running)

```powershell
.\start.ps1
# or: node server.js
```

### 2. Inject the script into the GUI

Add one line to the GUI's `dist/index.html` right before `</body>`:

```html
<script src="http://127.0.0.1:8899/inject.js"></script>
```

The dist location depends on your DSH install, e.g.:

```
C:\Users\<you>\AppData\Local\npm-cache\_npx\<hash>\node_modules\@deepseek-ai\dsh-web-frontend\dist\index.html
```

### 3. Refresh the page

Reload `http://127.0.0.1:3080` — the wallpaper appears immediately and a
「壁纸」button shows at the bottom right. `inject.js` is read from disk on
every request, so editing it takes effect on the next refresh (no restart).

> ⚠️ Reinstalling / upgrading DSH resets `dist/index.html` — re-add the
> script line afterwards.

## Configuration

Environment variables (can be set in `start.ps1`):

| Variable | Default | Description |
| --- | --- | --- |
| `WE_WALLPAPER_PORT` | `8899` | Media server port (change it in `inject.js` `API` and the injected script tag too) |
| `WE_WALLPAPER_ROOT` | `D:\Program Files (x86)\Steam\steamapps\workshop\content\431960` | Wallpaper Engine workshop directory |

Only `type=video` (and `webm`) wallpapers are listed; `scene` wallpapers
depend on the Wallpaper Engine renderer and cannot run in a browser.

## Uninstall

Remove the injected `<script>` line from `dist/index.html`, close the media
server, and the GUI is back to stock.

## License

MIT
