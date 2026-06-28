/**
 * drive-player.js — Google Drive Video Player Utility
 *
 * Google Drive videos CANNOT be played in a standard <video> element.
 * Drive serves videos through its own streaming infrastructure,
 * accessible only via the preview iframe URL.
 *
 * This module:
 * - Detects whether a video source is a Google Drive URL
 * - Converts any Drive URL format to the correct embed URL
 * - Swaps the <video> element for an <iframe> when needed
 * - Applies security overlays (right-click block, watermark)
 * - Enforces preview-only mode with a time limit
 *
 * Usage:
 *   import { DrivePlayer } from "./js/drive-player.js";
 *   const player = new DrivePlayer(containerEl, options);
 *   player.load(driveUrlOrFileId, hasFullAccess);
 */

// ── Detect if a URL is a Google Drive URL ────────────────────────
export function isDriveUrl(url) {
  if (!url) return false;
  return (
    url.includes("drive.google.com") ||
    url.includes("docs.google.com") ||
    /^[a-zA-Z0-9_-]{25,}$/.test(url.trim()) // bare file ID
  );
}

// ── Extract file ID from any Drive URL format ─────────────────────
export function extractDriveFileId(url) {
  if (!url) return null;
  const s = url.trim();
  // Bare file ID
  if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) return s;
  // /file/d/{ID}/...
  const m1 = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // ?id={ID} or &id={ID}
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

// ── Build the correct Drive embed URL ────────────────────────────
export function buildDrivePreviewUrl(fileIdOrUrl) {
  const id = extractDriveFileId(fileIdOrUrl);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

/**
 * DrivePlayer — replaces a container with the appropriate player
 * based on whether the source is a Drive URL or a regular video URL.
 */
export class DrivePlayer {
  /**
   * @param {HTMLElement} container - The .player-wrapper element
   * @param {object} options
   *   previewSeconds {number}   - How many seconds the preview lasts (default 30)
   *   watermarkText  {string}   - Text shown on the watermark
   *   onPreviewEnd   {function} - Called when preview time is up
   *   onPlay         {function} - Called when user clicks the play overlay
   */
  constructor(container, options = {}) {
    this.container      = container;
    this.previewSeconds = options.previewSeconds || 30;
    this.watermarkText  = options.watermarkText  || "MonaCam";
    this.onPreviewEnd   = options.onPreviewEnd   || (() => {});
    this.onPlay         = options.onPlay         || null;

    this._previewTimer   = null;
    this._elapsed        = 0;
    this._isPreviewMode  = false;
    this._isDrive        = false;

    this._applySecurityOverlays();
  }

  // ── Load a video ─────────────────────────────────────────────
  /**
   * @param {string} source        - Drive URL/fileId OR direct video URL
   * @param {boolean} hasFullAccess - false = preview only
   */
  load(source, hasFullAccess) {
    this._clearTimer();
    this._isDrive       = isDriveUrl(source);
    this._isPreviewMode = !hasFullAccess;

    if (this._isDrive) {
      this._loadDriveIframe(source, hasFullAccess);
    } else {
      this._loadVideoElement(source, hasFullAccess);
    }

    this._showPlayOverlay();
  }

  // ── Explicit Play Overlay ─────────────────────────────────────
  _showPlayOverlay() {
    let overlay = this.container.querySelector(".drive-play-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "drive-play-overlay";
      overlay.innerHTML = `<i class="fa-solid fa-play" style="font-size:48px; color:white; filter:drop-shadow(0 4px 8px rgba(0,0,0,0.8));"></i>`;
      overlay.style.cssText = `
        position: absolute; inset: 0; z-index: 20;
        background: rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(2px);
        transition: opacity 0.2s ease;
        pointer-events: none;
      `;
      this.container.appendChild(overlay);
      
      const onBlur = () => {
        const iframe = this.container.querySelector("iframe.drive-player-frame");
        if (document.activeElement === iframe) {
          overlay.style.opacity = "0";
          setTimeout(() => overlay.remove(), 200);
          
          if (this.onPlay) this.onPlay();
          if (this._isPreviewMode) {
            this._startPreviewTimer();
          }
          window.removeEventListener('blur', onBlur);
        }
      };
      window.addEventListener('blur', onBlur);

      const video = this.container.querySelector("video");
      if (video) {
        video.addEventListener('play', () => {
          overlay.style.opacity = "0";
          setTimeout(() => overlay.remove(), 200);
          if (this.onPlay) this.onPlay();
          if (this._isPreviewMode && !this._previewTimer) {
            this._startPreviewTimer();
          }
        }, { once: true });
      }
    }
  }

  // ── Drive iframe player ───────────────────────────────────────
  _loadDriveIframe(source, hasFullAccess) {
    // Remove any existing <video> element
    const existingVideo = this.container.querySelector("video");
    if (existingVideo) existingVideo.remove();

    // Remove any existing iframe
    const existingIframe = this.container.querySelector("iframe.drive-player-frame");
    if (existingIframe) existingIframe.remove();

    const embedUrl = buildDrivePreviewUrl(source);
    if (!embedUrl) {
      console.error("Could not build Drive embed URL from:", source);
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.className           = "drive-player-frame";
    iframe.src                 = embedUrl;
    iframe.allow               = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    iframe.setAttribute("allowfullscreen", "");
    // Security: disable picture-in-picture within the iframe where possible
    iframe.setAttribute("disablepictureinpicture", "");
    // Style
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      position: absolute;
      top: 0; left: 0;
    `;

    // Make container position relative so iframe fills it
    this.container.style.position = "relative";

    // Insert iframe before any overlays
    const firstOverlay = this.container.querySelector(".paywall-overlay, .security-overlay");
    if (firstOverlay) {
      this.container.insertBefore(iframe, firstOverlay);
    } else {
      this.container.appendChild(iframe);
    }

    // Add a semi-transparent preview blocker overlay for preview mode
    if (!hasFullAccess) {
      this._ensurePreviewBlocker();
    }
  }

  // ── Regular HTML5 video player ────────────────────────────────
  _loadVideoElement(source, hasFullAccess) {
    // Remove any Drive iframe
    const existingIframe = this.container.querySelector("iframe.drive-player-frame");
    if (existingIframe) existingIframe.remove();

    let video = this.container.querySelector("video");
    if (!video) {
      video = document.createElement("video");
      video.id          = "main-video-player";
      video.controls    = true;
      video.playsInline = true; // iOS
      video.style.cssText = "width:100%; height:100%; display:block; object-fit:contain;";
      this.container.appendChild(video);
    }

    // Disable controls that expose the URL
    video.setAttribute("controlslist", "nodownload noremoteplayback");
    video.setAttribute("disablepictureinpicture", "");

    video.src  = source;
    video.load();

    // For preview mode, pause at the limit
    if (!hasFullAccess) {
      video.play().catch(() => {});
    }
  }

  // ── Preview countdown timer (for both Drive and regular videos) ─
  _startPreviewTimer() {
    this._elapsed = 0;

    // Create countdown badge
    let badge = this.container.querySelector(".preview-countdown-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "preview-countdown-badge";
      badge.style.cssText = `
        position: absolute; top: 12px; right: 12px; z-index: 25;
        background: rgba(0,0,0,0.7); color: #fff;
        padding: 4px 8px; border-radius: 4px;
        font-size: 12px; font-weight: bold; font-family: sans-serif;
        pointer-events: none; backdrop-filter: blur(4px);
      `;
      this.container.appendChild(badge);
    }
    
    const updateBadge = () => {
      const remaining = this.previewSeconds - this._elapsed;
      badge.innerText = `Free Preview: ${remaining}s`;
    };
    updateBadge();

    this._previewTimer = setInterval(() => {
      this._elapsed++;
      updateBadge();
      if (this._elapsed >= this.previewSeconds) {
        this._clearTimer();
        this._blockPreview();
        this.onPreviewEnd();
        if (badge) badge.remove();
      }
    }, 1000);
  }

  _clearTimer() {
    if (this._previewTimer) {
      clearInterval(this._previewTimer);
      this._previewTimer = null;
    }
    // Also pause any video element
    const video = this.container.querySelector("video");
    if (video) video.pause();
  }

  _blockPreview() {
    // Blur/hide the iframe or video
    const iframe = this.container.querySelector("iframe.drive-player-frame");
    const video  = this.container.querySelector("video");
    if (iframe) {
      iframe.style.filter = "blur(12px) brightness(0.3)";
      iframe.style.pointerEvents = "none";
    }
    if (video) {
      video.pause();
      video.style.filter = "blur(12px) brightness(0.3)";
    }
    // Remove the preview blocker overlay so the paywall can show
    const blocker = this.container.querySelector(".preview-time-blocker");
    if (blocker) blocker.remove();
  }

  _ensurePreviewBlocker() {
    if (!this.container.querySelector(".preview-time-blocker")) {
      const blocker = document.createElement("div");
      blocker.className = "preview-time-blocker";
      blocker.style.cssText = `
        position: absolute;
        inset: 0;
        z-index: 3;
        background: transparent;
      `;
      this.container.appendChild(blocker);
    }
  }

  // ── Security overlays (context menu, keyboard shortcuts) ──────
  _applySecurityOverlays() {
    // Disable right-click on the container
    this.container.addEventListener("contextmenu", (e) => e.preventDefault());

    // Watermark
    if (!this.container.querySelector(".video-watermark")) {
      const wm = document.createElement("div");
      wm.className = "video-watermark";
      wm.innerText = this.watermarkText;
      wm.style.cssText = `
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 10;
        font-family: var(--font-display, sans-serif);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: rgba(255,255,255,0.35);
        text-transform: uppercase;
        pointer-events: none;
        user-select: none;
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      `;
      this.container.appendChild(wm);
    }

    // Block DevTools shortcuts
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I","J","C","U","K"].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toUpperCase() === "U")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
}
