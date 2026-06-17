const https = require('https');

function anthropicRequest(prompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify environment variables' }) };
  }

  try {
    const { transcript, mode } = JSON.parse(event.body);
    if (!transcript) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No transcript provided' }) };

    let prompt, maxTokens;

    if (mode === 'suggest') {
      prompt = transcript;
      maxTokens = 800;
    } else {
      prompt = `You are analyzing a Microsoft Teams meeting transcript from the Misfit Island Water Process weekly Monday call at Moleaer Inc., a nanobubble technology company.

Team members: Baji (BG - team lead), Cesar (CH), Andrea (AW), Cody (CR), John (JC), Sarah (SB), Riley (RM), Christian (CF), Rachel (RH), Jenn (JF), Patrick (PR), Sam (SL).
Sections: Commercial, Product Development, Marketing, Conferences, Other.

PRIORITY RULES for action items:
- "Urgent": explicitly time-sensitive, due today/tomorrow/within 2 days, or phrases like "ASAP", "end of day", "before the call"
- "High": commercial opportunities with active customers or deals, conference deadlines, customer-facing commitments, named accounts at risk
- "Normal": internal tasks, follow-ups without hard deadlines, research, reporting, administrative tasks

DECISION MAKER RULES:
- Identify who made or announced the decision from context
- If group consensus with no clear owner, use empty string ""

AGENDA ITEM RULES — only include items explicitly deferred or clearly unfinished:
- Items where someone said "next week", "come back to this", "put it on the agenda", or ran out of time
- Topics raised but not discussed
- Follow-ups requiring group discussion (not just one person's action item)
- Do NOT include items fully resolved or that only need one person to act
- Duration: 5 min for quick updates, 10 min for discussions, 15 min for presentations

Extract the following. Return ONLY valid JSON, no markdown, no backticks, no explanation:
{
  "actionItems": [
    { "task": "specific actionable task", "owner": "first name only", "section": "section", "priority": "Urgent|High|Normal" }
  ],
  "decisions": [
    { "text": "what was decided", "section": "section", "decisionMaker": "first name or empty string" }
  ],
  "agendaItems": [
    { "topic": "topic for next week", "presenter": "first name or empty string", "section": "section", "duration": 5, "notes": "why this needs to be on next call" }
  ],
  "speakers": ["first names of everyone who spoke"],
  "summary": "2-3 sentence summary of the call"
}

Transcript:
${transcript.slice(0, 70000)}`;
      maxTokens = 2500;
    }

    const result = await anthropicRequest(prompt, maxTokens);

    if (result.error) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: result.error.message || 'API error' }) };
    }

    const text = result.content?.[0]?.text || '{}';
    return { statusCode: 200, headers, body: JSON.stringify({ result: text }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
