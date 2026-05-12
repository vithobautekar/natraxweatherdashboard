/**
 * auth.js — Admin Authentication
 * ────────────────────────────────
 * Simple client-side password hash check.
 * Password is hashed (SHA-256) before comparison — never stored in plain text.
 * Session stored in sessionStorage (clears on browser close).
 *
 * For additional security, the Apps Script backend also validates the token
 * on every write request.
 */

const Auth = (() => {

  const SESSION_KEY = "natrax-admin-token";
  let _token = sessionStorage.getItem(SESSION_KEY) || null;

  /** SHA-256 hash of a string, returned as hex. Uses Web Crypto API. */
  async function sha256(str) {
    const buf    = new TextEncoder().encode(str);
    const hash   = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /** Check if currently logged in. */
  function isLoggedIn() {
    return !!_token;
  }

  /** Return the stored token (hashed password) for API calls. */
  function getToken() {
    return _token;
  }

  /**
   * Attempt login with the given password.
   * @param {string} password - Plain text password
   * @returns {boolean} Success
   */
  async function login(password) {
    const hash = await sha256(password);
    if (hash === CONFIG.ADMIN_HASH) {
      _token = hash;
      sessionStorage.setItem(SESSION_KEY, _token);
      return true;
    }
    return false;
  }

  /** Log out and clear session. */
  function logout() {
    _token = null;
    sessionStorage.removeItem(SESSION_KEY);
    updateUI();
  }

  /** Show/hide admin-only UI elements based on login state. */
  function updateUI() {
    const adminBtn    = document.getElementById("adminBtn");
    const adminOnlyEls = document.querySelectorAll(".admin-only");
    const uploadTab   = document.querySelector("[data-tab='upload']");

    if (isLoggedIn()) {
      adminBtn?.classList.add("logged-in");
      adminBtn && (adminBtn.textContent = "Logout");
      adminOnlyEls.forEach(el => el.classList.remove("hidden"));
    } else {
      adminBtn?.classList.remove("logged-in");
      adminBtn && (adminBtn.textContent = "Admin");
      adminOnlyEls.forEach(el => el.classList.add("hidden"));
      // Switch away from upload tab if active
      if (uploadTab?.classList.contains("active")) {
        document.querySelector("[data-tab='dashboard']")?.click();
      }
    }
  }

  /**
   * Attach admin button and login modal listeners.
   * Called once from App.init().
   */
  function initListeners() {
    const adminBtn      = document.getElementById("adminBtn");
    const loginModal    = document.getElementById("loginModal");
    const cancelBtn     = document.getElementById("cancelLoginBtn");
    const confirmBtn    = document.getElementById("confirmLoginBtn");
    const passwordInput = document.getElementById("adminPassword");
    const errorEl       = document.getElementById("loginError");

    function openModal() {
      loginModal?.classList.remove("hidden");
      passwordInput?.focus();
      errorEl?.classList.add("hidden");
      if (passwordInput) passwordInput.value = "";
    }
    function closeModal() {
      loginModal?.classList.add("hidden");
    }

    adminBtn?.addEventListener("click", () => {
      if (isLoggedIn()) {
        logout();
      } else {
        openModal();
      }
    });

    cancelBtn?.addEventListener("click", closeModal);

    // Click outside modal to close
    loginModal?.addEventListener("click", e => {
      if (e.target === loginModal) closeModal();
    });

    confirmBtn?.addEventListener("click", attemptLogin);
    passwordInput?.addEventListener("keydown", e => {
      if (e.key === "Enter") attemptLogin();
    });

    async function attemptLogin() {
      const pw = passwordInput?.value || "";
      if (!pw) return;
      confirmBtn.disabled = true;
      const success = await login(pw);
      confirmBtn.disabled = false;
      if (success) {
        closeModal();
        updateUI();
        App.showToast("Logged in as admin");
      } else {
        errorEl?.classList.remove("hidden");
        passwordInput?.select();
      }
    }

    // Restore session if already logged in
    updateUI();
  }

  return { isLoggedIn, getToken, login, logout, updateUI, initListeners, sha256 };
})();
