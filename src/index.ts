import { Hono } from 'hono'
import * as jpeg from 'jpeg-js'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// grandiose is a CommonJS native module
const grandiose = _require('grandiose') as {
  find: (opts?: object, maxWait?: number) => Promise<NdiSource[]>
  receive: (opts: ReceiveOptions) => Promise<NdiReceiver>
  COLOR_FORMAT_RGBX_RGBA: number
  BANDWIDTH_HIGHEST: number
  BANDWIDTH_LOWEST: number
}

// ---------- 后台持久化 NDI 发现循环（模拟 pyNDI 的 persistent finder）----------
// grandiose 每次 find(opts, maxWait) 超时无源会抛异常；
// 不传 maxWait 则立即返回当前已知源（可能为空），不抛异常。
// 通过循环轮询，NDI mDNS 广播会在若干轮后累积到 cachedSources。
let cachedSources: NdiSource[] = []
let lastScanTime = 0

async function discoveryLoop() {
  while (true) {
    try {
      // 不传 maxWait —— 立即返回当前已知源，不会因超时抛异常
      const sources = await grandiose.find({ showLocalSources: true }) as NdiSource[]
      if (sources.length > 0) {
        cachedSources = sources
        console.log(`[NDI] 发现 ${sources.length} 个源:`, sources.map(s => s.name).join(', '))
      }
    } catch (e) {
      console.error('[NDI] 发现循环出错:', e)
    }
    lastScanTime = Date.now()
    // 每 2 秒轮询一次，让 NDI mDNS 有足够时间传播
    await new Promise<void>((r) => setTimeout(r, 2000))
  }
}

// 启动后台发现
discoveryLoop()
// --------------------------------------------------------------------------

interface NdiSource {
  name: string
  urlAddress: string
}

interface NdiVideoFrame {
  xres: number
  yres: number
  frameRateN: number
  frameRateD: number
  lineStrideBytes: number
  data: Uint8Array
}

interface NdiReceiver {
  video: (timeout?: number) => Promise<NdiVideoFrame>
}

interface ReceiveOptions {
  source: NdiSource
  colorFormat?: number
  bandwidth?: number
  allowVideoFields?: boolean
}

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NDI 视频监看</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0f0f17;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    header {
      background: #16162a;
      border-bottom: 1px solid #2a2a4a;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    header h1 { font-size: 16px; font-weight: 600; color: #fff; letter-spacing: 0.5px; }
    .badge {
      background: #4361ee;
      color: #fff;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
    }

    .workspace {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ---- Sidebar ---- */
    .sidebar {
      width: 280px;
      flex-shrink: 0;
      background: #16162a;
      border-right: 1px solid #2a2a4a;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sidebar-top {
      padding: 14px 16px 10px;
      border-bottom: 1px solid #2a2a4a;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sidebar-top h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #888; }
    #btn-refresh {
      background: #2a2a4a;
      border: 1px solid #3a3a6a;
      color: #b0b0d0;
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: background .15s;
    }
    #btn-refresh:hover { background: #3a3a6a; }
    #btn-refresh:disabled { opacity: .5; cursor: default; }

    #source-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    #source-list::-webkit-scrollbar { width: 4px; }
    #source-list::-webkit-scrollbar-track { background: transparent; }
    #source-list::-webkit-scrollbar-thumb { background: #3a3a6a; border-radius: 2px; }

    .source-card {
      background: #1e1e36;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 6px;
      cursor: pointer;
      transition: border-color .15s, background .15s;
    }
    .source-card:hover { border-color: #4361ee; background: #22223a; }
    .source-card.active { border-color: #4361ee; background: #1a2050; }
    .source-name { font-size: 13px; font-weight: 500; color: #e0e0ff; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .source-url { font-size: 11px; color: #6060a0; font-family: monospace; }

    .no-sources { text-align: center; color: #555; font-size: 13px; padding: 30px 16px; line-height: 1.8; }

    /* ---- Main area ---- */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow: hidden;
      position: relative;
    }

    #placeholder {
      text-align: center;
      color: #444;
    }
    #placeholder svg { opacity: .3; margin-bottom: 16px; }
    #placeholder p { font-size: 15px; color: #505070; }

    #video-wrap {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      width: 100%;
      height: 100%;
    }

    #video-container {
      position: relative;
      flex: 1;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 8px;
      background: #000;
      border: 1px solid #2a2a4a;
    }

    #ndi-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }

    .video-overlay {
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(0,0,0,.6);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      color: #aaa;
      backdrop-filter: blur(4px);
    }
    .live-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4ade80;
      margin-right: 5px;
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .3; }
    }

    .video-info {
      flex-shrink: 0;
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: #666;
    }
    .video-info span { color: #aaa; }

    /* ---- Status bar ---- */
    #statusbar {
      flex-shrink: 0;
      background: #16162a;
      border-top: 1px solid #2a2a4a;
      padding: 5px 16px;
      font-size: 12px;
      color: #666;
    }
    #statusbar.ok { color: #4ade80; }
    #statusbar.err { color: #f87171; }
  </style>
</head>
<body>
  <header>
    <h1>NDI 视频监看</h1>
    <span class="badge">grandiose</span>
  </header>

  <div class="workspace">
    <aside class="sidebar">
      <div class="sidebar-top">
        <h2>NDI 源</h2>
        <button id="btn-refresh">扫描</button>
      </div>
      <div id="source-list">
        <div class="no-sources">点击「扫描」搜索<br>局域网内的 NDI 源</div>
      </div>
    </aside>

    <main class="main">
      <div id="placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4361ee" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4"/>
        </svg>
        <p>从左侧选择 NDI 源开始播放</p>
      </div>

      <div id="video-wrap">
        <div id="video-container">
          <img id="ndi-img" alt="NDI Stream">
          <div class="video-overlay">
            <span class="live-dot"></span>
            <span id="overlay-name">-</span>
          </div>
        </div>
        <div class="video-info">
          <div>分辨率：<span id="info-res">-</span></div>
          <div>帧率：<span id="info-fps">-</span></div>
          <div>地址：<span id="info-url">-</span></div>
        </div>
      </div>
    </main>
  </div>

  <div id="statusbar">就绪</div>

  <script>
    const btnRefresh = document.getElementById('btn-refresh')
    const sourceList = document.getElementById('source-list')
    const placeholder = document.getElementById('placeholder')
    const videoWrap = document.getElementById('video-wrap')
    const ndiImg = document.getElementById('ndi-img')
    const statusbar = document.getElementById('statusbar')
    const overlayName = document.getElementById('overlay-name')
    const infoRes = document.getElementById('info-res')
    const infoFps = document.getElementById('info-fps')
    const infoUrl = document.getElementById('info-url')

    let activeCard = null
    let activeSource = null

    function setStatus(msg, type = '') {
      statusbar.textContent = msg
      statusbar.className = type
    }

    async function refreshSources() {
      btnRefresh.disabled = true
      btnRefresh.textContent = '扫描中…'
      setStatus('正在获取 NDI 源列表…')
      sourceList.innerHTML = ''

      try {
        const res = await fetch('/api/sources')
        const data = await res.json()

        if (!res.ok) {
          const msg = data.error || '未知错误'
          sourceList.innerHTML = \`<div class="no-sources">扫描出错<br><small style="color:#f87171">\${msg}</small></div>\`
          setStatus('扫描出错：' + msg, 'err')
          return
        }

        const sources = data
        if (sources.length === 0) {
          sourceList.innerHTML = '<div class="no-sources">未发现 NDI 源<br>服务器正在持续扫描，<br>请稍候几秒后再次点击「扫描」<br><br>若长时间无结果请检查：<br>① 源与本机在同一网络<br>② 防火墙未屏蔽 NDI 端口</div>'
          setStatus('未发现 NDI 源，请稍候重试')
        } else {
          sources.forEach(src => {
            const card = document.createElement('div')
            card.className = 'source-card'
            card.innerHTML = \`
              <div class="source-name" title="\${src.name}">\${src.name}</div>
              <div class="source-url">\${src.urlAddress}</div>
            \`
            card.addEventListener('click', () => playSource(src, card))
            sourceList.appendChild(card)
          })
          setStatus(\`发现 \${sources.length} 个 NDI 源\`, 'ok')
        }
      } catch (e) {
        sourceList.innerHTML = '<div class="no-sources">扫描失败<br>' + e.message + '</div>'
        setStatus('扫描失败：' + e.message, 'err')
      } finally {
        btnRefresh.disabled = false
        btnRefresh.textContent = '扫描'
      }
    }

    function playSource(src, card) {
      if (activeCard) activeCard.classList.remove('active')
      activeCard = card
      card.classList.add('active')
      activeSource = src

      // 更新 UI
      overlayName.textContent = src.name
      infoUrl.textContent = src.urlAddress
      infoRes.textContent = '-'
      infoFps.textContent = '-'

      // 切换到视频显示
      placeholder.style.display = 'none'
      videoWrap.style.display = 'flex'

      // 设置 MJPEG 流（修改 src 会自动取消旧请求）
      const streamUrl = '/stream?name=' + encodeURIComponent(src.name) + '&url=' + encodeURIComponent(src.urlAddress)
      ndiImg.src = streamUrl
      setStatus('正在连接 ' + src.name + '…')

      ndiImg.onload = () => setStatus('正在播放：' + src.name, 'ok')
      ndiImg.onerror = () => setStatus('连接失败，请重试', 'err')
    }

    btnRefresh.addEventListener('click', refreshSources)
  </script>
</body>
</html>`

const app = new Hono()

app.get('/', (c) => c.html(HTML))

// 获取 NDI 源列表（返回后台发现循环的缓存结果）
app.get('/api/sources', async (c) => {
  // 等后台至少完成一轮扫描后再返回（服务刚启动时 cachedSources 可能为空）
  if (lastScanTime === 0) {
    await new Promise<void>((r) => setTimeout(r, 3000))
  }
  console.log(`[NDI] /api/sources 返回 ${cachedSources.length} 个源`)
  return c.json(cachedSources)
})

// MJPEG 视频流端点
app.get('/stream', async (c) => {
  const name = c.req.query('name') ?? ''
  const url = c.req.query('url') ?? ''

  if (!name || !url) {
    return c.text('缺少 name 或 url 参数', 400)
  }

  const source: NdiSource = { name, urlAddress: url }
  let running = true
  const enc = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      let receiver: NdiReceiver | null = null
      try {
        receiver = await grandiose.receive({
          source,
          colorFormat: grandiose.COLOR_FORMAT_RGBX_RGBA,
          bandwidth: grandiose.BANDWIDTH_HIGHEST,
          allowVideoFields: false,
        })
      } catch (err) {
        console.error('[NDI] 连接失败:', err)
        controller.close()
        return
      }

      while (running) {
        try {
          const frame = await receiver.video(5000)
          // COLOR_FORMAT_RGBX_RGBA 格式: 每像素 4 字节 (R,G,B,X)
          // jpeg-js 将第 4 字节视为 Alpha，但 JPEG 不使用透明度，可直接传入
          const encoded = jpeg.encode(
            { data: new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength), width: frame.xres, height: frame.yres },
            72
          )
          const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${encoded.data.length}\r\n\r\n`
          controller.enqueue(enc.encode(header))
          controller.enqueue(encoded.data)
          controller.enqueue(enc.encode('\r\n'))
        } catch (_err) {
          if (running) {
            // 短暂等待后重试（例如帧超时）
            await new Promise<void>((r) => setTimeout(r, 50))
          }
        }
      }

      try { controller.close() } catch { /* already closed */ }
    },
    cancel() {
      running = false
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

export default app

