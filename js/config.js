/* Site-wide defaults, so visitors do not have to type addresses.
   relay     : your NASA relay (worker/osdr-proxy.js). Optional. A relay address typed in the app takes priority.
   reminders : your reminder worker (worker/push.mjs) and its PUBLIC key. Both are public by design; never put the private key here. */
window.LL_CONFIG = {
  relay: '',
  reminders: {
    url: 'https://lifesaver-reminders.master-god-gamer-13.workers.dev',
    vapid: 'BNzr0bgZeVAas4jypilYBEy8bd3UHdfD5vHC1AXJKu6A_pRmwL4rjLjkVtTUqkuw0A-jYzLauoeWYkWzv-5iZnY'
  }
};
