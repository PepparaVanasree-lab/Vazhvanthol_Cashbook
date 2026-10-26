/**************************************************************
 * toast.js
 * Non-blocking toast notification
 **************************************************************/

function showToast(text, kind = "ok", ms = 2200) {
  const el = document.getElementById("toast");
  if (!el) return;

  el.textContent = text || "";
  el.classList.remove("err");
  if (kind === "err") el.classList.add("err");

  el.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, ms);
}