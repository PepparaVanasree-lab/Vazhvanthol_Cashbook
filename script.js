/**************************************************************
 * Vazhvanthol Eco Tourism Cash Book
 *
 * Key features:
 * - Firestore collection: daily_collections
 * - Doc ID: `${dateVal}_${nationality}` (e.g., 2026-10-22_indian)
 * - Home dashboard navigation (openMenu/goHome) using .active class
 * - Remember Me + Auto-login (no password stored)
 * - History (edit/delete) + Monthly Abstract (FY Apr->Mar)
 * - Monthly Cash Book view (table for all days + print)
 *
 * Updates implemented:
 * 1) Bank Remittance Date:
 *    - UI: #bank-remit-date
 *    - Firestore: bankRemitDate (defaults to dateStr)
 *    - Cashbook: Remitted column [I] shown on bankRemitDate row
 * 2) Cashbook ABSTRACT:
 *    - Digital (EPOS+UPI) not part of cash-in-hand
 *    - Closing = (Opening + Cash[H]) - Remitted[I]
 *    - Opening is computed from all previous records (cash - remits)
 **************************************************************/

/* ---------------------------
   FIREBASE CONFIG
---------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAmUEH6OZQq9lf6cWSyAryYWv7OC1oQsDg",
  authDomain: "vazhvantholcashbook.firebaseapp.com",
  projectId: "vazhvantholcashbook",
  storageBucket: "vazhvantholcashbook.firebasestorage.app",
  messagingSenderId: "771102944301",
  appId: "1:771102944301:web:0e07f2c1692efdd7305ca4"
};

let firebaseApp = null;
let firestoreDb = null;

/* ---------------------------
   USERS (Dummy login)
---------------------------- */
const USERS_LS_KEY = "vazhvanthol_users_v1";
const REMEMBER_LS_KEY = "vazhvanthol_remember_v1";

const DEFAULT_USERS = {
  admin: "admin123",
  secretary: "sec123"
};

let users = loadUsers();
let currentUser = null;

/* ---------------------------
   EDIT MODE STATE
---------------------------- */
let currentEditDocId = null;
let historyUnsubscribe = null;
let historyCache = new Map(); // docId -> data (with _id)

/* ---------------------------
   INIT
---------------------------- */
window.onload = function () {
  initFirebase();
  initCashbookControls();

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

  // Hide error on typing
  ["username", "password"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      document.getElementById("login-error").style.display = "none";
    });
  });

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

  // Print hook: keep printable content updated
  window.addEventListener("beforeprint", () => {
    const activeId = document.querySelector(".tab-content.active")?.id;
    if (activeId === "content-cashbook") renderCashbookMonth(false);
    if (activeId === "content-abstract") generateAbstract();
  });

  // Clean default state
  goHome();

  // AUTO-LOGIN
  if (remembered?.username) {
    const shouldAutoLogin = (remembered.autoLogin !== false); // backward compatible default true
    const userStillExists = !!users[remembered.username];
    if (shouldAutoLogin && userStillExists) autoLoginUser(remembered.username);
    else if (shouldAutoLogin && !userStillExists) clearRemembered();
  }
};

function initFirebase() {
  try {
    if (!window.firebase) return;

    firebaseApp = firebase.initializeApp(firebaseConfig);
    firestoreDb = firebase.firestore();

    firestoreDb.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      console.warn("Firestore persistence not enabled:", err.code);
    });

    console.log("Firebase initialized. Firestore ready.");
  } catch (e) {
    console.error("Firebase init failed:", e);
  }
}

/* ---------------------------
   CASHBOOK (MONTHLY) INIT
---------------------------- */
function initCashbookControls() {
  const monthSel = document.getElementById("cb-month");
  const yearInp = document.getElementById("cb-year");
  const loadBtn = document.getElementById("cb-load-btn");
  const printBtn = document.getElementById("cb-print-btn");
  const tbody = document.getElementById("cb-tbody");

  if (!monthSel || !yearInp || !loadBtn || !printBtn || !tbody) return;

  // Populate months 01..12
  monthSel.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `<option value="${m}">${m}</option>`;
  }).join("");

  // Defaults: current month/year
  const now = new Date();
  monthSel.value = String(now.getMonth() + 1).padStart(2, "0");
  yearInp.value = String(now.getFullYear());

  loadBtn.addEventListener("click", () => renderCashbookMonth(true));
  printBtn.addEventListener("click", () => window.print());

  // Edit button handling from monthly cashbook table
  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === "edit-doc" && btn.dataset.id) {
      await startEditFromHistory(btn.dataset.id);
    }

    if (action === "edit-date" && btn.dataset.date) {
      openHistoryForDate(btn.dataset.date);
    }
  });
}

/**
 * Monthly cash book table:
 * - one row per day
 * - aggregates Indian + Foreigner records for the *collection date* (dateStr)
 * - remittance column [I] is shown on bankRemitDate (defaults to dateStr)
 */
function renderCashbookMonth(showStatusMsg = true) {
  const msgEl = document.getElementById("db-msg");

  const monthSel = document.getElementById("cb-month");
  const yearInp = document.getElementById("cb-year");
  const tbody = document.getElementById("cb-tbody");
  const tfoot = document.getElementById("cb-tfoot");

  const mm = parseInt(monthSel?.value || "", 10);     // 1..12
  const yyyy = parseInt(yearInp?.value || "", 10);    // e.g., 2026

  if (!mm || !yyyy || yyyy < 2000 || yyyy > 2100) {
    if (msgEl) {
      msgEl.textContent = "Please select a valid Month and Year.";
      msgEl.classList.remove("ok");
      msgEl.classList.add("err");
    }
    return;
  }

  const monthIndex = mm - 1;
  const daysInMonth = new Date(yyyy, mm, 0).getDate(); // last day of selected month
  const monthLabel = new Date(yyyy, monthIndex, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const monthYearLabelEl = document.getElementById("cb-month-year-label");
  if (monthYearLabelEl) monthYearLabelEl.textContent = monthLabel;

  const monthStart = new Date(yyyy, monthIndex, 1);
  const monthEnd = new Date(yyyy, monthIndex + 1, 1);

  // Index history:
  // - byDate: by collection date (dateStr)
  // - remitByDate: by remittance date (bankRemitDate or dateStr)
  const byDate = new Map();
  const remitByDate = new Map();

  // Compute opening cash-in-hand at month start:
  // Opening = (sum of past Cash[H]) - (sum of past Remitted[I])
  let opening = 0;

  for (const r of historyCache.values()) {
    const cDateObj = parseLocalYMD(r?.dateStr);
    if (cDateObj && cDateObj < monthStart) {
      opening += Number(r.payment?.cash || 0);
    }

    const remitDateStr = (r?.bankRemitDate || r?.dateStr || "");
    const remitDateObj = parseLocalYMD(remitDateStr);
    if (remitDateObj && remitDateObj < monthStart) {
      opening -= Number(r.bankRemit || 0);
    }

    // collection date indexing
    if (r?.dateStr) {
      if (!byDate.has(r.dateStr)) byDate.set(r.dateStr, []);
      byDate.get(r.dateStr).push(r);
    }

    // remittance date indexing
    if (remitDateStr) {
      const prev = Number(remitByDate.get(remitDateStr) || 0);
      remitByDate.set(remitDateStr, prev + Number(r.bankRemit || 0));
    }
  }

  // Monthly totals (B..I)
  let totIncome = 0;
  let totGuide = 0;
  let totRR = 0;
  let totEDC = 0;
  let totEPOS = 0;
  let totUPI = 0;
  let totCash = 0;
  let totRemit = 0;

  let rowsHtml = "";

  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0");
    const mmStr = String(mm).padStart(2, "0");
    const dateStr = `${yyyy}-${mmStr}-${dd}`;

    const list = byDate.get(dateStr) || [];
    const hasCollection = list.length > 0;

    // Aggregate across Indian + Foreigner for that collection date
    const dayIncome = list.reduce((s, x) => s + Number(x.income || 0), 0);
    const dayGuide  = list.reduce((s, x) => s + Number(x.guideFee || 0), 0);
    const dayRR     = list.reduce((s, x) => s + Number(x.rr || 0), 0);
    const dayEDC    = list.reduce((s, x) => s + Number(x.edc || 0), 0);

    const dayEPOS   = list.reduce((s, x) => s + Number(x.payment?.epos || 0), 0);
    const dayUPI    = list.reduce((s, x) => s + Number(x.payment?.upi || 0), 0);
    const dayCash   = list.reduce((s, x) => s + Number(x.payment?.cash || 0), 0);

    // IMPORTANT: Remittance shown on bankRemitDate row
    const dayRemit = Number(remitByDate.get(dateStr) || 0);
    const hasRemit = dayRemit > 0;

    // Totals: income/exp/received totals are by collection date
    totIncome += dayIncome;
    totGuide  += dayGuide;
    totRR     += dayRR;
    totEDC    += dayEDC;
    totEPOS   += dayEPOS;
    totUPI    += dayUPI;
    totCash   += dayCash;

    // Remit totals: by remittance date (row dateStr)
    totRemit  += dayRemit;

    let dayRemarks = list
      .map(x => (x.remarks || "").trim())
      .filter(Boolean)
      .join(" | ");
    if (!dayRemarks) dayRemarks = "-";

    // Action column:
    // Only for collection records (since remittance might belong to earlier dates)
    let actionCell = "";
    if (hasCollection) {
      if (list.length === 1) {
        actionCell = `
          <button type="button"
                  class="cb-edit-btn"
                  data-action="edit-doc"
                  data-id="${escapeHtml(list[0]._id)}">Edit</button>`;
      } else {
        actionCell = `
          <button type="button"
                  class="cb-edit-btn"
                  data-action="edit-date"
                  data-date="${escapeHtml(dateStr)}">Edit</button>`;
      }
    }

    const dateLabel = formatDDMMYYYYSlash(parseLocalYMD(dateStr));

    rowsHtml += `
      <tr>
        <td>${dateLabel}</td>
        <td>${hasCollection ? formatNumber2(dayIncome) : "-"}</td>
        <td>${hasCollection ? formatNumber2(dayGuide) : "-"}</td>
        <td>${hasCollection ? formatNumber2(dayRR) : "-"}</td>
        <td>${hasCollection ? formatNumber2(dayEDC) : "-"}</td>
        <td>${hasCollection ? formatNumber2(dayEPOS) : "-"}</td>
        <td>${hasCollection ? formatNumber2(dayUPI) : "-"}</td>
        <td>${hasCollection ? formatNumber2(dayCash) : "-"}</td>
        <td>${hasRemit ? formatNumber2(dayRemit) : "-"}</td>
        <td>${hasCollection ? escapeHtml(dayRemarks) : "-"}</td>
        <td class="no-print" style="text-align:center;">${actionCell}</td>
      </tr>
    `;
  }

  if (tbody) {
    tbody.innerHTML = rowsHtml || `<tr><td colspan="11" class="muted">No rows.</td></tr>`;
  }

  // TOTAL row (tfoot)
  if (tfoot) {
    tfoot.innerHTML = `
      <tr class="cashbook-total-row">
        <td style="text-align:center;">TOTAL</td>
        <td>${formatNumber2(totIncome)}</td>
        <td>${formatNumber2(totGuide)}</td>
        <td>${formatNumber2(totRR)}</td>
        <td>${formatNumber2(totEDC)}</td>
        <td>${formatNumber2(totEPOS)}</td>
        <td>${formatNumber2(totUPI)}</td>
        <td>${formatNumber2(totCash)}</td>
        <td>${formatNumber2(totRemit)}</td>
        <td style="text-align:left;">-</td>
        <td class="no-print"></td>
      </tr>
    `;
  }

  // ABSTRACT calculations:
  // Closing Balance = (Opening + Cash[H]) - Remitted[I]
  const digital = totEPOS + totUPI;
  const closing = (opening + totCash) - totRemit;

  setText("cb-open",    `₹${formatNumber2(opening)}`);
  setText("cb-income",  `₹${formatNumber2(totIncome)}`);
  setText("cb-digital", `₹${formatNumber2(digital)}`);
  setText("cb-cash",    `₹${formatNumber2(totCash)}`);
  setText("cb-remit",   `₹${formatNumber2(totRemit)}`);
  setText("cb-close",   `₹${formatNumber2(closing)}`);

  // Optional status message
  if (msgEl && showStatusMsg) {
    msgEl.textContent = `Cash Book loaded for ${monthLabel}.`;
    msgEl.classList.remove("err");
    msgEl.classList.add("ok");
  }
}

/* ---------------------------
   SMALL UI HELPERS
---------------------------- */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------------------
   STORAGE HELPERS
---------------------------- */
function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_LS_KEY);
    if (!raw) return { ...DEFAULT_USERS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_USERS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_USERS };
  }
}

function saveUsers() {
  localStorage.setItem(USERS_LS_KEY, JSON.stringify(users));
}

function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_LS_KEY);
    if (!raw) return null;

    const obj = JSON.parse(raw);
    if (!obj?.username) return null;

    // Backward compatibility: old format was { username }
    if (typeof obj.autoLogin === "undefined") obj.autoLogin = true;

    return obj;
  } catch {
    return null;
  }
}

function saveRemembered(username) {
  // password NOT stored
  localStorage.setItem(REMEMBER_LS_KEY, JSON.stringify({ username, autoLogin: true }));
}

function clearRemembered() {
  localStorage.removeItem(REMEMBER_LS_KEY);
}

/* ---------------------------
   AUTH
---------------------------- */
function autoLoginUser(username) {
  currentUser = username;

  document.getElementById("login-error").style.display = "none";
  document.getElementById("reset-section").style.display = "none";

  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";

  document.getElementById("date").valueAsDate = new Date();
  calculateFees();

  goHome();
  startHistoryListener();
}

function login() {
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value.trim();
  const remember = document.getElementById("remember-me").checked;

  if (users[user] && users[user] === pass) {
    currentUser = user;

    if (remember) saveRemembered(user);
    else clearRemembered();

    document.getElementById("login-error").style.display = "none";
    document.getElementById("reset-section").style.display = "none";

    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "block";

    document.getElementById("date").valueAsDate = new Date();
    calculateFees();

    goHome();
    startHistoryListener();
  } else {
    document.getElementById("login-error").style.display = "block";
  }
}

function logout() {
  clearRemembered();
  currentUser = null;

  document.getElementById("app-screen").style.display = "none";
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("password").value = "";

  stopHistoryListener();
  cancelEdit(true);

  goHome();
}

function showResetPassword() {
  const reset = document.getElementById("reset-section");
  reset.style.display = (reset.style.display === "block") ? "none" : "block";
}

function resetPassword() {
  const rUser = document.getElementById("reset-username").value.trim();
  const nPass = document.getElementById("new-password").value.trim();
  const msg = document.getElementById("reset-msg");

  msg.style.display = "block";

  if (!rUser) {
    msg.innerText = "ദയവായി യൂസർനെയിം നൽകുക!";
    msg.style.color = "#d32f2f";
    return;
  }
  if (!nPass || nPass.length < 3) {
    msg.innerText = "പുതിയ പാസ്‌വേഡ് കുറഞ്ഞത് 3 അക്ഷരമെങ്കിലും വേണം!";
    msg.style.color = "#d32f2f";
    return;
  }

  if (users[rUser]) {
    users[rUser] = nPass;
    saveUsers();

    msg.innerText = "പാസ്വേർഡ് വിജയകരമായി മാറ്റി! ഇനി ലോഗിൻ ചെയ്യാം.";
    msg.style.color = "#2E7D32";

    document.getElementById("reset-username").value = "";
    document.getElementById("new-password").value = "";
  } else {
    msg.innerText = "ഈ യൂസർനെയിം നിലവിലില്ല!";
    msg.style.color = "#d32f2f";
  }
}

/* ---------------------------
   DATE + FORMAT HELPERS
---------------------------- */
function parseLocalYMD(ymd) {
  return ymd ? new Date(`${ymd}T00:00:00`) : null;
}

function formatDDMMYYYY(dateObj) {
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatDDMMYYYYSlash(dateObj) {
  if (!dateObj) return "-";
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
}

function displayDateFromDateStr(dateStr) {
  const d = parseLocalYMD(dateStr);
  return d ? formatDDMMYYYY(d) : (dateStr || "-");
}

function nationalityLabel(n) { return n === "foreigner" ? "Foreigner" : "Indian"; }

function formatNumber2(n) {
  const num = Number(n || 0);
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------------------------
   CALCULATIONS (VERIFIED)
---------------------------- */
function calculateFees() {
  const nationality = document.getElementById("nationality").value;

  const count5 = Math.max(0, parseInt(document.getElementById("pkg-5-count").value, 10) || 0);
  const count10 = Math.max(0, parseInt(document.getElementById("pkg-10-count").value, 10) || 0);
  const extraPersons = Math.max(0, parseInt(document.getElementById("extra-persons").value, 10) || 0);
  const totalPackages = count5 + count10;

  const dateVal = document.getElementById("date").value;
  const dateObj = parseLocalYMD(dateVal);
  const isHolidayChecked = document.getElementById("is-holiday").checked;

  let isWeekend = false;
  if (dateObj) {
    const dayOfWeek = dateObj.getDay(); // 0 Sun, 6 Sat
    isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  }

  let guideFee = 0;
  if (totalPackages === 0) guideFee = 0;
  else if ((isWeekend || isHolidayChecked) && dateObj) guideFee = 5850;
  else guideFee = totalPackages * 650;

  let income = 0, rr = 0, edc = 0;

  if (nationality === "indian") {
    income = (count5 * 1000) + (count10 * 2000) + (extraPersons * 200);
    rr = (count5 * 150) + (count10 * 300) + (extraPersons * 30);
    edc = (count5 * 25) + (count10 * 50);
  } else if (nationality === "foreigner") {
    income = (count5 * 2000) + (count10 * 4000) + (extraPersons * 400);
    rr = (count5 * 525) + (count10 * 1050) + (extraPersons * 105);
    edc = (count5 * 25) + (count10 * 50);
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
}

/* ---------------------------
   SAVE / UPDATE (STRICT UPSERT)
---------------------------- */
function clearMessages() {
  const a = document.getElementById("pkg-msg");
  const b = document.getElementById("db-msg");
  if (a) { a.textContent = ""; a.classList.remove("ok", "err"); }
  if (b) { b.textContent = ""; b.classList.remove("ok", "err"); }
}

function setMessage(source, text, kind) {
  const el = (source === "package")
    ? document.getElementById("pkg-msg")
    : document.getElementById("db-msg");

  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("ok", "err");
  if (kind) el.classList.add(kind);
}

function setSavingUI(isSaving, label) {
  const btnTab1 = document.getElementById("btn-save-db-tab1");
  if (btnTab1) {
    btnTab1.disabled = isSaving;
    if (isSaving && label) btnTab1.textContent = label;
  }
  if (!isSaving) updateSaveButtonLabel();
}

async function saveToDatabase(source = "package") {
  clearMessages();

  if (!firestoreDb) {
    setMessage(source, "Firebase not initialized. Check Firebase scripts/config.", "err");
    return;
  }

  try {
    calculateFees();

    const dateVal = document.getElementById("date").value;
    if (!dateVal) {
      setMessage(source, "ദയവായി തീയതി തിരഞ്ഞെടുക്കുക!", "err");
      return;
    }

    const dateObj = parseLocalYMD(dateVal);
    const nationality = document.getElementById("nationality").value;

    const count5 = Math.max(0, parseInt(document.getElementById("pkg-5-count").value, 10) || 0);
    const count10 = Math.max(0, parseInt(document.getElementById("pkg-10-count").value, 10) || 0);
    const extraPersons = Math.max(0, parseInt(document.getElementById("extra-persons").value, 10) || 0);
    const children = Math.max(0, parseInt(document.getElementById("children").value, 10) || 0);
    const totalPackages = count5 + count10;

    if (totalPackages <= 0) {
      setMessage(source, "കുറഞ്ഞത് ഒരു പാക്കേജ് എങ്കിലും നൽകണം (5/10).", "err");
      return;
    }

    const isHolidayChecked = document.getElementById("is-holiday").checked;

    const income = Number(document.getElementById("calc-income").value || 0);
    const guideFee = Number(document.getElementById("calc-guide").value || 0);
    const rr = Number(document.getElementById("calc-rr").value || 0);
    const edc = Number(document.getElementById("calc-edc").value || 0);
    const emf = Number(document.getElementById("calc-emf").value || 0);

    const epos = Math.max(0, parseInt(document.getElementById("pay-epos").value, 10) || 0);
    const upi = Math.max(0, parseInt(document.getElementById("pay-upi").value, 10) || 0);
    const cash = Math.max(0, parseInt(document.getElementById("pay-cash").value, 10) || 0);

    const bankRemit = Math.max(0, parseInt(document.getElementById("bank-remit").value, 10) || 0);

    // NEW: bank remittance date (defaults to collection date if blank)
    const bankRemitDateRaw = (document.getElementById("bank-remit-date")?.value || "").trim();
    const bankRemitDate = bankRemitDateRaw || dateVal;

    const bankRemitDateObj = parseLocalYMD(bankRemitDate);
    if (!bankRemitDateObj || isNaN(bankRemitDateObj.getTime())) {
      setMessage(source, "Invalid Bank Remittance Date.", "err");
      return;
    }

    const remarks = (document.getElementById("remarks").value || "").trim();

    const record = {
      dateStr: dateVal,
      dateTS: firebase.firestore.Timestamp.fromDate(dateObj),

      nationality,
      pkg5Count: count5,
      pkg10Count: count10,
      totalPackages,
      extraPersons,
      children,

      isWeekend: (dateObj.getDay() === 0 || dateObj.getDay() === 6),
      isPublicHoliday: isHolidayChecked,

      income,
      guideFee,
      rr,
      edc,
      emf,

      payment: { epos, upi, cash },

      bankRemit,
      bankRemitDate, // NEW FIELD (string YYYY-MM-DD)
      remarks,

      clientSavedAt: new Date().toISOString(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const targetDocId = `${dateVal}_${nationality}`;
    const targetRef = firestoreDb.collection("daily_collections").doc(targetDocId);
    const previousDocId = currentEditDocId;

    setSavingUI(true, previousDocId ? "Updating..." : "Saving...");

    let existed = false;

    await firestoreDb.runTransaction(async (tx) => {
      const snap = await tx.get(targetRef);
      existed = snap.exists;

      if (!snap.exists) {
        tx.set(targetRef, {
          ...record,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        tx.set(targetRef, record, { merge: true });
      }
    });

    // If docId changed during edit (e.g., nationality or date changed), remove old doc
    if (previousDocId && previousDocId !== targetDocId) {
      await firestoreDb.collection("daily_collections").doc(previousDocId).delete().catch(() => {});
    }

    if (previousDocId) cancelEdit(true);

    const msg = existed
      ? `Updated record for ${dateVal} (${nationalityLabel(nationality)}).`
      : `Saved record for ${dateVal} (${nationalityLabel(nationality)}).`;

    setMessage(source, msg, "ok");

  } catch (err) {
    console.error(err);
    setMessage(source, err?.message || "Save/Update failed.", "err");
  } finally {
    setSavingUI(false);
  }
}

/* ---------------------------
   HISTORY LISTENER + UI + FILTERS
---------------------------- */
function stopHistoryListener() {
  if (typeof historyUnsubscribe === "function") {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }
  historyCache.clear();
}

function startHistoryListener() {
  if (!firestoreDb) return;
  if (historyUnsubscribe) return;

  const statusEl = document.getElementById("history-status");
  statusEl.textContent = "Loading records...";

  historyUnsubscribe = firestoreDb.collection("daily_collections")
    .orderBy("dateTS", "desc")
    .onSnapshot((snap) => {
      historyCache.clear();
      snap.forEach(doc => {
        const data = doc.data() || {};
        historyCache.set(doc.id, { ...data, _id: doc.id });
      });

      statusEl.textContent = `Loaded: ${snap.size} record(s).`;
      renderHistoryTable();

      // If cashbook is currently open, refresh it too
      const activeId = document.querySelector(".tab-content.active")?.id;
      if (activeId === "content-cashbook") renderCashbookMonth(false);

    }, (err) => {
      console.error(err);
      statusEl.textContent = `Error loading records: ${err.message}`;
      document.getElementById("history-tbody").innerHTML =
        `<tr><td colspan="4" class="muted">Error: ${escapeHtml(err.message)}</td></tr>`;
    });
}

function refreshHistory() {
  renderHistoryTable();
}

function getHistoryFilters() {
  const searchDate = document.getElementById("history-search-date").value;
  const nat = document.getElementById("history-filter-nat").value;
  return { searchDate, nat };
}

function getFilteredHistoryList() {
  const { searchDate, nat } = getHistoryFilters();
  const list = Array.from(historyCache.values());

  return list.filter(r => {
    const matchesDate = searchDate ? (r.dateStr === searchDate) : true;
    const matchesNat = (nat === "all") ? true : (r.nationality === nat);
    return matchesDate && matchesNat;
  });
}

function renderHistoryTable() {
  const tbody = document.getElementById("history-tbody");
  const list = getFilteredHistoryList();

  if (!historyCache.size) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No records found.</td></tr>`;
    return;
  }

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No records match the current search/filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(r => {
    const id = r._id;
    const dateLabel = r.dateStr ? displayDateFromDateStr(r.dateStr) : "-";
    const natLabel = nationalityLabel(r.nationality);
    const income = Number(r.income || 0).toLocaleString("en-IN");

    return `
      <tr>
        <td>${escapeHtml(dateLabel)}</td>
        <td>${escapeHtml(natLabel)}</td>
        <td>₹${escapeHtml(income)}</td>
        <td>
          <div class="history-actions-cell">
            <button type="button" class="btn-small btn-edit" data-action="edit" data-id="${escapeHtml(id)}">Edit</button>
            <button type="button" class="btn-small btn-delete" data-action="delete" data-id="${escapeHtml(id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/* ---------------------------
   EDIT / DELETE HANDLERS
---------------------------- */
async function startEditFromHistory(docId) {
  const r = historyCache.get(docId);
  if (!r) {
    alert("Record not found. Try Refresh.");
    return;
  }

  loadRecordToForm(r);

  currentEditDocId = docId;
  showEditBanner(r.dateStr || "-");
  updateSaveButtonLabel();

  switchTab("package");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function loadRecordToForm(r) {
  document.getElementById("date").value = r.dateStr || "";
  document.getElementById("nationality").value = r.nationality || "indian";

  document.getElementById("pkg-5-count").value = r.pkg5Count ?? 0;
  document.getElementById("pkg-10-count").value = r.pkg10Count ?? 0;
  document.getElementById("extra-persons").value = r.extraPersons ?? 0;
  document.getElementById("children").value = r.children ?? 0;

  document.getElementById("is-holiday").checked = !!r.isPublicHoliday;

  document.getElementById("pay-epos").value = r.payment?.epos ?? 0;
  document.getElementById("pay-upi").value = r.payment?.upi ?? 0;
  document.getElementById("pay-cash").value = r.payment?.cash ?? 0;

  document.getElementById("bank-remit").value = r.bankRemit ?? 0;

  // NEW: bank remittance date (default to collection date for older records)
  const remitDateEl = document.getElementById("bank-remit-date");
  if (remitDateEl) remitDateEl.value = (r.bankRemitDate || r.dateStr || "");

  document.getElementById("remarks").value = r.remarks ?? "";

  calculateFees();
}

async function deleteRecordFromHistory(docId) {
  if (!firestoreDb) {
    alert("Firebase not initialized.");
    return;
  }

  const r = historyCache.get(docId);
  const dateLabel = r?.dateStr ? displayDateFromDateStr(r.dateStr) : "this record";
  const natLabel = r?.nationality ? nationalityLabel(r.nationality) : "";

  const ok = confirm(`Delete record for ${dateLabel} (${natLabel})? This cannot be undone.`);
  if (!ok) return;

  try {
    await firestoreDb.collection("daily_collections").doc(docId).delete();
    if (currentEditDocId === docId) cancelEdit(true);
  } catch (err) {
    console.error(err);
    alert("Delete failed: " + (err?.message || "Unknown error"));
  }
}

/* ---------------------------
   EDIT MODE UI HELPERS
---------------------------- */
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
  if (!silent) alert("Edit cancelled.");
}

/* ---------------------------
   MONTHLY ABSTRACT (FY Apr->Mar)
---------------------------- */
function generateAbstract() {
  const fy = document.getElementById("fy-select").value;

  document.getElementById("abstract-title").innerText =
    `Pepara Wildlife Sanctuary (Vazhvanthol Waterfalls Visit) ${fy}`;

  const startYear = parseInt((fy || "").split("-")[0], 10);
  if (!startYear || isNaN(startYear)) {
    document.getElementById("abstract-tbody").innerHTML = "";
    document.getElementById("abstract-tfoot").innerHTML = "";
    return;
  }

  const fyStart = new Date(startYear, 3, 1);
  const fyEnd = new Date(startYear + 1, 3, 1);

  const months = [
    { name: "Apr", year: startYear.toString().slice(-2) },
    { name: "May", year: startYear.toString().slice(-2) },
    { name: "Jun", year: startYear.toString().slice(-2) },
    { name: "Jul", year: startYear.toString().slice(-2) },
    { name: "Aug", year: startYear.toString().slice(-2) },
    { name: "Sep", year: startYear.toString().slice(-2) },
    { name: "Oct", year: startYear.toString().slice(-2) },
    { name: "Nov", year: startYear.toString().slice(-2) },
    { name: "Dec", year: startYear.toString().slice(-2) },
    { name: "Jan", year: (startYear + 1).toString().slice(-2) },
    { name: "Feb", year: (startYear + 1).toString().slice(-2) },
    { name: "Mar", year: (startYear + 1).toString().slice(-2) }
  ];

  const buckets = months.map(() => ({
    rev: 0,
    sf: 0,
    iA: 0, iC: 0,
    fA: 0, fC: 0
  }));

  const list = Array.from(historyCache.values());
  for (const r of list) {
    const dateObj = parseLocalYMD(r.dateStr);
    if (!dateObj) continue;
    if (dateObj < fyStart || dateObj >= fyEnd) continue;

    const m = dateObj.getMonth();
    const idx = (m >= 3) ? (m - 3) : (m + 9);

    const b = buckets[idx];
    if (!b) continue;

    b.rev += Number(r.income || 0);
    b.sf += Number(r.rr || 0);

    const pkg5Count = Number(r.pkg5Count || 0);
    const pkg10Count = Number(r.pkg10Count || 0);
    const extraPersons = Number(r.extraPersons || 0);
    const children = Number(r.children || 0);
    const adults = (pkg5Count * 5) + (pkg10Count * 10) + extraPersons;

    if (r.nationality === "indian") {
      b.iA += adults;
      b.iC += children;
    } else if (r.nationality === "foreigner") {
      b.fA += adults;
      b.fC += children;
    }
  }

  let tbodyHtml = "";
  let totRev = 0, totSf = 0, totIa = 0, totIc = 0, totFa = 0, totFc = 0, totAll = 0;

  months.forEach((m, i) => {
    const monthLabel = `${m.name}-${m.year}`;
    const data = buckets[i];

    const totalVisitors = (data.iA + data.iC + data.fA + data.fC);

    totRev += data.rev; totSf += data.sf;
    totIa += data.iA; totIc += data.iC;
    totFa += data.fA; totFc += data.fC;
    totAll += totalVisitors;

    tbodyHtml += `
      <tr>
        <td>${monthLabel}</td>
        <td>${data.rev ? data.rev.toFixed(2) : ""}</td>
        <td>${data.sf ? data.sf.toFixed(2) : ""}</td>
        <td>${data.iA || ""}</td>
        <td>${data.iC || ""}</td>
        <td>${data.fA || ""}</td>
        <td>${data.fC || ""}</td>
        <td style="font-weight:bold;">${totalVisitors || "0"}</td>
      </tr>
    `;
  });

  document.getElementById("abstract-tbody").innerHTML = tbodyHtml;

  document.getElementById("abstract-tfoot").innerHTML = `
    <tr>
      <th>Total</th>
      <th>${totRev ? totRev.toFixed(2) : ""}</th>
      <th>${totSf ? totSf.toFixed(2) : ""}</th>
      <th>${totIa || ""}</th>
      <th>${totIc || ""}</th>
      <th>${totFa || ""}</th>
      <th>${totFc || ""}</th>
      <th>${totAll || "0"}</th>
    </tr>
  `;
}

/* ==========================================
   HOME DASHBOARD NAVIGATION LOGIC
========================================== */
function openMenu(sectionId) {
  const dashboard = document.getElementById("home-dashboard");
  const backBar = document.getElementById("back-bar");

  if (dashboard) dashboard.style.display = "none";
  if (backBar) backBar.style.display = "block";

  // Hide all sections and clear active state
  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.remove("active");
    content.style.display = "none";
  });

  // Show selected section + mark active
  const target = document.getElementById(sectionId);
  if (target) {
    target.style.display = "block";
    target.classList.add("active");
  }

  // Trigger section-specific refresh
  if (sectionId === "content-cashbook") {
    renderCashbookMonth(false);
  }
  if (sectionId === "content-abstract") generateAbstract();
  if (sectionId === "content-history") renderHistoryTable();

  window.scrollTo(0, 0);
}

function goHome() {
  const dashboard = document.getElementById("home-dashboard");
  const backBar = document.getElementById("back-bar");

  if (dashboard) dashboard.style.display = "block";
  if (backBar) backBar.style.display = "none";

  // Hide all sections and clear active state
  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.remove("active");
    content.style.display = "none";
  });

  window.scrollTo(0, 0);
}

// Keep old "Next" buttons working
function switchTab(tabName) {
  openMenu("content-" + tabName);
}

/* ---------------------------
   Cashbook helper: jump to History filtered by date
---------------------------- */
function openHistoryForDate(dateStr) {
  const dateInput = document.getElementById("history-search-date");
  const natSelect = document.getElementById("history-filter-nat");

  if (dateInput) dateInput.value = dateStr;
  if (natSelect) natSelect.value = "all";

  openMenu("content-history");
  renderHistoryTable();
}