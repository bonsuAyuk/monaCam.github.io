import { db, auth, onAuthStateChanged, collection, query, orderBy, limit, getDocs, getDoc, doc, where, startAfter } from "./db-config.js";

let lastVisible = null;
let currentSort = "newest";
let currentCategory = "all";
let currentSearch = "";
let isFetching = false;
let hasMore = true;
let userProfile = null;
let currentUser = null;

const videosGrid = document.getElementById("videos-grid");
const emptyState = document.getElementById("empty-state");
const loadingSpinner = document.getElementById("loading-spinner");

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const creatorId = urlParams.get("creator");

  onAuthStateChanged(auth, async (user) => {
    if (window.updateNavAuthUI) window.updateNavAuthUI(user);
    currentUser = user;
    if (user) {
      try {
        const pDoc = await getDoc(doc(db, "users", user.uid));
        if (pDoc.exists()) userProfile = pDoc.data();
      } catch (e) { console.error("Error loading profile", e); }
    }
    
    // Initial fetch
    await fetchCategories();
    await fetchFeaturedCreators();
    await loadVideos(true);
  });

  // Filters setup
  document.getElementById("sort-filter")?.addEventListener("change", (e) => {
    currentSort = e.target.value;
    loadVideos(true);
  });
  
  document.getElementById("search-bar")?.addEventListener("input", debounce((e) => {
    currentSearch = e.target.value.toLowerCase();
    loadVideos(true);
  }, 500));

  document.getElementById("clear-filters-btn")?.addEventListener("click", () => {
    currentCategory = "all";
    currentSearch = "";
    document.getElementById("search-bar").value = "";
    const catList = document.getElementById("categories-list");
    if (catList) catList.value = "all";
    loadVideos(true);
  });

  // Infinite Scroll
  window.addEventListener("scroll", debounce(() => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      if (!isFetching && hasMore) loadVideos(false);
    }
  }, 200));
});

// Category dropdown listener
document.getElementById("categories-list")?.addEventListener("change", (e) => {
  currentCategory = e.target.value;
  loadVideos(true);
});

async function fetchCategories() {
  try {
    const snap = await getDocs(collection(db, "categories"));
    if (!snap.empty) {
      const list = document.getElementById("categories-list");
      if (!list) return;
      let html = '<option value="all">All Content</option>';
      snap.forEach(doc => {
        const cat = doc.data();
        html += `<option value="${doc.id}">${cat.name}</option>`;
      });
      list.innerHTML = html;
    }
  } catch(e) { console.error(e); }
}

async function fetchFeaturedCreators() {
  const container = document.getElementById("featured-creators-list");
  if (!container) return;
  try {
    const q = query(collection(db, "users"), where("role", "==", "creator"), limit(10));
    const snap = await getDocs(q);
    let html = "";
    snap.forEach(d => {
      const creator = d.data();
      const videosCount = creator.creatorProfile?.totalVideos || creator.creatorProfile?.weeklyUploadCount || 0;
      html += `
        <a href="exclusives.html?creator=${d.id}" class="creator-card" style="text-decoration:none;">
          <img src="${creator.photoURL || 'https://placehold.co/80'}" class="creator-avatar" alt="${creator.displayName}">
          <h3 class="creator-name">${creator.displayName} <i class="fa-solid fa-circle-check text-gradient" style="font-size: 12px;"></i></h3>
          <p class="creator-meta">${videosCount} Videos</p>
        </a>
      `;
    });
    container.innerHTML = html || '<p style="color:var(--text-muted);">No creators found.</p>';
  } catch (e) { console.error("Error loading featured", e); }
}

async function loadVideos(reset = false) {
  if (isFetching) return;
  isFetching = true;
  if (reset) {
    videosGrid.innerHTML = "";
    lastVisible = null;
    hasMore = true;
    emptyState.style.display = "none";
  }
  if (loadingSpinner) loadingSpinner.style.display = "block";

  try {
    const videosRef = collection(db, "videos");
    let constraints = [where("status", "==", "approved")];
    
    if (currentCategory !== "all") constraints.push(where("category", "==", currentCategory));

    // Sort order
    if (currentSort === "newest") constraints.push(orderBy("createdAt", "desc"));
    if (currentSort === "popular") constraints.push(orderBy("views", "desc"));
    if (currentSort === "oldest") constraints.push(orderBy("createdAt", "asc"));
    if (currentSort === "price-low") constraints.push(orderBy("priceFCFA", "asc"));
    if (currentSort === "price-high") constraints.push(orderBy("priceFCFA", "desc"));

    constraints.push(limit(30)); // Increased limit slightly to account for client-side filtering

    if (lastVisible && !reset) {
      constraints.push(startAfter(lastVisible));
    }

    const q = query(videosRef, ...constraints);
    const snapshot = await getDocs(q);

    if (snapshot.empty && reset) {
      emptyState.style.display = "flex";
      hasMore = false;
    } else if (snapshot.empty) {
      hasMore = false;
    } else {
      let videosHTML = "";
      snapshot.forEach(docSnap => {
        const video = docSnap.data();
        
        // Client-side filtering
        if (currentSearch && !video.title.toLowerCase().includes(currentSearch)) return;
        if (video.isExclusive === true) return; // Hide exclusives (handles older videos missing the field)

        videosHTML += `
          <a href="video.html?id=${docSnap.id}" class="video-card">
            <div class="video-thumbnail-container">
              <img src="${video.thumbnailUrl || 'https://placehold.co/640x360?text=No+Thumbnail'}" class="video-thumbnail" alt="${video.title}">
              <div class="video-duration">${video.duration || '0:00'}</div>
              <div class="video-price-tag">
                <i class="fa-solid fa-money-bill"></i> ${video.priceFCFA ? video.priceFCFA.toLocaleString() + ' FCFA' : 'Free'}
              </div>
            </div>
            <div class="video-info">
              <h3 class="video-title">${video.title}</h3>
              <div class="video-creator">${video.creatorName}</div>
              <div class="video-meta">
                <span><i class="fa-solid fa-eye"></i> ${video.views || 0} views</span>
              </div>
            </div>
          </a>
        `;
      });
      videosGrid.insertAdjacentHTML('beforeend', videosHTML);
      lastVisible = snapshot.docs[snapshot.docs.length - 1];
    }
  } catch (error) {
    console.error("Error fetching videos:", error);
  } finally {
    isFetching = false;
    if (loadingSpinner) loadingSpinner.style.display = "none";
  }
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
