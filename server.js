// we-wallpaper-dsh media server (zero dependencies)
// Serves the DSH Web GUI background wallpapers from the local Wallpaper
// Engine workshop directory:
//   GET /api/wallpapers            -> JSON list of video wallpapers
//   GET /media/<id>/<file>         -> video stream (HTTP Range supported)
//   GET /inject.js                 -> the browser-side injection script
// Usage: node server.js [port]   (default port 8899)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.argv[2] || process.env.WE_WALLPAPER_PORT || 8899);
const WORKSHOP_ROOT = process.env.WE_WALLPAPER_ROOT ||
  'D:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960';

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
};

// ---- wallpaper catalog (built lazily, cached for 30s) ----------------------
let catalogCache = { at: 0, list: null };

function readProjectJson(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  } catch {
    return null;
  }
}

function buildCatalog() {
  const list = [];
  if (!fs.existsSync(WORKSHOP_ROOT)) return list;
  for (const entry of fs.readdirSync(WORKSHOP_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(WORKSHOP_ROOT, entry.name);
    const pj = readProjectJson(dir);
    if (!pj) continue;
    const type = String(pj.type || '').toLowerCase();
    if (!type.includes('video') && !type.includes('webm')) continue;
    const files = fs.readdirSync(dir).filter((f) => VIDEO_EXTS.has(path.extname(f).toLowerCase()));
    for (const file of files) {
      const abs = path.join(dir, file);
      const stat = fs.statSync(abs);
      list.push({
        id: entry.name,
        title: pj.title || entry.name,
        file,
        sizeMB: Math.round((stat.size / 1024 / 1024) * 10) / 10,
        durationSec: readMp4Duration(abs),
        preview: fs.existsSync(path.join(dir, 'preview.jpg')) ? 'preview.jpg' : null,
      });
    }
  }
  list.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  return list;
}

/**
 * Read the real duration (seconds) of an MP4/MOV file by parsing the mvhd
 * box. Returns null when the file is not a recognized MP4 family or the
 * box cannot be read (falls back to no duration info).
 */
function readMp4Duration(file) {
  const ext = path.extname(file).toLowerCase();
  if (!['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) return null;
  const stat = fs.statSync(file);
  if (stat.size < 64) return null;
  const fd = fs.openSync(file, 'r');
  try {
    // moov may sit at the start (faststart) or at the end of the file.
    // Scan both the head and the tail window; pick the first hit.
    const win = Math.min(stat.size, 4 * 1024 * 1024);
    const head = Buffer.alloc(win);
    fs.readSync(fd, head, 0, win, 0);
    const hit = findMoovInBuffer(head);
    if (hit >= 0) return parseMoovAt(head, hit);
    if (stat.size > win) {
      const tail = Buffer.alloc(win);
      fs.readSync(fd, tail, 0, win, stat.size - win);
      const hitTail = findMoovInBuffer(tail);
      if (hitTail >= 0) return parseMoovAt(tail, hitTail);
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
}

/** Locate the "moov" box start (offset of the box header) in a buffer. */
function findMoovInBuffer(buf) {
  const marker = Buffer.from('moov');
  let idx = buf.indexOf(marker);
  while (idx >= 0) {
    // box header: size(4) type(4); size may be 1 -> 64-bit large size
    const boxStart = idx - 4;
    if (boxStart >= 0 && boxStart + 16 <= buf.length) {
      const boxSize = buf.readUInt32BE(boxStart);
      if (boxSize === 1) {
        // large size: header is 16 bytes
        const largeStart = boxStart;
        const largeSize = Number(buf.readBigUInt64BE(boxStart + 8));
        if (largeSize >= 16) return largeStart;
      } else if (boxSize >= 8) {
        return boxStart;
      }
    }
    idx = buf.indexOf(marker, idx + 1);
  }
  return -1;
}

/** Parse mvhd out of a buffer that starts with a moov box header. */
function parseMoovAt(buf, moovStart) {
  let boxSize = buf.readUInt32BE(moovStart);
  let headerLen = 8;
  if (boxSize === 1) {
    boxSize = Number(buf.readBigUInt64BE(moovStart + 8));
    headerLen = 16;
  } else if (boxSize === 0) {
    boxSize = buf.length - moovStart;
  }
  const end = Math.min(moovStart + boxSize, buf.length);
  let offset = moovStart + headerLen;
  while (offset + 8 <= end) {
    const bs = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (bs < 8) break;
    if (type === 'mvhd') {
      return parseMvhd(buf, offset + 8, Math.min(offset + bs, end));
    }
    offset += bs;
  }
  return null;
}

function parseMvhd(buf, start, end) {
  if (start + 4 > end) return null;
  const version = buf.readUInt8(start);
  if (version === 1) {
    // version/flags(4) creation(8) modification(8) timescale(4) duration(8)
    if (start + 32 > end) return null;
    const timescale = buf.readUInt32BE(start + 20);
    const duration = Number(buf.readBigUInt64BE(start + 24));
    if (!timescale) return null;
    return Math.round((duration / timescale) * 10) / 10;
  }
  // version 0: version/flags(4) creation(4) modification(4) timescale(4) duration(4)
  if (start + 20 > end) return null;
  const timescale = buf.readUInt32BE(start + 12);
  const duration = buf.readUInt32BE(start + 16);
  if (!timescale) return null;
  return Math.round((duration / timescale) * 10) / 10;
}

function getCatalog() {
  const now = Date.now();
  if (!catalogCache.list || now - catalogCache.at > 30000) {
    catalogCache = { at: now, list: buildCatalog() };
  }
  return catalogCache.list;
}

// ---- routing ---------------------------------------------------------------
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function json(res, value) {
  send(res, 200, JSON.stringify(value), { 'content-type': 'application/json; charset=utf-8' });
}

function serveFileRange(req, res, absPath) {
  const stat = fs.statSync(absPath);
  const total = stat.size;
  const range = req.headers.range;
  let start = 0;
  let end = total - 1;
  let status = 200;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'content-type': MIME[path.extname(absPath).toLowerCase()] || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'content-length': String(total),
  };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      start = m[1] ? parseInt(m[1], 10) : 0;
      end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
      if (start > end || start >= total) {
        send(res, 416, '', { 'content-range': `bytes */${total}` });
        return;
      }
      status = 206;
      headers['content-range'] = `bytes ${start}-${end}/${total}`;
      headers['content-length'] = String(end - start + 1);
    }
  }
  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = fs.createReadStream(absPath, { start, end });
  stream.pipe(res);
  stream.on('error', () => {
    res.destroy();
  });
}

function mediaPath(id, file) {
  // Reject traversal and non-existent ids.
  if (!/^[\w.-]+$/.test(id) || /\.\./.test(file) || file.includes('/') || file.includes('\\')) return null;
  const dir = path.join(WORKSHOP_ROOT, id);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const abs = path.join(dir, file);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const p = url.pathname;
  const method = req.method;

  try {
    if (p === '/api/wallpapers' && (method === 'GET' || method === 'HEAD')) {
      return json(res, { ok: true, count: getCatalog().length, wallpapers: getCatalog() });
    }

    if (p === '/inject.js' && (method === 'GET' || method === 'HEAD')) {
      const body = fs.readFileSync(path.join(__dirname, 'inject.js'));
      return send(res, 200, body, { 'content-type': 'text/javascript; charset=utf-8' });
    }

    // Standalone test page: verifies a wallpaper video renders in the browser.
    if (p === '/test.html' && (method === 'GET' || method === 'HEAD')) {
      const cat = getCatalog().sort((a, b) => a.sizeMB - b.sizeMB)[0];
      const src = `/media/${encodeURIComponent(cat.id)}/${encodeURIComponent(cat.file)}`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>WE test</title>
<style>html,body{margin:0;background:#000}video{position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover}</style></head>
<body><video id="v" autoplay muted loop playsinline src="${src}"></video>
<script>setInterval(()=>{document.title='rs='+v.readyState+' t='+v.currentTime.toFixed(1)+' paused='+v.paused+' err='+(v.error?v.error.code:0)},1000)</script>
</body></html>`;
      return send(res, 200, html, { 'content-type': 'text/html; charset=utf-8' });
    }

    if (p.startsWith('/media/') && (method === 'GET' || method === 'HEAD')) {
      const rest = decodeURIComponent(p.slice('/media/'.length));
      const slash = rest.indexOf('/');
      if (slash === -1) return send(res, 400, 'bad request');
      const id = rest.slice(0, slash);
      const file = rest.slice(slash + 1);
      const abs = mediaPath(id, file);
      if (!abs) return send(res, 404, 'not found');
      return serveFileRange(req, res, abs);
    }

    return send(res, 404, 'not found');
  } catch (err) {
    return send(res, 500, String(err && err.message || err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[we-wallpaper] media server on http://127.0.0.1:${PORT}`);
  console.log(`[we-wallpaper] wallpapers found: ${getCatalog().length}`);
});
