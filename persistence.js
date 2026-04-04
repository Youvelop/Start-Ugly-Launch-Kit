/**
 * Youvelop – Template Persistence Snippet
 * Drop this <script> block at the bottom of every HTML template, just before </body>.
 *
 * What it does:
 *  - Generates a unique access code for new buyers (stored in localStorage)
 *  - Shows a small persistent UI so buyers can copy/enter their code
 *  - Auto-saves every input, textarea, and select field as the buyer types
 *  - Loads their saved answers on page open (any device, as long as they have their code)
 *
 * Before using:
 *  1. Replace WORKER_URL with your deployed Cloudflare Worker URL
 *  2. Replace TEMPLATE_ID with a short unique id per template
 *     e.g. "pre-module", "module-1", "module-2", "module-3", "module-4", "bonus"
 */

(function () {
  // ── CONFIG ── edit these two lines per template ──────────────────────────
  const WORKER_URL  = "https://your-worker.your-subdomain.workers.dev";
  const TEMPLATE_ID = "module-1"; // change per template file
  // ─────────────────────────────────────────────────────────────────────────

  const LS_KEY      = "youvelop_access_code";
  const SAVE_DELAY  = 1200; // ms debounce before saving
  let   saveTimer   = null;
  let   currentCode = null;

  // ── 1. Inject the access code UI ─────────────────────────────────────────
  function injectUI() {
    const style = document.createElement("style");
    style.textContent = `
      #ylv-bar {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        background: #1a1a1a;
        color: #fff;
        font-family: 'IBM Plex Mono', monospace, sans-serif;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 18px;
        z-index: 9999;
        border-top: 2px solid #4a5c2f;
        box-shadow: 0 -2px 16px rgba(0,0,0,0.4);
        flex-wrap: wrap;
      }
      #ylv-bar .ylv-label { color: #888; white-space: nowrap; }
      #ylv-bar .ylv-code  {
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 4px 10px;
        letter-spacing: 0.12em;
        font-weight: 600;
        color: #c8d87a;
        cursor: pointer;
        user-select: all;
        white-space: nowrap;
      }
      #ylv-bar .ylv-code:hover { border-color: #c8d87a; }
      #ylv-bar .ylv-btn {
        background: none;
        border: 1px solid #555;
        border-radius: 4px;
        color: #aaa;
        padding: 4px 10px;
        font-size: 11px;
        font-family: inherit;
        cursor: pointer;
        white-space: nowrap;
      }
      #ylv-bar .ylv-btn:hover { border-color: #aaa; color: #fff; }
      #ylv-bar .ylv-status {
        color: #6a8a3a;
        font-size: 11px;
        margin-left: auto;
        white-space: nowrap;
        transition: opacity 0.4s;
      }
      #ylv-modal-overlay {
        display: none;
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.7);
        z-index: 10000;
        align-items: center;
        justify-content: center;
      }
      #ylv-modal-overlay.open { display: flex; }
      #ylv-modal {
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 8px;
        padding: 28px 32px;
        max-width: 380px;
        width: 90%;
        font-family: 'IBM Plex Mono', monospace, sans-serif;
        color: #fff;
      }
      #ylv-modal h3 {
        margin: 0 0 8px;
        font-size: 14px;
        color: #c8d87a;
        letter-spacing: 0.08em;
      }
      #ylv-modal p {
        margin: 0 0 16px;
        font-size: 12px;
        color: #888;
        line-height: 1.6;
      }
      #ylv-modal input {
        width: 100%;
        box-sizing: border-box;
        background: #2a2a2a;
        border: 1px solid #555;
        border-radius: 4px;
        color: #fff;
        font-family: inherit;
        font-size: 14px;
        letter-spacing: 0.12em;
        padding: 10px 12px;
        margin-bottom: 12px;
        text-transform: uppercase;
      }
      #ylv-modal input:focus { outline: none; border-color: #c8d87a; }
      #ylv-modal .ylv-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
      #ylv-modal .ylv-modal-actions button {
        font-family: inherit;
        font-size: 12px;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid #555;
        background: none;
        color: #aaa;
      }
      #ylv-modal .ylv-modal-actions button.primary {
        background: #4a5c2f;
        border-color: #4a5c2f;
        color: #fff;
      }
      #ylv-modal .ylv-modal-actions button:hover { opacity: 0.85; }
      #ylv-modal .ylv-error { color: #e07070; font-size: 11px; margin-top: -8px; margin-bottom: 10px; display: none; }
    `;
    document.head.appendChild(style);

    // Bar
    const bar = document.createElement("div");
    bar.id = "ylv-bar";
    bar.innerHTML = `
      <span class="ylv-label">YOUR ACCESS CODE</span>
      <span class="ylv-code" id="ylv-code-display" title="Click to copy">——————</span>
      <button class="ylv-btn" id="ylv-switch-btn">Use different code</button>
      <span class="ylv-status" id="ylv-status"></span>
    `;
    document.body.appendChild(bar);

    // Modal
    const modal = document.createElement("div");
    modal.id = "ylv-modal-overlay";
    modal.innerHTML = `
      <div id="ylv-modal">
        <h3>LOAD YOUR PROGRESS</h3>
        <p>Enter your access code to load your saved answers on this device.</p>
        <input type="text" id="ylv-code-input" placeholder="UGLY-XXXX-XX" maxlength="12" />
        <div class="ylv-error" id="ylv-modal-error">Code not found. Check for typos.</div>
        <div class="ylv-modal-actions">
          <button id="ylv-modal-cancel">Cancel</button>
          <button class="primary" id="ylv-modal-load">Load my answers</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Events
    document.getElementById("ylv-code-display").addEventListener("click", copyCode);
    document.getElementById("ylv-switch-btn").addEventListener("click", openModal);
    document.getElementById("ylv-modal-cancel").addEventListener("click", closeModal);
    document.getElementById("ylv-modal-load").addEventListener("click", handleModalLoad);
    document.getElementById("ylv-code-input").addEventListener("keydown", e => {
      if (e.key === "Enter") handleModalLoad();
    });
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  }

  // ── 2. Access code logic ──────────────────────────────────────────────────
  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const rand = (n) => Array.from({length: n}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return `UGLY-${rand(4)}-${rand(2)}`;
  }

  function getOrCreateCode() {
    let code = localStorage.getItem(LS_KEY);
    if (!code) {
      code = generateCode();
      localStorage.setItem(LS_KEY, code);
    }
    return code;
  }

  function setCode(code) {
    localStorage.setItem(LS_KEY, code);
    currentCode = code;
    document.getElementById("ylv-code-display").textContent = code;
  }

  function copyCode() {
    navigator.clipboard.writeText(currentCode).then(() => {
      setStatus("Copied!", 2000);
    });
  }

  // ── 3. Modal ──────────────────────────────────────────────────────────────
  function openModal() {
    document.getElementById("ylv-modal-overlay").classList.add("open");
    document.getElementById("ylv-code-input").value = "";
    document.getElementById("ylv-modal-error").style.display = "none";
    setTimeout(() => document.getElementById("ylv-code-input").focus(), 50);
  }

  function closeModal() {
    document.getElementById("ylv-modal-overlay").classList.remove("open");
  }

  async function handleModalLoad() {
    const input = document.getElementById("ylv-code-input").value.trim().toUpperCase();
    if (!input) return;

    setStatus("Loading...");
    const result = await loadAnswers(input);

    if (!result.found) {
      document.getElementById("ylv-modal-error").style.display = "block";
      setStatus("");
      return;
    }

    setCode(input);
    populateFields(result.answers);
    closeModal();
    setStatus("Progress loaded ✓", 3000);
  }

  // ── 4. Save & load ────────────────────────────────────────────────────────
  function collectAnswers() {
    const answers = {};
    document.querySelectorAll("input, textarea, select").forEach(el => {
      if (!el.id && !el.name) return;
      const key = el.id || el.name;
      if (el.type === "checkbox" || el.type === "radio") {
        answers[key] = el.checked;
      } else {
        answers[key] = el.value;
      }
    });
    return answers;
  }

  function populateFields(answers) {
    Object.entries(answers).forEach(([key, value]) => {
      const el = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
      if (!el) return;
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = value;
      } else {
        el.value = value;
        // trigger input event so any live-preview logic still fires
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  async function saveAnswers() {
    const answers = collectAnswers();
    try {
      const res = await fetch(`${WORKER_URL}/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentCode, template: TEMPLATE_ID, answers }),
      });
      if (res.ok) setStatus("Saved ✓", 2000);
      else        setStatus("Save failed", 3000);
    } catch {
      setStatus("Offline – will retry on next change", 3000);
    }
  }

  async function loadAnswers(code) {
    try {
      const res = await fetch(
        `${WORKER_URL}/data?id=${encodeURIComponent(code)}&template=${encodeURIComponent(TEMPLATE_ID)}`
      );
      return await res.json();
    } catch {
      return { found: false, answers: {} };
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    setStatus("Saving...");
    saveTimer = setTimeout(saveAnswers, SAVE_DELAY);
  }

  // ── 5. Status indicator ───────────────────────────────────────────────────
  let statusTimer = null;
  function setStatus(msg, clearAfter = 0) {
    const el = document.getElementById("ylv-status");
    if (!el) return;
    el.textContent = msg;
    clearTimeout(statusTimer);
    if (clearAfter) statusTimer = setTimeout(() => { el.textContent = ""; }, clearAfter);
  }

  // ── 6. Boot ───────────────────────────────────────────────────────────────
  async function init() {
    injectUI();

    currentCode = getOrCreateCode();
    document.getElementById("ylv-code-display").textContent = currentCode;

    // Load saved answers for this code
    setStatus("Loading your progress...");
    const result = await loadAnswers(currentCode);
    if (result.found) {
      populateFields(result.answers);
      setStatus("Progress loaded ✓", 3000);
    } else {
      setStatus("");
    }

    // Watch all fields
    document.addEventListener("input",  scheduleSave);
    document.addEventListener("change", scheduleSave);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
