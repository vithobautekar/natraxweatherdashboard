/**
 * table.js — Data Table Renderer
 * ──────────────────────────────
 * Renders the data table, handles filters, and CSV export.
 */

const Table = (() => {

  let _allRecords = [];
  let _activeTrack  = "all";
  let _fromDate     = "";
  let _toDate       = "";

  /**
   * Render filtered records into the HTML table.
   */
  function render() {
    const tbody = document.getElementById("tableBody");
    const count = document.getElementById("tableCount");
    const filtered = getFiltered();

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr class="table-empty"><td colspan="8">No records match the current filter.</td></tr>`;
      count.textContent = "0 records";
      return;
    }

    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>${r.time || "—"}</td>
        <td><span class="track-badge ${r.track}">${r.track}</span></td>
        <td>${fmt1(r.surfaceTemp)}</td>
        <td>${fmt1(r.ambientTemp)}</td>
        <td>${fmt1(r.windSpeed)}</td>
        <td>${fmt1(r.humidity)}</td>
        <td><span class="source-badge">${r.source || "—"}</span></td>
      </tr>
    `).join("");

    count.textContent = `${filtered.length} record${filtered.length !== 1 ? "s" : ""}`;
  }

  /** Apply all active filters and return matching records. */
  function getFiltered() {
    return _allRecords
      .filter(r => {
        const matchTrack = _activeTrack === "all" || r.track === _activeTrack;
        const matchFrom  = !_fromDate || r.date >= _fromDate;
        const matchTo    = !_toDate   || r.date <= _toDate;
        return matchTrack && matchFrom && matchTo;
      })
      .sort((a, b) => (`${b.date}T${b.time}` > `${a.date}T${a.time}`) ? 1 : -1);
  }

  /** Format a date string for display */
  function fmtDate(d) {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric"
      });
    } catch { return d; }
  }

  /** Format a number to 1 decimal or "—" */
  function fmt1(v) {
    if (v === null || v === undefined || v === "") return "—";
    const n = parseFloat(v);
    return isNaN(n) ? "—" : n.toFixed(1);
  }

  /**
   * Export filtered records as CSV download.
   */
  function exportCSV() {
    const records = getFiltered();
    if (!records.length) { App.showToast("No data to export"); return; }

    const headers = ["Date","Time","Track","Surface_Temp_C","Ambient_Temp_C","Wind_Speed_kmh","Humidity_pct","Source"];
    const rows    = records.map(r => [
      r.date, r.time, r.track,
      fmt1(r.surfaceTemp), fmt1(r.ambientTemp),
      fmt1(r.windSpeed),   fmt1(r.humidity),
      r.source || "",
    ].join(","));

    const csv  = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");

    const today = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `natrax_temp_data_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    App.showToast(`Exported ${records.length} records`);
  }

  /**
   * Load new records and re-render.
   * @param {Object[]} records
   */
  function load(records) {
    _allRecords = records;
    render();
  }

  /**
   * Attach event listeners for table filters and CSV button.
   * Called once from App.init().
   */
  function initListeners() {
    // Track pills
    document.querySelectorAll("[data-table-track]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-table-track]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _activeTrack = btn.dataset.tableTrack;
        render();
      });
    });

    // Date range
    document.getElementById("filterFrom")?.addEventListener("change", e => {
      _fromDate = e.target.value;
      render();
    });
    document.getElementById("filterTo")?.addEventListener("change", e => {
      _toDate = e.target.value;
      render();
    });

    // CSV export
    document.getElementById("csvBtn")?.addEventListener("click", exportCSV);
  }

  return { load, render, initListeners };
})();
