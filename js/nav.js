/**
 * nav.js — Shared navigation logic
 * Handles: hamburger toggle, mobile drawer, active link highlighting
 * Include as: <script src="js/nav.js"></script> (plain script, not module)
 */
(function () {
  window.performLogout = function() {
    import("./auth.js").then(function(module) {
      module.signOutUser();
    }).catch(function(err) {
      console.error("Logout dynamic import error:", err);
      // Direct fallback just in case
      import("./db-config.js").then(function(dbModule) {
        dbModule.signOut(dbModule.auth).then(function() {
          window.location.href = "index.html";
        });
      });
    });
  };

  window.updateNavAuthUI = function(user) {
    const dashboardLink = document.getElementById("nav-dashboard-link-container");
    const authActions = document.getElementById("auth-nav-actions");
    const exclusivesLink = document.querySelector('a.nav-link[href="exclusives.html"]');
    
    const mobileExclusivesLink = document.querySelector('a.mobile-nav-link[href="exclusives.html"]');
    
    if (user) {
      if (exclusivesLink) exclusivesLink.style.display = "inline-block";
      if (mobileExclusivesLink) mobileExclusivesLink.style.display = "block";
      const role = localStorage.getItem("userRole") || "viewer";
      let url = "viewer-dashboard.html";
      if (role === "creator") url = "creator-dashboard.html";
      if (role === "admin") url = "admin-dashboard.html";
      
      if (dashboardLink) dashboardLink.innerHTML = `<a href="${url}" class="nav-link">Dashboard</a>`;
      
      const mDashLinks = document.querySelectorAll('.mobile-nav-link');
      mDashLinks.forEach(a => {
        if (a.textContent.includes("Dashboard")) {
          a.style.display = "block";
          a.href = url;
        }
      });

      if (authActions) authActions.innerHTML = `
        <a href="profile.html" class="btn btn-secondary"><i class="fa-solid fa-user"></i> My Profile</a>
        <button onclick="window.performLogout()" class="btn btn-ghost" style="border: none; cursor: pointer; color: var(--danger);"><i class="fa-solid fa-right-from-bracket"></i> Log Out</button>
      `;
      
      if (window.updateMobileNavAuth) {
        window.updateMobileNavAuth(`
          <a href="profile.html" class="btn btn-secondary" style="justify-content:flex-start; width:100%; margin-bottom:10px;">
            <i class="fa-solid fa-user"></i> My Profile
          </a>
          <button onclick="window.performLogout()" class="btn btn-ghost" style="justify-content:flex-start; width:100%; color:var(--danger); text-align:left; border: none; background: transparent; padding: 12px 16px; font-size: 15px; cursor: pointer; display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-right-from-bracket"></i> Log Out
          </button>
        `);
      }
    } else {
      if (exclusivesLink) exclusivesLink.style.display = "none";
      if (mobileExclusivesLink) mobileExclusivesLink.style.display = "none";
      if (dashboardLink) dashboardLink.innerHTML = "";
      
      const mDashLinks = document.querySelectorAll('.mobile-nav-link');
      mDashLinks.forEach(a => {
        if (a.textContent.includes("Dashboard")) {
          a.style.display = "none";
        }
      });

      if (authActions) authActions.innerHTML = `
        <a href="login.html" class="btn btn-ghost">Log In</a>
        <a href="register.html" class="btn btn-primary">Join as Creator</a>
      `;
      if (window.updateMobileNavAuth) {
        window.updateMobileNavAuth(`
          <a href="login.html" class="btn btn-ghost" style="justify-content:flex-start; width:100%; margin-bottom:10px;">
            <i class="fa-solid fa-right-to-bracket"></i> Log In
          </a>
          <a href="register.html" class="btn btn-primary" style="justify-content:flex-start; width:100%;">
            <i class="fa-solid fa-user-plus"></i> Join as Creator
          </a>
        `);
      }
    }
  };

  function buildMobileDrawer(links, authHTML) {
    const drawer = document.createElement("div");
    drawer.className = "mobile-nav-drawer";
    drawer.id = "mobile-nav-drawer";

    links.forEach(function (link) {
      const a = document.createElement("a");
      a.href = link.href;
      a.className = "mobile-nav-link";
      a.innerHTML = `<i class="${link.icon}"></i> ${link.label}`;
      if (link.label === "Exclusives" || link.label === "Dashboard") {
        a.style.display = "none"; // Hidden by default, unhidden by updateNavAuthUI
      }
      // Highlight active page
      if (window.location.pathname.endsWith(link.href)) {
        a.style.color = "var(--primary)";
      }
      drawer.appendChild(a);
    });

    // Divider
    const divider = document.createElement("div");
    divider.className = "mobile-nav-divider";
    drawer.appendChild(divider);

    // Auth actions
    const actions = document.createElement("div");
    actions.className = "mobile-nav-actions";
    actions.id = "mobile-auth-actions";
    actions.innerHTML = authHTML;
    drawer.appendChild(actions);

    return drawer;
  }

  function initNav() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;

    const navbarContent = navbar.querySelector(".navbar-content");
    if (!navbarContent) return;

    // --- Create hamburger button ---
    const hamburger = document.createElement("button");
    hamburger.className = "nav-hamburger";
    hamburger.id = "nav-hamburger";
    hamburger.setAttribute("aria-label", "Open menu");
    hamburger.innerHTML = "<span></span><span></span><span></span>";
    navbarContent.appendChild(hamburger);

    // --- Gather links from desktop nav ---
    const desktopLinks = Array.from(
      navbar.querySelectorAll(".nav-links .nav-link")
    ).map(function (el) {
      return { href: el.getAttribute("href"), label: el.textContent.trim(), icon: "fa-solid fa-link" };
    });
    desktopLinks.push({ href: "#", label: "Dashboard", icon: "fa-solid fa-gauge" });

    // Map icon names
    const iconMap = {
      "Home": "fa-solid fa-house",
      "Exclusives": "fa-solid fa-store",
      "Pricing Plans": "fa-solid fa-tags",
      "Dashboard": "fa-solid fa-gauge",
    };
    desktopLinks.forEach(function (l) {
      l.icon = iconMap[l.label] || "fa-solid fa-circle-dot";
    });

    // Default auth HTML (overridden by Firebase observer if present)
    const defaultAuthHTML = `
      <a href="login.html" class="btn btn-ghost" style="justify-content:flex-start; width:100%;">
        <i class="fa-solid fa-right-to-bracket"></i> Log In
      </a>
      <a href="register.html" class="btn btn-primary" style="justify-content:flex-start; width:100%;">
        <i class="fa-solid fa-user-plus"></i> Join as Creator
      </a>
    `;

    // Insert drawer into body
    const drawer = buildMobileDrawer(desktopLinks, defaultAuthHTML);
    document.body.insertBefore(drawer, document.body.firstChild.nextSibling);

    // --- Toggle logic ---
    hamburger.addEventListener("click", function () {
      const isOpen = drawer.classList.contains("open");
      if (isOpen) {
        drawer.classList.remove("open");
        hamburger.classList.remove("open");
        hamburger.setAttribute("aria-label", "Open menu");
      } else {
        drawer.classList.add("open");
        hamburger.classList.add("open");
        hamburger.setAttribute("aria-label", "Close menu");
      }
    });

    // Close drawer on link click
    drawer.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        drawer.classList.remove("open");
        hamburger.classList.remove("open");
      });
    });

    // Close drawer on outside click
    document.addEventListener("click", function (e) {
      if (
        drawer.classList.contains("open") &&
        !drawer.contains(e.target) &&
        !hamburger.contains(e.target)
      ) {
        drawer.classList.remove("open");
        hamburger.classList.remove("open");
      }
    });

    // --- Expose update function for auth state changes ---
    window.updateMobileNavAuth = function (html) {
      const mobileAuthEl = document.getElementById("mobile-auth-actions");
      if (mobileAuthEl) mobileAuthEl.innerHTML = html;
    };
  }

  // Run after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNav);
  } else {
    initNav();
  }
})();

