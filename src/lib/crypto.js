// src/lib/crypto.js
// AES-GCM encryption/decryption (client-side)

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64decode(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function getKeyFromPassword(password, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(plainText, password) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await getKeyFromPassword(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plainText)
  );

  return {
    cipher: b64encode(encrypted),
    iv: b64encode(iv),
    salt: b64encode(salt),
  };
}

export async function decryptText(payload, password) {
  const iv = b64decode(payload.iv);
  const salt = b64decode(payload.salt);
  const cipherBytes = b64decode(payload.cipher);

  const key = await getKeyFromPassword(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBytes
  );

  return dec.decode(decrypted);
}
