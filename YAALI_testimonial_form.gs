/************************************************************
 * YAALI Testimonials — ALL DATA GOES TO EXTRA SHEET
 ************************************************************/

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('YAALI Project Testimonials')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const SS_ID = props.getProperty('SS_ID');
  const SHEET_NAME = props.getProperty('SHEET_NAME') || 'MasterData';
  const MAX_FILE_MB = 50;

  const ss = SpreadsheetApp.openById(SS_ID);
  const sh = ss.getSheetByName(SHEET_NAME);
  const values = sh.getDataRange().getDisplayValues();

  // We still read MasterData just to populate the dropdown menu in the HTML
  const headers = values[0].map(h => h.toLowerCase().trim());
  const col = headers.indexOf("name of the project");
  const projects = [];

  if (col >= 0) {
    for (let i = 1; i < values.length; i++) {
      const p = values[i][col];
      if (p) projects.push(p);
    }
  }

  return { projects, MAX_FILE_MB };
}

/*********************** MAIN SUBMISSION LOGIC
************************/

function submitTestimonial(form) {
  const props = PropertiesService.getScriptProperties();
  const SS_ID = props.getProperty('SS_ID');
  const FOLDER_ID = props.getProperty('FOLDER_ID');
  const EXTRA_SHEET = props.getProperty('EXTRA_SHEET'); // extra_testimony
  const MAX_FILE_MB = 50;

  const ss = SpreadsheetApp.openById(SS_ID);
  const extra  = ss.getSheetByName(EXTRA_SHEET);

  if (!extra) {
    throw new Error(`❌ Extra testimony sheet ("${EXTRA_SHEET}") not found.`);
  }

  // ---------- Upload video ----------
  let videoLink = "";
  if (form.fileData) {
    const bytes = Utilities.base64Decode(form.fileData);
    const sizeMB = bytes.length / (1024 * 1024);
    if (sizeMB > MAX_FILE_MB) throw new Error("File too large.");

    const blob = Utilities.newBlob(bytes, form.mimeType, form.fileName);
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    videoLink = file.getUrl();
  }

  const submissionDate = new Date().toISOString();

  // ---------- ALL SUBMISSIONS GO TO EXTRA SHEET ----------
  // Append data across unique columns
  // Structure: [Project, Name, Region, Testimonial, Video Link, Date, Processed Status]
  extra.appendRow([
    form.projectName,
    form.orgName,    // <--- Added the Name field right here
    form.region,
    form.testimonial,
    videoLink,
    submissionDate,
    "NO" // Defaults the cell value to NO
  ]);

  // Apply a Dropdown validation to the newly added "Status" cell (Shifted to Column 7 / G)
  const lastRow = extra.getLastRow();
  const statusCell = extra.getRange(lastRow, 7); 
  
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['NO', 'YES'], true) // 'true' forces the dropdown arrow to appear
    .build();
    
  statusCell.setDataValidation(rule);

  return { status: "success", target: "extra" };
}
