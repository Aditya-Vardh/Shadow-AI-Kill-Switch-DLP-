/**
 * routes/events.js — Audit event ingestion from browser extensions
 *
 * POST /api/events      — Extension submits a DLP event (anonymized metadata only)
 * GET  /api/events      — Admin retrieves event list (auth required)
 * GET  /api/events/stats — Dashboard stats summary
 * GET  /api/events/trend — Daily trend data
 * GET  /api/events/patterns — Top triggered patterns
 * GET  /api/events/integrity — Verify audit chain integrity
 * GET  /api/events/export — CSV export for compliance
 */

const router = require("express").Router();
const crypto = require("crypto");
const { insertAuditEvent, getAuditEvents, getAuditStats, getDailyTrend, getTopPatterns, verifyChainIntegrity } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

// ─── Extension Token Validation ──────────────────────────────────────────────
/**
 * Validate that an event submission comes from a trusted extension installation.
 * In production, use certificate pinning + signed tokens. This is a simplified version.
 */
function validateExtensionToken(req) {
  const token = req.headers["x-extension-token"];
  if (!token) return true; // Allow unauthenticated in dev mode; enforce in production
  const expectedToken = process.env.EXTENSION_SHARED_SECRET;
  if (!expectedToken) return true;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
}

// ─── POST /api/events — Ingest audit event from browser extension ────────────
router.post("/", async (req, res) => {
  try {
    if (!validateExtensionToken(req)) {
      return res.status(401).json({ error: "Invalid extension token" });
    }

    const {
      platform, platformName, trigger, action, riskLevel,
      findingCount, categories, timestamp, url, tabId
    } = req.body;

    // Validate required fields
    if (!action || !riskLevel) {
      return res.status(400).json({ error: "Missing required fields: action, riskLevel" });
    }

    // Validate enums
    const VALID_ACTIONS = ["BLOCK", "REDACT", "WARN", "ALLOW"];
    const VALID_RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];
    if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ error: "Invalid action" });
    if (!VALID_RISK_LEVELS.includes(riskLevel)) return res.status(400).json({ error: "Invalid riskLevel" });

    // Validate categories (no raw sensitive data should be here — only category names + severities)
    const sanitizedCategories = (categories || []).map(c => ({
      category: String(c.category || "").slice(0, 64),
      severity: String(c.severity || "").slice(0, 16)
    })).slice(0, 20);

    const event = {
      event_id: `dlp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      timestamp: timestamp || new Date().toISOString(),
      platform: String(platform || "unknown").slice(0, 64),
      platformName: String(platformName || "").slice(0, 128),
      userId: req.headers["x-user-id"] || "anonymous",
      action,
      riskLevel,
      findingCount: Math.max(0, parseInt(findingCount) || 0),
      categories: sanitizedCategories,
      trigger: String(trigger || "").slice(0, 64),
      url: String(url || "").slice(0, 512),
      tabId: tabId ? parseInt(tabId) : null
    };

    const saved = await insertAuditEvent(event);

    // Real-time broadcast to admin dashboard via WebSocket
    req.app.locals.broadcast?.({
      type: "NEW_EVENT",
      payload: { ...event, id: saved.id }
    });

    res.status(202).json({ ok: true, id: saved.event_id });
  } catch (err) {
    console.error("[Events] Insert error:", err.message);
    res.status(500).json({ error: "Failed to record event" });
  }
});

// ─── GET /api/events — Retrieve event list (admin only) ─────────────────────
router.get("/", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN", "AUDITOR"]), async (req, res) => {
  try {
    const {
      limit = 100, offset = 0,
      platform, riskLevel, userId,
      startDate, endDate
    } = req.query;

    const events = await getAuditEvents({
      limit: Math.min(500, parseInt(limit)),
      offset: parseInt(offset),
      platform, riskLevel, userId,
      startDate, endDate
    });

    res.json({ events, count: events.length });
  } catch (err) {
    console.error("[Events] Fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ─── GET /api/events/stats ───────────────────────────────────────────────────
router.get("/stats", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN", "AUDITOR"]), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = await getAuditStats(days);
    res.json({ stats, period_days: days });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── GET /api/events/trend ───────────────────────────────────────────────────
router.get("/trend", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN", "AUDITOR"]), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const trend = await getDailyTrend(days);
    res.json({ trend, period_days: days });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch trend" });
  }
});

// ─── GET /api/events/patterns ────────────────────────────────────────────────
router.get("/patterns", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN", "AUDITOR"]), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const patterns = await getTopPatterns(days);
    res.json({ patterns, period_days: days });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch patterns" });
  }
});

// ─── GET /api/events/integrity — Tamper detection ────────────────────────────
router.get("/integrity", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN"]), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 1000;
    const result = await verifyChainIntegrity(limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Integrity check failed" });
  }
});

// ─── GET /api/events/export — CSV compliance export ──────────────────────────
router.get("/export", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN", "AUDITOR"]), async (req, res) => {
  try {
    const events = await getAuditEvents({ limit: 10000, ...req.query });

    const header = "event_id,timestamp,platform,platform_name,action,risk_level,finding_count,categories,trigger,url,row_hash\n";
    const rows = events.map(e => [
      e.event_id,
      e.timestamp,
      e.platform,
      e.platform_name,
      e.action,
      e.risk_level,
      e.finding_count,
      JSON.stringify(e.categories),
      e.trigger,
      e.url,
      e.row_hash
    ].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="dlp-audit-${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

module.exports = router;
