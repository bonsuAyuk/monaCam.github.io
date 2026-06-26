import { auth, db } from "./db-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, getDoc, doc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const creatorId = urlParams.get("creator");

  onAuthStateChanged(auth, async (user) => {
    if (window.updateNavAuthUI) window.updateNavAuthUI(user);
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    if (creatorId) {
      // Viewer is visiting a specific creator to request a video
      await loadCreatorProfile(creatorId, user);
    } else {
      // Viewer is viewing their hub
      await loadMyRequests(user);
      await loadMyExclusiveVideos(user);
    }
  });

  // Modal logic
  const requestModal = document.getElementById("request-modal");
  document.getElementById("btn-open-request-modal")?.addEventListener("click", () => {
    requestModal.style.display = "flex";
  });
  document.getElementById("close-request-modal")?.addEventListener("click", () => {
    requestModal.style.display = "none";
  });
});

async function loadCreatorProfile(creatorId, currentUser) {
  document.getElementById("creator-profile-view").style.display = "block";
  document.getElementById("my-requests-section").style.display = "none";
  document.getElementById("my-exclusive-videos-section").style.display = "none";
  document.getElementById("hub-title").innerText = "Request a Video";
  document.getElementById("hub-desc").innerText = "Fill out the form below to request custom content.";

  let creatorName = "Unknown Creator";
  try {
    const creatorDoc = await getDoc(doc(db, "users", creatorId));
    if (creatorDoc.exists()) {
      const data = creatorDoc.data();
      creatorName = data.displayName || "Unknown Creator";
      document.getElementById("cp-name").innerText = creatorName;
      document.getElementById("cp-avatar").src = data.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80";
      document.getElementById("cp-handle").innerText = data.creatorProfile?.handle || `@${creatorName.toLowerCase().replace(/\s+/g, '')}`;
    }
  } catch (error) {
    console.error("Error loading creator:", error);
  }

  const form = document.getElementById("custom-request-form");
  const submitBtn = document.getElementById("btn-submit-request");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    submitBtn.disabled = true;

    try {
      await addDoc(collection(db, "customRequests"), {
        viewerId: currentUser.uid,
        viewerName: currentUser.displayName || "Viewer",
        creatorId: creatorId,
        creatorName: creatorName,
        description: document.getElementById("req-desc").value,
        offeredPriceFCFA: Number(document.getElementById("req-price").value),
        status: "pending",
        createdAt: serverTimestamp()
      });
      alert("Custom video request sent successfully!");
      window.location.href = "exclusives.html";
    } catch (error) {
      console.error("Error sending request:", error);
      alert("Failed to send request. Please try again.");
      submitBtn.innerHTML = 'Send Request';
      submitBtn.disabled = false;
    }
  });
}

async function loadMyRequests(currentUser) {
  const requestsList = document.getElementById("requests-list");
  
  try {
    const q = query(
      collection(db, "customRequests"),
      where("viewerId", "==", currentUser.uid)
    );
    const snap = await getDocs(q);
    
    if (snap.empty) {
      requestsList.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">You haven't made any custom requests yet.</p>`;
      return;
    }

    requestsList.innerHTML = "";
    snap.forEach(doc => {
      const r = doc.data();
      const card = document.createElement("div");
      card.className = "card glass";
      card.style.padding = "20px";
      card.style.borderRadius = "16px";
      
      let statusColor = "var(--text-secondary)";
      if (r.status === "accepted") statusColor = "var(--success)";
      if (r.status === "rejected") statusColor = "var(--danger)";
      if (r.status === "completed") statusColor = "var(--primary)";

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <strong style="font-size:18px;">To: ${r.creatorName}</strong>
          <span style="color:${statusColor}; font-weight:bold; text-transform:uppercase; font-size:12px;">${r.status}</span>
        </div>
        <p style="color:var(--text-secondary); font-size:14px; margin-bottom:16px;">${r.description}</p>
        <div style="font-family:var(--font-display); font-weight:700;">Offer: ${r.offeredPriceFCFA.toLocaleString()} FCFA</div>
      `;
      requestsList.appendChild(card);
    });
  } catch (error) {
    console.error("Error loading requests:", error);
    requestsList.innerHTML = `<p style="color:var(--danger);">Error loading requests.</p>`;
  }
}

async function loadMyExclusiveVideos(currentUser) {
  const grid = document.getElementById("exclusive-videos-grid");
  
  try {
    const q = query(
      collection(db, "videos"),
      where("exclusiveViewerId", "==", currentUser.uid),
      where("isExclusive", "==", true)
    );
    const snap = await getDocs(q);
    
    if (snap.empty) {
      grid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">No completed exclusive videos found.</p>`;
      return;
    }

    grid.innerHTML = "";
    snap.forEach(docSnap => {
      const v = docSnap.data();
      const videoId = docSnap.id;
      
      const card = document.createElement("a");
      card.href = `video.html?id=${videoId}`;
      card.className = "video-card";
      card.style.textDecoration = "none";
      card.style.display = "block";
      
      card.innerHTML = `
        <div class="video-thumbnail-container">
          <img src="${v.thumbnailUrl || 'https://placehold.co/640x360?text=No+Thumbnail'}" class="video-thumbnail" alt="${v.title}">
          <div class="video-duration">${v.duration || '0:00'}</div>
          <div class="video-price-tag" style="background:var(--primary); color:white;">
            <i class="fa-solid fa-lock"></i> Exclusive
          </div>
        </div>
        <div class="video-info">
          <h3 class="video-title">${v.title}</h3>
          <div class="video-creator">${v.creatorName}</div>
          <div class="video-meta">
            <span><i class="fa-solid fa-eye"></i> ${v.views || 0} views</span>
            <span><i class="fa-solid fa-money-bill"></i> ${v.priceFCFA ? v.priceFCFA.toLocaleString() + ' FCFA' : 'Free'}</span>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (error) {
    console.error("Error loading exclusive videos:", error);
    grid.innerHTML = `<p style="color:var(--danger);">Error loading exclusive videos.</p>`;
  }
}
