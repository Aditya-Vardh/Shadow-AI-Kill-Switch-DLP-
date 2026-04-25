(function(){

// ── src/popup/popup.js ──
/**
 * popup.js
 * Drives the extension popup UI.
 */

const PLATFORMS = [
  { name: "ChatGPT",   icon: "🤖" },
  { name: "Claude",    icon: "🔮" },
  { name: "Gemini",    icon: "✨" },
  { name: "Copilot",   icon: "🪟" },
  { name: "Perplexity",icon: "🔍" },
  { name: "Poe",       icon: "💬" },
  { name: "+4 more",   icon: "🌐" }
];

const CATEGORY_ICONS = {
  API_KEY:     "🔑",
  CREDENTIAL:  "🔐",
  PII:         "👤",
  FINANCIAL:   "💳",
  CODE_SECRET: "💻"
};

async function init() {
  const { enabled = true } = await chrome.storage.sync.get("enabled");
  const { sessionStats = { scanned: 0, redacted: 0, blocked: 0 } } =
    await chrome.storage.sync.get("sessionStats");

  setToggle(enabled);
  updateStats(sessionStats);
  renderPlatforms();

  const auditLog = await chrome.runtime.sendMessage({ type: "GET_AUDIT_LOG" });
  renderEvents(auditLog || []);

  // ── Phase 3: Per-site toggle ──────────────────────────────────
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = activeTab?.url ? new URL(activeTab.url).hostname : null;

  if (hostname) {
    document.getElementById("siteHostname").textContent = hostname;
    const { siteOverrides = {} } = await chrome.storage.sync.get("siteOverrides");
    const siteOn = siteOverrides[hostname] !== false;
    document.getElementById("siteToggle").checked = siteOn;
    document.getElementById("siteLabel").textContent = siteOn ? "Enabled" : "Disabled";

    document.getElementById("siteToggle").addEventListener("change", async (e) => {
      const val = e.target.checked;
      document.getElementById("siteLabel").textContent = val ? "Enabled" : "Disabled";
      const { siteOverrides: overrides = {} } = await chrome.storage.sync.get("siteOverrides");
      overrides[hostname] = val;
      await chrome.storage.sync.set({ siteOverrides: overrides });

      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, { type: "TOGGLE_SITE", payload: val }).catch(() => {});
      }
    });
  } else {
    document.getElementById("siteHostname").textContent = "No supported site active";
  }

  // ── Phase 3: View Last Redaction ──────────────────────────────
  const viewLastBtn = document.getElementById("viewLastBtn");
  const hasEvents = auditLog && auditLog.length > 0;
  if (hasEvents) {
    viewLastBtn.classList.remove("no-data");
    viewLastBtn.textContent = "🔍 View last redaction details";
  }
  viewLastBtn.addEventListener("click", async () => {
    if (viewLastBtn.classList.contains("no-data")) return;
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { type: "SHOW_REDACTION_DETAIL" }).catch(() => {
        // Tab doesn't have content script — show notification
        viewLastBtn.textContent = "⚠️ Open an AI chat page first";
        setTimeout(() => { viewLastBtn.textContent = "🔍 View last redaction details"; }, 2000);
      });
      window.close(); // close popup so panel is visible
    }
  });

  // Toggle handler
  document.getElementById("enableToggle").addEventListener("change", async (e) => {
    const val = e.target.checked;
    await chrome.storage.sync.set({ enabled: val });
    setToggle(val);

    // Notify active tab content script
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { type: "TOGGLE_ENABLED", payload: val }).catch(() => {});
    }
  });

  // Clear stats
  document.getElementById("clearBtn").addEventListener("click", async () => {
    const reset = await chrome.runtime.sendMessage({ type: "CLEAR_STATS" });
    updateStats(reset);
    renderEvents([]);
    viewLastBtn.classList.add("no-data");
    document.getElementById("clearBtn").textContent = "Cleared ✓";
    setTimeout(() => document.getElementById("clearBtn").textContent = "Clear Stats", 1500);
  });

  // Settings
  document.getElementById("settingsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage?.() ||
      chrome.tabs.create({ url: "src/popup/settings.html" });
  });
}

function setToggle(enabled) {
  const toggle = document.getElementById("enableToggle");
  const label  = document.getElementById("toggleLabel");
  const dot    = document.getElementById("statusDot");
  const status = document.getElementById("statusText");

  toggle.checked = enabled;
  label.textContent = enabled ? "ON" : "OFF";
  dot.className = "status-dot" + (enabled ? "" : " off");
  status.textContent = enabled
    ? "Active — monitoring this page"
    : "Disabled — DLP is paused";
}

function updateStats(stats) {
  document.getElementById("statScanned").textContent  = stats.scanned  || 0;
  document.getElementById("statRedacted").textContent = stats.redacted || 0;
  document.getElementById("statBlocked").textContent  = stats.blocked  || 0;
}

function renderPlatforms() {
  const list = document.getElementById("platformsList");
  list.innerHTML = PLATFORMS.map(p =>
    `<div class="platform-chip">
      <div class="dot"></div>
      <span>${p.icon} ${p.name}</span>
    </div>`
  ).join("");
}

function renderEvents(events) {
  const list = document.getElementById("eventsList");
  if (!events || events.length === 0) {
    list.innerHTML = '<div class="no-events">No events yet this session</div>';
    return;
  }

  list.innerHTML = events.slice(0, 6).map(ev => {
    const severity = ev.riskLevel?.toLowerCase() || "low";
    const icon = ev.action === "BLOCK" ? "🚫" : ev.action === "REDACT" ? "⚠️" : "🛡️";
    const catIcons = (ev.categories || [])
      .map(c => CATEGORY_ICONS[c.category] || "•")
      .slice(0, 3).join(" ");
    const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "";
    const count = ev.findingCount || 0;

    return `
      <div class="event-item ${severity}">
        <span class="event-icon">${icon}</span>
        <div class="event-body">
          <div class="event-title">${ev.platformName || "AI Chat"}  ${catIcons}</div>
          <div class="event-meta">${count} finding${count !== 1 ? "s" : ""} · ${time}</div>
        </div>
        <span class="event-badge ${severity}">${ev.riskLevel || "LOW"}</span>
      </div>`;
  }).join("");
}

init().catch(console.error);

})();