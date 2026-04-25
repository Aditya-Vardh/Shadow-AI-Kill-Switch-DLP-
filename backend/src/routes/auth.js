/**
 * routes/auth.js — Authentication endpoints
 *
 * POST /api/auth/login    — Dev login (returns JWT); swap for SSO in production
 * GET  /api/auth/sso      — Initiate SAML/OAuth SSO flow
 * POST /api/auth/callback — SSO callback handler
 * GET  /api/auth/me       — Get current user info
 * POST /api/auth/logout   — Logout
 */
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { findOrCreateUser } = require("../db");
const { requireAuth, JWT_SECRET } = require("../middleware/auth");

// ─── Dev Login (swap for SSO in production) ──────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Direct login disabled in production. Use SSO." });
    }

    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Dev mode: any @corp.example.com gets SECURITY_ADMIN, others get AUDITOR
    const role = email.endsWith("@corp.example.com") ? "SECURITY_ADMIN" : "AUDITOR";
    const user = await findOrCreateUser(email, email.split("@")[0], null);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, org_id: user.org_id || "default" },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[Auth] Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── SSO Redirect (stub — implement with passport-saml or openid-client) ─────
router.get("/sso", (req, res) => {
  // TODO: Redirect to SAML IdP or OAuth authorization endpoint
  // Example: redirect to Okta, Azure AD, Google Workspace
  const ssoProvider = process.env.SSO_PROVIDER || "okta";
  res.json({
    message: "SSO integration pending",
    hint: `Configure ${ssoProvider} in environment variables. See DEPLOYMENT.md for setup instructions.`,
    providers: ["okta", "azure-ad", "google-workspace"]
  });
});

// ─── SSO Callback (stub) ─────────────────────────────────────────────────────
router.post("/callback", async (req, res) => {
  // TODO: Validate SAML assertion or exchange OAuth code for tokens
  // Extract user info from assertion, call findOrCreateUser, return JWT
  res.status(501).json({ error: "SSO callback not yet configured. See DEPLOYMENT.md." });
});

// ─── Get Current User ─────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ─── Logout ──────────────────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  // JWT is stateless; client should discard token. Add token blocklist for production.
  res.json({ ok: true });
});

module.exports = router;


// ─── routes/health.js ────────────────────────────────────────────────────────
// Separate file inline for simplicity
const healthRouter = require("express").Router();
const { pool, redis } = require("../db");

healthRouter.get("/", async (req, res) => {
  const checks = {};

  // DB check
  try {
    await pool.query("SELECT 1");
    checks.database = "ok";
  } catch (err) {
    checks.database = `error: ${err.message}`;
  }

  // Redis check
  try {
    await redis.ping();
    checks.redis = "ok";
  } catch (err) {
    checks.redis = `error: ${err.message}`;
  }

  const healthy = Object.values(checks).every(v => v === "ok");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "degraded",
    checks,
    version: process.env.npm_package_version || "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// Export health router too
module.exports._healthRouter = healthRouter;
