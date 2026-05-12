/**
 * upload.js — Admin Upload & Form Logic
 * ──────────────────────────────────────
 * Handles:
 *   - Drag-and-drop / file-select → OCR pipeline
 *   - Manual form entry
 *   - Weather data fetch on save
 *   - Submission to Google Apps Script
 */

const Upload = (() => {

  /** Set up all upload/form listeners. Called from App.init(). */
  function initListeners() {
    const dropZone  = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");
    const selectBtn = document.getElementById("selectFileBtn");
    const clearBtn  = document.getElementById("clearFormBtn");
    const saveBtn   = document.getElementById("saveBtn");

    // ── File select button ────────────────────────────
    selectBtn?.addEventListener("click", () => fileInput?.click());

    // ── File input change ─────────────────────────────
    fileInput?.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) OCR.processImage(file);
    });

    // ── Drag and drop ─────────────────────────────────
    dropZone?.addEventListener("dragover", e => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone?.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragover");
    });
    dropZone?.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) {
        OCR.processImage(file);
      } else {
        App.showToast("Please drop an image file");
      }
    });

    // Keyboard accessibility for drop zone
    dropZone?.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") fileInput?.click();
    });

    // ── Clear form ────────────────────────────────────
    clearBtn?.addEventListener("click", clearForm);

    // ── Save ──────────────────────────────────────────
    saveBtn?.addEventListener("click", handleSave);
  }

  /** Clear all form fields and reset UI state. */
  function clearForm() {
    ["fDate","fTrack",
     "rMorningTime","rMorningTemp",
     "rAfternoonTime","rAfternoonTemp",
     "rEveningTime","rEveningTemp",
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    document.getElementById("ocrStatus")?.classList.add("hidden");
    document.getElementById("previewWrap")?.classList.add("hidden");
    document.getElementById("saveStatus")?.classList.add("hidden");

    const label = document.getElementById("weatherFetchLabel");
    if (label) label.textContent = "Weather data will be fetched automatically on save";
  }

  /**
   * Read the entry form and build an array of row objects
   * (one per reading period that has data).
   */
  function readFormRows() {
    const date  = document.getElementById("fDate")?.value?.trim();
    const track = document.getElementById("fTrack")?.value?.trim();

    if (!date)  { App.showToast("Please enter a date"); return null; }
    if (!track) { App.showToast("Please select a track"); return null; }

    const readings = [
      { period: "Morning",   timeId: "rMorningTime",   tempId: "rMorningTemp" },
      { period: "Afternoon", timeId: "rAfternoonTime", tempId: "rAfternoonTemp" },
      { period: "Evening",   timeId: "rEveningTime",   tempId: "rEveningTemp" },
    ];

    const rows = [];
    for (const r of readings) {
      const time = document.getElementById(r.timeId)?.value?.trim();
      const temp = document.getElementById(r.tempId)?.value?.trim();
      if (time && temp) {
        rows.push({ date, track, time, surfaceTemp: parseFloat(temp), period: r.period });
      }
    }

    if (rows.length === 0) {
      App.showToast("Enter at least one reading (time + temperature)");
      return null;
    }
    return rows;
  }

  /**
   * Handle save button click:
   *   1. Validate form
   *   2. Fetch weather for each row
   *   3. Send to Google Apps Script
   */
  async function handleSave() {
    const saveBtn    = document.getElementById("saveBtn");
    const statusEl   = document.getElementById("saveStatus");
    const weatherLabel = document.getElementById("weatherFetchLabel");

    const rows = readFormRows();
    if (!rows) return;

    saveBtn.disabled = true;
    statusEl.className = "save-status";
    statusEl.classList.remove("hidden");
    statusEl.textContent = "Fetching weather data…";
    if (weatherLabel) weatherLabel.textContent = "Fetching weather data…";

    try {
      // Enrich each row with weather data
      const enrichedRows = await Promise.all(rows.map(async row => {
        let weather = { ambientTemp: null, humidity: null, windSpeed: null };
        try {
          weather = await API.fetchWeatherForDateTime(row.date, row.time);
        } catch (e) {
          console.warn("[NATRAX] Weather fetch failed for row:", row, e);
        }
        return {
          date:        row.date,
          time:        row.time,
          track:       row.track,
          surfaceTemp: row.surfaceTemp,
          ambientTemp: weather.ambientTemp,
          windSpeed:   weather.windSpeed,
          humidity:    weather.humidity,
          source:      "OCR+Manual",
        };
      }));

      if (weatherLabel) {
        weatherLabel.textContent = `Weather fetched ✓`;
      }

      statusEl.textContent = "Saving to Google Sheet…";

      const token   = Auth.getToken();
      const result  = await API.saveRows(enrichedRows, token);

      statusEl.className = "save-status success";
      statusEl.textContent = `✓ Saved ${enrichedRows.length} record(s) to Google Sheet.`;
      App.showToast("Data saved successfully");

      // Reload dashboard data
      await App.loadData();
      clearForm();

    } catch (err) {
      statusEl.className = "save-status error";
      statusEl.textContent = `Error: ${err.message}`;
      App.showToast("Save failed — see form for details");
      console.error("[NATRAX Upload] Save error:", err);

    } finally {
      saveBtn.disabled = false;
    }
  }

  return { initListeners, clearForm };
})();
