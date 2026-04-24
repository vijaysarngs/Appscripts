/* =========================================
   YAALI DASHBOARD BACKEND (Code.gs)
   ========================================= */

// 1. Entry Point
function doGet() {
  // Always serve the main dashboard, because the detail page lives at a different Web App URL
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Yaali Global Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 2. Base URL Helper (Kept for fallback purposes)
function getAppBaseUrl() {
  return ScriptApp.getService().getUrl();
}

// 3. Helper to fetch Country Hints
function getRegionCountryHints() {
  try {
    return YAALI_DataHub.getRegionCountryHintsForDashboard(); 
  } catch(e) {
    console.warn("Library not found, returning defaults.");
    // Fallback if library is missing
    return {
      'Global': ['Global'],
      'APAC': ['India', 'China', 'Australia']
    };
  }
}

// 4. Main Data Fetching Function (With Compliance Logic)
function getProjectsData() {
  let raw = [];
  
  // --- Step A: Fetch Data Safely ---
  try {
    raw = YAALI_DataHub.getProjectsWithRegion() || [];
  } catch (err) {
    console.error("CRITICAL ERROR: Could not fetch data from YAALI_DataHub. " + err.message);
    return []; // Return empty so the dashboard stops loading
  }

  // --- Step B: Helper for Token Normalization ---
  function normalizeTokens(v) {
    if (!v) return [];
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }

  // --- Step C: Helper for Region Mapping ---
  // Re-fetch hints to build local map
  const hints = getRegionCountryHints();
  const regionKeys = Object.keys(hints);
  const regionKeysLower = regionKeys.map(r => r.toLowerCase());
  const countryToRegion = {};
  regionKeys.forEach(r => (hints[r] || []).forEach(c => (countryToRegion[c.toLowerCase()] = r)));

  const out = [];
  
  if (!raw || raw.length === 0) return out;

  // --- Step D: Process Rows ---
  raw.forEach(p => {
    const name = String(p.name || '').trim();
    
    // Fix: Ensure tokens is always an array with at least 'Global'
    let tokens = normalizeTokens(p.country);
    if (tokens.length === 0) tokens = ['Global'];
    
    // Capture Compliance Column
    const complianceVal = String(p.compliance || '').trim();
    const status = String(p.status || '').toLowerCase();

    tokens.forEach(tok => {
      let region = p.region;
      // Fallback region logic if missing
      if (!region || region === 'Unassigned') {
        region = countryToRegion[tok.toLowerCase()] || 'Unassigned';
      }

      const isRegion = regionKeysLower.includes(tok.toLowerCase());
      const isGlobal = region === 'Global' || tok.toLowerCase() === 'global';
      
      out.push({
        name: name,
        projectDescription: p.projectDescription || '',
        kindOfProject: p.kindOfProject || '',
        projectType: p.projectType || '',
        status: p.status || '',
        description: p.description || '',
        startDate: p.startDate || '',
        sharedDate: p.sharedDate || '',
        completedDate: p.completedDate || '',
        TA: p.TA || '',
        indication: p.indication || '',
        output1: p.output1 || '',
        output2: p.output2 || '',
        testimonials: p.testimonials || [],
        
        // PASS COMPLIANCE TO FRONTEND
        compliance: complianceVal, 
        
        region: region,
        countryToken: tok,
        isRegionLevel: isRegion || isGlobal,
        isCountryLevel: !isRegion && !isGlobal,
        isGlobal: isGlobal
      });
    });
  });

  // Log restricted items for debugging
  const restrictedCount = out.filter(x => (x.compliance||'').toLowerCase() === 'restricted').length;
  console.log(`Backend processed ${out.length} rows. Restricted items found: ${restrictedCount}`);

  return out;
}
