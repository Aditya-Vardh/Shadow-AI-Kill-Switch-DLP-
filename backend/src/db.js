/**
 * db.js — Database layer
 * PostgreSQL for persistent storage, Redis for caching & pub/sub.
 *
 * Tables:
 *   audit_events  — Tamper-evident DLP event log
 *   policies      — Per-department/org policy configurations
 *   users         — Admin users with RBAC roles
 *   allowlist     — Per-user approved contexts
 */

const { Pool } = require("pg");
const { createClient } = require("redis");
const crypto = require("crypto");

// ─── PostgreSQL ──────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://dlp:dlp@localhost:5432/dlp_audit",
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on("error", (err) => { console.error("[DB] Pool error:", err.message); });

// ─── Redis ───────────────────────────────────────────────────────────────────
const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) }
});

redis.on("error", (err) => { console.error("[Redis] Error:", err.message); });
redis.connect().catch(err => console.warn("[Redis] Could not connect (proceeding without cache):", err.message));

const POLICY_CACHE_TTL = 300; // 5 minutes

// ─── Schema Initialization ───────────────────────────────────────────────────
async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id            SERIAL PRIMARY KEY,
        event_id      VARCHAR(64) UNIQUE NOT NULL,
        timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        platform      VARCHAR(64),
        platform_name VARCHAR(128),
        user_id       VARCHAR(256),
        department    VARCHAR(128),
        action        VARCHAR(32) NOT NULL,
        risk_level    VARCHAR(16) NOT NULL,
        finding_count INTEGER NOT NULL DEFAULT 0,
        categories    JSONB,
        trigger       VARCHAR(64),
        url           VARCHAR(512),
        tab_id        INTEGER,
        policy_version INTEGER,
        prev_hash     VARCHAR(64),
        row_hash      VARCHAR(64) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_risk ON audit_events(risk_level);
      CREATE INDEX IF NOT EXISTS idx_audit_platform ON audit_events(platform);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(user_id);

      CREATE TABLE IF NOT EXISTS policies (
        id              SERIAL PRIMARY KEY,
        version         INTEGER NOT NULL DEFAULT 1,
        org_id          VARCHAR(128) NOT NULL DEFAULT 'default',
        department      VARCHAR(128) DEFAULT NULL,
        config          JSONB NOT NULL,
        custom_patterns JSONB DEFAULT '[]',
        created_by      VARCHAR(256),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE INDEX IF NOT EXISTS idx_policy_org ON policies(org_id, is_active);

      CREATE TABLE IF NOT EXISTS users (
        id              SERIAL PRIMARY KEY,
        email           VARCHAR(256) UNIQUE NOT NULL,
        name            VARCHAR(256),
        role            VARCHAR(32) NOT NULL DEFAULT 'AUDITOR',
        org_id          VARCHAR(128) NOT NULL DEFAULT 'default',
        department      VARCHAR(128),
        sso_subject     VARCHAR(512),
        last_login      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS allowlist (
        id              SERIAL PRIMARY KEY,
        user_id         VARCHAR(256) NOT NULL,
        category        VARCHAR(64) NOT NULL,
        reason          TEXT,
        expires_at      TIMESTAMPTZ,
        granted_by      VARCHAR(256),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_allowlist_user ON allowlist(user_id);
    `);

    // Seed default policy if none exists
    const { rows } = await client.query("SELECT id FROM policies WHERE org_id = 'default' AND is_active = TRUE LIMIT 1");
    if (rows.length === 0) {
      await client.query(
        "INSERT INTO policies (org_id, version, config, created_by) VALUES ($1, $2, $3, $4)",
        ["default", 1, JSON.stringify(DEFAULT_POLICY), "system"]
      );
      console.log("[DB] Default policy seeded");
    }

    console.log("[DB] Schema initialized");
  } catch (err) {
    console.error("[DB] Schema init failed:", err.message);
  } finally {
    client.release();
  }
}

const DEFAULT_POLICY = {
  enabled: true,
  evasionDetect: true,
  contextAnalysis: true,
  nerEnabled: true,
  actions: { CRITICAL: "BLOCK", HIGH: "REDACT", MEDIUM: "WARN", LOW: "WARN" },
  enabledCategories: ["API_KEY", "CREDENTIAL", "PII", "FINANCIAL", "CODE_SECRET", "TRADE_SECRET", "CONTEXT"]
};

// ─── Audit Log Functions ──────────────────────────────────────────────────────

/**
 * Insert an audit event with tamper-evident hash chaining.
 * Each row hashes its content + the previous row's hash, creating an unbreakable chain.
 */
async function insertAuditEvent(event) {
  const client = await pool.connect();
  try {
    // Get previous row's hash for chain integrity
    const { rows: prevRows } = await client.query(
      "SELECT row_hash FROM audit_events ORDER BY id DESC LIMIT 1"
    );
    const prevHash = prevRows[0]?.row_hash || "GENESIS";

    // Compute this row's hash
    const hashInput = JSON.stringify({
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: event.platform,
      action: event.action,
      risk_level: event.riskLevel,
      finding_count: event.findingCount,
      prev_hash: prevHash
    });
    const rowHash = crypto.createHash("sha256").update(hashInput).digest("hex");

    const { rows } = await client.query(
      `INSERT INTO audit_events
        (event_id, timestamp, platform, platform_name, user_id, department, action,
         risk_level, finding_count, categories, trigger, url, tab_id, policy_version, prev_hash, row_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        event.event_id, event.timestamp, event.platform, event.platformName,
        event.userId || "anonymous", event.department || null,
        event.action, event.riskLevel, event.findingCount,
        JSON.stringify(event.categories || []),
        event.trigger, event.url, event.tabId, event.policyVersion || 1,
        prevHash, rowHash
      ]
    );
    return rows[0];
  } finally {
    client.release();
  }
}

async function getAuditEvents({ limit = 100, offset = 0, platform, riskLevel, userId, startDate, endDate } = {}) {
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (platform) { conditions.push(`platform = $${paramIdx++}`); params.push(platform); }
  if (riskLevel) { conditions.push(`risk_level = $${paramIdx++}`); params.push(riskLevel); }
  if (userId) { conditions.push(`user_id = $${paramIdx++}`); params.push(userId); }
  if (startDate) { conditions.push(`timestamp >= $${paramIdx++}`); params.push(startDate); }
  if (endDate) { conditions.push(`timestamp <= $${paramIdx++}`); params.push(endDate); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT * FROM audit_events ${where} ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    params
  );
  return rows;
}

async function getAuditStats(days = 30) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE risk_level = 'CRITICAL') AS critical_count,
      COUNT(*) FILTER (WHERE risk_level = 'HIGH')     AS high_count,
      COUNT(*) FILTER (WHERE risk_level = 'MEDIUM')   AS medium_count,
      COUNT(*) FILTER (WHERE risk_level = 'LOW')      AS low_count,
      COUNT(*) FILTER (WHERE action = 'BLOCK')        AS blocked_count,
      COUNT(*) FILTER (WHERE action = 'REDACT')       AS redacted_count,
      COUNT(DISTINCT platform)                        AS platforms_active,
      COUNT(DISTINCT user_id)                         AS users_active,
      COUNT(*)                                        AS total_events
    FROM audit_events
    WHERE timestamp >= NOW() - INTERVAL '${days} days'
  `);
  return rows[0];
}

async function getTopPatterns(days = 7, limit = 10) {
  const { rows } = await pool.query(`
    SELECT
      c->>'category' AS category,
      c->>'severity' AS severity,
      COUNT(*) AS count
    FROM audit_events,
         jsonb_array_elements(categories) AS c
    WHERE timestamp >= NOW() - INTERVAL '${days} days'
    GROUP BY category, severity
    ORDER BY count DESC
    LIMIT ${limit}
  `);
  return rows;
}

async function getDailyTrend(days = 30) {
  const { rows } = await pool.query(`
    SELECT
      DATE(timestamp) AS date,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE risk_level = 'CRITICAL') AS critical,
      COUNT(*) FILTER (WHERE risk_level = 'HIGH')     AS high,
      COUNT(*) FILTER (WHERE action = 'BLOCK')        AS blocked
    FROM audit_events
    WHERE timestamp >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE(timestamp)
    ORDER BY date ASC
  `);
  return rows;
}

// ─── Policy Functions ─────────────────────────────────────────────────────────
async function getActivePolicy(orgId = "default") {
  // Try Redis cache first
  try {
    const cached = await redis.get(`policy:${orgId}`);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  const { rows } = await pool.query(
    "SELECT * FROM policies WHERE org_id = $1 AND is_active = TRUE ORDER BY version DESC LIMIT 1",
    [orgId]
  );

  if (rows.length === 0) return { ...DEFAULT_POLICY, version: 1 };

  const policy = { ...rows[0].config, customPatterns: rows[0].custom_patterns, version: rows[0].version };

  // Cache it
  try { await redis.setEx(`policy:${orgId}`, POLICY_CACHE_TTL, JSON.stringify(policy)); } catch (_) {}

  return policy;
}

async function updatePolicy(orgId, config, customPatterns, userId) {
  const client = await pool.connect();
  try {
    // Deactivate old policy
    await client.query("UPDATE policies SET is_active = FALSE WHERE org_id = $1", [orgId]);

    // Get next version number
    const { rows: vRows } = await client.query(
      "SELECT MAX(version) AS max_version FROM policies WHERE org_id = $1",
      [orgId]
    );
    const nextVersion = (vRows[0].max_version || 0) + 1;

    const { rows } = await client.query(
      "INSERT INTO policies (org_id, version, config, custom_patterns, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [orgId, nextVersion, JSON.stringify(config), JSON.stringify(customPatterns || []), userId]
    );

    // Invalidate cache
    try { await redis.del(`policy:${orgId}`); } catch (_) {}

    return rows[0];
  } finally {
    client.release();
  }
}

// ─── User Functions ───────────────────────────────────────────────────────────
async function findOrCreateUser(email, name, ssoSubject, orgId = "default") {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE email = $1 AND is_active = TRUE",
    [email]
  );

  if (rows.length > 0) {
    await pool.query("UPDATE users SET last_login = NOW(), name = $1 WHERE email = $2", [name, email]);
    return rows[0];
  }

  const { rows: newRows } = await pool.query(
    "INSERT INTO users (email, name, role, org_id, sso_subject, last_login) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *",
    [email, name, "AUDITOR", orgId, ssoSubject]
  );
  return newRows[0];
}

async function getUsers(orgId = "default") {
  const { rows } = await pool.query(
    "SELECT id, email, name, role, department, last_login, created_at FROM users WHERE org_id = $1 AND is_active = TRUE ORDER BY created_at DESC",
    [orgId]
  );
  return rows;
}

async function updateUserRole(userId, role, grantedBy) {
  const VALID_ROLES = ["SUPER_ADMIN", "SECURITY_ADMIN", "AUDITOR", "END_USER"];
  if (!VALID_ROLES.includes(role)) throw new Error("Invalid role");
  const { rows } = await pool.query(
    "UPDATE users SET role = $1 WHERE id = $2 RETURNING *",
    [role, userId]
  );
  return rows[0];
}

// ─── Integrity Verification ────────────────────────────────────────────────────
async function verifyChainIntegrity(limit = 100) {
  const { rows } = await pool.query(
    "SELECT * FROM audit_events ORDER BY id ASC LIMIT $1",
    [limit]
  );

  let violations = 0;
  let prevHash = "GENESIS";

  for (const row of rows) {
    // Recompute hash
    const hashInput = JSON.stringify({
      event_id: row.event_id,
      timestamp: row.timestamp.toISOString(),
      platform: row.platform,
      action: row.action,
      risk_level: row.risk_level,
      finding_count: row.finding_count,
      prev_hash: prevHash
    });
    const expectedHash = crypto.createHash("sha256").update(hashInput).digest("hex");

    if (row.prev_hash !== prevHash || row.row_hash !== expectedHash) {
      violations++;
      console.error(`[Integrity] Violation at event_id: ${row.event_id}`);
    }

    prevHash = row.row_hash;
  }

  return { checked: rows.length, violations, intact: violations === 0 };
}

// ─── Export ───────────────────────────────────────────────────────────────────
module.exports = {
  pool, redis,
  initSchema,
  insertAuditEvent,
  getAuditEvents,
  getAuditStats,
  getTopPatterns,
  getDailyTrend,
  getActivePolicy,
  updatePolicy,
  findOrCreateUser,
  getUsers,
  updateUserRole,
  verifyChainIntegrity,
  DEFAULT_POLICY
};
