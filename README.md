# NDI 视频监看 Node SDK

[English](#english) | [中文](#中文)

---

<a name="english"></a>

# NDI Monitor Node SDK

A browser-based NDI video monitor built with [Bun](https://bun.sh). It uses [grandiose](https://github.com/Streampunk/grandiose) to interface with the NDI SDK and delivers video to the browser as an MJPEG stream over HTTP.

---

## Features

- Continuously scans the LAN for all NDI sources (including local sources) every 2 seconds
- Lists all discovered sources in a sidebar — click to start playback
- Video delivered as **MJPEG over HTTP** — works natively in any browser, no plugins required
- Displays resolution, frame rate, and source address

---

## Project Structure

```
src/
  index.ts          # HTTP server + background NDI discovery loop + MJPEG stream endpoint
Libs_2-007-017/
  include/          # Spout2 C++ headers (SpoutDX / SpoutGL / SpoutLibrary, etc.)
  MD/bin/           # Spout2 DLLs — dynamic CRT (Spout.dll, SpoutDX.dll …)
  MD/lib/           # Spout2 import libs (.lib) and CMake config
  MT/bin/           # Spout2 DLLs — static CRT
  MT/lib/           # Spout2 import libs — static CRT
```

---

## Dependencies

| Package | Description |
|---|---|
| [grandiose](https://github.com/Streampunk/grandiose) `^0.0.4` | Node.js native bindings for the NDI SDK (requires NDI Runtime) |
| [hono](https://hono.dev) `^4.12.12` | Lightweight web framework for routing and HTML responses |
| [jpeg-js](https://github.com/jpeg-js/jpeg-js) `^0.4.4` | Pure-JS JPEG encoder used to encode NDI frames |

---

## Requirements

- **Windows** (grandiose only supports Windows; it depends on the NDI SDK DLLs)
- [NDI Runtime](https://ndi.video/tools/ndi-runtime/) installed
- [Bun](https://bun.sh) >= 1.0
- Native module build tools: `node-gyp`, Python 3, MSVC Build Tools — needed to compile grandiose (usually handled automatically by `bun install`)

---

## Getting Started

```bash
# Install dependencies
bun install

# Start in development mode (hot reload)
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Scan** to discover NDI sources.

> The background discovery loop starts immediately on launch. If no sources appear on the first scan, wait 2–4 seconds and click **Scan** again.

---

## API

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Monitor page HTML |
| `/api/sources` | GET | Returns the list of currently discovered NDI sources (JSON array) |
| `/stream?name=&url=` | GET | MJPEG video stream; `name` and `url` come from `/api/sources` |

### `/api/sources` response example

```json
[
  { "name": "MY-PC (OBS)", "urlAddress": "192.168.1.10:5960" }
]
```

---

## Technical Notes

### NDI Source Discovery

`grandiose.find(opts, maxWait)` **throws an exception** from the C++ layer when no sources are found within `maxWait` ms, rather than returning an empty array. This project adopts the persistent-finder pattern from pyNDI: a background loop calls `find({ showLocalSources: true })` (no `maxWait`) every 2 seconds without blocking, and caches any sources found. `/api/sources` returns the cache directly.

### Video Rendering

The server receives NDI frames in `COLOR_FORMAT_RGBX_RGBA` (4 bytes per pixel), encodes each frame as JPEG with `jpeg-js`, and writes the frames into a single HTTP response as `multipart/x-mixed-replace` (MJPEG). The browser side is a single `<img>` tag pointing at `/stream` — the browser refreshes it frame by frame natively.

### Spout2 Reserved Libraries

`Libs_2-007-017/` contains prebuilt binaries and headers for Spout2 v2.007.017, reserved for future development of a Spout2 Node.js native addon. Available in MD (dynamic CRT) and MT (static CRT) variants, covering SpoutDX (DirectX 11), SpoutDX9, SpoutDX12, SpoutGL (OpenGL), and SpoutLibrary.

---

<a name="中文"></a>

# NDI 视频监看 Node SDK

基于 [Bun](https://bun.sh) 运行时的 NDI 视频监看 Web 服务，通过 [grandiose](https://github.com/Streampunk/grandiose) 调用 NDI SDK，以 MJPEG 流的方式在浏览器中实时预览局域网内的 NDI 视频源。

参考文章 https://juejin.cn/post/7498914140167012389#heading-8

---

## 功能

- 后台持续扫描局域网内所有 NDI 源（含本机源），每 2 秒轮询一次
- 网页列出所有已发现的 NDI 源，点击即可播放
- 视频以 **MJPEG over HTTP** 方式推送，浏览器原生支持，无需插件
- 显示分辨率、帧率、源地址等信息

---

## 目录结构

```
src/
  index.ts          # 主程序：HTTP 服务 + NDI 发现循环 + MJPEG 流端点
Libs_2-007-017/
  include/          # Spout2 C++ 头文件（SpoutDX / SpoutGL / SpoutLibrary 等）
  MD/bin/           # Spout2 动态链接库（MD 运行时：Spout.dll, SpoutDX.dll ...）
  MD/lib/           # Spout2 导入库（.lib）及 CMake 配置
  MT/bin/           # Spout2 静态运行时版本 DLL
  MT/lib/           # Spout2 静态运行时版本导入库
```

---

## 依赖

| 包 | 说明 |
|---|---|
| [grandiose](https://github.com/Streampunk/grandiose) `^0.0.4` | NDI SDK 的 Node.js 原生绑定（需要 NDI Runtime） |
| [hono](https://hono.dev) `^4.12.12` | 轻量级 Web 框架，提供路由和 HTML 响应 |
| [jpeg-js](https://github.com/jpeg-js/jpeg-js) `^0.4.4` | 纯 JS JPEG 编码，将 NDI 视频帧编码为 JPEG |

---

## 环境要求

- **Windows**（grandiose 仅支持 Windows，依赖 NDI SDK DLL）
- [NDI Runtime](https://ndi.video/tools/ndi-runtime/) 已安装（grandiose 在运行时加载 NDI DLL）
- [Bun](https://bun.sh) >= 1.0
- Node.js 原生模块编译工具（`node-gyp`、Python 3、MSVC Build Tools）——grandiose 需要预编译，通常 `bun install` 会自动完成

---

## 快速开始

```bash
# 安装依赖
bun install

# 开发模式启动（热重载）
bun run dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)，点击「扫描」即可发现 NDI 源。

> 服务启动后后台会立即开始 NDI 扫描，首次点击「扫描」若无结果，等待 2-4 秒后再点一次即可。

---

## API

| 端点 | 方法 | 说明 |
|---|---|---|
| `/` | GET | 监看页面 HTML |
| `/api/sources` | GET | 返回当前已发现的 NDI 源列表（JSON 数组） |
| `/stream?name=&url=` | GET | MJPEG 视频流，`name` 和 `url` 来自 `/api/sources` 的返回值 |

### `/api/sources` 响应示例

```json
[
  { "name": "MY-PC (OBS)", "urlAddress": "192.168.1.10:5960" }
]
```

---

## 技术说明

### NDI 源发现

grandiose 的 `find(opts, maxWait)` 在指定时间内无源时会从 C++ 层**抛出异常**而非返回空数组。本项目参考 pyNDI 的 persistent finder 设计，在后台启动一个每 2 秒调用一次 `find({ showLocalSources: true })`（不传 `maxWait`，不阻塞）的循环，将结果缓存后供 `/api/sources` 直接返回。

### 视频渲染

后端接收 NDI 帧（`COLOR_FORMAT_RGBX_RGBA`，每像素 4 字节），用 `jpeg-js` 编码为 JPEG，以 `multipart/x-mixed-replace` 格式持续写入 HTTP 响应流（MJPEG）。前端仅用一个 `<img>` 标签消费该流，浏览器原生逐帧刷新。

### Spout2 预留库

`Libs_2-007-017/` 目录包含 Spout2 v2.007.017 的预编译二进制和头文件，为后续扩展 Spout2 Node.js 原生模块预留。提供 MD（动态 CRT）和 MT（静态 CRT）两种版本，支持 SpoutDX（DirectX 11）、SpoutDX9、SpoutDX12、SpoutGL（OpenGL）和 SpoutLibrary 五个子模块。

