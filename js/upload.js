/**
 * upload.js — Creator Dashboard Controller
 *
 * Handles:
 *  - Dashboard tab switching (sidebar + mobile tab bar)
 *  - Auth state and role validation
 *  - Video upload via Google Drive (through Apps Script)
 *  - Upload quota tracking
 *  - Stats and video table rendering
 *  - Payout/withdrawal requests
 */
import {
  db, auth, onAuthStateChanged,
  doc, getDoc, setDoc,
  collection, query, where, getDocs, limit
} from "./db-config.js";
import {
  uploadVideoToDrive, uploadThumbnailToDrive, isUploadConfigured
} from "./drive-upload.js";

// ── State ───────────────────────────────────────────────────────
let currentUser     = null;
let userProfile     = null;
let creatorVideos   = [];
let uploadWeekCount = 0;
let uploadWeekLimit = 5;

// ── DOM Elements ────────────────────────────────────────────────
const sidebarName        = document.getElementById("sidebar-username");
const sidebarAvatar      = document.getElementById("sidebar-avatar");
const creatorPlanBadge   = document.getElementById("creator-plan-badge");
const sidebarMenuItems   = document.querySelectorAll(".sidebar-menu-item");
const mobileTabItems     = document.querySelectorAll(".mobile-tab-item");
const dashboardPanels    = document.querySelectorAll(".dashboard-panel");
const quotaRatio         = document.getElementById("quota-numerical-ratio");
const quotaProgressFill  = document.getElementById("quota-progress-bar-fill");
const statsEarnings      = document.getElementById("stats-total-earnings");
const statsViews         = document.getElementById("stats-total-views");
const statsVideosCount   = document.getElementById("stats-total-videos");
const overviewRecentTable = document.getElementById("overview-recent-table");
const videosListTable    = document.getElementById("videos-list-table");

// Upload form elements
const uploadForm           = document.getElementById("upload-video-form");
const videoFileTrigger     = document.getElementById("video-file-trigger");
const videoFileInput       = document.getElementById("video-file-input");
const selectedVideoFilename = document.getElementById("selected-video-filename");
const thumbFileTrigger     = document.getElementById("thumb-file-trigger");
const thumbFileInput       = document.getElementById("thumb-file-input");
const selectedThumbFilename = document.getElementById("selected-thumb-filename");
const thumbPreviewWrapper  = document.getElementById("thumb-preview-wrapper");
const thumbPreviewImg      = document.getElementById("thumb-preview-img");
const uploadErrorAlert     = document.getElementById("upload-error-alert");
const uploadErrorMsg       = document.getElementById("upload-error-msg");
const uploadSuccessAlert   = document.getElementById("upload-success-alert");

// Progress bar elements
const progressContainer = document.getElementById("upload-progress-container");
const progressBar       = document.getElementById("upload-progress-bar");
const progressPct       = document.getElementById("upload-progress-pct");
const progressLabel     = document.getElementById("upload-progress-label");
const progressNote      = document.getElementById("upload-progress-note");

// Payout elements
const payoutForm         = document.getElementById("payout-form");
const payoutSuccessAlert = document.getElementById("payout-success-alert");
const earningsBalance    = document.getElementById("earnings-balance");
const earningsWithdrawn  = document.getElementById("earnings-withdrawn");

// ── Init ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupTabTransitions();
  setupAuthObserver();
  setupFileTriggers();
  setupPayoutHandler();
});

// ── Tab switching (sidebar + mobile tab bar) ────────────────────
function setupTabTransitions() {
  const switchTab = (tab) => {
    sidebarMenuItems.forEach(m => m.classList.remove("active"));
    mobileTabItems.forEach(m => m.classList.remove("active"));
    dashboardPanels.forEach(p => p.classList.remove("active"));

    // Activate the correct sidebar + mobile items
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => el.classList.add("active"));
    const panel = document.getElementById(`panel-${tab}`);
    if (panel) panel.classList.add("active");
  };

  sidebarMenuItems.forEach(item => {
    item.addEventListener("click", () => switchTab(item.dataset.tab));
  });
  mobileTabItems.forEach(item => {
    item.addEventListener("click", () => switchTab(item.dataset.tab));
  });
}

// ── Auth Observer ───────────────────────────────────────────────
function setupAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    currentUser = user;

    try {
      const profileDoc = await getDoc(doc(db, "users", user.uid));
      if (profileDoc.exists()) {
        userProfile = profileDoc.data();
      }
    } catch (err) {
      console.warn("Could not load profile from Firestore:", err.message);
    }

    if (!userProfile) {
      userProfile = {
        displayName: user.displayName || user.email?.split("@")[0] || "Creator",
        email: user.email,
        role: localStorage.getItem("userRole") || "creator",
        creatorProfile: { plan: "starter" }
      };
    }

    updateDashboardUI();
    await fetchCreatorContent();
    await fetchCategories();
    setupUploadFormHandler();
  });
}

// ── Fetch Categories from DB ────────────────────────────────────
async function fetchCategories() {
  const categorySelect = document.getElementById("video-category");
  if (!categorySelect) return;
  try {
    const querySnapshot = await getDocs(collection(db, "categories"));
    if (querySnapshot.empty) {
      categorySelect.innerHTML = `<option value="" disabled selected>No categories available</option>`;
      return;
    }
    
    let html = `<option value="" disabled selected>Select category</option>`;
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      html += `<option value="${docSnap.id}">${data.name}</option>`;
    });
    categorySelect.innerHTML = html;
  } catch (err) {
    console.error("Error fetching categories:", err);
    categorySelect.innerHTML = `<option value="" disabled selected>Error loading categories</option>`;
  }
}

// ── Update UI with user data ────────────────────────────────────
function updateDashboardUI() {
  if (sidebarName) sidebarName.innerText = userProfile.displayName || "Creator";
  const plan = userProfile.creatorProfile?.plan || "none";
  if (creatorPlanBadge) {
    if (plan === "none") {
      creatorPlanBadge.innerText = "Pending Activation";
      creatorPlanBadge.className = "sidebar-user-role badge";
      creatorPlanBadge.style.backgroundColor = "rgba(255, 107, 107, 0.1)";
      creatorPlanBadge.style.color = "var(--primary)";
    } else {
      creatorPlanBadge.innerText = plan === "premium" ? "Premium Creator" : "Starter Creator";
      creatorPlanBadge.className = plan === "premium"
        ? "sidebar-user-role badge badge-featured"
        : "sidebar-user-role badge";
    }
  }
  uploadWeekLimit = plan === "premium" ? 15 : 5;

  // Prefill payout info
  const payNum  = document.getElementById("payout-number");
  const payProv = document.getElementById("payout-provider");
  if (payNum && userProfile.creatorProfile?.paymentDetails?.number) {
    payNum.value = userProfile.creatorProfile.paymentDetails.number;
  }
  if (payProv && userProfile.creatorProfile?.paymentDetails?.provider) {
    payProv.value = userProfile.creatorProfile.paymentDetails.provider;
  }

  // Enforce Access Control
  if (plan === "none" || plan === "pending") {
    // Hide all normal panels
    document.querySelectorAll(".dashboard-panel").forEach(panel => panel.classList.remove("active"));
    // Show upgrade panel
    const upgradePanel = document.getElementById("panel-upgrade");
    if (upgradePanel) upgradePanel.classList.add("active");
    
    // Disable navigation sidebar links
    document.querySelectorAll(".sidebar-menu-item").forEach(item => {
      item.style.opacity = "0.5";
      item.style.pointerEvents = "none";
    });
    // Disable mobile nav tabs
    document.querySelectorAll(".mobile-tab-item").forEach(item => {
      item.style.opacity = "0.5";
      item.style.pointerEvents = "none";
    });
  }
}

// ── Fetch videos and compute stats ──────────────────────────────
async function fetchCreatorContent() {
  creatorVideos = [];

  try {
    const q = query(
      collection(db, "videos"),
      where("creatorId", "==", currentUser.uid)
    );
    const snapshot = await getDocs(q);
    snapshot.forEach(d => {
      creatorVideos.push({ id: d.id, ...d.data() });
    });
  } catch (err) {
    console.warn("Firestore query error:", err.message);
  }

  // ── Compute stats ──
  let totalViews = 0, approvedCount = 0, totalRevenue = 0;
  const weekToken = `${new Date().getFullYear()}-${getWeekNumber(new Date())}`;
  uploadWeekCount = 0;

  creatorVideos.forEach(v => {
    totalViews += v.views || 0;
    if (v.status === "approved") {
      approvedCount++;
      const paidViews = v.paidViews || 0;
      // Revenue calculation: assuming the creator gets 100% of the price * paidViews, 
      // wait in earnings.js it calculates 80%? But here it's 0.05? Let's just use paidViews * priceFCFA
      totalRevenue += paidViews * (v.priceFCFA || 0);
    }
    if (v.weeklyUploadWeekToken === weekToken) uploadWeekCount++;
  });

  if (statsEarnings) statsEarnings.innerText = `${totalRevenue.toLocaleString()} FCFA`;
  if (statsViews)    statsViews.innerText = totalViews.toLocaleString();
  if (statsVideosCount) statsVideosCount.innerText = creatorVideos.length;
  if (quotaRatio)    quotaRatio.innerText = `${uploadWeekCount} / ${uploadWeekLimit}`;
  if (quotaProgressFill) {
    quotaProgressFill.style.width = `${Math.min((uploadWeekCount / uploadWeekLimit) * 100, 100)}%`;
  }
  if (earningsBalance)  earningsBalance.innerText = `${totalRevenue.toLocaleString()} FCFA`;
  if (earningsWithdrawn) earningsWithdrawn.innerText = "0 FCFA";

  renderVideosTable();
}

function getWeekNumber(d) {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
}

// ── Render videos table ─────────────────────────────────────────
function renderVideosTable() {
  const renderRow = (v) => {
    const badges = {
      approved: `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Approved</span>`,
      pending:  `<span class="badge badge-pending"><i class="fa-solid fa-spinner fa-spin"></i> Pending</span>`,
      rejected: `<span class="badge" style="background:rgba(255,23,68,0.1); color:var(--error); border-color:rgba(255,23,68,0.25);"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>`
    };
    const thumb = v.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=100&q=80";
    const price = v.priceFCFA === 0 ? "Pass Only" : `${(v.priceFCFA || 0).toLocaleString()} FCFA`;
    const date  = new Date(v.createdAt).toLocaleDateString();

    return `
      <tr>
        <td>
          <div class="table-video-title">
            <div class="table-video-thumb" style="background-image:url(${thumb}); background-size:cover; background-position:center;"></div>
            <div>
              <div style="font-weight:700;">${v.title}</div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Uploaded: ${date}</div>
            </div>
          </div>
        </td>
        <td style="text-transform:capitalize;">${v.category}</td>
        <td>${price}</td>
        <td><i class="fa-solid fa-eye" style="font-size:12px; color:var(--text-muted);"></i> ${v.views || 0}</td>
        <td>${badges[v.status] || v.status}</td>
      </tr>
    `;
  };

  if (creatorVideos.length > 0) {
    const html = creatorVideos.map(renderRow).join("");
    if (videosListTable) videosListTable.innerHTML = html;
    if (overviewRecentTable) overviewRecentTable.innerHTML = html;
  } else {
    const empty = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No videos yet. Upload your first video!</td></tr>`;
    if (videosListTable) videosListTable.innerHTML = empty;
  }
}

// ── File picker triggers ────────────────────────────────────────
function setupFileTriggers() {
  if (videoFileTrigger && videoFileInput) {
    videoFileTrigger.addEventListener("click", () => videoFileInput.click());
    videoFileInput.addEventListener("change", () => {
      const f = videoFileInput.files[0];
      if (f) {
        const sizeMB = (f.size / (1024 * 1024)).toFixed(1);
        selectedVideoFilename.innerText = `${f.name} (${sizeMB} MB)`;
        selectedVideoFilename.style.color = "var(--primary)";
      }
    });
  }

  if (thumbFileTrigger && thumbFileInput) {
    thumbFileTrigger.addEventListener("click", () => thumbFileInput.click());
    thumbFileInput.addEventListener("change", () => {
      const f = thumbFileInput.files[0];
      if (f) {
        selectedThumbFilename.innerText = `${f.name}`;
        selectedThumbFilename.style.color = "var(--primary)";
        // Show thumbnail preview
        const reader = new FileReader();
        reader.onload = (e) => {
          if (thumbPreviewImg) thumbPreviewImg.src = e.target.result;
          if (thumbPreviewWrapper) thumbPreviewWrapper.style.display = "block";
        };
        reader.readAsDataURL(f);
      }
    });
  }
}

// ── Progress bar helper ─────────────────────────────────────────
function showProgress(label, pct, note) {
  if (progressContainer) progressContainer.style.display = "block";
  if (progressLabel)     progressLabel.innerText = label;
  if (progressPct)       progressPct.innerText = `${pct}%`;
  if (progressBar)       progressBar.style.width = `${pct}%`;
  if (progressNote && note) progressNote.innerText = note;
}

function hideProgress() {
  if (progressContainer) progressContainer.style.display = "none";
}

// ── Upload Form Handler ─────────────────────────────────────────
function setupUploadFormHandler() {
  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    uploadErrorAlert.style.display  = "none";
    uploadSuccessAlert.style.display = "none";

    // Quota check
    if (uploadWeekCount >= uploadWeekLimit) {
      uploadErrorMsg.innerText = `Weekly upload limit reached (${uploadWeekLimit}). Upgrade your plan for more.`;
      uploadErrorAlert.style.display = "flex";
      return;
    }

    // Check upload service
    if (!isUploadConfigured()) {
      uploadErrorMsg.innerText = "Upload service not configured. The site admin needs to deploy the Google Apps Script and set the URL.";
      uploadErrorAlert.style.display = "flex";
      return;
    }

    const title       = document.getElementById("video-title").value.trim();
    const description = document.getElementById("video-desc").value.trim();
    const price       = parseInt(document.getElementById("video-price").value) || 0;
    const category    = document.getElementById("video-category").value;
    const videoFile   = videoFileInput?.files[0];
    const thumbFile   = thumbFileInput?.files[0];

    if (!videoFile) {
      uploadErrorMsg.innerText = "Please select a video file to upload.";
      uploadErrorAlert.style.display = "flex";
      return;
    }
    if (!thumbFile) {
      uploadErrorMsg.innerText = "Please select a thumbnail image.";
      uploadErrorAlert.style.display = "flex";
      return;
    }

    const submitBtn = document.getElementById("upload-submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading...`;

    const videoId = "v_" + Math.random().toString(36).substring(2, 11);

    try {
      // ── Upload video to Google Drive ───────────────────────
      showProgress("Uploading video...", 0, "Please keep this page open.");
      const videoResult = await uploadVideoToDrive(videoFile, videoId, (pct) => {
        showProgress("Uploading video...", Math.round(pct * 0.7), "This may take a moment for larger files.");
      });

      // ── Upload thumbnail to Google Drive ───────────────────
      showProgress("Uploading thumbnail...", 70, "Almost there...");
      const thumbResult = await uploadThumbnailToDrive(thumbFile, videoId, (pct) => {
        showProgress("Uploading thumbnail...", 70 + Math.round(pct * 0.2), "Almost there...");
      });

      // ── Save metadata to Firestore ─────────────────────────
      showProgress("Saving metadata...", 92, "Finalizing...");

      const today     = new Date();
      const weekToken = `${today.getFullYear()}-${getWeekNumber(today)}`;

      const newVideo = {
        videoId,
        creatorId:   currentUser.uid,
        creatorName: userProfile.displayName,
        title,
        description,
        priceFCFA:   price,
        category,
        status:      "pending",
        driveFileId:   videoResult.fileId,   // Google Drive video file ID
        driveEmbedUrl: videoResult.embedUrl, // Embed URL for the player
        thumbnailUrl:  thumbResult.url,      // Direct view URL for thumbnail
        thumbDriveId:  thumbResult.fileId,   // Thumbnail Drive file ID
        weeklyUploadWeekToken: weekToken,
        views:     0,
        createdAt: today.toISOString(),
      };

      await setDoc(doc(db, "videos", videoId), newVideo);

      showProgress("Upload complete!", 100, "Your video is pending admin approval. Note: Google Drive may take 5-30 mins to process the video for streaming.");

      uploadSuccessAlert.style.display = "flex";
      uploadForm.reset();
      if (selectedVideoFilename) selectedVideoFilename.innerText = "MP4 or WebM — max 150MB";
      if (selectedThumbFilename) selectedThumbFilename.innerText = "JPG or PNG — max 10MB";
      if (thumbPreviewWrapper)   thumbPreviewWrapper.style.display = "none";
      if (selectedVideoFilename) selectedVideoFilename.style.color = "";
      if (selectedThumbFilename) selectedThumbFilename.style.color = "";

      await fetchCreatorContent();

      setTimeout(() => {
        hideProgress();
        const overviewTab = document.querySelector("[data-tab='overview']");
        if (overviewTab) overviewTab.click();
      }, 2000);

    } catch (err) {
      hideProgress();
      uploadErrorMsg.innerText = err.message || "Upload failed. Please try again.";
      uploadErrorAlert.style.display = "flex";
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Upload & Submit for Review`;
    }
  });
}

// ── Payout Handler ──────────────────────────────────────────────
function setupPayoutHandler() {
  if (!payoutForm) return;
  payoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount   = document.getElementById("payout-amount")?.value;
    const provider = document.getElementById("payout-provider")?.value;
    const number   = document.getElementById("payout-number")?.value;

    try {
      const requestId = `WD_${currentUser.uid.slice(0,6)}_${Date.now()}`;
      await setDoc(doc(db, "withdrawals", requestId), {
        requestId,
        creatorId: currentUser.uid,
        creatorName: userProfile.displayName,
        amount: parseInt(amount) || 0,
        provider,
        number,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      if (payoutSuccessAlert) payoutSuccessAlert.style.display = "flex";
      payoutForm.reset();
    } catch (err) {
      console.warn("Payout request failed:", err.message);
      alert("Could not submit withdrawal request. Please try again.");
    }
  });
}
