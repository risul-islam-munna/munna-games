/**
 * Dual Play — contact form handler (Google Apps Script)
 * ---------------------------------------------------------------------------
 * Receives POSTs from the contact form on games.munna.dev, verifies they are
 * human, appends a row to the bound Google Sheet, and emails a notification.
 *
 * Setup steps are in SETUP.md next to this file.
 *
 * Bot defences (in order):
 *   1. Honeypot  — a hidden "company" field the form never shows to people.
 *   2. Cloudflare Turnstile — server-side token check (once the secret is set).
 *   3. Length / required-field sanity checks.
 * Rejected submissions are dropped silently (the caller still sees "ok") so a
 * bot gets no useful signal.
 */

// ---- CONFIG ---------------------------------------------------------------
var NOTIFY_EMAIL     = 'hello@munna.dev';                      // where to email new messages
var TURNSTILE_SECRET = 'REPLACE_WITH_TURNSTILE_SECRET_KEY';    // Cloudflare Turnstile *secret* key
var SHEET_NAME       = 'Messages';                             // tab name inside the spreadsheet
// ------------------------------------------------------------------------

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};

    // 1. Honeypot
    if (p.company) return _text('ok');

    // 2. Cloudflare Turnstile (skipped until you paste a real secret)
    if (TURNSTILE_SECRET.indexOf('REPLACE') === -1) {
      var res = UrlFetchApp.fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'post',
          payload: { secret: TURNSTILE_SECRET, response: p['cf-turnstile-response'] || '' },
          muteHttpExceptions: true
        }
      );
      var verdict = JSON.parse(res.getContentText());
      if (!verdict.success) return _text('ok'); // drop silently
    }

    // 3. Sanity
    var name    = _clean(p.name, 120);
    var email   = _clean(p.email, 160);
    var subject = _clean(p.subject, 200);
    var message = _clean(p.message, 4000);
    if (!name || !email || !message || email.indexOf('@') === -1) return _text('ok');

    // Store
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Timestamp', 'Name', 'Email', 'Subject', 'Message']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), name, email, subject, message]);

    // Notify (reply-to is set to the sender so you can just hit Reply)
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      replyTo: email,
      subject: 'Dual Play contact — ' + (subject || '(no subject)'),
      body: name + ' <' + email + '>\n\n' + message + '\n\n— sent from games.munna.dev'
    });

    return _text('ok');
  } catch (err) {
    return _text('error');
  }
}

// A GET just confirms the endpoint is alive (open the /exec URL in a browser).
function doGet() {
  return _text('Dual Play contact endpoint is live.');
}

function _clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function _text(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}
