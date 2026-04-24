/************************************************************
 * - Uses YAALI_DataHub as backend cache
 * - Renders both index.html & detail.html
 ************************************************************/

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : "index";
  const tpl = HtmlService.createTemplateFromFile(page);
  tpl.params = e && e.parameter ? e.parameter : {};
  return tpl
    .evaluate()
    .setTitle("YAALI Project Cards")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getProjectData() {
  try {
    const rows = YAALI_DataHub.getProjectsForDashboard() || [];
    return rows;
  } catch (err) {
    Logger.log("getProjectData error: " + err);
    return [];
  }
}

function getAppBaseUrl() {
  return ScriptApp.getService().getUrl();
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
