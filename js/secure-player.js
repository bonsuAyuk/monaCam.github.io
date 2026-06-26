/**
 * MonaCam Secure Video Player & Streaming Controller
 * Handles access verification, watermark rendering, inspect blocking, and anti-tamper observations.
 */

export class SecurePlayer {
  constructor(options) {
    this.videoElement = options.videoElement;
    this.containerElement = options.containerElement;
    this.userData = options.userData; // { uid, email }
    this.previewLimit = options.previewLimit || 30; // Seconds
    this.isLocked = true;
    this.watermarkNode = null;
    this.watermarkInterval = null;
    this.mutationObserver = null;

    this.initSecurity();
  }

  /**
   * Initialize browser security blockers and observers
   */
  initSecurity() {
    this.disableContextMenus();
    this.disableInspectShortcuts();
    this.applyPlayerProperties();
  }

  /**
   * Block right clicks on the video player container
   */
  disableContextMenus() {
    this.containerElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      return false;
    });
  }

  /**
   * Block standard developer inspect tool hotkeys
   */
  disableInspectShortcuts() {
    document.addEventListener("keydown", (e) => {
      // F12
      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+Shift+I / Command+Option+I
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "I") {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+J
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "J") {
        e.preventDefault();
        return false;
      }

      // Ctrl+U (View Source)
      if ((e.ctrlKey || e.metaKey) && e.key === "u") {
        e.preventDefault();
        return false;
      }
    });
  }

  /**
   * Apply properties to native HTML5 video player to prevent downloads & pip
   */
  applyPlayerProperties() {
    this.videoElement.setAttribute("controlsList", "nodownload");
    this.videoElement.setAttribute("disablePictureInPicture", "true");
    this.videoElement.disablePictureInPicture = true;
  }

  /**
   * Set video source and check permissions
   */
  loadMedia(sourceUrl, isAuthorized = false) {
    this.videoElement.src = sourceUrl;
    this.videoElement.load();
    this.isLocked = !isAuthorized;

    if (this.isLocked) {
      // Set preview limit handler
      this.videoElement.ontimeupdate = () => {
        if (this.videoElement.currentTime >= this.previewLimit) {
          this.videoElement.pause();
          this.videoElement.currentTime = this.previewLimit;
          this.triggerPaywallLock();
        }
      };
    } else {
      // Clear limit handlers
      this.videoElement.ontimeupdate = null;
      // Start dynamic watermark overlay
      this.startWatermark();
    }
  }

  /**
   * Render and animate the dynamic watermark overlay on top of video container
   */
  startWatermark() {
    if (this.watermarkNode) this.stopWatermark();

    // Create watermarking Node element
    this.watermarkNode = document.createElement("div");
    this.watermarkNode.id = "secure-video-watermark";
    
    // Applying robust styling to make styling deletion difficult
    Object.assign(this.watermarkNode.style, {
      position: "absolute",
      zIndex: "2147483647", // Maximum z-index
      pointerEvents: "none",
      userSelect: "none",
      webkitUserSelect: "none",
      opacity: "0.22",
      color: "#ffffff",
      fontFamily: "monospace",
      fontSize: "12px",
      fontWeight: "bold",
      background: "rgba(0, 0, 0, 0.4)",
      padding: "6px 10px",
      borderRadius: "4px",
      textShadow: "1px 1px 0px #000000",
      transition: "top 0.5s ease, left 0.5s ease",
      whiteSpace: "nowrap"
    });

    this.containerElement.appendChild(this.watermarkNode);
    this.updateWatermarkText();
    this.positionWatermarkRandomly();

    // Move watermark position randomly every 10 seconds
    this.watermarkInterval = setInterval(() => {
      this.updateWatermarkText();
      this.positionWatermarkRandomly();
    }, 10000);

    // Setup Mutation Observer to check for inspection tampering attempts
    this.startAntiTamperObserver();
  }

  /**
   * Stop watermarking processes and clear intervals
   */
  stopWatermark() {
    if (this.watermarkInterval) {
      clearInterval(this.watermarkInterval);
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.watermarkNode && this.watermarkNode.parentNode) {
      this.watermarkNode.parentNode.removeChild(this.watermarkNode);
    }
    this.watermarkNode = null;
  }

  /**
   * Dynamic content renderer: includes current timestamp to verify capture times
   */
  updateWatermarkText() {
    if (!this.watermarkNode) return;
    const now = new Date();
    const dateStr = now.toISOString().replace("T", " ").substring(0, 19);
    this.watermarkNode.innerText = `${this.userData.email} | ID: ${this.userData.uid} | ${dateStr}`;
  }

  /**
   * Reposition watermark to random coordinates inside the container
   */
  positionWatermarkRandomly() {
    if (!this.watermarkNode) return;
    
    const containerWidth = this.containerElement.clientWidth;
    const containerHeight = this.containerElement.clientHeight;
    const nodeWidth = this.watermarkNode.clientWidth || 250;
    const nodeHeight = this.watermarkNode.clientHeight || 28;

    // Calculate maximum boundaries
    const maxX = Math.max(0, containerWidth - nodeWidth - 20);
    const maxY = Math.max(0, containerHeight - nodeHeight - 20);

    // Pick random coordinates
    const randomX = Math.floor(Math.random() * maxX) + 10;
    const randomY = Math.floor(Math.random() * maxY) + 10;

    this.watermarkNode.style.left = `${randomX}px`;
    this.watermarkNode.style.top = `${randomY}px`;
  }

  /**
   * Detects node modifications, attributes tampering, or node deletions
   */
  startAntiTamperObserver() {
    this.mutationObserver = new MutationObserver((mutations) => {
      let isTampered = false;

      for (let mutation of mutations) {
        // 1. Watermark node deleted from parent container
        if (mutation.type === "childList") {
          const removed = Array.from(mutation.removedNodes);
          if (removed.includes(this.watermarkNode)) {
            isTampered = true;
          }
        }
        
        // 2. CSS Styles modified or hidden manually using Dev Tools inspect panel
        if (mutation.type === "attributes" && mutation.target === this.watermarkNode) {
          const style = this.watermarkNode.style;
          if (
            style.display === "none" || 
            style.visibility === "hidden" || 
            parseFloat(style.opacity) < 0.1 ||
            parseInt(style.zIndex) < 100
          ) {
            isTampered = true;
          }
        }
      }

      if (isTampered) {
        this.triggerTamperLockout();
      }
    });

    this.mutationObserver.observe(this.containerElement, {
      childList: true,
      subtree: true
    });
    this.mutationObserver.observe(this.watermarkNode, {
      attributes: true,
      attributeFilter: ["style", "class", "id"]
    });
  }

  /**
   * Action trigger when watermark tampering is detected
   */
  triggerTamperLockout() {
    this.stopWatermark();
    this.videoElement.pause();
    this.videoElement.src = ""; // Clear source video buffer
    this.containerElement.innerHTML = `
      <div style="position:absolute; inset:0; background:#000; color:var(--error); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px; font-weight:bold; z-index: 2147483647;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:48px; margin-bottom:16px;"></i>
        <h2>Security Violation</h2>
        <p style="font-size:14px; margin-top:8px; color:var(--text-secondary); max-width:320px;">Tampering detected. Your video streaming session has been terminated and reported.</p>
      </div>
    `;
    console.error("MonaCam Security Lock: Watermark tampering observed.");
  }

  /**
   * Callback event when preview ends
   */
  triggerPaywallLock() {
    const event = new CustomEvent("previewFinished");
    this.videoElement.dispatchEvent(event);
  }
}
