
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
 * FIRESTORE SECURITY RULES (paste in Firebase Console → Firestore → Rules):
 * ─────────────────────────────────────────────────────────────────────────────
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *
 *     // Users: Public can read to see featured creators
 *     match /users/{uid} {
 *       allow read: if true;
 *       allow write: if request.auth != null && request.auth.uid == uid;
 *       allow update: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
 *     }
 *
 *     // Videos: Public read for non-exclusive. Exclusive read only for creator, admin, or the designated viewer.
 *     match /videos/{videoId} {
 *       allow read: if true;
 *       allow create: if request.auth != null;
 *       // Allow anyone to update just the view counts
 *       allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['views', 'paidViews']);
 *       // Creators and admins can update or delete fully
 *       allow update, delete: if request.auth != null && (
 *         resource.data.creatorId == request.auth.uid ||
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
 *
 *     // Categories: read all; admin creates/updates/deletes
 *     match /categories/{categoryId} {
 *       allow read: if true;
 *       allow write: if request.auth != null &&
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
 *     }
 *
 *     // Custom Requests: viewer or creator can read; viewer creates; creator updates status
 *     match /customRequests/{requestId} {
 *       allow read: if request.auth != null && (
 *         resource.data.viewerId == request.auth.uid ||
 *         resource.data.creatorId == request.auth.uid ||
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
 *       );
 *       allow create: if request.auth != null && request.resource.data.viewerId == request.auth.uid;
 *       allow update: if request.auth != null && (
 *         resource.data.creatorId == request.auth.uid ||
 *         resource.data.viewerId == request.auth.uid ||
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
 *       );
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
