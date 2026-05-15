/**
 * app.js — Main Application Controller
 * ──────────────────────────────────────
 * Orchestrates all modules:
 *   - Tab routing
 *   - Initial data load
 *   - Dashboard summary update
 *   - Filter state management
 *   - Toast notifications
 */

const App = (() => {

  let _records    = [];          // All loaded records
  let _trackFilter  = "all";
  let _periodFilter = 90;         // Days back
  let _toastTimer   = null;

  // ── Toast notification ────────────────────────────────

  function showToast(msg, durationMs = 3000) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    if (_toastTimer) clearTimeout(_toastTimer);
    toast.textContent = msg;
    toast.classList.remove("hidden");
    _toastTimer = setTimeout(() => toast.classList.add("hidden"), durationMs);
  }

  // ── Tab routing ───────────────────────────────────────

  function initTabs() {
    const tabs    = document.querySelectorAll(".tab-btn");
    const panels  = document.querySelectorAll(".tab-panel");

    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;

        // Guard: upload tab only for admins
        if (target === "upload" && !Auth.isLoggedIn()) {
          showToast("Login as admin to access upload");
          return;
        }

        // Deactivate all
        tabs.forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
        panels.forEach(p => { p.classList.remove("active"); p.hidden = true; });

        // Activate selected
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const panel = document.getElementById(`tab-${target}`);
        if (panel) { panel.classList.add("active"); panel.hidden = false; }
      });
    });
  }

  // ── Chart filter pills ────────────────────────────────

  function initChartFilters() {
    document.querySelectorAll("[data-filter-track]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-filter-track]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _trackFilter = btn.dataset.filterTrack;
        Charts.update(_records, _trackFilter, _periodFilter);
      });
    });

    document.querySelectorAll("[data-filter-period]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-filter-period]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _periodFilter = parseInt(btn.dataset.filterPeriod, 10);
        Charts.update(_records, _trackFilter, _periodFilter);
      });
    });
  }

  // ── Summary stat cards ────────────────────────────────

  function updateSummary(records) {
    const today = new Date().toISOString().slice(0, 10);

    // Latest reading (most recent record)
    const latest = records[records.length - 1];
    const latestEl     = document.getElementById("statLatest");
    const latestMetaEl = document.getElementById("statLatestMeta");
    if (latest && latestEl) {
      latestEl.textContent     = latest.surfaceTemp != null ? `${Number(latest.surfaceTemp).toFixed(1)}°` : "—";
      latestMetaEl.textContent = `${latest.track} · ${fmtShortDate(latest.date)} ${latest.time?.slice(0,5)||""}`;
    }

    // T3 max today
    const t3Today = records.filter(r => r.track === "T3" && r.date === today);
    const t3Max   = t3Today.length ? Math.max(...t3Today.map(r => parseFloat(r.surfaceTemp)||0)) : null;
    document.getElementById("statT3Max").textContent  = t3Max != null ? `${t3Max.toFixed(1)}°` : "—";

    // T13 max today
    const t13Today = records.filter(r => r.track === "T13" && r.date === today);
    const t13Max   = t13Today.length ? Math.max(...t13Today.map(r => parseFloat(r.surfaceTemp)||0)) : null;
    document.getElementById("statT13Max").textContent = t13Max != null ? `${t13Max.toFixed(1)}°` : "—";

    // Ambient (most recent)
    const ambientEl = document.getElementById("statAmbient");
    if (latest?.ambientTemp != null) {
      ambientEl.textContent = `${Number(latest.ambientTemp).toFixed(1)}°`;
    } else {
      // Try to fetch current weather for ambient display
      API.fetchCurrentWeather().then(w => {
        if (w.ambientTemp != null)
          ambientEl.textContent = `${Number(w.ambientTemp).toFixed(1)}°`;
      }).catch(() => {});
    }
  }

  function fmtShortDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    } catch { return d; }
  }

  // ── Data loading ──────────────────────────────────────

  /**
   * Load all data from Google Sheet and refresh all views.
   * Handles GAS_URL not configured gracefully.
   */
  async function loadData() {
    // Check if GAS_URL is configured
    if (!CONFIG.GAS_URL || CONFIG.GAS_URL.includes("YOUR_SCRIPT_ID")) {
      console.warn("[NATRAX] GAS_URL not configured. Using demo data.");
      _records = getDemoData();
    } else {
      try {
        const raw = await API.fetchAllData();
        // Normalise field names (Apps Script returns camelCase or PascalCase)
        _records = raw.map(normaliseRecord);
      } catch (err) {
        console.error("[NATRAX] Data load failed:", err);
        showToast("Could not load data — check connection or GAS_URL config");
        _records = getDemoData();
      }
    }

    // Sort by date+time ascending
    _records.sort((a, b) => `${a.date}T${a.time}` < `${b.date}T${b.time}` ? -1 : 1);

    updateSummary(_records);
    Charts.update(_records, _trackFilter, _periodFilter);
    Table.load(_records);
  }

  /** Normalise record field names from various possible formats. */
  function normaliseRecord(r) {
    return {
      date:        r.Date        || r.date        || "",
      time:        r.Time        || r.time        || "",
      track:       r.Track       || r.track       || "",
      surfaceTemp: r.SurfaceTemp || r.surfaceTemp || r["Surface Temperature"] || null,
      ambientTemp: r.AmbientTemp || r.ambientTemp || r["Ambient Temperature"] || null,
      windSpeed:   r.WindSpeed   || r.windSpeed   || r["Wind Speed"]         || null,
      humidity:    r.Humidity    || r.humidity    || null,
      source:      r.Source      || r.source      || "",
    };
  }

  // ── Demo data (shown when GAS not configured) ─────────

  function getDemoData() {
    const now  = new Date();
    const rows = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const base = 45 + 10 * Math.sin(i / 10) + Math.random() * 5;

      ["T3", "T13"].forEach(track => {
        [["08:00", base - 8], ["13:00", base], ["17:00", base - 4]].forEach(([t, s]) => {
          rows.push({
            date: ds, time: t, track,
            surfaceTemp: +(s + Math.random() * 3 - 1.5).toFixed(1),
            ambientTemp: +(32 + Math.random() * 4 - 2).toFixed(1),
            windSpeed:   +(12 + Math.random() * 8).toFixed(1),
            humidity:    +(55 + Math.random() * 20).toFixed(1),
            source: "Demo",
          });
        });
      });
    }
    return rows;
  }

  // ── Initialise ────────────────────────────────────────

  async function init() {
    // Modules initialise their listeners
    Auth.initListeners();
    Upload.initListeners();
    Table.initListeners();
    initTabs();
    initChartFilters();

    // Wait for Chart.js to be available (loaded via defer)
    await waitForChartJs();
    Charts.init();

    // Load data
    await loadData();
  }

  function waitForChartJs() {
    return new Promise(resolve => {
      if (window.Chart) return resolve();
      const interval = setInterval(() => {
        if (window.Chart) { clearInterval(interval); resolve(); }
      }, 50);
    });
  }

  // Boot on DOM ready
  document.addEventListener("DOMContentLoaded", init);

  return { loadData, showToast };
})();
