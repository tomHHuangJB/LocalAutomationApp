import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { deterministicBehavior } from "./middlewares/deterministic.js";
import sqlite3 from "sqlite3";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const db = new sqlite3.Database(":memory:");
db.serialize(() => {
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT)");
  db.run("INSERT INTO users (name, role) VALUES ('principal', 'admin'), ('senior', 'editor'), ('viewer', 'viewer')");
});

app.use(cors({ origin: process.env.ALLOW_CORS_FROM ?? "*" }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  const correlationId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  res.setHeader("X-Correlation-ID", correlationId);
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

const limiter = rateLimit({ windowMs: 60_000, max: 30 });
app.use("/api/auth/login", limiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Local Automation Lab API",
    health: "/health",
    apiDocs: "/api-docs"
  });
});

app.get("/api-docs", (_req, res) => {
  res.redirect("http://localhost:3002");
});

app.use("/api", deterministicBehavior);

const sessions = [{ id: "sess-1", user: "principal", active: true }];
let notifications = 0;

app.post("/api/auth/login", (req, res) => {
  res.json({ token: "demo-token", refreshToken: "refresh-demo", user: req.body?.username ?? "user" });
});

app.post("/api/auth/logout", (_req, res) => {
  res.json({ success: true, revoked: sessions.length });
});

app.post("/api/auth/refresh", (_req, res) => {
  res.json({ token: "demo-token-rotated", refreshToken: "refresh-rotated" });
});

app.get("/api/auth/sessions", (_req, res) => {
  res.json({ sessions });
});

app.post("/api/auth/forgot", (_req, res) => {
  res.json({ status: "sent" });
});

app.post("/api/auth/reset", (_req, res) => {
  res.json({ status: "reset" });
});

app.post("/api/auth/lockout", (_req, res) => {
  res.status(423).json({ error: { code: "LOCKED", message: "Account locked" } });
});

app.get("/api/data", (req, res) => {
  res.json({ data: [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }], delay: req.query.delay ?? 0 });
});

app.post("/api/data", (req, res) => {
  if (!req.body?.name) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Name required" } });
  }
  res.json({ id: Date.now(), ...req.body });
});

app.put("/api/data/:id", (req, res) => {
  res.json({ id: req.params.id, ...req.body, updated: true });
});

app.delete("/api/data/:id", (_req, res) => {
  res.json({ deleted: true });
});

app.post("/api/batch", (_req, res) => {
  res.json({ results: [{ id: 1, status: "ok" }, { id: 2, status: "error", message: "Failed" }] });
});

app.get("/api/flags", (_req, res) => {
  res.json({ flags: { newUI: true, betaFlow: false } });
});

app.post("/api/idempotent", (req, res) => {
  res.json({ idempotencyKey: req.headers["idempotency-key"], status: "ok" });
});

app.get("/api/pagination", (_req, res) => {
  res.json({ items: Array.from({ length: 5 }).map((_, i) => ({ id: i + 1 })), nextCursor: "cursor-2" });
});

app.get("/api/consistency", (_req, res) => {
  res.json({ status: "eventual", visibleAfterMs: 2000 });
});

app.get("/api/permissions", (_req, res) => {
  res.json({ geo: "prompt", notifications: "denied", clipboard: "granted" });
});

app.post("/api/csp-report", (req, res) => {
  res.json({ received: true, report: req.body ?? {} });
});

app.get("/api/roles", (_req, res) => {
  res.json({ roles: ["viewer", "editor", "admin"], permissions: { admin: ["all"], viewer: ["read"] } });
});

app.get("/api/time-skew", (_req, res) => {
  const skew = Number(process.env.TIME_SKEW_MS ?? 0);
  res.json({ serverTime: Date.now() + skew, skewMs: skew });
});

app.get("/api/security/injection", (req, res) => {
  const type = req.query.type ?? "sql";
  const input = String(req.query.input ?? "SELECT * FROM users");
  if (type !== "sql") {
    return res.json({ type, status: "sandboxed", query: input });
  }
  db.all(input, (err, rows) => {
    if (err) {
      return res.status(400).json({ error: { code: "SQL_ERROR", message: err.message } });
    }
    res.json({ type, status: "executed", rows });
  });
});

app.get("/api/security/access-control", (req, res) => {
  const role = req.query.role ?? "viewer";
  if (role !== "admin") {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
  }
  res.json({ status: "ok", data: { secret: "admin-only" } });
});

app.get("/api/security/xss", (req, res) => {
  const mode = req.query.mode ?? "sanitized";
  const payload = "<script>alert('xss')</script>";
  res.json({ mode, content: mode === "raw" ? payload : payload.replace(/</g, "&lt;") });
});

app.get("/api/security/misconfig", (_req, res) => {
  res.json({ debug: true, defaultCreds: true, headers: { server: "demo" } });
});

app.get("/api/security/vulnerable", (_req, res) => {
  res.json({ component: "demo-lib", version: "1.0.0", cve: "CVE-2020-1234", status: "outdated" });
});

app.get("/api/security/ssrf", (req, res) => {
  res.json({ target: req.query.url ?? "http://internal.service", allowed: false });
});

app.get("/api/security/crypto", (_req, res) => {
  res.json({ hashing: "md5", encrypted: false, sample: "demo-hash" });
});

app.get("/api/security/logging", (_req, res) => {
  res.json({ audit: [{ event: "login_failed", user: "principal", timestamp: new Date().toISOString() }] });
});

app.get("/api/security/headers", (_req, res) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'self'");
  res.json({ status: "headers-set" });
});

app.get("/api/security/redirect", (req, res) => {
  const target = String(req.query.target ?? "/");
  const allowed = target.startsWith("/");
  if (!allowed) {
    return res.status(400).json({ error: { code: "OPEN_REDIRECT_BLOCKED", message: "Blocked" } });
  }
  res.redirect(target);
});

app.post("/api/reset", (_req, res) => {
  notifications = 0;
  sessions.splice(0, sessions.length, { id: "sess-1", user: "principal", active: true });
  res.json({ status: "reset" });
});

app.post("/api/seed", (req, res) => {
  res.json({ seed: req.body?.seed ?? process.env.GLOBAL_SEED ?? 42 });
});

app.post("/api/upload", (_req, res) => {
  res.json({ status: "uploaded" });
});

app.get("/api/download/:id", (req, res) => {
  res.setHeader("Content-Disposition", `attachment; filename=report-${req.params.id}.csv`);
  res.type("text/csv").send("id,name\n1,alpha\n2,beta\n");
});

app.get("/api/flaky", (_req, res) => {
  if (Math.random() < 0.3) {
    return res.status(500).json({ error: { code: "FLAKY", message: "Random failure" } });
  }
  res.json({ ok: true });
});

app.get("/api/slow", (req, res) => {
  const min = Number(req.query.min ?? 1000);
  const max = Number(req.query.max ?? 10000);
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  setTimeout(() => res.json({ delayed: delay }), delay);
});

app.get("/api/large-payload", (_req, res) => {
  res.json({ payload: "x".repeat(5_000_000) });
});

app.get("/api/stream", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  let count = 0;
  const interval = setInterval(() => {
    count += 1;
    res.write(`data: message-${count}\n\n`);
    if (count >= 5) {
      clearInterval(interval);
      res.end();
    }
  }, 1000);
});

app.get("/api/partial", (_req, res) => {
  res.status(206);
  res.setHeader("Content-Range", "items 0-1/5");
  res.json({ items: [{ id: 1 }, { id: 2 }], total: 5 });
});

wss.on("connection", (socket) => {
  if (String(process.env.ENABLE_WEBSOCKETS ?? "true") !== "true") {
    socket.close();
    return;
  }
  let isAlive = true;

  socket.on("pong", () => {
    isAlive = true;
  });

  const interval = setInterval(() => {
    notifications += 1;
    socket.send(JSON.stringify({ type: "notification", payload: `Notification ${notifications}` }));
  }, 4000);

  const heartbeat = setInterval(() => {
    if (!isAlive) {
      socket.terminate();
      return;
    }
    isAlive = false;
    socket.ping();
  }, 5000);

  socket.on("close", () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
});

const port = Number(process.env.PORT ?? 3001);
server.listen(port, () => {
  console.log(`API server running on ${port}`);
});
