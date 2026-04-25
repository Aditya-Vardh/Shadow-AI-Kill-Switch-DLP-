/**
 * middleware/auth.js — JWT-based auth middleware
 *
 * In production, this integrates with SAML 2.0 / OAuth 2.0 SSO providers
 * (Okta, Azure AD, Google Workspace). For development, accepts signed JWTs.
 */
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-in-production";

/**
 * Verify JWT from Authorization header.
 * In production: validate against SAML assertion or OAuth token introspection.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * RBAC role check. Pass an array of allowed roles.
 * Roles: SUPER_ADMIN > SECURITY_ADMIN > AUDITOR > END_USER
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions", required: allowedRoles });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, JWT_SECRET };
