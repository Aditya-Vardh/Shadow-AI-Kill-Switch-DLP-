/**
 * routes/health.js — Health check endpoint
 * Used by load balancers, K8s liveness/readiness probes, and monitoring.
 */
const router = require("express").Router();

router.get("/", async (req, res) => {
  const checks = {};

  try { const { pool } = require("../db"); await pool.query("SELECT 1"); checks.database = "ok"; }
  catch (err) { checks.database = `error: ${err.message}`; }

  try { const { redis } = require("../db"); await redis.ping(); checks.redis = "ok"; }
  catch (err) { checks.redis = `degraded: ${err.message}`; }

  const healthy = checks.database === "ok";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "degraded",
    checks,
    version: "3.0.0",
    phase: "Phase 4 — Backend & Admin",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
