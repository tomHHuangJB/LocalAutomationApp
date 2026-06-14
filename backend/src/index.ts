import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { dirname } from "path";
import { mkdirSync } from "fs";
import { WebSocketServer } from "ws";
import { deterministicBehavior } from "./middlewares/deterministic.js";
import sqlite3 from "sqlite3";
import { startGrpcServer, type StartedGrpcServer } from "./grpc/server.js";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  addFakeResetMail,
  createServer as createEffizienteServer,
  deleteServer as deleteEffizienteServer,
  getDashboardCollections,
  getEffizienteUser,
  getEffizienteUserByToken,
  getServerByKey,
  listFakeMailMessages,
  listServers,
  resetEffizienteData,
  updateServer as updateEffizienteServer
} from "./compat/effizienteData.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const sqliteDbPath = process.env.SQLITE_DB_PATH ?? ":memory:";
if (sqliteDbPath !== ":memory:") {
  mkdirSync(dirname(sqliteDbPath), { recursive: true });
}
const db = new sqlite3.Database(sqliteDbPath);
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT)");
  db.run("INSERT INTO users (name, role) VALUES ('principal', 'admin'), ('senior', 'editor'), ('viewer', 'viewer')");
  db.run(`
    CREATE TABLE IF NOT EXISTS business_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS business_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      correlation_id TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      total_amount REAL NOT NULL,
      currency TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES business_customers(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS business_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES business_orders(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS business_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      authorization_code TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES business_orders(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS business_order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES business_orders(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS etl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      source_system TEXT NOT NULL,
      target_system TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      source_count INTEGER NOT NULL DEFAULT 0,
      target_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS etl_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      order_id INTEGER,
      error_code TEXT NOT NULL,
      error_message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES etl_runs(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS stg_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      source_order_id INTEGER NOT NULL,
      order_number TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      customer_external_id TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      total_amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      extracted_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES etl_runs(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS stg_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      source_order_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY (run_id) REFERENCES etl_runs(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS dw_customer_dim (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_external_id TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS dw_order_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      source_order_id INTEGER NOT NULL UNIQUE,
      order_number TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      customer_external_id TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      total_quantity INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      payment_amount REAL NOT NULL,
      downstream_event_count INTEGER NOT NULL,
      data_quality_status TEXT NOT NULL,
      loaded_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES etl_runs(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS downstream_consumer_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      correlation_id TEXT NOT NULL,
      consumer_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      delivery_status TEXT NOT NULL DEFAULT 'DELIVERED',
      attempt_count INTEGER NOT NULL DEFAULT 1,
      delivered_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES business_orders(id)
    )
  `);
});

const corsOrigin = process.env.ALLOW_CORS_FROM ?? "http://localhost:5173";
app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin,
    credentials: true,
    exposedHeaders: ["X-Checksum-Sha256", "X-Correlation-ID"]
  })
);
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

type AuthSession = {
  id: string;
  user: string;
  role: "admin" | "editor" | "viewer";
  active: boolean;
  expiresAt: number;
};

const authUsers: Record<string, { password: string; role: AuthSession["role"] }> = {
  "principal.engineer": { password: "demo", role: "admin" },
  senior: { password: "demo", role: "editor" },
  viewer: { password: "demo", role: "viewer" }
};

const authSessions = new Map<string, AuthSession>();

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  return Object.fromEntries(
    (cookieHeader ?? "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...value] = cookie.split("=");
        return [decodeURIComponent(name), decodeURIComponent(value.join("="))];
      })
  );
}

function getAuthSession(req: express.Request): AuthSession | null {
  const sessionId = parseCookies(req.headers.cookie).lab_session;
  if (!sessionId) return null;
  const session = authSessions.get(sessionId);
  if (!session || !session.active || session.expiresAt < Date.now()) {
    if (sessionId) authSessions.delete(sessionId);
    return null;
  }
  return session;
}

function setAuthCookie(res: express.Response, sessionId: string) {
  res.cookie("lab_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 1000
  });
}

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
const dedupCache = new Map<string, { response: unknown; timestamp: number }>();
const uploadSessions = new Map<string, { totalChunks: number; received: Set<number> }>();

type BusinessOrderItemRequest = {
  sku?: string;
  quantity?: number;
  unitPrice?: number;
};

type BusinessOrderRequest = {
  customer?: {
    externalId?: string;
    name?: string;
    email?: string;
  };
  items?: BusinessOrderItemRequest[];
  payment?: {
    provider?: string;
    authorizationCode?: string;
  };
  currency?: string;
};

type BusinessCustomerRow = {
  id: number;
  external_id: string;
  name: string;
  email: string;
};

type BusinessOrderRow = {
  id: number;
  order_number: string;
  correlation_id: string;
  customer_id: number;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
};

type BusinessOrderItemRow = {
  id: number;
  order_id: number;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type BusinessPaymentRow = {
  id: number;
  order_id: number;
  provider: string;
  amount: number;
  status: string;
  authorization_code: string;
};

type BusinessStatusHistoryRow = {
  id: number;
  order_id: number;
  status: string;
  changed_at: string;
};

type DownstreamConsumerEventRow = {
  id: number;
  order_id: number;
  correlation_id: string;
  consumer_name: string;
  event_type: string;
  payload: string;
  delivery_status: string;
  attempt_count: number;
  delivered_at: string;
};

type EtlRunRow = {
  id: number;
  status: string;
  source_system: string;
  target_system: string;
  started_at: string;
  completed_at: string | null;
  source_count: number;
  target_count: number;
  error_count: number;
};

function dbRun(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row as T | undefined);
    });
  });
}

function dbAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows as T[]);
    });
  });
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function validateBusinessOrderRequest(body: BusinessOrderRequest) {
  const errors: string[] = [];
  if (!body.customer?.externalId) errors.push("customer.externalId is required");
  if (!body.customer?.name) errors.push("customer.name is required");
  if (!body.customer?.email) errors.push("customer.email is required");
  if (!body.items?.length) errors.push("at least one item is required");
  body.items?.forEach((item, index) => {
    if (!item.sku) errors.push(`items[${index}].sku is required`);
    if (!Number.isInteger(item.quantity) || Number(item.quantity) <= 0) {
      errors.push(`items[${index}].quantity must be a positive integer`);
    }
    if (typeof item.unitPrice !== "number" || item.unitPrice <= 0) {
      errors.push(`items[${index}].unitPrice must be a positive number`);
    }
  });
  return errors;
}

async function publishDownstreamOrderEvent(order: BusinessOrderRow, customer: BusinessCustomerRow, items: BusinessOrderItemRow[]) {
  const payload = {
    correlationId: order.correlation_id,
    orderId: order.id,
    orderNumber: order.order_number,
    customer: {
      externalId: customer.external_id,
      name: customer.name,
      email: customer.email
    },
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: order.total_amount,
    currency: order.currency,
    status: order.status
  };
  await dbRun(
    `
      INSERT INTO downstream_consumer_events
        (order_id, correlation_id, consumer_name, event_type, payload, delivery_status, attempt_count, delivered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [order.id, order.correlation_id, "portfolio-risk-consumer", "ORDER_CREATED", JSON.stringify(payload), "DELIVERED", 1, new Date().toISOString()]
  );
  return payload;
}

async function getBusinessOrderSnapshot(orderId: number) {
  const order = await dbGet<BusinessOrderRow>("SELECT * FROM business_orders WHERE id = ?", [orderId]);
  if (!order) return undefined;
  const customer = await dbGet<BusinessCustomerRow>("SELECT * FROM business_customers WHERE id = ?", [order.customer_id]);
  const items = await dbAll<BusinessOrderItemRow>("SELECT * FROM business_order_items WHERE order_id = ? ORDER BY id", [orderId]);
  const payments = await dbAll<BusinessPaymentRow>("SELECT * FROM business_payments WHERE order_id = ? ORDER BY id", [orderId]);
  const statusHistory = await dbAll<BusinessStatusHistoryRow>(
    "SELECT * FROM business_order_status_history WHERE order_id = ? ORDER BY id",
    [orderId]
  );
  const downstreamEvents = await dbAll<DownstreamConsumerEventRow>(
    "SELECT * FROM downstream_consumer_events WHERE order_id = ? ORDER BY id",
    [orderId]
  );

  return {
    id: order.id,
    orderNumber: order.order_number,
    correlationId: order.correlation_id,
    status: order.status,
    totalAmount: order.total_amount,
    currency: order.currency,
    createdAt: order.created_at,
    customer: customer
      ? {
          id: customer.id,
          externalId: customer.external_id,
          name: customer.name,
          email: customer.email
        }
      : undefined,
    items: items.map((item) => ({
      id: item.id,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      amount: payment.amount,
      status: payment.status,
      authorizationCode: payment.authorization_code
    })),
    statusHistory: statusHistory.map((history) => ({
      id: history.id,
      status: history.status,
      changedAt: history.changed_at
    })),
    downstreamEvents: downstreamEvents.map((event) => ({
      id: event.id,
      correlationId: event.correlation_id,
      consumerName: event.consumer_name,
      eventType: event.event_type,
      payload: JSON.parse(event.payload) as unknown,
      deliveryStatus: event.delivery_status,
      attemptCount: event.attempt_count,
      deliveredAt: event.delivered_at
    }))
  };
}


async function getBusinessTableRows(orderId: number) {
  const order = await dbGet<BusinessOrderRow>("SELECT * FROM business_orders WHERE id = ?", [orderId]);
  if (!order) return undefined;
  return {
    customers: await dbAll<BusinessCustomerRow>("SELECT c.* FROM business_customers c JOIN business_orders o ON o.customer_id = c.id WHERE o.id = ?", [orderId]),
    orders: await dbAll<BusinessOrderRow>("SELECT * FROM business_orders WHERE id = ?", [orderId]),
    items: await dbAll<BusinessOrderItemRow>("SELECT * FROM business_order_items WHERE order_id = ? ORDER BY id", [orderId]),
    payments: await dbAll<BusinessPaymentRow>("SELECT * FROM business_payments WHERE order_id = ? ORDER BY id", [orderId]),
    statusHistory: await dbAll<BusinessStatusHistoryRow>("SELECT * FROM business_order_status_history WHERE order_id = ? ORDER BY id", [orderId]),
    downstreamEvents: await dbAll<DownstreamConsumerEventRow>("SELECT * FROM downstream_consumer_events WHERE order_id = ? ORDER BY id", [orderId])
  };
}

const namedDataQueries: Record<string, string> = {
  business_order_integrity: `
    SELECT
      o.id AS order_id,
      o.order_number,
      o.correlation_id,
      c.external_id AS customer_external_id,
      o.total_amount AS order_total,
      ROUND(COALESCE(SUM(i.line_total), 0), 2) AS item_total,
      ROUND(COALESCE((SELECT SUM(p.amount) FROM business_payments p WHERE p.order_id = o.id), 0), 2) AS payment_total,
      COUNT(DISTINCT i.id) AS item_count,
      COUNT(DISTINCT d.id) AS downstream_event_count
    FROM business_orders o
    JOIN business_customers c ON c.id = o.customer_id
    LEFT JOIN business_order_items i ON i.order_id = o.id
    LEFT JOIN downstream_consumer_events d ON d.order_id = o.id
    GROUP BY o.id
    ORDER BY o.id
  `,
  warehouse_order_facts: "SELECT * FROM dw_order_facts ORDER BY id",
  latest_etl_runs: "SELECT * FROM etl_runs ORDER BY id DESC"
};

async function runOrdersEtl() {
  const startedAt = new Date().toISOString();
  const run = await dbRun(
    "INSERT INTO etl_runs (status, source_system, target_system, started_at) VALUES (?, ?, ?, ?)",
    ["RUNNING", "business_normalized_sqlite", "analytics_warehouse_sqlite", startedAt]
  );
  const runId = run.lastID;
  const orders = await dbAll<BusinessOrderRow>("SELECT * FROM business_orders ORDER BY id");
  let targetCount = 0;
  let errorCount = 0;
  for (const order of orders) {
    const snapshot = await getBusinessOrderSnapshot(order.id);
    if (!snapshot?.customer) {
      errorCount += 1;
      await dbRun(
        "INSERT INTO etl_errors (run_id, order_id, error_code, error_message, created_at) VALUES (?, ?, ?, ?, ?)",
        [runId, order.id, "MISSING_SNAPSHOT", "Order snapshot or customer missing", new Date().toISOString()]
      );
      continue;
    }
    await dbRun(
      `INSERT INTO stg_orders
        (run_id, source_order_id, order_number, correlation_id, customer_external_id, customer_email, total_amount, currency, status, extracted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [runId, snapshot.id, snapshot.orderNumber, snapshot.correlationId, snapshot.customer.externalId, snapshot.customer.email, snapshot.totalAmount, snapshot.currency, snapshot.status, new Date().toISOString()]
    );
    for (const item of snapshot.items) {
      await dbRun(
        "INSERT INTO stg_order_items (run_id, source_order_id, sku, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)",
        [runId, snapshot.id, item.sku, item.quantity, item.unitPrice, item.lineTotal]
      );
    }
    await dbRun(
      `INSERT INTO dw_customer_dim (customer_external_id, customer_name, customer_email, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(customer_external_id) DO UPDATE SET customer_name = excluded.customer_name, customer_email = excluded.customer_email, last_seen_at = excluded.last_seen_at`,
      [snapshot.customer.externalId, snapshot.customer.name, snapshot.customer.email, new Date().toISOString()]
    );
    const itemTotal = roundMoney(snapshot.items.reduce((sum, item) => sum + item.lineTotal, 0));
    const paymentAmount = roundMoney(snapshot.payments.reduce((sum, payment) => sum + payment.amount, 0));
    const totalQuantity = snapshot.items.reduce((sum, item) => sum + item.quantity, 0);
    const quality = itemTotal === snapshot.totalAmount && paymentAmount === snapshot.totalAmount && snapshot.downstreamEvents.length > 0 ? "PASS" : "FAIL";
    if (quality === "FAIL") errorCount += 1;
    await dbRun(
      `INSERT INTO dw_order_facts
        (run_id, source_order_id, order_number, correlation_id, customer_external_id, item_count, total_quantity, total_amount, payment_amount, downstream_event_count, data_quality_status, loaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_order_id) DO UPDATE SET run_id = excluded.run_id, item_count = excluded.item_count, total_quantity = excluded.total_quantity, total_amount = excluded.total_amount, payment_amount = excluded.payment_amount, downstream_event_count = excluded.downstream_event_count, data_quality_status = excluded.data_quality_status, loaded_at = excluded.loaded_at`,
      [runId, snapshot.id, snapshot.orderNumber, snapshot.correlationId, snapshot.customer.externalId, snapshot.items.length, totalQuantity, snapshot.totalAmount, paymentAmount, snapshot.downstreamEvents.length, quality, new Date().toISOString()]
    );
    targetCount += 1;
  }
  await dbRun(
    "UPDATE etl_runs SET status = ?, completed_at = ?, source_count = ?, target_count = ?, error_count = ? WHERE id = ?",
    [errorCount ? "COMPLETED_WITH_ERRORS" : "COMPLETED", new Date().toISOString(), orders.length, targetCount, errorCount, runId]
  );
  return dbGet<EtlRunRow>("SELECT * FROM etl_runs WHERE id = ?", [runId]);
}

function getBearerToken(req: express.Request) {
  const authorization = req.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return "";
  }
  return authorization.slice("Bearer ".length);
}

function getAuthorizedEffizienteUser(req: express.Request, res: express.Response) {
  const user = getEffizienteUserByToken(getBearerToken(req));
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing or invalid token" } });
    return undefined;
  }
  return user;
}

async function createServersWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");
  worksheet.addRow(["Key", "Name", "URL", "Active"]);
  listServers().forEach((serverItem) => {
    worksheet.addRow([serverItem.Key, serverItem.Name, serverItem.Url, String(serverItem.Active)]);
  });
  return workbook.xlsx.writeBuffer();
}

async function createServersPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = [
    "Key",
    "Name",
    "URL",
    "Active",
    ...listServers().flatMap((serverItem) => [
      String(serverItem.Key),
      serverItem.Name,
      serverItem.Url,
      String(serverItem.Active)
    ])
  ];
  let y = 800;
  lines.forEach((line) => {
    page.drawText(line, { x: 48, y, size: 12, font });
    y -= 18;
  });
  return pdf.save();
}

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username ?? req.body?.email ?? "user");
  const password = String(req.body?.password ?? "");
  const user = authUsers[username];

  if (!user || user.password !== password) {
    return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } });
  }

  const sessionId = `sess-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const session: AuthSession = {
    id: sessionId,
    user: username,
    role: user.role,
    active: true,
    expiresAt: Date.now() + 60 * 60 * 1000
  };
  authSessions.set(sessionId, session);
  setAuthCookie(res, sessionId);

  res.json({ token: "demo-token", refreshToken: "refresh-demo", user: username, role: user.role });
});

app.post("/api/auth/logout", (req, res) => {
  const session = getAuthSession(req);
  if (session) {
    session.active = false;
    authSessions.delete(session.id);
  }
  res.clearCookie("lab_session", { path: "/" });
  res.json({ success: true, revoked: session ? 1 : 0 });
});

app.post("/api/auth/refresh", (req, res) => {
  const session = getAuthSession(req);
  if (!session) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing or invalid session" } });
  }
  session.expiresAt = Date.now() + 60 * 60 * 1000;
  res.json({ token: "demo-token-rotated", refreshToken: "refresh-rotated", user: session.user, role: session.role });
});

app.get("/api/auth/me", (req, res) => {
  const session = getAuthSession(req);
  if (!session) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing or invalid session" } });
  }
  res.json({ user: session.user, role: session.role, sessionId: session.id });
});

app.get("/api/auth/sessions", (_req, res) => {
  res.json({ sessions: [...sessions, ...authSessions.values()] });
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

app.post("/api/business-flow/orders", async (req, res, next) => {
  try {
    const body = req.body as BusinessOrderRequest;
    const errors = validateBusinessOrderRequest(body);
    if (errors.length) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid business order", details: { errors } } });
    }

    const items = body.items ?? [];
    const totalAmount = roundMoney(
      items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)
    );
    const correlationId = String(req.headers["x-correlation-id"] ?? `corr-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const createdAt = new Date().toISOString();
    const customer = body.customer;

    if (!customer) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Customer is required" } });
    }

    const existingCustomer = await dbGet<BusinessCustomerRow>(
      "SELECT * FROM business_customers WHERE external_id = ?",
      [customer.externalId]
    );
    const customerId = existingCustomer
      ? existingCustomer.id
      : (
          await dbRun(
            "INSERT INTO business_customers (external_id, name, email) VALUES (?, ?, ?)",
            [customer.externalId, customer.name, customer.email]
          )
        ).lastID;

    if (existingCustomer) {
      await dbRun("UPDATE business_customers SET name = ?, email = ? WHERE id = ?", [
        customer.name,
        customer.email,
        existingCustomer.id
      ]);
    }

    const orderId = (
      await dbRun(
        `
          INSERT INTO business_orders
            (order_number, correlation_id, customer_id, status, total_amount, currency, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [orderNumber, correlationId, customerId, "CREATED", totalAmount, body.currency ?? "USD", createdAt]
      )
    ).lastID;

    for (const item of items) {
      const lineTotal = roundMoney(Number(item.quantity) * Number(item.unitPrice));
      await dbRun(
        `
          INSERT INTO business_order_items
            (order_id, sku, quantity, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?)
        `,
        [orderId, item.sku, item.quantity, item.unitPrice, lineTotal]
      );
    }

    await dbRun(
      `
        INSERT INTO business_payments
          (order_id, provider, amount, status, authorization_code)
        VALUES (?, ?, ?, ?, ?)
      `,
      [orderId, body.payment?.provider ?? "demo-pay", totalAmount, "AUTHORIZED", body.payment?.authorizationCode ?? "AUTH-DEMO"]
    );
    await dbRun("INSERT INTO business_order_status_history (order_id, status, changed_at) VALUES (?, ?, ?)", [
      orderId,
      "CREATED",
      createdAt
    ]);
    await dbRun("INSERT INTO business_order_status_history (order_id, status, changed_at) VALUES (?, ?, ?)", [
      orderId,
      "PAYMENT_AUTHORIZED",
      new Date().toISOString()
    ]);

    const snapshot = await getBusinessOrderSnapshot(orderId);
    if (!snapshot?.customer) {
      return res.status(500).json({ error: { code: "PERSISTENCE_ERROR", message: "Order snapshot could not be built" } });
    }

    const persistedCustomer = await dbGet<BusinessCustomerRow>("SELECT * FROM business_customers WHERE id = ?", [customerId]);
    const persistedItems = await dbAll<BusinessOrderItemRow>("SELECT * FROM business_order_items WHERE order_id = ?", [orderId]);
    const persistedOrder = await dbGet<BusinessOrderRow>("SELECT * FROM business_orders WHERE id = ?", [orderId]);
    if (!persistedCustomer || !persistedOrder) {
      return res.status(500).json({ error: { code: "PERSISTENCE_ERROR", message: "Required persisted rows are missing" } });
    }
    const downstreamPayload = await publishDownstreamOrderEvent(persistedOrder, persistedCustomer, persistedItems);

    res.status(201).json({
      orderId,
      orderNumber,
      correlationId,
      status: "CREATED",
      totalAmount,
      currency: body.currency ?? "USD",
      persistedTables: [
        "business_customers",
        "business_orders",
        "business_order_items",
        "business_payments",
        "business_order_status_history",
        "downstream_consumer_events"
      ],
      downstream: downstreamPayload,
      links: {
        order: `/api/business-flow/orders/${orderId}`,
        integrity: `/api/business-flow/orders/${orderId}/integrity`,
        downstream: `/api/downstream/consumer-events/${correlationId}`
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/business-flow/orders/:id", async (req, res, next) => {
  try {
    const snapshot = await getBusinessOrderSnapshot(Number(req.params.id));
    if (!snapshot) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.get("/api/business-flow/orders/:id/integrity", async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const snapshot = await getBusinessOrderSnapshot(orderId);
    if (!snapshot) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }

    const itemTotal = roundMoney(snapshot.items.reduce((sum, item) => sum + item.lineTotal, 0));
    const paymentTotal = roundMoney(snapshot.payments.reduce((sum, payment) => sum + payment.amount, 0));
    const checks = [
      { name: "customer row exists", passed: !!snapshot.customer },
      { name: "order has one or more items", passed: snapshot.items.length > 0 },
      { name: "order total equals sum of item line totals", passed: itemTotal === snapshot.totalAmount },
      { name: "payment total equals order total", passed: paymentTotal === snapshot.totalAmount },
      { name: "status history contains created status", passed: snapshot.statusHistory.some((entry) => entry.status === "CREATED") },
      {
        name: "downstream consumer received order event",
        passed: snapshot.downstreamEvents.some((event) => event.eventType === "ORDER_CREATED")
      }
    ];
    const passed = checks.every((check) => check.passed);

    res.status(passed ? 200 : 409).json({
      orderId,
      correlationId: snapshot.correlationId,
      passed,
      tableCounts: {
        customers: snapshot.customer ? 1 : 0,
        orders: 1,
        items: snapshot.items.length,
        payments: snapshot.payments.length,
        statusHistory: snapshot.statusHistory.length,
        downstreamEvents: snapshot.downstreamEvents.length
      },
      calculated: {
        itemTotal,
        paymentTotal,
        orderTotal: snapshot.totalAmount
      },
      checks
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/downstream/consumer-events/:correlationId", async (req, res, next) => {
  try {
    const events = await dbAll<DownstreamConsumerEventRow>(
      "SELECT * FROM downstream_consumer_events WHERE correlation_id = ? ORDER BY id",
      [req.params.correlationId]
    );
    if (!events.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Downstream event not found" } });
    }
    res.json({
      correlationId: req.params.correlationId,
      events: events.map((event) => ({
        id: event.id,
        orderId: event.order_id,
        consumerName: event.consumer_name,
        eventType: event.event_type,
        payload: JSON.parse(event.payload) as unknown,
        deliveryStatus: event.delivery_status,
        attemptCount: event.attempt_count,
        deliveredAt: event.delivered_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/test/db/orders/:id/tables", async (req, res, next) => {
  try {
    const rows = await getBusinessTableRows(Number(req.params.id));
    if (!rows) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order table rows not found" } });
    }
    res.json({ orderId: Number(req.params.id), dbPath: sqliteDbPath, tables: rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/test/db/query", async (req, res, next) => {
  try {
    const name = String(req.query.name ?? "business_order_integrity");
    const sql = namedDataQueries[name];
    if (!sql) {
      return res.status(400).json({ error: { code: "UNKNOWN_QUERY", message: `Unknown named query: ${name}` } });
    }
    res.json({ name, rows: await dbAll(sql) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/etl/run/orders", async (_req, res, next) => {
  try {
    const run = await runOrdersEtl();
    res.status(201).json({ run, links: { run: `/api/etl/runs/${run?.id}`, warehouseOrders: "/api/warehouse/orders" } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/etl/runs/:runId", async (req, res, next) => {
  try {
    const run = await dbGet<EtlRunRow>("SELECT * FROM etl_runs WHERE id = ?", [Number(req.params.runId)]);
    if (!run) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "ETL run not found" } });
    }
    const errors = await dbAll("SELECT * FROM etl_errors WHERE run_id = ? ORDER BY id", [run.id]);
    res.json({ run, errors });
  } catch (error) {
    next(error);
  }
});

app.get("/api/warehouse/orders", async (_req, res, next) => {
  try {
    res.json({ rows: await dbAll("SELECT * FROM dw_order_facts ORDER BY id") });
  } catch (error) {
    next(error);
  }
});

app.get("/api/warehouse/orders/:orderNumber", async (req, res, next) => {
  try {
    const row = await dbGet("SELECT * FROM dw_order_facts WHERE order_number = ?", [req.params.orderNumber]);
    if (!row) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Warehouse order not found" } });
    }
    res.json(row);
  } catch (error) {
    next(error);
  }
});

app.get("/api/consistency", (_req, res) => {
  res.json({ status: "eventual", visibleAfterMs: 2000 });
});

app.get("/api/race", (req, res) => {
  const label = String(req.query.label ?? "fast");
  const delay = Number(req.query.delay ?? (label === "slow" ? 800 : 200));
  setTimeout(() => {
    res.json({ label, delay, serverTime: new Date().toISOString() });
  }, delay);
});

app.get("/api/dedup", (req, res) => {
  const key = String(req.query.key ?? "default");
  const now = Date.now();
  const cached = dedupCache.get(key);
  if (cached && now - cached.timestamp < 2000) {
    return res.json({ key, deduped: true, cachedAt: cached.timestamp, payload: cached.response });
  }
  const response = { id: now, message: "fresh response" };
  dedupCache.set(key, { response, timestamp: now });
  res.json({ key, deduped: false, payload: response });
});

app.get("/api/table", (req, res) => {
  const status = String(req.query.status ?? "all");
  const sort = String(req.query.sort ?? "id");
  const order = String(req.query.order ?? "asc");
  const rows = Array.from({ length: 12 }).map((_, index) => ({
    id: index + 1,
    name: `Row ${index + 1}`,
    status: index % 2 === 0 ? "Active" : "Paused"
  }));
  const filtered = status === "all" ? rows : rows.filter((row) => row.status.toLowerCase() === status.toLowerCase());
  const sorted = [...filtered].sort((a, b) => {
    const direction = order === "desc" ? -1 : 1;
    if (sort === "name") return a.name.localeCompare(b.name) * direction;
    return (a.id - b.id) * direction;
  });
  res.json({ items: sorted, total: sorted.length });
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
  resetEffizienteData();
  db.serialize(() => {
    db.run("DELETE FROM etl_errors");
    db.run("DELETE FROM dw_order_facts");
    db.run("DELETE FROM dw_customer_dim");
    db.run("DELETE FROM stg_order_items");
    db.run("DELETE FROM stg_orders");
    db.run("DELETE FROM etl_runs");
    db.run("DELETE FROM downstream_consumer_events");
    db.run("DELETE FROM business_order_status_history");
    db.run("DELETE FROM business_payments");
    db.run("DELETE FROM business_order_items");
    db.run("DELETE FROM business_orders");
    db.run("DELETE FROM business_customers");
  });
  res.json({ status: "reset" });
});

app.post("/api/seed", (req, res) => {
  res.json({ seed: req.body?.seed ?? process.env.GLOBAL_SEED ?? 42 });
});

app.post("/compat/effiziente/api/users/login", (req, res) => {
  const user = getEffizienteUser(req.body?.Company, req.body?.UserName, req.body?.Password);
  if (!user) {
    return res.status(401).json({ Message: "Invalid credentials" });
  }
  res.json({
    AccessToken: user.accessToken,
    User: {
      Id: user.id,
      Name: user.name,
      Email: user.email,
      Role: user.role
    }
  });
});

app.get("/compat/effiziente/api/Users/Current", (req, res) => {
  const user = getAuthorizedEffizienteUser(req, res);
  if (!user) {
    return;
  }
  res.json({
    Id: user.id,
    Name: user.name,
    Email: user.email,
    Company: user.company,
    Role: user.role
  });
});

app.get("/compat/effiziente/api/server", (req, res) => {
  const user = getAuthorizedEffizienteUser(req, res);
  if (!user) {
    return;
  }
  const filter = String(req.query.filter ?? "").toLowerCase();
  const servers = listServers().filter((serverItem) => {
    if (!filter) return true;
    return [String(serverItem.Key), serverItem.Name, serverItem.Url, String(serverItem.Active)]
      .some((value) => value.toLowerCase().includes(filter));
  });
  res.json(servers);
});

app.get("/compat/effiziente/api/server/:key", (req, res) => {
  const user = getAuthorizedEffizienteUser(req, res);
  if (!user) {
    return;
  }
  const serverItem = getServerByKey(req.params.key);
  if (!serverItem) {
    return res.status(404).json({ Message: "Server not found" });
  }
  res.json(serverItem);
});

app.post("/compat/effiziente/api/server", (req, res) => {
  const user = getAuthorizedEffizienteUser(req, res);
  if (!user) {
    return;
  }
  const created = createEffizienteServer({
    Key: Number(req.body?.Key),
    Name: String(req.body?.Name ?? ""),
    Url: String(req.body?.Url ?? ""),
    Active: Boolean(req.body?.Active ?? true)
  });
  res.status(201).json(created);
});

app.put("/compat/effiziente/api/server", (req, res) => {
  const user = getAuthorizedEffizienteUser(req, res);
  if (!user) {
    return;
  }
  const updated = updateEffizienteServer({
    Id: req.body?.Id ? Number(req.body.Id) : undefined,
    Key: Number(req.body?.Key),
    Name: String(req.body?.Name ?? ""),
    Url: String(req.body?.Url ?? ""),
    Active: Boolean(req.body?.Active ?? true)
  });
  if (!updated) {
    return res.status(404).json({ Message: "Server not found" });
  }
  res.status(204).send();
});

app.delete("/compat/effiziente/api/server/:id", (req, res) => {
  const user = getAuthorizedEffizienteUser(req, res);
  if (!user) {
    return;
  }
  const deleted = deleteEffizienteServer(Number(req.params.id));
  if (!deleted) {
    return res.status(404).json({ Message: "Server not found" });
  }
  res.status(204).send();
});

app.get("/compat/effiziente/api/collection/summary", (_req, res) => {
  res.json(getDashboardCollections().summary);
});

app.get("/compat/effiziente/api/collection/due-date-summary", (_req, res) => {
  res.json(getDashboardCollections().dueDateSummary);
});

app.get("/compat/effiziente/api/collection/top-5-avg-days", (_req, res) => {
  res.json(getDashboardCollections().top5AvgDays);
});

app.get("/compat/effiziente/api/collection/top-5-total", (_req, res) => {
  res.json(getDashboardCollections().top5Total);
});

app.get("/compat/effiziente/api/collection/top-5-type", (_req, res) => {
  res.json(getDashboardCollections().top5Type);
});

app.get("/compat/effiziente/api/collection/top-10-limit-1", (_req, res) => {
  res.json(getDashboardCollections().top10Limit1);
});

app.get("/compat/effiziente/api/collection/top-10-Limit-2", (_req, res) => {
  res.json(getDashboardCollections().top10Limit2);
});

app.get("/compat/effiziente/api/collection/top-10-Limit-3", (_req, res) => {
  res.json(getDashboardCollections().top10Limit3);
});

app.get("/compat/effiziente/api/collection/top-10-to-expire", (_req, res) => {
  res.json(getDashboardCollections().top10ToExpire);
});

app.post("/compat/effiziente/api/auth/forgot", (req, res) => {
  const email = String(req.body?.email ?? "");
  const user = [getEffizienteUser("Demo", "Admin", "Admin"), getEffizienteUser("Demo", "Demo", "Demo")]
    .find((candidate) => candidate?.email === email);
  if (user) {
    addFakeResetMail(user.name);
  }
  res.json({ status: "sent" });
});

app.get("/compat/effiziente/api/export/servers.xlsx", async (_req, res) => {
  const workbook = await createServersWorkbook();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="servers.xlsx"');
  res.send(Buffer.from(workbook));
});

app.get("/compat/effiziente/api/export/servers.pdf", async (_req, res) => {
  const pdf = await createServersPdf();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="servers.pdf"');
  res.send(Buffer.from(pdf));
});

app.get("/compat/mailtrap/api/accounts/:account/inboxes/:inbox/messages", (_req, res) => {
  res.json(listFakeMailMessages().map((message) => ({
    ...message,
    html_path: `${message.html_path}?user=${encodeURIComponent(String(message.template_variables.user ?? "Admin User"))}`
  })));
});

app.get("/compat/mailtrap/fake-mail/reset-password-request", (req, res) => {
  const user = String(req.query.user ?? "Admin User");
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Reset password request</title></head>
  <body>
    <main>
      <h1>Hello ${user}! Forgot your password?</h1>
      <a href="http://localhost:5173/compat/effiziente/reset-password">Reset password</a>
    </main>
  </body>
</html>`);
});

app.post("/api/upload", (_req, res) => {
  res.json({ status: "uploaded" });
});

app.post("/api/upload/chunk", (req, res) => {
  const uploadId = String(req.headers["upload-id"] ?? "default");
  const chunkIndex = Number(req.headers["chunk-index"] ?? 0);
  const totalChunks = Number(req.headers["total-chunks"] ?? 1);
  const session = uploadSessions.get(uploadId) ?? { totalChunks, received: new Set<number>() };
  session.totalChunks = totalChunks;
  session.received.add(chunkIndex);
  uploadSessions.set(uploadId, session);
  res.json({ uploadId, received: session.received.size, total: session.totalChunks });
});

app.post("/api/upload/complete", (req, res) => {
  const uploadId = String(req.headers["upload-id"] ?? "default");
  const session = uploadSessions.get(uploadId);
  const complete = !!session && session.received.size >= session.totalChunks;
  res.json({ uploadId, complete });
});

app.get("/api/download/:id", (req, res) => {
  const checksum = req.query.checksum === "bad" ? "bad-hash" : "demo-hash";
  res.setHeader("X-Checksum-Sha256", checksum);
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

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  const intervalMs = Number(req.query.interval ?? 1000);
  const maxCount = Number(req.query.count ?? 5);
  let count = 0;
  const interval = setInterval(() => {
    count += 1;
    res.write(`data: message-${count}\n\n`);
    if (count >= maxCount) {
      clearInterval(interval);
      res.end();
    }
  }, intervalMs);
});

app.get("/api/partial", (_req, res) => {
  res.status(206);
  res.setHeader("Content-Range", "items 0-1/5");
  res.json({ items: [{ id: 1 }, { id: 2 }], total: 5 });
});

app.get("/csp-test", (_req, res) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'");
  res.type("text/html").send(
    "<!doctype html><html><head><title>CSP Test</title></head><body><h1>CSP Test</h1><script>window.cspBlocked = true;</script></body></html>"
  );
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

  const wsInterval = Number(process.env.WS_INTERVAL_MS ?? 4000);
  const interval = setInterval(() => {
    notifications += 1;
    socket.send(JSON.stringify({ type: "notification", payload: `Notification ${notifications}` }));
  }, wsInterval);

  const heartbeatInterval = Number(process.env.WS_HEARTBEAT_MS ?? 5000);
  const heartbeat = setInterval(() => {
    if (!isAlive) {
      socket.terminate();
      return;
    }
    isAlive = false;
    socket.ping();
  }, heartbeatInterval);

  socket.on("close", () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
});

const port = Number(process.env.PORT ?? 3001);
let grpcServer: StartedGrpcServer | undefined;

async function shutdown(): Promise<void> {
  if (grpcServer) {
    await grpcServer.shutdown();
    grpcServer = undefined;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  server.listen(port, async () => {
    console.log(`API server running on ${port}`);
    grpcServer = await startGrpcServer();
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown()
        .catch((error) => {
          console.error("Shutdown failure", error);
        })
        .finally(() => {
          process.exit(0);
        });
    });
  }
}

export { app, server, shutdown };
