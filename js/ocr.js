/**
 * ocr.js — Image OCR & Data Extraction
 * ──────────────────────────────────────
 * Matches NATRAX actual sheet format:
 *
 *   S.N. | Date       | Location | Time  | Temperature (°C) | Remarks
 *    1   | 17|04|26   | T3       | 12:45 | 62.8             |
 *    2   |            | T3       | 12:46 | 63.9             |
 *    3   |            | T13      | 12:52 | 64.3             |
 *
 * Each row has its OWN track and time — not shared across a date block.
 * A date in the first column applies to all rows below it until the next date.
 * The form is dynamic: one row rendered per extracted reading.
 */

const OCR = (() => {

  /**
   * Run OCR using Tesseract.js.
   * @param {File} file
   * @param {Function} onProgress - receives 0–1
   * @returns {string} raw extracted text
   */
  async function extractText(file, onProgress) {
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: m => {
        if (m.status === "recognizing text" && onProgress) {
          onProgress(m.progress);
        }
      },
    });

    await worker.setParameters({
      preserve_interword_spaces: "1",
    });

    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    return text;
  }

  /**
   * Parse a DD/MM/YY or DD/MM/YYYY style date string → "YYYY-MM-DD"
   * Handles separators: / | . - and spaces OCR may insert.
   * @param {string} str
   * @returns {string|null}
   */
  function parseDate(str) {
    // Match patterns like: 17/04/26, 17|04|26, 17 04 26, 17-04-26
    const m = str.match(/(\d{1,2})[\|\/\.\-\s](\d{1,2})[\|\/\.\-\s](\d{2,4})/);
    if (!m) return null;
    let [, dd, mm, yy] = m;
    // Two-digit year: assume 2000s
    const yyyy = yy.length === 2 ? `20${yy}` : yy;
    return `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
  }

  /**
   * Normalise a track string extracted by OCR.
   * OCR often misreads T13 as "T13", "T1S", "713", "TIS", "To3" etc.
   * @param {string} str
   * @returns {"T3"|"T13"|null}
   */
  function normaliseTrack(str) {
    const s = str.toUpperCase().replace(/\s/g, "");
    if (/T1[3S38]|T13|TI3|713/.test(s)) return "T13";
    if (/T[O0]?3|T3/.test(s))           return "T3";
    return null;
  }

  /**
   * Parse OCR raw text into an array of row objects.
   *
   * Strategy:
   *   1. Split into lines, clean each line.
   *   2. Scan for date patterns — carry the last seen date forward.
   *   3. For each line, look for a track token + time token + temperature token.
   *   4. If all three found → emit a row.
   *
   * @param {string} rawText
   * @returns {Array<{date, track, time, temp}>}
   */
  function parseExtractedText(rawText) {
    const rows = [];
    const lines = rawText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 2);

    let currentDate = null;

    // Regex patterns
    const rDate  = /\b(\d{1,2})[\|\/\.\-](\d{1,2})[\|\/\.\-](\d{2,4})\b/;
    const rTime  = /\b(\d{1,2})[:\.](\d{2})\b/;
    // Surface temps at NATRAX are typically 30–80°C
    const rTemp  = /\b([3-7]\d(?:[.,]\d)?)\b/g;
    // Track: T3, T13 and common OCR misreads
    const rTrack = /\b(T\s?1\s?[3S38]|T[Oo0]?\s?3|7\s?1\s?3|T\s?I\s?3)\b/i;

    for (const line of lines) {
      // ── Try to extract a date from this line ──────────
      const dateMatch = line.match(rDate);
      if (dateMatch) {
        const parsed = parseDate(dateMatch[0]);
        if (parsed) currentDate = parsed;
      }

      // ── Try to extract a track ────────────────────────
      const trackMatch = line.match(rTrack);
      if (!trackMatch) continue;  // No track on this line → not a data row
      const track = normaliseTrack(trackMatch[0]);
      if (!track) continue;

      // ── Try to extract a time ─────────────────────────
      const timeMatch = line.match(rTime);
      if (!timeMatch) continue;
      const time = `${timeMatch[1].padStart(2,"0")}:${timeMatch[2]}`;

      // ── Try to extract a temperature ──────────────────
      // Find all candidate numbers, pick the most plausible one
      // (closest to typical surface temp range 30–80, avoid S.N. values like 1,2,3)
      const allTemps = [...line.matchAll(rTemp)].map(m => parseFloat(m[1].replace(",", ".")));
      if (allTemps.length === 0) continue;
      // Pick the largest value found (surface temp is usually the biggest number on the line)
      const temp = Math.max(...allTemps);

      rows.push({
        date:  currentDate || "",
        track,
        time,
        temp:  temp,
      });
    }

    return rows;
  }

  /**
   * Populate the dynamic readings table in the upload form.
   * Calls Upload.renderRows() which rebuilds the table from scratch.
   * @param {Array} rows - output of parseExtractedText()
   */
  function populateForm(rows) {
    Upload.renderRows(rows);
  }

  /**
   * Full pipeline: OCR → parse → populate form.
   * @param {File} file
   */
  async function processImage(file) {
    const statusEl   = document.getElementById("ocrStatus");
    const barEl      = document.getElementById("ocrBar");
    const msgEl      = document.getElementById("ocrMsg");
    const preview    = document.getElementById("previewWrap");
    const previewImg = document.getElementById("previewImg");

    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove("hidden");

    statusEl.classList.remove("hidden");
    barEl.style.width = "0%";
    msgEl.textContent = "Initialising OCR engine…";

    try {
      const rawText = await extractText(file, progress => {
        barEl.style.width = `${Math.round(progress * 100)}%`;
        msgEl.textContent = `Recognising text… ${Math.round(progress * 100)}%`;
      });

      barEl.style.width = "100%";
      msgEl.textContent = "Parsing extracted data…";

      const rows = parseExtractedText(rawText);

      console.group("[NATRAX OCR] Raw text & parsed rows");
      console.log(rawText);
      console.table(rows);
      console.groupEnd();

      if (rows.length === 0) {
        msgEl.textContent = "No data rows found — enter manually below.";
        App.showToast("OCR found no rows — check console or enter manually");
        Upload.renderRows([]);
      } else {
        populateForm(rows);
        msgEl.textContent = `Found ${rows.length} reading(s) — review and correct below.`;
        App.showToast(`OCR extracted ${rows.length} reading(s) — please review`);
      }

    } catch (err) {
      msgEl.textContent = `OCR failed: ${err.message}. Enter data manually.`;
      console.error("[NATRAX OCR] Error:", err);
      App.showToast("OCR failed — enter data manually");
    }
  }

  return { processImage, parseExtractedText, populateForm };
})();
