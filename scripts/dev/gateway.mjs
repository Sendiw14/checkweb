// Minimal stand-in for the Supabase API gateway in local development:
// forwards /auth/v1/* to a locally running GoTrue (Supabase Auth) server.
// Not used in production, where Supabase provides this routing.
import http from "node:http";

const listen = Number(process.env.GATEWAY_PORT ?? 54321);
const target = new URL(process.env.GOTRUE_URL ?? "http://127.0.0.1:9999");

http
  .createServer((req, res) => {
    if (!req.url?.startsWith("/auth/v1/")) {
      res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not routed in local gateway" }));
      return;
    }
    const upstream = http.request(
      { host: target.hostname, port: target.port, method: req.method, path: req.url.replace("/auth/v1", ""), headers: { ...req.headers, host: target.host } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  })
  .listen(listen, "127.0.0.1", () => console.log(`gateway on :${listen} -> ${target.origin}`));
