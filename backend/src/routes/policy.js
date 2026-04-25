/**
 * routes/policy.js — Policy sync endpoint
 * Extensions poll this every 5 minutes to get updated DLP rules.
 */
const router = require("express").Router();
const { getActivePolicy, updatePolicy } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

// GET /api/policy — Extension polls for current policy
router.get("/", async (req, res) => {
  try {
    const orgId = req.headers["x-org-id"] || "default";
    const policy = await getActivePolicy(orgId);
    res.json(policy);
  } catch (err) {
    console.error("[Policy] Fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch policy" });
  }
});

// PUT /api/policy — Admin updates policy
router.put("/", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN"]), async (req, res) => {
  try {
    const orgId = req.headers["x-org-id"] || req.user.org_id || "default";
    const { config, customPatterns } = req.body;
    if (!config) return res.status(400).json({ error: "Missing config" });

    const updated = await updatePolicy(orgId, config, customPatterns, req.user.email);

    // Broadcast updated policy to all connected extension WebSocket clients
    req.app.locals.broadcast?.({ type: "POLICY_UPDATE", payload: { ...config, customPatterns, version: updated.version } });

    res.json({ ok: true, version: updated.version });
  } catch (err) {
    console.error("[Policy] Update error:", err.message);
    res.status(500).json({ error: "Failed to update policy" });
  }
});

// GET /api/policy/history — Policy version history
router.get("/history", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN"]), async (req, res) => {
  try {
    const { pool } = require("../db");
    const { rows } = await pool.query(
      "SELECT id, version, org_id, created_by, created_at, is_active FROM policies ORDER BY created_at DESC LIMIT 20"
    );
    res.json({ versions: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch policy history" });
  }
});

module.exports = router;
