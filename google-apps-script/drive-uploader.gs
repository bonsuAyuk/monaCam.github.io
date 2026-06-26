/**
 * Google Apps Script — MonaCam Universal File Uploader
 * ═══════════════════════════════════════════════════════════════════
 * Handles ALL uploads for the platform:
 *   • Creator video uploads (up to 150MB via chunked upload)
 *   • Thumbnail image uploads
 *   • Payment screenshot uploads
 *
 * CHUNKED UPLOAD FLOW (for files > 20MB):
 *   1. Client sends "init"     → Script creates a temp folder
 *   2. Client sends "chunk" x N → Script saves each piece to temp folder
 *   3. Client sends "finalize"  → Script assembles pieces into one file
 *
 * SIMPLE UPLOAD FLOW (for files ≤ 20MB):
 *   Client sends "simple" → Script creates the file in one step
 *
 * ═══════════════════════════════════════════════════════════════════
 * SETUP (one-time, ~5 minutes):
 *
 * 1. Go to https://script.google.com → "New Project"
 *    → Name it: "MonaCam Uploader"
 *
 * 2. Delete all code. Paste THIS ENTIRE FILE.
 *
 * 3. Create a root folder in Google Drive:
 *    → drive.google.com → New → Folder → "MonaCam Uploads"
 *    → Open folder → copy the ID from the URL bar:
 *      https://drive.google.com/drive/folders/XXXXXXXXXX
 *    → Replace ROOT_FOLDER_ID below
 *
 * 4. Deploy:
 *    → Click "Deploy" → "New deployment"
 *    → Type: "Web app"
 *    → Execute as: "Me (your-email)"
 *    → Who has access: "Anyone"
 *    → Deploy → Authorize → Copy the Web App URL
 *
 * 5. Paste that URL into js/drive-upload.js:
 *    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/.../exec"
 * ═══════════════════════════════════════════════════════════════════
 */

// ═════════════════════════════════════════════════════════════
//  REPLACE with your Google Drive root folder ID
// ═════════════════════════════════════════════════════════════
var ROOT_FOLDER_ID = "YOUR_ROOT_FOLDER_ID";

// ─────────────────────────────────────────────────────────────
// POST handler — routes to the correct upload mode
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var mode    = payload.mode || "simple";

    switch (mode) {
      case "simple":   return handleSimpleUpload(payload);
      case "init":     return handleChunkInit(payload);
      case "chunk":    return handleChunkUpload(payload);
      case "finalize": return handleChunkFinalize(payload);
      default:
        return jsonResponse({ success: false, error: "Unknown mode: " + mode });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// SIMPLE UPLOAD — single request for small files (≤ 20MB)
// ─────────────────────────────────────────────────────────────
function handleSimpleUpload(payload) {
  var fileData   = stripDataUrlPrefix(payload.fileData);
  var fileName   = payload.fileName || ("upload_" + Date.now());
  var mimeType   = payload.mimeType || "application/octet-stream";
  var uploadType = payload.uploadType || "misc";
  var customId   = payload.fileId || "";

  var bytes = Utilities.base64Decode(fileData);
  var blob  = Utilities.newBlob(bytes, mimeType, fileName);

  var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var subFolder  = getOrCreateSubfolder(rootFolder, uploadType);

  var driveFileName = customId ? (customId + "_" + fileName) : fileName;
  var file = subFolder.createFile(blob.setName(driveFileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return jsonResponse({
    success:  true,
    fileId:   file.getId(),
    url:      "https://drive.google.com/uc?export=view&id=" + file.getId(),
    embedUrl: "https://drive.google.com/file/d/" + file.getId() + "/preview",
    fileName: driveFileName,
    size:     bytes.length
  });
}

// ─────────────────────────────────────────────────────────────
// CHUNK INIT — create a temporary folder for this upload session
// ─────────────────────────────────────────────────────────────
function handleChunkInit(payload) {
  var sessionId   = payload.sessionId;
  var fileName    = payload.fileName || "upload";
  var totalChunks = payload.totalChunks || 1;

  // Create temp folder inside root
  var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var tempParent = getOrCreateSubfolder(rootFolder, "_temp");
  var sessionFolder = tempParent.createFolder("session_" + sessionId);

  // Store metadata as a small JSON file in the session folder
  var meta = {
    sessionId:   sessionId,
    fileName:    fileName,
    mimeType:    payload.mimeType || "video/mp4",
    uploadType:  payload.uploadType || "video",
    fileId:      payload.fileId || "",
    totalChunks: totalChunks,
    createdAt:   new Date().toISOString()
  };
  sessionFolder.createFile("_meta.json", JSON.stringify(meta), "application/json");

  return jsonResponse({
    success:         true,
    sessionId:       sessionId,
    sessionFolderId: sessionFolder.getId(),
    message:         "Session created. Send chunks now."
  });
}

// ─────────────────────────────────────────────────────────────
// CHUNK UPLOAD — save one chunk to the session folder
// ─────────────────────────────────────────────────────────────
function handleChunkUpload(payload) {
  var sessionId  = payload.sessionId;
  var chunkIndex = payload.chunkIndex;
  var chunkData  = stripDataUrlPrefix(payload.fileData);

  // Find the session folder
  var rootFolder    = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var tempParent    = getOrCreateSubfolder(rootFolder, "_temp");
  var sessionFolder = findFolderByName(tempParent, "session_" + sessionId);

  if (!sessionFolder) {
    return jsonResponse({ success: false, error: "Session not found: " + sessionId });
  }

  // Decode and save as a binary file
  var bytes = Utilities.base64Decode(chunkData);
  var chunkName = "chunk_" + String(chunkIndex).padStart(5, "0");
  var blob = Utilities.newBlob(bytes, "application/octet-stream", chunkName);
  sessionFolder.createFile(blob);

  return jsonResponse({
    success:    true,
    sessionId:  sessionId,
    chunkIndex: chunkIndex,
    chunkSize:  bytes.length,
    message:    "Chunk " + chunkIndex + " saved."
  });
}

// ─────────────────────────────────────────────────────────────
// CHUNK FINALIZE — assemble all chunks into one file
// ─────────────────────────────────────────────────────────────
function handleChunkFinalize(payload) {
  var sessionId = payload.sessionId;

  var rootFolder    = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var tempParent    = getOrCreateSubfolder(rootFolder, "_temp");
  var sessionFolder = findFolderByName(tempParent, "session_" + sessionId);

  if (!sessionFolder) {
    return jsonResponse({ success: false, error: "Session not found: " + sessionId });
  }

  // Read metadata
  var metaFile = findFileByName(sessionFolder, "_meta.json");
  if (!metaFile) {
    return jsonResponse({ success: false, error: "Session metadata missing." });
  }
  var meta = JSON.parse(metaFile.getBlob().getDataAsString());

  // Collect chunk files (skip _meta.json)
  var chunkFiles = [];
  var it = sessionFolder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName() !== "_meta.json") {
      chunkFiles.push(f);
    }
  }

  // Sort by name (chunk_00000, chunk_00001, ...)
  chunkFiles.sort(function(a, b) {
    return a.getName().localeCompare(b.getName());
  });

  // Assemble: read all bytes and concatenate
  var totalSize = 0;
  var chunkByteArrays = [];
  for (var i = 0; i < chunkFiles.length; i++) {
    var bytes = chunkFiles[i].getBlob().getBytes();
    chunkByteArrays.push(bytes);
    totalSize += bytes.length;
  }

  // Build combined byte array
  var combined = [];
  for (var i = 0; i < chunkByteArrays.length; i++) {
    var arr = chunkByteArrays[i];
    for (var j = 0; j < arr.length; j++) {
      combined.push(arr[j]);
    }
  }

  // Create the final file
  var finalBlob = Utilities.newBlob(combined, meta.mimeType, meta.fileName);
  var driveFileName = meta.fileId ? (meta.fileId + "_" + meta.fileName) : meta.fileName;
  finalBlob.setName(driveFileName);

  var subFolder = getOrCreateSubfolder(rootFolder, meta.uploadType);
  var file = subFolder.createFile(finalBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Clean up temp folder
  try {
    sessionFolder.setTrashed(true);
  } catch (cleanErr) {
    // Non-critical — temp files will just sit in _temp
  }

  return jsonResponse({
    success:  true,
    fileId:   file.getId(),
    url:      "https://drive.google.com/uc?export=view&id=" + file.getId(),
    embedUrl: "https://drive.google.com/file/d/" + file.getId() + "/preview",
    fileName: driveFileName,
    size:     totalSize
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getOrCreateSubfolder(parent, name) {
  var folderNames = {
    "video": "Videos", "thumbnail": "Thumbnails",
    "screenshot": "Screenshots", "_temp": "_TempUploads"
  };
  var folderName = folderNames[name] || name;
  var folders = parent.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parent.createFolder(folderName);
}

function findFolderByName(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function findFileByName(folder, name) {
  var it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

function stripDataUrlPrefix(data) {
  if (data && data.indexOf(",") > -1) {
    return data.split(",")[1];
  }
  return data;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
// GET handler — health check
// ─────────────────────────────────────────────────────────────
function doGet() {
  return jsonResponse({
    status: "ok", service: "MonaCam File Uploader",
    limits: { maxFileSize: "150MB", chunkSize: "20MB", supportedModes: ["simple","init","chunk","finalize"] }
  });
}
