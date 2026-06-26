/**
 * payment.js — Manual Payment Screenshot System
 *
 * ALL files stored on Google Drive (free, unlimited):
 *   • Screenshots → uploaded via drive-upload.js → saved to Drive/Screenshots/
 *   • Metadata → saved in Firestore paymentRequests collection
 *
 * If Drive upload is not configured, falls back to compressed
 * base64 stored directly in the Firestore document.
 */

import {
  db, doc, setDoc, collection, query, where, getDocs, orderBy, getDoc, updateDoc
} from "./db-config.js";
import {
  uploadScreenshotToImgBB,
} from "./drive-upload.js";

// ─────────────────────────────────────────────────────────────────
// PAYMENT NUMBERS — update with your real MoMo numbers
// ─────────────────────────────────────────────────────────────────
export const PAYMENT_NUMBERS = {
  MTN: { number: "670056562", name: "Bonsu Otubessong" },
  Orange: { number: "686194377", name: "Bonsu Otubessong" },
};

// ─────────────────────────────────────────────────────────────────
// PLAN DEFINITIONS
// ─────────────────────────────────────────────────────────────────
export const PLANS = {
  weekly: { label: "Weekly Pass", amount: 1000, days: 7, desc: "Access all videos for 7 days" },
  monthly: { label: "Monthly Pass", amount: 2500, days: 30, desc: "Access all videos for 30 days" },
};

// ─────────────────────────────────────────────────────────────────
// IMAGE COMPRESSION — fallback when Drive is not configured
// ─────────────────────────────────────────────────────────────────
function compressImageToBase64(file, maxWidth = 900, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────
// SUBMIT PAYMENT REQUEST
// ─────────────────────────────────────────────────────────────────
export async function submitPaymentRequest(opts) {
  const {
    uid, email, displayName,
    type, videoId, videoTitle,
    amount, provider, phone,
    screenshotFile,
  } = opts;

  const requestId = `PAY_${uid.slice(0, 6)}_${Date.now()}`;

  // ── Upload screenshot ──────────────────────────────────────
  let screenshotURL;
  let storageMethod;

  try {
    const result = await uploadScreenshotToImgBB(screenshotFile);
    screenshotURL = result.url; // ImgBB direct view URL
    storageMethod = "imgbb";
  } catch (err) {
    console.warn("ImgBB upload failed, using base64 fallback:", err.message);
    screenshotURL = await compressImageToBase64(screenshotFile);
    storageMethod = "firestore-base64";
  }

  // ── Write to Firestore ─────────────────────────────────────
  const requestData = {
    requestId, uid,
    email: email || "",
    displayName: displayName || "User",
    type, amount, provider, phone,
    screenshotURL,
    storageMethod,
    status: "pending",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    rejectionNote: null,
  };

  if (type === "ppv") {
    requestData.videoId = videoId;
    requestData.videoTitle = videoTitle;
  }

  await setDoc(doc(db, "paymentRequests", requestId), requestData);
  return requestId;
}

// ─────────────────────────────────────────────────────────────────
// CHECK USER ACCESS
// ─────────────────────────────────────────────────────────────────
export async function checkUserAccess(uid, videoId) {
  let hasPass = false, hasPPV = false, hasPending = false;
  let activePassType = null;
  let maxExpiry = 0;

  try {
    const snap = await getDocs(
      query(collection(db, "paymentRequests"), where("uid", "==", uid))
    );
    snap.forEach((d) => {
      const r = d.data();
      if (r.status === "pending") hasPending = true;
      if (r.status !== "approved") return;

      if (r.type === "weekly" || r.type === "monthly") {
        const days = r.type === "weekly" ? 7 : 30;
        const expiry = new Date(
          new Date(r.reviewedAt || r.createdAt).getTime() + days * 86400000
        ).getTime();
        
        if (Date.now() < expiry) {
          hasPass = true;
          // Upgrade logic: if we found a monthly, or if this pass expires later, store it
          if (r.type === "monthly") {
            activePassType = "monthly"; // monthly always overrides weekly
            if (expiry > maxExpiry) maxExpiry = expiry;
          } else if (r.type === "weekly" && activePassType !== "monthly") {
            activePassType = "weekly";
            if (expiry > maxExpiry) maxExpiry = expiry;
          }
        }
      }
      if (r.type === "ppv" && videoId && r.videoId === videoId) hasPPV = true;
    });
  } catch (e) {
    console.warn("Access check error:", e.message);
  }

  return { hasPass, hasPPV, hasPending, activePassType, activePassExpiry: maxExpiry };
}

// ─────────────────────────────────────────────────────────────────
// Get User Payment Requests
// ─────────────────────────────────────────────────────────────────
export async function getUserPaymentRequests(uid) {
  try {
    const snap = await getDocs(
      query(collection(db, "paymentRequests"), where("uid", "==", uid), orderBy("createdAt", "desc"))
    );
    return snap.docs.map(d => d.data());
  } catch (err) {
    console.error("Failed to fetch user payments:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// ADMIN: Get all payment requests
// ─────────────────────────────────────────────────────────────────
export async function getAllPaymentRequests(status) {
  const constraints = [orderBy("createdAt", "desc")];
  if (status) constraints.unshift(where("status", "==", status));
  const snap = await getDocs(query(collection(db, "paymentRequests"), ...constraints));
  return snap.docs.map((d) => d.data());
}

// ─────────────────────────────────────────────────────────────────
// ADMIN: Approve / Reject
// ─────────────────────────────────────────────────────────────────
export async function approvePaymentRequest(requestId) {
  const reqRef = doc(db, "paymentRequests", requestId);
  
  await setDoc(reqRef,
    { status: "approved", reviewedAt: new Date().toISOString() },
    { merge: true }
  );

  // Handle automatic plan upgrades for creators
  try {
    const snap = await getDoc(reqRef);
    if (snap.exists()) {
      const data = snap.data();
      const type = data.type;
      
      if (type === "starter_creator" || type === "premium_creator") {
        const newPlan = type === "premium_creator" ? "premium" : "starter";
        const userRef = doc(db, "users", data.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          let updatedProfile = userData.creatorProfile || {};
          updatedProfile.plan = newPlan;
          
          await updateDoc(userRef, {
            creatorProfile: updatedProfile,
            role: "creator" // Ensure they have the creator role
          });
        }
      }
    }
  } catch (err) {
    console.error("Error converting plan on approval:", err);
  }
}

export async function rejectPaymentRequest(requestId, note) {
  await setDoc(doc(db, "paymentRequests", requestId),
    { status: "rejected", rejectionNote: note || "Payment could not be verified.", reviewedAt: new Date().toISOString() },
    { merge: true }
  );
}
