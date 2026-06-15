const https = require('https');

function notionReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.notion.com', path, method,
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async () => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    // Walk up the block tree to find a real page
    let parentId = process.env.NOTION_DB_ACTIONS;
    let pageId = null;
    
    for (let i = 0; i < 5; i++) {
      const obj = await notionReq('GET', `/v1/blocks/${parentId}`);
      if (obj.object === 'error') break;
      if (obj.type === 'child_page' || obj.parent?.type === 'workspace') {
        pageId = obj.id;
        break;
      }
      if (obj.parent?.page_id) { pageId = obj.parent.page_id; break; }
      if (obj.parent?.block_id) { parentId = obj.parent.block_id; continue; }
      break;
    }

    if (!pageId) {
      // Fallback: search for any page the integration can access
      const search = await notionReq('POST', '/v1/search', {
        filter: { value: 'page', property: 'object' },
        page_size: 5,
      });
      const page = search.results?.find(r => r.object === 'page');
      if (page) pageId = page.id;
    }

    if (!pageId) throw new Error('Could not find a parent page. Please create the Hub Settings database manually in Notion.');

    // Create Settings DB under the found page
    const db = await notionReq('POST', '/v1/databases', {
      parent: { type: 'page_id', page_id: pageId },
      title: [{ type: 'text', text: { content: 'Hub Settings' } }],
      properties: { 'Key': { title: {} }, 'Value': { rich_text: {} } },
    });
    if (db.object === 'error') throw new Error(db.message);

    await notionReq('POST', '/v1/pages', {
      parent: { database_id: db.id },
      properties: {
        'Key': { title: [{ text: { content: 'meetingDate' } }] },
        'Value': { rich_text: [{ text: { content: '2026-06-09' } }] },
      },
    });
    await notionReq('POST', '/v1/pages', {
      parent: { database_id: db.id },
      properties: {
        'Key': { title: [{ text: { content: 'meetingTime' } }] },
        'Value': { rich_text: [{ text: { content: '07:30' } }] },
      },
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        dbId: db.id,
        instruction: `Add to Netlify Environment Variables: NOTION_DB_SETTINGS = ${db.id}`,
      }),
    };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
