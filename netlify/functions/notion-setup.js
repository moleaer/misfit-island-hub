const https = require('https');

const NOTION_KEY = process.env.NOTION_KEY;
const DB = {
  actions:   process.env.NOTION_DB_ACTIONS,
  agenda:    process.env.NOTION_DB_AGENDA,
  decisions: process.env.NOTION_DB_DECISIONS,
};

const TEAM = ['Baji','Cesar','Andrea','Cody','John','Sarah','Riley','Christian','Rachel','Jenn','Patrick','Sam'];
const SECTIONS = ['Commercial','Product Development','Marketing','Conferences','Other'];

function notionRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.notion.com', path, method,
      headers: {
        'Authorization': `Bearer ${NOTION_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(new Error(raw)); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const results = {};

  try {
    // Add Decision Maker field to Decisions database
    results.decisions = await notionRequest('PATCH', `/v1/databases/${DB.decisions}`, {
      properties: {
        'Decision':        { title: {} },
        'Section':         { select: { options: SECTIONS.map(s => ({ name: s })) } },
        'Date':            { date: {} },
        'From Transcript': { checkbox: {} },
        'Notes':           { rich_text: {} },
        'Decision Maker':  { select: { options: TEAM.map(n => ({ name: n })) } },
      },
    });

    // Also ensure Action Items has all select options populated
    results.actions = await notionRequest('PATCH', `/v1/databases/${DB.actions}`, {
      properties: {
        'Status': { select: { options: [
          { name: 'In Progress', color: 'orange' },
          { name: 'On Hold',     color: 'yellow' },
          { name: 'Delayed',     color: 'red'    },
          { name: 'Done',        color: 'green'  },
        ]}},
        'Priority': { select: { options: [
          { name: 'Urgent', color: 'red'    },
          { name: 'High',   color: 'orange' },
          { name: 'Normal', color: 'green'  },
        ]}},
        'Owner':   { select: { options: TEAM.map(n => ({ name: n })) } },
        'Section': { select: { options: SECTIONS.map(s => ({ name: s })) } },
      },
    });

    const ok = results.decisions.object !== 'error' && results.actions.object !== 'error';

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: ok,
        message: ok ? 'Decision Maker field added and select options confirmed' : 'Some errors occurred',
        decisions_error: results.decisions.message,
        actions_error: results.actions.message,
      }),
    };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
