import { db, DRIVE_API_KEY, auth } from "./db-config.js";
import { collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentAdmin = null;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentAdmin = user;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const syncForm = document.getElementById("drive-sync-form");
  const folderInput = document.getElementById("drive-folder-id");
  const syncBtn = document.getElementById("btn-sync-drive");
  const successAlert = document.getElementById("sync-success-alert");
  const errorAlert = document.getElementById("sync-error-alert");
  const successMsg = document.getElementById("sync-success-msg");
  const errorMsg = document.getElementById("sync-error-msg");

  if (!syncForm) return;

  syncForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentAdmin) {
      alert("You must be logged in as admin to sync.");
      return;
    }

    const folderId = folderInput.value.trim();
    if (!folderId) return;

    syncBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Syncing...`;
    syncBtn.disabled = true;
    successAlert.style.display = 'none';
    errorAlert.style.display = 'none';

    try {
      // 1. Fetch files from Google Drive folder
      const driveUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false+and+mimeType+contains+'video/'&fields=files(id,name,mimeType,thumbnailLink,videoMediaMetadata)&key=${DRIVE_API_KEY}`;
      
      const response = await fetch(driveUrl);
      if (!response.ok) {
        throw new Error("Failed to read from Google Drive. Ensure the folder ID is correct and the folder is fully public ('Anyone with the link can view').");
      }
      
      const data = await response.json();
      const files = data.files || [];
      
      if (files.length === 0) {
        throw new Error("No video files found in that folder.");
      }

      // 2. Fetch existing videos from Firestore to avoid duplicates
      const videosSnapshot = await getDocs(collection(db, "videos"));
      const existingDriveIds = new Set();
      videosSnapshot.forEach(doc => {
        const v = doc.data();
        if (v.driveFileId) existingDriveIds.add(v.driveFileId);
        if (v.videoDriveId) existingDriveIds.add(v.videoDriveId); // backwards compatibility
      });

      let addedCount = 0;

      // 3. Process new files
      for (const file of files) {
        if (!existingDriveIds.has(file.id)) {
          // It's a new file!
          const title = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
          const durationMillis = file.videoMediaMetadata ? file.videoMediaMetadata.durationMillis : 0;
          const durationStr = formatDuration(durationMillis);
          
          await addDoc(collection(db, "videos"), {
            title: title,
            description: "Automatically imported from Google Drive.",
            category: "other", // Default category
            creatorId: currentAdmin.uid,
            creatorName: currentAdmin.displayName || "Admin",
            priceFCFA: 0, // VIP Pass only mode
            status: "approved",
            driveFileId: file.id,
            thumbDriveId: file.id, // Google Drive automatically creates thumbnails using the file ID
            duration: durationStr,
            views: 0,
            paidViews: 0,
            createdAt: new Date().toISOString()
          });
          addedCount++;
        }
      }

      successMsg.innerText = `Sync complete! Successfully imported ${addedCount} new video(s).`;
      successAlert.style.display = 'flex';
      
      // Clear input
      folderInput.value = "";
    } catch (err) {
      errorMsg.innerText = err.message;
      errorAlert.style.display = 'flex';
      console.error(err);
    } finally {
      syncBtn.innerHTML = `<i class="fa-solid fa-rotate"></i> Sync Now`;
      syncBtn.disabled = false;
    }
  });

  function formatDuration(millis) {
    if (!millis) return "0:00";
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
});
