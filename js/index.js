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

  // Filters setup - Custom Dropdown Logic
  function setupDropdown(wrapperId, triggerId, optionsId, onSelect) {
    const wrapper = document.getElementById(wrapperId);
    const trigger = document.getElementById(triggerId);
    const optionsContainer = document.getElementById(optionsId);
    if (!wrapper || !trigger || !optionsContainer) return;
    
    const textSpan = trigger.querySelector('.custom-select-text');
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close others
      document.querySelectorAll('.custom-select.open').forEach(el => {
        if (el !== trigger) el.classList.remove('open');
      });
      trigger.classList.toggle('open');
    });
    
    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.custom-option');
      if (!option) return;
      if (option.id === 'loading-categories-text') return; // prevent selecting loader
      
      optionsContainer.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      textSpan.textContent = option.textContent;
      trigger.classList.remove('open');
      
      onSelect(option.dataset.value);
    });
  }

  setupDropdown('sort-wrapper', 'sort-trigger', 'sort-options', (val) => {
    currentSort = val;
    loadVideos(true);
  });

  setupDropdown('categories-wrapper', 'categories-trigger', 'categories-options', (val) => {
    currentCategory = val;
    loadVideos(true);
  });
  
  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach(el => el.classList.remove('open'));
  });
  
  document.getElementById("search-bar")?.addEventListener("input", debounce((e) => {
    currentSearch = e.target.value.toLowerCase();
    loadVideos(true);
  }, 500));

  document.getElementById("clear-filters-btn")?.addEventListener("click", () => {
    currentCategory = "all";
    currentSearch = "";
    document.getElementById("search-bar").value = "";
    
    const catOptions = document.getElementById("categories-options");
    if (catOptions) {
      catOptions.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
      const allOpt = catOptions.querySelector('[data-value="all"]');
      if (allOpt) allOpt.classList.add('selected');
      const textSpan = document.querySelector('#categories-trigger .custom-select-text');
      if (textSpan) textSpan.textContent = "All Content";
    }
    loadVideos(true);
  });

  // Infinite Scroll
  window.addEventListener("scroll", debounce(() => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      if (!isFetching && hasMore) loadVideos(false);
    }
  }, 200));
});

// (Old Category dropdown listener removed)

async function fetchCategories() {
  try {
    const snap = await getDocs(collection(db, "categories"));
    if (!snap.empty) {
      const list = document.getElementById("categories-options");
      if (!list) return;
      let html = '<div class="custom-option selected" data-value="all">All Content</div>';
      snap.forEach(doc => {
        const cat = doc.data();
        html += `<div class="custom-option" data-value="${doc.id}">${cat.name}</div>`;
      });
      list.innerHTML = html;
      
      // Keep selected state if category was pre-selected
      if (currentCategory !== "all") {
        list.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
        const activeOpt = list.querySelector(`[data-value="${currentCategory}"]`);
        if (activeOpt) {
          activeOpt.classList.add('selected');
          document.querySelector('#categories-trigger .custom-select-text').textContent = activeOpt.textContent;
        }
      }
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
        window.loadedVideos = window.loadedVideos || {};
        window.loadedVideos[docSnap.id] = video;

        videosHTML += `
          <a href="video.html?id=${docSnap.id}" class="video-card" onclick="sessionStorage.setItem('preloaded_video_${docSnap.id}', JSON.stringify(window.loadedVideos['${docSnap.id}']))">
            <div class="video-thumbnail-container">
              <img src="${video.thumbDriveId ? `https://lh3.googleusercontent.com/d/${video.thumbDriveId}` : (video.thumbnailUrl || 'https://placehold.co/640x360?text=No+Thumbnail')}" class="video-thumbnail" alt="${video.title}" loading="lazy">
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

