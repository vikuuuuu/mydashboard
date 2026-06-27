"use client";

import React, { useState, useEffect } from 'react';
// Aapke existing lib folder se db ko import kiya hai
import { db } from '@/lib/firebase'; 
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { Eye, Lock, Unlock, Key, Plus, RefreshCw, Folder } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import styles from './locker.module.css'; // Locker specialized styles

/* ─── NATIVE BROWSER CRYPTO UTILS (AES-GCM 256-bit) ─── */
async function deriveKey(pin) {
  const enc = new TextEncoder();
  const salt = enc.encode("LockerDeterministicSalt2026"); 
  const baseKey = await window.crypto.subtle.importKey(
    "raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(text, pin) {
  const enc = new TextEncoder();
  const key = await deriveKey(pin);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv }, key, enc.encode(text)
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(cipherText, pin) {
  try {
    const combined = new Uint8Array(atob(cipherText).split("").map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const key = await deriveKey(pin);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv }, key, data
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    throw new Error("Mismatched Key Context");
  }
}

export default function LockerDashboardPage() {
  // Master Key Sessions
  const [masterKey, setMasterKey] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [lockerItems, setLockerItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form Field Component States
  const [platform, setPlatform] = useState('');
  const [emailId, setEmailId] = useState('');
  const [password, setPassword] = useState('');

  // 10s Reveal Engine Management
  const [visibleId, setVisibleId] = useState(null);
  const [revealedData, setRevealedData] = useState({ email: '', pass: '' });
  const [countdown, setCountdown] = useState(10);

  // Masking Function (e.g., vikash@gmail.com -> vi****@gmail.com)
  const computeMaskedEmail = (email) => {
    if (!email || !email.includes('@')) return '******';
    const [user, domain] = email.split('@');
    if (user.length <= 2) return `**@${domain}`;
    return `${user.substring(0, 2)}******@${domain}`;
  };

  // Read Encrypted Documents from Firestore
  const fetchLockerData = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "crypto_vault_records"));
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLockerItems(items);
    } catch (err) {
      toast.error("Firestore read error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockLocker = (e) => {
    e.preventDefault();
    if (masterKey.length === 6) {
      setIsUnlocked(true);
      fetchLockerData();
      toast.success("Locker decrypted successfully!");
    } else {
      toast.error("Please provide a valid 6-digit PIN");
    }
  };

  const handleEncryptAndSave = async (e) => {
    e.preventDefault();
    if (!platform || !emailId || !password) {
      return toast.error("Please fill in all layout credentials");
    }

    try {
      // Local client-side isolation encryption
      const encryptedEmail = await encryptData(emailId, masterKey);
      const encryptedPassword = await encryptData(password, masterKey);
      const maskedEmailVersion = computeMaskedEmail(emailId);

      await addDoc(collection(db, "crypto_vault_records"), {
        platform,
        secureEmail: encryptedEmail,
        securePassword: encryptedPassword,
        maskedEmail: maskedEmailVersion,
        timestamp: serverTimestamp()
      });

      toast.success("Credentials locked & committed to Firebase!");
      setPlatform(''); setEmailId(''); setPassword('');
      fetchLockerData();
    } catch (err) {
      toast.error("Encryption failed: " + err.message);
    }
  };

  const handleRevealRow = async (item) => {
    try {
      const clearEmail = await decryptData(item.secureEmail, masterKey);
      const clearPass = await decryptData(item.securePassword, masterKey);

      setRevealedData({ email: clearEmail, pass: clearPass });
      setVisibleId(item.id);
      setCountdown(10);
    } catch (err) {
      toast.error("Decryption failed! Mismatched 6-digit Master Key context.");
    }
  };

  // Watcher for 10-second automatic field redaction
  useEffect(() => {
    let intervalRef;
    if (visibleId && countdown > 0) {
      intervalRef = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    } else if (countdown === 0) {
      setVisibleId(null);
      setRevealedData({ email: '', pass: '' });
    }
    return () => clearTimeout(intervalRef);
  }, [countdown, visibleId]);

  // UI STATE 1: Secure Master Entry Challenge Screen
  if (!isUnlocked) {
    return (
      <div className={styles.page}>
        <Toaster position="top-right" />
        <div className={styles.dialogOverlay}>
          <div className={styles.securityDialog}>
            <div className={styles.securityHeader}>
              <div className={styles.securityIcon}>
                <Lock size={24} />
              </div>
              <h3>Secure Vault Locker</h3>
              <p>Provide your private 6-digit master application signature to parse local context</p>
            </div>
            <form onSubmit={handleUnlockLocker} className={styles.securityForm}>
              <div className={styles.pinInputWrap}>
                <input 
                  type="password" 
                  maxLength={6}
                  placeholder="••••••" 
                  value={masterKey}
                  onChange={(e) => setMasterKey(e.target.value.replace(/\D/g, ''))}
                  className={styles.pinInput}
                  autoFocus
                />
              </div>
              <button type="submit" className={styles.unlockBtn} style={{ width: '100%', justifyContent: 'center' }}>
                <Unlock size={16} /> Open Secure Locker
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // UI STATE 2: Main Production Dashboard Grid
  return (
    <div className={styles.page}>
      <Toaster position="top-right" />
      
      {/* Structural Global Navigation Header */}
      <div className={styles.topBar}>
        <div className={styles.appTitle}>
          <Key size={18} /> <span>Personal Cryptographic Locker Area</span>
        </div>
        <div className={styles.topRight}>
          <button onClick={() => { setIsUnlocked(false); setMasterKey(''); setVisibleId(null); }} className={styles.backBtn}>
            Lock Locker Instance
          </button>
        </div>
      </div>

      {/* Primary Flex/Grid layout block */}
      <div className={styles.layout} style={{ gridTemplateColumns: '240px 1fr 1fr', gap: '0px' }}>
        
        {/* Navigation/Categorization Segment */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>Storage Vaults</span>
          </div>
          <div className={`${styles.folderItem} ${styles.folderActive}`}>
            <Folder size={16} />
            <span className={styles.folderName}>Encrypted Records</span>
            <span className={styles.folderCount}>{lockerItems.length}</span>
          </div>
        </div>

        {/* Mutation Form Layout Panel */}
        <div className={styles.list} style={{ padding: '20px', gap: '16px' }}>
          <div className={styles.listHeader} style={{ padding: '0 0 12px 0' }}>
            <h3 className={styles.listTitle}>Store New Passwords Securely</h3>
          </div>
          
          <form onSubmit={handleEncryptAndSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: 'var(--ink2)' }}>Platform / Application Category</label>
              <input 
                type="text" 
                placeholder="e.g., Bank Account, Email ID, Government Pass" 
                value={platform} 
                onChange={(e) => setPlatform(e.target.value)}
                className={styles.quickTitleInput} 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: 'var(--ink2)' }}>Email ID / Username Value</label>
              <input 
                type="email" 
                placeholder="example@mail.com" 
                value={emailId} 
                onChange={(e) => setEmailId(e.target.value)}
                className={styles.quickTitleInput} 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: 'var(--ink2)' }}>Target Access Password / Code PIN</label>
              <input 
                type="password" 
                placeholder="••••••••••••" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className={styles.quickTitleInput} 
              />
            </div>
            <button type="submit" className={styles.newNoteBtn} style={{ width: '100%', justifyContent: 'center', marginTop: '10px', padding: '12px' }}>
              <Plus size={16} /> Secure and Push to Cloud Firebase
            </button>
          </form>
        </div>

        {/* Read Layout Encrypted Vault Stack */}
        <div className={styles.editor} style={{ padding: '20px', background: 'var(--surface3)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border2)', paddingBottom: '10px' }}>
            <h3 style={{ fontFamily: 'Lora, serif', fontWeight: '600' }}>Active Cloud Crypt-Vault Documents</h3>
            {loading && <RefreshCw size={16} className={styles.aiSpinner} />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lockerItems.map((item) => (
              <div key={item.id} className={styles.statCard} style={{ textAlign: 'left', padding: '16px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--ink)' }}>{item.platform}</span>
                  {visibleId === item.id ? (
                    <span className={styles.folderCountRed}>Masking context in {countdown}s</span>
                  ) : (
                    <button onClick={() => handleRevealRow(item)} className={styles.iconBtnSmall}>
                      <Eye size={14} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'DM Mono, monospace', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'var(--ink3)' }}>Email ID: </span>
                    <span style={{ color: visibleId === item.id ? 'var(--success)' : 'var(--ink2)' }}>
                      {visibleId === item.id ? revealedData.email : item.maskedEmail}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink3)' }}>Password: </span>
                    <span style={{ color: visibleId === item.id ? 'var(--gold)' : 'var(--ink3)' }}>
                      {visibleId === item.id ? revealedData.pass : '••••••••'}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {lockerItems.length === 0 && !loading && (
              <div className={styles.emptyState}>
                <p>No secure cryptographic primitives inside this repository channel.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
