/**************************************************************
 * utils.js
 * Small reusable helpers (DOM, formatting, parsing)
 **************************************************************/

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setValIfExists(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = (val ?? "");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseLocalYMD(ymd) {
  return ymd ? new Date(`${ymd}T00:00:00`) : null;
}

function toYMD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

// Inputs: blank => 0
function getIntFromInput(id) {
  const el = document.getElementById(id);
  const raw = (el?.value ?? "").toString().trim();
  return Math.max(0, parseInt(raw, 10) || 0);
}

function isBlankOrZero(id) {
  const el = document.getElementById(id);
  const raw = (el?.value ?? "").toString().trim();
  if (raw === "") return true;
  return (parseInt(raw, 10) || 0) === 0;
}

function setNumberInputBlankIfZero(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  const num = Number(n || 0);
  el.value = (num > 0) ? String(num) : "";
}