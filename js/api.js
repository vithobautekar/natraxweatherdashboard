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
   * Apps Script Web Apps require following redirects and
   * sending as text/plain to avoid CORS preflight failures.
   * @param {Object[]} rows - Array of row objects to append
   * @param {string} adminToken - Hashed password for auth
   */
  async function saveRows(rows, adminToken) {
    const payload = JSON.stringify({ action: "saveRows", token: adminToken, rows });

    // Apps Script rejects application/json from cross-origin due to preflight.
    // Sending as text/plain avoids the preflight and GAS parses it fine.
    const res = await fetch(CONFIG.GAS_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: payload,
    });

    if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);

    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error("Server returned invalid response — check Apps Script deployment");
    }

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
    const base = w.ARCHIVE_BASE || w.BASE || "https://archive-api.open-meteo.com/v1";
    const url = [
      `${base}/archive?`,
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
    const base = w.FORECAST_BASE || w.BASE || "https://api.open-meteo.com/v1";
    const url = [
      `${base}/forecast?`,
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
    const today = todayISO();
    const hour  = parseInt(time?.split(":")[0] || "12", 10);

    if (date < today) {
      // Historical data via archive API
      return await fetchHistoricalWeather(date, hour);
    } else {
      // Current / future via forecast API
      return await fetchCurrentWeather();
    }
  }

  /**
   * Return today's date in local browser time as YYYY-MM-DD.
   * Avoids UTC rollover causing today's IST uploads to be treated as yesterday.
   */
  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  // Expose public API
  return { fetchAllData, saveRows, fetchWeatherForDateTime, fetchCurrentWeather };
})();
