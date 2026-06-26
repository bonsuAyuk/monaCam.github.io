
1
rules_version = '2';
2

3
service cloud.firestore {
  4
  match / databases / { database } / documents {
    5
    match / { document=**} {
      6
      allow read, write: if false;
      7
    }
    8
  }
  9
}

/**
 * firebase-config.js — Firebase initialization and exports
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
 * FIRESTORE SECURITY RULES (paste in Firebase Console → Firestore → Rules):
 * ─────────────────────────────────────────────────────────────────────────────
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *
 *     // Users: read/write own profile
 *     match /users/{uid} {
 *       allow read, write: if request.auth != null && request.auth.uid == uid;
 *       // Admin can read all profiles
 *       allow read: if request.auth != null &&
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
 *     }
 *
 *     // Videos: public read; creator writes own; admin writes all
 *     match /videos/{videoId} {
 *       allow read: if true;
 *       allow create: if request.auth != null;
 *       allow update, delete: if request.auth != null && (
 *         resource.data.creatorUid == request.auth.uid ||
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
 *       );
 *     }
 *
 *     // Payment requests: user creates/reads own; admin reads+writes all
 *     match /paymentRequests/{requestId} {
 *       allow create: if request.auth != null
 *         && request.resource.data.uid == request.auth.uid;
 *       allow read: if request.auth != null && (
 *         resource.data.uid == request.auth.uid ||
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
 *       );
 *       allow update: if request.auth != null &&
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
 *     }
 *   }
 * }
 */

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
};
