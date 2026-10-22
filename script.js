/**************************************************************
 * Vazhvanthol Eco Tourism Cash Book
 * Update:
 * 1) Strict upsert docId = `${dateVal}_${nationality}`
 * 2) Save button added on Package Entry + Cashbook
 * 3) Home Dashboard navigation (openMenu/goHome) FIXED
 * 4) AUTO-LOGIN (Remember Me):
 *    - If user logs in with Remember Me checked, next visit bypasses login screen
 *    - Auto-login stays active until user clicks Logout
 *    - Password is NOT stored in localStorage
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
let currentUser = null; // track logged-in user for Change Password + auto-login session

/* ---------------------------
   EDIT MODE STATE
---------------------------- */
let currentEditDocId = null; // Firestore doc id
let historyUnsubscribe = null;
let historyCache = new Map(); // docId -> data (with _id)

/* ---------------------------
   INIT
---------------------------- */
window.onload = function () {
  initFirebase();

  // Pre-fill username + remember checkbox
  const remembered = loadRemembered();
  if (remembered?.username) {
    const uEl = document.getElementById("username");
    const rEl = document.getElementById("remember-me");
    if (uEl) uEl.value = remembered.username;
    if (rEl) rEl.checked = true;
  }

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    login();
  });

  ["username", "password"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      document.getElementById("login-error").style.display = "none";
    });
  });

  // History actions (event delegation)
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

  // Keep print preview up-to-date (this REQUIRES correct .active class)
  window.addEventListener("beforeprint", () => {
    const active = document.querySelector(".tab-content.active")?.id;
    if (active === "content-cashbook") preparePrintData();
    if (active === "content-abstract") generateAbstract();
  });

  // Keep dashboard state clean (app-screen is hidden anyway until login)
  goHome();

  // AUTO-LOGIN: bypass login screen if remembered session exists
  if (remembered?.username) {
    const shouldAutoLogin = (remembered.autoLogin !== false); // backwards compatible default true
    const userStillExists = !!users[remembered.username];

    if (shouldAutoLogin && userStillExists) {
      autoLoginUser(remembered.username);
    } else if (shouldAutoLogin && !userStillExists) {
      // remembered user no longer exists in local users store
      clearRemembered();
    }
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
   SMALL UI HELPERS
---------------------------- */
function getMsgEl(source) {
  if (source === "package") return document.getElementById("pkg-msg");
  return document.getElementById("db-msg");
}

function clearMessages() {
  const a = document.getElementById("pkg-msg");
  const b = document.getElementById("db-msg");
  if (a) { a.textContent = ""; a.classList.remove("ok", "err"); }
  if (b) { b.textContent = ""; b.classList.remove("ok", "err"); }
}

function setMessage(source, text, kind) {
  const el = getMsgEl(source);
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("ok", "err");
  if (kind) el.classList.add(kind);
}

function setSavingUI(isSaving, label) {
  const btnTab1 = document.getElementById("btn-save-db-tab1");
  const btnTab3 = document.getElementById("btn-save-db");

  [btnTab1, btnTab3].forEach(btn => {
    if (!btn) return;
    btn.disabled = isSaving;
    if (isSaving && label) btn.textContent = label;
  });

  if (!isSaving) updateSaveButtonLabel();
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
  // auto-login session (password NOT stored)
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

    // Show dashboard first (new UI)
    goHome();

    startHistoryListener();
  } else {
    document.getElementById("login-error").style.display = "block";
  }
}

function logout() {
  // IMPORTANT: stops auto-login until user logs in again with Remember Me
  clearRemembered();

  currentUser = null;

  document.getElementById("app-screen").style.display = "none";
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("password").value = "";

  stopHistoryListener();
  cancelEdit(true);

  // reset dashboard state
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

/* Change password while logged-in (from dashboard button) */
function changePassword() {
  if (!currentUser) {
    alert("Not logged in.");
    return;
  }

  const newPass = prompt(`Change Password for "${currentUser}"\nEnter new password (min 3 chars):`, "");
  if (newPass === null) return; // cancelled
  const p = (newPass || "").trim();
  if (p.length < 3) {
    alert("Password must be at least 3 characters.");
    return;
  }

  users[currentUser] = p;
  saveUsers();
  alert("Password updated successfully.");
}

/* ---------------------------
   DATE HELPERS
---------------------------- */
function parseLocalYMD(ymd) { return ymd ? new Date(`${ymd}T00:00:00`) : null; }

function formatDDMMYYYY(dateObj) {
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
}

function displayDateFromDateStr(dateStr) {
  const d = parseLocalYMD(dateStr);
  return d ? formatDDMMYYYY(d) : (dateStr || "-");
}

function nationalityLabel(n) { return n === "foreigner" ? "Foreigner" : "Indian"; }

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
   TAB 3: PRINT PREVIEW
---------------------------- */
function preparePrintData() {
  calculateFees();

  const dateVal = document.getElementById("date").value;
  const dateObj = parseLocalYMD(dateVal);

  let monthYear = "";
  let formattedDate = "";

  if (dateObj) {
    monthYear = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    formattedDate = formatDDMMYYYY(dateObj);
  }

  const income = Number(document.getElementById("calc-income").value || 0).toFixed(2);
  const guide = Number(document.getElementById("calc-guide").value || 0).toFixed(2);
  const rr = Number(document.getElementById("calc-rr").value || 0).toFixed(2);
  const edc = Number(document.getElementById("calc-edc").value || 0).toFixed(2);

  const epos = Number(document.getElementById("pay-epos").value || 0).toFixed(2);
  const upi = Number(document.getElementById("pay-upi").value || 0).toFixed(2);
  const cash = Number(document.getElementById("pay-cash").value || 0).toFixed(2);
  const remitted = Number(document.getElementById("bank-remit").value || 0).toFixed(2);

  const children = Math.max(0, parseInt(document.getElementById("children").value, 10) || 0);
  let remarks = (document.getElementById("remarks").value || "").trim();
  if (children > 0) remarks = remarks ? `${remarks} | Children: ${children}` : `Children: ${children}`;

  const eposUpiTotal = (Number(epos) + Number(upi)).toFixed(2);
  const closingBalance = (Number(cash) - Number(remitted)).toFixed(2);

  document.getElementById("print-section").innerHTML = `
    <div class="report-header">
      <h3>PEPPARA WILDLIFE SANCTUARY</h3>
      <h4>CHATHANCODE ECO-DEVELOPMENT COMMITTEE</h4>
      <h4>VAZHVANTHOL WATERFALLS VISIT</h4>
      <h4 class="title-underline">Daily Report</h4>
      <p style="text-align:left; font-weight:bold; margin-top:15px;">Month & Year: ${monthYear}</p>
    </div>

    <table class="report-table">
      <thead>
        <tr>
          <th rowspan="2">Date</th>
          <th rowspan="2">Income</th>
          <th colspan="3">Expenditure</th>
          <th colspan="3">Amount received</th>
          <th rowspan="2">Amount<br>remitted</th>
          <th rowspan="2">Remarks</th>
        </tr>
        <tr>
          <th>Guide fees</th>
          <th>Sanctuary</th>
          <th>EDC</th>
          <th>EPOS</th>
          <th>UPI</th>
          <th>Cash</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${formattedDate}</td>
          <td>${income}</td>
          <td>${guide}</td>
          <td>${rr}</td>
          <td>${edc}</td>
          <td>${epos}</td>
          <td>${upi}</td>
          <td>${cash}</td>
          <td>${remitted}</td>
          <td style="text-align:center;">${remarks}</td>
        </tr>
      </tbody>
    </table>

    <table class="abstract-table">
      <tr><th colspan="2">ABSTRACT</th></tr>
      <tr><td>Opening Balance</td><td>0.00</td></tr>
      <tr><td>Income on this month (B)</td><td>${income}</td></tr>
      <tr><td>Amount received via EPOS & UPI (F+G)</td><td>${eposUpiTotal}</td></tr>
      <tr><td>Amount received in Cash (H)</td><td>${cash}</td></tr>
      <tr><td>Amount remitted to bank (I)</td><td>${remitted}</td></tr>
      <tr><td>Closing Balance</td><td>${closingBalance}</td></tr>
    </table>
  `;
}

/* ---------------------------
   SAVE / UPDATE (STRICT UPSERT)
---------------------------- */
async function saveToDatabase(source = "cashbook") {
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
    }, (err) => {
      console.error(err);
      statusEl.textContent = `Error loading records: ${err.message}`;
      document.getElementById("history-tbody").innerHTML =
        `<tr><td colspan="4" class="muted">Error: ${err.message}</td></tr>`;
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
        <td>${dateLabel}</td>
        <td>${natLabel}</td>
        <td>₹${income}</td>
        <td>
          <div class="history-actions-cell">
            <button type="button" class="btn-small btn-edit" data-action="edit" data-id="${id}">Edit</button>
            <button type="button" class="btn-small btn-delete" data-action="delete" data-id="${id}">Delete</button>
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
  document.getElementById("remarks").value = r.remarks ?? "";

  calculateFees();
  preparePrintData();
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
  const btnTab3 = document.getElementById("btn-save-db");
  if (btnTab1) btnTab1.textContent = label;
  if (btnTab3) btnTab3.textContent = label;
}

function cancelEdit(silent = false) {
  currentEditDocId = null;
  hideEditBanner();
  updateSaveButtonLabel();
  if (!silent) alert("Edit cancelled.");
}

/* ---------------------------
   MONTHLY ABSTRACT
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
   HOME DASHBOARD NAVIGATION LOGIC (FIXED)
   - Updates .active (required for print CSS)
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

  // Show selected section + mark active (CRITICAL for print)
  const target = document.getElementById(sectionId);
  if (target) {
    target.style.display = "block";
    target.classList.add("active");
  }

  // Trigger section-specific refresh
  if (sectionId === "content-cashbook") preparePrintData();
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