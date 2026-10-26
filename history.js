/**************************************************************
 * history.js
 * Firestore listener + History UI + edit/delete
 **************************************************************/

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
  if (statusEl) statusEl.textContent = "Loading records...";

  historyUnsubscribe = firestoreDb.collection("daily_collections")
    .orderBy("dateTS", "desc")
    .onSnapshot((snap) => {
      historyCache.clear();
      snap.forEach(doc => {
        const data = doc.data() || {};
        historyCache.set(doc.id, { ...data, _id: doc.id });
      });

      if (statusEl) statusEl.textContent = `Loaded: ${snap.size} record(s).`;
      renderHistoryTable();

      const activeId = document.querySelector(".tab-content.active")?.id;
      if (activeId === "content-cashbook") renderCashbookMonth(false);

    }, (err) => {
      console.error(err);
      if (statusEl) statusEl.textContent = `Error loading records: ${err.message}`;
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
  paymentAutofillEnabled = false;

  document.getElementById("date").value = r.dateStr || "";
  lastSelectedDateForEntry = r.dateStr || "";

  document.getElementById("nationality").value = r.nationality || "indian";

  setNumberInputBlankIfZero("pkg-5-count", r.pkg5Count ?? 0);
  setNumberInputBlankIfZero("pkg-10-count", r.pkg10Count ?? 0);
  setNumberInputBlankIfZero("extra-persons", r.extraPersons ?? 0);
  setNumberInputBlankIfZero("children", r.children ?? 0);

  document.getElementById("is-holiday").checked = !!r.isPublicHoliday;

  const isCustom = !!r.isCustomGuides;
  const chk = document.getElementById("is-custom-guides");
  if (chk) chk.checked = isCustom;

  setNumberInputBlankIfZero("custom-guides-count", r.customGuidesCount ?? 0);
  toggleCustomGuidesUI(isCustom);

  setNumberInputBlankIfZero("pay-epos", r.payment?.epos ?? 0);
  setNumberInputBlankIfZero("pay-upi", r.payment?.upi ?? 0);
  setNumberInputBlankIfZero("pay-cash", r.payment?.cash ?? 0);

  setNumberInputBlankIfZero("bank-remit", r.bankRemit ?? 0);

  const remitDateEl = document.getElementById("bank-remit-date");
  if (remitDateEl) remitDateEl.value = (r.bankRemitDate || r.dateStr || "");

  const recDate = (r.dateStr || "").trim();
  const recRemitDate = (r.bankRemitDate || r.dateStr || "").trim();
  bankRemitDateManualOverride = !!(recDate && recRemitDate && recRemitDate !== recDate);

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