import assert from 'node:assert'; import { webcrypto, generateKeyPairSync } from 'node:crypto';
import worker, { vapidHeader, shouldSend, localDay } from '../worker/push.mjs';
let n = 0; const test = async (name, fn) => { await fn(); n++; console.log('ok - ' + name); };
if (!globalThis.crypto) globalThis.crypto = webcrypto;

await test('vapidHeader: a valid ES256 JWT for the push service origin, verifiable with the public key', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' }), pj = publicKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(pj.x, 'base64url'), Buffer.from(pj.y, 'base64url')]).toString('base64url');
  const h = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', pub, jwk, 'mailto:a@b.c', 1700000000000);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h); assert.ok(m);
  assert.strictEqual(m[4], pub);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString()); assert.deepStrictEqual(claims, { aud: 'https://fcm.googleapis.com', exp: 1700000000 + 43200, sub: 'mailto:a@b.c' });
  assert.deepStrictEqual(JSON.parse(Buffer.from(m[1], 'base64url').toString()), { typ: 'JWT', alg: 'ES256' });
  const key = await crypto.subtle.importKey('jwk', pj, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.strictEqual(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(m[3], 'base64url'), Buffer.from(m[1] + '.' + m[2])), true);
});
await test('shouldSend: inside the 15 minutes after the local time, once a day, never after a check-in', () => {
  const utc = (h, mi) => Date.UTC(2027, 2, 10, h, mi), rec = { time: '08:00', tz: 180, lastCheckin: null, lastSent: null }; // Istanbul UTC+3
  assert.strictEqual(shouldSend(utc(4, 59), rec), false); assert.strictEqual(shouldSend(utc(5, 0), rec), true); assert.strictEqual(shouldSend(utc(5, 14), rec), true); assert.strictEqual(shouldSend(utc(5, 15), rec), false);
  assert.strictEqual(shouldSend(utc(5, 5), { ...rec, lastSent: '2027-03-10' }), false); assert.strictEqual(shouldSend(utc(5, 5), { ...rec, lastCheckin: '2027-03-10' }), false);
  assert.strictEqual(shouldSend(utc(5, 5), { ...rec, lastCheckin: '2027-03-09' }), true);
  assert.strictEqual(shouldSend(utc(23, 0), { time: '02:00', tz: 180 }), true); // local day already rolled over: 02:00 next day
  assert.strictEqual(shouldSend(utc(5, 5), { time: 'x', tz: 180 }), false); assert.strictEqual(shouldSend(utc(5, 5), null), false);
  assert.strictEqual(localDay(utc(23, 0), 180), '2027-03-11');
});
await test('fetch: subscribe validates input, stores by endpoint hash; checkin and unsubscribe work', async () => {
  const store = new Map(), env = { SUBS: { put: async (k, v) => store.set(k, v), get: async k => store.get(k) ?? null, delete: async k => store.delete(k) } };
  const post = (path, body) => worker.fetch(new Request('https://w.example' + path, { method: 'POST', body: JSON.stringify(body) }), env);
  assert.strictEqual((await post('/push/subscribe', { sub: { endpoint: 'http://insecure' }, time: '08:00', tz: 0 })).status, 400);
  assert.strictEqual((await post('/push/subscribe', { sub: { endpoint: 'https://push.example/1' }, time: '8:00', tz: 0 })).status, 400);
  assert.strictEqual((await post('/push/subscribe', { sub: { endpoint: 'https://push.example/1' }, time: '08:00', tz: 180, lang: 'tr' })).status, 200);
  assert.strictEqual(store.size, 1); const rec = JSON.parse([...store.values()][0]); assert.strictEqual(rec.tz, 180); assert.strictEqual(rec.lang, 'tr');
  await post('/push/checkin', { endpoint: 'https://push.example/1', day: '2027-03-10' }); assert.strictEqual(JSON.parse([...store.values()][0]).lastCheckin, '2027-03-10');
  assert.strictEqual((await post('/push/unsubscribe', { endpoint: 'https://push.example/1' })).status, 200); assert.strictEqual(store.size, 0);
  assert.strictEqual((await worker.fetch(new Request('https://w.example/push/subscribe'), env)).status, 405);
});
console.log(n + ' push tests passed');
