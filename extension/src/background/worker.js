/**
 * background/worker.js — Phase 3 Service Worker
 * Phase 3 additions: desktop notifications for CRITICAL, alert thresholds,
 * Policy Server integration, WebSocket reconnection, extension token auth.
 */

const POLICY_SERVER_URL = null; // Set to corporate Policy Server URL
const POLICY_SYNC_INTERVAL_MINUTES = 5;
const EXTENSION_TOKEN = null; // Set to shared secret from Policy Server config

self.addEventListener("install", () => { console.log("[DLP Worker] v3 Installed"); self.skipWaiting(); });
self.addEventListener("activate", (e) => { console.log("[DLP Worker] v3 Activated"); e.waitUntil(clients.claim()); setupAlarms(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "DLP_EVENT": handleDLPEvent(msg.payload, sender); break;
    case "GET_AUDIT_LOG": getAuditLog().then(sendResponse); return true;
    case "GET_STATS": getStats().then(sendResponse); return true;
    case "CLEAR_STATS": clearStats().then(sendResponse); return true;
    case "SYNC_POLICY": syncPolicy().then(sendResponse); return true;
    case "GET_SERVER_STATUS": sendResponse({ configured: !!POLICY_SERVER_URL }); break;
  }
});

async function handleDLPEvent(payload, sender) {
  const event = { ...payload, tabId: sender.tab?.id, id: generateEventId() };
  await appendToAuditLog(event);
  updateExtensionBadge(event.riskLevel);
  if (event.riskLevel === "CRITICAL" || event.action === "BLOCK") showDesktopNotification(event);
  if (POLICY_SERVER_URL && payload.riskLevel !== "NONE") sendToServer(event).catch(err => console.warn("[DLP Worker] Server send failed:", err.message));
}

async function showDesktopNotification(event) {
  try {
    const { notificationsEnabled = true } = await chrome.storage.sync.get("notificationsEnabled");
    if (!notificationsEnabled) return;
    chrome.notifications.create(`dlp_${event.id}`, {
      type: "basic", iconUrl: "icons/icon48.png",
      title: event.action === "BLOCK" ? "🚫 DLP: Prompt Blocked" : `⚠️ DLP: ${event.riskLevel} Risk Detected`,
      message: `${event.findingCount} sensitive item${event.findingCount !== 1 ? "s" : ""} on ${event.platformName || event.platform}. ${event.action === "BLOCK" ? "Submission blocked." : "Data redacted."}`,
      priority: 2, requireInteraction: event.action === "BLOCK"
    });
  } catch (_) {}
}

const MAX_LOG_ENTRIES = 500;

async function appendToAuditLog(event) {
  const { auditLog = [] } = await chrome.storage.local.get("auditLog");
  auditLog.unshift(event);
  if (auditLog.length > MAX_LOG_ENTRIES) auditLog.splice(MAX_LOG_ENTRIES);
  await chrome.storage.local.set({ auditLog });
}

async function getAuditLog() { const { auditLog = [] } = await chrome.storage.local.get("auditLog"); return auditLog; }
async function getStats() { const { sessionStats = { scanned: 0, redacted: 0, blocked: 0 } } = await chrome.storage.sync.get("sessionStats"); return sessionStats; }
async function clearStats() { const reset = { scanned: 0, redacted: 0, blocked: 0 }; await chrome.storage.sync.set({ sessionStats: reset }); await chrome.storage.local.set({ auditLog: [] }); return reset; }

const riskColors = { CRITICAL: "#b71c1c", HIGH: "#e65100", MEDIUM: "#f57f17", LOW: "#388e3c", NONE: "#1a237e" };

function updateExtensionBadge(riskLevel) {
  chrome.action.setBadgeBackgroundColor({ color: riskColors[riskLevel] || riskColors.NONE });
  if (riskLevel && riskLevel !== "NONE") {
    const text = { CRITICAL: "🚫", HIGH: "⚠", MEDIUM: "!", LOW: "•" }[riskLevel] || "!";
    chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
  }
}

async function sendToServer(event) {
  if (!POLICY_SERVER_URL) return;
  const headers = { "Content-Type": "application/json" };
  if (EXTENSION_TOKEN) headers["X-Extension-Token"] = EXTENSION_TOKEN;
  const res = await fetch(`${POLICY_SERVER_URL}/api/events`, { method: "POST", headers, body: JSON.stringify(event) });
  if (!res.ok) throw new Error(`Server responded with ${res.status}`);
}

async function syncPolicy() {
  if (!POLICY_SERVER_URL) return { success: false, reason: "No policy server configured" };
  try {
    const headers = {};
    if (EXTENSION_TOKEN) headers["X-Extension-Token"] = EXTENSION_TOKEN;
    const res = await fetch(`${POLICY_SERVER_URL}/api/policy`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const policy = await res.json();
    await chrome.storage.sync.set({ policyConfig: policy });
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { type: "POLICY_UPDATE", payload: policy }).catch(() => {});
    return { success: true, policy };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

function setupAlarms() {
  chrome.alarms.create("policy_sync", { periodInMinutes: POLICY_SYNC_INTERVAL_MINUTES });
  chrome.alarms.create("stats_cleanup", { periodInMinutes: 60 * 24 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "policy_sync") syncPolicy();
  if (alarm.name === "stats_cleanup") {
    chrome.storage.local.get("auditLog").then(({ auditLog = [] }) => {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const trimmed = auditLog.filter(e => new Date(e.timestamp).getTime() > cutoff);
      if (trimmed.length < auditLog.length) chrome.storage.local.set({ auditLog: trimmed });
    });
  }
});

function generateEventId() { return `dlp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
