"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '@/lib/firebase';   // ← auth bhi import karo
import {
  collection, addDoc, getDocs, doc,
  getDoc, setDoc, serverTimestamp, query, where
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Eye, Lock, Unlock, Key, Plus, RefreshCw, Folder, ShieldCheck, ShieldAlert } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import styles from './locker.module.css';

/* ─────────────────────────────────────────────
   CRYPTO UTILS  (AES-GCM 256-bit, Web Crypto)
───────────────────────────────────────────── */
const SALT = new TextEncoder().encode("MyDashboardLockerSalt_2026_v1");

async function deriveKey(pin) {
  const baseKey = await window.crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: 150000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptText(text, pin) {
  const key = await deriveKey(pin);
  const iv  = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(text)
  );
  const combined = new Uint8Array(12 + enc.byteLength);
  combined.set(iv); combined.set(new Uint8Array(enc), 12);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(cipher, pin) {
  const combined = new Uint8Array(atob(cipher).split("").map(c => c.charCodeAt(0)));
  const key = await deriveKey(pin);
  const dec = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) }, key, combined.slice(12)
  );
  return new TextDecoder().decode(dec);
}

const SENTINEL = "LOCKER_VERIFIED_2026";

async function createPinVerifier(pin) {
  return encryptText(SENTINEL, pin);
}

async function verifyPin(pin, storedVerifier) {
  try {
    const result = await decryptText(storedVerifier, pin);
    return result === SENTINEL;
  } catch { return false; }
}

/* ─────────────────────────────────────────────
   HELPER
───────────────────────────────────────────── */
const maskEmail = (email) => {
  if (!email?.includes('@')) return '••••••';
  const [user, domain] = email.split('@');
  return user.length <= 2 ? `**@${domain}` : `${user.slice(0, 2)}••••@${domain}`;
};

/* ─────────────────────────────────────────────
   AUTH SCREEN COMPONENT
───────────────────────────────────────────── */
function AuthScreen({ mode, uid, onSuccess }) {
  const [pin, setPin]            = useState('');
  const [confirmPin, setConfirm] = useState('');
  const [busy, setBusy]          = useState(false);
  const isSetup = mode === 'setup';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length < 6) return toast.error("PIN must be 6 digits.");
    if (isSetup && pin !== confirmPin) return toast.error("PINs don't match.");

    setBusy(true);
    try {
      if (isSetup) {
        const verifier = await createPinVerifier(pin);
        await setDoc(doc(db, "locker_config", uid), {   // FIX #1
          pinVerifier: verifier,
          createdAt: serverTimestamp()
        });
        toast.success("Vault created! Welcome.");
        onSuccess(pin);
      } else {
        const snap = await getDoc(doc(db, "locker_config", uid));  // FIX #1
        if (!snap.exists()) {
          toast.error("No vault found. Please reload.");
          return;
        }
        const ok = await verifyPin(pin, snap.data().pinVerifier);
        if (ok) {
          toast.success("Unlocked!");
          onSuccess(pin);
        } else {
          toast.error("Wrong PIN. Try again.");
          setPin('');
        }
      }
    } catch (err) {
      toast.error("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.authOverlay}>
      <div className={styles.authCard}>
        <div className={styles.authHeader}>
          <div className={styles.authIconRing}>
            {isSetup ? <ShieldCheck size={22} /> : <Lock size={22} />}
          </div>
          <h2 className={styles.authTitle}>
            {isSetup ? "Create Your Vault" : "Secure Vault"}
          </h2>
          <p className={styles.authSub}>
            {isSetup
              ? "Set a 6-digit PIN. This encrypts all your passwords — it is never stored in plain text."
              : "Enter your 6-digit PIN to unlock your credentials."}
          </p>
          {isSetup && (
            <div className={styles.authWarning}>
              <ShieldAlert size={13} />
              <span>If you forget this PIN, your data cannot be recovered.</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className={styles.authForm}>
          <div className={styles.pinField}>
            <label className={styles.pinLabel}>
              {isSetup ? "Choose PIN" : "Enter PIN"}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className={styles.pinInput}
              autoFocus
            />
          </div>

          {isSetup && (
            <div className={styles.pinField}>
              <label className={styles.pinLabel}>Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={confirmPin}
                onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))}
                className={styles.pinInput}
              />
            </div>
          )}

          <button type="submit" className={styles.authBtn} disabled={busy}>
            {busy
              ? <RefreshCw size={15} className={styles.spinner} />
              : isSetup
                ? <><ShieldCheck size={15} /> Create Vault</>
                : <><Unlock size={15} /> Unlock</>
            }
          </button>
        </form>

        <div className={styles.pinDots}>
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i < pin.length ? styles.dotFilled : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN LOCKER PAGE
───────────────────────────────────────────── */
export default function LockerPage() {
  const [uid, setUid]             = useState(null);
  const [authReady, setAuthReady] = useState(false);  // FIX #2
  const [authMode, setAuthMode]   = useState(null);
  const [masterKey, setMasterKey] = useState(null);

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);

  const [platform, setPlatform] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const [visibleId, setVisibleId] = useState(null);
  const [revealed, setRevealed]   = useState({ email: '', pass: '' });
  const [countdown, setCountdown] = useState(10);

  /* ── FIX #2: Wait for Firebase Auth, THEN check Firestore ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthReady(true);
        setAuthMode('login');
        return;
      }

      setUid(user.uid);

      try {
        // FIX #1: uid-based path instead of hardcoded "auth"
        const snap = await getDoc(doc(db, "locker_config", user.uid));
        setAuthMode(snap.exists() ? 'login' : 'setup');
      } catch (err) {
        // permission-denied = document doesn't exist for this user = first time setup
        console.warn("locker_config:", err.code);
        setAuthMode(err.code === 'permission-denied' ? 'setup' : 'login');
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  /* ── Fetch vault entries — FIX #3: filter by userId ── */
  const fetchItems = useCallback(async (currentUid) => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "locker_entries"),
        where("userId", "==", currentUid)   // FIX #3
      );
      const snap = await getDocs(q);
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      toast.error("Fetch error: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Auth success ── */
  const handleAuthSuccess = useCallback((pin) => {
    setMasterKey(pin);
    fetchItems(uid);
  }, [fetchItems, uid]);

  /* ── Add credential — FIX #4: include userId ── */
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!platform || !email || !password) return toast.error("Fill all fields.");
    try {
      const [enc_email, enc_pass] = await Promise.all([
        encryptText(email, masterKey),
        encryptText(password, masterKey)
      ]);
      await addDoc(collection(db, "locker_entries"), {
        platform,
        secureEmail: enc_email,
        securePass:  enc_pass,
        maskedEmail: maskEmail(email),
        userId:      uid,              // FIX #4
        createdAt:   serverTimestamp()
      });
      toast.success("Saved & encrypted!");
      setPlatform(''); setEmail(''); setPassword('');
      fetchItems(uid);
    } catch (err) {
      toast.error(err.message);
    }
  };

  /* ── Reveal row ── */
  const handleReveal = async (item) => {
    try {
      const [clearEmail, clearPass] = await Promise.all([
        decryptText(item.secureEmail, masterKey),
        decryptText(item.securePass, masterKey)
      ]);
      setRevealed({ email: clearEmail, pass: clearPass });
      setVisibleId(item.id);
      setCountdown(10);
    } catch {
      toast.error("Decryption failed — wrong PIN?");
    }
  };

  /* ── Auto-redact countdown ── */
  useEffect(() => {
    if (!visibleId) return;
    if (countdown <= 0) {
      setVisibleId(null);
      setRevealed({ email: '', pass: '' });
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, visibleId]);

  /* ── Lock vault ── */
  const lockVault = () => {
    setMasterKey(null);
    setItems([]);
    setVisibleId(null);
    setRevealed({ email: '', pass: '' });
    setAuthMode('login');
  };

  /* ─── Loading: Firebase Auth + authMode resolve hone tak ─── */
  if (!authReady || authMode === null) {
    return (
      <div className={styles.page}>
        <div className={styles.bootLoader}>
          <RefreshCw size={20} className={styles.spinner} />
          <span>Initializing vault…</span>
        </div>
      </div>
    );
  }

  const toastStyle = {
    style: {
      background: '#1e2235',
      color: '#e2e8f0',
      border: '1px solid rgba(67,97,238,0.3)',
      fontSize: '13px'
    }
  };

  /* ─── Auth screens ─── */
  if (!masterKey) {
    return (
      <div className={styles.page}>
        <Toaster position="top-right" toastOptions={toastStyle} />
        <AuthScreen mode={authMode} uid={uid} onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  /* ─── Main vault dashboard ─── */
  return (
    <div className={styles.page}>
      <Toaster position="top-right" toastOptions={toastStyle} />

      <header className={styles.topBar}>
        <div className={styles.appTitle}>
          <Key size={16} />
          <span>Password Vault</span>
          <span className={styles.titleBadge}>{items.length} entries</span>
        </div>
        <button className={styles.lockBtn} onClick={lockVault}>
          <Lock size={13} /> Lock Vault
        </button>
      </header>

      <div className={styles.mainGrid}>

        <aside className={styles.sidebar}>
          <p className={styles.sideLabel}>Storage</p>
          <div className={styles.folderActive}>
            <Folder size={14} />
            <span>All Credentials</span>
            <span className={styles.badge}>{items.length}</span>
          </div>
        </aside>

        <section className={styles.formPane}>
          <h3 className={styles.paneTitle}>Add Credential</h3>
          <form onSubmit={handleAdd} className={styles.addForm}>
            <div className={styles.field}>
              <label>Platform / Service</label>
              <input
                type="text"
                placeholder="e.g. GitHub, Gmail, HDFC"
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label>Email / Username</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={styles.input}
              />
            </div>
            <button type="submit" className={styles.saveBtn}>
              <Plus size={14} /> Encrypt & Save
            </button>
          </form>
        </section>

        <section className={styles.vaultPane}>
          <div className={styles.vaultHeader}>
            <h3 className={styles.paneTitle}>Stored Credentials</h3>
            {loading && <RefreshCw size={14} className={styles.spinner} />}
          </div>

          <div className={styles.entryList}>
            {items.map(item => (
              <div
                key={item.id}
                className={`${styles.entryCard} ${visibleId === item.id ? styles.entryCardActive : ''}`}
              >
                <div className={styles.entryTop}>
                  <span className={styles.entryPlatform}>{item.platform}</span>
                  {visibleId === item.id
                    ? <span className={styles.countdown}>{countdown}s</span>
                    : (
                      <button className={styles.revealBtn} onClick={() => handleReveal(item)}>
                        <Eye size={13} /> Reveal
                      </button>
                    )
                  }
                </div>
                <div className={styles.entryFields}>
                  <div className={styles.entryRow}>
                    <span className={styles.fieldKey}>Email</span>
                    <span className={`${styles.fieldVal} ${visibleId === item.id ? styles.fieldValRevealed : ''}`}>
                      {visibleId === item.id ? revealed.email : item.maskedEmail}
                    </span>
                  </div>
                  <div className={styles.entryRow}>
                    <span className={styles.fieldKey}>Password</span>
                    <span className={`${styles.fieldVal} ${visibleId === item.id ? styles.fieldValPassword : ''}`}>
                      {visibleId === item.id ? revealed.pass : '••••••••'}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {items.length === 0 && !loading && (
              <div className={styles.emptyState}>
                <Lock size={28} />
                <p>No credentials stored yet.</p>
                <span>Add your first entry using the form.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
