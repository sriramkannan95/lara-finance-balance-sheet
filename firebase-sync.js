// ============================================================
// Firebase Sync Module — LaRa Finance Balance Sheet Projector
// ============================================================
// Handles: Google Auth, Firestore real-time sync, offline fallback
// ============================================================

import { FIREBASE_CONFIG, FIREBASE_ENABLED } from './firebase-config.js';

// Firebase SDK imports (v12.14.0)
let firebaseApp, firebaseAuth, firebaseFirestore;
let app, auth, db;
let GoogleAuthProvider, signInWithPopup, signOutFn, onAuthStateChanged;
let docFn, setDoc, getDoc, onSnapshot;

// State
let currentUser = null;
let unsubscribeSnapshot = null;
let syncStatusCallback = null;
let dataChangeCallback = null;
let isInitialized = false;
let lastSyncTimestamp = 0;

// ============================================================
// Initialization
// ============================================================

async function initFirebase() {
  if (!FIREBASE_ENABLED) {
    console.log('[Firebase] Disabled — using localStorage only.');
    updateSyncStatus('disabled');
    return false;
  }

  try {
    updateSyncStatus('loading');

    // Dynamic imports for Firebase SDK
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js')
    ]);

    // Extract functions
    const { initializeApp } = appModule;
    GoogleAuthProvider = authModule.GoogleAuthProvider;
    signInWithPopup = authModule.signInWithPopup;
    signOutFn = authModule.signOut;
    onAuthStateChanged = authModule.onAuthStateChanged;

    docFn = firestoreModule.doc;
    setDoc = firestoreModule.setDoc;
    getDoc = firestoreModule.getDoc;
    onSnapshot = firestoreModule.onSnapshot;

    // Initialize Firebase
    app = initializeApp(FIREBASE_CONFIG);
    auth = authModule.getAuth(app);
    db = firestoreModule.getFirestore(app);

    // Listen for auth state changes
    onAuthStateChanged(auth, handleAuthStateChange);

    isInitialized = true;
    console.log('[Firebase] Initialized successfully.');
    return true;
  } catch (error) {
    console.error('[Firebase] Initialization failed:', error);
    updateSyncStatus('error');
    return false;
  }
}

// ============================================================
// Authentication
// ============================================================

async function signIn() {
  if (!isInitialized) {
    console.warn('[Firebase] Not initialized.');
    return null;
  }

  try {
    updateSyncStatus('signing-in');
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    console.log('[Firebase] Signed in as:', result.user.displayName);
    return result.user;
  } catch (error) {
    console.error('[Firebase] Sign-in error:', error.message);
    updateSyncStatus('error');

    // Show user-friendly error
    if (error.code === 'auth/popup-closed-by-user') {
      return null; // User closed popup, not an error
    }
    throw error;
  }
}

async function signOutUser() {
  if (!isInitialized || !auth) return;

  try {
    // Stop listening to Firestore
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }

    await signOutFn(auth);
    currentUser = null;
    updateSyncStatus('signed-out');
    console.log('[Firebase] Signed out.');
  } catch (error) {
    console.error('[Firebase] Sign-out error:', error);
  }
}

function handleAuthStateChange(user) {
  currentUser = user;

  if (user) {
    console.log('[Firebase] Auth state: signed in as', user.displayName);
    updateAuthUI(user);
    startRealtimeSync(user.uid);
  } else {
    console.log('[Firebase] Auth state: signed out');
    updateAuthUI(null);
    updateSyncStatus('signed-out');

    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
  }
}

// ============================================================
// Firestore Sync
// ============================================================

/**
 * Save state to Firestore.
 */
async function saveToCloud(state) {
  if (!isInitialized || !currentUser) return false;

  try {
    updateSyncStatus('syncing');

    const now = Date.now();
    lastSyncTimestamp = now;

    const docRef = docFn(db, 'users', currentUser.uid);
    await setDoc(docRef, {
      state: JSON.stringify(state),
      lastModified: now,
      userEmail: currentUser.email,
      userName: currentUser.displayName
    });

    updateSyncStatus('synced');
    console.log('[Firebase] Saved to cloud.');
    return true;
  } catch (error) {
    console.error('[Firebase] Save error:', error);
    updateSyncStatus('error');
    return false;
  }
}

/**
 * Load state from Firestore (one-time read).
 */
async function loadFromCloud() {
  if (!isInitialized || !currentUser) return null;

  try {
    const docRef = docFn(db, 'users', currentUser.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const state = JSON.parse(data.state);
      console.log('[Firebase] Loaded from cloud. Last modified:', new Date(data.lastModified).toLocaleString());
      return { state, lastModified: data.lastModified };
    } else {
      console.log('[Firebase] No cloud data found (new user).');
      return null;
    }
  } catch (error) {
    console.error('[Firebase] Load error:', error);
    return null;
  }
}

/**
 * Start real-time sync listener on the user's document.
 */
function startRealtimeSync(uid) {
  // Stop any existing listener
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
  }

  const docRef = docFn(db, 'users', uid);

  unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();

      // Ignore our own writes (within 2 second window)
      if (Math.abs(data.lastModified - lastSyncTimestamp) < 2000) {
        return;
      }

      console.log('[Firebase] Real-time update received from another device.');
      const state = JSON.parse(data.state);

      // Notify the app about the new data
      if (dataChangeCallback) {
        dataChangeCallback(state, data.lastModified);
      }

      updateSyncStatus('synced');
    }
  }, (error) => {
    console.error('[Firebase] Snapshot error:', error);
    updateSyncStatus('offline');
  });

  updateSyncStatus('synced');
}

/**
 * Migrate localStorage data to Firestore on first sign-in.
 */
async function migrateLocalToCloud(localState) {
  if (!isInitialized || !currentUser || !localState) return false;

  // Check if cloud already has data
  const cloudData = await loadFromCloud();

  if (cloudData) {
    // Cloud has data — ask which to keep
    // For now, cloud wins (it's the "source of truth")
    console.log('[Firebase] Cloud data exists. Using cloud data.');
    return cloudData.state;
  } else {
    // No cloud data — upload local data
    console.log('[Firebase] No cloud data. Migrating local data to cloud.');
    await saveToCloud(localState);
    return localState;
  }
}

// ============================================================
// UI Updates
// ============================================================

function updateAuthUI(user) {
  const signInBtn = document.getElementById('googleSignInBtn');
  const userInfo = document.getElementById('userInfo');
  const userName = document.getElementById('userName');
  const userAvatar = document.getElementById('userAvatar');
  const signOutBtn = document.getElementById('signOutBtn');

  if (user) {
    // Signed in
    if (signInBtn) signInBtn.style.display = 'none';
    if (userInfo) userInfo.style.display = 'flex';
    if (userName) userName.textContent = user.displayName || user.email;
    if (userAvatar) {
      userAvatar.src = user.photoURL || '';
      userAvatar.alt = user.displayName || 'User';
    }
    if (signOutBtn) signOutBtn.style.display = 'inline-flex';
  } else {
    // Signed out
    if (signInBtn) signInBtn.style.display = 'flex';
    if (userInfo) userInfo.style.display = 'none';
    if (signOutBtn) signOutBtn.style.display = 'none';
  }
}

function updateSyncStatus(status) {
  const indicator = document.getElementById('syncIndicator');
  const label = document.getElementById('syncLabel');
  if (!indicator || !label) return;

  const states = {
    'disabled': { dot: 'sync-disabled', text: 'Local Only' },
    'loading': { dot: 'sync-loading', text: 'Connecting...' },
    'signing-in': { dot: 'sync-loading', text: 'Signing in...' },
    'syncing': { dot: 'sync-loading', text: 'Syncing...' },
    'synced': { dot: 'sync-ok', text: 'Synced ✓' },
    'offline': { dot: 'sync-offline', text: 'Offline' },
    'signed-out': { dot: 'sync-disabled', text: 'Not signed in' },
    'error': { dot: 'sync-error', text: 'Sync error' }
  };

  const s = states[status] || states['disabled'];
  indicator.className = 'sync-dot ' + s.dot;
  label.textContent = s.text;

  if (syncStatusCallback) {
    syncStatusCallback(status);
  }
}

// ============================================================
// Public API
// ============================================================

function onDataChange(callback) {
  dataChangeCallback = callback;
}

function onSyncStatusChange(callback) {
  syncStatusCallback = callback;
}

function isSignedIn() {
  return currentUser !== null;
}

function getUser() {
  return currentUser;
}

export {
  initFirebase,
  signIn,
  signOutUser,
  saveToCloud,
  loadFromCloud,
  migrateLocalToCloud,
  onDataChange,
  onSyncStatusChange,
  isSignedIn,
  getUser,
  FIREBASE_ENABLED
};
