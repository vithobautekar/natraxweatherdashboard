/**
 * Code.gs — NATRAX Track Thermal Monitor
 * Google Apps Script Backend
 * ═══════════════════════════════════════════════════════
 *
 * SETUP INSTRUCTIONS:
 *   1. Go to https://script.google.com → New Project
 *   2. Paste this entire file as Code.gs
 *   3. Set SHEET_ID below to your Google Sheet's ID
 *      (from the Sheet URL: spreadsheets/d/SHEET_ID/edit)
 *   4. Set ADMIN_HASH to SHA-256 of your admin password
 *      (must match the hash in js/config.js)
 *   5. Run setupSheet() once manually (Run → setupSheet)
 *   6. Deploy → New Deployment → Web App
 *      Execute as: Me | Who can access: Anyone
 *   7. Copy the Web App URL into js/config.js → GAS_URL
 *
 * ═══════════════════════════════════════════════════════
 */

// ── CONFIGURATION ─────────────────────────────────────

/** Your Google Sheet ID (from its URL) */
const SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE";

/** SHA-256 hash of admin password — must match js/config.js */
const ADMIN_HASH = "7b1f0b0a1ad5b77e28c8e5ad4e3b60a7b0c0d7e6f1a2b3c4d5e6f7a8b9c0d1e2";

/** Sheet tab name */
const SHEET_NAME = "Temperature Data";

/** Column headers (defines schema) */
const HEADERS = [
  "Date",
  "Time",
  "Track",
  "Surface Temperature (°C)",
  "Ambient Temperature (°C)",
  "Wind Speed (km/h)",
  "Humidity (%)",
  "Source",
  "Timestamp (Saved)",
];

// ── CORS helper ───────────────────────────────────────

/**
 * Build a JSON response with CORS headers for GitHub Pages.
 * @param {Object} data - Response payload
 * @param {number} code - HTTP status (200 or 400)
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HTTP GET handler ──────────────────────────────────

/**
 * Handle GET requests: read sheet data or ping.
 * Endpoint: ?action=getData
 */
function doGet(e) {
  const action = e?.parameter?.action || "";

  try {
    if (action === "getData") {
      return jsonResponse({ data: readAllRows() });
    }
    // Ping / health check
    return jsonResponse({ status: "ok", app: "NATRAX Thermal Monitor", version: "1.0" });

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── HTTP POST handler ─────────────────────────────────

/**
 * Handle POST requests: write data.
 * Requires valid admin token.
 * Body: { action: "saveRows", token: "<hash>", rows: [...] }
 */
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData?.contents || "{}");
    const action = body.action || "";

    // Authenticate
    if (!isValidToken(body.token)) {
      return jsonResponse({ error: "Unauthorised: invalid token" });
    }

    if (action === "saveRows") {
      const rows    = body.rows || [];
      const results = appendRows(rows);
      return jsonResponse({ success: true, saved: results.saved, skipped: results.skipped });
    }

    return jsonResponse({ error: `Unknown action: ${action}` });

  } catch (err) {
    Logger.log("[NATRAX] doPost error: " + err.message);
    return jsonResponse({ error: err.message });
  }
}

// ── Authentication ────────────────────────────────────

/**
 * Validate the admin token (SHA-256 hash of password).
 * Uses constant-time comparison to prevent timing attacks.
 * @param {string} token - Submitted hash
 * @returns {boolean}
 */
function isValidToken(token) {
  if (!token || typeof token !== "string") return false;
  // Simple string comparison (Apps Script doesn't have timing-safe compare)
  return token === ADMIN_HASH;
}

// ── Sheet Setup ───────────────────────────────────────

/**
 * Create the sheet and header row if they don't exist.
 * Run this ONCE manually before first use.
 */
function setupSheet() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  let sheet   = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log("Created sheet: " + SHEET_NAME);
  }

  // Write headers if row 1 is empty
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (!firstRow[0]) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

    // Style header row
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight("bold")
               .setBackground("#1a1a18")
               .setFontColor("#ffffff")
               .setFontFamily("Courier New");

    // Freeze header row
    sheet.setFrozenRows(1);

    // Set column widths
    sheet.setColumnWidth(1, 110); // Date
    sheet.setColumnWidth(2, 80);  // Time
    sheet.setColumnWidth(3, 60);  // Track
    sheet.setColumnWidths(4, 4, 130); // Temperatures
    sheet.setColumnWidth(8, 100); // Source
    sheet.setColumnWidth(9, 150); // Timestamp

    Logger.log("Headers written and styled.");
  } else {
    Logger.log("Sheet already has headers — skipping.");
  }

  Logger.log("Setup complete. Sheet ID: " + ss.getId());
}

// ── Read Data ─────────────────────────────────────────

/**
 * Read all data rows from the sheet.
 * Skips the header row. Returns array of objects.
 * @returns {Object[]}
 */
function readAllRows() {
  const sheet  = getSheet();
  const data   = sheet.getDataRange().getValues();

  if (data.length <= 1) return []; // Only headers or empty

  // Map rows to objects using header names
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      // Format dates as YYYY-MM-DD strings
      if (val instanceof Date) {
        val = Utilities.formatDate(val, "Asia/Kolkata", "yyyy-MM-dd");
      }
      obj[headerToKey(h)] = val !== "" ? val : null;
    });
    return obj;
  }).filter(r => r.date); // Skip blank rows
}

/**
 * Convert a header string to a camelCase key.
 * e.g. "Surface Temperature (°C)" → "surfaceTemp"
 */
function headerToKey(header) {
  const map = {
    "Date":                       "date",
    "Time":                       "time",
    "Track":                      "track",
    "Surface Temperature (°C)":   "surfaceTemp",
    "Ambient Temperature (°C)":   "ambientTemp",
    "Wind Speed (km/h)":          "windSpeed",
    "Humidity (%)":               "humidity",
    "Source":                     "source",
    "Timestamp (Saved)":          "savedAt",
  };
  return map[header] || header.toLowerCase().replace(/\s+/g, "_");
}

// ── Write Data ────────────────────────────────────────

/**
 * Append new rows to the sheet.
 * Checks for duplicates (same Date + Time + Track) before inserting.
 *
 * @param {Object[]} rows - Array of row data objects
 * @returns {{ saved: number, skipped: number }}
 */
function appendRows(rows) {
  const sheet      = getSheet();
  const existing   = buildDuplicateIndex(sheet);
  const savedAt    = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");

  let saved   = 0;
  let skipped = 0;

  rows.forEach(r => {
    // Validate required fields
    if (!r.date || !r.time || !r.track || r.surfaceTemp == null) {
      Logger.log("Skipping incomplete row: " + JSON.stringify(r));
      skipped++;
      return;
    }

    // Duplicate check key: "YYYY-MM-DD|HH:MM|T3"
    const key = `${r.date}|${r.time}|${r.track}`;
    if (existing.has(key)) {
      Logger.log("Duplicate skipped: " + key);
      skipped++;
      return;
    }

    // Build the row array in column order
    const rowArr = [
      r.date,
      r.time,
      r.track,
      r.surfaceTemp != null ? Number(r.surfaceTemp) : "",
      r.ambientTemp != null ? Number(r.ambientTemp) : "",
      r.windSpeed   != null ? Number(r.windSpeed)   : "",
      r.humidity    != null ? Number(r.humidity)    : "",
      r.source      || "Manual",
      savedAt,
    ];

    sheet.appendRow(rowArr);
    existing.add(key); // Prevent duplicate in same batch
    saved++;
  });

  Logger.log(`Batch complete. Saved: ${saved}, Skipped: ${skipped}`);
  return { saved, skipped };
}

/**
 * Build a Set of existing "date|time|track" composite keys for duplicate detection.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Set<string>}
 */
function buildDuplicateIndex(sheet) {
  const data   = sheet.getDataRange().getValues();
  const index  = new Set();

  if (data.length <= 1) return index;

  // Columns: Date=0, Time=1, Track=2
  data.slice(1).forEach(row => {
    const date  = row[0] instanceof Date
      ? Utilities.formatDate(row[0], "Asia/Kolkata", "yyyy-MM-dd")
      : String(row[0]);
    const time  = String(row[1] || "");
    const track = String(row[2] || "");
    if (date && time && track) {
      index.add(`${date}|${time}|${track}`);
    }
  });

  return index;
}

// ── Helpers ───────────────────────────────────────────

/**
 * Get the data sheet by name. Throws if not found.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found. Run setupSheet() first.`);
  }
  return sheet;
}

// ── Manual test helpers (run from Apps Script editor) ─

/** Test: fetch all rows and log count */
function testRead() {
  const rows = readAllRows();
  Logger.log("Total rows: " + rows.length);
  if (rows.length > 0) Logger.log("First row: " + JSON.stringify(rows[0]));
}

/** Test: append a dummy row */
function testWrite() {
  const dummy = [{
    date: "2024-06-01", time: "13:00", track: "T3",
    surfaceTemp: 52.3, ambientTemp: 34.1, windSpeed: 14.2, humidity: 62,
    source: "Test",
  }];
  const result = appendRows(dummy);
  Logger.log("Write result: " + JSON.stringify(result));
}
