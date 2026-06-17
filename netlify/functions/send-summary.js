/**
 * Scheduled function: Post-Call Summary Email
 * Runs every Tuesday at 15:00 UTC (7:00 AM Pacific Time)
 * Sends action items and decisions from the previous day's call
 */

const https = require('https');

const TENANT_ID     = process.env.TENANT_ID;
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SENDER        = process.env.SENDER_EMAIL || 'andrea@moleaer.com';
const NOTION_KEY    = process.env.NOTION_KEY;
const DB_SETTINGS   = process.env.NOTION_DB_SETTINGS;
const DB_ACTIONS    = process.env.NOTION_DB_ACTIONS;
const DB_DECISIONS  = process.env.NOTION_DB_DECISIONS;
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

async function getActions() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const since = yesterday.toISOString().split('T')[0];

  const d = await notionQuery(DB_ACTIONS, {
    filter: {
      and: [
        { property: 'Status', select: { does_not_equal: 'Done' } },
        { timestamp: 'created_time', created_time: { on_or_after: since + 'T00:00:00.000Z' } }
      ]
    },
    sorts: [{ property: 'Owner', direction: 'ascending' }]
  });

  return (d.results || []).map(p => ({
    task:     p.properties['Task']?.title?.[0]?.plain_text || '',
    owner:    p.properties['Owner']?.select?.name || '',
    priority: p.properties['Priority']?.select?.name || 'Normal',
    status:   p.properties['Status']?.select?.name || 'Not Started',
    due:      p.properties['Due Date']?.date?.start || '',
  }));
}

async function getDecisions() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const since = yesterday.toISOString().split('T')[0];

  const d = await notionQuery(DB_DECISIONS, {
    filter: {
      timestamp: 'created_time',
      created_time: { on_or_after: since + 'T00:00:00.000Z' }
    },
    sorts: [{ timestamp: 'created_time', direction: 'ascending' }]
  });

  return (d.results || []).map(p => ({
    text: p.properties['Decision']?.title?.[0]?.plain_text || '',
  }));
}

function priorityColor(p) {
  if (p === 'Urgent') return '#c0392b';
  if (p === 'High')   return '#e67e22';
  return '#27ae60';
}

function fmtDate(d) {
  if (!d) return 'Monday';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

exports.handler = async () => {
  try {
    const settings = await getSettings();
    const callDate = fmtDate(settings.meetingDate);
    const [actions, decisions, token] = await Promise.all([getActions(), getDecisions(), getToken()]);

    // Group actions by owner
    const byOwner = {};
    actions.forEach(a => {
      if (!byOwner[a.owner]) byOwner[a.owner] = [];
      byOwner[a.owner].push(a);
    });

    // Build action items table grouped by owner
    let actionRows = '';
    if (actions.length === 0) {
      actionRows = `<tr><td colspan="3" style="padding:12px;color:#888;font-style:italic">No new action items from this call.</td></tr>`;
    } else {
      Object.entries(byOwner).sort(([a],[b]) => a.localeCompare(b)).forEach(([owner, items]) => {
        actionRows += `<tr><td colspan="3" style="padding:6px 12px;background:#1b75bb;color:#fff;font-weight:bold;font-size:12px">${owner.toUpperCase()}</td></tr>`;
        items.forEach(i => {
          const badge = `<span style="background:${priorityColor(i.priority)};color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;margin-left:6px">${i.priority}</span>`;
          const due = i.due ? `<span style="color:#888;font-size:11px"> &mdash; Due ${i.due}</span>` : '';
          actionRows += `<tr style="border-bottom:1px solid #eee">
            <td style="padding:8px 12px">${i.task}${badge}${due}</td>
          </tr>`;
        });
      });
    }

    // Build decisions list
    let decisionRows = '';
    if (decisions.length === 0) {
      decisionRows = `<li style="color:#888;font-style:italic">No decisions logged from this call.</li>`;
    } else {
      decisions.forEach(d => {
        decisionRows += `<li style="margin-bottom:6px">${d.text}</li>`;
      });
    }

    const html = `
<p>Hi team,</p>
<p><a href="${PORTAL}" style="display:inline-block;background:#1b75bb;color:#fff;padding:10px 20px;border-radius:7px;text-decoration:none;font-weight:700;font-size:14px;margin-bottom:14px">&#127760; Open Misfit Island Hub</a></p>
<p>Here is a summary of action items and decisions from our <strong>Misfit Island call on ${callDate}</strong>.</p>

<h3 style="color:#1b75bb;margin-bottom:8px">&#9989; Action Items (${actions.length})</h3>
<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin-bottom:24px">
  ${actionRows}
</table>

<h3 style="color:#1b75bb;margin-bottom:8px">&#127919; Decisions (${decisions.length})</h3>
<ul style="font-family:Arial,sans-serif;font-size:14px;padding-left:20px;margin-bottom:24px">
  ${decisionRows}
</ul>

<p style="color:#888;font-size:12px">Action items and decisions are tracked in the hub. Update your status before next Monday's call.</p>
<p>Thanks,<br>Misfit Island Hub</p>`;

    const res = await req('graph.microsoft.com', `/v1.0/users/${SENDER}/sendMail`, 'POST',
      { 'Authorization': `Bearer ${token}` },
      { message: {
          subject: `Misfit Island Summary — ${callDate}`,
          body: { contentType: 'HTML', content: html },
          toRecipients: TO_LIST
        },
        saveToSentItems: true
      }
    );

    if (res?.error) throw new Error(res.error.message);
    console.log('Summary sent for', callDate, '- actions:', actions.length, 'decisions:', decisions.length);
    return { statusCode: 200, body: JSON.stringify({ success: true, actions: actions.length, decisions: decisions.length }) };

  } catch(err) {
    console.error('Summary failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
