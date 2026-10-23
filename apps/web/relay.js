// Single-port entry: :3000 serves everything the browser needs.
// - HTTP (pages, /api, HMR) → untouched Next.js on 127.0.0.1:3001
// - WS  /ws               → Go gateway on 127.0.0.1:8080 (live ticks)
// The browser only ever talks to :3000, so one tunnel covers the whole app
// and NEXT_PUBLIC_WS_URL must stay UNSET (same-origin /ws fallback).
// No new dependencies: node:http + node:net only.
const { createServer, request: httpRequest } = require("http");
const net = require("net");
const { spawn } = require("child_process");

const PUBLIC_PORT = parseInt(process.env.PORT || "3000", 10);
const NEXT_PORT = parseInt(process.env.NEXT_PORT || "3001", 10);
const GW_HOST = process.env.WS_GATEWAY_HOST || "127.0.0.1";
const GW_PORT = parseInt(process.env.WS_GATEWAY_PORT || "8080", 10);
const isProd = process.env.NODE_ENV === "production";

function wsPath(url) {
  const path = (url || "/").split("?")[0];
  return path === "/ws" || path === "/ws/";
}

function relayUpgrade(req, socket, head, port, host) {
  const gw = net.connect(port, host);
  const kill = () => {
    try { socket.destroy(); } catch (_) { /* already gone */ }
    try { gw.destroy(); } catch (_) { /* already gone */ }
  };
  gw.on("connect", () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    gw.write(lines.join("\r\n") + "\r\n\r\n");
    if (head && head.length) gw.write(head);
    socket.pipe(gw).pipe(socket);
  });
  socket.on("error", kill);
  gw.on("error", kill);
}

const server = createServer((req, res) => {
  // Original Host header preserved: tenant resolution + dev origins depend on it.
  const proxy = httpRequest(
    {
      host: "127.0.0.1",
      port: NEXT_PORT,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxy.on("error", () => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("app starting, retry…");
  });
  req.pipe(proxy);
});

server.on("upgrade", (req, socket, head) => {
  if (wsPath(req.url)) relayUpgrade(req, socket, head, GW_PORT, GW_HOST);
  else relayUpgrade(req, socket, head, NEXT_PORT, "127.0.0.1"); // HMR + anything else
});

// Boot untouched Next on :3001, then open the single public door.
const child = spawn("npx", ["next", isProd ? "start" : "dev", "-p", String(NEXT_PORT)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, PORT: String(NEXT_PORT) },
});
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => child.kill());
process.on("SIGINT", () => child.kill());

server.listen(PUBLIC_PORT, () => {
  console.log(`[relay] :${PUBLIC_PORT} → next :${NEXT_PORT} + ws :${GW_PORT} (${isProd ? "prod" : "dev"})`);
});
