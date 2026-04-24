/************************************************************
 * YAALI TESTIMONIES — FINAL PRODUCTION VERSION (v12)
 * ----------------------------------------------------------
 * Source: YAALI_DataHub.getProjectsForDashboard()
 * + Extra / Unlisted Testimonials Sheet
 * Cache: Auto-refresh every 6 hours (trigger-based)
 * Backup: ScriptProperties
 * Output: Top 10 most recent approved testimonials
 ************************************************************/

const TESTIMONIAL_CACHE_KEY = "yaali_testimonials_cache_v12";
const TESTIMONIAL_CACHE_TTL = 6 * 60 * 60; // seconds

/* --------------------------------------------------------
 * Web App Entry
 * --------------------------------------------------------*/
function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("YAALI Testimonials")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* --------------------------------------------------------
 * Client-facing endpoint (READ ONLY)
 * --------------------------------------------------------*/
function getCachedTestimonials() {
  const cache = CacheService.getScriptCache();
  let json = cache.get(TESTIMONIAL_CACHE_KEY);

  if (json) {
    Logger.log("Testimonials served → CACHE");
    return JSON.parse(json);
  }

  // Fallback: ScriptProperties (should rarely happen)
  const props = PropertiesService.getScriptProperties();
  json = props.getProperty(TESTIMONIAL_CACHE_KEY);

  if (json) {
    Logger.log("Testimonials served → BACKUP");
    cache.put(TESTIMONIAL_CACHE_KEY, json, TESTIMONIAL_CACHE_TTL);
    return JSON.parse(json);
  }

  // Absolute fallback (cold start)
  Logger.log("Testimonials COLD START → rebuilding");
  const fresh = buildTestimonials_();
  writeCache_(fresh);
  return fresh;
}

/* --------------------------------------------------------
 * Video proxy — fetches video bytes from Drive, returns
 * as base64 so the client can create a local Blob URL.
 * Returns error details instead of null for debugging.
 * --------------------------------------------------------*/
function getVideoBase64(fileId) {
  try {
    if (!fileId || fileId.length < 10) {
      return { error: "Invalid file ID: '" + fileId + "'" };
    }

    const file = DriveApp.getFileById(fileId);
    const fileName = file.getName();
    const fileSize = file.getSize();
    const mimeType = file.getMimeType() || "video/mp4";

    Logger.log("Video proxy: " + fileName + " (" + fileSize + " bytes, " + mimeType + ")");

    // Check file size — warn if over 25MB (might be slow)
    if (fileSize > 50 * 1024 * 1024) {
      return { error: "File too large (" + Math.round(fileSize/1024/1024) + "MB). Max ~50MB supported." };
    }

    const blob = file.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());

    Logger.log("Video proxy SUCCESS: " + fileName + " → " + base64.length + " chars base64");

    return { data: base64, mimeType: mimeType };
  } catch (e) {
    Logger.log("getVideoBase64 ERROR: " + e.message);
    return { error: e.message };
  }
}

/* --------------------------------------------------------
 * 🔧 DEBUG — Run this from the script editor to test
 * video access. Check Execution Log for results.
 * --------------------------------------------------------*/
function testVideoAccess() {
  // Step 1: Get testimonials and find video entries
  const data = buildTestimonials_();
  Logger.log("Total testimonials: " + data.length);

  const videos = data.filter(function(item) { return item.isVideo && item.videoId; });
  Logger.log("Video testimonials: " + videos.length);

  if (videos.length === 0) {
    Logger.log("⚠ No video testimonials found. Check your spreadsheet.");
    return;
  }

  // Step 2: Test each video file
  videos.forEach(function(item, i) {
    Logger.log("\n--- Video " + (i+1) + " ---");
    Logger.log("Video ID: " + item.videoId);
    Logger.log("Project: " + item.project);

    try {
      var file = DriveApp.getFileById(item.videoId);
      Logger.log("✅ File found: " + file.getName());
      Logger.log("   Size: " + (file.getSize() / 1024 / 1024).toFixed(2) + " MB");
      Logger.log("   MIME: " + file.getMimeType());
      Logger.log("   Sharing: " + file.getSharingAccess() + " / " + file.getSharingPermission());

      // Try getting blob (this is what getVideoBase64 does)
      var blob = file.getBlob();
      var bytes = blob.getBytes();
      Logger.log("✅ Blob retrieved: " + bytes.length + " bytes");

      // Try base64 encoding
      var b64 = Utilities.base64Encode(bytes);
      Logger.log("✅ Base64 encoded: " + b64.length + " chars");
      Logger.log("✅ VIDEO " + (i+1) + " — ALL CHECKS PASSED");
    } catch (e) {
      Logger.log("❌ ERROR: " + e.message);
    }
  });
}

/* --------------------------------------------------------
 * AUTO REFRESH — runs via time-based trigger
 * --------------------------------------------------------*/
function refreshTestimonialsCache_() {
  Logger.log("AUTO REFRESH START");

  const fresh = buildTestimonials_();
  writeCache_(fresh);

  Logger.log(
    `AUTO REFRESH DONE → ${fresh.length} testimonials @ ${new Date().toISOString()}`
  );
}

/* --------------------------------------------------------
 * Build testimonials from DataHub + Extra Sheet
 * --------------------------------------------------------*/
function buildTestimonials_() {
  const results = [];

  const props = PropertiesService.getScriptProperties();
  const SS_ID = props.getProperty("SS_ID");
  const EXTRA_SHEET = props.getProperty("EXTRA_SHEET");

  if (SS_ID && EXTRA_SHEET) {
    try {
      const ss = SpreadsheetApp.openById(SS_ID);
      const sh = ss.getSheetByName(EXTRA_SHEET);

      if (sh) {
        const rows = sh.getDataRange().getValues();
        if (rows.length > 1) {
          const header = rows.shift().map(h => String(h).toLowerCase().trim());

const colProject   = header.findIndex(h => h === "project name");
const colName      = header.findIndex(h => h === "name");
const colRegion    = header.findIndex(h => h === "region");
const colTesti     = header.findIndex(h => h === "testimonial");
const colVideo     = header.findIndex(h => h === "video link");
const colProcessed = header.findIndex(h => h === "processed");

          rows.forEach(row => {
            const isProcessed = row[colProcessed] ? String(row[colProcessed]).toUpperCase().trim() : "NO";
            if (isProcessed !== "YES") return;

            const videoId = extractDriveId_(colVideo !== -1 ? row[colVideo] : "");

            results.push({
  project: colProject !== -1 ? (row[colProject] || "Other Project") : "Other Project",
  name: colName !== -1 ? (String(row[colName]).trim() || "Anonymous") : "Anonymous",
  title: colRegion !== -1 ? (row[colRegion] || "") : "",
  message: colTesti !== -1 ? (row[colTesti] || "") : "",
  isVideo: Boolean(videoId),
  videoId
});
          });
        }
      }
    } catch (e) {
      Logger.log("Extra testimonials error: " + e.message);
    }
  } else {
    Logger.log("SS_ID or EXTRA_SHEET not set in Script Properties");
  }

  return finalize_(results);
}

/* --------------------------------------------------------
 * Cache writer (single source of truth)
 * --------------------------------------------------------*/
function writeCache_(data) {
  const json = JSON.stringify(data);

  CacheService.getScriptCache().put(
    TESTIMONIAL_CACHE_KEY,
    json,
    TESTIMONIAL_CACHE_TTL
  );

  PropertiesService.getScriptProperties().setProperty(
    TESTIMONIAL_CACHE_KEY,
    json
  );
}

/* --------------------------------------------------------
 * Final formatting
 * --------------------------------------------------------*/
function finalize_(results) {
  // Without ratings to sort by, we reverse to put the newest entries at the top, then slice.
  return results.reverse().slice(0, 10);
}

/* --------------------------------------------------------
 * Drive ID extractor
 * --------------------------------------------------------*/
function extractDriveId_(url) {
  if (!url) return "";
  const m = url.match(/[-\w]{25,}/);
  return m ? m[0] : "";
}

/* --------------------------------------------------------
 * ADMIN — clear cache manually (optional)
 * --------------------------------------------------------*/
function clearTestimonialCache() {
  CacheService.getScriptCache().remove(TESTIMONIAL_CACHE_KEY);
  PropertiesService.getScriptProperties().deleteProperty(TESTIMONIAL_CACHE_KEY);
  Logger.log("Testimonials cache CLEARED manually");
}

/* --------------------------------------------------------
 * ONE-TIME SETUP — install 6-hour auto refresh trigger
 * --------------------------------------------------------*/
function setupTestimonialsAutoRefresh() {
  // Remove existing triggers for safety
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "refreshTestimonialsCache_")
    .forEach(t => ScriptApp.deleteTrigger(t));

  // Create new trigger
  ScriptApp.newTrigger("refreshTestimonialsCache_")
    .timeBased()
    .everyHours(6)
    .create();

  Logger.log("Testimonials auto-refresh trigger INSTALLED (6h)");
}
