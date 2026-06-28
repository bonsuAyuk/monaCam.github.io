
/**
 * db-config.js — Firebase initialization and exports
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com
 * 2. Create a project → give it any name
 * 3. Add a Web App, copy the config object and replace the placeholders below
 * 4. Enable Authentication → Email/Password
 * 5. Enable Firestore Database (production mode, then apply rules below)
 *
 * NOTE: Firebase Storage is NOT required by this app.
 *       All files (videos, thumbnails, payment screenshots) are stored
 *       in Google Drive via Apps Script. See js/drive-upload.js.
 *
 * FIRESTORE SECURITY RULES (paste in Firebase Console → Firestore → Rules):\n * ─────────────────────────────────────────────────────────────────────────────\n * rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is logged in
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper function to check if user is an admin
    function isAdmin() {
      return isAuthenticated() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // ── 1. USERS COLLECTION ──
    match /users/{userId} {
      allow read: if true; // Anyone can read creator profiles
      allow create: if isAuthenticated() && request.auth.uid == userId; // Users can create their own profile
      allow update: if isAuthenticated() && request.auth.uid == userId; // Users can edit their own profile
      allow delete: if isAdmin();
    }

    // ── 2. VIDEOS COLLECTION ──
    match /videos/{videoId} {
      allow read: if true; // Anyone can see videos listed
      allow create: if isAuthenticated(); // Logged-in creators can upload videos
      // CRITICAL FIX: Logged out users can ONLY update the views! Creators/Admins can edit anything.
      allow update: if isAuthenticated() || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['views', 'paidViews']);
      allow delete: if isAdmin() || (isAuthenticated() && resource.data.creatorId == request.auth.uid);
    }

    // ── 3. COMMENTS COLLECTION (NEW) ──
    match /comments/{commentId} {
      allow read: if true;
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // ── 4. SETTINGS COLLECTION ──
    match /settings/{document=**} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // ── 5. PAYMENT REQUESTS COLLECTION ──
    match /paymentRequests/{requestId} {
      allow create: if isAuthenticated();
      allow read: if isAuthenticated() && (request.auth.uid == resource.data.uid || isAdmin());
      allow update: if isAdmin();
    }

    // ── 6. CATEGORIES COLLECTION ──
    match /categories/{categoryId} {
      allow read: if true; // Anyone can fetch category filters
      allow write: if isAdmin(); // Only admins can add/edit categories
    }

    // ── 7. CUSTOM REQUESTS COLLECTION ──
    match /customRequests/{requestId} {
      // Users can only see their own requests, Creators can see requests sent to them
      allow read: if isAuthenticated() && (resource.data.viewerId == request.auth.uid || resource.data.creatorId == request.auth.uid || isAdmin());
      allow create: if isAuthenticated();
      // Both the Viewer and Creator need to update it (for negotiating price or accepting)
      allow update: if isAuthenticated() && (resource.data.viewerId == request.auth.uid || resource.data.creatorId == request.auth.uid || isAdmin());
      allow delete: if isAdmin();
    }

    // ── 8. WITHDRAWALS COLLECTION ──
    match /withdrawals/{requestId} {
      // Creators can only see their own cashout requests
      allow read: if isAuthenticated() && (resource.data.creatorId == request.auth.uid || isAdmin());
      allow create: if isAuthenticated() && request.resource.data.creatorId == request.auth.uid;
      // Only Admins can approve/update a cashout request
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }
  }
}
\n */

// ── TODO: Replace with your actual Firebase project config ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  startAfter,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyBVYQZ749eyNwKjKzMecTXit-R-widnPW4",
  authDomain: "cameroon-creator-platform.firebaseapp.com",
  projectId: "cameroon-creator-platform",
  storageBucket: "cameroon-creator-platform.firebasestorage.app",
  messagingSenderId: "9036355649971:903635564997:web:7458cfcef7eed0300bb3ac",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app,
  auth,
  db,
  // Auth
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  // Firestore
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  startAfter,
  serverTimestamp,
  increment,
};

export const DRIVE_API_KEY = "AIzaSyCFzqtgDTZos4P49em7jZdqreG9Ha9zL3k";
