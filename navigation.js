/**************************************************************
 * navigation.js
 * Home dashboard navigation + edit banner helpers
 **************************************************************/

function openMenu(sectionId) {
  const dashboard = document.getElementById("home-dashboard");
  const backBar = document.getElementById("back-bar");

  if (dashboard) dashboard.style.display = "none";
  if (backBar) backBar.style.display = "block";

  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.remove("active");
    content.style.display = "none";
  });

  const target = document.getElementById(sectionId);
  if (target) {
    target.style.display = "block";
    target.classList.add("active");
  }

  if (sectionId === "content-cashbook") renderCashbookMonth(false);
  if (sectionId === "content-abstract") generateAbstract();
  if (sectionId === "content-history") renderHistoryTable();

  window.scrollTo(0, 0);
}

function goHome() {
  const dashboard = document.getElementById("home-dashboard");
  const backBar = document.getElementById("back-bar");

  if (dashboard) dashboard.style.display = "block";
  if (backBar) backBar.style.display = "none";

  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.remove("active");
    content.style.display = "none";
  });

  window.scrollTo(0, 0);
}

function switchTab(tabName) {
  openMenu("content-" + tabName);
}

function openHistoryForDate(dateStr) {
  const dateInput = document.getElementById("history-search-date");
  const natSelect = document.getElementById("history-filter-nat");

  if (dateInput) dateInput.value = dateStr;
  if (natSelect) natSelect.value = "all";

  openMenu("content-history");
  renderHistoryTable();
}

/* Edit banner helpers */
function showEditBanner(dateStr) {
  const banner = document.getElementById("edit-banner");
  const dateEl = document.getElementById("edit-banner-date");
  dateEl.textContent = dateStr ? displayDateFromDateStr(dateStr) : "-";
  banner.style.display = "flex";
}

function hideEditBanner() {
  document.getElementById("edit-banner").style.display = "none";
}

function updateSaveButtonLabel() {
  const label = currentEditDocId ? "Update Record" : "Save to Database";
  const btnTab1 = document.getElementById("btn-save-db-tab1");
  if (btnTab1) btnTab1.textContent = label;
}

function cancelEdit(silent = false) {
  currentEditDocId = null;
  hideEditBanner();
  updateSaveButtonLabel();

  paymentAutofillEnabled = true;
  bankRemitDateManualOverride = false;

  if (!silent) alert("Edit cancelled.");
}