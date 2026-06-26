// Authentication Operations and User Profiles

import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc
} from "./firebase-config.js";

/**
 * Register a new user and create their Firestore profile.
 */
export async function signUpUser(email, password, displayName, phoneNumber, role) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Create user profile document in Firestore
    const userProfile = {
      uid: user.uid,
      email: email,
      displayName: displayName,
      phoneNumber: phoneNumber,
      role: role, // 'viewer' or 'creator' (admin cannot be self-selected)
      photoURL: "",
      createdAt: new Date(),
    };

    if (role === "creator") {
      userProfile.creatorProfile = {
        plan: "starter", // Default creator plan
        bio: "Welcome to my creator profile!",
        featured: false,
        weeklyUploadCount: 0,
        paymentDetails: {
          provider: "MTN",
          number: phoneNumber,
          accountName: displayName
        }
      };
    }

    await setDoc(doc(db, "users", user.uid), userProfile);
    return user;
  } catch (error) {
    console.error("SignUp Error:", error);
    throw error;
  }
}

/**
 * Login user and retrieve their role.
 */
export async function signInUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Get user document to verify role
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      return { user, profile: userDoc.data() };
    } else {
      throw new Error("User profile does not exist in Firestore.");
    }
  } catch (error) {
    console.error("SignIn Error:", error);
    throw error;
  }
}

/**
 * Logout currently authenticated user.
 */
export async function signOutUser() {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("SignOut Error:", error);
    throw error;
  }
}

/**
 * Send password reset email.
 */
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Password Reset Error:", error);
    throw error;
  }
}

/**
 * Global authentication observer.
 */
export function observeAuthState(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Get role details from database
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        callback(user, userDoc.data());
      } else {
        callback(user, null);
      }
    } else {
      callback(null, null);
    }
  });
}
