/**
 * upload.js — Admin Upload & Form Logic
 * ──────────────────────────────────────
 * Two input methods:
 *   1. PASTE TEXT — user pastes/types rows from Excel or manual copy.
 *   2. MANUAL ENTRY — click "+ Add Row", fill in each field.
 *
 * Supported date formats: DD/MM/YY, DD/MM/YYYY, DD-MM-YY, DD|MM|YY
 * Supported track values: T3, T13
 * Delimiter: tab, comma, semicolon, or 2+ spaces
 */

const Upload = (() => {

  let _rows = [];

  // ── Initialise ────────────────────────────────────────

  function initListeners() {
    document.getElementById("parseTextBtn")?.addEventListener("click", handleParseText);
    document.getElementById("addRowBtn")?.addEventListener("click", () => addBlankRow());
    document.getElementById("clearFormBtn")?.addEventListener("click", clearForm);
    document.getElementById("saveBtn")?.addEventListener("click", handleSave);

    // Ctrl+Enter in textarea triggers parse
    document.getElementById("pasteInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleParseText();
    });

    // Method tab switching (Paste / Manual)
    document.querySelectorAll(".method-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".method-tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".method-panel").forEach(p => p.classList.add("hidden"));
        btn.classList.add("active");
        const panelId = "method" + btn.dataset.method.charAt(0).toUpperCase() + btn.dataset.method.slice(1);
        document.getElementById(panelId)?.classList.remove("hidden");
      });
    });
  }

  // ── Text Parser ───────────────────────────────────────

  /**
   * Parse pasted text into row objects.
   * Each non-empty line is treated as one reading.
   * Columns detected by value pattern — order flexible as long as consistent.
   */
  function parseText(raw) {
    const lines  = raw.split("\n").map(l => l.trim()).filter(l => l.length > 3);
    const parsed = [];
    const errors = [];

    lines.forEach((line, idx) => {
      // Skip obvious header lines
      if (/date|track|location|time|temp|s\.?n/i.test(line) && !/\d{2}[\/\|\-]\d{2}/.test(line)) return;

      // Split on tabs, commas, semicolons, or 2+ spaces
      const cols = line.split(/\t|,|;|  +/).map(c => c.trim()).filter(Boolean);
      if (cols.length < 3) {
        errors.push(`Line ${idx + 1}: too few columns — "${line}"`);
        return;
      }

      let date  = null;
      let track = null;
      let time  = null;
      let temp  = null;

      cols.forEach(col => {
        // Date: DD/MM/YY or DD/MM/YYYY (/ | - . separators)
        if (!date) {
          const dm = col.match(/^(\d{1,2})[\|\/\-\.](\d{1,2})[\|\/\-\.](\d{2,4})$/);
          if (dm) {
            const [, dd, mm, yy] = dm;
            const yyyy = yy.length === 2 ? "20" + yy : yy;
            date = yyyy + "-" + mm.padStart(2,"0") + "-" + dd.padStart(2,"0");
            return;
          }
        }
        // Track: T3 or T13 (and common variants)
        if (!track) {
          const tu = col.toUpperCase().replace(/\s/g, "");
          if (/^T1[3S38]$|^TI3$|^713$/.test(tu)) { track = "T13"; return; }
          if (/^T[O0]?3$/.test(tu))               { track = "T3";  return; }
        }
        // Time: HH:MM or H:MM
        if (!time) {
          const tm = col.match(/^(\d{1,2})[:\.](\d{2})$/);
          if (tm) { time = tm[1].padStart(2,"0") + ":" + tm[2]; return; }
        }
        // Temperature: 20–90 range
        if (temp === null) {
          const tv = parseFloat(col.replace(",", "."));
          if (!isNaN(tv) && tv >= 20 && tv <= 90) { temp = tv; return; }
        }
      });

      if (!date)       { errors.push("Line " + (idx+1) + ": could not read date — \"" + line + "\"");  return; }
      if (!track)      { errors.push("Line " + (idx+1) + ": could not read track — \"" + line + "\""); return; }
      if (!time)       { errors.push("Line " + (idx+1) + ": could not read time — \"" + line + "\"");  return; }
      if (temp === null){ errors.push("Line " + (idx+1) + ": could not read temp — \"" + line + "\""); return; }

      parsed.push({ date, track, time, temp });
    });

    return { parsed, errors };
  }

  function handleParseText() {
    const raw = document.getElementById("pasteInput")?.value || "";
    if (!raw.trim()) { App.showToast("Nothing to parse — paste some data first"); return; }

    const { parsed, errors } = parseText(raw);

    if (errors.length > 0) {
      console.warn("[NATRAX Parse] Skipped lines:\n" + errors.join("\n"));
    }

    if (parsed.length === 0) {
      App.showToast("Could not parse any rows — check format and try again");
      console.warn("[NATRAX Parse] Input was:\n" + raw);
      return;
    }

    // Append parsed rows to any existing manual rows
    const startId = _rows.length;
    parsed.forEach((r, i) => _rows.push(Object.assign({}, r, { id: startId + i })));
    rebuildTable();

    const msg = errors.length > 0
      ? "Parsed " + parsed.length + " row(s). " + errors.length + " line(s) skipped — see console"
      : "Parsed " + parsed.length + " row(s) — review and save";
    App.showToast(msg);

    // Clear textarea
    const ta = document.getElementById("pasteInput");
    if (ta) ta.value = "";
  }

  // ── Manual row addition ───────────────────────────────

  function addBlankRow() {
    const lastDate = _rows.length > 0 ? _rows[_rows.length - 1].date : "";
    _rows.push({ id: _rows.length, date: lastDate, track: "", time: "", temp: "" });
    rebuildTable();
    setTimeout(function() {
      const selects = document.querySelectorAll(".row-track");
      if (selects.length) selects[selects.length - 1].focus();
    }, 40);
  }

  // ── Table rendering ───────────────────────────────────

  function rebuildTable() {
    const container = document.getElementById("dynamicRowsContainer");
    if (!container) return;

    if (_rows.length === 0) {
      container.innerHTML = "<div class=\"no-rows-hint\">No readings yet — paste text above or click \"+ Add Row\"</div>";
      return;
    }

    let html = "<div class=\"dyn-table-header\"><span>Date</span><span>Track</span><span>Time</span><span>Temp °C</span><span></span></div>";
    _rows.forEach(function(r) {
      html += "<div class=\"dyn-row\" data-id=\"" + r.id + "\">"
        + "<input type=\"date\" class=\"form-input row-date\" value=\"" + (r.date || "") + "\" data-field=\"date\" />"
        + "<select class=\"form-input row-track\" data-field=\"track\">"
        + "<option value=\"\"" + (!r.track ? " selected" : "") + ">—</option>"
        + "<option value=\"T3\"" + (r.track === "T3" ? " selected" : "") + ">T3</option>"
        + "<option value=\"T13\"" + (r.track === "T13" ? " selected" : "") + ">T13</option>"
        + "</select>"
        + "<input type=\"time\" class=\"form-input row-time\" value=\"" + (r.time || "") + "\" data-field=\"time\" />"
        + "<input type=\"number\" class=\"form-input row-temp\" value=\"" + (r.temp !== "" ? r.temp : "") + "\" step=\"0.1\" min=\"0\" max=\"120\" placeholder=\"°C\" data-field=\"temp\" />"
        + "<button class=\"delete-row-btn\" data-id=\"" + r.id + "\" title=\"Remove\" aria-label=\"Remove\">✕</button>"
        + "</div>";
    });
    container.innerHTML = html;

    // Sync edits back to _rows
    container.querySelectorAll(".dyn-row").forEach(function(rowEl) {
      const id = parseInt(rowEl.dataset.id);
      rowEl.querySelectorAll("[data-field]").forEach(function(input) {
        input.addEventListener("input", function(e) {
          const row = _rows.find(function(r) { return r.id === id; });
          if (!row) return;
          const field = e.target.dataset.field;
          let val = e.target.value;
          if (field === "time") val = to24h(val);
          if (field === "date") val = toISODate(val);
          row[field] = val;
        });
      });
    });

    // Delete buttons
    container.querySelectorAll(".delete-row-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        _rows = _rows.filter(function(r) { return r.id !== parseInt(btn.dataset.id); });
        rebuildTable();
      });
    });
  }

  // ── Format helpers ────────────────────────────────────

  /**
   * Convert any time string to HH:MM 24-hour format.
   * Handles: "13:45", "1:45 PM", "01:43 PM", "09:21 AM"
   */
  function to24h(timeStr) {
    if (!timeStr) return "";
    timeStr = timeStr.trim();

    // Already HH:MM with no AM/PM — return as-is (zero-pad hour)
    const plain = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (plain) return plain[1].padStart(2,"0") + ":" + plain[2];

    // HH:MM AM/PM
    const ampm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const m = ampm[2];
      const period = ampm[3].toUpperCase();
      if (period === "AM" && h === 12) h = 0;
      if (period === "PM" && h !== 12) h += 12;
      return String(h).padStart(2,"0") + ":" + m;
    }

    // Fallback — return whatever was given
    return timeStr;
  }

  /**
   * Convert date from MM/DD/YYYY (browser default on Windows)
   * or DD/MM/YYYY to YYYY-MM-DD for consistent storage.
   * The input[type=date] always returns YYYY-MM-DD internally —
   * this handles cases where .value comes back in locale format.
   */
  function toISODate(dateStr) {
    if (!dateStr) return "";
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // DD/MM/YYYY or MM/DD/YYYY — parse as DD/MM/YYYY (NATRAX convention)
    const m = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (m) return m[3] + "-" + m[2].padStart(2,"0") + "-" + m[1].padStart(2,"0");
    return dateStr;
  }

  // ── Clear ─────────────────────────────────────────────

  function clearForm() {
    _rows = [];
    rebuildTable();
    const ta = document.getElementById("pasteInput");
    if (ta) ta.value = "";
    document.getElementById("saveStatus")?.classList.add("hidden");
    const label = document.getElementById("weatherFetchLabel");
    if (label) label.textContent = "Weather data will be fetched automatically on save";
  }

  // ── Save ──────────────────────────────────────────────

  async function handleSave() {
    // Sync latest DOM values before reading
    document.getElementById("dynamicRowsContainer")
      ?.querySelectorAll(".dyn-row").forEach(function(rowEl) {
        const id  = parseInt(rowEl.dataset.id);
        const row = _rows.find(function(r) { return r.id === id; });
        if (!row) return;
        row.date  = toISODate(rowEl.querySelector(".row-date")?.value  || "");
        row.track = rowEl.querySelector(".row-track")?.value || "";
        row.time  = to24h(rowEl.querySelector(".row-time")?.value  || "");
        row.temp  = rowEl.querySelector(".row-temp")?.value  || "";
      });

    const valid   = _rows.filter(function(r) { return r.date && r.track && r.time && r.temp !== ""; });
    const skipped = _rows.length - valid.length;

    if (valid.length === 0) {
      App.showToast("No complete rows to save — each row needs date, track, time and temp");
      return;
    }
    if (skipped > 0) App.showToast(skipped + " incomplete row(s) will be skipped");

    const saveBtn      = document.getElementById("saveBtn");
    const statusEl     = document.getElementById("saveStatus");
    const weatherLabel = document.getElementById("weatherFetchLabel");

    saveBtn.disabled = true;
    statusEl.className = "save-status";
    statusEl.classList.remove("hidden");
    statusEl.textContent = "Fetching weather for " + valid.length + " reading(s)…";
    if (weatherLabel) weatherLabel.textContent = "Fetching weather data…";

    try {
      const enriched = await Promise.all(valid.map(async function(row) {
        let weather = { ambientTemp: null, humidity: null, windSpeed: null };
        try { weather = await API.fetchWeatherForDateTime(row.date, row.time); }
        catch (e) { console.warn("[NATRAX] Weather fetch failed:", row, e); }
        return {
          date:        row.date,
          time:        row.time,
          track:       row.track,
          surfaceTemp: parseFloat(row.temp),
          ambientTemp: weather.ambientTemp,
          windSpeed:   weather.windSpeed,
          humidity:    weather.humidity,
          source:      "Manual",
        };
      }));

      if (weatherLabel) weatherLabel.textContent = "Weather fetched ✓";
      statusEl.textContent = "Saving to Google Sheet…";

      const result = await API.saveRows(enriched, Auth.getToken());

      statusEl.className = "save-status success";
      statusEl.textContent = "✓ Saved " + result.saved + " record(s). " + result.skipped + " duplicate(s) skipped.";
      App.showToast("Saved " + result.saved + " record(s)");

      await App.loadData();
      clearForm();

    } catch (err) {
      statusEl.className = "save-status error";
      statusEl.textContent = "Error: " + err.message;
      App.showToast("Save failed — see form for details");
      console.error("[NATRAX Upload] Save error:", err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  function renderRows(rows) {
    _rows = rows.map(function(r, i) { return Object.assign({}, r, { id: i }); });
    rebuildTable();
  }

  return { initListeners, clearForm, renderRows };
})();
