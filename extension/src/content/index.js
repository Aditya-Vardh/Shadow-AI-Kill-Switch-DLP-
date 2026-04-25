
// ── src/content/ui.js ──
/**
 * content/ui.js
 * Injected UI elements: shield badge and toast notifications.
 * All styles are isolated using Shadow DOM to avoid platform CSS conflicts.
 */

let badgeEl = null;
let toastContainer = null;
let toastTimeout = null;

// ─── Shield Badge ─────────────────────────────────────────────────────
function showBadge(platformName) {
  if (badgeEl) return;

  const host = document.createElement("div");
  host.id = "__dlp_badge_host";
  host.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      .badge {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #1a237e;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 11px;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: 20px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.35);
        opacity: 0.88;
        pointer-events: auto;
        cursor: default;
        transition: opacity 0.2s;
        user-select: none;
        letter-spacing: 0.3px;
      }
      .badge:hover { opacity: 1; }
      .icon { font-size: 13px; }
      .count {
        background: #e53935;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        min-width: 16px;
        height: 16px;
        border-radius: 8px;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
      }
      .count.visible { display: flex; }
    </style>
    <div class="badge" title="Shadow AI DLP is active on ${platformName}">
      <span class="icon">🛡️</span>
      <span class="label">DLP Active</span>
      <span class="count" id="count"></span>
    </div>
  `;

  badgeEl = { host, shadow };
}

function updateBadge(count) {
  if (!badgeEl) return;
  const countEl = badgeEl.shadow.getElementById("count");
  if (!countEl) return;
  if (count > 0) {
    countEl.textContent = count > 99 ? "99+" : count;
    countEl.classList.add("visible");
  }
}

function hideBadge() {
  if (badgeEl) {
    badgeEl.host.remove();
    badgeEl = null;
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────
function showToast({ type, title, message, findings = [], silent = false, onViewDetails }) {
  ensureToastContainer();

  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  const existing = toastContainer.shadowRoot.querySelector(".toast");
  if (existing) existing.remove();

  const colors = {
    block: { bg: "#b71c1c", border: "#e53935", icon: "🚫" },
    warn:  { bg: "#e65100", border: "#ff9800", icon: "⚠️" },
    info:  { bg: "#1a237e", border: "#3949ab", icon: "🛡️" }
  };
  const c = colors[type] || colors.info;

  // Build findings list (max 4 items shown)
  const topFindings = findings.slice(0, 4);
  const findingHtml = topFindings.map(f =>
    `<div class="finding">
      <span class="pill ${f.severity.toLowerCase()}">${f.severity}</span>
      <span>${f.label}</span>
    </div>`
  ).join("");
  const overflow = findings.length > 4
    ? `<div class="overflow">+${findings.length - 4} more</div>` : "";

  const toastHtml = `
    <style>
      .toast {
        position: fixed; bottom: 70px; right: 20px; width: 320px;
        background: #1e1e2e; border: 1.5px solid ${c.border}; border-radius: 12px;
        padding: 14px 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; color: #e0e0e0; z-index: 2147483647;
        animation: slideIn 0.25s ease-out; pointer-events: auto;
      }
      @keyframes slideIn { from{transform:translateX(120%);opacity:0;} to{transform:translateX(0);opacity:1;} }
      .toast-header { display:flex;align-items:center;gap:8px;margin-bottom:8px; }
      .toast-icon { font-size:18px;line-height:1; }
      .toast-title { font-weight:700;font-size:13px;color:${c.border};flex:1; }
      .close-btn { background:none;border:none;color:#888;cursor:pointer;font-size:16px;line-height:1;padding:0; }
      .close-btn:hover { color:#eee; }
      .toast-message { color:#bdbdbd;font-size:12px;margin-bottom:8px;line-height:1.4; }
      .findings { display:flex;flex-direction:column;gap:4px; }
      .finding { display:flex;align-items:center;gap:6px;font-size:11.5px;color:#ccc; }
      .pill { font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.3px; }
      .pill.critical{background:#b71c1c;color:#fff;} .pill.high{background:#e65100;color:#fff;} .pill.medium{background:#f57f17;color:#fff;} .pill.low{background:#33691e;color:#fff;}
      .overflow { font-size:11px;color:#888;margin-top:2px; }
      .divider { border:none;border-top:1px solid #333;margin:8px 0; }
      .view-btn { margin-top:8px;background:none;border:1px solid #3a3a5a;color:#9fa8da;font-size:11px;padding:4px 10px;border-radius:5px;cursor:pointer;font-family:inherit;transition:all 0.15s; }
      .view-btn:hover { background:#2a2a40;color:#e0e0e0;border-color:#5c6bc0; }
    </style>
    <div class="toast" role="alert" aria-live="polite">
      <div class="toast-header">
        <span class="toast-icon">${c.icon}</span>
        <span class="toast-title">${title}</span>
        <button class="close-btn" id="dlp-close" aria-label="Close">×</button>
      </div>
      <div class="toast-message">${message}</div>
      ${topFindings.length > 0 ? `<hr class="divider"><div class="findings">${findingHtml}${overflow}</div>` : ""}
      ${findings.length > 0 && onViewDetails ? `<button class="view-btn" id="dlp-view">🔍 View what was removed →</button>` : ""}
    </div>
  `;

  const root = toastContainer.shadowRoot;
  root.innerHTML = toastHtml;

  const closeBtn = root.getElementById("dlp-close");
  closeBtn?.addEventListener("click", () => root.innerHTML = "");

  // Phase 3: "View what was removed" button
  const viewBtn = root.getElementById("dlp-view");
  if (viewBtn && onViewDetails) {
    viewBtn.addEventListener("click", () => {
      root.innerHTML = "";
      onViewDetails();
    });
  }

  const duration = type === "block" ? 10000 : silent ? 3000 : 5000;
  toastTimeout = setTimeout(() => {
    if (root) root.innerHTML = "";
  }, duration);
}

function ensureToastContainer() {
  if (toastContainer && document.contains(toastContainer)) return;
  toastContainer = document.createElement("div");
  toastContainer.id = "__dlp_toast_host";
  toastContainer.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;";
  toastContainer.attachShadow({ mode: "open" });
  // allow pointer events inside shadow
  toastContainer.style.pointerEvents = "none";
  document.body.appendChild(toastContainer);
}


// ─── Phase 3: Block Modal ────────────────────────────────────────────
/**
 * Mandatory acknowledgment modal for CRITICAL/BLOCK events.
 * Resolves with "edit" (user wants to fix prompt) or "cancel".
 */
function showBlockModal(findings) {
  return new Promise((resolve) => {
    const existing = document.getElementById("__dlp_block_host");
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = "__dlp_block_host";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:auto;";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const findingRows = findings.filter(f => !f.isContextual).slice(0, 8).map(f =>
      `<div class="finding-row">
        <span class="pill ${f.severity.toLowerCase()}">${f.severity}</span>
        <span class="finding-label">${escHtml(f.label)}</span>
      </div>`
    ).join("");

    shadow.innerHTML = `
      <style>
        * { box-sizing:border-box;margin:0;padding:0; }
        .overlay { position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center; }
        .modal { background:#12121f;border:2px solid #e53935;border-radius:16px;max-width:460px;width:92%;box-shadow:0 24px 80px rgba(0,0,0,0.9);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;animation:popIn 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes popIn { from{transform:scale(0.85);opacity:0;} to{transform:scale(1);opacity:1;} }
        .modal-header { background:linear-gradient(135deg,#6a0000,#c62828);padding:20px 22px;display:flex;align-items:center;gap:14px; }
        .modal-icon { font-size:36px;line-height:1; }
        .modal-title { font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.3px; }
        .modal-sub { font-size:12px;color:#ffcdd2;margin-top:4px; }
        .modal-body { padding:20px 22px; }
        .section-label { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#7986cb;margin-bottom:8px; }
        .findings-list { display:flex;flex-direction:column;gap:5px;margin-bottom:16px;max-height:180px;overflow-y:auto; }
        .finding-row { display:flex;align-items:center;gap:8px;padding:7px 10px;background:#0e0e1e;border-radius:7px;font-size:12px;color:#e0e0e0; }
        .finding-label { flex:1; }
        .pill { font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;flex-shrink:0; }
        .pill.critical{background:#b71c1c;color:#fff;} .pill.high{background:#e65100;color:#fff;} .pill.medium{background:#f57f17;color:#fff;} .pill.low{background:#2e7d32;color:#fff;}
        .policy-box { background:#0b0b18;border:1px solid #2a2a48;border-radius:8px;padding:12px;font-size:11.5px;color:#9fa8da;line-height:1.6;margin-bottom:16px; }
        .policy-box strong { color:#ef9a9a; }
        .ack-label { display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin-bottom:18px; }
        .ack-cb { width:18px;height:18px;accent-color:#e53935;cursor:pointer;flex-shrink:0;margin-top:1px; }
        .ack-text { font-size:12px;color:#bdbdbd;line-height:1.55; }
        .actions { display:flex;gap:10px; }
        .btn-edit { flex:1;background:#c62828;border:none;color:#fff;font-size:13px;font-weight:700;padding:10px 14px;border-radius:8px;cursor:pointer;font-family:inherit;transition:background 0.15s;opacity:0.5; }
        .btn-edit.ready { opacity:1; }
        .btn-edit:hover.ready { background:#e53935; }
        .btn-cancel { flex:1;background:#1e1e3a;border:1px solid #2d2d50;color:#9fa8da;font-size:13px;font-weight:600;padding:10px 14px;border-radius:8px;cursor:pointer;font-family:inherit;transition:all 0.15s; }
        .btn-cancel:hover { background:#2d2d50;color:#e0e0e0; }
      </style>
      <div class="overlay">
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="block-title">
          <div class="modal-header">
            <span class="modal-icon">🚫</span>
            <div>
              <div class="modal-title" id="block-title">Submission Blocked</div>
              <div class="modal-sub">${findings.length} sensitive item${findings.length!==1?"s":""} detected — corporate policy prevents sending</div>
            </div>
          </div>
          <div class="modal-body">
            <div class="section-label">Detected sensitive data</div>
            <div class="findings-list">${findingRows}</div>
            <div class="policy-box"><strong>Policy violation:</strong> This prompt contains data that violates your organization's data loss prevention policy. Remove the sensitive information before sending to any AI service.</div>
            <label class="ack-label">
              <input type="checkbox" class="ack-cb" id="ackCb">
              <span class="ack-text">I understand this prompt contains sensitive data. I will edit my message to remove the flagged items before sending.</span>
            </label>
            <div class="actions">
              <button class="btn-edit" id="editBtn" disabled>✏️ Edit My Prompt</button>
              <button class="btn-cancel" id="cancelBtn">Discard &amp; Cancel</button>
            </div>
          </div>
        </div>
      </div>`;

    const ackCb = shadow.getElementById("ackCb");
    const editBtn = shadow.getElementById("editBtn");
    const cancelBtn = shadow.getElementById("cancelBtn");

    ackCb.addEventListener("change", () => {
      editBtn.disabled = !ackCb.checked;
      editBtn.classList.toggle("ready", ackCb.checked);
    });
    editBtn.addEventListener("click", () => { host.remove(); resolve("edit"); });
    cancelBtn.addEventListener("click", () => { host.remove(); resolve("cancel"); });
  });
}


// ─── Phase 3: Redaction Detail Panel ─────────────────────────────────
/**
 * Shows detailed breakdown of what was removed from the prompt.
 * The "View what was removed" feature builds user trust.
 */
function showRedactionDetail(findings) {
  const existing = document.getElementById("__dlp_detail_host");
  if (existing) { existing.remove(); return; }

  const host = document.createElement("div");
  host.id = "__dlp_detail_host";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:auto;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const redactable = findings.filter(f => !f.isContextual && f.redactAs);
  const contextual = findings.filter(f => f.isContextual);

  function esc(str) { return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  const redactionRows = redactable.map(f => `
    <div class="r-row">
      <div class="r-meta">
        <span class="pill ${f.severity.toLowerCase()}">${f.severity}</span>
        <span class="r-label">${esc(f.label)}</span>
        <span class="r-source">${f.source||"regex"}</span>
      </div>
      <div class="r-values">
        <span class="r-original" title="${esc(f.match)}">${esc(f.match.length > 40 ? f.match.slice(0,40)+"…" : f.match)}</span>
        <span class="r-arrow">→</span>
        <span class="r-placeholder">${esc(f.redactAs)}</span>
      </div>
    </div>`).join("");

  const contextRows = contextual.map(f => `
    <div class="ctx-row">
      <span class="pill ${f.severity.toLowerCase()}">${f.severity}</span>
      <span>${esc(f.label)}</span>
    </div>`).join("");

  shadow.innerHTML = `
    <style>
      * { box-sizing:border-box;margin:0;padding:0; }
      .overlay { position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center; }
      .panel { background:#0f0f1a;border:1.5px solid #2a2a48;border-radius:16px;max-width:560px;width:94%;max-height:82vh;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 24px 80px rgba(0,0,0,0.8);overflow:hidden;animation:popIn 0.2s ease-out; }
      @keyframes popIn { from{transform:scale(0.9);opacity:0;} to{transform:scale(1);opacity:1;} }
      .ph { background:linear-gradient(135deg,#1a237e,#283593);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0; }
      .ph-text h2 { font-size:15px;font-weight:700;color:#fff; }
      .ph-text p { font-size:11px;color:#9fa8da;margin-top:2px; }
      .ph-close { background:none;border:none;color:#9fa8da;font-size:22px;cursor:pointer;padding:0;line-height:1; }
      .ph-close:hover { color:#fff; }
      .pb { overflow-y:auto;flex:1;padding:18px 20px; }
      .sec { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#5c6bc0;margin-bottom:10px;margin-top:18px; }
      .sec:first-child { margin-top:0; }
      .r-row { background:#141428;border:1px solid #1e1e3a;border-radius:8px;padding:10px 12px;margin-bottom:8px; }
      .r-meta { display:flex;align-items:center;gap:8px;margin-bottom:7px; }
      .r-label { font-size:12px;font-weight:600;color:#e0e0e0;flex:1; }
      .r-source { font-size:9px;background:#1a1a30;border:1px solid #2d2d50;color:#5c6bc0;border-radius:4px;padding:1px 6px;text-transform:uppercase; }
      .r-values { display:flex;align-items:center;gap:8px;font-size:11.5px;font-family:'Courier New',monospace; }
      .r-original { color:#ef9a9a;background:#1a0a0a;padding:3px 8px;border-radius:4px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid #3a0a0a; }
      .r-arrow { color:#4a4a6a;font-size:14px; }
      .r-placeholder { color:#a5d6a7;background:#0a1a0a;padding:3px 8px;border-radius:4px;border:1px solid #0a3a0a; }
      .ctx-row { display:flex;align-items:center;gap:8px;padding:8px 10px;background:#141428;border:1px solid #1e1e3a;border-radius:7px;margin-bottom:6px;font-size:12px;color:#bdbdbd; }
      .pill { font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;white-space:nowrap;flex-shrink:0; }
      .pill.critical{background:#b71c1c;color:#fff;} .pill.high{background:#e65100;color:#fff;} .pill.medium{background:#f57f17;color:#fff;} .pill.low{background:#2e7d32;color:#fff;}
      .privacy-note { background:#0d1b4a;border:1px solid #3949ab;border-radius:8px;padding:11px 14px;font-size:11px;color:#9fa8da;margin-top:12px;line-height:1.6; }
      .empty { text-align:center;color:#424266;font-size:12px;padding:24px 0; }
      .pf { padding:14px 20px;border-top:1px solid #1e1e3a;display:flex;justify-content:flex-end;flex-shrink:0; }
      .btn-done { background:#1e1e3a;border:1px solid #2d2d50;color:#9fa8da;font-size:12px;font-weight:600;padding:8px 18px;border-radius:7px;cursor:pointer;font-family:inherit; }
      .btn-done:hover { background:#2d2d50;color:#e0e0e0; }
    </style>
    <div class="overlay">
      <div class="panel" role="dialog" aria-label="Redaction Details">
        <div class="ph">
          <div class="ph-text">
            <h2>🔍 What Was Removed</h2>
            <p>${redactable.length} item${redactable.length!==1?"s":""} redacted · shown locally only · never transmitted</p>
          </div>
          <button class="ph-close" id="closeBtn" aria-label="Close">×</button>
        </div>
        <div class="pb">
          ${redactable.length > 0 ? `
            <div class="sec">Redacted Items</div>
            ${redactionRows}
          ` : '<div class="empty">No inline redactions were applied to this prompt</div>'}
          ${contextual.length > 0 ? `
            <div class="sec">Context Warnings (no inline redaction applied)</div>
            ${contextRows}
            <p style="font-size:11px;color:#5c6bc0;margin-top:6px;">These signals triggered a warning but the text was not modified. Review your prompt for sensitive context.</p>
          ` : ""}
          <div class="privacy-note">
            🔒 <strong>Privacy:</strong> The original values shown above are only displayed here for your review. They are never stored in the audit log or sent to any server — only anonymized metadata is recorded.
          </div>
        </div>
        <div class="pf">
          <button class="btn-done" id="doneBtn">Done</button>
        </div>
      </div>
    </div>`;

  shadow.getElementById("closeBtn").addEventListener("click", () => host.remove());
  shadow.getElementById("doneBtn").addEventListener("click", () => host.remove());
  shadow.querySelector(".overlay").addEventListener("click", e => { if (e.target===e.currentTarget) host.remove(); });
}

function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }


// ── src/utils/platforms.js ──
/**
 * platforms.js
 * Per-platform DOM selectors and interception strategies.
 * Each platform entry describes how to find and hook the input area.
 */

const PLATFORMS = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    matches: ["chat.openai.com", "chatgpt.com"],
    icon: "🤖",
    // Ordered list of selectors to try (first match wins)
    inputSelectors: [
      "#prompt-textarea",
      "div[contenteditable='true'][data-id='root']",
      "textarea[data-id='root']",
      "div[contenteditable='true']"
    ],
    submitSelectors: [
      "button[data-testid='send-button']",
      "button[aria-label='Send message']",
      "button[aria-label='Send prompt']"
    ],
    inputType: "contenteditable",
    getTextFromInput: (el) => el.innerText || el.textContent || "",
    setTextInInput: (el, text) => {
      // For contenteditable, we need to set via execCommand or direct manipulation
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    }
  },
  {
    id: "claude",
    name: "Claude",
    matches: ["claude.ai"],
    icon: "🔮",
    inputSelectors: [
      "div[contenteditable='true'].ProseMirror",
      "div[contenteditable='true']",
      "textarea[placeholder]"
    ],
    submitSelectors: [
      "button[aria-label='Send Message']",
      "button[type='submit']",
      "button[data-value='send']"
    ],
    inputType: "contenteditable",
    getTextFromInput: (el) => el.innerText || el.textContent || "",
    setTextInInput: (el, text) => {
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    }
  },
  {
    id: "gemini",
    name: "Google Gemini",
    matches: ["gemini.google.com"],
    icon: "✨",
    inputSelectors: [
      "div.ql-editor[contenteditable='true']",
      "rich-textarea div[contenteditable='true']",
      "div[contenteditable='true']"
    ],
    submitSelectors: [
      "button.send-button",
      "button[aria-label='Send message']",
      "button[mattooltip='Send message']"
    ],
    inputType: "contenteditable",
    getTextFromInput: (el) => el.innerText || el.textContent || "",
    setTextInInput: (el, text) => {
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    }
  },
  {
    id: "copilot",
    name: "Microsoft Copilot",
    matches: ["copilot.microsoft.com", "bing.com"],
    icon: "🪟",
    inputSelectors: [
      "textarea#searchbox",
      "div[contenteditable='true']#searchbox",
      "cib-text-input textarea",
      "textarea[placeholder]"
    ],
    submitSelectors: [
      "button#submit-button",
      "button[aria-label='Submit']",
      "button[type='submit']"
    ],
    inputType: "textarea",
    getTextFromInput: (el) => el.value || "",
    setTextInInput: (el, text) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      ).set;
      nativeInputValueSetter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },
  {
    id: "perplexity",
    name: "Perplexity AI",
    matches: ["perplexity.ai"],
    icon: "🔍",
    inputSelectors: [
      "textarea[placeholder]",
      "div[contenteditable='true']"
    ],
    submitSelectors: [
      "button[aria-label='Submit']",
      "button[type='submit']"
    ],
    inputType: "textarea",
    getTextFromInput: (el) => el.value || "",
    setTextInInput: (el, text) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      ).set;
      nativeInputValueSetter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },
  {
    id: "poe",
    name: "Poe",
    matches: ["poe.com"],
    icon: "💬",
    inputSelectors: [
      "textarea[class*='GrowingTextArea']",
      "textarea[placeholder]"
    ],
    submitSelectors: [
      "button[class*='SendButton']",
      "button[type='submit']"
    ],
    inputType: "textarea",
    getTextFromInput: (el) => el.value || "",
    setTextInInput: (el, text) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      ).set;
      nativeInputValueSetter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },
  {
    // Generic fallback for any site with AI chat
    id: "generic",
    name: "AI Chat",
    matches: ["*"],
    icon: "🛡️",
    inputSelectors: [
      "textarea[placeholder*='message' i]",
      "textarea[placeholder*='ask' i]",
      "textarea[placeholder*='chat' i]",
      "div[contenteditable='true'][role='textbox']"
    ],
    submitSelectors: [
      "button[type='submit']",
      "button[aria-label*='send' i]",
      "button[aria-label*='submit' i]"
    ],
    inputType: "auto",
    getTextFromInput: (el) => {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
      return el.innerText || el.textContent || "";
    },
    setTextInInput: (el, text) => {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, "value"
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        )?.set;
        if (setter) {
          setter.call(el, text);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          el.value = text;
        }
      } else {
        el.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, text);
      }
    }
  }
];

/**
 * Get the platform config for the current hostname
 */
function detectPlatform() {
  const hostname = window.location.hostname;
  return PLATFORMS.find(p =>
    p.matches.some(m => m !== "*" && hostname.includes(m))
  ) || PLATFORMS.find(p => p.id === "generic");
}

/**
 * Find the active input element using a platform's selector list
 */
function findInputElement(platform) {
  for (const selector of platform.inputSelectors) {
    const el = document.querySelector(selector);
    if (el && isVisible(el)) return el;
  }
  return null;
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== "none";
}




// ── src/utils/customPatterns.js ──
/**
 * customPatterns.js
 * Admin-configurable keyword and phrase detection engine.
 *
 * IT admins can define:
 *   - Exact keywords (internal project names, client names, product codenames)
 *   - Regex patterns (internal employee ID formats, internal URL patterns)
 *   - Phrase lists (NDA-protected terms, unreleased product names)
 *
 * All custom patterns are stored in chrome.storage.sync under "customPatterns"
 * and synced from the Policy Server when configured.
 */

// ─── Default Org Patterns (loaded at startup) ─────────────────────────
const DEFAULT_CUSTOM_PATTERNS = [
  {
    id: "internal_url",
    label: "Internal URL / Hostname",
    type: "regex",
    pattern: "https?:\\/\\/(?:[a-z0-9\\-]+\\.)*(?:internal|intranet|corp|dev|staging|prod\\.internal|localhost)[.:\\/][^\\s]*",
    severity: "HIGH",
    redactAs: "[REDACTED-INTERNAL-URL]",
    enabled: true,
    category: "TRADE_SECRET"
  },
  {
    id: "internal_ticket",
    label: "Jira / Internal Ticket ID",
    type: "regex",
    pattern: "\\b[A-Z]{2,8}-\\d{1,6}\\b",
    severity: "LOW",
    redactAs: "[REDACTED-TICKET-ID]",
    enabled: false, // Off by default — many false positives; enable org-specifically
    category: "TRADE_SECRET"
  }
];

// ─── Custom Pattern Store ─────────────────────────────────────────────
let compiledPatterns = [];

/**
 * Load custom patterns from storage and compile them.
 * Called once at extension startup and after policy sync.
 */
async function loadCustomPatterns() {
  try {
    const stored = await chrome.storage.sync.get("customPatterns");
    const patterns = stored.customPatterns || DEFAULT_CUSTOM_PATTERNS;
    compiledPatterns = compilePatterns(patterns);
    return patterns;
  } catch (_) {
    compiledPatterns = compilePatterns(DEFAULT_CUSTOM_PATTERNS);
    return DEFAULT_CUSTOM_PATTERNS;
  }
}

/**
 * Save patterns to storage and recompile.
 */
async function saveCustomPatterns(patterns) {
  await chrome.storage.sync.set({ customPatterns: patterns });
  compiledPatterns = compilePatterns(patterns);
}

/**
 * Compile raw pattern definitions into executable objects.
 */
function compilePatterns(patterns) {
  return patterns
    .filter(p => p.enabled)
    .map(p => {
      try {
        let regex;
        if (p.type === "regex") {
          regex = new RegExp(p.pattern, "gi");
        } else if (p.type === "keyword") {
          // Exact word match, case-insensitive
          const escaped = p.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          regex = new RegExp(`\\b${escaped}\\b`, "gi");
        } else if (p.type === "phrase") {
          // Phrase match — looser boundary
          const escaped = p.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          regex = new RegExp(escaped, "gi");
        } else {
          return null;
        }
        return { ...p, compiledRegex: regex };
      } catch (e) {
        console.warn(`[DLP] Failed to compile custom pattern "${p.id}":`, e.message);
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Scan text against all active custom patterns.
 * @param {string} text
 * @returns {Finding[]}
 */
function scanCustomPatterns(text) {
  if (!text || compiledPatterns.length === 0) return [];

  const findings = [];

  for (const pattern of compiledPatterns) {
    pattern.compiledRegex.lastIndex = 0;
    let m;

    while ((m = pattern.compiledRegex.exec(text)) !== null) {
      findings.push({
        patternId: `custom_${pattern.id}`,
        category: pattern.category || "TRADE_SECRET",
        label: pattern.label,
        severity: pattern.severity,
        redactAs: pattern.redactAs || `[REDACTED-${pattern.id.toUpperCase()}]`,
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        source: "custom_pattern",
        customPatternId: pattern.id
      });
    }
  }

  return findings;
}

// ─── Pattern Builder Helpers (used by Settings UI) ───────────────────

/**
 * Test a pattern definition against sample text.
 * Returns matches found, or an error message.
 */
function testPattern(patternDef, sampleText) {
  try {
    const compiled = compilePatterns([{ ...patternDef, enabled: true }]);
    if (compiled.length === 0) return { error: "Pattern compilation failed" };

    const findings = [];
    compiled[0].compiledRegex.lastIndex = 0;
    let m;
    while ((m = compiled[0].compiledRegex.exec(sampleText)) !== null) {
      findings.push({ match: m[0], start: m.index, end: m.index + m[0].length });
      if (findings.length > 50) break; // safety limit
    }
    return { matches: findings, count: findings.length };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Validate a regex pattern string.
 */
function validateRegex(pattern) {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Build a custom pattern from a list of keywords (bulk import).
 * Generates one regex pattern that matches any of the keywords.
 */
function buildFromKeywordList(id, label, keywords, severity = "HIGH") {
  const escaped = keywords
    .map(k => k.trim())
    .filter(Boolean)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (escaped.length === 0) return null;

  return {
    id,
    label,
    type: "regex",
    pattern: `\\b(?:${escaped.join("|")})\\b`,
    severity,
    redactAs: `[REDACTED-${id.toUpperCase()}]`,
    enabled: true,
    category: "TRADE_SECRET",
    sourceKeywords: keywords
  };
}




// ── src/utils/contextAnalyzer.js ──
/**
 * contextAnalyzer.js
 *
 * Sliding-window context analysis layer.
 * Purpose:
 *   1. Reduce false positives by checking surrounding context before flagging
 *   2. Detect semantic leaks regex/NER miss (conversations about internal projects,
 *      code review of proprietary systems, etc.)
 *   3. Score the overall "sensitivity" of a prompt as a whole
 *   4. Detect evasion attempts (encoding tricks, deliberate obfuscation)
 */

// ─── Context Window ───────────────────────────────────────────────────
const WINDOW_SIZE = 80; // characters each side of a match to examine

/**
 * Run context checks on a set of regex/NER findings.
 * Returns filtered findings with false positives removed or downgraded.
 *
 * @param {string} text
 * @param {Finding[]} findings
 * @returns {{ findings: Finding[], contextSignals: ContextSignal[] }}
 */
function analyzeContext(text, findings) {
  const contextSignals = detectContextSignals(text);
  const filtered = [];

  for (const finding of findings) {
    const ctx = getContext(text, finding.start, finding.end);
    const verdict = evaluateFinding(finding, ctx, contextSignals);

    if (verdict.keep) {
      filtered.push({
        ...finding,
        severity: verdict.upgradedSeverity || finding.severity,
        contextNote: verdict.note || null
      });
    }
  }

  // Add context-only findings (no specific match, but high-risk overall)
  const contextOnlyFindings = buildContextOnlyFindings(text, contextSignals, filtered);
  filtered.push(...contextOnlyFindings);

  return { findings: filtered, contextSignals };
}

// ─── Context Extraction ───────────────────────────────────────────────
function getContext(text, start, end) {
  return {
    before: text.slice(Math.max(0, start - WINDOW_SIZE), start).toLowerCase(),
    match: text.slice(start, end),
    after: text.slice(end, Math.min(text.length, end + WINDOW_SIZE)).toLowerCase(),
    full: text.slice(Math.max(0, start - WINDOW_SIZE), Math.min(text.length, end + WINDOW_SIZE)).toLowerCase()
  };
}

// ─── False Positive Suppression Rules ────────────────────────────────
const FP_RULES = {
  // IP address false positives
  "ip_address": [
    { pattern: /(?:version|v\d|localhost|loopback|subnet|netmask|gateway|broadcast|cidr)/i, action: "suppress" },
    { pattern: /127\.0\.0\.|192\.168\.|10\.\d+\.\d+\.|172\.(1[6-9]|2\d|3[01])\./,        action: "suppress", note: "Private IP range" }
  ],
  // Email false positives
  "email": [
    { pattern: /(?:example|test|sample|placeholder|fake|dummy|noreply|no-reply)/i, action: "suppress" },
    { pattern: /@(?:example\.com|test\.com|domain\.com|yourcompany\.com|acme\.com)/i, action: "suppress" }
  ],
  // Passport number false positives
  "passport": [
    { pattern: /(?:license|registration|serial|model|version|reference|invoice|order|ticket)/i, action: "suppress" },
    { pattern: /(?:product|part|item|sku|upc|barcode|code)/i, action: "suppress" }
  ],
  // SSN false positives (zip-like numbers)
  "ssn": [
    { pattern: /(?:zip|postal|area code|routing|account)/i, action: "suppress" }
  ],
  // IBAN false positives
  "iban": [
    { pattern: /(?:country code|iso|locale|language|region)/i, action: "suppress" }
  ],
  // Generic secret false positives
  "generic_secret": [
    { pattern: /(?:example|demo|placeholder|your[-_]?(?:key|token|secret)|insert[-_]?here)/i, action: "suppress" },
    { pattern: /(?:xxxxxxxx|aaaaaa|123456|test)/i, action: "suppress" }
  ],
  "entropy_secret": [
    { pattern: /(?:hash|sha|md5|checksum|uuid|example|lorem|ipsum|base64)/i, action: "suppress" }
  ]
};

// Context signals that UPGRADE severity
const UPGRADE_SIGNALS = [
  { pattern: /(?:production|prod|live|customer|client|patient|employee|confidential|internal only|do not share|proprietary)/i, upgradeTo: null, note: "Production/sensitive context detected" },
  { pattern: /(?:medical|health|diagnosis|prescription|ssn|social security|hipaa|phi|pii)/i, upgradeTo: "HIGH", note: "Healthcare/regulated data context" },
  { pattern: /(?:wire transfer|bank transfer|routing number|swift|bic|aba|account number)/i, upgradeTo: "CRITICAL", note: "Financial transaction context" },
  { pattern: /(?:classified|top secret|secret|confidential|restricted|need to know)/i, upgradeTo: "CRITICAL", note: "Classified/confidential context signal" }
];

function evaluateFinding(finding, ctx, contextSignals) {
  // Check false positive rules for this pattern
  const rules = FP_RULES[finding.patternId] || [];
  for (const rule of rules) {
    if (rule.pattern.test(ctx.full)) {
      if (rule.action === "suppress") {
        return { keep: false, note: rule.note || "Suppressed: likely false positive" };
      }
      if (rule.action === "downgrade") {
        return { keep: true, upgradedSeverity: "LOW", note: rule.note };
      }
    }
  }

  // Check for severity upgrades
  let upgradedSeverity = null;
  const notes = [];
  for (const signal of UPGRADE_SIGNALS) {
    if (signal.pattern.test(ctx.full)) {
      if (signal.upgradeTo) {
        const sOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        if ((sOrder[signal.upgradeTo] || 0) > (sOrder[upgradedSeverity || finding.severity] || 0)) {
          upgradedSeverity = signal.upgradeTo;
        }
      }
      notes.push(signal.note);
    }
  }

  return {
    keep: true,
    upgradedSeverity: upgradedSeverity || null,
    note: notes.join("; ") || null
  };
}

// ─── Context Signal Detection ─────────────────────────────────────────
const CONTEXT_SIGNAL_RULES = [
  {
    id: "internal_project",
    label: "Internal Project Discussion",
    severity: "MEDIUM",
    patterns: [/roadmap|sprint|backlog|jira|confluence|ticket|milestone|release plan|feature flag|a\/b test/i],
    minMatches: 2
  },
  {
    id: "hr_data",
    label: "HR / People Data",
    severity: "HIGH",
    patterns: [/performance review|compensation|salary band|headcount|termination|hire date|offer letter|onboarding|probation|pip\b/i],
    minMatches: 1
  },
  {
    id: "ma_activity",
    label: "M&A / Deal Activity",
    severity: "CRITICAL",
    patterns: [/acquisition|merger|due diligence|term sheet|loi\b|letter of intent|nda|non.?disclosure|valuation|cap table|vesting|equity stake/i],
    minMatches: 1
  },
  {
    id: "security_credentials_context",
    label: "Security/Auth Context",
    severity: "HIGH",
    patterns: [/oauth|saml|sso|ldap|active directory|kerberos|certificate|public key|private key|two.?factor|mfa\b|totp|auth token/i],
    minMatches: 1
  },
  {
    id: "bulk_pii",
    label: "Bulk PII (Multiple People)",
    severity: "CRITICAL",
    patterns: [/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g],
    minMatches: 5,  // 5+ emails = bulk PII export
    isBulk: true
  },
  {
    id: "database_dump",
    label: "Possible Database Dump",
    severity: "CRITICAL",
    patterns: [
      /INSERT INTO/i,
      /SELECT \*/i,
      /CREATE TABLE/i,
      /ALTER TABLE/i,
      /DROP TABLE/i,
      /BEGIN TRANSACTION/i
    ],
    minMatches: 2
  },
  {
    id: "source_code_leak",
    label: "Proprietary Source Code",
    severity: "HIGH",
    patterns: [
      /(?:class|function|def|const|let|var)\s+[A-Za-z][A-Za-z0-9_]{4,}/i,
      /(?:import|require|from)\s*[\s('"]/i,
      /(?:\/\/ TODO|\/\/ FIXME|\/\/ HACK|# noqa|# type: ignore)/i
    ],
    minMatches: 3
  },
  {
    id: "evasion_attempt",
    label: "Possible Evasion Attempt",
    severity: "HIGH",
    patterns: [
      /[A-Za-z0-9+/]{20,}={0,2}(?=\s|$)/,   // base64 blobs
      /(?:%[0-9A-Fa-f]{2}){8,}/,              // URL-encoded sequences
      /(?:&#x?[0-9A-Fa-f]+;){4,}/,            // HTML entity encoding
      /(?:\\u[0-9A-Fa-f]{4}){4,}/             // Unicode escape sequences
    ],
    minMatches: 1
  }
];

function detectContextSignals(text) {
  const signals = [];
  const lower = text.toLowerCase();

  for (const rule of CONTEXT_SIGNAL_RULES) {
    let totalMatches = 0;

    for (const pat of rule.patterns) {
      if (rule.isBulk) {
        const matches = text.match(pat) || [];
        totalMatches += matches.length;
      } else {
        pat.lastIndex = 0;
        if (pat.test(text)) totalMatches++;
        pat.lastIndex = 0;
      }
    }

    if (totalMatches >= rule.minMatches) {
      signals.push({
        id: rule.id,
        label: rule.label,
        severity: rule.severity,
        matchCount: totalMatches
      });
    }
  }

  return signals;
}

// ─── Context-Only Findings ────────────────────────────────────────────
function buildContextOnlyFindings(text, contextSignals, existingFindings) {
  const findings = [];

  for (const signal of contextSignals) {
    // Don't double-flag things already caught by regex/NER
    const alreadyCovered = existingFindings.some(f => f.patternId === signal.id);
    if (alreadyCovered) continue;

    // Only surface HIGH+ context signals as findings
    if (signal.severity === "LOW" || signal.severity === "MEDIUM") continue;

    findings.push({
      patternId: `ctx_${signal.id}`,
      category: "CONTEXT",
      label: signal.label,
      severity: signal.severity,
      redactAs: null,   // context findings trigger warnings, not inline redaction
      match: signal.label,
      start: 0,
      end: 0,
      source: "context_analyzer",
      isContextual: true,
      contextSignal: signal
    });
  }

  return findings;
}

// ─── Evasion Detection ────────────────────────────────────────────────

/**
 * Normalize text to counter common evasion techniques before scanning.
 * @param {string} text
 * @returns {string} normalized text
 */
function normalizeText(text) {
  let normalized = text;

  // Decode URL encoding
  try { normalized = decodeURIComponent(normalized.replace(/\+/g, " ")); } catch (_) {}

  // Decode HTML entities
  normalized = normalized
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));

  // Decode Unicode escapes
  normalized = normalized.replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));

  // Normalize Unicode lookalikes (e.g., Cyrillic 'а' → Latin 'a')
  normalized = normalized.normalize("NFKC");

  // Decode suspicious base64 blobs (only try if they look like secrets)
  normalized = normalized.replace(/[A-Za-z0-9+/]{30,}={0,2}/g, (blob) => {
    try {
      const decoded = atob(blob);
      // Only replace if decoded looks like it could contain secrets
      if (/[A-Za-z0-9_\-]{10,}/.test(decoded) && isPrintable(decoded)) {
        return decoded + " /* base64-decoded */";
      }
    } catch (_) {}
    return blob;
  });

  return normalized;
}

function isPrintable(str) {
  return [...str].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127);
}

// ─── Prompt Sensitivity Score ─────────────────────────────────────────
/**
 * Compute an overall sensitivity score (0–100) for a prompt.
 * Used for analytics and adaptive policy thresholds.
 */
function scoreSensitivity(findings, contextSignals) {
  const SEVERITY_WEIGHTS = { CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3 };
  const SIGNAL_WEIGHTS = { CRITICAL: 20, HIGH: 12, MEDIUM: 5, LOW: 2 };

  let score = 0;
  for (const f of findings) {
    if (!f.isContextual) score += SEVERITY_WEIGHTS[f.severity] || 0;
  }
  for (const s of contextSignals) {
    score += SIGNAL_WEIGHTS[s.severity] || 0;
  }

  return Math.min(100, score);
}




// ── src/utils/nerEngine.js ──
/**
 * nerEngine.js
 * Named Entity Recognition engine.
 *
 * Architecture: Two-layer detection
 *   Layer 1 — Heuristic NER: Fast, zero-dependency rules that catch
 *             names, addresses, org data regex can't see.
 *   Layer 2 — ONNX Runtime: Plug-in slot for a real distilBERT NER
 *             model (loads asynchronously, enhances Layer 1).
 *
 * The heuristic layer runs synchronously on every prompt.
 * The ONNX layer runs when a model is loaded (enterprise deployments).
 */

// ─── ONNX Model Slot ─────────────────────────────────────────────────
// Replace with actual onnxruntime-web integration when deploying with model file
let onnxSession = null;
let onnxTokenizer = null;

/**
 * Load an ONNX NER model (call once at startup in enterprise deployments).
 * Model: distilbert-base-cased fine-tuned on CoNLL-2003 + custom PII dataset.
 * Expected labels: O, B-PER, I-PER, B-ORG, I-ORG, B-LOC, I-LOC, B-PII, I-PII
 *
 * @param {string} modelUrl - URL or chrome.runtime.getURL path to model.onnx
 * @param {object} vocab     - Tokenizer vocab JSON
 */
async function loadONNXModel(modelUrl, vocab) {
  try {
    // Dynamic import — only available when onnxruntime-web is bundled
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = chrome.runtime.getURL("wasm/");
    onnxSession = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    onnxTokenizer = buildTokenizer(vocab);
    console.log("[NER] ONNX model loaded successfully");
    return true;
  } catch (e) {
    console.warn("[NER] ONNX model unavailable, using heuristic layer only:", e.message);
    return false;
  }
}

/**
 * Run ONNX inference on a tokenized input.
 * Returns array of { token, label, score } objects.
 */
async function runONNXInference(text) {
  if (!onnxSession || !onnxTokenizer) return null;

  try {
    const { inputIds, attentionMask, tokenMap } = onnxTokenizer.encode(text, 512);
    const ort = await import("onnxruntime-web");

    const feeds = {
      input_ids: new ort.Tensor("int64", BigInt64Array.from(inputIds.map(BigInt)), [1, inputIds.length]),
      attention_mask: new ort.Tensor("int64", BigInt64Array.from(attentionMask.map(BigInt)), [1, attentionMask.length])
    };

    const output = await onnxSession.run(feeds);
    const logits = output.logits.data; // shape: [1, seq_len, num_labels]
    const seqLen = inputIds.length;
    const numLabels = logits.length / seqLen;

    const LABELS = ["O", "B-PER", "I-PER", "B-ORG", "I-ORG", "B-LOC", "I-LOC", "B-PII", "I-PII"];
    const entities = [];
    let currentEntity = null;

    for (let i = 0; i < seqLen; i++) {
      const start = i * numLabels;
      const scores = Array.from(logits.slice(start, start + numLabels));
      const maxIdx = scores.indexOf(Math.max(...scores));
      const label = LABELS[maxIdx] || "O";
      const score = softmax(scores)[maxIdx];

      const tokenSpan = tokenMap[i];
      if (!tokenSpan || label === "O") {
        if (currentEntity) { entities.push(currentEntity); currentEntity = null; }
        continue;
      }

      if (label.startsWith("B-")) {
        if (currentEntity) entities.push(currentEntity);
        currentEntity = {
          type: label.slice(2),
          text: text.slice(tokenSpan.start, tokenSpan.end),
          start: tokenSpan.start,
          end: tokenSpan.end,
          score
        };
      } else if (label.startsWith("I-") && currentEntity) {
        currentEntity.text = text.slice(currentEntity.start, tokenSpan.end);
        currentEntity.end = tokenSpan.end;
        currentEntity.score = Math.min(currentEntity.score, score);
      }
    }
    if (currentEntity) entities.push(currentEntity);
    return entities;
  } catch (e) {
    console.warn("[NER] ONNX inference failed:", e.message);
    return null;
  }
}

function softmax(arr) {
  const max = Math.max(...arr);
  const exp = arr.map(x => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(x => x / sum);
}

// ─── Heuristic NER Layer ─────────────────────────────────────────────

/**
 * Master scan function — runs heuristic NER, then augments with ONNX if available.
 * @param {string} text
 * @returns {NERFinding[]}
 */
async function nerScan(text) {
  if (!text || text.trim().length < 3) return [];

  // Layer 1: always runs
  const heuristicFindings = heuristicNER(text);

  // Layer 2: ONNX (if model loaded)
  if (onnxSession) {
    try {
      const onnxEntities = await runONNXInference(text);
      if (onnxEntities) {
        return mergeFindings(heuristicFindings, onnxEntities.map(e => onnxEntityToFinding(e)));
      }
    } catch (_) { /* fall through */ }
  }

  return heuristicFindings;
}

/**
 * Synchronous heuristic scan (used in real-time interception path).
 */
function nerScanSync(text) {
  if (!text || text.trim().length < 3) return [];
  return heuristicNER(text);
}

// ─── Heuristic NER Implementation ────────────────────────────────────

const PERSON_NAME_TRIGGERS = [
  "my name is", "i'm", "i am", "call me", "this is",
  "name:", "patient:", "employee:", "user:", "contact:",
  "from:", "to:", "cc:", "dear", "hi ", "hello ",
  "signed by", "submitted by", "authorized by", "reviewed by",
  "written by", "prepared by", "attention:"
];

const ADDRESS_TRIGGERS = [
  "address:", "street:", "city:", "zip:", "postal:", "located at",
  "lives at", "residing at", "mailing address", "billing address",
  "shipping to", "send to", "deliver to", "home address", "office at"
];

const MEDICAL_TRIGGERS = [
  "patient", "diagnosis", "prescribed", "medication", "dosage",
  "condition", "treatment", "symptoms", "allergic to", "dob",
  "date of birth", "mrn", "medical record", "insurance id",
  "health plan", "physician", "dr.", "doctor", "clinic", "hospital"
];

const FINANCIAL_CONTEXT_TRIGGERS = [
  "salary", "income", "revenue", "profit", "loss", "budget",
  "earnings", "bonus", "compensation", "net worth", "valuation",
  "acquisition price", "deal value", "term sheet", "series a",
  "series b", "raise", "funding", "investment"
];

// Common English given names (top 500 condensed to ~150 high-signal ones)
const COMMON_FIRST_NAMES = new Set([
  "james","john","robert","michael","william","david","richard","joseph","charles","thomas",
  "mary","patricia","jennifer","linda","barbara","elizabeth","susan","jessica","sarah","karen",
  "christopher","daniel","matthew","anthony","donald","mark","paul","steven","andrew","kenneth",
  "emily","stephanie","amanda","melissa","deborah","carol","dorothy","helen","angela","sharon",
  "joshua","kevin","brian","george","edward","ronald","timothy","jason","jeffrey","ryan",
  "rachel","nicole","emma","lisa","sandra","ashley","betty","margaret","nancy","kimberly",
  "jacob","gary","eric","jonathan","stephen","larry","justin","scott","brandon","benjamin",
  "hannah","amanda","olivia","madison","victoria","sophia","abigail","isabella","grace","chloe",
  "samantha","natalie","lauren","brittany","amber","danielle","megan","alexis","kayla","alyssa",
  "ahmed","ali","muhammad","fatima","aisha","priya","raj","neha","arjun","deepa",
  "wei","li","zhang","yang","liu","wang","chen","lin","wu","zhou",
  "carlos","maria","jose","juan","ana","pedro","isabel","miguel","sofia","luis"
]);

// Common surnames (signal: capitalized after trigger)
const SURNAME_INDICATORS = /^[A-Z][a-z]{2,15}(?:-[A-Z][a-z]{2,10})?$/;

/**
 * Main heuristic NER function
 */
function heuristicNER(text) {
  const findings = [];
  const lower = text.toLowerCase();

  // ── 1. Person Name Detection ────────────────────────────────────
  for (const trigger of PERSON_NAME_TRIGGERS) {
    const idx = lower.indexOf(trigger);
    if (idx === -1) continue;

    const afterTrigger = text.slice(idx + trigger.length).trimStart();
    const nameMatch = afterTrigger.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/);
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();
    const parts = name.split(/\s+/);

    // Validate: at least one part must be a known first name OR both parts are title-cased
    const hasKnownFirst = COMMON_FIRST_NAMES.has(parts[0]?.toLowerCase());
    const allTitleCase = parts.every(p => /^[A-Z][a-z]{1,}$/.test(p));

    if (parts.length >= 2 && (hasKnownFirst || allTitleCase)) {
      const startOffset = text.indexOf(name, idx + trigger.length);
      if (startOffset !== -1) {
        findings.push({
          patternId: "ner_person_name",
          category: "PII",
          label: "Person Name",
          severity: "MEDIUM",
          redactAs: "[REDACTED-NAME]",
          match: name,
          start: startOffset,
          end: startOffset + name.length,
          source: "ner_heuristic",
          triggerContext: trigger
        });
      }
    }
  }

  // ── 2. Physical Address Detection ──────────────────────────────
  // Match: street number + street name pattern
  const streetRx = /\b(\d{1,5})\s+([A-Z][a-zA-Z\s]{3,30})\s+(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir|Trail|Trl|Highway|Hwy|Parkway|Pkwy|Terrace|Ter|Square|Sq|Loop|Run|Row|Pass|Path)\.?(?:,?\s+(?:Apt|Suite|Unit|Ste|#)\s*[\w-]+)?\b/g;
  let m;
  while ((m = streetRx.exec(text)) !== null) {
    // Verify there's a city/state/zip nearby
    const lookAhead = text.slice(m.index, m.index + m[0].length + 60);
    const hasCityState = /,\s*[A-Z][a-z]+,?\s+[A-Z]{2}(?:\s+\d{5})?/.test(lookAhead);
    const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(lookAhead);

    if (hasCityState || hasZip) {
      findings.push({
        patternId: "ner_address",
        category: "PII",
        label: "Physical Address",
        severity: "HIGH",
        redactAs: "[REDACTED-ADDRESS]",
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        source: "ner_heuristic"
      });
    }
  }

  // ── 3. Address from trigger words ──────────────────────────────
  for (const trigger of ADDRESS_TRIGGERS) {
    const idx = lower.indexOf(trigger);
    if (idx === -1) continue;
    const after = text.slice(idx + trigger.length, idx + trigger.length + 120);
    const zipMatch = after.match(/\d{5}(?:-\d{4})?/);
    if (zipMatch && after.length > 10) {
      const addrText = after.slice(0, zipMatch.index + zipMatch[0].length).trim();
      if (addrText.length > 5) {
        const startOffset = idx + trigger.length + (after.length - after.trimStart().length);
        findings.push({
          patternId: "ner_address_context",
          category: "PII",
          label: "Physical Address (Context)",
          severity: "HIGH",
          redactAs: "[REDACTED-ADDRESS]",
          match: addrText,
          start: startOffset,
          end: startOffset + addrText.length,
          source: "ner_heuristic"
        });
      }
    }
  }

  // ── 4. Medical / PHI Detection ──────────────────────────────────
  let medicalScore = 0;
  const foundMedTerms = [];
  for (const trigger of MEDICAL_TRIGGERS) {
    if (lower.includes(trigger)) {
      medicalScore++;
      foundMedTerms.push(trigger);
    }
  }

  if (medicalScore >= 2) {
    // Look for MRN / patient ID patterns
    const mrnRx = /\b(?:MRN|Patient\s*ID|Chart\s*#?|Record\s*#?)\s*:?\s*([A-Z0-9\-]{4,20})\b/gi;
    while ((m = mrnRx.exec(text)) !== null) {
      findings.push({
        patternId: "ner_medical_id",
        category: "PII",
        label: "Medical Record Number",
        severity: "CRITICAL",
        redactAs: "[REDACTED-MEDICAL-ID]",
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        source: "ner_heuristic"
      });
    }

    // If multiple medical terms in a short text — flag the whole context
    if (medicalScore >= 3 && text.length < 2000) {
      findings.push({
        patternId: "ner_phi_context",
        category: "PII",
        label: "Protected Health Information (PHI) Context",
        severity: "HIGH",
        redactAs: null, // Context finding — triggers WARN not redaction
        match: foundMedTerms.join(", "),
        start: 0,
        end: 0,
        source: "ner_heuristic",
        isContextual: true
      });
    }
  }

  // ── 5. Financial Sensitive Context ─────────────────────────────
  let finScore = 0;
  const foundFinTerms = [];
  for (const trigger of FINANCIAL_CONTEXT_TRIGGERS) {
    if (lower.includes(trigger)) {
      finScore++;
      foundFinTerms.push(trigger);
    }
  }

  if (finScore >= 2) {
    // Look for dollar amounts in financial context
    const dollarRx = /\$\s?[\d,]+(?:\.\d{2})?(?:\s?(?:million|billion|M|B|K))?\b/g;
    while ((m = dollarRx.exec(text)) !== null) {
      findings.push({
        patternId: "ner_financial_amount",
        category: "FINANCIAL",
        label: "Financial Amount (Sensitive Context)",
        severity: "HIGH",
        redactAs: "[REDACTED-AMOUNT]",
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        source: "ner_heuristic"
      });
    }
  }

  // ── 6. Employee / Internal ID Detection ────────────────────────
  const empIdRx = /\b(?:employee|emp|staff|badge|worker|id)\s*#?\s*:?\s*([A-Z]{0,3}[0-9]{4,10})\b/gi;
  while ((m = empIdRx.exec(text)) !== null) {
    findings.push({
      patternId: "ner_employee_id",
      category: "PII",
      label: "Employee ID",
      severity: "MEDIUM",
      redactAs: "[REDACTED-EMP-ID]",
      match: m[0],
      start: m.index,
      end: m.index + m[0].length,
      source: "ner_heuristic"
    });
  }

  // ── 7. Vehicle Identification Numbers (VIN) ─────────────────────
  const vinRx = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
  while ((m = vinRx.exec(text)) !== null) {
    if (isValidVIN(m[0])) {
      findings.push({
        patternId: "ner_vin",
        category: "PII",
        label: "Vehicle Identification Number (VIN)",
        severity: "MEDIUM",
        redactAs: "[REDACTED-VIN]",
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        source: "ner_heuristic"
      });
    }
  }

  // ── 8. Email in medical/HR context (elevate severity) ──────────
  // (Normal emails are MEDIUM; in a medical context, they become HIGH)
  if (medicalScore >= 1 || lower.includes("patient") || lower.includes("employee record")) {
    const emailRx = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
    while ((m = emailRx.exec(text)) !== null) {
      findings.push({
        patternId: "ner_email_elevated",
        category: "PII",
        label: "Email (Sensitive Context)",
        severity: "HIGH",
        redactAs: "[REDACTED-EMAIL]",
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        source: "ner_context_elevation"
      });
    }
  }

  return deduplicateNERFindings(findings);
}

// ─── VIN Validator ────────────────────────────────────────────────────
function isValidVIN(vin) {
  if (vin.length !== 17) return false;
  const transliterate = {
    A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8,
    J:1, K:2, L:3, M:4, N:5, P:7, R:9,
    S:2, T:3, U:4, V:5, W:6, X:7, Y:8, Z:9
  };
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const val = isNaN(ch) ? (transliterate[ch] || 0) : parseInt(ch);
    sum += val * weights[i];
  }
  const check = vin[8];
  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return check === expected;
}

// ─── Merge + Dedup ────────────────────────────────────────────────────
function deduplicateNERFindings(findings) {
  const result = [];
  for (const f of findings) {
    if (f.isContextual) { result.push(f); continue; }
    const overlap = result.find(
      r => !r.isContextual && !(f.end <= r.start || f.start >= r.end)
    );
    if (!overlap) {
      result.push(f);
    } else {
      const SORDER = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      if ((SORDER[f.severity] || 0) > (SORDER[overlap.severity] || 0)) {
        result.splice(result.indexOf(overlap), 1, f);
      }
    }
  }
  return result;
}

function mergeFindings(heuristic, onnx) {
  const combined = [...heuristic];
  for (const of of onnx) {
    const overlap = combined.find(h => !(of.end <= h.start || of.start >= h.end));
    if (!overlap) combined.push(of);
  }
  return combined;
}

function onnxEntityToFinding(entity) {
  const typeMap = {
    PER: { patternId: "onnx_person", label: "Person Name (AI)", category: "PII", severity: "MEDIUM", redactAs: "[REDACTED-NAME]" },
    ORG: { patternId: "onnx_org", label: "Organization (AI)", category: "PII", severity: "LOW", redactAs: "[REDACTED-ORG]" },
    LOC: { patternId: "onnx_location", label: "Location (AI)", category: "PII", severity: "LOW", redactAs: "[REDACTED-LOCATION]" },
    PII: { patternId: "onnx_pii", label: "PII (AI)", category: "PII", severity: "HIGH", redactAs: "[REDACTED-PII]" }
  };
  const meta = typeMap[entity.type] || typeMap.PII;
  return { ...meta, match: entity.text, start: entity.start, end: entity.end, source: "onnx", confidence: entity.score };
}

// ─── Tokenizer stub (used with real ONNX model) ───────────────────────
function buildTokenizer(vocab) {
  return {
    encode(text, maxLen = 512) {
      const words = text.split(/(\s+|(?=[^a-zA-Z0-9])|(?<=[^a-zA-Z0-9]))/).filter(Boolean);
      const inputIds = [101]; // [CLS]
      const attentionMask = [1];
      const tokenMap = [null];
      let charOffset = 0;

      for (const word of words) {
        if (inputIds.length >= maxLen - 1) break;
        const id = vocab[word] || vocab["[UNK]"] || 100;
        inputIds.push(id);
        attentionMask.push(1);
        tokenMap.push({ start: charOffset, end: charOffset + word.length });
        charOffset += word.length;
      }

      inputIds.push(102); // [SEP]
      attentionMask.push(1);
      tokenMap.push(null);

      return { inputIds, attentionMask, tokenMap };
    }
  };
}




// ── src/utils/patterns.js ──
/**
 * patterns.js
 * Complete sensitive data pattern library.
 * Each pattern has: id, category, label, regex, severity, redactAs, and an optional validator.
 */

const PATTERNS = [
  // ── API KEYS & SECRETS ──────────────────────────────────────────────
  {
    id: "aws_access_key",
    category: "API_KEY",
    label: "AWS Access Key",
    regex: /\b(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-AWS-KEY]"
  },
  {
    id: "aws_secret_key",
    category: "API_KEY",
    label: "AWS Secret Key",
    regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-AWS-SECRET]",
    requiresEntropy: true,
    minEntropy: 4.5
  },
  {
    id: "github_token",
    category: "API_KEY",
    label: "GitHub Token",
    regex: /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{36,255}\b/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-GITHUB-TOKEN]"
  },
  {
    id: "openai_key",
    category: "API_KEY",
    label: "OpenAI API Key",
    regex: /\bsk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}\b/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-OPENAI-KEY]"
  },
  {
    id: "openai_key_v2",
    category: "API_KEY",
    label: "OpenAI API Key (v2)",
    regex: /\bsk-proj-[A-Za-z0-9_-]{40,}\b/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-OPENAI-KEY]"
  },
  {
    id: "stripe_key",
    category: "API_KEY",
    label: "Stripe API Key",
    regex: /\b(sk|pk)[_-](test|live)[_-][A-Za-z0-9]{24,}\b/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-STRIPE-KEY]"
  },
  {
    id: "google_api_key",
    category: "API_KEY",
    label: "Google API Key",
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    severity: "HIGH",
    redactAs: "[REDACTED-GOOGLE-KEY]"
  },
  {
    id: "slack_token",
    category: "API_KEY",
    label: "Slack Token",
    regex: /\b(xox[baprs]-[A-Za-z0-9-]{10,48})\b/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-SLACK-TOKEN]"
  },
  {
    id: "jwt_token",
    category: "API_KEY",
    label: "JWT Token",
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    severity: "HIGH",
    redactAs: "[REDACTED-JWT]"
  },
  {
    id: "private_key",
    category: "API_KEY",
    label: "Private Key (PEM)",
    regex: /-----BEGIN\s(RSA\s|EC\s|OPENSSH\s|DSA\s|PGP\s)?PRIVATE KEY-----[\s\S]*?-----END\s(RSA\s|EC\s|OPENSSH\s|DSA\s|PGP\s)?PRIVATE KEY-----/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-PRIVATE-KEY]"
  },
  {
    id: "generic_secret",
    category: "API_KEY",
    label: "Generic Secret/Token",
    regex: /(?:secret|token|api[_-]?key|auth[_-]?key|access[_-]?key)\s*[:=]\s*['"]?([A-Za-z0-9_\-\.]{16,64})['"]?/gi,
    severity: "HIGH",
    redactAs: "[REDACTED-SECRET]",
    captureGroup: 1
  },

  // ── CREDENTIALS ────────────────────────────────────────────────────
  {
    id: "password_in_text",
    category: "CREDENTIAL",
    label: "Password in Text",
    regex: /(?:password|passwd|pwd)\s*(?:[:=]|is|are)\s*['"]?([^\s'"]{6,64})['"]?/gi,
    severity: "CRITICAL",
    redactAs: "[REDACTED-PASSWORD]",
    captureGroup: 1
  },
  {
    id: "db_connection_string",
    category: "CREDENTIAL",
    label: "Database Connection String",
    regex: /(?:mongodb|postgresql|mysql|redis|mssql|oracle):\/\/[^\s"']+/gi,
    severity: "CRITICAL",
    redactAs: "[REDACTED-DB-URI]"
  },
  {
    id: "basic_auth_header",
    category: "CREDENTIAL",
    label: "Basic Auth Header",
    regex: /Authorization:\s*Basic\s+[A-Za-z0-9+/=]{8,}/gi,
    severity: "CRITICAL",
    redactAs: "[REDACTED-AUTH-HEADER]"
  },

  // ── PII — PERSONAL ─────────────────────────────────────────────────
  {
    id: "email",
    category: "PII",
    label: "Email Address",
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    severity: "MEDIUM",
    redactAs: "[REDACTED-EMAIL]"
  },
  {
    id: "ssn",
    category: "PII",
    label: "Social Security Number",
    regex: /\b(?!000|666|9\d{2})\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-SSN]"
  },
  {
    id: "phone_us",
    category: "PII",
    label: "Phone Number (US)",
    regex: /(?<!\d)(?:\+1[\s-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\d)/g,
    severity: "MEDIUM",
    redactAs: "[REDACTED-PHONE]"
  },
  {
    id: "phone_india",
    category: "PII",
    label: "Phone Number (India)",
    regex: /(?<!\d)(?:\+91[\s-])[6-9]\d{9}(?!\d)/g,
    severity: "MEDIUM",
    redactAs: "[REDACTED-PHONE]"
  },
  {
    id: "passport",
    category: "PII",
    label: "Passport Number",
    regex: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,
    severity: "HIGH",
    redactAs: "[REDACTED-PASSPORT]"
  },
  {
    id: "dob",
    category: "PII",
    label: "Date of Birth",
    regex: /\b(?:dob|date of birth|born on|birthday)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    severity: "MEDIUM",
    redactAs: "[REDACTED-DOB]",
    captureGroup: 1
  },
  {
    id: "ip_address",
    category: "PII",
    label: "IP Address",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    severity: "LOW",
    redactAs: "[REDACTED-IP]"
  },

  // ── PII — FINANCIAL ────────────────────────────────────────────────
  {
    id: "credit_card",
    category: "FINANCIAL",
    label: "Credit Card Number",
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})(?:[- ]?[0-9]{4})?\b/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-CARD]",
    validator: luhnCheck
  },
  {
    id: "iban",
    category: "FINANCIAL",
    label: "IBAN",
    regex: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}(?:[A-Z0-9]?){0,16}\b/g,
    severity: "HIGH",
    redactAs: "[REDACTED-IBAN]"
  },
  {
    id: "cvv",
    category: "FINANCIAL",
    label: "CVV / Security Code",
    regex: /\b(?:cvv|cvv2|cvc|csc|security code)\s*:?\s*([0-9]{3,4})\b/gi,
    severity: "CRITICAL",
    redactAs: "[REDACTED-CVV]",
    captureGroup: 1
  },

  // ── SOURCE CODE SECRETS ────────────────────────────────────────────
  {
    id: "env_var_secret",
    category: "CODE_SECRET",
    label: ".env Secret Variable",
    regex: /^(?:export\s+)?(?:[A-Z_]{4,50}(?:KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|CERT|PRIVATE)[A-Z_]*)=.+$/gm,
    severity: "HIGH",
    redactAs: "[REDACTED-ENV-SECRET]"
  },
  {
    id: "hardcoded_bearer",
    category: "CODE_SECRET",
    label: "Bearer Token in Code",
    regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    severity: "HIGH",
    redactAs: "[REDACTED-BEARER-TOKEN]"
  },
  {
    id: "ssh_private_key",
    category: "CODE_SECRET",
    label: "SSH Private Key",
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]+?-----END OPENSSH PRIVATE KEY-----/g,
    severity: "CRITICAL",
    redactAs: "[REDACTED-SSH-KEY]"
  }
];

/**
 * Luhn algorithm check for credit card validation
 */
function luhnCheck(num) {
  const digits = num.replace(/\D/g, "");
  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i]);
    if (isEven) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

/**
 * Shannon entropy calculation to detect high-entropy secrets
 */
function shannonEntropy(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}




// ── src/utils/dlpEngine.js ──
/**
 * dlpEngine.js
 * Core detection and redaction engine — Phase 2.
 *
 * Detection layers (all on-device, zero data transmitted):
 *   Layer 1 — Regex pattern library (fast, deterministic)
 *   Layer 2 — Heuristic NER (names, addresses, medical, financial context)
 *   Layer 3 — Context analyzer (false positive suppression, severity upgrades, evasion detection)
 *   Layer 4 — Custom patterns (admin-defined keywords, trade secrets, org-specific data)
 *
 * All layers run before any text leaves the device.
 */






const ENTROPY_THRESHOLD = 4.2;
const MIN_ENTROPY_LENGTH = 20;

/**
 * Main scan function — runs all 4 detection layers.
 * @param {string} rawText - Raw prompt text to scan
 * @param {object} config  - Active policy config
 * @returns {{ findings, redactedText, riskLevel, sensitivityScore, contextSignals }}
 */
function scan(rawText, config = {}) {
  if (!rawText || rawText.trim().length < 4) {
    return { findings: [], redactedText: rawText, riskLevel: "NONE", sensitivityScore: 0, contextSignals: [] };
  }

  const enabledCategories = config.enabledCategories || [
    "API_KEY", "CREDENTIAL", "PII", "FINANCIAL", "CODE_SECRET", "TRADE_SECRET", "CONTEXT"
  ];

  // ── Pre-processing: normalize to defeat evasion ──────────────────
  const normalizedText = normalizeText(rawText);
  // If normalization changed the text, scan the normalized version
  const textToScan = normalizedText !== rawText ? normalizedText : rawText;

  // ── Layer 1: Regex pattern library ──────────────────────────────
  const regexFindings = runRegexLayer(textToScan, enabledCategories);

  // ── Layer 2: Heuristic NER ───────────────────────────────────────
  const nerFindings = nerScanSync(textToScan).filter(
    f => enabledCategories.includes(f.category)
  );

  // ── Layer 4: Custom patterns (admin-defined) ─────────────────────
  const customFindings = scanCustomPatterns(textToScan).filter(
    f => enabledCategories.includes(f.category)
  );

  // Merge all raw findings
  const rawFindings = mergeAllFindings([regexFindings, nerFindings, customFindings]);

  // ── Layer 3: Context analysis (filter + upgrade) ─────────────────
  const { findings, contextSignals } = analyzeContext(textToScan, rawFindings);

  if (findings.length === 0) {
    return { findings: [], redactedText: rawText, riskLevel: "NONE", sensitivityScore: 0, contextSignals };
  }

  // Apply redactions (skip contextual findings — they have no inline match)
  const redactableFindings = findings.filter(f => !f.isContextual && f.redactAs);
  const redactedText = applyRedactions(rawText, redactableFindings);

  const riskLevel = computeRiskLevel(findings);
  const sensitivityScore = scoreSensitivity(findings, contextSignals);

  return { findings, redactedText, riskLevel, sensitivityScore, contextSignals };
}

/**
 * Layer 1: Run all regex patterns
 */
function runRegexLayer(text, enabledCategories) {
  const findings = [];

  for (const pattern of PATTERNS) {
    if (!enabledCategories.includes(pattern.category)) continue;

    pattern.regex.lastIndex = 0;
    let match;

    while ((match = pattern.regex.exec(text)) !== null) {
      const fullMatch = match[0];
      const capturedValue = pattern.captureGroup != null
        ? match[pattern.captureGroup]
        : fullMatch;

      if (!capturedValue) continue;

      if (pattern.validator && !pattern.validator(capturedValue)) continue;

      if (pattern.requiresEntropy) {
        const entropy = shannonEntropy(capturedValue);
        if (entropy < (pattern.minEntropy || ENTROPY_THRESHOLD)) continue;
      }

      const startIndex = pattern.captureGroup != null
        ? match.index + fullMatch.indexOf(capturedValue)
        : match.index;

      findings.push({
        patternId: pattern.id,
        category: pattern.category,
        label: pattern.label,
        severity: pattern.severity,
        redactAs: pattern.redactAs,
        match: capturedValue,
        start: startIndex,
        end: startIndex + capturedValue.length,
        source: "regex"
      });
    }
  }

  // Entropy scanner
  findings.push(...entropyScanner(text, findings));
  return findings;
}

/**
 * Merge findings from multiple layers, deduplicating by position
 */
function mergeAllFindings(layerArrays) {
  const all = layerArrays.flat();
  return deduplicateFindings(all);
}


function entropyScanner(text, existingFindings) {
  const findings = [];
  // Look for long alphanumeric/symbol strings
  const candidateRx = /[A-Za-z0-9+/=_\-]{20,}/g;
  let m;
  while ((m = candidateRx.exec(text)) !== null) {
    const val = m[0];
    if (val.length < MIN_ENTROPY_LENGTH) continue;

    const entropy = shannonEntropy(val);
    if (entropy < ENTROPY_THRESHOLD) continue;

    // Skip if already covered by a named pattern
    const alreadyCovered = existingFindings.some(
      f => f.start <= m.index && f.end >= m.index + val.length
    );
    if (alreadyCovered) continue;

    // Skip common false positives (URLs, hashes in comments, etc.)
    if (isLikelyFalsePositive(val, text, m.index)) continue;

    findings.push({
      patternId: "entropy_secret",
      category: "API_KEY",
      label: "High-Entropy Secret",
      severity: "HIGH",
      redactAs: "[REDACTED-SECRET]",
      match: val,
      start: m.index,
      end: m.index + val.length,
      entropy: entropy.toFixed(2)
    });
  }
  return findings;
}

/**
 * Filter common entropy false positives
 */
function isLikelyFalsePositive(val, fullText, index) {
  // Common hash patterns in code comments / git log
  if (/^[0-9a-f]{40}$/.test(val)) return true; // git SHA
  if (/^[0-9a-f]{64}$/.test(val)) return true; // SHA256

  // Check surrounding context
  const contextStart = Math.max(0, index - 20);
  const context = fullText.slice(contextStart, index + val.length + 20).toLowerCase();

  const fpKeywords = ["hash", "commit", "sha", "checksum", "uuid", "base64", "example", "placeholder", "sample"];
  if (fpKeywords.some(kw => context.includes(kw))) return true;

  // All same character repeated
  if (new Set(val).size < 5) return true;

  return false;
}

/**
 * Deduplicate overlapping findings, keeping highest severity
 */
function deduplicateFindings(findings) {
  const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  const sorted = [...findings].sort((a, b) => a.start - b.start);
  const result = [];

  for (const finding of sorted) {
    const overlap = result.find(
      f => !(finding.end <= f.start || finding.start >= f.end)
    );
    if (!overlap) {
      result.push(finding);
    } else if (severityOrder[finding.severity] > severityOrder[overlap.severity]) {
      const idx = result.indexOf(overlap);
      result[idx] = finding;
    }
  }

  return result;
}

/**
 * Apply redactions to text based on findings (character-offset based)
 */
function applyRedactions(text, findings) {
  if (findings.length === 0) return text;

  // Sort by start position descending so we replace from end to start
  // (prevents offset shifts)
  const sorted = [...findings].sort((a, b) => b.start - a.start);

  let result = text;
  for (const f of sorted) {
    result = result.slice(0, f.start) + f.redactAs + result.slice(f.end);
  }
  return result;
}

/**
 * Compute overall risk level from all findings
 */
function computeRiskLevel(findings) {
  if (findings.some(f => f.severity === "CRITICAL")) return "CRITICAL";
  if (findings.some(f => f.severity === "HIGH")) return "HIGH";
  if (findings.some(f => f.severity === "MEDIUM")) return "MEDIUM";
  if (findings.length > 0) return "LOW";
  return "NONE";
}




// ── src/content/index.js ──
/**
 * content/index.js
 * Main content script. Injected into all supported AI platforms.
 * Intercepts prompts, runs DLP scan, applies redaction, shows UI feedback.
 */





// ─── State ─────────────────────────────────────────────────────────
let platform = null;
let inputEl = null;
let isEnabled = true;
let isSiteEnabled = true;  // Phase 3: per-site override
let policyConfig = {};
let sessionStats = { scanned: 0, redacted: 0, blocked: 0 };
let mutationObserver = null;
let lastProcessedText = "";
let lastScanResult = null;  // Phase 3: store for "view what was removed"

// ─── Initialise ─────────────────────────────────────────────────────
async function init() {
  // Load settings & policy from extension storage
  const stored = await chrome.storage.sync.get(["enabled", "policyConfig", "sessionStats", "siteOverrides"]);
  isEnabled = stored.enabled !== false; // default ON

  // Phase 3: per-site enable/disable
  const hostname = window.location.hostname;
  const siteOverrides = stored.siteOverrides || {};
  isSiteEnabled = siteOverrides[hostname] !== false; // default ON

  policyConfig = stored.policyConfig || {};
  sessionStats = stored.sessionStats || { scanned: 0, redacted: 0, blocked: 0 };

  platform = detectPlatform();
  console.log(`[DLP] Loaded on ${platform.name} (global:${isEnabled} site:${isSiteEnabled})`);

  // Try to find the input immediately, then watch for it via MutationObserver
  tryAttachToInput();
  observeDOM();

  // Listen for messages from background worker (e.g., policy updates)
  chrome.runtime.onMessage.addListener(handleMessage);

  // Show shield badge
  if (isEnabled && isSiteEnabled) showBadge(platform.name);
}

// ─── DOM Observer ────────────────────────────────────────────────────
/**
 * Use MutationObserver to detect when the input element appears
 * (needed for SPAs where the chat UI loads after page load)
 */
function observeDOM() {
  mutationObserver = new MutationObserver(() => {
    if (!inputEl || !document.contains(inputEl)) {
      tryAttachToInput();
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

function tryAttachToInput() {
  const el = findInputElement(platform);
  if (el && el !== inputEl) {
    inputEl = el;
    attachInputListeners(el);
    console.log(`[DLP] Attached to input: ${el.tagName}#${el.id || el.className.slice(0, 30)}`);
  }
}

// ─── Input Listeners ─────────────────────────────────────────────────
function attachInputListeners(el) {
  // Intercept on paste (highest risk — users paste large blocks of data)
  el.addEventListener("paste", handlePaste, true);

  // Intercept on Enter / submit keyboard shortcut
  el.addEventListener("keydown", handleKeydown, true);

  // Also hook submit buttons
  attachSubmitButtonListeners();
}

/**
 * Handle paste events — scan clipboard content before it enters the input
 */
async function handlePaste(e) {
  if (!isEnabled || !isSiteEnabled) return;

  const pastedText = e.clipboardData?.getData("text/plain");
  if (!pastedText || pastedText.length < 5) return;

  const result = scan(pastedText, policyConfig);
  if (result.findings.length === 0) return;

  // Prevent default paste, insert redacted version instead
  e.preventDefault();
  e.stopImmediatePropagation();

  lastScanResult = result;  // Phase 3: store for detail view
  const action = getPolicyAction(result.riskLevel);
  await handleDLPResult(result, action, "paste");

  if (action === "BLOCK") {
    const userChoice = await showBlockModal(result.findings);
    if (userChoice === "edit") inputEl?.focus();
    return;
  }

  // Insert the redacted text at cursor position
  insertTextAtCursor(result.redactedText);
}

/**
 * Handle keyboard submit (Enter without Shift on most platforms)
 */
async function handleKeydown(e) {
  if (!isEnabled || !isSiteEnabled) return;
  if (!(e.key === "Enter" && !e.shiftKey)) return;

  const text = platform.getTextFromInput(inputEl);
  if (!text || text.trim().length < 5) return;
  if (text === lastProcessedText) return; // avoid double processing

  const result = scan(text, policyConfig);
  if (result.findings.length === 0) return;

  lastScanResult = result;  // Phase 3
  const action = getPolicyAction(result.riskLevel);

  if (action === "BLOCK") {
    e.preventDefault();
    e.stopImmediatePropagation();
    await handleDLPResult(result, action, "keydown");
    const userChoice = await showBlockModal(result.findings);
    if (userChoice === "edit") inputEl?.focus();
    return;
  }

  if (action === "REDACT" || action === "WARN") {
    e.preventDefault();
    e.stopImmediatePropagation();
    await handleDLPResult(result, action, "keydown");

    // Set the redacted text in the input, then re-submit
    lastProcessedText = result.redactedText;
    platform.setTextInInput(inputEl, result.redactedText);

    // Re-trigger submission after a brief tick
    setTimeout(() => {
      inputEl.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", bubbles: true, cancelable: true
      }));
    }, 50);
  }
}

/**
 * Hook submit button clicks as a secondary interception layer
 */
function attachSubmitButtonListeners() {
  const tryAttach = () => {
    for (const selector of platform.submitSelectors) {
      const btn = document.querySelector(selector);
      if (btn && !btn.__dlpHooked) {
        btn.addEventListener("click", handleSubmitClick, true);
        btn.__dlpHooked = true;
      }
    }
  };
  tryAttach();
  // Re-check periodically in case buttons are re-rendered
  setTimeout(tryAttach, 2000);
  setTimeout(tryAttach, 5000);
}

async function handleSubmitClick(e) {
  if (!isEnabled || !isSiteEnabled) return;

  const el = findInputElement(platform);
  if (!el) return;

  const text = platform.getTextFromInput(el);
  if (!text || text.trim().length < 5) return;
  if (text === lastProcessedText) return;

  const result = scan(text, policyConfig);
  if (result.findings.length === 0) return;

  lastScanResult = result;  // Phase 3
  const action = getPolicyAction(result.riskLevel);

  if (action === "BLOCK") {
    e.preventDefault();
    e.stopImmediatePropagation();
    await handleDLPResult(result, action, "submit_click");
    const userChoice = await showBlockModal(result.findings);
    if (userChoice === "edit") el?.focus();
    return;
  }

  if (action === "REDACT" || action === "WARN") {
    e.preventDefault();
    e.stopImmediatePropagation();
    await handleDLPResult(result, action, "submit_click");

    lastProcessedText = result.redactedText;
    platform.setTextInInput(el, result.redactedText);

    setTimeout(() => {
      e.target.click();
    }, 80);
  }
}

// ─── DLP Result Handler ───────────────────────────────────────────────
async function handleDLPResult(result, action, trigger) {
  sessionStats.scanned++;

  if (result.findings.length > 0) {
    sessionStats.redacted++;
  }
  if (action === "BLOCK") {
    sessionStats.blocked++;
  }

  // Build "view details" callback (Phase 3)
  const onViewDetails = () => showRedactionDetail(result.findings);

  // Show user feedback
  const categories = [...new Set(result.findings.map(f => f.label))];
  if (action === "BLOCK") {
    showToast({ type: "block", title: "Submission Blocked", message: `Critical sensitive data detected — prompt cannot be sent.`, findings: result.findings, onViewDetails });
  } else if (action === "WARN") {
    showToast({ type: "warn", title: `${result.findings.length} item${result.findings.length > 1 ? "s" : ""} auto-redacted`, message: `Removed: ${categories.slice(0,3).join(", ")}${categories.length > 3 ? " +more" : ""}`, findings: result.findings, onViewDetails });
  } else {
    // Silent redact
    showToast({ type: "info", title: `Sensitive data removed`, message: `${result.findings.length} item${result.findings.length > 1 ? "s" : ""} redacted before sending`, findings: result.findings, silent: true, onViewDetails });
  }

  // Update shield badge count
  updateBadge(sessionStats.redacted);

  // Persist stats
  await chrome.storage.sync.set({ sessionStats });

  // Send audit event to background
  chrome.runtime.sendMessage({
    type: "DLP_EVENT",
    payload: {
      platform: platform.id,
      platformName: platform.name,
      trigger,
      action,
      riskLevel: result.riskLevel,
      findingCount: result.findings.length,
      sensitivityScore: result.sensitivityScore || 0,  // Phase 3
      categories: result.findings.map(f => ({ category: f.category, severity: f.severity })),
      timestamp: new Date().toISOString(),
      url: window.location.hostname
      // NOTE: Raw text / finding matches are NEVER included in audit events
    }
  });
}

// ─── Policy Action Logic ──────────────────────────────────────────────
function getPolicyAction(riskLevel) {
  const actions = policyConfig.actions || {
    CRITICAL: "BLOCK",
    HIGH: "REDACT",
    MEDIUM: "WARN",
    LOW: "WARN"
  };
  return actions[riskLevel] || "REDACT";
}

// ─── Helpers ─────────────────────────────────────────────────────────
function insertTextAtCursor(text) {
  if (!inputEl) return;
  if (document.activeElement !== inputEl) inputEl.focus();

  if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    const current = inputEl.value;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value"
    )?.set;
    if (setter) {
      setter.call(inputEl, current.slice(0, start) + text + current.slice(end));
      inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  } else {
    document.execCommand("insertText", false, text);
  }
}

// ─── Message Handler (from background) ───────────────────────────────
function handleMessage(msg) {
  if (msg.type === "POLICY_UPDATE") {
    policyConfig = msg.payload;
    chrome.storage.sync.set({ policyConfig });
  }
  if (msg.type === "TOGGLE_ENABLED") {
    isEnabled = msg.payload;
    if (isEnabled && isSiteEnabled) showBadge(platform.name);
    else hideBadge();
  }
  // Phase 3: per-site toggle
  if (msg.type === "TOGGLE_SITE") {
    isSiteEnabled = msg.payload;
    if (isEnabled && isSiteEnabled) showBadge(platform.name);
    else hideBadge();
  }
  // Phase 3: popup requests to show redaction detail
  if (msg.type === "SHOW_REDACTION_DETAIL") {
    if (lastScanResult) showRedactionDetail(lastScanResult.findings);
  }
  if (msg.type === "GET_STATS") {
    return Promise.resolve(sessionStats);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────
init().catch(err => console.error("[DLP] Init failed:", err));
