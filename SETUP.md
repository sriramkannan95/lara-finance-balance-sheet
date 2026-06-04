# CashFlow Pulse — Firebase + GitHub Pages Setup Guide

Follow these steps to get your app live on the internet with cloud sync.

---

## Part 1: Firebase Setup (~5 minutes)

### Step 1: Create Firebase Project
1. Go to **[console.firebase.google.com](https://console.firebase.google.com)**
2. Click **"Add project"**
3. Name it `cashflow-pulse` (or anything you like)
4. Disable Google Analytics (not needed) → Click **Create project**

### Step 2: Register Web App
1. In the project dashboard, click the **Web icon** (`</>`)
2. App nickname: `CashFlow Pulse`
3. ☐ Don't check "Firebase Hosting" (we'll use GitHub Pages)
4. Click **Register app**
5. You'll see a `firebaseConfig` object — **copy it**

### Step 3: Paste Config
1. Open `firebase-config.js` in your editor
2. Replace the placeholder values with your config:
```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",          // paste yours
  authDomain: "cashflow-pulse-xxxxx.firebaseapp.com",
  projectId: "cashflow-pulse-xxxxx",
  storageBucket: "cashflow-pulse-xxxxx.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

const FIREBASE_ENABLED = true;   // ← Change this to true!
```

### Step 4: Enable Google Sign-In
1. Go to **Build → Authentication** in the sidebar
2. Click **Get started**
3. Go to **Sign-in method** tab
4. Click **Add new provider** → **Google**
5. Toggle **Enable**, choose your email as support email
6. Click **Save**

### Step 5: Create Firestore Database
1. Go to **Build → Firestore Database**
2. Click **Create database**
3. Choose a location (e.g., `asia-south1` for India)
4. Select **Production mode** → Click **Create**

### Step 6: Set Security Rules
1. In Firestore, go to the **Rules** tab
2. Replace the rules with:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
3. Click **Publish**

---

## Part 2: GitHub Pages Hosting (~5 minutes)

### Step 1: Create GitHub Repository
1. Go to **[github.com/new](https://github.com/new)**
2. Repository name: `cashflow-pulse`
3. Set to **Private** (your financial data URLs won't be visible)
4. Click **Create repository**

### Step 2: Push Your Files
Open Terminal and run:
```bash
cd ~/Documents/Antigravity_balance_sheet
git init
git add index.html style.css app.js firebase-config.js firebase-sync.js
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cashflow-pulse.git
git push -u origin main
```

### Step 3: Enable GitHub Pages
1. Go to your repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/(root)`
4. Click **Save**
5. Wait ~1 minute, your app will be at: `https://YOUR_USERNAME.github.io/cashflow-pulse/`

### Step 4: Add Domain to Firebase
1. Go back to **Firebase Console → Authentication → Settings**
2. Scroll to **Authorized domains**
3. Click **Add domain**
4. Enter: `YOUR_USERNAME.github.io`
5. Save

---

## Part 3: Test It!

1. Open your GitHub Pages URL in **Chrome on Mac**
2. Click **"Sign in with Google"** → authenticate
3. Make some changes (e.g., enter a credit card bill amount)
4. Open the same URL on your **Android phone's Chrome**
5. Sign in with the same Google account
6. Your data should appear! 🎉

Changes on either device will sync in real-time.

---

## Updating the App

Whenever you want to push code changes:
```bash
cd ~/Documents/Antigravity_balance_sheet
git add -A
git commit -m "Update description"
git push
```
GitHub Pages will auto-deploy in ~1 minute.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Sign-in popup blocked | Allow popups for your site |
| "Auth domain not authorized" | Add your domain to Firebase Auth → Authorized domains |
| Data not syncing | Check browser console (F12) for errors |
| Offline changes lost | They're saved in localStorage — will sync when back online |
