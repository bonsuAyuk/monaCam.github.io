/**
 * drive-upload.js — Client-side Google Drive Direct Upload Service
 *
 * Supports fast, unlimited direct-to-Drive binary uploads bypassing
 * the 50MB Apps Script limit and chunking overhead.
 */

const VERCEL_API_URL = "https://mona-cam-github-io.vercel.app";

/**
 * Check if the upload service is configured.
 */
export function isUploadConfigured() {
  return true; // Configured via Vercel backend
}

// ─────────────────────────────────────────────────────────────
// MAIN UPLOAD FUNCTION (DIRECT TO DRIVE VIA VERCEL SIGNED URL)
// ─────────────────────────────────────────────────────────────
/**
 * Upload a file directly to Google Drive using a resumable session.
 *
 * @param {object} opts
 *   file       {File}     - The file to upload
 *   uploadType {string}   - "video" | "thumbnail" | "screenshot"
 *   fileId     {string}   - Optional ID prefix for the filename
 *   onProgress {function} - (percent: 0-100) => void
 *   compress   {boolean}  - Ignored for direct upload
 *
 * @returns {Promise<{success, fileId, url, embedUrl, fileName, size}>}
 */
export async function uploadToDrive({ file, uploadType, fileId, onProgress, compress }) {
  if (!isUploadConfigured()) {
    throw new Error("Upload not configured.");
  }

  const progress = onProgress || (() => { });
  progress(5); // Requesting upload URL

  const driveFileName = fileId ? `${fileId}_${file.name}` : file.name;

  try {
    // 1. Get the resumable upload URL from Vercel
    const res = await fetch(`${VERCEL_API_URL}/api/get-drive-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: driveFileName,
        mimeType: file.type || "video/mp4",
        uploadType: uploadType
      })
    });

    if (!res.ok) {
      let errText = await res.text();
      throw new Error(`Failed to get upload URL: ${res.status} ${errText}`);
    }

    const { uploadUrl } = await res.json();
    progress(10); // Start upload

    // 2. Upload file directly to Google Drive via XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = 10 + Math.round((e.loaded / e.total) * 85);
          progress(percentComplete);
        }
      };

      xhr.onload = () => {
        progress(100);
        if (xhr.status >= 200 && xhr.status < 300) {
          // Google Drive returns file metadata upon successful completion
          const result = JSON.parse(xhr.responseText);
          const finalId = result.id;
          resolve({
            success: true,
            fileId: finalId,
            url: `https://drive.google.com/uc?export=view&id=${finalId}`,
            embedUrl: `https://drive.google.com/file/d/${finalId}/preview`,
            fileName: driveFileName,
            size: file.size
          });
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during file upload to Google Drive."));
      };

      xhr.send(file);
    });

  } catch (err) {
    console.error("Direct Drive Upload Error:", err);
    throw err;
  }
}

// ── Convenience wrappers ──────────────────────────────────────

/**
 * Upload a video file.
 */
export async function uploadVideoToDrive(file, videoId, onProgress) {
  return uploadToDrive({
    file, uploadType: "video", fileId: videoId,
    onProgress, compress: false,
  });
}

/**
 * Upload a thumbnail image.
 */
export async function uploadThumbnailToDrive(file, videoId, onProgress) {
  return uploadToDrive({
    file, uploadType: "thumbnail", fileId: videoId,
    onProgress, compress: false,
  });
}

/**
 * Upload a thumbnail image to ImgBB (Free Image Hosting API).
 */
export async function uploadThumbnailToImgBB(file, onProgress) {
  // Redirect to Google Drive to bypass broken ImgBB keys
  return uploadThumbnailToDrive(file, null, onProgress);
}

/**
 * Upload a payment screenshot to ImgBB.
 */
export async function uploadScreenshotToImgBB(file, onProgress) {
  // Redirect to Google Drive to bypass broken ImgBB keys
  return uploadToDrive({
    file, uploadType: "screenshot", fileId: null,
    onProgress, compress: false,
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
