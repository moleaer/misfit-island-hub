/**
 * Azure AD Permission Test Script
 * Tests Mail.Send, OnlineMeetings.Read, and Sites.Selected (SharePoint)
 * independently so you can see exactly which are live vs still pending Magna5.
 *
 * Usage:
 *   node scripts/test-azure-permissions.js
 *
 * Requires env vars (or edit the constants below directly for a one-off test):
 *   TENANT_ID, CLIENT_ID, CLIENT_SECRET, SENDER_EMAIL, SHAREPOINT_SITE_ID
 */

const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────
// Set these in your shell before running, or create a .env file and use dotenv:
//   export TENANT_ID=...
//   export CLIENT_ID=...
//   export CLIENT_SECRET=...
//   export SENDER_EMAIL=andrea@moleaer.com
//   export SHAREPOINT_SITE_ID=...  (leave unset until Sam provides it)
const TENANT_ID          = process.env.TENANT_ID;
const CLIENT_ID          = process.env.CLIENT_ID;
const CLIENT_SECRET      = process.env.CLIENT_SECRET;
const SENDER_EMAIL       = process.env.SENDER_EMAIL      || 'andrea@moleaer.com';
const SHAREPOINT_SITE_ID = process.env.SHAREPOINT_SITE_ID || null;

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ Missing credentials. Set TENANT_ID, CLIENT_ID, and CLIENT_SECRET as environment variables before running.\n');
  process.exit(1);
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
function req(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const ct   = typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json';
    const r = https.request({
      hostname, path, method,
      headers: { 'Content-Type': ct, ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// ── Step 1: Get token ────────────────────────────────────────────────────────
async function getToken() {
  const body = `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&scope=https://graph.microsoft.com/.default`;
  const res = await req('login.microsoftonline.com', `/${TENANT_ID}/oauth2/v2.0/token`, 'POST', {}, body);
  if (!res.body.access_token) {
    throw new Error(`Token acquisition failed: ${res.body.error} — ${res.body.error_description}`);
  }
  return res.body.access_token;
}

// ── Test runners ─────────────────────────────────────────────────────────────

// Test 1: Mail.Send — send a real test email to yourself only
async function testMailSend(token) {
  const res = await req(
    'graph.microsoft.com',
    `/v1.0/users/${SENDER_EMAIL}/sendMail`,
    'POST',
    { 'Authorization': `Bearer ${token}` },
    {
      message: {
        subject: '[TEST] Misfit Island — Mail.Send permission check',
        body: { contentType: 'Text', content: 'This is an automated permission test from the Misfit Island hub setup. If you received this, Mail.Send is working.' },
        toRecipients: [{ emailAddress: { address: SENDER_EMAIL } }]
      },
      saveToSentItems: false
    }
  );
  // sendMail returns 202 on success with empty body
  if (res.status === 202) return { pass: true, detail: 'Email sent to ' + SENDER_EMAIL };
  const err = res.body?.error;
  return { pass: false, detail: err ? `${err.code}: ${err.message}` : `HTTP ${res.status}` };
}

// Test 2: OnlineMeetings.Read — list online meetings for the sender
async function testOnlineMeetings(token) {
  const res = await req(
    'graph.microsoft.com',
    `/v1.0/users/${SENDER_EMAIL}/onlineMeetings?$top=1`,
    'GET',
    { 'Authorization': `Bearer ${token}` }
  );
  if (res.status === 200) return { pass: true, detail: 'OnlineMeetings endpoint accessible' };
  const err = res.body?.error;
  if (err?.code === 'Forbidden' || res.status === 403) {
    return { pass: false, detail: `403 Forbidden — permission not yet granted by Magna5 (${err?.code})` };
  }
  // 200 with empty value array is still a pass — permission works, just no meetings
  return { pass: false, detail: err ? `${err.code}: ${err.message}` : `HTTP ${res.status}` };
}

// Test 3: Sites.Selected — try to access the SharePoint site
async function testSharePoint(token) {
  if (!SHAREPOINT_SITE_ID) {
    return { pass: null, detail: 'SKIPPED — SHAREPOINT_SITE_ID not set yet (waiting on Sam)' };
  }
  const res = await req(
    'graph.microsoft.com',
    `/v1.0/sites/${SHAREPOINT_SITE_ID}/drives`,
    'GET',
    { 'Authorization': `Bearer ${token}` }
  );
  if (res.status === 200) return { pass: true, detail: 'SharePoint site accessible, drives listed' };
  const err = res.body?.error;
  if (res.status === 403) {
    return { pass: false, detail: `403 Forbidden — Sites.Selected not yet granted by Magna5 (${err?.code})` };
  }
  return { pass: false, detail: err ? `${err.code}: ${err.message}` : `HTTP ${res.status}` };
}

// ── Runner ───────────────────────────────────────────────────────────────────
function icon(pass) {
  if (pass === true)  return '✅ PASS';
  if (pass === false) return '❌ FAIL';
  return '⏭  SKIP';
}

async function run() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  Misfit Island — Azure AD Permission Tests');
  console.log('═══════════════════════════════════════════════\n');

  // Step 1: Token
  process.stdout.write('🔑 Acquiring token from Azure AD... ');
  let token;
  try {
    token = await getToken();
    console.log('✅ Token acquired\n');
  } catch (e) {
    console.log(`\n❌ FAILED — ${e.message}`);
    console.log('\nThis means the app registration itself has an issue (wrong credentials or tenant).');
    console.log('Check TENANT_ID, CLIENT_ID, and CLIENT_SECRET and try again.\n');
    process.exit(1);
  }

  // Step 2: Run each permission test
  const tests = [
    { name: 'Mail.Send',           fn: testMailSend },
    { name: 'OnlineMeetings.Read', fn: testOnlineMeetings },
    { name: 'Sites.Selected',      fn: testSharePoint },
  ];

  const results = [];
  for (const t of tests) {
    process.stdout.write(`Testing ${t.name}... `);
    try {
      const r = await t.fn(token);
      console.log(`${icon(r.pass)}  ${r.detail}`);
      results.push({ name: t.name, ...r });
    } catch (e) {
      console.log(`❌ ERROR  ${e.message}`);
      results.push({ name: t.name, pass: false, detail: e.message });
    }
  }

  // Step 3: Summary
  const passed = results.filter(r => r.pass === true).length;
  const failed = results.filter(r => r.pass === false).length;
  const skipped = results.filter(r => r.pass === null).length;

  console.log('\n───────────────────────────────────────────────');
  console.log(`  ${passed} passed · ${failed} failed · ${skipped} skipped`);
  console.log('───────────────────────────────────────────────');

  if (failed > 0) {
    console.log('\n⏳ Failed permissions are still pending Magna5 approval.');
    console.log('   Follow up with Sam Lilly once you see this output.\n');
  } else if (skipped === 0) {
    console.log('\n🎉 All permissions live — ready to test end-to-end workflows.\n');
  } else {
    console.log('\n📋 Run again after adding SHAREPOINT_SITE_ID to check Sites.Selected.\n');
  }
}

run();
