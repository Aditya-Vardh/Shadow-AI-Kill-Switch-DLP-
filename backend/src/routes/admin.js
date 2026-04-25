/**
 * routes/admin.js — Admin CRUD operations
 */
const router = require("express").Router();
const { getUsers, updateUserRole } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

// GET /api/admin/users
router.get("/users", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN"]), async (req, res) => {
  try {
    const users = await getUsers(req.user.org_id || "default");
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// PATCH /api/admin/users/:id/role
router.patch("/users/:id/role", requireAuth, requireRole(["SUPER_ADMIN"]), async (req, res) => {
  try {
    const { role } = req.body;
    const updated = await updateUserRole(req.params.id, role, req.user.email);
    res.json({ ok: true, user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/dashboard — Summary for admin landing page
router.get("/dashboard", requireAuth, requireRole(["SUPER_ADMIN", "SECURITY_ADMIN", "AUDITOR"]), async (req, res) => {
  try {
    const { getAuditStats, getDailyTrend, getTopPatterns } = require("../db");
    const [stats, trend, patterns] = await Promise.all([
      getAuditStats(30),
      getDailyTrend(14),
      getTopPatterns(7)
    ]);
    res.json({ stats, trend, patterns });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

module.exports = router;
