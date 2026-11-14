// Cloudflare Worker: a tiny read-only relay so the Live Lifesaver web page may read NASA OSDR data.
// NASA's server does not send the header that lets other web pages read its answers (CORS); this Worker adds it.
// Only GET requests to NASA OSDR paths are forwarded. Nothing is stored. Deploy: see README ("Live proxy").
const UPSTREAMS = {
  '/osdr/': 'https://osdr.nasa.gov',
  '/geode-py/': 'https://osdr.nasa.gov', // file downloads (remote_url of a study file starts with /geode-py/)
  '/biodata/': 'https://visualization.osdr.nasa.gov'
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*' };

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: CORS });
    const url = new URL(request.url);
    const prefix = Object.keys(UPSTREAMS).find(p => url.pathname.startsWith(p));
    if (!prefix) return new Response('Only /osdr/..., /geode-py/... and /biodata/... are relayed', { status: 404, headers: CORS });
    const upstream = await fetch(UPSTREAMS[prefix] + url.pathname + url.search, { headers: { accept: 'application/json' } });
    const headers = new Headers(upstream.headers);
    Object.keys(CORS).forEach(k => headers.set(k, CORS[k]));
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
