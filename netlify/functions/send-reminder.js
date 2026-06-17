/**
 * Scheduled function: Pre-Call Reminder
 * Runs every Friday at 15:00 UTC (7:00 AM Pacific Time)
 */

const https = require('https');

const TENANT_ID     = process.env.TENANT_ID;
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SENDER        = process.env.SENDER_EMAIL || 'andrea@moleaer.com';
const NOTION_KEY    = process.env.NOTION_KEY;
const DB_SETTINGS   = process.env.NOTION_DB_SETTINGS;
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

async function getSettings() {
  const d = await req('api.notion.com', `/v1/databases/${DB_SETTINGS}/query`, 'POST',
    { 'Authorization': `Bearer ${NOTION_KEY}`, 'Notion-Version': '2022-06-28' }, {});
  const s = {};
  (d.results || []).forEach(p => {
    const k = p.properties['Key']?.title?.[0]?.plain_text;
    const v = p.properties['Value']?.rich_text?.[0]?.plain_text;
    if (k) s[k] = v;
  });
  return s;
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
    const date = fmtDate(settings.meetingDate);
    const time = fmtTime(settings.meetingTime);
    const token = await getToken();

    const html = `<p>Hi team,</p>
<p><a href="${PORTAL}" style="display:inline-block;background:#1b75bb;color:#fff;padding:10px 20px;border-radius:7px;text-decoration:none;font-weight:700;font-size:14px;margin-bottom:14px">&#127760; Open Misfit Island Hub</a></p>
<p>Just a reminder that our <strong>Misfit Island Water Process call</strong> is on <strong>${date} at ${time}</strong>.</p>
<p>Before the call, please:</p>
<ul>
  <li>Add any agenda items you want to cover (<strong>Agenda tab</strong>)</li>
  <li>Update the status of your open action items (<strong>Actions tab</strong>)</li>
</ul>
<p>Thanks,<br>Misfit Island Hub</p>`;

    const res = await req('graph.microsoft.com', `/v1.0/users/${SENDER}/sendMail`, 'POST',
      { 'Authorization': `Bearer ${token}` },
      { message: { subject: `Misfit Island Reminder — Add Agenda Items for ${date}`,
          body: { contentType: 'HTML', content: html }, toRecipients: TO_LIST },
        saveToSentItems: true }
    );
    if (res?.error) throw new Error(res.error.message);
    console.log('Reminder sent for', date);
    return { statusCode: 200, body: JSON.stringify({ success: true, date }) };
  } catch(err) {
    console.error('Reminder failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
