/**
 * theme.js — Light / Dark Mode Controller
 * ─────────────────────────────────────────
 * Auto-switches based on system time (6 AM–7 PM = light, else dark).
 * Manual toggle overrides and is stored in localStorage.
 */

const Theme = (() => {
  const HTML = document.documentElement;

  /** Determine theme from system time (not OS preference) */
  function getAutoTheme() {
    const h = new Date().getHours();
    return (h >= 6 && h < 19) ? "light" : "dark";
  }

  /** Apply a theme to the document */
  function apply(theme) {
    HTML.setAttribute("data-theme", theme);
    localStorage.setItem("natrax-theme", theme);
    // Update chart defaults when theme changes
    if (window.Charts) Charts.updateTheme(theme);
  }

  /** Toggle between light and dark */
  function toggle() {
    const current = HTML.getAttribute("data-theme");
    apply(current === "light" ? "dark" : "light");
  }

  /** Initialize — respect stored preference or auto-detect */
  function init() {
    const stored = localStorage.getItem("natrax-theme");
    apply(stored || getAutoTheme());

    document.getElementById("themeToggle")?.addEventListener("click", toggle);
  }

  return { init, apply, toggle, getAutoTheme };
})();

// Initialize immediately (before DOMContentLoaded to prevent flash)
Theme.init();
