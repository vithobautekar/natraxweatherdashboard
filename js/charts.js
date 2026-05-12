/**
 * charts.js — Data Visualisation
 * ─────────────────────────────────
 * Manages three Chart.js instances:
 *   1. Surface temperature over time (line)
 *   2. Ambient vs Surface comparison (line)
 *   3. Humidity & Wind speed (bar + line combo)
 */

const Charts = (() => {

  let chartSurface    = null;
  let chartComparison = null;
  let chartWeather    = null;

  // ── Theme-aware colour helpers ────────────────────────

  function css(varName) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(varName).trim();
  }

  function getColors() {
    return {
      t3:      css("--accent-t3")    || "#d4380d",
      t13:     css("--accent-t13")   || "#0958d9",
      ambient: css("--accent-green") || "#389e0d",
      muted:   css("--text-muted")   || "#9e9e98",
      border:  css("--border")       || "#e2e2dc",
      card:    css("--bg-card")      || "#ffffff",
      text:    css("--text-secondary") || "#6b6b65",
    };
  }

  // ── Shared Chart.js default config ───────────────────

  function baseOptions(colors) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: colors.text,
            font: { family: "'DM Mono', monospace", size: 11 },
            boxWidth: 12, padding: 12,
          },
        },
        tooltip: {
          backgroundColor: colors.card,
          titleColor:   colors.text,
          bodyColor:    colors.text,
          borderColor:  colors.border,
          borderWidth:  1,
          padding:      10,
          titleFont:    { family: "'Syne', sans-serif", weight: "700", size: 12 },
          bodyFont:     { family: "'DM Mono', monospace", size: 11 },
        },
      },
      scales: {
        x: {
          grid:  { color: colors.border, lineWidth: 0.5 },
          ticks: { color: colors.muted, font: { family: "'DM Mono', monospace", size: 10 }, maxTicksLimit: 8 },
        },
        y: {
          grid:  { color: colors.border, lineWidth: 0.5 },
          ticks: { color: colors.muted, font: { family: "'DM Mono', monospace", size: 10 } },
        },
      },
    };
  }

  // ── Prepare data for chart consumption ───────────────

  /**
   * Filter raw records by track and date period.
   * @param {Object[]} records - All data rows
   * @param {string} track  - "all"|"T3"|"T13"
   * @param {number} days   - Number of days back from today
   * @returns {Object[]} Filtered, sorted records
   */
  function filterRecords(records, track, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return records
      .filter(r => {
        const matchTrack  = (track === "all") || (r.track === track);
        const matchPeriod = r.date >= cutoffStr;
        return matchTrack && matchPeriod;
      })
      .sort((a, b) => {
        const da = `${a.date}T${a.time}`;
        const db = `${b.date}T${b.time}`;
        return da < db ? -1 : 1;
      });
  }

  /** Format "YYYY-MM-DD" + "HH:MM" into a short label */
  function fmtLabel(date, time) {
    if (!date) return "";
    const d = new Date(`${date}T${time || "00:00"}`);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
      + " " + (time?.slice(0, 5) || "");
  }

  // ── Initialise charts (called once on load) ───────────

  function init() {
    const colors = getColors();

    // 1. Surface temperature chart
    chartSurface = new Chart(
      document.getElementById("chartSurface"),
      {
        type: "line",
        data: { labels: [], datasets: [
          {
            label: "T3 Surface °C",
            data: [], borderColor: colors.t3, backgroundColor: colors.t3 + "22",
            tension: 0.3, pointRadius: 3, pointHoverRadius: 5, fill: true,
          },
          {
            label: "T13 Surface °C",
            data: [], borderColor: colors.t13, backgroundColor: colors.t13 + "22",
            tension: 0.3, pointRadius: 3, pointHoverRadius: 5, fill: true,
          },
        ]},
        options: baseOptions(colors),
      }
    );

    // 2. Ambient vs Surface comparison
    chartComparison = new Chart(
      document.getElementById("chartComparison"),
      {
        type: "line",
        data: { labels: [], datasets: [
          {
            label: "Surface °C (T3+T13 avg)",
            data: [], borderColor: colors.t3, backgroundColor: "transparent",
            tension: 0.3, pointRadius: 2,
          },
          {
            label: "Ambient °C",
            data: [], borderColor: colors.ambient, backgroundColor: "transparent",
            tension: 0.3, pointRadius: 2, borderDash: [5, 3],
          },
        ]},
        options: baseOptions(colors),
      }
    );

    // 3. Humidity & Wind speed
    chartWeather = new Chart(
      document.getElementById("chartWeather"),
      {
        type: "bar",
        data: { labels: [], datasets: [
          {
            label: "Humidity %",
            data: [], backgroundColor: colors.t13 + "55", borderColor: colors.t13,
            borderWidth: 1, yAxisID: "yHumidity",
          },
          {
            label: "Wind Speed km/h",
            data: [], type: "line", borderColor: colors.ambient, backgroundColor: "transparent",
            tension: 0.3, pointRadius: 2, yAxisID: "yWind",
          },
        ]},
        options: {
          ...baseOptions(colors),
          scales: {
            ...baseOptions(colors).scales,
            yHumidity: {
              type: "linear", position: "left",
              grid:  { color: colors.border, lineWidth: 0.5 },
              ticks: { color: colors.muted, font: { family: "'DM Mono', monospace", size: 10 } },
              min: 0, max: 100,
            },
            yWind: {
              type: "linear", position: "right",
              grid: { drawOnChartArea: false },
              ticks: { color: colors.muted, font: { family: "'DM Mono', monospace", size: 10 } },
              min: 0,
            },
          },
        },
      }
    );
  }

  /**
   * Update all charts with new data and filters.
   * Called whenever filter pills change or data is reloaded.
   *
   * @param {Object[]} records - All loaded records
   * @param {string} track  - "all"|"T3"|"T13"
   * @param {number} days   - Days back to show
   */
  function update(records, track, days) {
    const filtered = filterRecords(records, track, days);

    // ── Surface Temp chart ────────────────────────────
    const t3Data  = filterRecords(records, "T3",  days);
    const t13Data = filterRecords(records, "T13", days);

    // Use a unified label set from all records
    const allDates = filtered.map(r => fmtLabel(r.date, r.time));

    // Map T3 data to the unified timeline (null where missing)
    const t3Map  = Object.fromEntries(t3Data.map(r  => [fmtLabel(r.date, r.time), r.surfaceTemp]));
    const t13Map = Object.fromEntries(t13Data.map(r => [fmtLabel(r.date, r.time), r.surfaceTemp]));

    chartSurface.data.labels = allDates;
    chartSurface.data.datasets[0].data = allDates.map(l => t3Map[l] ?? null);
    chartSurface.data.datasets[1].data = allDates.map(l => t13Map[l] ?? null);
    chartSurface.update("none");

    // ── Ambient vs Surface chart ──────────────────────
    chartComparison.data.labels = allDates;
    chartComparison.data.datasets[0].data = filtered.map(r => r.surfaceTemp);
    chartComparison.data.datasets[1].data = filtered.map(r => r.ambientTemp);
    chartComparison.update("none");

    // ── Weather chart ─────────────────────────────────
    chartWeather.data.labels = allDates;
    chartWeather.data.datasets[0].data = filtered.map(r => r.humidity);
    chartWeather.data.datasets[1].data = filtered.map(r => r.windSpeed);
    chartWeather.update("none");
  }

  /**
   * Update chart theme colors (called by Theme module on switch).
   */
  function updateTheme() {
    // Wait one tick for CSS vars to update
    setTimeout(() => {
      const colors = getColors();
      const opts   = baseOptions(colors);

      [chartSurface, chartComparison, chartWeather].forEach(chart => {
        if (!chart) return;
        chart.options.plugins.legend.labels.color    = colors.text;
        chart.options.plugins.tooltip.backgroundColor = colors.card;
        chart.options.scales.x.grid.color  = colors.border;
        chart.options.scales.x.ticks.color = colors.muted;
        chart.options.scales.y.grid.color  = colors.border;
        chart.options.scales.y.ticks.color = colors.muted;
        chart.update("none");
      });
    }, 50);
  }

  return { init, update, updateTheme, filterRecords };
})();
