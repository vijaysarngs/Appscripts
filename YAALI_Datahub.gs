/************************************************************
 * YAALI DATAHUB — FINAL PRODUCTION VERSION (Library + API)
 * ----------------------------------------------------------
 * Reads "MasterData" sheet
 * Reads "extra_testimony" sheet for testimonials
 * Caches + backs up project data (TTL = 6 hours)
 * API endpoint: ?action=getProjects | ?action=ping
 * Auto refresh trigger: every 6 hours
 * uses library methods for dashboards:
 * → getProjectsForDashboard()
 * → getRegionCountryHintsForDashboard()
 * → getProjectsWithRegion()
 ************************************************************/

//trigger prod once refreshProjectsCache_Test once for the initial build ,run manually


/** 🔧 Load configuration from Script Properties */
function getConfig_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty("SHEET_ID");
  const name = p.getProperty("SHEET_NAME");
  const key = p.getProperty("CACHE_KEY");
  const ttl = Number(p.getProperty("CACHE_TTL")) || 21600; // 6 hours
  const testimonySheet = p.getProperty("TESTIMONY_SHEET_NAME") || "testimonials";
  if (!id || !name || !key)
    throw new Error(" Missing Script Properties (SHEET_ID / SHEET_NAME / CACHE_KEY)");
  return { id, name, key, ttl, testimonySheet };
}


/** 🌐 Web API Endpoint — JSON only */
function doGet(e) {
  try {
    const action = (e?.parameter?.action || "").toLowerCase();

    if (action === "ping") {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "ok", time: new Date().toISOString() }, null, 2))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getprojects") {
      const { source, data } = getProjectsData_(false);
      return ContentService
        .createTextOutput(JSON.stringify({ source, count: data.length, data }, null, 2))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        error: "Invalid endpoint. Use ?action=getProjects or ?action=ping"
      }, null, 2))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error("doGet error:", err);
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


/** ⚙️ Cache → Backup → Rebuild logic */
function getProjectsData_(verbose = false) {
  const { id, name, key, ttl } = getConfig_();
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  let json = cache.get(key);

  if (json) return { source: "cache", data: JSON.parse(json) };

  json = props.getProperty(key);
  if (json) {
    cache.put(key, json, ttl);
    return { source: "backup", data: JSON.parse(json) };
  }

  const fresh = buildProjectsData_All_(verbose);
  json = JSON.stringify(fresh);
  cache.put(key, json, ttl);
  props.setProperty(key, json);
  return { source: "rebuild", data: fresh };
}


/** 📝 Fetch testimonials as a map: projectName → array of text (for embedding into project rows) */
function getTestimonialsMap_(verbose = false) {
  const records = getTestimonials_(verbose);
  const map = {};
  records.forEach(t => {
    const key = (t.projectName || "").trim().toLowerCase();
    if (!key) return;
    if (!map[key]) map[key] = [];
    map[key].push(t.testimonial);
  });
  return map;
}


/** 📝 Fetch all testimonial records from the extra_testimony sheet */
function getTestimonials_(verbose = false) {
  const { id, testimonySheet } = getConfig_();
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName(testimonySheet);

  if (!sh) {
    console.warn(`⚠️ Testimony sheet "${testimonySheet}" not found. Skipping testimonials.`);
    return [];
  }

  const values = sh.getDataRange().getDisplayValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(h => (h || "").trim().toLowerCase());

  // Map to known columns: Project Name, Name, Region, Testimonial, Video Link, Date, Processed
  const idx = {
    projectName: headers.indexOf("project name"),
    name:        headers.indexOf("name"),
    region:      headers.indexOf("region"),
    testimonial: headers.indexOf("testimonial"),
    videoLink:   headers.indexOf("video link"),
    date:        headers.indexOf("date"),
    processed:   headers.indexOf("processed")
  };

  if (verbose) {
    console.log(`Testimony sheet headers: ${JSON.stringify(headers)}`);
    console.log(`Column indices: ${JSON.stringify(idx)}`);
  }

  const results = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row || row.every(v => String(v || "").trim() === "")) continue;

    const testimonial = idx.testimonial !== -1 ? (row[idx.testimonial] || "").trim() : "";
    if (!testimonial) continue; // skip rows without testimonial text

    results.push({
      projectName: idx.projectName !== -1 ? (row[idx.projectName] || "").trim() : "",
      name:        idx.name !== -1        ? (row[idx.name] || "").trim()        : "",
      region:      idx.region !== -1      ? (row[idx.region] || "").trim()      : "",
      testimonial: testimonial,
      videoLink:   idx.videoLink !== -1   ? (row[idx.videoLink] || "").trim()   : "",
      date:        idx.date !== -1        ? (row[idx.date] || "").trim()        : "",
      processed:   idx.processed !== -1   ? (row[idx.processed] || "").trim()   : ""
    });
  }

  if (verbose) {
    console.log(`Loaded ${results.length} testimonial records`);
  }

  return results;
}


/** 🧱 Build structured project dataset */
function buildProjectsData_All_(verbose = false) {
  const { id, name } = getConfig_();
  const sh = SpreadsheetApp.openById(id).getSheetByName(name);
  const values = sh.getDataRange().getDisplayValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(h => (h || "").trim().toLowerCase());
  
  // MAP HEADERS HERE (startDate, sharedDate removed; testimonials now from extra_testimony)
  const idx = {
    name: headers.indexOf("name of the project"),
    projectDescription: headers.indexOf("project description"),
    kindOfProject: headers.indexOf("kind of project"),
    projectType: headers.indexOf("project type"),
    status: headers.indexOf("status"),
    country: headers.indexOf("country"),
    completedDate: headers.indexOf("project  completed date"), // Note: kept the double space from your snippet
    ta: headers.indexOf("ta"),
    indication: headers.indexOf("indication"),
    output1: headers.indexOf("output - 1"),
    output2: headers.indexOf("output -2"),
    accessPreferenceRestriction: headers.indexOf("access preference restriction")
  };

  const allowed = ["completed", "on track", "pipeline"];

  // Fetch testimonials map from extra_testimony sheet
  const testimonialsMap = getTestimonialsMap_(verbose);

  const rows = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row || row.every(v => String(v || "").trim() === "")) continue;
    
    // Normalize status
    const status = String(row[idx.status] || "").toLowerCase();
    
    // Filter logic
    if (!allowed.includes(status)) continue;

    const projectName = row[idx.name];
    const projectNameKey = (projectName || "").trim().toLowerCase();

    // Look up testimonials from the extra_testimony sheet
    const testimonials = testimonialsMap[projectNameKey] || [];

    rows.push({
      name: projectName,
      projectDescription: row[idx.projectDescription],
      kindOfProject: row[idx.kindOfProject],
      projectType: row[idx.projectType],
      status: status, // stored normalized
      country: row[idx.country],
      completedDate: row[idx.completedDate],
      TA: row[idx.ta],
      indication: row[idx.indication],
      output1: row[idx.output1],
      output2: row[idx.output2],
      accessPreferenceRestriction: row[idx.accessPreferenceRestriction],
      testimonials: testimonials // array of testimonials from extra_testimony sheet
    });
  }

  console.log(`Built ${rows.length} valid project rows`);
  return rows;
}


/** 🧩 Manual cache rebuild */
function refreshProjectsCache_Test() {
  const { key, ttl } = getConfig_();
  const data = buildProjectsData_All_(true);
  const json = JSON.stringify(data);
  CacheService.getScriptCache().put(key, json, ttl);
  PropertiesService.getScriptProperties().setProperty(key, json);
  console.log(`Manual rebuild @ ${new Date().toLocaleString()} (${data.length} rows)`);
}


/** ⏰ Scheduled auto-refresh trigger */
function refreshProjectsCache_Auto() {
  try {
    const { key, ttl } = getConfig_();
    const data = buildProjectsData_All_(false);
    const json = JSON.stringify(data);
    CacheService.getScriptCache().put(key, json, ttl);
    PropertiesService.getScriptProperties().setProperty(key, json);
    console.log(`Auto refresh @ ${new Date().toLocaleString()} (${data.length} rows)`);
  } catch (err) {
    console.error("Trigger error:", err);
  }
}


/** 🧠 One-time setup trigger */
function setup_AutoRefresh_Trigger_Prod() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("refreshProjectsCache_Auto")
    .timeBased().everyHours(6).create();
  console.log("Production trigger created (every 6 hours)");
}


/************************************************************
 * 📦 PUBLIC LIBRARY INTERFACE (for dashboards)
 ************************************************************/

/** 📊 Public: fetch testimonial records for dashboards */
function getTestimonialsForDashboard() {
  return getTestimonials_(false);
}

function getProjectsForDashboard() {
  const { data } = getProjectsData_(false);
  return data;
}

function getRegionCountryHintsForDashboard() {
  return {
    'i8': ['Spain', 'China', 'Germany', 'Brazil', 'Canada', 'United Kingdom', 'France', 'Italy'],
    'Europe-North': ['Belgium', 'Luxembourg', 'Czechia', 'Denmark', 'Finland', 'Ireland', 'Lithuania', 'Netherlands', 'Norway', 'Poland', 'Sweden'],
    'Europe-South': ['Austria', 'Croatia', 'Greece', 'Hungary', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Switzerland', 'Spain', 'France'],
    'APAC': ['Australia', 'Hong Kong', 'Indonesia', 'Malaysia', 'New Zealand', 'Philippines', 'Singapore', 'South Korea', 'Taiwan', 'Thailand', 'Vietnam'],
    'CEETRIS': ['Bangladesh', 'India', 'Pakistan', 'Russia', 'Ukraine', 'Moldova', 'Kazakhstan', 'Serbia', 'Albania', 'Bosnia and Herzegovina'],
    'Africa': ['Algeria', 'Congo', 'Morocco', 'South Africa', 'Tunisia', 'Libya', 'Kenya', 'Ethiopia', 'Ghana', 'Nigeria', "Côte d'Ivoire"],
    'LATAM': ['Argentina', 'Chile', 'Colombia', 'Ecuador', 'Mexico', 'Peru', 'Uruguay', 'Bolivia', 'Paraguay', 'Venezuela', 'Guatemala', 'Costa Rica', 'Panama', 'Dominican Republic'],
    'Middle East': ['Egypt', 'Kuwait', 'Qatar', 'Oman', 'Jordan', 'Lebanon', 'Saudi Arabia', 'United Arab Emirates', 'Israel', 'Turkey', 'Iran'],
    'Global': ['Global']
  };
}

function getProjectsWithRegion() {
  const { data } = getProjectsData_(false);
  const regionHints = getRegionCountryHintsForDashboard();
  return data.map(p => ({ ...p, region: inferRegionFromCountry_(p.country, regionHints) }));
}

function inferRegionFromCountry_(countryString, regionHints) {
  if (!countryString) return 'Unassigned';
  const countries = countryString.split(/[,;&]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
  if (countries.includes('global')) return 'Global';
  for (const [region, list] of Object.entries(regionHints)) {
    const lowerList = list.map(c => c.toLowerCase());
    if (countries.some(c => lowerList.includes(c))) return region;
  }
  return 'Unassigned';
}


/** 🐞 DEBUG FUNCTION: Run this manually to check Access Preference Restriction column */
function debug_ComplianceCheck() {
  const { id, name } = getConfig_();
  const sh = SpreadsheetApp.openById(id).getSheetByName(name);
  const data = sh.getDataRange().getDisplayValues();
  
  if (data.length < 1) {
    console.error("❌ Sheet is empty!");
    return;
  }

  // 1. Inspect Headers
  const rawHeaders = data[0];
  const cleanHeaders = rawHeaders.map(h => (h || "").trim().toLowerCase());
  
  console.log("--- HEADERS FOUND ---");
  console.log(cleanHeaders);

  // 2. Find Access Preference Restriction Index
  const aprIndex = cleanHeaders.indexOf("access preference restriction");
  
  if (aprIndex === -1) {
    console.error("❌ FAILURE: Could not find a column named 'access preference restriction'.");
    console.warn("👉 Please rename your sheet column to 'Access Preference Restriction' exactly.");
  } else {
    console.log(`✅ SUCCESS: 'Access Preference Restriction' column found at Index [${aprIndex}] (Column ${aprIndex + 1})`);
    
    // 3. Preview Data (First 3 rows)
    console.log("--- DATA PREVIEW ---");
    for (let i = 1; i < Math.min(data.length, 4); i++) {
      const row = data[i];
      const projectName = row[0]; // Assuming Name is Col 1
      const aprValue = row[aprIndex];
      console.log(`Row ${i+1}: Project "${projectName}" | Access Preference Restriction Value: "${aprValue}"`);
    }
  }
}


/** 🐞 DEBUG FUNCTION: Run this manually to check Testimony sheet */
function debug_TestimonyCheck() {
  const { id, testimonySheet } = getConfig_();
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName(testimonySheet);

  if (!sh) {
    console.error(`❌ Sheet "${testimonySheet}" not found!`);
    console.warn('👉 Make sure TESTIMONY_SHEET_NAME is set in Script Properties');
    return;
  }

  const data = sh.getDataRange().getDisplayValues();
  if (data.length < 1) {
    console.error("❌ Testimony sheet is empty!");
    return;
  }

  const headers = data[0].map(h => (h || "").trim().toLowerCase());
  console.log("--- TESTIMONY HEADERS ---");
  console.log(headers);

  console.log("--- FIRST 5 ROWS ---");
  for (let i = 1; i < Math.min(data.length, 6); i++) {
    console.log(`Row ${i + 1}: ${JSON.stringify(data[i])}`);
  }

  // Test the map builder
  const map = getTestimonialsMap_(true);
  console.log(`Total projects with testimonials: ${Object.keys(map).length}`);
}
