const https = require('https');

const NOTION_KEY = process.env.NOTION_KEY;
const DB = {
  actions:   process.env.NOTION_DB_ACTIONS,
  agenda:    process.env.NOTION_DB_AGENDA,
  decisions: process.env.NOTION_DB_DECISIONS,
};

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

  // Step 1: Test token
  try {
    const me = await notionRequest('GET', '/v1/users/me', null);
    results.token = me.object === 'error'
      ? { ok: false, error: me.message }
      : { ok: true, type: me.type, name: me.name || me.bot?.owner?.user?.name };
  } catch(e) {
    results.token = { ok: false, error: e.message };
  }

  // Step 2: Test read from each database
  for (const [key, dbId] of Object.entries(DB)) {
    try {
      const res = await notionRequest('POST', `/v1/databases/${dbId}/query`, { page_size: 1 });
      results[`read_${key}`] = res.object === 'error'
        ? { ok: false, error: res.message, code: res.code }
        : { ok: true, count: res.results?.length };
    } catch(e) {
      results[`read_${key}`] = { ok: false, error: e.message };
    }
  }

  // Step 3: Test write to Action Items
  try {
    const res = await notionRequest('POST', '/v1/pages', {
      parent: { database_id: DB.actions },
      properties: {
        'Task': { title: [{ text: { content: 'TEST ENTRY — safe to delete' } }] },
        'Status': { select: { name: 'In Progress' } },
        'Priority': { select: { name: 'Normal' } },
      },
    });
    if (res.object === 'error') {
      results.write_test = { ok: false, error: res.message, code: res.code };
    } else {
      results.write_test = { ok: true, created_id: res.id };
      // Clean up — archive the test entry
      await notionRequest('PATCH', `/v1/pages/${res.id}`, { archived: true });
      results.write_test.cleaned_up = true;
    }
  } catch(e) {
    results.write_test = { ok: false, error: e.message };
  }

  const allOk = results.token?.ok &&
    results.read_actions?.ok &&
    results.read_agenda?.ok &&
    results.read_decisions?.ok &&
    results.write_test?.ok;

  return {
    statusCode: 200, headers,
    body: JSON.stringify({ allOk, results }, null, 2),
  };
};
