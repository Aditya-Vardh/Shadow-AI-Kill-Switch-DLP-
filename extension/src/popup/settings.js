(function(){

// ── src/popup/settings.js ──
/**
 * settings.js — Settings page logic
 */

const RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const ACTIONS = ["BLOCK", "REDACT", "WARN", "ALLOW"];

const CATEGORIES = [
  { id: "API_KEY",     label: "API Keys & Tokens",     icon: "🔑", desc: "AWS, GitHub, OpenAI, Stripe, Google, Slack keys" },
  { id: "CREDENTIAL",  label: "Credentials",            icon: "🔐", desc: "Passwords, DB connection strings, auth headers" },
  { id: "PII",         label: "Personal Info (PII)",    icon: "👤", desc: "Names, SSN, email, phone, address, passport, employee IDs" },
  { id: "FINANCIAL",   label: "Financial Data",          icon: "💳", desc: "Credit cards (Luhn-validated), IBAN, CVV, bank accounts" },
  { id: "CODE_SECRET", label: "Code Secrets",           icon: "💻", desc: ".env variables, bearer tokens, SSH/PEM private keys" },
  { id: "TRADE_SECRET",label: "Trade Secrets",          icon: "🏢", desc: "Custom org keywords, internal URLs, project names" },
  { id: "CONTEXT",     label: "Context Signals",        icon: "🧠", desc: "M&A activity, bulk PII, database dumps, PHI context" }
];

const DEFAULT_POLICY = {
  enabled: true,
  evasionDetect: true,
  contextAnalysis: true,
  nerEnabled: true,
  serverSync: false,
  serverUrl: "",
  actions: { CRITICAL: "BLOCK", HIGH: "REDACT", MEDIUM: "WARN", LOW: "WARN" },
  enabledCategories: CATEGORIES.map(c => c.id)
};

let config = { ...DEFAULT_POLICY };
let customPatterns = [];

async function init() {
  const stored = await chrome.storage.sync.get(["policyConfig", "customPatterns", "siteOverrides"]);
  config = { ...DEFAULT_POLICY, ...(stored.policyConfig || {}) };
  customPatterns = stored.customPatterns || [];

  renderPolicyPage();
  renderCategories();
  renderCustomPatterns();
  renderAuditLog();
  renderSiteManagement(stored.siteOverrides || {});  // Phase 3
  setupNav();
  setupSave();
  updateAboutPatternCount();
}

// ─── Nav ──────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
      item.classList.add("active");
      document.getElementById(`page-${item.dataset.page}`).classList.add("active");
      if (item.dataset.page === "auditlog") renderAuditLog();
    });
  });
}

// ─── Policy Page ──────────────────────────────────────────────────────
function renderPolicyPage() {
  // Risk action rows
  const container = document.getElementById("actionRows");
  container.innerHTML = RISK_LEVELS.map(level => `
    <div class="action-row">
      <div class="risk-label">
        <span class="tag ${level.toLowerCase()}">${level}</span>
      </div>
      <select id="action_${level}">
        ${ACTIONS.map(a => `<option value="${a}" ${config.actions[level] === a ? "selected" : ""}>${a}</option>`).join("")}
      </select>
    </div>
  `).join("");

  // General toggles
  document.getElementById("globalEnabled").checked  = config.enabled;
  document.getElementById("evasionDetect").checked  = config.evasionDetect;
  document.getElementById("contextAnalysis").checked = config.contextAnalysis;
  document.getElementById("nerEnabled").checked      = config.nerEnabled;
  document.getElementById("serverSync").checked      = config.serverSync;
  document.getElementById("serverUrl").value         = config.serverUrl || "";
}

// ─── Categories ───────────────────────────────────────────────────────
function renderCategories() {
  const container = document.getElementById("categoryToggles");
  container.innerHTML = CATEGORIES.map(cat => `
    <div class="toggle-row">
      <div class="toggle-info">
        <h4>${cat.icon} ${cat.label}</h4>
        <p>${cat.desc}</p>
      </div>
      <label class="toggle">
        <input type="checkbox" class="cat-toggle" data-cat="${cat.id}"
          ${config.enabledCategories?.includes(cat.id) ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    </div>
  `).join("");
}

// ─── Custom Patterns ──────────────────────────────────────────────────
function renderCustomPatterns() {
  const tbody = document.getElementById("patternTableBody");
  if (customPatterns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No custom patterns defined yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = customPatterns.map((p, i) => `
    <tr>
      <td style="font-weight:600;color:var(--text);">${p.label}</td>
      <td><span class="tag type">${p.type}</span></td>
      <td style="font-family:monospace;font-size:11px;color:var(--text-dim);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="${escHtml(p.pattern)}">${escHtml(p.pattern)}</td>
      <td><span class="tag ${p.severity.toLowerCase()}">${p.severity}</span></td>
      <td>
        <label class="toggle" style="width:32px;height:18px;">
          <input type="checkbox" class="pattern-toggle" data-idx="${i}" ${p.enabled ? "checked" : ""}>
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <button class="btn btn-danger btn-sm" data-delete="${i}">🗑</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".pattern-toggle").forEach(cb => {
    cb.addEventListener("change", () => {
      customPatterns[parseInt(cb.dataset.idx)].enabled = cb.checked;
    });
  });
  tbody.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.delete);
      customPatterns.splice(idx, 1);
      renderCustomPatterns();
    });
  });

  // Add pattern button
  document.getElementById("addPatternBtn").onclick = addPattern;

  // Test button
  document.getElementById("runTestBtn").onclick = runTest;

  // Bulk import
  document.getElementById("bulkImportBtn").onclick = () => {
    document.getElementById("bulkImportPanel").style.display = "block";
  };
  document.getElementById("bulkCancelBtn").onclick = () => {
    document.getElementById("bulkImportPanel").style.display = "none";
  };
  document.getElementById("bulkSaveBtn").onclick = bulkImport;

  // Export
  document.getElementById("exportPatternsBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(customPatterns, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "dlp-custom-patterns.json" });
    a.click();
  };
}

function addPattern() {
  const id      = document.getElementById("newId").value.trim().replace(/\s+/g, "_");
  const label   = document.getElementById("newLabel").value.trim();
  const type    = document.getElementById("newType").value;
  const pattern = document.getElementById("newPattern").value.trim();
  const severity = document.getElementById("newSeverity").value;
  const redactAs = document.getElementById("newRedactAs").value.trim() || `[REDACTED-${id.toUpperCase()}]`;

  if (!id || !label || !pattern) {
    alert("Please fill in ID, Label, and Pattern fields.");
    return;
  }

  // Validate regex
  if (type === "regex") {
    try { new RegExp(pattern); } catch (e) {
      alert(`Invalid regex: ${e.message}`);
      return;
    }
  }

  customPatterns.push({ id, label, type, pattern, severity, redactAs, enabled: true, category: "TRADE_SECRET" });
  ["newId","newLabel","newPattern","newRedactAs"].forEach(id => document.getElementById(id).value = "");
  renderCustomPatterns();
}

function runTest() {
  const sample = document.getElementById("testInput").value;
  const pattern = document.getElementById("newPattern").value.trim();
  const type = document.getElementById("newType").value;
  const result = document.getElementById("testResult");
  const badge = document.getElementById("testResultBadge");

  if (!pattern || !sample) { result.textContent = "Enter a pattern and sample text first."; return; }

  try {
    let rx;
    if (type === "regex") rx = new RegExp(pattern, "gi");
    else if (type === "keyword") rx = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    else rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

    const matches = [];
    let m;
    while ((m = rx.exec(sample)) !== null && matches.length < 20) matches.push(m[0]);

    if (matches.length > 0) {
      result.className = "test-result hit";
      result.textContent = `✅ ${matches.length} match${matches.length > 1 ? "es" : ""} found:\n${matches.map(m => `  "${m}"`).join("\n")}`;
      badge.textContent = `${matches.length} match${matches.length > 1 ? "es" : ""}`;
      badge.style.color = "var(--success)";
    } else {
      result.className = "test-result miss";
      result.textContent = "⚠️ No matches found in sample text.";
      badge.textContent = "No matches";
      badge.style.color = "var(--warn)";
    }
  } catch (e) {
    result.className = "test-result";
    result.textContent = `❌ Regex error: ${e.message}`;
  }
}

function bulkImport() {
  const name = document.getElementById("bulkName").value.trim();
  const raw  = document.getElementById("bulkKeywords").value;
  const keywords = raw.split("\n").map(k => k.trim()).filter(Boolean);

  if (!name || keywords.length === 0) {
    alert("Please provide a name and at least one keyword.");
    return;
  }

  const id = name.toLowerCase().replace(/\s+/g, "_");
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = `\\b(?:${escaped.join("|")})\\b`;

  customPatterns.push({
    id, label: name, type: "regex", pattern,
    severity: "HIGH", redactAs: `[REDACTED-${id.toUpperCase()}]`,
    enabled: true, category: "TRADE_SECRET",
    sourceKeywords: keywords
  });

  document.getElementById("bulkImportPanel").style.display = "none";
  document.getElementById("bulkName").value = "";
  document.getElementById("bulkKeywords").value = "";
  renderCustomPatterns();
}

// ─── Audit Log ────────────────────────────────────────────────────────
async function renderAuditLog() {
  const log = await chrome.runtime.sendMessage({ type: "GET_AUDIT_LOG" }) || [];
  const tbody = document.getElementById("auditTableBody");
  const RISK_CLASSES = { CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low" };

  if (log.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No events recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = log.slice(0, 200).map(ev => {
    const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "";
    const date = ev.timestamp ? new Date(ev.timestamp).toLocaleDateString() : "";
    const cats = (ev.categories || []).slice(0, 3).map(c => c.category).join(", ");
    const rc = RISK_CLASSES[ev.riskLevel] || "low";
    return `
      <tr>
        <td style="font-size:11px;color:var(--text-dim);">${date}<br>${time}</td>
        <td>${ev.platformName || ev.platform || "—"}</td>
        <td><span class="tag ${rc}">${ev.riskLevel || "—"}</span></td>
        <td style="font-size:11px;">${ev.action || "—"}</td>
        <td style="font-size:11px;color:var(--text-dim);">${ev.findingCount || 0} (${cats || "—"})</td>
        <td style="font-size:11px;color:var(--text-muted);">${ev.trigger || "—"}</td>
      </tr>
    `;
  }).join("");

  document.getElementById("clearLogBtn").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "CLEAR_STATS" });
    renderAuditLog();
  };

  document.getElementById("exportLogBtn").onclick = () => {
    const header = "Timestamp,Platform,RiskLevel,Action,FindingCount,Categories,Trigger\n";
    const rows = log.map(ev => [
      ev.timestamp, ev.platformName, ev.riskLevel, ev.action,
      ev.findingCount, (ev.categories || []).map(c => c.category).join(";"), ev.trigger
    ].map(v => `"${v || ""}"`).join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "dlp-audit-log.csv" });
    a.click();
  };
}

// ─── Save ─────────────────────────────────────────────────────────────
function setupSave() {
  document.getElementById("saveAllBtn").addEventListener("click", saveAll);
}

async function saveAll() {
  // Collect risk actions
  const actions = {};
  RISK_LEVELS.forEach(level => {
    const el = document.getElementById(`action_${level}`);
    if (el) actions[level] = el.value;
  });

  // Collect category toggles
  const enabledCategories = [];
  document.querySelectorAll(".cat-toggle:checked").forEach(cb => {
    enabledCategories.push(cb.dataset.cat);
  });

  const updatedConfig = {
    ...config,
    actions,
    enabledCategories,
    enabled:         document.getElementById("globalEnabled").checked,
    evasionDetect:   document.getElementById("evasionDetect").checked,
    contextAnalysis: document.getElementById("contextAnalysis").checked,
    nerEnabled:      document.getElementById("nerEnabled").checked,
    serverSync:      document.getElementById("serverSync").checked,
    serverUrl:       document.getElementById("serverUrl").value.trim()
  };

  await chrome.storage.sync.set({
    policyConfig: updatedConfig,
    customPatterns,
    enabled: updatedConfig.enabled
  });
  config = updatedConfig;

  // Notify all content scripts
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: "POLICY_UPDATE", payload: updatedConfig }).catch(() => {});
  }

  const status = document.getElementById("saveStatus");
  status.classList.add("visible");
  setTimeout(() => status.classList.remove("visible"), 2500);
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── Phase 3: Site Management ─────────────────────────────────────────
const SUPPORTED_PLATFORMS = [
  { name: "ChatGPT", hosts: ["chat.openai.com","chatgpt.com"], icon: "🤖" },
  { name: "Claude", hosts: ["claude.ai"], icon: "🔮" },
  { name: "Gemini", hosts: ["gemini.google.com"], icon: "✨" },
  { name: "Copilot", hosts: ["copilot.microsoft.com","bing.com"], icon: "🪟" },
  { name: "Perplexity", hosts: ["perplexity.ai"], icon: "🔍" },
  { name: "Poe", hosts: ["poe.com"], icon: "💬" },
  { name: "Character.AI", hosts: ["character.ai"], icon: "🎭" },
  { name: "HuggingFace Chat", hosts: ["huggingface.co"], icon: "🤗" }
];

function renderSiteManagement(siteOverrides) {
  const tbody = document.getElementById("siteOverrideBody");
  const entries = Object.entries(siteOverrides);

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px;">No site overrides configured — all sites use global setting.</td></tr>`;
  } else {
    tbody.innerHTML = entries.map(([host, enabled]) => `
      <tr>
        <td style="font-weight:600;color:var(--text);">${host}</td>
        <td><span class="tag ${enabled ? 'low' : 'high'}">${enabled ? "ENABLED" : "DISABLED"}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" data-delete-site="${host}">Remove</button>
        </td>
      </tr>`).join("");

    tbody.querySelectorAll("[data-delete-site]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const host = btn.dataset.deleteSite;
        const { siteOverrides: overrides = {} } = await chrome.storage.sync.get("siteOverrides");
        delete overrides[host];
        await chrome.storage.sync.set({ siteOverrides: overrides });
        renderSiteManagement(overrides);
      });
    });
  }

  // Clear all button
  document.getElementById("clearSiteOverridesBtn").onclick = async () => {
    await chrome.storage.sync.set({ siteOverrides: {} });
    renderSiteManagement({});
  };

  // Platform coverage chips
  const platformList = document.getElementById("platformList");
  if (platformList) {
    platformList.innerHTML = SUPPORTED_PLATFORMS.map(p =>
      `<div style="display:flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:11px;color:var(--text-dim);">
        <span>${p.icon}</span><span>${p.name}</span>
        <span style="font-size:9px;color:var(--text-muted);">(${p.hosts.join(", ")})</span>
      </div>`
    ).join("");
  }
}

function updateAboutPatternCount() {
  const el = document.getElementById("aboutPatternCount");
  if (el) el.textContent = `${30 + (customPatterns?.length || 0)}`;
}

init().catch(console.error);

})();