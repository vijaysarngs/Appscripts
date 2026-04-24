/**
 * Submit-a-Project Web App (Email-only)
 *
 * Required Script Properties:
 * - RECEIVER_EMAIL
 * - MAX_FILES
 * - MAX_FILE_MB
 * - TOTAL_SUBMISSIONS (Will be auto-created by the script)
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Submit a Project to Team Yaali')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getConfig() {
  const p = PropertiesService.getScriptProperties();
  return {
    maxFiles: Number(p.getProperty('MAX_FILES')) || 3,
    maxFileMB: Number(p.getProperty('MAX_FILE_MB')) || 7,
    receiverEmail: p.getProperty('RECEIVER_EMAIL')
  };
}

// NEW FUNCTION: Fetches the current count for the frontend
function getSubmissionCount() {
  const p = PropertiesService.getScriptProperties();
  let count = p.getProperty('TOTAL_SUBMISSIONS');
  if (!count) {
    count = '0';
    p.setProperty('TOTAL_SUBMISSIONS', count);
  }
  return parseInt(count, 10);
}

function submitProject(payload) {
  const p = PropertiesService.getScriptProperties();

  const receiver  = must_(p.getProperty('RECEIVER_EMAIL'), 'RECEIVER_EMAIL not set');
  const maxFiles  = Number(p.getProperty('MAX_FILES')) || 3;
  const maxFileMB = Number(p.getProperty('MAX_FILE_MB')) || 7;

  if (!payload || typeof payload !== 'object') {
    return { ok:false, message:'Invalid submission payload.' };
  }

  // DESTRUCTURING NEW FIELDS
  const {
    name='NA', email='NA', 
    projectTitle='NA', country='NA', venue='NA', 
    diseaseArea='NA', therapeuticArea='NA',
    deadline='NA', description='NA', 
    goals=[], otherGoal='',
    copyRequest=false, linksText='', files=[]
  } = payload;

  if (files.length > maxFiles) {
    return { ok:false, message:`Maximum ${maxFiles} files allowed.` };
  }

  const attachments = [];
  for (const f of files) {
    const raw = Utilities.base64Decode(f.bytes || '');
    if (raw.length > maxFileMB * 1024 * 1024) {
      return { ok:false, message:`"${f.filename}" exceeds ${maxFileMB} MB.` };
    }
    attachments.push(
      Utilities.newBlob(raw, f.mimeType || 'application/octet-stream', f.filename)
    );
  }

  const goalsText = Array.isArray(goals) ? goals.join(', ') : goals;

  // CONSTRUCT EMAIL BODY
  const bodyHtml = `
    <h2>New Project Submission</h2>
    <b>Requestor (Affiliate):</b> ${esc_(name)}<br/>
    <b>Email:</b> ${esc_(email)}<br/>
    <hr>
    <b>Project Title:</b> ${esc_(projectTitle)}<br/>
    <b>Country/Region:</b> ${esc_(country)}<br/>
    <b>Venue:</b> ${esc_(venue)}<br/>
    <br/>
    <b>Disease Area:</b> ${esc_(diseaseArea)}<br/>
    <b>Therapeutic Area:</b> ${esc_(therapeuticArea)}<br/>
    <b>Deadline:</b> ${esc_(deadline)}<br/>
    <hr>
    <b>Description:</b><br/>
    ${nl2br_(esc_(description))}<br/><br/>

    <b>Goals:</b> ${esc_(goalsText)}<br/>
    ${otherGoal ? `<b>Other Goal:</b> ${esc_(otherGoal)}<br/>` : ''}
    ${linksText ? `<br/><b>Links:</b><br/>${nl2br_(esc_(linksText))}` : ''}
  `;

  // SEND EMAIL TO ADMIN
  MailApp.sendEmail({
    to: receiver,
    subject: `Yaali Gsite Project Request`,
    htmlBody: bodyHtml,
    attachments,
    replyTo: normalizeEmail_(email)
  });

  // SEND COPY TO USER (IF REQUESTED)
  if (copyRequest && email && normalizeEmail_(email) !== receiver) {
    MailApp.sendEmail({
      to: normalizeEmail_(email),
      subject: `Yaali Gsite Project Request`,
      htmlBody: bodyHtml,
      attachments
    });
  }

  // --- NEW LOGIC: INCREMENT AND SAVE THE COUNTER ---
  let currentCount = parseInt(p.getProperty('TOTAL_SUBMISSIONS') || '0', 10);
  let newCount = currentCount + 1;
  p.setProperty('TOTAL_SUBMISSIONS', newCount.toString());

  // Return the newTotal so the HTML page can update immediately
  return { ok:true, message:'Your project has been submitted successfully.', newTotal: newCount };
}

/* -------- HELPERS -------- */
function must_(v, msg){ if (!v) throw new Error(msg); return v; }
function esc_(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function nl2br_(s){ return String(s||'').replace(/\n/g,'<br/>'); }
function normalizeEmail_(e){
  if (!e) return null;
  return String(e).trim().toLowerCase().replace(/^mailto:/,'').replace(/\+.*@/,'@');
}
