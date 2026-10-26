/**************************************************************
 * calculations.js
 * All calculations + entry form UX logic
 **************************************************************/

function isWildlifeWeek(dateObj) {
  if (!dateObj) return false;
  // Oct = 9 (0-based)
  const m = dateObj.getMonth();
  const d = dateObj.getDate();
  return (m === 9 && d >= 2 && d <= 8);
}

/* Custom guides UI */
function toggleCustomGuidesUI(force) {
  const chk = document.getElementById("is-custom-guides");
  const box = document.getElementById("custom-guides-box");
  if (!chk || !box) return;

  const shouldShow = (typeof force === "boolean") ? force : !!chk.checked;
  box.style.display = shouldShow ? "block" : "none";
}

function onCustomGuidesToggle() {
  toggleCustomGuidesUI();
  calculateFees();
}

/* Bank remit auto-date */
function updateBankRemitManualOverrideFlag() {
  const remitDateEl = document.getElementById("bank-remit-date");
  const collectionDate = (document.getElementById("date")?.value || "").trim();
  const chosen = (remitDateEl?.value || "").trim();

  if (!chosen) {
    bankRemitDateManualOverride = false;
    return;
  }

  bankRemitDateManualOverride = !!(collectionDate && chosen !== collectionDate);
}

function maybeAutoSetBankRemitDate() {
  if (bankRemitDateManualOverride) return;

  const remit = getIntFromInput("bank-remit");
  if (remit <= 0) return;

  const collectionDate = (document.getElementById("date")?.value || "").trim();
  if (!collectionDate) return;

  const remitDateEl = document.getElementById("bank-remit-date");
  if (!remitDateEl) return;

  const current = (remitDateEl.value || "").trim();
  if (!current || current === collectionDate) {
    remitDateEl.value = collectionDate;
  }
}

/* Date-change reset logic */
function resetEntryFormForNewDate({ keepDate = true } = {}) {
  setValIfExists("pkg-5-count", "");
  setValIfExists("pkg-10-count", "");
  setValIfExists("extra-persons", "");
  setValIfExists("children", "");

  const holidayEl = document.getElementById("is-holiday");
  if (holidayEl) holidayEl.checked = false;

  const customEl = document.getElementById("is-custom-guides");
  if (customEl) customEl.checked = false;

  setValIfExists("custom-guides-count", "");
  toggleCustomGuidesUI(false);

  setValIfExists("pay-epos", "");
  setValIfExists("pay-upi", "");
  setValIfExists("pay-cash", "");
  setValIfExists("bank-remit", "");
  setValIfExists("bank-remit-date", "");
  setValIfExists("remarks", "");

  paymentAutofillEnabled = true;
  bankRemitDateManualOverride = false;

  const badge = document.getElementById("wildlife-week-badge");
  if (badge) badge.style.display = "none";

  clearMessages();

  if (!keepDate) setValIfExists("date", "");
}

function onDateChanged() {
  const dateVal = (document.getElementById("date")?.value || "").trim();

  if (currentEditDocId) {
    calculateFees();
    return;
  }

  if (!dateVal) {
    lastSelectedDateForEntry = "";
    resetEntryFormForNewDate({ keepDate: true });
    calculateFees();
    return;
  }

  if (dateVal !== lastSelectedDateForEntry) {
    resetEntryFormForNewDate({ keepDate: true });
    lastSelectedDateForEntry = dateVal;
  }

  calculateFees();
}

/**
 * ✅ BUG FIX: continuously updates UPI while EPOS & Cash are blank/0
 * (and paymentAutofillEnabled is still true)
 */
function autofillUPIFromIncome({ respectUserLock = true } = {}) {
  const income = Number(document.getElementById("calc-income")?.value || 0);
  if (respectUserLock && !paymentAutofillEnabled) return;

  const eposEmptyOrZero = isBlankOrZero("pay-epos");
  const cashEmptyOrZero = isBlankOrZero("pay-cash");

  if (eposEmptyOrZero && cashEmptyOrZero) {
    const upiEl = document.getElementById("pay-upi");
    if (upiEl) upiEl.value = income > 0 ? String(income) : "";
  }
}

function calculateFees() {
  toggleCustomGuidesUI();

  const nationality = document.getElementById("nationality").value;

  const count5 = getIntFromInput("pkg-5-count");
  const count10 = getIntFromInput("pkg-10-count");
  const extraPersons = getIntFromInput("extra-persons");
  const totalPackages = count5 + count10;

  const dateVal = (document.getElementById("date").value || "").trim();
  const dateObj = parseLocalYMD(dateVal);

  const isHolidayChecked = document.getElementById("is-holiday").checked;

  let isWeekend = false;
  if (dateObj) {
    const dayOfWeek = dateObj.getDay();
    isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  }

  // Custom guide override
  const isCustomGuides = !!document.getElementById("is-custom-guides")?.checked;
  const customGuidesCount = isCustomGuides ? getIntFromInput("custom-guides-count") : 0;

  let guideFee = 0;
  if (isCustomGuides) {
    guideFee = customGuidesCount * 650;
  } else {
    if (totalPackages === 0) guideFee = 0;
    else if ((isWeekend || isHolidayChecked) && dateObj) guideFee = 5850;
    else guideFee = totalPackages * 650;
  }

  let income = 0, rr = 0, edc = 0;

  // ✅ EDC FIX: includes extraPersons * 5
  const edcBase = (count5 * 25) + (count10 * 50) + (extraPersons * 5);

  if (nationality === "indian") {
    income = (count5 * 1000) + (count10 * 2000) + (extraPersons * 200);
    rr = (count5 * 150) + (count10 * 300) + (extraPersons * 30);
    edc = edcBase;
  } else {
    income = (count5 * 2000) + (count10 * 4000) + (extraPersons * 400);
    rr = (count5 * 525) + (count10 * 1050) + (extraPersons * 105);
    edc = edcBase;
  }

  // Wildlife week exemption: RR free, income reduced by RR
  const ww = isWildlifeWeek(dateObj);
  const badge = document.getElementById("wildlife-week-badge");
  if (badge) badge.style.display = ww ? "inline-block" : "none";

  if (ww) {
    income = Math.max(0, income - rr);
    rr = 0;
  }

  const emf = income - rr - edc - guideFee;

  document.getElementById("calc-income").value = income;
  document.getElementById("calc-guide").value = guideFee;
  document.getElementById("calc-rr").value = rr;
  document.getElementById("calc-edc").value = edc;
  document.getElementById("calc-emf").value = emf;

  document.getElementById("display-total-income").innerText = income;

  if (dateObj) {
    let dayType = "";
    if (isWeekend && isHolidayChecked) dayType = " (Weekend + Public Holiday)";
    else if (isWeekend) dayType = " (Weekend)";
    else if (isHolidayChecked) dayType = " (Public Holiday)";

    document.getElementById("display-payment-date").innerText =
      `${formatDDMMYYYY(dateObj)}${dayType}`;
  } else {
    document.getElementById("display-payment-date").innerText = "-";
  }

  // UPI autofill (bug-fixed)
  autofillUPIFromIncome({ respectUserLock: true });

  // keep remit date auto-set
  maybeAutoSetBankRemitDate();
}