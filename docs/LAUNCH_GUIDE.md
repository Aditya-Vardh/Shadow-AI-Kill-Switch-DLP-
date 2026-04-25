# Shadow AI DLP — Complete Launch & Operations Guide
## All 5 Phases Complete

---

## What Was Built

```
shadow-ai-dlp-final/
├── extension/          ← Chrome/Edge browser extension (Phases 1–3)
│   ├── manifest.json
│   ├── src/
│   │   ├── content/    ← Injected into AI chat pages
│   │   ├── background/ ← Service worker
│   │   └── popup/      ← Extension popup + settings
│   └── icons/
├── backend/            ← Policy Server API (Phase 4)
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js       ← PostgreSQL + Redis
│   │   └── routes/     ← events, policy, admin, auth
│   ├── Dockerfile
│   └── package.json
├── admin/              ← Admin Dashboard React SPA (Phase 5)
│   └── public/
│       └── index.html  ← Standalone, no build step needed
├── docs/
│   └── LAUNCH_GUIDE.md ← This file
└── docker-compose.yml
```

---

## PART 1 — Load the Browser Extension (2 minutes)

### Step 1: Open Chrome Extension Manager
Open Chrome or Edge and go to:
```
chrome://extensions/
```
(Edge: `edge://extensions/`)

### Step 2: Enable Developer Mode
Toggle **"Developer mode"** ON — top-right of the page.

### Step 3: Load the Extension
Click **"Load unpacked"** → navigate to and select the `extension/` folder.

The 🛡️ DLP icon will appear in your Chrome toolbar.

### Step 4: Test It Works
1. Go to [chat.openai.com](https://chat.openai.com) (or claude.ai, gemini.google.com, etc.)
2. A small **"🛡️ DLP Active"** badge appears in the bottom-right corner of the page
3. Try pasting this test prompt:
   ```
   My AWS key is AKIAIOSFODNN7EXAMPLE and password = hunter2
   ```
4. The extension will intercept, redact the key and password, and show a toast notification
5. Click **"👁 View what was removed"** in the toast to see exactly what was redacted

### Supported AI Platforms (auto-detected)
- ChatGPT — chat.openai.com, chatgpt.com
- Claude — claude.ai
- Google Gemini — gemini.google.com
- Microsoft Copilot — copilot.microsoft.com
- Perplexity AI — perplexity.ai
- Poe — poe.com
- Character.AI — character.ai
- HuggingFace Chat — huggingface.co/chat

---

## PART 2 — Open the Admin Dashboard (1 minute)

The dashboard is a single HTML file — **no build step, no server required** for basic use.

### Option A: Open directly in browser
```bash
# Open the file in Chrome
open admin/public/index.html

# Or on Windows:
start admin/public/index.html
```

### Option B: Serve via Python (recommended — enables API proxy)
```bash
cd admin/public
python3 -m http.server 3001
# Then open: http://localhost:3001
```

### Logging In
- Default email: `admin@corp.example.com`
- Password: anything (demo mode bypasses auth when backend is offline)
- Click **Sign In**

### Dashboard Features
| Page | What You Can Do |
|------|-----------------|
| **Dashboard** | 30-day stats, risk distribution pie chart, event volume trend, top triggered patterns |
| **Live Events** | Real-time event feed with platform/risk/action filters, live update toggle (simulates events every 8–12s in demo) |
| **Analytics** | Events by platform, hourly heatmap, blocked vs redacted 14-day trend |
| **Policy Manager** | Set risk-level actions (BLOCK/REDACT/WARN/ALLOW), toggle detection categories, test patterns in playground |
| **Users & Roles** | View and change user roles (SUPER_ADMIN / SECURITY_ADMIN / AUDITOR / END_USER) |
| **Compliance Export** | Download CSV audit log, GDPR/HIPAA/SOC 2 report templates |

---

## PART 3 — Run the Policy Server Backend (Docker)

This enables: real audit log persistence, policy sync to all extensions, live WebSocket dashboard updates.

### Prerequisites
- Docker Desktop installed: https://www.docker.com/products/docker-desktop/
- Docker Compose (included with Docker Desktop)

### Start everything
```bash
cd shadow-ai-dlp-final
docker compose up
```

This starts:
- **Policy Server** → http://localhost:3000
- **PostgreSQL** → localhost:5432
- **Redis** → localhost:6379

First run takes ~60 seconds to pull images. After that, startup is ~5 seconds.

### Verify it's running
```bash
# Health check
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","checks":{"database":"ok","redis":"ok"}}
```

### Initialize the database schema
```bash
# On first run:
docker compose exec policy-server node -e "require('./src/db').initSchema()"
```

### Stop it
```bash
docker compose down        # Stop containers (keeps data)
docker compose down -v     # Stop and DELETE all data
```

---

## PART 4 — Connect Extension to Policy Server

Edit `extension/src/background/worker.js` lines 7–8:

```javascript
const POLICY_SERVER_URL = "http://localhost:3000";
const EXTENSION_TOKEN = "dev-extension-secret";
```

Then reload the extension:
1. Go to `chrome://extensions/`
2. Click the **↺ refresh** icon on the DLP extension

Now the extension will:
- Sync policy every 5 minutes (or on demand via popup → Settings)
- Send anonymized audit events to the server
- Receive policy updates pushed via WebSocket

---

## PART 5 — Connect Dashboard to Live Backend

When the backend is running, the dashboard will automatically fetch real data.

The dashboard's `apiFetch()` function proxies to `http://localhost:3000` when on localhost.

### Dev Login (get a real JWT)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@corp.example.com","password":"any"}'
```

Returns: `{"token":"eyJ...","user":{...}}`

Paste the token into the admin dashboard login or use it in API calls:
```bash
# List recent events
curl http://localhost:3000/api/events \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get stats
curl http://localhost:3000/api/events/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get current policy
curl http://localhost:3000/api/policy
```

---

## PART 6 — Extension Popup & Settings

Click the 🛡️ icon in the Chrome toolbar to open the popup.

### Popup Controls
- **ON/OFF Toggle** — Pause DLP on the current page
- **Stats** — Prompts scanned / items redacted / prompts blocked this session
- **Recent Events** — Last 6 DLP events with risk levels
- **Clear Stats** — Reset session counters
- **Settings** — Opens the full settings page

### Settings Page (click ⚙️ Settings in popup)
Organized into 4 tabs:
1. **Policy** — Set risk actions, enable server sync, enter Policy Server URL
2. **Categories** — Toggle individual detection categories on/off
3. **Custom Patterns** — Add org-specific keywords, regexes (project names, internal URLs)
4. **Audit Log** — View full event history, export to CSV

### Adding Custom Patterns (Example: blocking internal project names)
1. Open Settings → **Custom Patterns** tab
2. Click **+ Add Pattern**
3. Fill in:
   - **ID**: `project_falcon`
   - **Label**: `Project Falcon (Internal)`
   - **Type**: `keyword`
   - **Pattern**: `Project Falcon`
   - **Severity**: `HIGH`
4. Click **Add** → **Save All**
5. Now any prompt containing "Project Falcon" triggers a HIGH warning

---

## PART 7 — How Detection Works

When you type or paste into an AI chat input and press Enter or click Send:

```
User types/pastes text
        ↓
Content Script intercepts (keydown/paste/click)
        ↓
normalizeText() — decode base64, URL encoding, Unicode lookalikes (evasion defense)
        ↓
Layer 1: Regex patterns (50+ patterns — API keys, PII, credentials, financial)
        ↓
Layer 2: Heuristic NER (names, addresses, medical IDs, financial context)
        ↓
Layer 3: Context analyzer (false positive suppression, severity upgrades)
        ↓
Layer 4: Custom patterns (your org-specific keywords)
        ↓
Risk level computed: NONE / LOW / MEDIUM / HIGH / CRITICAL
        ↓
Policy action: ALLOW / WARN / REDACT / BLOCK
        ↓
REDACT: Sensitive spans replaced with [REDACTED-TYPE] tokens
BLOCK: Mandatory acknowledgment modal (5-second countdown)
        ↓
Redacted text re-submitted to AI
        ↓
Anonymized audit event (NO raw data) → background worker → Policy Server
```

### What Gets Detected

| Category | Examples |
|----------|---------|
| API Keys | AWS (AKIA…), GitHub (ghp_…), OpenAI (sk-proj-…), Stripe, Slack, JWT |
| Credentials | Passwords in text, DB connection strings, Basic auth headers |
| PII — Personal | Email, SSN, phone, passport, date of birth, IP address |
| PII — Medical | MRN, patient IDs, PHI context (3+ medical terms) |
| Financial | Credit cards (Luhn-validated), IBAN, CVV |
| Code Secrets | .env variables, bearer tokens, SSH/PEM private keys |
| Trade Secrets | Custom keywords, internal URLs, M&A language |
| Context Signals | Database dumps, source code, bulk PII (5+ emails) |
| Entropy Scanner | High-entropy strings that look like API keys (catches unknown formats) |

---

## PART 8 — Enterprise Deployment

### Force-Install via Chrome Group Policy (Windows)
1. Create a Chrome policy file at:
   `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist`
2. Add value: `1` = `EXTENSION_ID;https://your-update-server.com/update.xml`

### Force-Install via MDM (macOS/Jamf)
```xml
<key>ExtensionInstallForcelist</key>
<array>
  <string>EXTENSION_ID;https://your-update-server.com/update.xml</string>
</array>
```

### Deploy Policy Server to Production
```bash
# Set environment variables in production
DATABASE_URL=postgresql://user:pass@db.prod:5432/dlp_audit
REDIS_URL=redis://redis.prod:6379
JWT_SECRET=your-strong-random-secret-here
EXTENSION_SHARED_SECRET=your-extension-token-here
ADMIN_ORIGIN=https://dlp-admin.corp.example.com
NODE_ENV=production

# Build and run
docker compose -f docker-compose.prod.yml up -d
```

### SSO Integration (Okta/Azure AD/Google)
In `backend/src/routes/auth.js`, the SSO callback stub is at `POST /api/auth/callback`.

**For Okta:** Use `passport-openidconnect` or `openid-client`:
```bash
npm install openid-client
```

**For Azure AD:** Use `@azure/msal-node`:
```bash
npm install @azure/msal-node
```

See `backend/src/routes/auth.js` for the integration point comments.

---

## PART 9 — Audit Log Integrity Verification

The audit log uses SHA-256 hash chaining. Every row contains:
- `prev_hash` — the hash of the previous row
- `row_hash` — SHA-256 of this row's content + prev_hash

To verify the chain hasn't been tampered with:
```bash
curl http://localhost:3000/api/events/integrity \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected:
# {"checked":150,"violations":0,"intact":true}
```

If `violations > 0`, an audit event has been modified or deleted — security incident.

---

## PART 10 — Phase 5 Hardening Checklist

Before production deployment, complete these Phase 5 items:

### Extension Security
- [ ] Replace `document.execCommand` with Clipboard API where supported
- [ ] Add Content Security Policy to popup HTML pages
- [ ] Enable certificate pinning for Policy Server requests
- [ ] Run adversarial prompt tests (see `docs/adversarial-tests.md`)

### Backend Security
- [ ] Replace dev JWT secret with 256-bit random secret
- [ ] Enable TLS (HTTPS) — never run on plain HTTP in production
- [ ] Add token blocklist to Redis for JWT revocation
- [ ] Configure CORS to only allow your admin domain
- [ ] Run `npm audit` and patch all high/critical vulnerabilities
- [ ] Deploy behind a reverse proxy (nginx) with rate limiting
- [ ] Set up Datadog/Grafana alerts on CRITICAL event spikes

### Compliance
- [ ] Run SOC 2 Type I gap analysis using the audit evidence package
- [ ] Configure GDPR data retention — auto-purge events older than 90 days
- [ ] Document all data flows for Article 30 ROPA

---

## Quick Reference — API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/events | Extension token | Submit DLP audit event |
| GET | /api/events | Admin JWT | List events with filters |
| GET | /api/events/stats | Admin JWT | 30-day statistics |
| GET | /api/events/trend | Admin JWT | Daily event trend |
| GET | /api/events/patterns | Admin JWT | Top pattern categories |
| GET | /api/events/integrity | Admin JWT | Chain integrity check |
| GET | /api/events/export | Admin JWT | CSV compliance export |
| GET | /api/policy | Extension token | Get active policy |
| PUT | /api/policy | Security Admin | Update policy |
| GET | /api/admin/dashboard | Admin JWT | Dashboard aggregates |
| GET | /api/admin/users | Security Admin | List users |
| PATCH | /api/admin/users/:id/role | Super Admin | Change user role |
| POST | /api/auth/login | — | Get JWT (dev only) |
| GET | /health | — | Health check |
| WS | /ws | — | Real-time push |

---

## Troubleshooting

**Extension not detecting anything**
→ Check that the extension is enabled (popup should show "🛡️ DLP Active")
→ Reload the extension at `chrome://extensions/`
→ Check the browser console for `[DLP]` messages

**"DLP Active" badge not showing**
→ The page may have loaded before the extension injected — refresh the AI platform page

**Block modal appears but won't dismiss**
→ Wait for the 5-second countdown — this is intentional. Then click "I Understand"

**Backend not starting**
→ Ensure Docker Desktop is running
→ Run `docker compose logs policy-server` to see error messages
→ Common issue: port 5432 already in use (another PostgreSQL) — change in docker-compose.yml

**Dashboard shows mock data even with backend running**
→ The dashboard uses mock data in demo mode. When you sign in with a real JWT (from `/api/auth/login`), it will switch to live API calls.
