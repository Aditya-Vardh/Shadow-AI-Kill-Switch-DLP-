/**
 * Shadow AI DLP — Policy Server
 * Phase 4: Backend & Admin
 *
 * Architecture:
 *   - REST API for policy sync, audit event ingestion, admin CRUD
 *   - PostgreSQL for audit logs + policy storage
 *   - Redis for policy caching + real-time pub/sub
 *   - WebSocket for live event push to admin dashboard
 *   - SAML 2.0 / OAuth 2.0 SSO integration hooks
 *   - Tamper-evident audit log chain (SHA-256 hash chaining)
 *   - RBAC: Super Admin, Security Admin, Auditor, End User
 */

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    }
  }
}));

app.use(cors({
  origin: process.env.ADMIN_ORIGIN || "http://localhost:3001",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Extension-Token"]
}));

app.use(express.json({ limit: "100kb" }));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, message: { error: "Rate limit exceeded" } });
const eventLimiter = rateLimit({ windowMs: 60 * 1000, max: 1000, message: { error: "Rate limit exceeded" } });

app.use("/api/events", eventLimiter);
app.use("/api/", apiLimiter);

// ─── Routes ─────────────────────────────────────────────────────────────────
const eventsRouter = require("./routes/events");
const policyRouter = require("./routes/policy");
const adminRouter  = require("./routes/admin");
const authRouter   = require("./routes/auth");
const healthRouter = require("./routes/health");

app.use("/api/events",  eventsRouter);
app.use("/api/policy",  policyRouter);
app.use("/api/admin",   adminRouter);
app.use("/api/auth",    authRouter);
app.use("/health",      healthRouter);

// ─── WebSocket Server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: "/ws" });
const wsClients = new Set();

wss.on("connection", (ws, req) => {
  // TODO: Validate auth token from query string in production
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
  ws.on("error", () => wsClients.delete(ws));
  ws.send(JSON.stringify({ type: "CONNECTED", message: "DLP Policy Server WebSocket active" }));
});

/**
 * Broadcast a message to all connected WebSocket clients.
 * Used to push real-time DLP events to the admin dashboard.
 */
function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  }
}

// Export broadcast so routes can use it
app.locals.broadcast = broadcast;

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Server Error]", err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[DLP Policy Server] Running on port ${PORT}`);
  console.log(`[DLP Policy Server] WebSocket listening at ws://localhost:${PORT}/ws`);
  console.log(`[DLP Policy Server] Environment: ${process.env.NODE_ENV || "development"}`);
});

module.exports = { app, server, broadcast };
