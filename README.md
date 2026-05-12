# NATRAX Track Thermal Monitor

> Surface temperature data recording, enrichment, and visualisation for vehicle testing tracks T3 & T13 at NATRAX, Pithampur.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Hosted on GitHub Pages](https://img.shields.io/badge/Hosted-GitHub%20Pages-blue)](https://pages.github.com/)

---

## Overview

This is a fully serverless, open-source web application for NATRAX track temperature monitoring. It allows track administration to upload handwritten or Excel-photographed temperature sheets via OCR, automatically enriches each reading with weather data (ambient temperature, wind speed, humidity) from [Open-Meteo](https://open-meteo.com/), stores everything in a Google Sheet, and provides a public read-only dashboard with charts and CSV export.

**Architecture:**

```
GitHub Pages (Frontend)
   ├── HTML + CSS + JS (static, no build step)
   ├── Tesseract.js (client-side OCR)
   ├── Chart.js (data visualisation)
   └── Open-Meteo API (weather, free, no key)

Google Apps Script (Backend)
   ├── HTTP Web App endpoint (GET + POST)
   ├── Duplicate-safe row append
   ├── Admin token validation
   └── Google Sheets (primary database)
```

---

## Features

| Feature | Status |
|---|---|
| OCR extraction from photos/screenshots | ✅ |
| Manual data entry and correction | ✅ |
| Historical + real-time weather enrichment | ✅ |
| Google Sheets storage with duplicate prevention | ✅ |
| Surface temp charts (T3 & T13 separately) | ✅ |
| Ambient vs Surface comparison chart | ✅ |
| Humidity & Wind speed chart | ✅ |
| Date range + track filters | ✅ |
| CSV export | ✅ |
| Admin-only upload (password protected) | ✅ |
| Light/Dark mode (time-based auto-switch) | ✅ |
| Mobile-first responsive design | ✅ |
| No server, no build step, no dependencies to install | ✅ |

---

## Google Sheets Schema

| Column | Type | Description |
|---|---|---|
| Date | YYYY-MM-DD | Reading date |
| Time | HH:MM | Reading time (IST) |
| Track | T3 / T13 | Track identifier |
| Surface Temperature (°C) | Float | Manually recorded / OCR extracted |
| Ambient Temperature (°C) | Float | Auto-fetched from Open-Meteo |
| Wind Speed (km/h) | Float | Auto-fetched from Open-Meteo |
| Humidity (%) | Float | Auto-fetched from Open-Meteo |
| Source | String | "OCR+Manual", "Manual", "Test", etc. |
| Timestamp (Saved) | Datetime | When the row was saved to the sheet |

Duplicate detection uses a composite key: `Date + Time + Track`. No duplicate row is ever written.

---

## System Architecture

```
┌──────────────────────────────────────────────────────┐
│                   USER'S BROWSER                     │
│                                                      │
│  ┌──────────────┐   ┌───────────┐   ┌─────────────┐ │
│  │  Dashboard   │   │   Table   │   │   Upload    │ │
│  │  (charts)    │   │  (data)   │   │  (admin)    │ │
│  └──────┬───────┘   └─────┬─────┘   └──────┬──────┘ │
│         │                 │                │         │
│         └────────┬────────┘                │         │
│                  ▼                         │         │
│           api.js (fetch)            ocr.js (Tesseract│
│                  │                         │         │
└──────────────────┼─────────────────────────┼─────────┘
                   │                         │
         ┌─────────┴──────┐        ┌─────────┴──────────┐
         │  Google Apps   │        │    Open-Meteo API  │
         │    Script      │        │  (weather, free)   │
         │  (Web App URL) │        └────────────────────┘
         └───────┬────────┘
                 │
         ┌───────┴────────┐
         │  Google Sheet  │
         │  (database)    │
         └────────────────┘
```

---

## Setup Guide

### Step 1: Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) → Create a new blank spreadsheet.
2. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`YOUR_SHEET_ID`**`/edit`

### Step 2: Google Apps Script

1. Go to [script.google.com](https://script.google.com) → New Project.
2. Delete the default `myFunction` code.
3. Paste the contents of `Code.gs` from this repository.
4. In `Code.gs`, set:
   ```javascript
   const SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE";
   const ADMIN_HASH = "your-sha256-hash-here";
   ```
5. **Run `setupSheet()`** once (Run → Run Function → setupSheet).
   - Authorize the script when prompted.
   - This creates the sheet tab and writes the header row.
6. Deploy as Web App:
   - Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the Web App URL.

### Step 3: Frontend Configuration

1. Fork or clone this repository.
2. Open `js/config.js`.
3. Set `GAS_URL` to your Apps Script Web App URL.
4. Set `ADMIN_HASH` to the SHA-256 hash of your desired admin password.

**How to generate the admin password hash:**

Open your browser DevTools console and run:
```javascript
async function sha256(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,"0")).join("");
}
sha256("your-password-here").then(console.log);
```
Paste the output into both `Code.gs` and `js/config.js`.

### Step 4: GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`.
4. Your app will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME`.

---

## Weather Data Source

This application uses [Open-Meteo](https://open-meteo.com/) — a free, open-source weather API:

- **No API key required**
- Supports historical data back to 1940 (via the archive endpoint)
- Covers real-time and short-range forecast data
- NATRAX coordinates hardcoded: `Lat 22.617, Lon 76.617` (Pithampur, MP)

For historical uploads, the archive API is queried. For today's data, the forecast API is used.

---

## Admin Access

- Click **Admin** in the top-right corner.
- Enter the admin password.
- The **Upload** tab becomes visible.
- Session persists until the browser tab is closed (uses `sessionStorage`).

> **Security note:** This is client-side password protection — appropriate for internal engineering use. For production, move password validation entirely to the Apps Script backend and consider using Google OAuth.

---

## OCR Accuracy

OCR uses [Tesseract.js](https://tesseract.projectnaptha.com/) in the browser:

- Works well for **printed Excel screenshots** (high accuracy).
- Works reasonably for **clear handwritten sheets** (moderate accuracy — always review).
- Always review and correct extracted values before saving.
- Raw OCR text is logged to browser DevTools console for debugging.

**Tip:** For best OCR results:
- Use good lighting and minimal shadows.
- Ensure the sheet is flat and the photo is not blurry.
- Higher-resolution photos improve accuracy.

---

## File Structure

```
natrax/
├── index.html          # Single-page app shell
├── css/
│   └── style.css       # All styles (mobile-first, CSS variables)
├── js/
│   ├── config.js       # GAS URL, admin hash, coordinates
│   ├── theme.js        # Light/dark mode switching
│   ├── api.js          # Google Sheet + Open-Meteo API calls
│   ├── ocr.js          # Tesseract OCR pipeline
│   ├── charts.js       # Chart.js data visualisation
│   ├── table.js        # Data table rendering + CSV export
│   ├── upload.js       # Upload form + weather enrichment + save
│   ├── auth.js         # Admin login (SHA-256 hash)
│   └── app.js          # Main controller + tab routing
├── Code.gs             # Google Apps Script backend (copy to GAS)
├── _config.yml         # GitHub Pages config
└── README.md
```

---

## Security Considerations

| Concern | Mitigation |
|---|---|
| Admin password exposure | Stored as SHA-256 hash; never plain text |
| Unauthorised writes | Apps Script validates token on every POST |
| Data tampering | Sheet is append-only; no delete/edit API exposed |
| API key exposure | No API keys needed (Open-Meteo is keyless) |
| CORS | Apps Script serves JSON with permissive headers; read-only data is public by design |
| Client-side auth bypass | All write operations require server-side token validation |

---

## License

MIT License — free to use, modify, and distribute. See [LICENSE](LICENSE).

---

## Contributing

This project is intended for NATRAX internal use but is open-source for transparency and community improvement. Pull requests for OCR improvements, additional chart types, or UI refinements are welcome.

---

*Built for engineering test traceability, not commercial use.*
