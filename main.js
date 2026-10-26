/**************************************************************
 * main.js
 * App bootstrap + event wiring
 **************************************************************/

window.addEventListener("load", () => {
  initFirebase();
  initCashbookControls();
  updateLastUpdateFromGitHub();

  // Pre-fill username + remember checkbox
  const remembered = loadRemembered();
  if (remembered?.username) {
    const uEl = document.getElementById("username");
    const rEl = document.getElementById("remember-me");
    if (uEl) uEl.value = remembered.username;
    if (rEl) rEl.checked = true;
  }

  // Login submit
  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    login();
  });

  // Hide login error on typing
  ["username", "password"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      document.getElementById("login-error").style.display = "none";
    });
  });

  // IMPORTANT: paymentAutofillEnabled should turn false ONLY if user edits EPOS/UPI/Cash
  ["pay-epos", "pay-upi", "pay-cash"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      paymentAutofillEnabled = false;
    });
  });

  // Bank remit: auto-set remit date when amount typed
  const bankRemitEl = document.getElementById("bank-remit");
  if (bankRemitEl) {
    bankRemitEl.addEventListener("input", () => {
      maybeAutoSetBankRemitDate();
    });
  }

  // Remit date: detect manual override
  const bankRemitDateEl = document.getElementById("bank-remit-date");
  if (bankRemitDateEl) {
    bankRemitDateEl.addEventListener("input", updateBankRemitManualOverrideFlag);
    bankRemitDateEl.addEventListener("change", updateBankRemitManualOverrideFlag);
  }

  // History actions (edit/delete)
  document.getElementById("history-tbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    if (!id) return;

    if (btn.dataset.action === "edit") await startEditFromHistory(id);
    if (btn.dataset.action === "delete") await deleteRecordFromHistory(id);
  });

  // History controls
  document.getElementById("history-search-date").addEventListener("input", () => renderHistoryTable());
  document.getElementById("history-filter-nat").addEventListener("change", () => renderHistoryTable());
  document.getElementById("btn-clear-history").addEventListener("click", () => {
    document.getElementById("history-search-date").value = "";
    document.getElementById("history-filter-nat").value = "all";
    renderHistoryTable();
  });

  // Print hook
  window.addEventListener("beforeprint", () => {
    const activeId = document.querySelector(".tab-content.active")?.id;
    if (activeId === "content-cashbook") renderCashbookMonth(false);
    if (activeId === "content-abstract") generateAbstract();
  });

  // Default view
  goHome();

  // Auto-login if remembered
  if (remembered?.username) {
    const shouldAutoLogin = (remembered.autoLogin !== false);
    const userStillExists = !!users?.[remembered.username];
    if (shouldAutoLogin && userStillExists) autoLoginUser(remembered.username);
    else if (shouldAutoLogin && !userStillExists) clearRemembered();
  }
});