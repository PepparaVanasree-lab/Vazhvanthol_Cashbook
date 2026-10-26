/**************************************************************
 * firebase-init.js
 **************************************************************/

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