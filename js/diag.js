/*
 * diag.js — plain-language self-checks. Pure (the network is injected), so they are testable without internet.
 *  - checkRelay: is the relay address a current worker/osdr-proxy.js, and does it reach NASA?
 *  - reminderReport: which step of the reminder setup is the first one that fails?
 */
(function (root) {
  'use strict';

  /** -> Promise<{ status: 'invalid'|'unreachable'|'old'|'current', nasa: true|false|null, http: number|null }>. Never rejects. */
  function checkRelay(fetchFn, base) {
    base = String(base || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[^\s]+$/.test(base)) return Promise.resolve({ status: 'invalid', nasa: null, http: null });
    return Promise.resolve().then(function () { return fetchFn(base + '/health'); }).then(function (res) {
      if (!res) return { status: 'unreachable', nasa: null, http: null };
      if (res.status === 404) return { status: 'old', nasa: null, http: 404 }; // older relays have no /health route
      if (!res.ok) return { status: 'unreachable', nasa: null, http: res.status };
      return Promise.resolve(res.json()).catch(function () { return null; }).then(function (j) {
        if (!j || !(j.version >= 2)) return { status: 'old', nasa: null, http: res.status };
        return Promise.resolve().then(function () { return fetchFn(base + '/osdr/data/osd/files/575'); })
          .then(function (r) { return { status: 'current', nasa: !!(r && r.ok), http: r ? r.status : null }; })
          .catch(function () { return { status: 'current', nasa: false, http: null }; });
      });
    }).catch(function () { return { status: 'unreachable', nasa: null, http: null }; });
  }

  var STEPS = ['notif', 'perm', 'sw', 'push', 'relay', 'vapid', 'sub', 'accepts'];

  /**
   * f: { notif: bool, perm: 'granted'|'denied'|'default', sw: bool, push: bool, relay: string, vapid: string, sub: bool, accepts: true|false|null }
   * -> { steps: [{ id, ok: true|false|null (null = skipped because an earlier step failed) }], first: id of the first failing step | null }
   * Steps 1-4 are needed for any reminder from a closed app; 5-8 only for the optional relay (which is what makes it work when the app is closed).
   */
  function reminderReport(f) {
    var okOf = {
      notif: !!f.notif,
      perm: f.perm === 'granted',
      sw: !!f.sw,
      push: !!f.push,
      relay: !!(f.relay && /^https:\/\//.test(f.relay)),
      vapid: !!(f.vapid && f.vapid.length >= 60),
      sub: !!f.sub,
      accepts: f.accepts === true
    };
    var first = null, steps = STEPS.map(function (id) {
      if (first) return { id: id, ok: null };
      if (!okOf[id]) { first = id; return { id: id, ok: false }; }
      return { id: id, ok: true };
    });
    return { steps: steps, first: first };
  }

  var api = { checkRelay: checkRelay, reminderReport: reminderReport, STEPS: STEPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Diag = api;
})(typeof window !== 'undefined' ? window : globalThis);
