/**
 * ocr.js — Image OCR & Data Extraction
 * ──────────────────────────────────────
 * Uses Tesseract.js to extract text from uploaded images.
 * Parses the extracted text to populate the entry form.
 * Handles both printed Excel screenshots and handwritten sheets.
 */

const OCR = (() => {

  /**
   * Run OCR on an image file using Tesseract.js.
   * Reports progress via the onProgress callback.
   *
   * @param {File} file - Image file object
   * @param {Function} onProgress - Called with 0–1 progress value
   * @returns {string} Extracted raw text
   */
  async function extractText(file, onProgress) {
    // Tesseract.js: recognize with Indian English + number focus
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: m => {
        if (m.status === "recognizing text" && onProgress) {
          onProgress(m.progress);
        }
      },
    });

    // Optimize for tabular/numeric data (common in track sheets)
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:./-_ \n",
      preserve_interword_spaces: "1",
    });

    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    return text;
  }

  /**
   * Parse OCR raw text into structured data fields.
   * Tries multiple patterns to handle varied sheet formats.
   *
   * Expected sheet structure:
   *   Date: DD/MM/YYYY or YYYY-MM-DD
   *   Track: T3 or T13
   *   Morning:   HH:MM   XX.X
   *   Afternoon: HH:MM   XX.X
   *   Evening:   HH:MM   XX.X
   *
   * @param {string} rawText - Text from Tesseract
   * @returns {Object} Parsed fields (partial if recognition limited)
   */
  function parseExtractedText(rawText) {
    const result = {
      date:          null,
      track:         null,
      morningTime:   null,
      morningTemp:   null,
      afternoonTime: null,
      afternoonTemp: null,
      eveningTime:   null,
      eveningTemp:   null,
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
