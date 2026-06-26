// Marketplace Controller Page Logic
import { 
  db, 
  auth, 
  onAuthStateChanged, 
  collection, 
  query, 
  where, 
  getDocs, 
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

// Cameroonian Premium Mock Data (fallback if Firebase is not yet connected/empty)
const MOCK_FEATURED_CREATORS = [
  {
    uid: "creator_1",
    displayName: "Chevalier Ndole",
    handle: "@ndole_master",
    subscribersCount: "12.4K",
    videosCount: 42,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
  },
  {
    uid: "creator_2",
    displayName: "Murielle Comedy",
    handle: "@muri_laughs",
    subscribersCount: "28.1K",
    videosCount: 68,
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80"
  },
  {
    uid: "creator_3",
    displayName: "Xavier Music CM",
    handle: "@xavier_sounds",
    subscribersCount: "5.8K",
    videosCount: 15,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
  },
  {
    uid: "creator_4",
    displayName: "Tech Savvy Cameroon",
    handle: "@tech_cameroon",
    subscribersCount: "8.2K",
    videosCount: 31,
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
  }
];

const MOCK_VIDEOS = [
  {
    videoId: "vid_1",
    title: "How to Cook Perfect Cameroonian Ndole",
    description: "The ultimate guide to preparing Ndole with bitterleaves, groundnuts, beef, and prawns.",
    priceFCFA: 1500,
    category: "culinary",
    views: 1240,
    duration: "18:45",
    creatorName: "Chevalier Ndole",
    creatorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80",
    thumbnail: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=500&q=80",
    createdAt: new Date(Date.now() - 3600000 * 24 * 2) // 2 days ago
  },
  {
    videoId: "vid_2",
    title: "La Famille Camerounaise - Episode 5 (Comedy)",
    description: "Hilarious home jokes that everyone in Cameroon knows too well. Get ready to laugh!",
    priceFCFA: 500,
    category: "comedy",
    views: 4890,
    duration: "12:10",
    creatorName: "Murielle Comedy",
    creatorAvatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=80&q=80",
    thumbnail: "https://images.unsplash.com/photo-1516280440614-37939bbacd6a?auto=format&fit=crop&w=500&q=80",
    createdAt: new Date(Date.now() - 3600000 * 4) // 4 hours ago
  },
  {
    videoId: "vid_3",
    title: "Afrobeat Guitar Masterclass for Beginners",
    description: "Learn to play local makossa, bikutsi and modern afrobeat patterns on the guitar.",
    priceFCFA: 3000,
    category: "music",
    views: 840,
    duration: "45:30",
    creatorName: "Xavier Music CM",
    creatorAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&q=80",
    thumbnail: "https://images.unsplash.com/photo-1510915228340-29c85a43dcfe?auto=format&fit=crop&w=500&q=80",
    createdAt: new Date(Date.now() - 3600000 * 24 * 5) // 5 days ago
  },
  {
    videoId: "vid_4",
    title: "Cameroon's Tech Ecosystem: Opportunities in Douala & Yaounde",
    description: "A comprehensive analysis of software development, mobile money API integrations, and tech startups.",
    priceFCFA: 0, // Free preview or subscription pass only
    category: "education",
    views: 310,
    duration: "24:15",
    creatorName: "Tech Savvy Cameroon",
    creatorAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=80",
    thumbnail: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=500&q=80",
    createdAt: new Date(Date.now() - 3600000 * 24) // 1 day ago
  },
  {
    videoId: "vid_5",
    title: "Douala City Tour - Vlog",
    description: "Taking a look at Bonanjo, Akwa, and the vibrant street foods at night.",
    priceFCFA: 1000,
    category: "lifestyle",
    views: 2200,
    duration: "15:20",
    creatorName: "Tech Savvy Cameroon",
    creatorAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=80",
    thumbnail: "https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=500&q=80",
    createdAt: new Date(Date.now() - 3600000 * 24 * 10) // 10 days ago
  },
  {
    videoId: "vid_6",
    title: "Cooking Eru & Waterfufu - Step by Step",
    description: "Learn how to prepare clean Eru with skin, meat, and crayfish.",
    priceFCFA: 2000,
    category: "culinary",
    views: 1890,
    duration: "22:40",
    creatorName: "Chevalier Ndole",
    creatorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80",
    thumbnail: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80",
    createdAt: new Date(Date.now() - 3600000 * 24 * 7) // 7 days ago
  }
];

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
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is logged in
      // Fetch user role from localStorage or Firestore (fallback to local mock role)
      const userRole = localStorage.getItem("userRole") || "viewer";
      let dashboardUrl = "viewer-dashboard.html";
      if (userRole === "creator") dashboardUrl = "creator-dashboard.html";
      if (userRole === "admin") dashboardUrl = "admin-dashboard.html";

      navDashboardLinkContainer.innerHTML = `<a href="${dashboardUrl}" class="nav-link">Dashboard</a>`;
      
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
    
    // Attempt to read from Firestore if project initialized
    let creators = [];
    try {
      const q = query(
        collection(db, "users"), 
        where("role", "==", "creator"), 
        where("creatorProfile.featured", "==", true), 
        limit(4)
      );
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => {
        const d = doc.data();
        creators.push({
          uid: d.uid,
          displayName: d.displayName,
          handle: d.creatorProfile?.handle || `@${d.displayName.toLowerCase().replace(/\s+/g, '')}`,
          subscribersCount: "0",
          videosCount: d.creatorProfile?.weeklyUploadCount || 0,
          avatar: d.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
        });
      });
    } catch (dbErr) {
      console.warn("Firestore not active or config is missing API key. Falling back to mock creators.");
    }

    if (creators.length === 0) {
      creators = MOCK_FEATURED_CREATORS;
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
          <span><strong>${creator.subscribersCount}</strong> Subs</span>
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

      if (currentCategory !== "all") {
        conditions.push(where("category", "==", currentCategory));
      }

      // Add ordering logic based on sort filter
      if (currentSort === "newest") {
        conditions.push(orderBy("createdAt", "desc"));
      } else if (currentSort === "popular") {
        conditions.push(orderBy("views", "desc"));
      } else if (currentSort === "price-low") {
        conditions.push(orderBy("priceFCFA", "asc"));
      } else if (currentSort === "price-high") {
        conditions.push(orderBy("priceFCFA", "desc"));
      }

      if (lastVisibleDoc) {
        q = query(q, ...conditions, startAfter(lastVisibleDoc), limit(8));
      } else {
        q = query(q, ...conditions, limit(8));
      }

      const snapshot = await getDocs(q);
      if (snapshot.docs.length > 0) {
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
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
            thumbnail: d.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=500&q=80"
          });
        });
      }
      if (snapshot.docs.length < 8) {
        hasMore = false;
      }
    } catch (dbErr) {
      console.warn("Firestore config not configured. Falling back to local mock videos.");
    }

    // Fallback Mock loading logic
    if (videos.length === 0 && isReset) {
      // Filter mock videos locally
      let filtered = [...MOCK_VIDEOS];
      if (currentCategory !== "all") {
        filtered = filtered.filter(v => v.category === currentCategory);
      }
      if (currentSearch) {
        filtered = filtered.filter(v => 
          v.title.toLowerCase().includes(currentSearch.toLowerCase()) ||
          v.description.toLowerCase().includes(currentSearch.toLowerCase()) ||
          v.creatorName.toLowerCase().includes(currentSearch.toLowerCase())
        );
      }

      // Sort mocks
      if (currentSort === "newest") {
        filtered.sort((a, b) => b.createdAt - a.createdAt);
      } else if (currentSort === "popular") {
        filtered.sort((a, b) => b.views - a.views);
      } else if (currentSort === "price-low") {
        filtered.sort((a, b) => a.priceFCFA - b.priceFCFA);
      } else if (currentSort === "price-high") {
        filtered.sort((a, b) => b.priceFCFA - a.priceFCFA);
      }

      videos = filtered;
      hasMore = false; // Mock data is single page
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
