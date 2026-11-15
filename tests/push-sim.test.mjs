// End-to-end simulation of the reminder relay without a real push service: a fake KV store and a fake push endpoint.
import assert from 'node:assert'; import { generateKeyPairSync, webcrypto } from 'node:crypto';
import worker from '../worker/push.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
let n = 0; const test = async (name, fn) => { await fn(); n++; console.log('ok - ' + name); };

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pj = publicKey.export({ format: 'jwk' });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(pj.x, 'base64url'), Buffer.from(pj.y, 'base64url')]).toString('base64url');
const store = new Map();
const env = { VAPID_PUBLIC: pub, VAPID_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: 'jwk' })), VAPID_SUBJECT: 'mailto:t@example.com',
  SUBS: { put: async (k, v) => store.set(k, v), get: async k => store.get(k) ?? null, delete: async k => store.delete(k),
          list: async () => ({ keys: [...store.keys()].map(name => ({ name })), list_complete: true }) } };
const sent = []; let pushStatus = 201;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { sent.push({ url, init }); return new Response(null, { status: pushStatus }); };
const post = (path, body) => worker.fetch(new Request('https://w.example' + path, { method: 'POST', body: JSON.stringify(body) }), env);
const sub = ep => post('/push/subscribe', { sub: { endpoint: ep }, time: '08:00', tz: 180, lang: 'tr' });
const realNow = Date.now; const at = (h, m, day = 10) => { Date.now = () => Date.UTC(2027, 2, day, h, m); };

await test('a due device gets exactly one signed, content-free push per day', async () => {
  await sub('https://push.example/a'); at(5, 3); await worker.scheduled({}, env);
  assert.strictEqual(sent.length, 1); const h = sent[0].init.headers;
  assert.match(h.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/); assert.strictEqual(h.ttl, '3600'); assert.strictEqual(sent[0].init.body, undefined);
  at(5, 10); await worker.scheduled({}, env); assert.strictEqual(sent.length, 1, 'no second push the same day');
});
await test('not due yet, and a check-in cancels the day', async () => {
  sent.length = 0; await sub('https://push.example/b'); at(4, 0, 11); await worker.scheduled({}, env); assert.strictEqual(sent.length, 0);
  await post('/push/checkin', { endpoint: 'https://push.example/b', day: '2027-03-11' }); await post('/push/checkin', { endpoint: 'https://push.example/a', day: '2027-03-11' });
  at(5, 2, 11); await worker.scheduled({}, env); assert.strictEqual(sent.length, 0);
});
await test('a device the push service reports gone (410) is removed', async () => {
  store.clear(); sent.length = 0; await sub('https://push.example/c'); pushStatus = 410; at(5, 1, 12); await worker.scheduled({}, env);
  assert.strictEqual(sent.length, 1); assert.strictEqual(store.size, 0);
});
await test('a failing push service does not lose the device and is retried in the window', async () => {
  store.clear(); sent.length = 0; await sub('https://push.example/d'); pushStatus = 503; at(5, 1, 13); await worker.scheduled({}, env);
  assert.strictEqual(store.size, 1); pushStatus = 201; at(5, 6, 13); await worker.scheduled({}, env); assert.strictEqual(sent.length, 2);
});
Date.now = realNow; globalThis.fetch = realFetch;
console.log(n + ' push simulation tests passed');
