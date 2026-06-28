"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import {
  collection, addDoc, getDocs, doc, getDoc,
  setDoc, updateDoc, deleteDoc, serverTimestamp, query, where
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Eye, EyeOff, Lock, Unlock, Key, Plus, RefreshCw,
  ShieldCheck, ShieldAlert, ArrowLeft, Trash2, Pencil, X, Check
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import styles from './locker.module.css';

/* ═══════════════════════════════════════════
   CRYPTO  (AES-GCM 256-bit + PBKDF2)
═══════════════════════════════════════════ */
const SALT = new TextEncoder().encode("MyDashboardLockerSalt_2026_v1");

async function deriveKey(pin) {
  const base = await window.crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: 150000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encryptText(text, pin) {
  const key = await deriveKey(pin);
  const iv  = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  const out = new Uint8Array(12 + enc.byteLength);
  out.set(iv); out.set(new Uint8Array(enc), 12);
  return btoa(String.fromCharCode(...out));
}

async function decryptText(cipher, pin) {
  const bytes = new Uint8Array(atob(cipher).split("").map(c => c.charCodeAt(0)));
  const key   = await deriveKey(pin);
  const dec   = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12)
  );
  return new TextDecoder().decode(dec);
}

const SENTINEL = "LOCKER_VERIFIED_2026";
const createVerifier = (pin) => encryptText(SENTINEL, pin);
const checkPin = async (pin, verifier) => {
  try { return (await decryptText(verifier, pin)) === SENTINEL; }
  catch { return false; }
};

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const maskValue = (val = '') => {
  if (!val) return '••••••';
  if (val.includes('@')) {
    const [u, d] = val.split('@');
    return u.length <= 2 ? `**@${d}` : `${u.slice(0,2)}••••@${d}`;
  }
  return val.length <= 3 ? '•'.repeat(val.length) : `${val.slice(0,2)}${'•'.repeat(Math.min(val.length-2,5))}`;
};

const uid4 = () => Math.random().toString(36).slice(2, 6);
const newField = () => ({ id: uid4(), label: '', value: '' });

/* ═══════════════════════════════════════════
   PIN MODAL  — re-verify before reveal
═══════════════════════════════════════════ */
function PinModal({ verifier, onVerified, onClose }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = async (e) => {
    e.preventDefault();
    if (pin.length < 6) return;
    setBusy(true);
    const ok = await checkPin(pin, verifier);
    setBusy(false);
    if (ok) onVerified(pin);
    else { toast.error("Wrong PIN."); setPin(''); ref.current?.focus(); }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.pinModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pinModalHeader}>
          <div className={styles.pinModalIcon}><Lock size={16} /></div>
          <div className={styles.pinModalMeta}>
            <p className={styles.pinModalTitle}>Confirm Identity</p>
            <p className={styles.pinModalSub}>Enter your PIN to reveal this credential</p>
          </div>
          <button className={styles.modalClose} onClick={onClose}><X size={15} /></button>
        </div>
        <form onSubmit={submit} className={styles.pinModalBody}>
          <input
            ref={ref}
            type="password" inputMode="numeric" maxLength={6}
            placeholder="••••••" value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            className={styles.pinModalInput}
          />
          <div className={styles.pinDots}>
            {Array.from({length:6}).map((_,i) => (
              <span key={i} className={`${styles.dot} ${i < pin.length ? styles.dotFilled : ''}`} />
            ))}
          </div>
          <button type="submit" className={styles.scanBtn} disabled={busy || pin.length < 6} style={{width:'100%',justifyContent:'center'}}>
            {busy ? <span className={styles.miniSpinner}/> : <><Unlock size={14}/> Reveal Credential</>}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   AUTH SCREEN  (setup / login)
═══════════════════════════════════════════ */
function AuthScreen({ mode, uid, onSuccess }) {
  const [pin, setPin]     = useState('');
  const [conf, setConf]   = useState('');
  const [busy, setBusy]   = useState(false);
  const router            = useRouter();
  const isSetup           = mode === 'setup';

  const submit = async (e) => {
    e.preventDefault();
    if (pin.length < 6) return toast.error("PIN must be 6 digits.");
    if (isSetup && pin !== conf) return toast.error("PINs don't match.");
    setBusy(true);
    try {
      if (isSetup) {
        const v = await createVerifier(pin);
        await setDoc(doc(db, "locker_config", uid), { pinVerifier: v, createdAt: serverTimestamp() });
        toast.success("Vault created!");
        onSuccess(pin, v);
      } else {
        const snap = await getDoc(doc(db, "locker_config", uid));
        if (!snap.exists()) { toast.error("No vault found."); return; }
        const ok = await checkPin(pin, snap.data().pinVerifier);
        if (ok) onSuccess(pin, snap.data().pinVerifier);
        else { toast.error("Wrong PIN."); setPin(''); }
      }
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className={styles.page} style={{background:'linear-gradient(155deg,var(--bg) 0%,var(--bg2) 100%)'}}>
      <Toaster position="top-right" toastOptions={toastOpts} />
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>
          <ArrowLeft size={13}/> Back
        </button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><Key size={15} color="#fff"/></div>
          Password Vault
        </div>
      </header>
      <div className={styles.authCenter}>
        <div className={styles.authCard}>
          <div className={styles.authHeader}>
            <div className={styles.authIconRing}>
              {isSetup ? <ShieldCheck size={22}/> : <Lock size={22}/>}
            </div>
            <h2 className={styles.authTitle}>{isSetup ? "Create Your Vault" : "Unlock Vault"}</h2>
            <p className={styles.authSub}>
              {isSetup
                ? "Choose a 6-digit PIN. It encrypts your data — never stored in plain text."
                : "Enter your 6-digit PIN to access stored credentials."}
            </p>
            {isSetup && (
              <div className={styles.authWarning}>
                <ShieldAlert size={12}/>
                <span>Forgotten PINs cannot be recovered. Your data will be permanently lost.</span>
              </div>
            )}
          </div>
          <form onSubmit={submit} className={styles.authForm}>
            <div className={styles.pinField}>
              <label className={styles.pinLabel}>{isSetup ? "New PIN" : "PIN"}</label>
              <input type="password" inputMode="numeric" maxLength={6} placeholder="••••••"
                value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,''))}
                className={styles.pinInput} autoFocus/>
            </div>
            {isSetup && (
              <div className={styles.pinField}>
                <label className={styles.pinLabel}>Confirm PIN</label>
                <input type="password" inputMode="numeric" maxLength={6} placeholder="••••••"
                  value={conf} onChange={e => setConf(e.target.value.replace(/\D/g,''))}
                  className={styles.pinInput}/>
              </div>
            )}
            <div className={styles.pinDots}>
              {Array.from({length:6}).map((_,i) => (
                <span key={i} className={`${styles.dot} ${i < pin.length ? styles.dotFilled:''}`}/>
              ))}
            </div>
            <button type="submit" className={styles.scanBtn} disabled={busy} style={{width:'100%',justifyContent:'center'}}>
              {busy ? <span className={styles.miniSpinner}/> : isSetup
                ? <><ShieldCheck size={14}/> Create Vault</>
                : <><Unlock size={14}/> Unlock</>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TOAST OPTS
═══════════════════════════════════════════ */
const toastOpts = {
  style: {
    background:'#fff', color:'#18213d',
    border:'1px solid rgba(67,97,238,0.18)',
    fontSize:'13px', boxShadow:'0 4px 16px rgba(67,97,238,0.10)'
  }
};

/* ═══════════════════════════════════════════
   ENTRY CARD  (view / edit / reveal)
═══════════════════════════════════════════ */
function EntryCard({ item, masterKey, verifier, onDeleted, onUpdated }) {
  const [mode, setMode]         = useState('idle');   // idle | revealing | revealed | editing
  const [revealed, setRevealed] = useState({});       // { index: plaintext }
  const [countdown, setCount]   = useState(15);
  const [editFields, setEdit]   = useState([]);
  const [editPlatform, setEP]   = useState('');
  const [saving, setSaving]     = useState(false);

  /* countdown auto-hide */
  useEffect(() => {
    if (mode !== 'revealed') return;
    if (countdown <= 0) { setMode('idle'); setRevealed({}); return; }
    const t = setTimeout(() => setCount(c => c-1), 1000);
    return () => clearTimeout(t);
  }, [countdown, mode]);

  const handleVerified = async (pin) => {
    try {
      const dec = {};
      await Promise.all((item.fields||[]).map(async (f,i) => {
        dec[i] = await decryptText(f.encValue, pin);
      }));
      setRevealed(dec);
      setMode('revealed');
      setCount(15);
    } catch { toast.error("Decryption failed."); setMode('idle'); }
  };

  const startEdit = () => {
    setEP(item.platform);
    setEdit((item.fields||[]).map((f,i) => ({
      id: uid4(), label: f.label,
      value: mode === 'revealed' ? (revealed[i] ?? '') : ''
    })));
    setMode('editing');
  };

  const saveEdit = async () => {
    if (!editPlatform.trim()) return toast.error("Platform name required.");
    const valid = editFields.filter(f => f.label.trim() && f.value.trim());
    if (!valid.length) return toast.error("At least one field required.");
    setSaving(true);
    try {
      const newFields = await Promise.all(valid.map(async f => ({
        label: f.label.trim(),
        encValue: await encryptText(f.value.trim(), masterKey),
        maskedValue: maskValue(f.value.trim()),
      })));
      await updateDoc(doc(db, "locker_entries", item.id), {
        platform: editPlatform.trim(),
        fields: newFields,
        updatedAt: serverTimestamp()
      });
      toast.success("Entry updated!");
      onUpdated();
      setMode('idle');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${item.platform}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "locker_entries", item.id));
      toast.success("Deleted.");
      onDeleted();
    } catch (err) { toast.error(err.message); }
  };

  const isActive = mode === 'revealed' || mode === 'editing';

  return (
    <>
      {mode === 'revealing' && (
        <PinModal verifier={verifier} onVerified={handleVerified} onClose={() => setMode('idle')} />
      )}

      <div className={`${styles.entryCard} ${isActive ? styles.entryCardActive : ''}`}>
        {/* ── EDIT MODE ── */}
        {mode === 'editing' ? (
          <div className={styles.editBlock}>
            <input
              className={styles.editPlatformInput}
              value={editPlatform}
              onChange={e => setEP(e.target.value)}
              placeholder="Platform name"
            />
            <div className={styles.editFields}>
              {editFields.map((f, idx) => (
                <div key={f.id} className={styles.dynamicRow}>
                  <input
                    className={`${styles.input} ${styles.labelCol}`}
                    placeholder="Label"
                    value={f.label}
                    onChange={e => setEdit(prev => prev.map((x,i) => i===idx ? {...x,label:e.target.value}:x))}
                  />
                  <input
                    className={`${styles.input} ${styles.valueCol}`}
                    placeholder="Value"
                    value={f.value}
                    onChange={e => setEdit(prev => prev.map((x,i) => i===idx ? {...x,value:e.target.value}:x))}
                  />
                  {editFields.length > 1 && (
                    <button className={styles.removeBtn} onClick={() => setEdit(p=>p.filter((_,i)=>i!==idx))}>
                      <X size={13}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className={styles.addMoreBtn} onClick={() => setEdit(p=>[...p, newField()])}>
              <Plus size={12}/> Add Field
            </button>
            <div className={styles.editActions}>
              <button className={styles.cancelBtn} onClick={() => setMode('idle')}><X size={13}/> Cancel</button>
              <button className={styles.saveEditBtn} onClick={saveEdit} disabled={saving}>
                {saving ? <span className={styles.miniSpinner}/> : <><Check size={13}/> Save</>}
              </button>
            </div>
          </div>
        ) : (
          /* ── VIEW / REVEALED MODE ── */
          <>
            <div className={styles.entryTop}>
              <span className={styles.entryPlatform}>{item.platform}</span>
              <div className={styles.entryActions}>
                {mode === 'revealed'
                  ? <span className={styles.countdown}>{countdown}s</span>
                  : <button className={styles.revealBtn} onClick={() => setMode('revealing')}><Eye size={12}/> Reveal</button>
                }
                <button className={styles.iconActionBtn} onClick={startEdit} title="Edit"><Pencil size={13}/></button>
                <button className={`${styles.iconActionBtn} ${styles.iconDanger}`} onClick={handleDelete} title="Delete"><Trash2 size={13}/></button>
              </div>
            </div>
            <div className={styles.entryFields}>
              {(item.fields||[]).map((f,i) => (
                <div key={i} className={styles.entryRow}>
                  <span className={styles.fieldKey}>{f.label}</span>
                  <span className={`${styles.fieldVal} ${mode==='revealed' ? styles.fieldValRevealed:''}`}>
                    {mode === 'revealed' ? (revealed[i] ?? '…') : f.maskedValue}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════ */
export default function LockerPage() {
  const router = useRouter();

  const [uid, setUid]           = useState(null);
  const [authReady, setReady]   = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [masterKey, setKey]     = useState(null);
  const [verifier, setVerifier] = useState(null);

  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(false);

  /* add-form state */
  const [platform, setPlat]   = useState('');
  const [fields, setFields]   = useState([newField(), newField()]);
  const [submitting, setSub]  = useState(false);

  /* ── bootstrap ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setReady(true); setAuthMode('login'); return; }
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(db, "locker_config", user.uid));
        if (snap.exists()) { setVerifier(snap.data().pinVerifier); setAuthMode('login'); }
        else setAuthMode('setup');
      } catch (err) {
        setAuthMode(err.code === 'permission-denied' ? 'setup' : 'login');
      } finally { setReady(true); }
    });
    return () => unsub();
  }, []);

  /* ── fetch ── */
  const fetchItems = useCallback(async (id) => {
    setLoad(true);
    try {
      const q    = query(collection(db, "locker_entries"), where("userId","==",id));
      const snap = await getDocs(q);
      setItems(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    } catch (err) { toast.error(err.message); }
    finally { setLoad(false); }
  }, []);

  const onAuthSuccess = useCallback((pin, v) => {
    setKey(pin); setVerifier(v); fetchItems(uid);
  }, [fetchItems, uid]);

  /* ── add credential ── */
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!platform.trim()) return toast.error("Platform name required.");
    const valid = fields.filter(f => f.label.trim() && f.value.trim());
    if (!valid.length) return toast.error("At least one labelled field required.");
    setSub(true);
    try {
      const enc = await Promise.all(valid.map(async f => ({
        label:       f.label.trim(),
        encValue:    await encryptText(f.value.trim(), masterKey),
        maskedValue: maskValue(f.value.trim()),
      })));
      await addDoc(collection(db, "locker_entries"), {
        platform: platform.trim(), fields: enc,
        userId: uid, createdAt: serverTimestamp()
      });
      toast.success("Saved & encrypted!");
      setPlat(''); setFields([newField(), newField()]);
      fetchItems(uid);
    } catch (err) { toast.error(err.message); }
    finally { setSub(false); }
  };

  const updateField = (id, key, val) =>
    setFields(p => p.map(f => f.id===id ? {...f,[key]:val} : f));

  /* ── loading ── */
  if (!authReady || !authMode) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner}/>
        <span>Initializing vault…</span>
      </div>
    );
  }

  /* ── auth ── */
  if (!masterKey) return <AuthScreen mode={authMode} uid={uid} onSuccess={onAuthSuccess}/>;

  /* ── main dashboard ── */
  return (
    <div className={styles.page}>
      <Toaster position="top-right" toastOptions={toastOpts}/>

      {/* ── TOP BAR ── */}
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>
          <ArrowLeft size={13}/> Back
        </button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><Key size={15} color="#fff"/></div>
          Password Vault
          <span className={styles.entryBadge}>{items.length}</span>
        </div>
        <button className={styles.lockBtn} onClick={() => { setKey(null); setItems([]); setAuthMode('login'); }}>
          <Lock size={13}/> Lock
        </button>
      </header>

      {/* ── BODY ── */}
      <div className={styles.layout}>

        {/* ─ ADD FORM ─ */}
        <main className={styles.main}>
          <div className={styles.scanCard}>
            <h2 className={styles.cardTitle}>Store New Credential</h2>
            <p className={styles.cardSubtitle}>Encrypted client-side with AES-GCM 256-bit before upload.</p>

            <form onSubmit={handleAdd} className={styles.addForm}>
              {/* platform */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Platform / Service</label>
                <input
                  className={styles.input} type="text"
                  placeholder="e.g. GitHub, Gmail, HDFC Net Banking"
                  value={platform} onChange={e => setPlat(e.target.value)}
                />
              </div>

              {/* dynamic fields */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Fields</label>
                <div className={styles.dynamicList}>
                  {fields.map((f, idx) => (
                    <div key={f.id} className={styles.dynamicRow}>
                      <input
                        className={`${styles.input} ${styles.labelCol}`}
                        placeholder={idx===0?"Label (e.g. Username)":idx===1?"Label (e.g. Password)":"Label"}
                        value={f.label} onChange={e => updateField(f.id,'label',e.target.value)}
                      />
                      <input
                        className={`${styles.input} ${styles.valueCol}`}
                        placeholder="Value"
                        value={f.value} onChange={e => updateField(f.id,'value',e.target.value)}
                      />
                      {fields.length > 1 && (
                        <button type="button" className={styles.removeBtn}
                          onClick={() => setFields(p => p.filter(x => x.id!==f.id))}>
                          <X size={13}/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className={styles.addMoreBtn}
                  onClick={() => setFields(p => [...p, newField()])}>
                  <Plus size={12}/> Add More Field
                </button>
              </div>

              <button type="submit" className={styles.scanBtn} disabled={submitting}
                style={{alignSelf:'flex-start'}}>
                {submitting
                  ? <span className={styles.miniSpinner}/>
                  : <><Lock size={13}/> Encrypt & Save</>
                }
              </button>
            </form>
          </div>
        </main>

        {/* ─ ENTRIES SIDEBAR ─ */}
        <aside className={styles.sidebar}>
          <div className={styles.historyCard}>
            <div className={styles.historyCardHeader}>
              <p className={styles.sectionLabel}>Stored Credentials</p>
              {loading
                ? <div className={styles.miniSpinner}/>
                : <span className={styles.entryBadge}>{items.length}</span>
              }
            </div>

            <div className={styles.historyList}>
              {items.length === 0 && !loading && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🔐</div>
                  <p>No credentials yet. Add your first entry.</p>
                </div>
              )}
              {items.map(item => (
                <EntryCard
                  key={item.id}
                  item={item}
                  masterKey={masterKey}
                  verifier={verifier}
                  onDeleted={() => fetchItems(uid)}
                  onUpdated={() => fetchItems(uid)}
                />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
