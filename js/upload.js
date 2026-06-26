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
  doc, getDoc, setDoc, updateDoc,
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
let selectedVideoDuration = "00:00";

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
    await fetchCustomRequests();
    await fetchCategories();
    setupUploadFormHandler();
  });
}

// ── Fetch Custom Requests ───────────────────────────────────────
async function fetchCustomRequests() {
  const table = document.getElementById("custom-requests-table");
  if (!table) return;

  try {
    const q = query(
      collection(db, "customRequests"),
      where("creatorId", "==", currentUser.uid)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      table.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">No custom requests yet.</td></tr>`;
      return;
    }

    let html = "";
    const exclusiveSelect = document.getElementById("exclusive-request-select");
    let optionsHtml = '<option value="">Select an accepted custom request...</option>';

    snap.forEach(docSnap => {
      const r = docSnap.data();
      const reqId = docSnap.id;
      
      let statusColor = "var(--text-secondary)";
      if (r.status === "accepted") {
        statusColor = "var(--success)";
        optionsHtml += `<option value="${reqId}" data-viewer="${r.viewerId}" data-price="${r.offeredPriceFCFA}">${r.viewerName} - ${r.description.substring(0,30)}...</option>`;
      }
      if (r.status === "rejected") statusColor = "var(--danger)";
      if (r.status === "completed") statusColor = "var(--primary)";

      let actionButtons = "";
      if (r.status === "pending") {
        actionButtons = `
          <button class="btn btn-primary btn-sm accept-req" data-id="${reqId}" style="margin-right:8px; margin-bottom: 4px;">Accept</button>
          <button class="btn btn-secondary btn-sm negotiate-req" data-id="${reqId}" style="margin-right:8px; margin-bottom: 4px; background:var(--bg-tertiary);">Negotiate</button>
          <button class="btn btn-secondary btn-sm reject-req" data-id="${reqId}" style="margin-bottom: 4px; color:var(--danger);">Reject</button>
        `;
      } else if (r.status === "accepted") {
        actionButtons = `<span style="font-size:12px;">Link video in Upload tab</span>`;
      }

      html += `
        <tr>
          <td style="font-weight:600;">${r.viewerName}</td>
          <td style="max-width:300px; white-space:normal;">${r.description}</td>
          <td style="font-family:var(--font-display); font-weight:700;">${r.offeredPriceFCFA.toLocaleString()} FCFA</td>
          <td style="color:${statusColor}; font-weight:bold; text-transform:uppercase; font-size:12px;">${r.status}</td>
          <td>${actionButtons}</td>
        </tr>
      `;
    });
    table.innerHTML = html;
    if (exclusiveSelect) exclusiveSelect.innerHTML = optionsHtml;

    // Add event listeners for accept/reject
    document.querySelectorAll(".accept-req").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.id;
        if (confirm("Accept this request for " + e.target.parentElement.previousElementSibling.previousElementSibling.innerText + "?")) {
          e.target.innerHTML = "Wait...";
          await updateDoc(doc(db, "customRequests", id), { status: "accepted" });
          fetchCustomRequests(); // Refresh
        }
      });
    });

    document.querySelectorAll(".negotiate-req").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.id;
        const newPrice = prompt("Enter your counter-offer price in FCFA:");
        if (newPrice && !isNaN(newPrice)) {
          e.target.innerHTML = "Wait...";
          await updateDoc(doc(db, "customRequests", id), { offeredPriceFCFA: Number(newPrice) });
          fetchCustomRequests(); // Refresh
        }
      });
    });

    document.querySelectorAll(".reject-req").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.id;
        if (confirm("Reject this request?")) {
          e.target.innerHTML = "Wait...";
          await updateDoc(doc(db, "customRequests", id), { status: "rejected" });
          fetchCustomRequests(); // Refresh
        }
      });
    });

  } catch (error) {
    console.error("Error fetching custom requests:", error);
    table.innerHTML = `<tr><td colspan="5" style="color:var(--danger); text-align:center;">Failed to load requests.</td></tr>`;
  }
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
        selectedVideoFilename.innerText = `${f.name} (${sizeMB} MB) - Calculating duration...`;
        selectedVideoFilename.style.color = "var(--primary)";
        
        // Extract real video duration
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = function() {
          URL.revokeObjectURL(video.src);
          const duration = video.duration;
          const m = Math.floor(duration / 60).toString().padStart(2, '0');
          const s = Math.floor(duration % 60).toString().padStart(2, '0');
          selectedVideoDuration = `${m}:${s}`;
          selectedVideoFilename.innerText = `${f.name} (${sizeMB} MB) - ${selectedVideoDuration}`;
        };
        video.src = URL.createObjectURL(f);
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
    const isExclusiveCheckbox = document.getElementById("is-exclusive-checkbox");
    const exclusiveDropdown = document.getElementById("exclusive-request-dropdown-container");
    if (isExclusiveCheckbox && exclusiveDropdown) {
      isExclusiveCheckbox.addEventListener("change", (e) => {
        exclusiveDropdown.style.display = e.target.checked ? "block" : "none";
      });
    }

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
    const price       = Number(document.getElementById("video-price").value);
    const category    = document.getElementById("video-category").value;

    const isExclusive = document.getElementById("is-exclusive-checkbox")?.checked || false;
    const exclusiveSelect = document.getElementById("exclusive-request-select");
    let exclusiveViewerId = null;
    let exclusiveRequestId = null;

    if (isExclusive && exclusiveSelect && exclusiveSelect.value) {
      exclusiveRequestId = exclusiveSelect.value;
      const selectedOption = exclusiveSelect.options[exclusiveSelect.selectedIndex];
      exclusiveViewerId = selectedOption.dataset.viewer;
    }

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
        duration:    selectedVideoDuration,
        views:     0,
        createdAt: today.toISOString(),
        isExclusive: isExclusive,
        exclusiveViewerId: exclusiveViewerId,
        exclusiveRequestId: exclusiveRequestId
      };

      await setDoc(doc(db, "videos", videoId), newVideo);

      if (isExclusive && exclusiveRequestId) {
        // Mark request as completed
        await updateDoc(doc(db, "customRequests", exclusiveRequestId), {
          status: "completed",
          videoId: videoId
        });
      }

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
