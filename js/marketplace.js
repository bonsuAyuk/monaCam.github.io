// Marketplace Controller Page Logic
import { 
  db, 
  auth, 
  onAuthStateChanged, 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  doc,
  limit, 
  orderBy, 
  startAfter 
} from "./db-config.js";

// Page State Variables
let lastVisibleDoc = null;
let isLoading = false;
let hasMore = true;
let currentCategory = "all";
let currentSearch = "";
let currentSort = "newest";

// DOM Elements
const videoGrid = document.getElementById("video-grid-container");
const featuredCreatorsList = document.getElementById("featured-creators-list");
const searchBar = document.getElementById("search-bar");
const categoriesList = document.getElementById("categories-list");
const sortFilter = document.getElementById("sort-filter");
const loadingSpinner = document.getElementById("loading-spinner");
const infiniteTrigger = document.getElementById("infinite-scroll-trigger");
const authNavActions = document.getElementById("auth-nav-actions");
const navDashboardLinkContainer = document.getElementById("nav-dashboard-link-container");

// Mock data removed in favor of real Firestore data

// Initialize Page
document.addEventListener("DOMContentLoaded", async () => {
  setupAuthObserver();
  loadFeaturedCreators();
  await loadCategories();
  loadVideos(true); // Reset and load first page
  setupFilters();
  setupInfiniteScroll();
});

// Load Categories
async function loadCategories() {
  const loadingText = document.getElementById("loading-categories-text");
  try {
    const querySnapshot = await getDocs(collection(db, "categories"));
    if (loadingText) loadingText.remove();
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const pill = document.createElement("span");
      pill.className = "category-pill";
      pill.dataset.category = docSnap.id;
      pill.textContent = data.name;
      categoriesList.appendChild(pill);
    });
  } catch (err) {
    console.error("Error loading categories:", err);
    if (loadingText) loadingText.textContent = "Error loading categories.";
  }
}

// Setup auth observer to change navbar dynamically
function setupAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is logged in
      let userRole = "viewer";
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          userRole = userDoc.data().role || "viewer";
          localStorage.setItem("userRole", userRole); // Cache it
        }
      } catch (e) {
        userRole = localStorage.getItem("userRole") || "viewer";
      }

      let dashboardUrl = "";
      if (userRole === "creator") dashboardUrl = "creator-dashboard.html";
      if (userRole === "admin") dashboardUrl = "admin-dashboard.html";

      if (dashboardUrl) {
        navDashboardLinkContainer.innerHTML = `<a href="${dashboardUrl}" class="nav-link">Dashboard</a>`;
      } else {
        navDashboardLinkContainer.innerHTML = "";
      }
      
      authNavActions.innerHTML = `
        <div style="display:flex; align-items:center; gap: 12px;">
          <a href="profile.html" style="display:flex; align-items:center; gap:8px;">
            <div style="width: 36px; height: 36px; border-radius:50%; background: var(--bg-tertiary); display:flex; align-items:center; justify-content:center; border: 1px solid var(--card-border);">
              <i class="fa-solid fa-user" style="font-size:14px; color: var(--primary);"></i>
            </div>
            <span style="font-size: 14px; font-weight:600; color:var(--text-primary); cursor:pointer;">My Account</span>
          </a>
          <button id="logout-btn" class="btn btn-secondary btn-sm"><i class="fa-solid fa-right-from-bracket"></i></button>
        </div>
      `;

      document.getElementById("logout-btn")?.addEventListener("click", () => {
        auth.signOut().then(() => {
          localStorage.removeItem("userRole");
          window.location.reload();
        });
      });
    } else {
      // Logged out
      navDashboardLinkContainer.innerHTML = "";
      authNavActions.innerHTML = `
        <a href="login.html" class="btn btn-ghost">Log In</a>
        <a href="register.html" class="btn btn-primary">Join as Creator</a>
      `;
    }
  });
}

// Load Featured Creators
async function loadFeaturedCreators() {
  try {
    featuredCreatorsList.innerHTML = "";
    
    // Attempt to read from Firestore
    let creators = [];
    try {
      // First try to get manually featured creators
      let q = query(
        collection(db, "users"), 
        where("role", "==", "creator"), 
        where("featured", "==", true), 
        limit(4)
      );
      let snapshot = await getDocs(q);
      
      // If none found, just grab any 4 creators to populate the section
      if (snapshot.empty) {
        q = query(
          collection(db, "users"), 
          where("role", "==", "creator"), 
          limit(4)
        );
        snapshot = await getDocs(q);
      }

      snapshot.forEach(doc => {
        const d = doc.data();
        creators.push({
          uid: d.uid || doc.id,
          displayName: d.displayName || "Unknown Creator",
          handle: d.creatorProfile?.handle || `@${(d.displayName || 'creator').toLowerCase().replace(/\s+/g, '')}`,
          subscribersCount: "0",
          videosCount: d.creatorProfile?.totalVideos || d.creatorProfile?.weeklyUploadCount || 0,
          avatar: d.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
        });
      });
    } catch (dbErr) {
      console.warn("Featured creators query failed (possibly missing index), falling back to simple query...", dbErr);
      // Fallback if composite index is missing
      try {
        const fallbackQ = query(collection(db, "users"), where("role", "==", "creator"), limit(4));
        const fallbackSnap = await getDocs(fallbackQ);
        fallbackSnap.forEach(doc => {
          const d = doc.data();
          creators.push({
            uid: d.uid || doc.id,
            displayName: d.displayName || "Unknown Creator",
            handle: d.creatorProfile?.handle || `@${(d.displayName || 'creator').toLowerCase().replace(/\s+/g, '')}`,
            subscribersCount: "0",
            videosCount: d.creatorProfile?.totalVideos || d.creatorProfile?.weeklyUploadCount || 0,
            avatar: d.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
          });
        });
      } catch (e) {
        console.error("Complete failure loading creators:", e);
      }
    }

    creators.forEach(creator => {
      const card = document.createElement("div");
      card.className = "creator-card";
      card.addEventListener("click", () => {
        window.location.href = `marketplace.html?creator=${creator.uid}`;
      });

      card.innerHTML = `
        <img src="${creator.avatar}" class="creator-avatar" alt="${creator.displayName}">
        <h3 class="creator-name">${creator.displayName} <i class="fa-solid fa-circle-check text-gradient" style="font-size: 12px; margin-left: 2px;"></i></h3>
        <p class="creator-handle">${creator.handle}</p>
        <div class="creator-meta">
          <span><strong>${creator.videosCount}</strong> Videos</span>
        </div>
      `;
      featuredCreatorsList.appendChild(card);
    });
  } catch (error) {
    console.error("Error loading creators:", error);
  }
}

// Load Videos
async function loadVideos(isReset = false) {
  if (isLoading) return;
  isLoading = true;
  loadingSpinner.style.display = "block";

  if (isReset) {
    videoGrid.innerHTML = "";
    lastVisibleDoc = null;
    hasMore = true;
  }

  try {
    let videos = [];
    
    // Attempt Firestore Fetch
    try {
      let q = collection(db, "videos");
      let conditions = [where("status", "==", "approved")];

      // Add ordering logic based on sort filter - BYPASSED to avoid Firestore Composite Index errors
      // We will fetch all matching videos (up to 50) and sort client-side.
      q = query(q, ...conditions, limit(50));

      const snapshot = await getDocs(q);
      if (snapshot.docs.length > 0) {
        snapshot.forEach(doc => {
          const d = doc.data();
          videos.push({
            videoId: doc.id,
            title: d.title,
            description: d.description,
            priceFCFA: d.priceFCFA,
            category: d.category,
            views: d.views || 0,
            duration: d.duration || "10:00",
            creatorName: d.creatorName || "Anonymous Creator",
            creatorAvatar: d.creatorAvatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80",
            thumbnail: d.thumbDriveId ? `https://drive.google.com/uc?export=view&id=${d.thumbDriveId}` : (d.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=500&q=80"),
            createdAt: d.createdAt // Need this for newest sort
          });
        });
      }
      hasMore = false; // Disabled pagination due to client-side sorting
    } catch (dbErr) {
      console.error("Firestore error loading videos:", dbErr);
    }

    // Client-side filtering (Category & Search)
    if (videos.length > 0) {
      // Filter by category
      if (currentCategory !== "all") {
        videos = videos.filter(v => v.category === currentCategory);
      }
      
      // Filter by search
      if (currentSearch) {
        videos = videos.filter(v => 
          (v.title && v.title.toLowerCase().includes(currentSearch.toLowerCase())) ||
          (v.description && v.description.toLowerCase().includes(currentSearch.toLowerCase())) ||
          (v.creatorName && v.creatorName.toLowerCase().includes(currentSearch.toLowerCase()))
        );
      }
    }

    // Client-side sorting
    if (videos.length > 0) {
      if (currentSort === "newest") {
        videos.sort((a, b) => b.createdAt - a.createdAt);
      } else if (currentSort === "popular") {
        videos.sort((a, b) => b.views - a.views);
      } else if (currentSort === "price-low") {
        videos.sort((a, b) => a.priceFCFA - b.priceFCFA);
      } else if (currentSort === "price-high") {
        videos.sort((a, b) => b.priceFCFA - a.priceFCFA);
      }
    }

    if (videos.length === 0) {
      if (isReset) {
        videoGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
            <i class="fa-regular fa-folder-open" style="font-size: 48px; margin-bottom: 16px; color: var(--text-muted);"></i>
            <h3>No Videos Found</h3>
            <p style="margin-top: 8px;">Try adjusting your keywords or category filters.</p>
          </div>
        `;
      }
    } else {
      videos.forEach(video => {
        const card = document.createElement("div");
        card.className = "video-card";
        card.addEventListener("click", () => {
          window.location.href = `video.html?id=${video.videoId}`;
        });

        const priceLabel = video.priceFCFA === 0 
          ? `<span class="price-tag premium-pass"><i class="fa-solid fa-ticket"></i> Premium Pass</span>` 
          : `<span class="price-tag">${video.priceFCFA.toLocaleString()} FCFA</span>`;

        card.innerHTML = `
          <div class="video-thumbnail-container">
            <img src="${video.thumbnail}" class="video-thumbnail" alt="${video.title}" loading="lazy">
            <div class="thumbnail-overlay">
              <span class="video-duration">${video.duration}</span>
              ${priceLabel}
            </div>
          </div>
          <div class="video-details">
            <div class="video-meta-top">
              <span>${video.category}</span>
              <span><i class="fa-solid fa-eye"></i> ${video.views.toLocaleString()}</span>
            </div>
            <h3 class="video-title" title="${video.title}">${video.title}</h3>
            <div class="video-creator-info">
              <img src="${video.creatorAvatar}" class="creator-micro-avatar" alt="${video.creatorName}">
              <span class="creator-micro-name">${video.creatorName}</span>
              <i class="fa-solid fa-circle-check creator-verified-icon"></i>
            </div>
          </div>
        `;
        videoGrid.appendChild(card);
      });
    }
  } catch (error) {
    console.error("Error processing video load:", error);
  } finally {
    isLoading = false;
    loadingSpinner.style.display = "none";
    if (!hasMore) {
      infiniteTrigger.style.display = "none";
    } else {
      infiniteTrigger.style.display = "flex";
    }
  }
}

// Setup Event Listeners for Filters
function setupFilters() {
  // Category Pill Clicks
  categoriesList.addEventListener("click", (e) => {
    const pill = e.target.closest(".category-pill");
    if (!pill) return;

    document.querySelectorAll(".category-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    
    currentCategory = pill.dataset.category;
    loadVideos(true);
  });

  // Sort Selection Changes
  sortFilter.addEventListener("change", (e) => {
    currentSort = e.target.value;
    loadVideos(true);
  });

  // Search Input Handler (with debouncer)
  let searchTimeout;
  searchBar.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value;
      loadVideos(true);
    }, 450);
  });
}

// Setup Infinite Scroll via Intersection Observer
function setupInfiniteScroll() {
  const observer = new IntersectionObserver((entries) => {
    const target = entries[0];
    if (target.isIntersecting && hasMore && !isLoading) {
      loadVideos(false);
    }
  }, {
    root: null,
    rootMargin: "100px",
    threshold: 0.1
  });

  observer.observe(infiniteTrigger);
}
