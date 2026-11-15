// Prints the two values the reminders worker needs. Run: node tools/make_vapid.mjs
import { generateKeyPairSync } from 'node:crypto';
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pub = publicKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');
console.log('VAPID_PUBLIC (also paste into the app, Reminders > advanced):\n' + raw + '\n');
console.log('VAPID_PRIVATE_JWK (keep secret; paste as a Worker secret):\n' + JSON.stringify(privateKey.export({ format: 'jwk' })));
