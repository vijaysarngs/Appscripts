/************************************************************
 * YAALI_LANDING_PAGE_MAP — FINAL PRODUCTION VERSION
 * ----------------------------------------------------------
 * Fetches cached projects directly from YAALI_DataHub
 * Uses the DataHub’s 6-hour cache (no local cache needed)
 * Safe fallback (returns empty array if DataHub unavailable)
 ************************************************************/

/**
 * Web app entry point
 */
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('YAALI Global Projects Map')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Pull cached data from YAALI_DataHub
 * (replaces old getCachedProjectData)
 */
function getCachedProjectData() {
  try {
    // ✅ Directly read the 6h cached list from DataHub
    const data = YAALI_DataHub.getProjectsForDashboard();
    return {
      source: 'YAALI_DataHub',
      ts: Date.now(),
      data: data || []
    };
  } catch (err) {
    Logger.log('Failed to fetch from YAALI_DataHub: ' + err);
    return { source: 'error', ts: Date.now(), data: [], error: err.message };
  }
}

/**
 * Quick smoke test — confirms DataHub connection

function smokeTest() {
  const res = getCachedProjectData();
  Logger.log(`YAALI_DataHub returned ${res.data.length} rows (source=${res.source})`);
}
*/
