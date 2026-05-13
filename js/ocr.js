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
    };

    const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
    const fullText = rawText.toUpperCase();

    // ── DATE detection ─────────────────────────────────
    // Patterns: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD.MM.YYYY
    const datePatterns = [
      /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/,   // DD/MM/YYYY
      /(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})/,   // YYYY-MM-DD
    ];
    for (const pat of datePatterns) {
      const m = rawText.match(pat);
      if (m) {
        if (m[3]?.length === 4) {
          // DD/MM/YYYY → YYYY-MM-DD
          result.date = `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
        } else {
          // YYYY-MM-DD
          result.date = `${m[1]}-${m[2]}-${m[3]}`;
        }
        break;
      }
    }

    // ── TRACK detection ────────────────────────────────
    if (/\bT13\b/.test(fullText)) result.track = "T13";
    else if (/\bT3\b/.test(fullText)) result.track = "T3";

    // ── TIME + TEMP parsing ────────────────────────────
    // Look for time patterns (HH:MM) followed or preceded by a temperature
    // Temperature pattern: 1–3 digits, optional decimal (e.g. 52.3, 48, 61.0)
    const timeRe  = /(\d{1,2}:\d{2})/g;
    const tempRe  = /\b(\d{2,3}(?:\.\d)?)\s*(?:°C|°|C)?\b/g;

    // Extract all times from text
    const times = [...rawText.matchAll(timeRe)].map(m => m[1]);
    // Extract all plausible temperatures (20–80°C for surface temp)
    const temps = [...rawText.matchAll(/\b([2-8]\d(?:\.\d)?)\b/g)].map(m => parseFloat(m[1]));

    // Keyword-based row parsing
    const keywords = {
      morning:   ["MORNING", "MORN", "AM", "FORENOON", "FORE"],
      afternoon: ["AFTERNOON", "NOON", "PM", "MIDDAY", "AFTER"],
      evening:   ["EVENING", "EVE", "DUSK", "LATE PM"],
    };

    lines.forEach(line => {
      const UP = line.toUpperCase();
      const lineTime = line.match(/(\d{1,2}:\d{2})/)?.[1] || null;
      const lineTemp = line.match(/\b([2-8]\d(?:\.\d)?)\b/)?.[1] || null;

      for (const [period, keys] of Object.entries(keywords)) {
        if (keys.some(k => UP.includes(k))) {
          result[`${period}Time`] = lineTime || result[`${period}Time`];
          result[`${period}Temp`] = lineTemp ? parseFloat(lineTemp) : result[`${period}Temp`];
        }
      }
    });

    // ── FALLBACK: assign times/temps in order if keywords not found ──
    // (handles sheets with just rows of time + temp)
    if (!result.morningTime && times.length >= 1) result.morningTime = times[0];
    if (!result.afternoonTime && times.length >= 2) result.afternoonTime = times[1];
    if (!result.eveningTime && times.length >= 3) result.eveningTime = times[2];

    if (!result.morningTemp && temps.length >= 1) result.morningTemp = temps[0];
    if (!result.afternoonTemp && temps.length >= 2) result.afternoonTemp = temps[1];
    if (!result.eveningTemp && temps.length >= 3) result.eveningTemp = temps[2];

    return result;
  }

  /**
   * Populate the upload form with extracted/parsed data.
   * Empty fields are left blank for manual entry.
   *
   * @param {Object} parsed - Output of parseExtractedText()
   */
  function populateForm(parsed) {
    if (parsed.date)          document.getElementById("fDate").value          = parsed.date;
    if (parsed.track)         document.getElementById("fTrack").value         = parsed.track;
    if (parsed.morningTime)   document.getElementById("rMorningTime").value   = parsed.morningTime;
    if (parsed.morningTemp)   document.getElementById("rMorningTemp").value   = parsed.morningTemp;
    if (parsed.afternoonTime) document.getElementById("rAfternoonTime").value = parsed.afternoonTime;
    if (parsed.afternoonTemp) document.getElementById("rAfternoonTemp").value = parsed.afternoonTemp;
    if (parsed.eveningTime)   document.getElementById("rEveningTime").value   = parsed.eveningTime;
    if (parsed.eveningTemp)   document.getElementById("rEveningTemp").value   = parsed.eveningTemp;
  }

  /**
   * Full pipeline: extract → parse → populate form.
   * Drives the OCR status bar in the UI.
   *
   * @param {File} file - Image file
   */
  async function processImage(file) {
    const statusEl = document.getElementById("ocrStatus");
    const barEl    = document.getElementById("ocrBar");
    const msgEl    = document.getElementById("ocrMsg");
    const preview  = document.getElementById("previewWrap");
    const previewImg = document.getElementById("previewImg");

    // Show preview
    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove("hidden");

    // Show progress bar
    statusEl.classList.remove("hidden");
    barEl.style.width = "0%";
    msgEl.textContent = "Initialising OCR engine…";

    try {
      const rawText = await extractText(file, (progress) => {
        barEl.style.width = `${Math.round(progress * 100)}%`;
        msgEl.textContent = `Recognising text… ${Math.round(progress * 100)}%`;
      });

      barEl.style.width = "100%";
      msgEl.textContent = "Parsing extracted data…";

      const parsed = parseExtractedText(rawText);
      populateForm(parsed);

      msgEl.textContent = "Done — review and correct values below.";
      App.showToast("OCR complete — please review extracted values");

      // Log raw text for debugging (engineers can check console)
      console.group("[NATRAX OCR] Raw extracted text");
      console.log(rawText);
      console.log("Parsed:", parsed);
      console.groupEnd();

    } catch (err) {
      msgEl.textContent = `OCR failed: ${err.message}. Enter data manually.`;
      console.error("[NATRAX OCR] Error:", err);
      App.showToast("OCR failed — please enter data manually");
    }
  }

  return { processImage, parseExtractedText, populateForm };
})();
