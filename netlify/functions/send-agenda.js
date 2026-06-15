/**
 * Scheduled function: Agenda Email
 * Runs Monday and Tuesday at 15:00 UTC (7:00 AM Pacific Time)
 * Only sends if today matches the stored meeting date
 */

const https = require('https');

const TENANT_ID     = process.env.TENANT_ID;
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SENDER        = process.env.SENDER_EMAIL || 'andrea@moleaer.com';
const NOTION_KEY    = process.env.NOTION_KEY;
const DB_SETTINGS   = process.env.NOTION_DB_SETTINGS;
const DB_AGENDA     = process.env.NOTION_DB_AGENDA;
const PORTAL        = 'https://water-process-hub.netlify.app';

const TO_LIST = [
  'baji@moleaer.com','cesar@moleaer.com','andrea@moleaer.com','cody@moleaer.com',
  'johnc@moleaer.com','sarah@moleaer.com','riley@moleaer.com','christian@moleaer.com',
  'rachel@moleaer.com','jenn.fisher@moleaer.com','patrick.ryan@moleaer.com','sam@moleaer.com'
].map(a => ({ emailAddress: { address: a } }));

function req(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const ct = typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json';
    const r = https.request({ hostname, path, method,
      headers: { 'Content-Type': ct, ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { if (!raw) { resolve({}); return; } try { resolve(JSON.parse(raw)); } catch(e) { resolve(raw); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function getToken() {
  const body = `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&scope=https://graph.microsoft.com/.default`;
  const d = await req('login.microsoftonline.com', `/${TENANT_ID}/oauth2/v2.0/token`, 'POST', {}, body);
  if (!d.access_token) throw new Error(`Token failed: ${d.error}`);
  return d.access_token;
}

async function notionQuery(dbId, body) {
  return req('api.notion.com', `/v1/databases/${dbId}/query`, 'POST',
    { 'Authorization': `Bearer ${NOTION_KEY}`, 'Notion-Version': '2022-06-28' }, body || {});
}

async function getSettings() {
  const d = await notionQuery(DB_SETTINGS);
  const s = {};
  (d.results || []).forEach(p => {
    const k = p.properties['Key']?.title?.[0]?.plain_text;
    const v = p.properties['Value']?.rich_text?.[0]?.plain_text;
    if (k) s[k] = v;
  });
  return s;
}

async function getAgenda() {
  const d = await notionQuery(DB_AGENDA, { sorts: [{ timestamp: 'created_time', direction: 'ascending' }] });
  return (d.results || []).map(p => ({
    topic:     p.properties['Topic']?.title?.[0]?.plain_text || '',
    presenter: p.properties['Presenter']?.select?.name || '',
    section:   p.properties['Section']?.select?.name || 'Other',
    duration:  p.properties['Duration']?.number || 5,
  }));
}

function fmtDate(d) {
  if (!d) return 'Monday';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtTime(t) {
  const [h, m] = (t || '07:30').split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'} Pacific Time`;
}

exports.handler = async () => {
  try {
    const settings = await getSettings();

    // Only send if today matches the stored meeting date
    const today = new Date().toISOString().split('T')[0];
    if (settings.meetingDate && settings.meetingDate !== today) {
      console.log(`Skipping — meeting is ${settings.meetingDate}, today is ${today}`);
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'not meeting day' }) };
    }

    const date = fmtDate(settings.meetingDate);
    const time = fmtTime(settings.meetingTime);
    const items = await getAgenda();
    const token = await getToken();

    const SECTIONS = ['Commercial','Product Development','Marketing','Conferences','Other'];
    let rows = `<tr><td style="padding:8px 12px;background:#e8f4fc;font-weight:bold;color:#1b75bb">📌 STANDING — START TRANSCRIPT IN TEAMS</td><td style="padding:8px 12px;background:#e8f4fc;color:#666;text-align:right">1 min</td></tr>
<tr><td style="padding:8px 12px;background:#e8f4fc;font-weight:bold;color:#1b75bb">📌 STANDING — ACTION ITEM REVIEW</td><td style="padding:8px 12px;background:#e8f4fc;color:#666;text-align:right">10 min</td></tr>`;
    SECTIONS.forEach(sec => {
      const si = items.filter(i => i.section === sec);
      if (!si.length) return;
      rows += `<tr><td colspan="2" style="padding:6px 12px;background:#1b75bb;color:#fff;font-weight:bold;font-size:12px;text-transform:uppercase">${sec}</td></tr>`;
      si.forEach(i => {
        rows += `<tr style="border-bottom:1px solid #eee"><td style="padding:8px 12px">${i.topic}${i.presenter ? ` <span style="color:#888;font-size:12px">(${i.presenter})</span>` : ''}</td><td style="padding:8px 12px;color:#888;text-align:right">${i.duration} min</td></tr>`;
      });
    });

    const html = `<p>Hi team,</p>
<p><a href="${PORTAL}" style="display:inline-block;background:#1b75bb;color:#fff;padding:10px 20px;border-radius:7px;text-decoration:none;font-weight:700;font-size:14px;margin-bottom:14px">&#127760; Open Misfit Island Hub</a></p>
<p>Here is the agenda for our <strong>Misfit Island call on ${date} at ${time}</strong>:</p>
<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin:16px 0">${rows}</table>
<p>Thanks,<br>Misfit Island Hub</p>`;

    const res = await req('graph.microsoft.com', `/v1.0/users/${SENDER}/sendMail`, 'POST',
      { 'Authorization': `Bearer ${token}` },
      { message: { subject: `Misfit Island Agenda — ${date}`,
          body: { contentType: 'HTML', content: html }, toRecipients: TO_LIST },
        saveToSentItems: true }
    );
    if (res?.error) throw new Error(res.error.message);
    console.log('Agenda sent for', date);
    return { statusCode: 200, body: JSON.stringify({ success: true, date }) };
  } catch(err) {
    console.error('Agenda failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
