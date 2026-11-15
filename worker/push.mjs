// Cloudflare Worker: optional daily-reminder relay for Live Lifesaver (Web Push, no message content needed).
// What it does: stores each device's push subscription, and every 15 minutes sends a payload-less push to devices whose
// chosen local time has come and that have not checked in today. The app shows the localized text itself.
// Deploy: see README ("Reminders without the app open"). Needs: a KV namespace bound as SUBS, secrets VAPID_PUBLIC (base64url
// public key), VAPID_PRIVATE_JWK (JSON), VAPID_SUBJECT (mailto: or https: address), and a Cron Trigger "*/15 * * * *".
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const WINDOW_MIN = 15; // cron period

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(new TextEncoder().encode(s));

/** Signed VAPID header value for one push service endpoint (RFC 8292, ES256). */
export async function vapidHeader(endpoint, publicKey, privateJwk, subject, nowMs = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64uText(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64uText(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: subject }));
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + body)); // raw r||s, as JWS wants
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + publicKey;
}

/** Should this subscription get a push now? rec: { time:'HH:MM', tz: minutes east of UTC, lastCheckin:'YYYY-MM-DD', lastSent:'YYYY-MM-DD' }. */
export function shouldSend(nowMs, rec) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(rec && rec.time || ''); if (!m || !Number.isFinite(rec.tz)) return false;
  const local = new Date(nowMs + rec.tz * 60000), day = local.toISOString().slice(0, 10);
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes(), at = Number(m[1]) * 60 + Number(m[2]);
  return nowMin >= at && nowMin < at + WINDOW_MIN && rec.lastCheckin !== day && rec.lastSent !== day;
}

export function localDay(nowMs, tz) { return new Date(nowMs + tz * 60000).toISOString().slice(0, 10); }

const keyOf = async (endpoint) => 's:' + b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });

function validSub(s) { return s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000; }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    const path = new URL(request.url).pathname;
    let b; try { b = await request.json(); } catch (e) { return json({ error: 'json' }, 400); }
    if (path === '/push/subscribe') {
      if (!validSub(b.sub) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(b.time || '') || !Number.isFinite(b.tz) || Math.abs(b.tz) > 14 * 60) return json({ error: 'invalid' }, 400);
      await env.SUBS.put(await keyOf(b.sub.endpoint), JSON.stringify({ endpoint: b.sub.endpoint, time: b.time, tz: b.tz, lang: String(b.lang || 'en').slice(0, 5), lastCheckin: null, lastSent: null }), { expirationTtl: 60 * 86400 });
      return json({ ok: true });
    }
    if (path === '/push/unsubscribe') {
      if (!b.endpoint) return json({ error: 'invalid' }, 400);
      await env.SUBS.delete(await keyOf(b.endpoint)); return json({ ok: true });
    }
    if (path === '/push/checkin') { // the person checked in: skip today's reminder
      const k = await keyOf(String(b.endpoint || '')), raw = await env.SUBS.get(k); if (!raw) return json({ ok: true });
      const rec = JSON.parse(raw); rec.lastCheckin = String(b.day || '').slice(0, 10); await env.SUBS.put(k, JSON.stringify(rec), { expirationTtl: 60 * 86400 });
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  },

  async scheduled(event, env) {
    const now = Date.now(), pub = env.VAPID_PUBLIC, jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
    let cursor;
    do {
      const page = await env.SUBS.list({ prefix: 's:', cursor }); cursor = page.list_complete ? undefined : page.cursor;
      for (const k of page.keys) {
        const raw = await env.SUBS.get(k.name); if (!raw) continue;
        const rec = JSON.parse(raw); if (!shouldSend(now, rec)) continue;
        const res = await fetch(rec.endpoint, { method: 'POST', headers: { authorization: await vapidHeader(rec.endpoint, pub, jwk, env.VAPID_SUBJECT, now), ttl: '3600', urgency: 'normal', 'content-length': '0' } });
        if (res.status === 404 || res.status === 410) { await env.SUBS.delete(k.name); continue; } // device unsubscribed
        if (res.ok) { rec.lastSent = localDay(now, rec.tz); await env.SUBS.put(k.name, JSON.stringify(rec), { expirationTtl: 60 * 86400 }); }
      }
    } while (cursor);
  }
};
