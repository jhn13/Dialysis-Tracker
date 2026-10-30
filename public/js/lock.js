// Face ID / Touch ID unlock, using a passkey held on this device.
// This is a privacy lock for the app screen: your account password is still the real sign-in.
import * as db from './db.js';

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

export async function available() {
  try {
    return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) { return false; }
}

export async function enabledHere() { return !!(await db.getMeta('lockCredential')); }

export async function enable(label = 'Dialysis Tracker') {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Dialysis Tracker', id: location.hostname },
      user: { id: rand(16), name: label, displayName: label },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  await db.setMeta('lockCredential', b64(cred.rawId));
}

export async function disable() { await db.setMeta('lockCredential', null); }

export async function unlock() {
  const id = await db.getMeta('lockCredential');
  if (!id) return true;
  await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal', 'hybrid'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return true;
}
