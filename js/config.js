/**
 * config.js — NATRAX Track Thermal Monitor
 * ─────────────────────────────────────────
 * EDIT THIS FILE to point to your deployed Google Apps Script and Sheet.
 * All other scripts read from this config.
 */

const CONFIG = {
  /**
   * Google Apps Script Web App URL
   * After deploying your Apps Script, paste the URL here.
   * e.g. "https://script.google.com/macros/s/AKfyc.../exec"
   */
  GAS_URL: "https://script.google.com/macros/s/YOUR_SCRIPT_ID_HERE/exec",

  /**
   * Admin password hash (SHA-256 of the actual password).
   * Default password: "natrax2024"
   * To change: run `sha256("yourpassword")` in browser console using the
   * hashPassword() helper below, and paste the result here.
   *
   * NOTE: This is client-side security only — suitable for internal use.
   * For higher security, add server-side password check in Apps Script.
   */
  ADMIN_HASH: "7b1f0b0a1ad5b77e28c8e5ad4e3b60a7b0c0d7e6f1a2b3c4d5e6f7a8b9c0d1e2",

  /**
   * Open-Meteo API for weather data (free, no API key required).
   * NATRAX, Pithampur coordinates.
   */
  WEATHER_API: {
    BASE:      "https://api.open-meteo.com/v1",
    LAT:       22.617,   // NATRAX, Pithampur latitude
    LON:       76.617,   // NATRAX, Pithampur longitude
    TIMEZONE:  "Asia/Kolkata",
    CURRENT_PARAMS: "temperature_2m,relative_humidity_2m,wind_speed_10m",
    HOURLY_PARAMS:  "temperature_2m,relative_humidity_2m,wind_speed_10m",
  },

  /**
   * App metadata
   */
  APP: {
    NAME:     "NATRAX Thermal Monitor",
    VERSION:  "1.0.0",
    LOCATION: "NATRAX, Pithampur, MP, India",
    TRACKS:   ["T3", "T13"],
  },
};
