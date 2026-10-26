/**************************************************************
 * app-state.js
 * Global constants + shared app state (single source of truth)
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
   GITHUB (Last update)
---------------------------- */
// TODO: Set your GitHub repo here:
const GITHUB_REPO = {
  owner: "username",
  repo: "repository-name"
};

/* ---------------------------
   USERS (Dummy login)
---------------------------- */
const USERS_LS_KEY = "vazhvanthol_users_v1";
const REMEMBER_LS_KEY = "vazhvanthol_remember_v1";

const DEFAULT_USERS = {
  admin: "admin123",
  secretary: "sec123"
};

let users = null;
let currentUser = null;

/* ---------------------------
   EDIT MODE STATE
---------------------------- */
let currentEditDocId = null;
let historyUnsubscribe = null;
let historyCache = new Map(); // docId -> data (with _id)

/* ---------------------------
   ENTRY UX STATE
---------------------------- */
let lastSelectedDateForEntry = "";
let paymentAutofillEnabled = true; // true until user edits EPOS/UPI/Cash manually

// Bank remit date auto-set state
let bankRemitDateManualOverride = false;

/* ---------------------------
   TOAST STATE
---------------------------- */
let toastTimer = null;