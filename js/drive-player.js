import { DRIVE_API_KEY } from "./db-config.js";

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
  if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) return s;
  const m1 = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

// ── Build the raw streaming API URL ───────────────────────────────
export function buildDriveStreamUrl(fileIdOrUrl) {
  const id = extractDriveFileId(fileIdOrUrl);
  if (!id) return null;
  return `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${DRIVE_API_KEY}`;
}

export class DrivePlayer {
  constructor(container, options = {}) {
    this.container      = container;
    this.previewSeconds = options.previewSeconds || 30;
    this.watermarkText  = options.watermarkText  || "MonaCam";
    this.onPreviewEnd   = options.onPreviewEnd   || (() => {});
    
    this._isPreviewMode = false;
    this._hasFullAccess = false;
    this._isPlaying = false;
    
    // Clear container
    this.container.innerHTML = "";
    
    // Build Native Player UI
    this._buildUI();
    this._attachEvents();
  }

  _buildUI() {
    this.container.style.position = "relative";
    this.container.style.backgroundColor = "#000";
    this.container.style.overflow = "hidden";
    this.container.style.display = "flex";
    this.container.style.alignItems = "center";
    this.container.style.justifyContent = "center";

    // Video Element
    this.videoEl = document.createElement("video");
    this.videoEl.className = "monacam-video";
    this.videoEl.style.width = "100%";
    this.videoEl.style.height = "100%";
    this.videoEl.style.objectFit = "contain";
    this.videoEl.style.cursor = "pointer";
    // We do NOT use the native "controls" attribute. We build our own.
    this.videoEl.controls = false;
    this.videoEl.playsInline = true;

    // Big Center Play Button Overlay
    this.centerOverlay = document.createElement("div");
    this.centerOverlay.className = "monacam-center-overlay";
    this.centerOverlay.innerHTML = `<i class="fa-solid fa-play"></i>`;
    
    // Top Watermark
    const watermark = document.createElement("div");
    watermark.className = "monacam-watermark";
    watermark.innerText = this.watermarkText;

    // Bottom Controls Bar
    this.controlsBar = document.createElement("div");
    this.controlsBar.className = "monacam-controls";
    this.controlsBar.innerHTML = `
      <div class="monacam-progress-container">
        <div class="monacam-progress-bar">
          <div class="monacam-progress-filled"></div>
        </div>
      </div>
      <div class="monacam-controls-bottom">
        <button class="monacam-btn-play"><i class="fa-solid fa-play"></i></button>
        <div class="monacam-time">
          <span class="monacam-time-current">0:00</span> / <span class="monacam-time-total">0:00</span>
        </div>
        <div class="monacam-spacer"></div>
        <button class="monacam-btn-volume"><i class="fa-solid fa-volume-high"></i></button>
        <button class="monacam-btn-fullscreen"><i class="fa-solid fa-expand"></i></button>
      </div>
    `;

    this.container.appendChild(this.videoEl);
    this.container.appendChild(this.centerOverlay);
    this.container.appendChild(watermark);
    this.container.appendChild(this.controlsBar);

    // References to UI elements
    this.btnPlay = this.controlsBar.querySelector(".monacam-btn-play");
    this.btnVolume = this.controlsBar.querySelector(".monacam-btn-volume");
    this.btnFullscreen = this.controlsBar.querySelector(".monacam-btn-fullscreen");
    this.progressBar = this.controlsBar.querySelector(".monacam-progress-container");
    this.progressFilled = this.controlsBar.querySelector(".monacam-progress-filled");
    this.timeCurrent = this.controlsBar.querySelector(".monacam-time-current");
    this.timeTotal = this.controlsBar.querySelector(".monacam-time-total");
  }

  _attachEvents() {
    // Play/Pause toggles
    const togglePlay = () => {
      if (this.videoEl.paused) {
        this.videoEl.play();
      } else {
        this.videoEl.pause();
      }
    };

    this.videoEl.addEventListener("click", togglePlay);
    this.centerOverlay.addEventListener("click", togglePlay);
    this.btnPlay.addEventListener("click", togglePlay);

    // Video Events
    this.videoEl.addEventListener("play", () => {
      this._isPlaying = true;
      this.centerOverlay.style.opacity = "0";
      this.centerOverlay.style.pointerEvents = "none";
      this.btnPlay.innerHTML = `<i class="fa-solid fa-pause"></i>`;
    });

    this.videoEl.addEventListener("pause", () => {
      this._isPlaying = false;
      this.centerOverlay.style.opacity = "1";
      this.centerOverlay.innerHTML = `<i class="fa-solid fa-play"></i>`;
      this.centerOverlay.style.pointerEvents = "auto";
      this.btnPlay.innerHTML = `<i class="fa-solid fa-play"></i>`;
    });

    this.videoEl.addEventListener("loadedmetadata", () => {
      this.timeTotal.innerText = this._formatTime(this.videoEl.duration);
    });

    this.videoEl.addEventListener("timeupdate", () => {
      this.timeCurrent.innerText = this._formatTime(this.videoEl.currentTime);
      const progressPercent = (this.videoEl.currentTime / this.videoEl.duration) * 100;
      this.progressFilled.style.width = `${progressPercent}%`;

      // Enforce preview limit
      if (this._isPreviewMode && this.videoEl.currentTime >= this.previewSeconds) {
        this.videoEl.pause();
        this._blockPreview();
      }
    });

    // Scrubbing (seeking)
    this.progressBar.addEventListener("click", (e) => {
      if (this._isPreviewMode) return; // Prevent seeking in preview
      const rect = this.progressBar.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      this.videoEl.currentTime = pos * this.videoEl.duration;
    });

    // Volume
    this.btnVolume.addEventListener("click", () => {
      this.videoEl.muted = !this.videoEl.muted;
      if (this.videoEl.muted) {
        this.btnVolume.innerHTML = `<i class="fa-solid fa-volume-xmark"></i>`;
      } else {
        this.btnVolume.innerHTML = `<i class="fa-solid fa-volume-high"></i>`;
      }
    });

    // Fullscreen
    this.btnFullscreen.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        if (this.container.requestFullscreen) {
          this.container.requestFullscreen();
        } else if (this.container.webkitRequestFullscreen) {
          this.container.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    });
    
    // Prevent right click
    this.videoEl.addEventListener('contextmenu', e => e.preventDefault());
  }

  _formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  load(source, hasFullAccess) {
    this._isPreviewMode = !hasFullAccess;
    this._hasFullAccess = hasFullAccess;
    
    // Reset UI
    this.centerOverlay.innerHTML = `<i class="fa-solid fa-play"></i>`;
    this.centerOverlay.style.opacity = "1";
    this.centerOverlay.style.pointerEvents = "auto";
    this.progressFilled.style.width = "0%";
    
    // Resolve stream URL
    let streamUrl = source;
    if (isDriveUrl(source)) {
      streamUrl = buildDriveStreamUrl(source);
    }
    
    // Load into video element but do NOT autoplay
    this.videoEl.src = streamUrl;
    this.videoEl.load();
    
    if (this._isPreviewMode) {
      this.progressBar.style.cursor = "not-allowed";
    } else {
      this.progressBar.style.cursor = "pointer";
    }
  }

  _blockPreview() {
    // Show a blurred overlay over the player
    const overlay = document.createElement("div");
    overlay.className = "monacam-preview-blocker";
    overlay.innerHTML = `
      <div class="monacam-preview-blocker-content">
        <i class="fa-solid fa-lock" style="font-size:32px; color:var(--primary); margin-bottom:12px;"></i>
        <h4 style="margin:0 0 8px 0; color:#fff;">Preview Ended</h4>
        <p style="margin:0; font-size:13px; color:var(--text-muted);">Please upgrade to watch the full video.</p>
      </div>
    `;
    this.container.appendChild(overlay);
    this.onPreviewEnd();
  }
}
