'use strict';
const assert = require('assert');
const D = require('../js/diag.js');
let n = 0;
async function test(name, fn) { await fn(); n++; console.log('ok - ' + name); }
const R = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

(async () => {
  await test('checkRelay: bad address is invalid without any request', async () => {
    let calls = 0; const r = await D.checkRelay(async () => { calls++; }, 'http://x'); assert.strictEqual(r.status, 'invalid'); assert.strictEqual(calls, 0);
    assert.strictEqual((await D.checkRelay(async () => {}, '')).status, 'invalid');
  });
  await test('checkRelay: current relay that reaches NASA', async () => {
    const urls = []; const r = await D.checkRelay(async u => { urls.push(u); return /health$/.test(u) ? R(200, { ok: true, version: 2 }) : R(200, {}); }, 'https://r.workers.dev/');
    assert.deepStrictEqual(r, { status: 'current', nasa: true, http: 200 }); assert.strictEqual(urls[0], 'https://r.workers.dev/health');
  });
  await test('checkRelay: current relay but NASA not answering', async () => {
    assert.strictEqual((await D.checkRelay(async u => /health$/.test(u) ? R(200, { version: 2 }) : R(502, {}), 'https://r.workers.dev')).nasa, false);
    assert.strictEqual((await D.checkRelay(async u => { if (/health$/.test(u)) return R(200, { version: 2 }); throw new Error('net'); }, 'https://r.workers.dev')).nasa, false);
  });
  await test('checkRelay: old relay (404 on /health, or no version) and unreachable', async () => {
    assert.strictEqual((await D.checkRelay(async () => R(404, 'Only /osdr/'), 'https://r.workers.dev')).status, 'old');
    assert.strictEqual((await D.checkRelay(async () => R(200, { ok: true }), 'https://r.workers.dev')).status, 'old');
    assert.strictEqual((await D.checkRelay(async () => { throw new Error('CORS'); }, 'https://r.workers.dev')).status, 'unreachable');
    assert.strictEqual((await D.checkRelay(async () => R(500, {}), 'https://r.workers.dev')).status, 'unreachable');
  });
  await test('reminderReport: first failing step is named, later steps are skipped', () => {
    const good = { notif: true, perm: 'granted', sw: true, push: true, relay: 'https://r.workers.dev', vapid: 'A'.repeat(87), sub: true, accepts: true };
    let r = D.reminderReport(good); assert.strictEqual(r.first, null); assert.ok(r.steps.every(s => s.ok === true)); assert.strictEqual(r.steps.length, 8);
    r = D.reminderReport({ ...good, perm: 'denied' }); assert.strictEqual(r.first, 'perm'); assert.deepStrictEqual(r.steps.map(s => s.ok), [true, false, null, null, null, null, null, null]);
    r = D.reminderReport({ ...good, relay: '' }); assert.strictEqual(r.first, 'relay');
    r = D.reminderReport({ ...good, vapid: 'short' }); assert.strictEqual(r.first, 'vapid');
    r = D.reminderReport({ ...good, accepts: false }); assert.strictEqual(r.first, 'accepts'); assert.strictEqual(r.steps[6].ok, true);
    r = D.reminderReport({ ...good, accepts: null }); assert.strictEqual(r.first, 'accepts');
  });
  console.log(n + ' diag tests passed');
})().catch(e => { console.error(e); process.exit(1); });
