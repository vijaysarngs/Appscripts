/**
 * YAALI Global Metrics – container script
 * Uses YAALI_DataHub library for all data.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Yaali Global Metrics')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Combined data for the metrics dashboard.
 * Returns { projects: [...], testimonials: [...] }
 * - projects: rows with region from MasterData sheet
 * - testimonials: records from extra_testimony sheet
 */
function getMetricsData() {
  // Library must be added as YAALI_DataHub
  var projects = YAALI_DataHub.getProjectsWithRegion() || [];
  var testimonials = YAALI_DataHub.getTestimonialsForDashboard() || [];
  return { projects: projects, testimonials: testimonials };
}
