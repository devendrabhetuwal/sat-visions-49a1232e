// Replit smart proxy: port 5000 (webview)
//   /api/py/*  → Python FastAPI on port 5001
//   everything else → Vite/TanStack on port 8080
//   WebSocket upgrades (Vite HMR) → port 8080

import http from 'http';
import net  from 'net';

const LISTEN_PORT = 5000;
const VITE_PORT   = 8080;
const PYTHON_PORT = 5001;

const server = http.createServer((req, res) => {
  const isPython = req.url?.startsWith('/api/py/');
  const targetPort = isPython ? PYTHON_PORT : VITE_PORT;

  const options = {
    hostname : '127.0.0.1',
    port     : targetPort,
    path     : req.url,
    method   : req.method,
    headers  : { ...req.headers, host: `127.0.0.1:${targetPort}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    const msg = isPython
      ? 'Python parser is starting up — retry in a moment.'
      : 'App server not ready — retry in a moment.';
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(msg);
    }
    console.error(`Proxy error (→${targetPort}):`, err.message);
  });

  req.pipe(proxy, { end: true });
});

// WebSocket upgrade — always forward to Vite (HMR)
server.on('upgrade', (req, socket, head) => {
  const target = net.createConnection(VITE_PORT, '127.0.0.1', () => {
    const headers = [
      `${req.method} ${req.url} HTTP/1.1`,
      ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`),
      '', '',
    ].join('\r\n');
    target.write(headers);
    if (head?.length) target.write(head);
  });
  target.pipe(socket, { end: true });
  socket.pipe(target, { end: true });
  target.on('error', () => socket.destroy());
  socket.on('error', () => target.destroy());
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`Proxy :${LISTEN_PORT} → /api/py/* :${PYTHON_PORT}  |  rest → :${VITE_PORT}`);
});
