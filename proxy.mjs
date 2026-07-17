// Replit proxy: forwards port 5000 (webview) → 8080 (Lovable dev server)
import net from 'net';

const TARGET_PORT = 8080;
const LISTEN_PORT = 5000;

const server = net.createServer((client) => {
  const target = net.createConnection(TARGET_PORT, '127.0.0.1');
  client.pipe(target);
  target.pipe(client);
  client.on('error', () => {});
  target.on('error', () => {});
  target.on('close', () => client.destroy());
  client.on('close', () => target.destroy());
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`Proxy: port ${LISTEN_PORT} → ${TARGET_PORT}`);
});
