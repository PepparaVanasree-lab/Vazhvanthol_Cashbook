/**************************************************************
 * save.js
 * Saving + autosave-next buttons + mismatch warning
 **************************************************************/

async function nextFromPackage() {
  const res = await saveToDatabase("package", { toastOnSuccess: true, toastOnError: false });
  if (res.ok) switchTab("payment");
}

async function nextFromPayment() {
  const res = await saveToDatabase("payment", { toastOnSuccess: true, toastOnError: false });
  if (res.ok) switchTab("cashbook");
}

function clearMessages() {
  const a = document.getElementById("pkg-msg");
  const b = document.getElementById("db-msg");
  const c = document.getElementById("pay-msg");
  if (a) { a.textContent = ""; a.classList.remove("ok", "err"); }
  if (b) { b.textContent = ""; b.classList.remove("ok", "err"); }
  if (c) { c.textContent = ""; c.classList.remove("ok", "err"); }
}

function setMessage(source, text, kind) {
  const id =
    (source === "package") ? "pkg-msg" :
    (source === "payment") ? "pay-msg" :
    "db-msg";

  const el = document.getElementById(id);
  if (!el) return;

  el.textContent = text || "";
  el.classList.remove("ok", "err");
  if (kind) el.classList.add(kind);
}

function setNavSaving(isSaving) {
  const ids = ["btn-next-to-payment", "btn-next-to-cashbook"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!isSaving;
  });
}

function setSavingUI(isSaving, label) {
  setNavSaving(isSaving);

  const btnTab1 = document.getElementById("btn-save-db-tab1");
  if (btnTab1) {
    btnTab1.disabled = isSaving;
    if (isSaving && label) btnTab1.textContent = label;
  }
  if (!isSaving) updateSaveButtonLabel();
}

async function saveToDatabase(source = "package", opts = {}) {
  clearMessages();

  if (!firestoreDb) {
    const m = "Firebase not initialized. Check Firebase scripts/config.";
    setMessage(source, m, "err");
    if (opts.toastOnError) showToast(m, "err");
    return { ok: false, msg: m };
  }

  try {
    calculateFees();

    const dateVal = (document.getElementById("date").value || "").trim();
    if (!dateVal) {
      const m = "ദയവായി തീയതി തിരഞ്ഞെടുക്കുക!";
      setMessage(source, m, "err");
      if (opts.toastOnError) showToast(m, "err");
      return { ok: false, msg: m };
    }

    const dateObj = parseLocalYMD(dateVal);
    const nationality = document.getElementById("nationality").value;

    const count5 = getIntFromInput("pkg-5-count");
    const count10 = getIntFromInput("pkg-10-count");
    const extraPersons = getIntFromInput("extra-persons");
    const children = getIntFromInput("children");
    const totalPackages = count5 + count10;

    if (totalPackages <= 0) {
      const m = "കുറഞ്ഞത് ഒരു പാക്കേജ് എങ്കിലും നൽകണം (5/10).";
      setMessage(source, m, "err");
      if (opts.toastOnError) showToast(m, "err");
      return { ok: false, msg: m };
    }

    const isHolidayChecked = document.getElementById("is-holiday").checked;

    const isCustomGuides = !!document.getElementById("is-custom-guides")?.checked;
    const customGuidesCount = isCustomGuides ? getIntFromInput("custom-guides-count") : 0;

    // keep auto-date behavior consistent
    maybeAutoSetBankRemitDate();

    const income = Number(document.getElementById("calc-income").value || 0);
    const guideFee = Number(document.getElementById("calc-guide").value || 0);
    const rr = Number(document.getElementById("calc-rr").value || 0);
    const edc = Number(document.getElementById("calc-edc").value || 0);
    const emf = Number(document.getElementById("calc-emf").value || 0);

    const epos = getIntFromInput("pay-epos");
    const upi = getIntFromInput("pay-upi");
    const cash = getIntFromInput("pay-cash");

    const bankRemit = getIntFromInput("bank-remit");

    const bankRemitDateRaw = (document.getElementById("bank-remit-date")?.value || "").trim();
    const bankRemitDate = bankRemitDateRaw || dateVal;

    const bankRemitDateObj = parseLocalYMD(bankRemitDate);
    if (!bankRemitDateObj || isNaN(bankRemitDateObj.getTime())) {
      const m = "Invalid Bank Remittance Date.";
      setMessage(source, m, "err");
      if (opts.toastOnError) showToast(m, "err");
      return { ok: false, msg: m };
    }

    const remarks = (document.getElementById("remarks").value || "").trim();

    // Mismatch warning (non-blocking)
    const payTotal = epos + upi + cash;
    const isMismatch = (payTotal !== income);

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

      isCustomGuides,
      customGuidesCount,

      income,
      guideFee,
      rr,
      edc,
      emf,

      payment: { epos, upi, cash },
      bankRemit,
      bankRemitDate,
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

    if (isMismatch) {
      const warnMs = 2600;
      const warnMsg = `Warning: EPOS+UPI+Cash (₹${payTotal}) ≠ Income (₹${income}). Please verify.`;
      showToast(warnMsg, "err", warnMs);

      if (opts.toastOnSuccess) {
        setTimeout(() => showToast(msg, "ok", 2200), warnMs + 50);
      }
    } else {
      if (opts.toastOnSuccess) showToast(msg, "ok");
    }

    return { ok: true, msg, existed, docId: targetDocId };

  } catch (err) {
    console.error(err);
    const m = err?.message || "Save/Update failed.";
    setMessage(source, m, "err");
    if (opts.toastOnError) showToast(m, "err");
    return { ok: false, msg: m };
  } finally {
    setSavingUI(false);
  }
}