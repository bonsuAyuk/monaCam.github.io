/**
 * drive-upload.js — Client-side Google Drive Upload Service
 *
 * Supports files up to 150MB through automatic chunked uploads.
 *
 * How it works:
 *   Small file (≤ 20MB):
 *     Browser → base64 → single POST to Apps Script → file created on Drive
 *
 *   Large file (> 20MB, up to 150MB):
 *     Browser → split into 20MB chunks
 *       → POST "init" (create session)
 *       → POST "chunk" x N (one per piece)
 *       → POST "finalize" (assemble on Drive)
 *       → single file on Drive
 *
 * The creator just picks a file — chunking is 100% automatic.
 *
 * SETUP:
 *   Deploy google-apps-script/drive-uploader.gs as a Web App,
 *   then paste the URL below.
 */

// ═══════════════════════════════════════════════════════════════
// PASTE YOUR APPS SCRIPT WEB APP URL HERE:
// ═══════════════════════════════════════════════════════════════
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwofZzDB9hJStv3nzvX-UGFoD9-Fqiv1DklY6xgigp7J-_-fWnMf_AK0xehd2EQAb8Z/exec";

// ── Limits ───────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 150;  // Maximum upload size
const CHUNK_SIZE_BYTES = 20 * 1024 * 1024;  // 20MB per chunk
const SIMPLE_UPLOAD_LIMIT = 20 * 1024 * 1024;  // Files ≤ 20MB use single request

/**
 * Check if the upload service is configured.
 */
export function isUploadConfigured() {
  return APPS_SCRIPT_URL && APPS_SCRIPT_URL.startsWith("https://script.google.com");
}

// ─────────────────────────────────────────────────────────────
// Convert a Blob/ArrayBuffer chunk to base64 string
// ─────────────────────────────────────────────────────────────
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192; // Process in sub-chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

// ─────────────────────────────────────────────────────────────
// Read a File as an ArrayBuffer
// ─────────────────────────────────────────────────────────────
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}

// ─────────────────────────────────────────────────────────────
// Read a File as a base64 data URL (for small files)
// ─────────────────────────────────────────────────────────────
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────
// Compress an image file (for thumbnails/screenshots)
// ─────────────────────────────────────────────────────────────
function compressImage(file, maxWidth = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => resolve(blob),
          "image/jpeg",
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────
// Send a JSON POST to the Apps Script
// ─────────────────────────────────────────────────────────────
async function postToScript(payload) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  let result;
  try {
    result = await response.json();
  } catch (e) {
    throw new Error(
      "Upload sent but response unreadable. Check your Drive folder. " +
      "(Status: " + response.status + ")"
    );
  }

  if (!result.success) {
    throw new Error(result.error || "Server error during upload.");
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// SIMPLE UPLOAD — one request (files ≤ 20MB)
// ─────────────────────────────────────────────────────────────
async function simpleUpload(file, uploadType, fileId, onProgress) {
  onProgress(10);
  const dataUrl = await readFileAsDataUrl(file);
  onProgress(40);

  const result = await postToScript({
    mode: "simple",
    fileData: dataUrl,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    uploadType: uploadType,
    fileId: fileId || "",
  });

  onProgress(100);
  return result;
}

// ─────────────────────────────────────────────────────────────
// CHUNKED UPLOAD — multiple requests (files > 20MB, up to 150MB)
// ─────────────────────────────────────────────────────────────
async function chunkedUpload(file, uploadType, fileId, onProgress) {
  const totalSize = file.size;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE_BYTES);
  const sessionId = fileId + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

  // ── Step 1: Init session ─────────────────────────────────
  onProgress(2);
  await postToScript({
    mode: "init",
    sessionId: sessionId,
    fileName: file.name,
    mimeType: file.type || "video/mp4",
    uploadType: uploadType,
    fileId: fileId || "",
    totalChunks: totalChunks,
  });

  onProgress(5);

  // ── Step 2: Upload chunks ────────────────────────────────
  const buffer = await readFileAsArrayBuffer(file);
  onProgress(10);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, totalSize);
    const chunk = buffer.slice(start, end);

    // Convert chunk to base64
    const base64Chunk = arrayBufferToBase64(chunk);

    // Send chunk
    await postToScript({
      mode: "chunk",
      sessionId: sessionId,
      chunkIndex: i,
      fileData: base64Chunk,
    });

    // Progress: chunks occupy 10%–85% of the bar
    const chunkProgress = 10 + Math.round(((i + 1) / totalChunks) * 75);
    onProgress(chunkProgress);
  }

  // ── Step 3: Finalize (assemble on Drive) ─────────────────
  onProgress(88);
  const result = await postToScript({
    mode: "finalize",
    sessionId: sessionId,
  });

  onProgress(100);
  return result;
}

// ─────────────────────────────────────────────────────────────
// MAIN UPLOAD FUNCTION
// ─────────────────────────────────────────────────────────────
/**
 * Upload a file to Google Drive via the Apps Script.
 *
 * @param {object} opts
 *   file       {File}     - The file to upload
 *   uploadType {string}   - "video" | "thumbnail" | "screenshot"
 *   fileId     {string}   - Optional ID prefix for the filename
 *   onProgress {function} - (percent: 0-100) => void
 *   compress   {boolean}  - If true, compress images before uploading
 *
 * @returns {Promise<{success, fileId, url, embedUrl, fileName, size}>}
 */
export async function uploadToDrive({ file, uploadType, fileId, onProgress, compress }) {
  if (!isUploadConfigured()) {
    throw new Error(
      "Upload not configured. Deploy the Apps Script and set the URL in js/drive-upload.js"
    );
  }

  // Validate size
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    throw new Error(
      `File too large (${sizeMB.toFixed(1)}MB). Maximum: ${MAX_FILE_SIZE_MB}MB.`
    );
  }

  const progress = onProgress || (() => { });

  // Compress images if requested
  let uploadFile = file;
  if (compress && file.type.startsWith("image/")) {
    progress(5);
    const compressedBlob = await compressImage(file);
    uploadFile = new File([compressedBlob], file.name, { type: "image/jpeg" });
    progress(10);
  }

  // Route to simple or chunked upload
  if (uploadFile.size <= SIMPLE_UPLOAD_LIMIT) {
    return simpleUpload(uploadFile, uploadType, fileId, progress);
  } else {
    return chunkedUpload(uploadFile, uploadType, fileId, progress);
  }
}

// ── Convenience wrappers ──────────────────────────────────────

/**
 * Upload a video file (up to 150MB).
 */
export async function uploadVideoToDrive(file, videoId, onProgress) {
  return uploadToDrive({
    file, uploadType: "video", fileId: videoId,
    onProgress, compress: false,
  });
}

/**
 * Upload a thumbnail image (auto-compressed).
 * (Legacy Drive upload - replaced by ImgBB to prevent 403s)
 */
export async function uploadThumbnailToDrive(file, videoId, onProgress) {
  return uploadToDrive({
    file, uploadType: "thumbnail", fileId: videoId,
    onProgress, compress: true,
  });
}

/**
 * Upload a thumbnail image to ImgBB (Free Image Hosting API).
 * Replaces Google Drive for thumbnails to prevent 403 hotlinking issues.
 */
export async function uploadThumbnailToImgBB(file, onProgress) {
  // TODO: Replace with your own free ImgBB API Key (https://api.imgbb.com/)
  const IMGBB_API_KEY = "8d2f70ebfdbb7713374246ed3f79e8de";

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      onProgress && onProgress(50);
      try {
        const base64Data = reader.result.split(',')[1];
        const formData = new FormData();
        formData.append("key", IMGBB_API_KEY);
        formData.append("image", base64Data);

        const res = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          body: formData
        });

        const json = await res.json();
        if (json.success) {
          onProgress && onProgress(100);
          resolve({
            url: json.data.url,       // Direct image URL
            fileId: json.data.id      // ImgBB ID
          });
        } else {
          reject(new Error("ImgBB upload failed: " + json.error.message));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = error => reject(error);
  });
}

/**
 * Upload a payment screenshot (auto-compressed).
 */
export async function uploadScreenshotToDrive(file, requestId, onProgress) {
  return uploadToDrive({
    file, uploadType: "screenshot", fileId: requestId,
    onProgress, compress: true,
  });
}

/**
 * Google Drive direct view URL from file ID.
 */
export function driveViewUrl(driveFileId) {
  return `https://drive.google.com/uc?export=view&id=${driveFileId}`;
}

/**
 * Google Drive embed URL from file ID (for video iframe).
 */
export function driveEmbedUrl(driveFileId) {
  return `https://drive.google.com/file/d/${driveFileId}/preview`;
}
