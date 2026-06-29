// ============================================================
// Firebase Configuration — LaRa Finance Balance Sheet Projector
// ============================================================
// INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (e.g., "LaRa Finance")
// 3. Go to Project Settings → General → Your Apps → Add Web App
// 4. Copy the firebaseConfig object and paste it below
// 5. Enable Authentication → Sign-in method → Google
// 6. Create Firestore Database (production mode)
// 7. Set Firestore rules (see firestore.rules below)
// 8. Add your GitHub Pages domain to Authentication → Settings → Authorized domains
// ============================================================

const FIREBASE_CONFIG = {
  // ═══════════════════════════════════════════════════════════
  // PASTE YOUR FIREBASE CONFIG HERE
  // ═══════════════════════════════════════════════════════════
  apiKey: "AIzaSyBy3ug8jbschtfncoNFSYXxaCjwWjuIA0I",
  authDomain: "cashflow-pulse-6e8e7.firebaseapp.com",
  projectId: "cashflow-pulse-6e8e7",
  storageBucket: "cashflow-pulse-6e8e7.firebasestorage.app",
  messagingSenderId: "569649943668",
  appId: "1:569649943668:web:0d602a90db0856920bed21"
};

// Set to true once you've pasted your real Firebase config above
const FIREBASE_ENABLED = true;

export { FIREBASE_CONFIG, FIREBASE_ENABLED };
