/**
 * api.js — Backend Communication Layer
 * ─────────────────────────────────────
 * Handles all communication with:
 *   1. Google Apps Script (read & write sheet data)
 *   2. Open-Meteo API (historical & real-time weather)
 */

const API = (() => {

  // ── Google Apps Script Calls ──────────────────────────

  /**
   * Fetch all records from Google Sheet.
   * Returns array of row objects.
   */
  async function fetchAllData() {
    const url = `${CONFIG.GAS_URL}?action=getData`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data || [];
  }

  /**
   * Save one or more rows to Google Sheet.
   * @param {Object[]} rows - Array of row objects to append
   * @param {string} adminToken - Hashed password for auth
   */
  async function saveRows(rows, adminToken) {
    const res = await fetch(CONFIG.GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveRows", token: adminToken, rows }),
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  }

  // ── Open-Meteo Weather API ────────────────────────────

  /**
   * Fetch historical hourly weather for a specific date and hour.
   * Uses Open-Meteo archive API (free, no key needed, covers past data).
   *
   * @param {string} date   - "YYYY-MM-DD"
   * @param {number} hour   - 0–23 (UTC+5:30 will be converted)
   * @returns {Object} { ambientTemp, humidity, windSpeed }
   */
  async function fetchHistoricalWeather(date, hour) {
    const w = CONFIG.WEATHER_API;
    const url = [
      `${w.BASE}/archive?`,
      `latitude=${w.LAT}&longitude=${w.LON}`,
      `&start_date=${date}&end_date=${date}`,
      `&hourly=${w.HOURLY_PARAMS}`,
      `&timezone=${encodeURIComponent(w.TIMEZONE)}`,
    ].join("");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
    const data = await res.json();

    // Find the index matching the requested hour in IST
    const times = data.hourly?.time || [];
    const targetStr = `${date}T${String(hour).padStart(2, "0")}:00`;
    let idx = times.findIndex(t => t.startsWith(targetStr));
    if (idx === -1) idx = 0; // fallback to first hour

    return {
      ambientTemp: data.hourly?.temperature_2m?.[idx]     ?? null,
      humidity:    data.hourly?.relative_humidity_2m?.[idx] ?? null,
      windSpeed:   data.hourly?.wind_speed_10m?.[idx]      ?? null,
    };
  }

  /**
   * Fetch current/real-time weather from Open-Meteo forecast API.
   * Used for today's or future uploads.
   *
   * @returns {Object} { ambientTemp, humidity, windSpeed }
   */
  async function fetchCurrentWeather() {
    const w = CONFIG.WEATHER_API;
    const url = [
      `${w.BASE}/forecast?`,
      `latitude=${w.LAT}&longitude=${w.LON}`,
      `&current=${w.CURRENT_PARAMS}`,
      `&timezone=${encodeURIComponent(w.TIMEZONE)}`,
    ].join("");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
    const data = await res.json();

    return {
      ambientTemp: data.current?.temperature_2m         ?? null,
      humidity:    data.current?.relative_humidity_2m   ?? null,
      windSpeed:   data.current?.wind_speed_10m         ?? null,
    };
  }

  /**
   * Smart weather fetch: uses archive for past dates, forecast for today/future.
   *
   * @param {string} date - "YYYY-MM-DD"
   * @param {string} time - "HH:MM"
   * @returns {Object} weather data object
   */
  async function fetchWeatherForDateTime(date, time) {
    const today = new Date().toISOString().slice(0, 10);
    const hour  = parseInt(time?.split(":")[0] || "12", 10);

    if (date < today) {
      // Historical data via archive API
      return await fetchHistoricalWeather(date, hour);
    } else {
      // Current / future via forecast API
      return await fetchCurrentWeather();
    }
  }

  // Expose public API
  return { fetchAllData, saveRows, fetchWeatherForDateTime, fetchCurrentWeather };
})();
