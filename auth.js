/**************************************************************
 * auth.js
 * Login/logout + localStorage "Remember me" + reset password
 **************************************************************/

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

    if (typeof obj.autoLogin === "undefined") obj.autoLogin = true;
    return obj;
  } catch {
    return null;
  }
}

function saveRemembered(username) {
  localStorage.setItem(REMEMBER_LS_KEY, JSON.stringify({ username, autoLogin: true }));
}

function clearRemembered() {
  localStorage.removeItem(REMEMBER_LS_KEY);
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

function autoLoginUser(username) {
  currentUser = username;

  document.getElementById("login-error").style.display = "none";
  document.getElementById("reset-section").style.display = "none";

  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";

  const today = toYMD(new Date());
  document.getElementById("date").value = today;
  lastSelectedDateForEntry = today;

  resetEntryFormForNewDate({ keepDate: true });
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

    const today = toYMD(new Date());
    document.getElementById("date").value = today;
    lastSelectedDateForEntry = today;

    resetEntryFormForNewDate({ keepDate: true });
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

/* initialize users table */
users = loadUsers();