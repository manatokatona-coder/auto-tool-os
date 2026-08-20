/**
 * 手元で web/ を確認するための最小サーバ。
 * ESモジュールを正しいMIMEタイプで返すためだけのもの。
 * 同じLAN上のiPhoneからも開けるよう、0.0.0.0で待ち受ける。
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/web/index.html';

  // ルート外へ出るパスは弾く
  const target = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  console.log(`http://localhost:${PORT}/`);
  for (const ip of ips) console.log(`同じWi-FiのiPhoneから: http://${ip}:${PORT}/`);
});
