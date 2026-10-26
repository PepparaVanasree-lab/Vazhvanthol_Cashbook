/**************************************************************
 * cashbook.js
 * Monthly Cash Book rendering + controls
 **************************************************************/

function initCashbookControls() {
  const monthSel = document.getElementById("cb-month");
  const yearInp = document.getElementById("cb-year");
  const loadBtn = document.getElementById("cb-load-btn");
  const printBtn = document.getElementById("cb-print-btn");
  const tbody = document.getElementById("cb-tbody");

  if (!monthSel || !yearInp || !loadBtn || !printBtn || !tbody) return;

  monthSel.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `<option value="${m}">${m}</option>`;
  }).join("");

  const now = new Date();
  monthSel.value = String(now.getMonth() + 1).padStart(2, "0");
  yearInp.value = String(now.getFullYear());

  loadBtn.addEventListener("click", () => renderCashbookMonth(true));
  printBtn.addEventListener("click", () => window.print());

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

function renderCashbookMonth(showStatusMsg = true) {
  const msgEl = document.getElementById("db-msg");

  const monthSel = document.getElementById("cb-month");
  const yearInp = document.getElementById("cb-year");
  const tbody = document.getElementById("cb-tbody");
  const tfoot = document.getElementById("cb-tfoot");

  const mm = parseInt(monthSel?.value || "", 10);
  const yyyy = parseInt(yearInp?.value || "", 10);

  if (!mm || !yyyy || yyyy < 2000 || yyyy > 2100) {
    if (msgEl) {
      msgEl.textContent = "Please select a valid Month and Year.";
      msgEl.classList.remove("ok");
      msgEl.classList.add("err");
    }
    return;
  }

  const monthIndex = mm - 1;
  const daysInMonth = new Date(yyyy, mm, 0).getDate();
  const monthLabel = new Date(yyyy, monthIndex, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const monthYearLabelEl = document.getElementById("cb-month-year-label");
  if (monthYearLabelEl) monthYearLabelEl.textContent = monthLabel;

  const monthStart = new Date(yyyy, monthIndex, 1);

  const byDate = new Map();
  const remitByDate = new Map();

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

    if (r?.dateStr) {
      if (!byDate.has(r.dateStr)) byDate.set(r.dateStr, []);
      byDate.get(r.dateStr).push(r);
    }

    if (remitDateStr) {
      const prev = Number(remitByDate.get(remitDateStr) || 0);
      remitByDate.set(remitDateStr, prev + Number(r.bankRemit || 0));
    }
  }

  let totIncome = 0, totGuide = 0, totRR = 0, totEDC = 0;
  let totEPOS = 0, totUPI = 0, totCash = 0, totRemit = 0;

  let rowsHtml = "";

  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0");
    const mmStr = String(mm).padStart(2, "0");
    const dateStr = `${yyyy}-${mmStr}-${dd}`;

    const list = byDate.get(dateStr) || [];
    const hasCollection = list.length > 0;

    const dayIncome = list.reduce((s, x) => s + Number(x.income || 0), 0);
    const dayGuide  = list.reduce((s, x) => s + Number(x.guideFee || 0), 0);
    const dayRR     = list.reduce((s, x) => s + Number(x.rr || 0), 0);
    const dayEDC    = list.reduce((s, x) => s + Number(x.edc || 0), 0);

    const dayEPOS   = list.reduce((s, x) => s + Number(x.payment?.epos || 0), 0);
    const dayUPI    = list.reduce((s, x) => s + Number(x.payment?.upi || 0), 0);
    const dayCash   = list.reduce((s, x) => s + Number(x.payment?.cash || 0), 0);

    const dayRemit = Number(remitByDate.get(dateStr) || 0);
    const hasRemit = dayRemit > 0;

    totIncome += dayIncome; totGuide += dayGuide; totRR += dayRR; totEDC += dayEDC;
    totEPOS += dayEPOS; totUPI += dayUPI; totCash += dayCash; totRemit += dayRemit;

    let dayRemarks = list.map(x => (x.remarks || "").trim()).filter(Boolean).join(" | ");
    if (!dayRemarks) dayRemarks = "-";

    let actionCell = "";
    if (hasCollection) {
      if (list.length === 1) {
        actionCell = `<button type="button" class="cb-edit-btn" data-action="edit-doc" data-id="${escapeHtml(list[0]._id)}">Edit</button>`;
      } else {
        actionCell = `<button type="button" class="cb-edit-btn" data-action="edit-date" data-date="${escapeHtml(dateStr)}">Edit</button>`;
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

  tbody.innerHTML = rowsHtml;

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

  const digital = totEPOS + totUPI;
  const closing = (opening + totCash) - totRemit;

  setText("cb-open",    `₹${formatNumber2(opening)}`);
  setText("cb-income",  `₹${formatNumber2(totIncome)}`);
  setText("cb-digital", `₹${formatNumber2(digital)}`);
  setText("cb-cash",    `₹${formatNumber2(totCash)}`);
  setText("cb-remit",   `₹${formatNumber2(totRemit)}`);
  setText("cb-close",   `₹${formatNumber2(closing)}`);

  if (msgEl && showStatusMsg) {
    msgEl.textContent = `Cash Book loaded for ${monthLabel}.`;
    msgEl.classList.remove("err");
    msgEl.classList.add("ok");
  }
}