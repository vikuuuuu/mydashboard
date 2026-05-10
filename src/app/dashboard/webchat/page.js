"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, orderBy, getDocs, doc, getDoc,
  updateDoc, setDoc, deleteDoc, limit, writeBatch,
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

// ══════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

const EMOJI_LIST    = ["❤️","😂","😮","😢","🙏","👍","🔥","😍"];
const EMOJI_PICKER  = ["😊","😂","❤️","👍","🙏","😮","😢","🎉","🔥","😍","🤔","👎","😡","🥰","😎","🤝","💪","✅","❌","⭐","🎊","🙌","👋","😴","🤣","😇","🥺","💯","🚀","💡"];
const WALLPAPERS    = ["#efeae2","#1a1a2e","#0d3b33","#1e3a5f","#2d1b33"];

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════
const formatTime = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date(), yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
};

const formatLastSeen = (ts) => {
  if (!ts) return "Last seen recently";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d;
  if (diff < 60000) return "Last seen just now";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d >= today) return `Last seen today at ${time}`;
  if (d >= yesterday) return `Last seen yesterday at ${time}`;
  return `Last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })} at ${time}`;
};

const formatDuration = (sec) => `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;

const formatVoiceDuration = (sec) => {
  if (!sec) return "0:00";
  return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,"0")}`;
};

const fmtFileSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + "KB";
  return (bytes/1048576).toFixed(2) + "MB";
};

// ══════════════════════════════════════════════════════════════
//  NOTIFICATION
// ══════════════════════════════════════════════════════════════
let _swReg = null;

const playNotifSound = (type = "message") => {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === "call") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(480, ctx.currentTime);
      osc.frequency.setValueAtTime(520, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    }
  } catch (_) {}
};

const sendBrowserNotification = (title, body, opts = {}) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  playNotifSound(opts.sound || "message");
  const o = { body, icon: "/icon-192.png", tag: opts.tag || "chat", requireInteraction: !!opts.requireInteraction, silent: false };
  try {
    const n = new Notification(title, o);
    if (!opts.requireInteraction) setTimeout(() => n.close(), 6000);
  } catch (_) {}
};

// ══════════════════════════════════════════════════════════════
//  ICONS
// ══════════════════════════════════════════════════════════════
const Ic = {
  Back:    () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  Search:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Close:   ({s=18}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Video:   ({s=20}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>,
  Phone:   ({s=20}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>,
  End:     () => <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>,
  Mic:     ({muted}) => muted
    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
    : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>,
  Cam:     ({off}) => off
    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4-4-14.5 14.5 2 2L8 15.5V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.5l-1-1zM16 13.85L8.15 6H16v7.85zM3 7v10a1 1 0 0 0 1 1h1.85l-2-2H4V7.85l-1-1V7z"/></svg>
    : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>,
  Speaker: ({off}) => off
    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
    : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>,
  FlipCam: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-5 11.5V14H9v2.5L5.5 13 9 9.5V12h6V9.5l3.5 3.5-3.5 3.5z"/></svg>,
  Send:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>,
  Attach:  () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>,
  Image:   () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>,
  Mic2:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>,
  Pin:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>,
  Reply:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>,
  Forward: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>,
  Edit:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>,
  Delete:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
  Copy:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>,
  Doc:     () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>,
  Play:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  Stop:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>,
  Check:   ({double=false, blue=false}) => double
    ? <span style={{color: blue?"#53bdeb":"#8696a0", fontSize:13}}>✓✓</span>
    : <span style={{color:"#8696a0", fontSize:13}}>✓</span>,
};

// ══════════════════════════════════════════════════════════════
//  AVATAR
// ══════════════════════════════════════════════════════════════
function Avatar({ name = "?", photoURL = null, size = 40, online = false }) {
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#FF6B6B","#6C5CE7","#fd79a8","#00b894"];
  const color  = colors[(name?.charCodeAt(0) || 0) % colors.length];
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{ position:"relative", flexShrink:0 }}>
      {photoURL && !imgErr
        ? <img src={photoURL} alt={name} onError={() => setImgErr(true)}
            style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", display:"block" }} />
        : <div style={{ width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg,${color},${color}bb)`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:size*0.4, flexShrink:0 }}>
            {(name?.charAt(0)||"?").toUpperCase()}
          </div>
      }
      {online && <div style={{ position:"absolute", bottom:1, right:1, width:size*0.27, height:size*0.27, borderRadius:"50%", background:"#25D366", border:"2px solid #fff" }} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={{ position:"fixed", top:16, right:16, zIndex:9990, display:"flex", flexDirection:"column", gap:8, maxWidth:340, pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => onDismiss(t.id)}
          style={{ background:"#fff", borderRadius:14, padding:"10px 14px", boxShadow:"0 6px 24px rgba(0,0,0,0.18)", display:"flex", alignItems:"center", gap:10, cursor:"pointer", borderLeft:`4px solid ${t.color||"#25D366"}`, animation:"slideInRight 0.28s ease", pointerEvents:"all" }}>
          <div style={{ fontSize:20, flexShrink:0 }}>{t.icon||"💬"}</div>
          <div style={{ flex:1, overflow:"hidden" }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#111b21" }}>{t.title}</div>
            <div style={{ fontSize:12, color:"#8696a0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.body}</div>
          </div>
          <button onClick={e => { e.stopPropagation(); onDismiss(t.id); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", padding:2, flexShrink:0 }}>
            <Ic.Close s={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  TYPING DOTS
// ══════════════════════════════════════════════════════════════
function TypingDots() {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, height:16 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#25D366", display:"inline-block", animation:`typingBounce 1.2s ${i*0.2}s infinite ease-in-out` }} />
      ))}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
//  MEDIA PREVIEW MODAL
// ══════════════════════════════════════════════════════════════
function MediaModal({ src, type, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:4000, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:"50%", width:40, height:40, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Ic.Close s={22} />
      </button>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth:"90vw", maxHeight:"90vh" }}>
        {type === "image"
          ? <img src={src} alt="" style={{ maxWidth:"90vw", maxHeight:"90vh", borderRadius:8, objectFit:"contain" }} />
          : type === "video"
          ? <video src={src} controls autoPlay style={{ maxWidth:"90vw", maxHeight:"90vh", borderRadius:8 }} />
          : null
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  VOICE MESSAGE PLAYER
// ══════════════════════════════════════════════════════════════
function VoicePlayer({ url, duration, isMine }) {
  const [playing,  setPlaying ] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed,  setElapsed ] = useState(0);
  const audioRef = useRef(new Audio(url));

  useEffect(() => {
    const a = audioRef.current;
    const onEnd  = () => { setPlaying(false); setProgress(0); setElapsed(0); };
    const onTime = () => {
      const pct = a.duration ? (a.currentTime / a.duration) * 100 : 0;
      setProgress(pct);
      setElapsed(Math.floor(a.currentTime));
    };
    a.addEventListener("ended", onEnd);
    a.addEventListener("timeupdate", onTime);
    return () => { a.removeEventListener("ended", onEnd); a.removeEventListener("timeupdate", onTime); a.pause(); };
  }, [url]);

  const toggle = () => {
    const a = audioRef.current;
    if (playing) { a.pause(); setPlaying(false); } else { a.play(); setPlaying(true); }
  };

  const trackColor = isMine ? "rgba(0,0,0,0.2)" : "#ddd";
  const fillColor  = isMine ? "#075E54"          : "#25D366";

  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:180 }}>
      <button onClick={toggle} style={{ width:38, height:38, borderRadius:"50%", background: isMine?"rgba(0,0,0,0.15)":"#f0f2f5", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color: isMine?"#fff":"#128C7E" }}>
        {playing ? <Ic.Stop /> : <Ic.Play />}
      </button>
      <div style={{ flex:1 }}>
        <div style={{ height:4, background:trackColor, borderRadius:2, overflow:"hidden", marginBottom:4 }}>
          <div style={{ width:`${progress}%`, height:"100%", background:fillColor, borderRadius:2, transition:"width 0.1s linear" }} />
        </div>
        <div style={{ fontSize:11, color: isMine?"rgba(255,255,255,0.7)":"#8696a0" }}>
          {playing ? formatVoiceDuration(elapsed) : formatVoiceDuration(duration)}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CONTEXT MENU  (FIX: position adjusted to not overflow)
// ══════════════════════════════════════════════════════════════
function ContextMenu({ x, y, isMine, msgId, msgText, msgType, onDelete, onReact, onReply, onForward, onEdit, onPin, onClose }) {
  const ref = useRef();
  const [pos, setPos] = useState({ top: y, left: x });

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", fn);
    document.addEventListener("touchstart", fn);
    return () => { document.removeEventListener("mousedown", fn); document.removeEventListener("touchstart", fn); };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const ww   = window.innerWidth, wh = window.innerHeight;
    let top  = y, left = x;
    if (left + rect.width  > ww - 8) left  = ww - rect.width  - 8;
    if (top  + rect.height > wh - 8) top   = wh - rect.height - 8;
    if (left < 8) left = 8;
    if (top  < 8) top  = 8;
    setPos({ top, left });
  }, [x, y]);

  const isText = !msgType || msgType === "text";

  return (
    <div ref={ref} style={{ position:"fixed", top:pos.top, left:pos.left, background:"#fff", borderRadius:14, boxShadow:"0 4px 28px rgba(0,0,0,0.22)", zIndex:3000, overflow:"hidden", minWidth:190, animation:"menuPop 0.15s ease" }}>
      <div style={{ display:"flex", gap:2, padding:"10px 10px 8px", borderBottom:"1px solid #f0f2f5" }}>
        {EMOJI_LIST.map(e => (
          <button key={e} onClick={() => { onReact(e); onClose(); }}
            style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", borderRadius:8, padding:"2px 4px", transition:"transform 0.1s" }}
            onMouseEnter={ev => ev.currentTarget.style.transform="scale(1.35)"}
            onMouseLeave={ev => ev.currentTarget.style.transform="scale(1)"}>
            {e}
          </button>
        ))}
      </div>
      {[
        { label:"Reply",   icon:<Ic.Reply />,   fn:() => { onReply(); onClose(); },   show:true },
        { label:"Forward", icon:<Ic.Forward />, fn:() => { onForward(); onClose(); }, show:isText },
        { label:"Pin",     icon:<Ic.Pin />,     fn:() => { onPin(); onClose(); },     show:true },
        { label:"Copy",    icon:<Ic.Copy />,    fn:() => { navigator.clipboard?.writeText(msgText||""); onClose(); }, show:isText },
        { label:"Edit",    icon:<Ic.Edit />,    fn:() => { onEdit(); onClose(); },    show:isMine && isText },
        { label:"Delete",  icon:<Ic.Delete />,  fn:() => { onDelete(); onClose(); },  show:isMine, danger:true },
      ].filter(a => a.show).map(({ label, icon, fn, danger }) => (
        <button key={label} onClick={fn}
          style={{ display:"flex", alignItems:"center", gap:12, width:"100%", background:"none", border:"none", padding:"11px 16px", cursor:"pointer", textAlign:"left", color:danger?"#ef4444":"#111b21", fontSize:14, transition:"background 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.background="#f0f2f5"}
          onMouseLeave={e => e.currentTarget.style.background="none"}>
          <span style={{ color:danger?"#ef4444":"#8696a0", display:"flex", alignItems:"center" }}>{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CALL LOG BUBBLE
// ══════════════════════════════════════════════════════════════
function CallLogBubble({ msg, isMine }) {
  const missed = msg.callStatus === "missed";
  const label  = missed ? `Missed ${msg.callType === "video" ? "Video" : "Audio"} Call` : `${msg.callType === "video" ? "Video" : "Audio"} Call`;
  const color  = missed ? "#ef4444" : "#25D366";
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"4px 10px", marginBottom:2 }}>
      <div style={{ background:"#fff", borderRadius:14, padding:"10px 16px", boxShadow:"0 1px 2px rgba(0,0,0,0.1)", display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#8696a0" }}>
        <span style={{ color }}>{missed ? "📵" : (msg.callType==="video"?"📹":"📞")}</span>
        <span style={{ fontWeight:600, color }}>{label}</span>
        {msg.callDuration && <span>· {msg.callDuration}</span>}
        <span>{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MESSAGE BUBBLE  (FIX: no state leak, correct reply logic)
// ══════════════════════════════════════════════════════════════
function Bubble({ msg, isMine, senderName, onContextMenu, deletedIds, allMessages, onMediaClick }) {
  const isDeleted  = deletedIds.has(msg.id);
  const replyMsg   = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;

  if (msg.type === "call") return <CallLogBubble msg={msg} isMine={isMine} />;

  const bubbleBg = isDeleted ? "#f0f2f5" : isMine ? "#d9fdd3" : "#fff";

  return (
    <div style={{ display:"flex", justifyContent:isMine?"flex-end":"flex-start", marginBottom:2, padding:"2px 10px" }}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}>
      <div style={{ maxWidth:"72%", position:"relative" }}>
        <div style={{ background:bubbleBg, borderRadius:isMine?"18px 18px 4px 18px":"18px 18px 18px 4px", padding:"7px 10px 5px", boxShadow:"0 1px 2px rgba(0,0,0,0.1)", overflow:"hidden" }}>
          {/* Sender name */}
          {!isMine && senderName && !isDeleted && (
            <div style={{ color:"#25D366", fontSize:12, fontWeight:700, marginBottom:2 }}>{senderName}</div>
          )}
          {/* Forwarded label */}
          {msg.forwarded && !isDeleted && (
            <div style={{ color:"#8696a0", fontSize:11, fontStyle:"italic", marginBottom:4, display:"flex", alignItems:"center", gap:4 }}>
              <Ic.Forward /> Forwarded
            </div>
          )}
          {/* Reply preview */}
          {replyMsg && !isDeleted && (
            <div style={{ background:isMine?"rgba(0,0,0,0.06)":"rgba(0,0,0,0.05)", borderLeft:"3px solid #25D366", borderRadius:"8px 8px 0 0", padding:"6px 10px", marginBottom:6 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#25D366", marginBottom:2 }}>
                {replyMsg.senderId === msg.senderId ? (isMine ? "You" : senderName) : (isMine ? senderName : "You")}
              </div>
              <div style={{ fontSize:12, color:"#54656f", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {deletedIds.has(replyMsg.id) ? "🚫 Deleted" : (replyMsg.text || (replyMsg.type==="voice" ? "🎤 Voice" : replyMsg.type==="image" ? "🖼 Image" : "(message)"))}
              </div>
            </div>
          )}
          {/* Pin indicator */}
          {msg.pinned && <div style={{ fontSize:10, color:"#8696a0", marginBottom:3 }}><Ic.Pin /> Pinned</div>}
          {/* Content */}
          {isDeleted ? (
            <div style={{ color:"#8696a0", fontSize:14, fontStyle:"italic" }}>
              {isMine ? "🚫 You deleted this message" : "🚫 This message was deleted"}
            </div>
          ) : msg.type === "image" ? (
            <div onClick={() => onMediaClick(msg.fileURL, "image")} style={{ cursor:"pointer", borderRadius:8, overflow:"hidden", marginBottom:4 }}>
              <img src={msg.fileURL} alt="" style={{ maxWidth:240, maxHeight:200, objectFit:"cover", display:"block", borderRadius:8 }} />
            </div>
          ) : msg.type === "video" ? (
            <div onClick={() => onMediaClick(msg.fileURL, "video")} style={{ cursor:"pointer", position:"relative", borderRadius:8, overflow:"hidden", marginBottom:4 }}>
              <video src={msg.fileURL} style={{ maxWidth:240, maxHeight:200, objectFit:"cover", display:"block", borderRadius:8 }} />
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <div style={{ background:"rgba(0,0,0,0.5)", borderRadius:"50%", width:42, height:42, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}><Ic.Play /></div>
              </div>
            </div>
          ) : msg.type === "voice" ? (
            <VoicePlayer url={msg.fileURL} duration={msg.voiceDuration} isMine={isMine} />
          ) : msg.type === "file" ? (
            <a href={msg.fileURL} target="_blank" rel="noopener noreferrer" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none", padding:"4px 0", minWidth:160 }}>
              <div style={{ width:40, height:40, borderRadius:8, background:isMine?"rgba(0,0,0,0.1)":"#f0f2f5", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:isMine?"#075E54":"#128C7E" }}><Ic.Doc /></div>
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ fontSize:13, fontWeight:600, color:isMine?"#111":"#111b21", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{msg.fileName}</div>
                <div style={{ fontSize:11, color:"#8696a0" }}>{fmtFileSize(msg.fileSize)}</div>
              </div>
            </a>
          ) : (
            <div style={{ color:isDeleted?"#8696a0":"#111b21", fontSize:14.5, lineHeight:1.45, wordBreak:"break-word" }}>
              {msg.text}
            </div>
          )}
          {/* Caption */}
          {msg.caption && !isDeleted && (
            <div style={{ color:"#111b21", fontSize:14, marginTop:4, wordBreak:"break-word" }}>{msg.caption}</div>
          )}
          {/* Time + edited + ticks */}
          <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap:4, marginTop:3 }}>
            {msg.edited && !isDeleted && <span style={{ fontSize:10, color:"#8696a0", fontStyle:"italic" }}>edited</span>}
            <span style={{ color:"#8696a0", fontSize:11 }}>{formatTime(msg.createdAt)}</span>
            {isMine && !isDeleted && (
              <Ic.Check double={msg.delivered || msg.read} blue={msg.read} />
            )}
          </div>
        </div>
        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginTop:3, justifyContent:isMine?"flex-end":"flex-start" }}>
            {Object.entries(
              Object.values(msg.reactions).reduce((a,e) => { a[e]=(a[e]||0)+1; return a; }, {})
            ).map(([emoji,count]) => (
              <span key={emoji} style={{ background:"#fff", borderRadius:12, padding:"2px 7px", fontSize:13, boxShadow:"0 1px 3px rgba(0,0,0,0.12)", display:"flex", alignItems:"center", gap:3, border:"1px solid #e0e0e0" }}>
                {emoji}{count > 1 && <span style={{ fontSize:11, color:"#555", fontWeight:700 }}>{count}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DateDivider({ label }) {
  return (
    <div style={{ display:"flex", justifyContent:"center", margin:"10px 0" }}>
      <div style={{ background:"rgba(255,255,255,0.85)", color:"#8696a0", fontSize:12, padding:"4px 12px", borderRadius:8, boxShadow:"0 1px 2px rgba(0,0,0,0.08)" }}>{label}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  UPLOAD PROGRESS
// ══════════════════════════════════════════════════════════════
function UploadProgress({ progress, onCancel }) {
  return (
    <div style={{ background:"#f0f2f5", padding:"8px 14px", display:"flex", alignItems:"center", gap:10, borderTop:"1px solid #ddd" }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:12, color:"#54656f", marginBottom:4 }}>Uploading… {Math.round(progress)}%</div>
        <div style={{ height:3, background:"#ddd", borderRadius:2 }}>
          <div style={{ width:`${progress}%`, height:"100%", background:"#25D366", borderRadius:2, transition:"width 0.2s" }} />
        </div>
      </div>
      <button onClick={onCancel} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0" }}><Ic.Close s={16} /></button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  REPLY PREVIEW BAR
// ══════════════════════════════════════════════════════════════
function ReplyBar({ replyTo, onCancel }) {
  if (!replyTo) return null;
  return (
    <div style={{ background:"#f0f2f5", borderLeft:"4px solid #25D366", padding:"8px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, borderBottom:"1px solid #ddd", animation:"slideDown 0.15s ease" }}>
      <div style={{ flex:1, overflow:"hidden" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#25D366", marginBottom:2 }}>{replyTo.isMine ? "You" : replyTo.senderName || "Them"}</div>
        <div style={{ fontSize:12, color:"#8696a0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{replyTo.text || (replyTo.type==="voice"?"🎤 Voice":"(message)")}</div>
      </div>
      <button onClick={onCancel} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", display:"flex", alignItems:"center", padding:4 }}><Ic.Close s={18} /></button>
    </div>
  );
}

function EditBar({ editingMsg, onCancel }) {
  if (!editingMsg) return null;
  return (
    <div style={{ background:"#f0f2f5", borderLeft:"4px solid #34B7F1", padding:"8px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, borderBottom:"1px solid #ddd" }}>
      <div style={{ flex:1, overflow:"hidden" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#34B7F1", marginBottom:2 }}>Editing message</div>
        <div style={{ fontSize:12, color:"#8696a0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{editingMsg.text}</div>
      </div>
      <button onClick={onCancel} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", display:"flex", alignItems:"center", padding:4 }}><Ic.Close s={18} /></button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  FORWARD MODAL
// ══════════════════════════════════════════════════════════════
function ForwardModal({ chats, currentUser, msgText, onForward, onClose }) {
  const [sel, setSel] = useState(null);
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:3500, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:18, width:Math.min(380, window.innerWidth-32), maxHeight:"70vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.22)", animation:"menuPop 0.2s ease" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #f0f2f5", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontWeight:700, fontSize:16, color:"#111b21" }}>Forward Message</span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0" }}><Ic.Close s={20} /></button>
        </div>
        <div style={{ padding:"10px 16px 4px", background:"#f8f9fa", margin:"8px 16px", borderRadius:10, fontSize:13, color:"#54656f", fontStyle:"italic" }}>
          "{msgText?.slice(0,80)}{(msgText?.length||0)>80?"…":""}"
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {chats.map(c => (
            <div key={c.id} onClick={() => setSel(c.id === sel ? null : c.id)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px", cursor:"pointer", background:sel===c.id?"#e8f5e9":"#fff", borderBottom:"1px solid #f0f2f5", transition:"background 0.15s" }}>
              <Avatar name={c.otherUser?.name||"?"} photoURL={c.otherUser?.photoURL} size={40} />
              <span style={{ fontWeight:600, fontSize:14, color:"#111b21", flex:1 }}>{c.otherUser?.name}</span>
              {sel === c.id && <span style={{ color:"#25D366", fontSize:18 }}>✓</span>}
            </div>
          ))}
        </div>
        <div style={{ padding:"14px 20px", borderTop:"1px solid #f0f2f5" }}>
          <button onClick={() => sel && onForward(sel)} disabled={!sel}
            style={{ width:"100%", padding:"12px", borderRadius:24, background:sel?"#25D366":"#ccc", border:"none", cursor:sel?"pointer":"default", color:"#fff", fontWeight:700, fontSize:15 }}>
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  EMOJI PICKER
// ══════════════════════════════════════════════════════════════
function EmojiPicker({ onSelect, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);
  return (
    <div ref={ref} style={{ position:"absolute", bottom:"100%", left:0, background:"#fff", borderRadius:14, boxShadow:"0 4px 24px rgba(0,0,0,0.2)", padding:12, zIndex:1000, display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:4, width:220, animation:"menuPop 0.15s ease" }}>
      {EMOJI_PICKER.map(e => (
        <button key={e} onClick={() => onSelect(e)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, borderRadius:8, padding:4, transition:"transform 0.1s" }}
          onMouseEnter={ev => ev.currentTarget.style.transform="scale(1.3)"}
          onMouseLeave={ev => ev.currentTarget.style.transform="scale(1)"}>
          {e}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  PINNED MESSAGES BAR
// ══════════════════════════════════════════════════════════════
function PinnedBar({ messages, onClose }) {
  const pinned = messages.filter(m => m.pinned && !m.deleted);
  if (!pinned.length) return null;
  const last = pinned[pinned.length - 1];
  return (
    <div style={{ background:"#fff", borderBottom:"1px solid #f0f2f5", padding:"8px 16px", display:"flex", alignItems:"center", gap:10, animation:"slideDown 0.2s ease", cursor:"pointer" }}>
      <Ic.Pin />
      <div style={{ flex:1, overflow:"hidden" }}>
        <div style={{ fontSize:11, color:"#25D366", fontWeight:700, marginBottom:1 }}>Pinned Message</div>
        <div style={{ fontSize:13, color:"#111b21", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{last.text||"📎 Media"}</div>
      </div>
      <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0" }}><Ic.Close s={16} /></button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CALL SCREENS
// ══════════════════════════════════════════════════════════════
function IncomingCallScreen({ callerName, callerPhoto, callType, onAccept, onReject }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:3000, background:"linear-gradient(160deg,#0a1628 0%,#0d2137 50%,#0a1628 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:24 }}>
      {[1,2,3].map(i => <div key={i} style={{ position:"absolute", top:"30%", left:"50%", transform:"translate(-50%,-50%)", width:80+i*40, height:80+i*40, borderRadius:"50%", border:"2px solid rgba(37,211,102,0.25)", animation:`ripple 2s ${i*0.4}s infinite ease-out`, pointerEvents:"none" }} />)}
      <div style={{ zIndex:1 }}><Avatar name={callerName} photoURL={callerPhoto} size={96} /></div>
      <div style={{ textAlign:"center", zIndex:1 }}>
        <div style={{ color:"#fff", fontSize:26, fontWeight:700, marginBottom:6 }}>{callerName}</div>
        <div style={{ color:"#25D366", fontSize:15, letterSpacing:1 }}>Incoming {callType==="video"?"📹 Video":"📞 Audio"} Call…</div>
      </div>
      <div style={{ display:"flex", gap:56, marginTop:24, zIndex:1 }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
          <button onClick={onReject} style={{ width:64, height:64, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(239,68,68,0.5)" }}><Ic.End /></button>
          <span style={{ color:"#aaa", fontSize:12 }}>Decline</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
          <button onClick={onAccept} style={{ width:64, height:64, borderRadius:"50%", background:"#25D366", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(37,211,102,0.5)" }}>
            {callType==="video" ? <Ic.Video s={26} /> : <Ic.Phone s={26} />}
          </button>
          <span style={{ color:"#aaa", fontSize:12 }}>Accept</span>
        </div>
      </div>
    </div>
  );
}

function CallingScreen({ otherUser, callType, onCancel }) {
  const [dots, setDots] = useState("");
  useEffect(() => { const iv = setInterval(() => setDots(d => d.length>=3?"":d+"."), 500); return () => clearInterval(iv); }, []);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:3000, background:"linear-gradient(160deg,#0a1628,#0d2137)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
      {[1,2,3].map(i => <div key={i} style={{ position:"absolute", top:"30%", left:"50%", transform:"translate(-50%,-50%)", width:80+i*40, height:80+i*40, borderRadius:"50%", border:"2px solid rgba(37,211,102,0.2)", animation:`ripple 2.5s ${i*0.5}s infinite ease-out`, pointerEvents:"none" }} />)}
      <div style={{ zIndex:1 }}><Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={96} /></div>
      <div style={{ color:"#fff", fontSize:24, fontWeight:700, zIndex:1 }}>{otherUser?.name}</div>
      <div style={{ color:"#8696a0", fontSize:15, zIndex:1 }}>{callType==="video"?"📹 Video":"📞 Audio"} · Calling{dots}</div>
      <button onClick={onCancel} style={{ marginTop:32, width:64, height:64, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(239,68,68,0.5)", zIndex:1 }}><Ic.End /></button>
    </div>
  );
}

function VideoCallUI({ localStream, remoteStream, callDuration, isMuted, isCameraOff, isSpeakerOff, isFrontCam, onToggleMute, onToggleCamera, onToggleSpeaker, onFlipCamera, onEnd, otherUser, callType }) {
  const localRef  = useRef();
  const remoteRef = useRef();
  const [showCtrls, setShowCtrls] = useState(true);
  const ctrlTimer = useRef();

  useEffect(() => { if (localRef.current  && localStream)  localRef.current.srcObject  = localStream;  }, [localStream]);
  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      remoteRef.current.srcObject = remoteStream;
      remoteRef.current.muted     = !!isSpeakerOff;
    }
  }, [remoteStream, isSpeakerOff]);

  const showControls = () => { setShowCtrls(true); clearTimeout(ctrlTimer.current); ctrlTimer.current = setTimeout(() => setShowCtrls(false), 4000); };
  const dur = formatDuration(callDuration);

  if (callType === "audio") {
    return (
      <div style={{ position:"fixed", inset:0, zIndex:3000, background:"linear-gradient(160deg,#0a1628,#0d2137)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
        <audio ref={remoteRef} autoPlay style={{ display:"none" }} />
        <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={110} online />
        <div style={{ color:"#fff", fontSize:22, fontWeight:700, marginTop:8 }}>{otherUser?.name}</div>
        <div style={{ color:"#25D366", fontSize:14 }}>{dur}</div>
        <div style={{ display:"flex", gap:24, marginTop:32, alignItems:"center" }}>
          {[
            { icon:<Ic.Speaker off={isSpeakerOff}/>, fn:onToggleSpeaker, label:isSpeakerOff?"Speaker Off":"Speaker", active:!isSpeakerOff },
            { icon:<Ic.End />, fn:onEnd, label:"End", big:true, danger:true },
            { icon:<Ic.Mic muted={isMuted}/>, fn:onToggleMute, label:isMuted?"Unmute":"Mute", active:!isMuted, red:isMuted },
          ].map(({ icon, fn, label, big, danger, active, red }) => (
            <div key={label} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <button onClick={fn} style={{ width:big?68:52, height:big?68:52, borderRadius:"50%", background:danger?"#ef4444":red?"#ef4444":active?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:danger?"0 4px 24px rgba(239,68,68,0.6)":"none" }}>{icon}</button>
              <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div onMouseMove={showControls} onClick={showControls} style={{ position:"fixed", inset:0, zIndex:3000, background:"#000", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <video ref={remoteRef} autoPlay playsInline style={{ width:"100%", height:"100%", objectFit:"contain", background:"#111" }} />
      {!remoteStream && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, background:"linear-gradient(160deg,#0a1628,#0d2137)" }}>
          <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={100} />
          <div style={{ color:"#fff", fontSize:20, fontWeight:700 }}>{otherUser?.name}</div>
          <div style={{ color:"#8696a0", fontSize:14 }}>Connecting…</div>
        </div>
      )}
      <div style={{ position:"absolute", bottom:90, right:16, width:110, height:155, borderRadius:16, overflow:"hidden", border:"2px solid rgba(255,255,255,0.3)", boxShadow:"0 4px 20px rgba(0,0,0,0.5)", background:"#222" }}>
        {isCameraOff
          ? <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#1a1a1a" }}><span style={{ fontSize:32 }}>🚫</span></div>
          : <video ref={localRef} autoPlay playsInline muted style={{ width:"100%", height:"100%", objectFit:"cover", transform:isFrontCam?"scaleX(-1)":"none" }} />
        }
      </div>
      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"20px 20px 16px", background:"linear-gradient(to bottom,rgba(0,0,0,0.6),transparent)", display:"flex", alignItems:"center", justifyContent:"space-between", opacity:showCtrls?1:0, transition:"opacity 0.3s" }}>
        <div>
          <div style={{ color:"#fff", fontWeight:700, fontSize:17 }}>{otherUser?.name}</div>
          <div style={{ color:"#25D366", fontSize:13 }}>{dur}</div>
        </div>
      </div>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"16px 0 36px", background:"linear-gradient(to top,rgba(0,0,0,0.7),transparent)", display:"flex", justifyContent:"center", alignItems:"center", gap:14, flexWrap:"wrap", opacity:showCtrls?1:0, transition:"opacity 0.3s" }}>
        {[
          { icon:<Ic.Speaker off={isSpeakerOff}/>, fn:onToggleSpeaker, label:isSpeakerOff?"Off":"Speaker" },
          { icon:<Ic.Mic muted={isMuted}/>, fn:onToggleMute, label:isMuted?"Unmute":"Mute" },
        ].map(({ icon, fn, label }) => (
          <div key={label} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <button onClick={fn} style={{ width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,0.2)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>{icon}</button>
            <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11 }}>{label}</span>
          </div>
        ))}
        <button onClick={onEnd} style={{ width:64, height:64, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(239,68,68,0.5)" }}><Ic.End /></button>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
          <button onClick={onToggleCamera} style={{ width:48, height:48, borderRadius:"50%", background:!isCameraOff?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}><Ic.Cam off={isCameraOff} /></button>
          <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11 }}>Cam</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
          <button onClick={onFlipCamera} style={{ width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,0.2)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}><Ic.FlipCam /></button>
          <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11 }}>{isFrontCam?"Back":"Front"}</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  useVideoCall HOOK (ALL BUGS FIXED)
// ══════════════════════════════════════════════════════════════
function useVideoCall({ currentUser, chat, addToast }) {
  const [callState,    setCallState   ] = useState("idle");
  const [incomingData, setIncomingData] = useState(null);
  const [localStream,  setLocalStream ] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted,      setIsMuted     ] = useState(false);
  const [isCameraOff,  setIsCameraOff ] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isFrontCam,   setIsFrontCam  ] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef            = useRef(null);
  const roomDocRef       = useRef(null);
  const callStartRef     = useRef(null);
  const localStreamRef   = useRef(null);
  const durationIv       = useRef(null);
  const unsubsRef        = useRef([]);
  const callStateRef     = useRef("idle");
  const callTypeRef      = useRef("video");
  const wasConnectedRef  = useRef(false);    // FIX: track connection
  const chatRef          = useRef(chat);

  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { chatRef.current = chat; }, [chat]);

  // Incoming signal
  useEffect(() => {
    if (!currentUser?.uid) return;
    const signalRef = doc(db, "users", currentUser.uid, "callSignal", "incoming");
    const unsub = onSnapshot(signalRef, snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === "calling" && callStateRef.current === "idle") {
        setIncomingData(data);
        setCallState("incoming");
        callTypeRef.current = data.callType || "video";
        sendBrowserNotification(`📞 Incoming ${data.callType==="video"?"Video":"Audio"} Call`, `from ${data.callerName||"Someone"}`, { requireInteraction:true, sound:"call" });
        addToast({ id:Date.now(), icon:data.callType==="video"?"📹":"📞", title:`Incoming ${data.callType==="video"?"Video":"Audio"} Call`, body:`from ${data.callerName||"Someone"}`, color:"#25D366" });
      } else if (data.status === "ended" && callStateRef.current !== "idle") {
        cleanupCall(false);
      }
    });
    return () => unsub();
  }, [currentUser?.uid]);

  const getMedia = async (type = "video", facingMode = "user") => {
    const constraints = type === "audio"
      ? { video:false, audio:true }
      : { video:{ width:{ideal:1280}, height:{ideal:720}, facingMode }, audio:true };
    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = s; setLocalStream(s); return s;
    } catch {
      const s = await navigator.mediaDevices.getUserMedia({ audio:true });
      localStreamRef.current = s; setLocalStream(s); return s;
    }
  };

  const buildPC = (stream) => {
    const pc     = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    const remote = new MediaStream();
    setRemoteStream(remote);
    pc.ontrack = e => e.streams[0].getTracks().forEach(t => remote.addTrack(t));
    pc.onconnectionstatechange = () => {
      if (["connected"].includes(pc.connectionState)) wasConnectedRef.current = true;
      if (["disconnected","failed"].includes(pc.connectionState)) {
        cleanupCall(true, wasConnectedRef.current ? "answered" : "missed");
      }
    };
    return pc;
  };

  const startCall = useCallback(async (type = "video") => {
    if (!currentUser?.uid) return;
    const currentChat = chatRef.current;
    if (!currentChat?.otherUser?.id) return;
    callTypeRef.current = type; wasConnectedRef.current = false;
    setIsFrontCam(true); setCallState("calling"); setCallDuration(0);
    try {
      const stream  = await getMedia(type, "user");
      const pc      = buildPC(stream);
      pcRef.current = pc;
      const roomRef = await addDoc(collection(db, "rooms"), {
        callerId:currentUser.uid, calleeId:currentChat.otherUser.id,
        chatId:currentChat.id, callType:type, createdAt:serverTimestamp(), status:"calling",
      });
      roomDocRef.current = roomRef;
      pc.onicecandidate = async e => { if (e.candidate) await addDoc(collection(db, "rooms", roomRef.id, "callerCandidates"), e.candidate.toJSON()); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(roomRef, { offer:{ type:offer.type, sdp:offer.sdp } });
      await setDoc(doc(db, "users", currentChat.otherUser.id, "callSignal", "incoming"), {
        status:"calling", callerId:currentUser.uid,
        callerName:currentUser.name||"Unknown", callerPhoto:currentUser.photoURL||null,
        roomId:roomRef.id, chatId:currentChat.id, callType:type,
      });
      const u1 = onSnapshot(roomRef, async snap => {
        const d = snap.data();
        if (d?.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
          wasConnectedRef.current = true;
          setCallState("connected");
          callStartRef.current = Date.now();
          clearInterval(durationIv.current);
          durationIv.current = setInterval(() => setCallDuration(x => x + 1), 1000);
        }
        if (d?.status === "ended") cleanupCall(false, "answered");
      });
      const u2 = onSnapshot(collection(db, "rooms", roomRef.id, "calleeCandidates"), snap => {
        snap.docChanges().forEach(async ch => { if (ch.type==="added") await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {}); });
      });
      unsubsRef.current = [u1, u2];
    } catch (err) { console.error("startCall:", err); setCallState("idle"); }
  }, [currentUser]);

  const acceptCall = useCallback(async () => {
    if (!incomingData) return;
    const { roomId, callType } = incomingData;
    callTypeRef.current = callType || "video"; wasConnectedRef.current = true;
    setIsFrontCam(true); setCallState("connected"); setCallDuration(0);
    try {
      const stream  = await getMedia(callType || "video", "user");
      const pc      = buildPC(stream);
      pcRef.current = pc;
      const roomRef = doc(db, "rooms", roomId);
      roomDocRef.current = roomRef;
      pc.onicecandidate = async e => { if (e.candidate) await addDoc(collection(db, "rooms", roomId, "calleeCandidates"), e.candidate.toJSON()); };
      const snap  = await getDoc(roomRef);
      const offer = snap.data()?.offer;
      if (!offer) { setCallState("idle"); return; }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(roomRef, { answer:{ type:answer.type, sdp:answer.sdp }, status:"connected" });
      const u1 = onSnapshot(collection(db, "rooms", roomId, "callerCandidates"), snap => {
        snap.docChanges().forEach(async ch => { if (ch.type==="added") await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {}); });
      });
      unsubsRef.current = [u1];
      await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
      callStartRef.current = Date.now();
      clearInterval(durationIv.current);
      durationIv.current = setInterval(() => setCallDuration(x => x + 1), 1000);
    } catch (err) { console.error("acceptCall:", err); setCallState("idle"); }
  }, [incomingData, currentUser]);

  // FIX: rejectCall — safe even if chat.participants is undefined
  const rejectCall = useCallback(async () => {
    const currentChat = chatRef.current;
    if (incomingData?.roomId) {
      await updateDoc(doc(db, "rooms", incomingData.roomId), { status:"ended" }).catch(() => {});
      if (currentChat?.id && currentChat?.participants) {
        await addDoc(collection(db, "messages"), {
          chatId:currentChat.id, participants:currentChat.participants,
          senderId:incomingData.callerId, type:"call",
          callType:incomingData.callType||"video", callStatus:"missed",
          callDuration:null, createdAt:serverTimestamp(), read:false,
        }).catch(() => {});
      }
    }
    await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
    setCallState("idle"); setIncomingData(null);
  }, [incomingData, currentUser]);

  // FIX: flipCamera — preserve audio tracks correctly
  const flipCamera = useCallback(async () => {
    if (callTypeRef.current === "audio") return;
    const newFacing = isFrontCam ? "environment" : "user";
    try {
      const newVidStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:newFacing, width:{ideal:1280}, height:{ideal:720} }, audio:false });
      const newVideoTrack = newVidStream.getVideoTracks()[0];
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(newVideoTrack);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => { t.stop(); localStreamRef.current.removeTrack(t); });
        localStreamRef.current.addTrack(newVideoTrack);
        // FIX: rebuild MediaStream keeping audio tracks
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
      setIsFrontCam(f => !f);
    } catch {
      addToast({ id:Date.now(), icon:"⚠️", title:"Camera Flip Failed", body:"Back camera not available.", color:"#f77f00" });
    }
  }, [isFrontCam, addToast]);

  const cleanupCall = useCallback(async (notify = true, status = "missed") => {
    clearInterval(durationIv.current);
    const duration   = callStartRef.current ? Math.floor((Date.now() - callStartRef.current) / 1000) : 0;
    const finalStatus = duration > 0 ? "answered" : (wasConnectedRef.current ? "answered" : status);

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    unsubsRef.current.forEach(u => u?.());
    unsubsRef.current = [];

    if (notify && roomDocRef.current) await updateDoc(roomDocRef.current, { status:"ended" }).catch(() => {});

    const currentChat = chatRef.current;
    const otherId     = currentChat?.otherUser?.id;
    if (notify && otherId) await setDoc(doc(db, "users", otherId, "callSignal", "incoming"), { status:"ended" }).catch(() => {});
    if (currentUser?.uid) await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});

    if (notify && currentChat?.id && currentChat?.participants) {
      const mm = String(Math.floor(duration/60)).padStart(2,"0");
      const ss = String(duration%60).padStart(2,"0");
      await addDoc(collection(db, "messages"), {
        chatId:currentChat.id, participants:currentChat.participants,
        senderId:currentUser.uid, type:"call",
        callType:callTypeRef.current, callStatus:finalStatus,
        callDuration: duration>0 ? `${mm}:${ss}` : null,
        createdAt:serverTimestamp(), read:false,
      }).catch(() => {});
    }

    wasConnectedRef.current = false; callStartRef.current = null;
    localStreamRef.current  = null;  roomDocRef.current = null;
    setLocalStream(null); setRemoteStream(null); setCallState("idle");
    setIncomingData(null); setCallDuration(0); setIsMuted(false); setIsCameraOff(false);
  }, [currentUser]);

  return {
    callState, incomingData, localStream, remoteStream,
    isMuted, isCameraOff, isSpeakerOff, isFrontCam, callDuration,
    callType: callTypeRef.current,
    startCall, acceptCall, rejectCall,
    endCall:       () => cleanupCall(true, wasConnectedRef.current ? "answered" : "missed"),
    toggleMute:    () => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setIsMuted(m => !m); },
    toggleCamera:  () => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setIsCameraOff(c => !c); },
    toggleSpeaker: () => setIsSpeakerOff(s => !s),
    flipCamera,
  };
}

// ══════════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════════
function Sidebar({ chats, currentUser, onSelectChat, activeChatId, isMobile, onBackToDashboard, typingMap, wallpaper, onChangeWallpaper }) {
  const [search,        setSearch       ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSettings,  setShowSettings ] = useState(false);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const q = query(collection(db, "users"), where("name",">=",search), where("name","<=",search+"\uf8ff"));
    const unsub = onSnapshot(q, snap => {
      setSearchResults(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => u.id !== currentUser?.uid));
    });
    return () => unsub();
  }, [search, currentUser]);

  const list = search ? searchResults : chats.filter(c => c.otherUser?.name?.toLowerCase().includes(search.toLowerCase()));

  const handleUserSelect = async (user) => {
    const ex = chats.find(c => c.participants?.includes(user.id));
    if (ex) { onSelectChat(ex); setSearch(""); return; }
    const ref = await addDoc(collection(db, "chats"), { participants:[currentUser.uid, user.id], createdAt:serverTimestamp() });
    onSelectChat({ id:ref.id, participants:[currentUser.uid, user.id], otherUser:user, lastMessage:"", lastMessageTime:null });
    setSearch("");
  };

  const totalUnread = chats.reduce((s, c) => s + (c.unreadCount||0), 0);

  return (
    <div style={{ width:isMobile?"100%":340, background:"#fff", display:"flex", flexDirection:"column", borderRight:isMobile?"none":"1px solid #ddd", height:"100%", flexShrink:0 }}>
      {/* Header */}
      <div style={{ padding:"12px 14px", background:"#f0f2f5", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #ddd", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, overflow:"hidden" }}>
          <button onClick={onBackToDashboard} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:4, display:"flex", alignItems:"center", flexShrink:0 }}><Ic.Back /></button>
          <Avatar name={currentUser?.name||"Me"} photoURL={currentUser?.photoURL} size={38} online />
          <div style={{ overflow:"hidden" }}>
            <div style={{ color:"#111b21", fontWeight:700, fontSize:15, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{currentUser?.name||"You"}</div>
            <div style={{ color:"#25D366", fontSize:11 }}>● Online</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:4, flexShrink:0, alignItems:"center" }}>
          {totalUnread > 0 && <span style={{ background:"#25D366", color:"#fff", borderRadius:12, minWidth:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, padding:"0 5px" }}>{totalUnread>99?"99+":totalUnread}</span>}
          <button onClick={() => setShowSettings(s => !s)} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", fontSize:20, padding:4 }}>⋮</button>
        </div>
      </div>

      {/* Settings dropdown */}
      {showSettings && (
        <div style={{ background:"#fff", borderBottom:"1px solid #f0f2f5", padding:"10px 14px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#8696a0", marginBottom:8, letterSpacing:0.5 }}>CHAT WALLPAPER</div>
          <div style={{ display:"flex", gap:8 }}>
            {WALLPAPERS.map(w => (
              <button key={w} onClick={() => { onChangeWallpaper(w); setShowSettings(false); }}
                style={{ width:32, height:32, borderRadius:"50%", background:w, border:wallpaper===w?"3px solid #25D366":"2px solid #ddd", cursor:"pointer", flexShrink:0 }} />
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ padding:"8px 12px", background:"#fff" }}>
        <div style={{ background:"#f0f2f5", borderRadius:10, display:"flex", alignItems:"center", padding:"7px 12px", gap:8 }}>
          <span style={{ color:"#8696a0" }}><Ic.Search /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or start new chat"
            style={{ background:"none", border:"none", outline:"none", color:"#111b21", flex:1, fontSize:14 }} />
          {search && <button onClick={() => setSearch("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", display:"flex", alignItems:"center" }}><Ic.Close s={16} /></button>}
        </div>
      </div>

      {/* Chat list */}
      <div style={{ flex:1, overflowY:"auto" }}>
        {list.length === 0 && <div style={{ color:"#8696a0", textAlign:"center", padding:30, fontSize:14 }}>{search?"No users found":"No chats yet"}</div>}
        {list.map(item => {
          const isUser   = !!item.email && !item.otherUser;
          const name     = isUser ? item.name : item.otherUser?.name || "Unknown";
          const isActive = activeChatId === item.id;
          const unread   = !isUser ? (item.unreadCount || 0) : 0;
          const isTyping = !isUser && typingMap?.[item.id];
          const lastTime = !isUser && item.lastMessageTime ? formatTime(item.lastMessageTime) : "";
          const sub      = isUser ? item.email : item.lastMessage || "No messages yet";
          return (
            <div key={item.id} onClick={() => isUser ? handleUserSelect(item) : onSelectChat(item)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", cursor:"pointer", background:isActive?"#f0f2f5":"#fff", borderBottom:"1px solid #f0f2f5", transition:"background 0.15s" }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background="#f8f9fa"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background=isActive?"#f0f2f5":"#fff"; }}>
              <Avatar name={name} photoURL={item.photoURL||item.otherUser?.photoURL} size={46} online={item.online||item.otherUser?.online} />
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"#111b21", fontWeight:600, fontSize:15, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", flex:1 }}>{name}</span>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, flexShrink:0, marginLeft:8 }}>
                    {lastTime && <span style={{ color:unread>0?"#25D366":"#8696a0", fontSize:11 }}>{lastTime}</span>}
                    {unread > 0 && <span style={{ background:"#25D366", color:"#fff", borderRadius:12, minWidth:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, padding:"0 5px" }}>{unread>99?"99+":unread}</span>}
                  </div>
                </div>
                <div style={{ color:"#8696a0", fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginTop:2, display:"flex", alignItems:"center", gap:4 }}>
                  {isTyping ? <span style={{ color:"#25D366", display:"flex", alignItems:"center", gap:5 }}>typing <TypingDots /></span> : sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CHAT PANEL (ALL BUGS FIXED + NEW FEATURES)
// ══════════════════════════════════════════════════════════════
function ChatPanel({ chat, currentUser, onClose, isMobile, addToast, allChats, wallpaper }) {
  const [messages,      setMessages    ] = useState([]);
  const [text,          setText        ] = useState("");
  const [userCache,     setUserCache   ] = useState({});
  const [otherUserData, setOtherUser   ] = useState(null);
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [contextMenu,   setContextMenu ] = useState(null);
  const [deletedIds,    setDeletedIds  ] = useState(new Set());
  const [searchOpen,    setSearchOpen  ] = useState(false);
  const [searchQuery,   setSearchQuery ] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [searchIndex,   setSearchIndex ] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [replyTo,       setReplyTo     ] = useState(null);
  const [editingMsg,    setEditingMsg  ] = useState(null);
  const [forwardMsg,    setForwardMsg  ] = useState(null);
  const [showEmoji,     setShowEmoji   ] = useState(false);
  const [uploadProgress,setUploadProg  ] = useState(null);
  const [uploadCancel,  setUploadCancel] = useState(null);
  const [mediaPreview,  setMediaPreview] = useState(null);
  const [isRecording,   setIsRecording ] = useState(false);
  const [recDuration,   setRecDuration ] = useState(0);
  const [showPinned,    setShowPinned  ] = useState(true);

  const bottomRef      = useRef();
  const containerRef   = useRef();
  const inputRef       = useRef();
  const typingTimeout  = useRef();
  const typingDocRef   = useRef();
  const fileInputRef   = useRef();
  const mediaRecRef    = useRef(null);
  const recChunks      = useRef([]);
  const recTimer       = useRef(null);

  const vc = useVideoCall({ currentUser, chat, addToast });

  // Other user
  useEffect(() => {
    const id = chat?.otherUser?.id;
    if (!id) return;
    return onSnapshot(doc(db, "users", id), snap => { if (snap.exists()) setOtherUser({ id, ...snap.data() }); });
  }, [chat?.otherUser?.id]);

  // Messages
  useEffect(() => {
    if (!chat?.id) { setMessages([]); return; }
    typingDocRef.current = doc(db, "chats", chat.id, "typing", currentUser.uid);
    const q = query(collection(db, "messages"), where("chatId","==",chat.id), orderBy("createdAt","asc"));
    return onSnapshot(q, async snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      setMessages(prev => {
        // New incoming message notification
        if (prev.length > 0 && list.length > prev.length) {
          const newest = list[list.length-1];
          if (newest?.senderId !== currentUser.uid && newest?.type !== "call") {
            const name = otherUserData?.name || "Someone";
            addToast({ id:Date.now(), icon:"💬", title:name, body:newest.text||"📎 Media", color:"#25D366" });
            sendBrowserNotification(name, newest.text||"📎 Media", { tag:"msg-"+chat.id });
          }
        }
        return list;
      });
      // Mark as read + delivered
      const batch = writeBatch(db);
      let hasUpdates = false;
      list.forEach(async m => {
        if (m.senderId !== currentUser.uid) {
          if (!m.read)     { batch.update(doc(db, "messages", m.id), { read:true, delivered:true }); hasUpdates = true; }
          else if (!m.delivered) { batch.update(doc(db, "messages", m.id), { delivered:true }); hasUpdates = true; }
        }
        if (m.senderId && !userCache[m.senderId]) {
          getDoc(doc(db, "users", m.senderId)).then(ud => {
            if (ud.exists()) setUserCache(p => ({ ...p, [m.senderId]:ud.data() }));
          });
        }
      });
      if (hasUpdates) batch.commit().catch(() => {});
      setDeletedIds(new Set(list.filter(m => m.deleted).map(m => m.id)));
    });
  }, [chat?.id, currentUser.uid]);

  // Typing indicator
  useEffect(() => {
    const id = chat?.otherUser?.id;
    if (!chat?.id || !id) return;
    return onSnapshot(doc(db, "chats", chat.id, "typing", id), snap => {
      if (snap.exists()) {
        const age = Date.now() - (snap.data().updatedAt?.toMillis?.() || 0);
        setIsTypingOther(age < 5000);
      } else setIsTypingOther(false);
    });
  }, [chat?.id, chat?.otherUser?.id]);

  // Auto scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, isTypingOther]);

  // Scroll button
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fn = () => setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
    el.addEventListener("scroll", fn);
    return () => el.removeEventListener("scroll", fn);
  }, []);

  // Presence
  useEffect(() => {
    if (!currentUser?.uid) return;
    const ref = doc(db, "users", currentUser.uid);
    updateDoc(ref, { online:true }).catch(() => {});
    return () => updateDoc(ref, { online:false, lastSeen:serverTimestamp() }).catch(() => {});
  }, [currentUser?.uid]);

  // Search (FIX: handle empty results + index wrapping)
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchMatches([]); setSearchIndex(0); return; }
    const q = searchQuery.toLowerCase();
    const matches = messages.reduce((acc, m, i) => { if (m.text?.toLowerCase().includes(q)) acc.push({ i, id:m.id }); return acc; }, []);
    setSearchMatches(matches);
    setSearchIndex(matches.length > 0 ? matches.length - 1 : 0);
  }, [searchQuery, messages]);

  useEffect(() => {
    if (!searchMatches.length) return;
    document.getElementById(`msg-${searchMatches[searchIndex]?.id}`)?.scrollIntoView({ behavior:"smooth", block:"center" });
  }, [searchIndex, searchMatches]);

  // FIX: safe search index navigation
  const searchNext = () => setSearchIndex(i => searchMatches.length > 0 ? (i - 1 + searchMatches.length) % searchMatches.length : 0);
  const searchPrev = () => setSearchIndex(i => searchMatches.length > 0 ? (i + 1) % searchMatches.length : 0);

  const handleTyping = async (val) => {
    setText(val);
    if (!chat?.id || !typingDocRef.current) return;
    await setDoc(typingDocRef.current, { typing:true, updatedAt:serverTimestamp() }).catch(() => {});
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(async () => { await deleteDoc(typingDocRef.current).catch(() => {}); }, 3000);
  };

  // FIX: proper unmount cleanup for typing
  useEffect(() => {
    return () => {
      clearTimeout(typingTimeout.current);
      if (typingDocRef.current) deleteDoc(typingDocRef.current).catch(() => {});
    };
  }, [chat?.id]);

  // Send message
  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !chat?.id) return;
    clearTimeout(typingTimeout.current);
    if (typingDocRef.current) await deleteDoc(typingDocRef.current).catch(() => {});

    if (editingMsg) {
      await updateDoc(doc(db, "messages", editingMsg.id), { text:trimmed, edited:true, editedAt:serverTimestamp() }).catch(() => {});
      setEditingMsg(null);
    } else {
      const msgData = {
        chatId:chat.id, participants:chat.participants||[currentUser.uid, chat.otherUser?.id].filter(Boolean),
        text:trimmed, senderId:currentUser.uid, createdAt:serverTimestamp(), read:false, delivered:false, type:"text",
      };
      if (replyTo) { msgData.replyTo = replyTo.id; msgData.replyToText = replyTo.text; }
      await addDoc(collection(db, "messages"), msgData);
      setReplyTo(null);
    }
    setText("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === "Escape") { setReplyTo(null); setEditingMsg(null); setText(""); setShowEmoji(false); }
  };

  // File upload
  const handleFileUpload = async (file) => {
    if (!file || !chat?.id) return;
    const storage  = getStorage();
    const fileType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
    const path     = `chat_media/${chat.id}/${Date.now()}_${file.name}`;
    const sRef     = storageRef(storage, path);
    const task     = uploadBytesResumable(sRef, file);
    let cancelled  = false;
    setUploadCancel(() => () => { task.cancel(); cancelled = true; setUploadProg(null); });

    task.on("state_changed",
      snap => setUploadProg((snap.bytesTransferred / snap.totalBytes) * 100),
      err  => { console.error(err); setUploadProg(null); addToast({ id:Date.now(), icon:"❌", title:"Upload failed", body:err.message, color:"#ef4444" }); },
      async () => {
        if (cancelled) return;
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db, "messages"), {
          chatId:chat.id, participants:chat.participants||[currentUser.uid, chat.otherUser?.id].filter(Boolean),
          senderId:currentUser.uid, createdAt:serverTimestamp(), read:false, delivered:false,
          type:fileType, fileURL:url, fileName:file.name, fileSize:file.size,
        });
        setUploadProg(null);
      }
    );
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const mr     = new MediaRecorder(stream);
      mediaRecRef.current = mr;
      recChunks.current   = [];
      mr.ondataavailable  = e => { if (e.data.size > 0) recChunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recChunks.current, { type:"audio/webm" });
        const dur  = recDuration;
        setIsRecording(false); setRecDuration(0); clearInterval(recTimer.current);

        const storage = getStorage();
        const path    = `chat_media/${chat.id}/voice_${Date.now()}.webm`;
        const sRef    = storageRef(storage, path);
        const task    = uploadBytesResumable(sRef, blob);
        task.on("state_changed", null, null, async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "messages"), {
            chatId:chat.id, participants:chat.participants||[currentUser.uid, chat.otherUser?.id].filter(Boolean),
            senderId:currentUser.uid, createdAt:serverTimestamp(), read:false, delivered:false,
            type:"voice", fileURL:url, voiceDuration:dur,
          });
        });
      };
      mr.start();
      setIsRecording(true); setRecDuration(0);
      recTimer.current = setInterval(() => setRecDuration(d => d + 1), 1000);
    } catch (err) {
      addToast({ id:Date.now(), icon:"⚠️", title:"Mic blocked", body:"Enable microphone permission.", color:"#ef4444" });
    }
  };

  const stopRecording = () => { mediaRecRef.current?.stop(); clearInterval(recTimer.current); };
  const cancelRecording = () => {
    if (mediaRecRef.current && isRecording) {
      mediaRecRef.current.ondataavailable = null;
      mediaRecRef.current.onstop = null;
      mediaRecRef.current.stop();
      setIsRecording(false); setRecDuration(0); clearInterval(recTimer.current);
    }
  };

  // Actions
  const handleDelete  = async (id) => { setDeletedIds(p => new Set([...p, id])); await updateDoc(doc(db, "messages", id), { deleted:true, text:"" }).catch(() => {}); };
  const handleReact   = async (id, emoji) => { await updateDoc(doc(db, "messages", id), { [`reactions.${currentUser.uid}`]:emoji }).catch(() => {}); };
  const handlePin     = async (id) => { const m = messages.find(x => x.id===id); await updateDoc(doc(db, "messages", id), { pinned:!m?.pinned }).catch(() => {}); };
  const handleEdit    = (msg) => { setEditingMsg(msg); setText(msg.text); setReplyTo(null); setTimeout(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(msg.text.length, msg.text.length); }, 50); };
  const handleReply   = (msg) => { setReplyTo({ id:msg.id, text:msg.text, type:msg.type, senderId:msg.senderId, isMine:msg.senderId===currentUser.uid, senderName:userCache[msg.senderId]?.name||otherUserData?.name }); setEditingMsg(null); setTimeout(() => inputRef.current?.focus(), 50); };
  const handleForwardConfirm = async (targetChatId) => {
    const targetChat = allChats.find(c => c.id===targetChatId);
    if (!targetChat || !forwardMsg) return;
    await addDoc(collection(db, "messages"), {
      chatId:targetChatId, participants:targetChat.participants||[currentUser.uid, targetChat.otherUser?.id].filter(Boolean),
      text:forwardMsg.text, senderId:currentUser.uid, createdAt:serverTimestamp(), read:false, delivered:false, type:"text", forwarded:true,
    });
    setForwardMsg(null);
    addToast({ id:Date.now(), icon:"↩️", title:"Forwarded", body:`Sent to ${targetChat.otherUser?.name}`, color:"#25D366" });
  };

  // Grouped messages
  const grouped = useMemo(() => {
    const g = []; let lastDate = null;
    messages.forEach(m => {
      const label = m.createdAt ? formatDate(m.createdAt) : null;
      if (label && label !== lastDate) { g.push({ type:"date", label }); lastDate = label; }
      g.push({ type:"msg", msg:m });
    });
    return g;
  }, [messages]);

  const displayUser    = otherUserData || chat?.otherUser;
  const isOnline       = displayUser?.online;
  const statusText     = isTypingOther ? null : isOnline ? "Online" : formatLastSeen(displayUser?.lastSeen);
  const currentMatchId = searchMatches[searchIndex]?.id;

  if (!chat) {
    return (
      <div style={{ flex:1, background:"#f0f2f5", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
        <div style={{ fontSize:64 }}>💬</div>
        <div style={{ color:"#8696a0", fontSize:16 }}>Select a chat to start messaging</div>
      </div>
    );
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", height:"100%", background:wallpaper||"#efeae2", minWidth:0 }}
      onClick={() => { if (contextMenu) setContextMenu(null); if (showEmoji) setShowEmoji(false); }}>

      {/* Call overlays */}
      {vc.callState === "incoming" && <IncomingCallScreen callerName={vc.incomingData?.callerName||"Unknown"} callerPhoto={vc.incomingData?.callerPhoto} callType={vc.incomingData?.callType||"video"} onAccept={vc.acceptCall} onReject={vc.rejectCall} />}
      {vc.callState === "calling"  && <CallingScreen otherUser={displayUser} callType={vc.callType} onCancel={() => vc.endCall()} />}
      {vc.callState === "connected" && <VideoCallUI localStream={vc.localStream} remoteStream={vc.remoteStream} callDuration={vc.callDuration} isMuted={vc.isMuted} isCameraOff={vc.isCameraOff} isSpeakerOff={vc.isSpeakerOff} isFrontCam={vc.isFrontCam} onToggleMute={vc.toggleMute} onToggleCamera={vc.toggleCamera} onToggleSpeaker={vc.toggleSpeaker} onFlipCamera={vc.flipCamera} onEnd={vc.endCall} otherUser={displayUser} callType={vc.callType} />}

      {/* Modals */}
      {forwardMsg && <ForwardModal chats={allChats.filter(c => c.id!==chat.id)} currentUser={currentUser} msgText={forwardMsg.text} onForward={handleForwardConfirm} onClose={() => setForwardMsg(null)} />}
      {mediaPreview && <MediaModal src={mediaPreview.src} type={mediaPreview.type} onClose={() => setMediaPreview(null)} />}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} isMine={contextMenu.isMine} msgId={contextMenu.msgId} msgText={contextMenu.msgText} msgType={contextMenu.msgType}
          onDelete={() => handleDelete(contextMenu.msgId)}
          onReact={emoji => handleReact(contextMenu.msgId, emoji)}
          onReply={() => { const m = messages.find(x => x.id===contextMenu.msgId); if(m) handleReply(m); }}
          onForward={() => { const m = messages.find(x => x.id===contextMenu.msgId); if(m) setForwardMsg(m); }}
          onEdit={() => { const m = messages.find(x => x.id===contextMenu.msgId); if(m) handleEdit(m); }}
          onPin={() => handlePin(contextMenu.msgId)}
          onClose={() => setContextMenu(null)} />
      )}

      {/* Header */}
      <div style={{ background:"#f0f2f5", padding:"10px 14px", display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid #ddd", flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:4, display:"flex", alignItems:"center", flexShrink:0 }}><Ic.Back /></button>
        <Avatar name={displayUser?.name||"?"} photoURL={displayUser?.photoURL} size={38} online={isOnline} />
        <div style={{ flex:1, overflow:"hidden" }}>
          <div style={{ color:"#111b21", fontWeight:700, fontSize:15, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{displayUser?.name||"Unknown"}</div>
          <div style={{ fontSize:12, color:isTypingOther||isOnline?"#25D366":"#8696a0", display:"flex", alignItems:"center", gap:5 }}>
            {isTypingOther ? <><span>typing</span><TypingDots /></> : statusText}
          </div>
        </div>
        <div style={{ display:"flex", gap:2, flexShrink:0, alignItems:"center" }}>
          <button onClick={() => vc.startCall("audio")} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:7, borderRadius:8, display:"flex", alignItems:"center" }}><Ic.Phone s={20} /></button>
          <button onClick={() => vc.startCall("video")} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:7, borderRadius:8, display:"flex", alignItems:"center" }}><Ic.Video s={22} /></button>
          <button onClick={() => { setSearchOpen(s=>!s); if(searchOpen) setSearchQuery(""); }} style={{ background:searchOpen?"#e0e0e0":"none", border:"none", cursor:"pointer", color:"#54656f", padding:7, borderRadius:8, display:"flex", alignItems:"center" }}><Ic.Search /></button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div style={{ background:"#f0f2f5", borderBottom:"1px solid #ddd", padding:"8px 12px", display:"flex", alignItems:"center", gap:10, animation:"slideDown 0.2s ease" }}>
          <Ic.Search />
          <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search in chat…"
            style={{ flex:1, background:"#fff", border:"none", borderRadius:20, padding:"8px 14px", fontSize:14, outline:"none" }} />
          {searchQuery && <span style={{ color:"#8696a0", fontSize:13, whiteSpace:"nowrap" }}>{searchMatches.length===0?"No results":`${searchIndex+1}/${searchMatches.length}`}</span>}
          <button onClick={searchNext} disabled={!searchMatches.length} style={{ background:"none", border:"none", cursor:"pointer", color:searchMatches.length?"#54656f":"#ccc", fontSize:16 }}>▲</button>
          <button onClick={searchPrev} disabled={!searchMatches.length} style={{ background:"none", border:"none", cursor:"pointer", color:searchMatches.length?"#54656f":"#ccc", fontSize:16 }}>▼</button>
          <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", display:"flex", alignItems:"center" }}><Ic.Close /></button>
        </div>
      )}

      {/* Pinned messages bar */}
      {showPinned && <PinnedBar messages={messages} onClose={() => setShowPinned(false)} />}

      {/* Messages */}
      <div ref={containerRef} style={{ flex:1, overflowY:"auto", padding:"8px 0", position:"relative" }}>
        {grouped.map((item, i) =>
          item.type === "date" ? <DateDivider key={i} label={item.label} /> : (
            <div id={`msg-${item.msg.id}`} key={item.msg.id}
              style={{ background:searchQuery && item.msg.id===currentMatchId ? "rgba(37,211,102,0.12)" : "transparent", transition:"background 0.5s" }}>
              <Bubble
                msg={item.msg}
                isMine={item.msg.senderId === currentUser?.uid}
                senderName={userCache[item.msg.senderId]?.name}
                deletedIds={deletedIds}
                allMessages={messages}
                onMediaClick={(src, type) => setMediaPreview({ src, type })}
                onContextMenu={(x, y) => setContextMenu({
                  msgId:item.msg.id, msgText:item.msg.text, msgType:item.msg.type,
                  x, y, isMine:item.msg.senderId===currentUser?.uid,
                })}
              />
            </div>
          )
        )}
        {isTypingOther && (
          <div style={{ display:"flex", justifyContent:"flex-start", padding:"4px 10px" }}>
            <div style={{ background:"#fff", borderRadius:"18px 18px 18px 4px", padding:"12px 16px", boxShadow:"0 1px 2px rgba(0,0,0,0.1)", display:"flex", alignItems:"center", gap:4 }}><TypingDots /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <div style={{ position:"relative" }}>
          <button onClick={() => bottomRef.current?.scrollIntoView({ behavior:"smooth" })}
            style={{ position:"absolute", bottom:80, right:16, width:42, height:42, borderRadius:"50%", background:"#fff", border:"none", cursor:"pointer", boxShadow:"0 2px 12px rgba(0,0,0,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"#54656f", zIndex:10 }}>↓</button>
        </div>
      )}

      {/* Upload progress */}
      {uploadProgress !== null && <UploadProgress progress={uploadProgress} onCancel={uploadCancel} />}

      {/* Edit bar */}
      <EditBar editingMsg={editingMsg} onCancel={() => { setEditingMsg(null); setText(""); }} />

      {/* Reply bar */}
      <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />

      {/* Input bar */}
      <div style={{ flexShrink:0 }}>
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" hidden accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value=""; }} />

        {/* Recording mode */}
        {isRecording ? (
          <div style={{ display:"flex", alignItems:"center", padding:"8px 14px", gap:12, background:"#fff", borderTop:"1px solid #ddd" }}>
            <button onClick={cancelRecording} style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", fontSize:22 }}>✕</button>
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:"#ef4444", animation:"pulse 1s infinite" }} />
              <span style={{ color:"#111b21", fontSize:14 }}>Recording… {formatVoiceDuration(recDuration)}</span>
            </div>
            <button onClick={stopRecording} style={{ width:44, height:44, borderRadius:"50%", background:"#25D366", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 2px 8px rgba(37,211,102,0.4)" }}>
              <Ic.Send />
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", padding:"8px 10px", gap:8, background:"#f0f2f5", borderTop:"1px solid #ddd", position:"relative" }}>
            {/* Emoji picker */}
            {showEmoji && <EmojiPicker onSelect={e => { setText(t => t + e); setShowEmoji(false); setTimeout(() => inputRef.current?.focus(), 0); }} onClose={() => setShowEmoji(false)} />}
            <button onClick={() => setShowEmoji(s => !s)} style={{ background:"none", border:"none", color:"#8696a0", fontSize:22, cursor:"pointer", padding:4, flexShrink:0 }}>😊</button>
            <button onClick={() => fileInputRef.current?.click()} style={{ background:"none", border:"none", color:"#8696a0", fontSize:22, cursor:"pointer", padding:4, flexShrink:0 }}>
              <Ic.Attach />
            </button>
            <input ref={inputRef} value={text} onChange={e => handleTyping(e.target.value)} onKeyDown={handleKey}
              placeholder={editingMsg?"Edit message…":replyTo?"Type a reply…":"Type a message"}
              style={{ flex:1, background:"#fff", border:"none", borderRadius:24, padding:"10px 16px", color:"#111b21", fontSize:14.5, outline:"none", minWidth:0 }} />
            {text.trim() ? (
              <button onClick={sendMessage} style={{ width:44, height:44, borderRadius:"50%", background:"#00a884", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", flexShrink:0 }}>
                <Ic.Send />
              </button>
            ) : (
              <button onMouseDown={startRecording} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", padding:4, flexShrink:0, display:"flex", alignItems:"center" }}>
                <Ic.Mic2 />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════
export default function WhatsAppUI({ onBackToDashboard }) {
  const router = useRouter();
  const [chats,       setChats      ] = useState([]);
  const [activeChat,  setActiveChat ] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobile,    setIsMobile   ] = useState(false);
  const [typingMap,   setTypingMap  ] = useState({});
  const [toasts,      setToasts     ] = useState([]);
  const [wallpaper,   setWallpaper  ] = useState("#efeae2");
  const [notifBar,    setNotifBar   ] = useState(false);

  const toastTimers     = useRef({});
  const typingUnsubsRef = useRef({});

  // FIX: proper toast cleanup
  const addToast = useCallback((t) => {
    setToasts(p => [...p.slice(-4), t]);
    const tid = setTimeout(() => removeToast(t.id), 5000);
    toastTimers.current[t.id] = tid;
  }, []);
  const removeToast = useCallback((id) => {
    clearTimeout(toastTimers.current[id]);
    delete toastTimers.current[id];
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  useEffect(() => { return () => Object.values(toastTimers.current).forEach(clearTimeout); }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") setTimeout(() => setNotifBar(true), 2000);
  }, []);

  useEffect(() => {
    return auth.onAuthStateChanged(async user => {
      if (!user) return;
      const uDoc = await getDoc(doc(db, "users", user.uid));
      setCurrentUser({ uid:user.uid, ...(uDoc.exists() ? uDoc.data() : {}) });
      updateDoc(doc(db, "users", user.uid), { online:true }).catch(() => {});
    });
  }, []);

  // Chats
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "chats"), where("participants","array-contains",currentUser.uid));
    return onSnapshot(q, async snap => {
      const list = await Promise.all(snap.docs.map(async d => {
        const data    = { id:d.id, ...d.data() };
        const otherId = data.participants?.find(p => p !== currentUser.uid);
        let otherUser = null;
        if (otherId) { const ud = await getDoc(doc(db, "users", otherId)); if (ud.exists()) otherUser = { id:otherId, ...ud.data() }; }
        const msgQ    = query(collection(db, "messages"), where("chatId","==",d.id), orderBy("createdAt","desc"), limit(1));
        const msgSnap = await getDocs(msgQ);
        const lastMsg = msgSnap.docs[0]?.data();
        const unreadQ = query(collection(db, "messages"), where("chatId","==",d.id), where("senderId","!=",currentUser.uid), where("read","==",false));
        const unreadSnap = await getDocs(unreadQ);
        return { ...data, otherUser, lastMessage:lastMsg?.text||"", lastMessageTime:lastMsg?.createdAt||data.createdAt, unreadCount:unreadSnap.size };
      }));
      list.sort((a,b) => (b.lastMessageTime?.seconds||0) - (a.lastMessageTime?.seconds||0));
      setChats(list);
    });
  }, [currentUser]);

  // Typing listeners
  useEffect(() => {
    if (!currentUser) return;
    const ids = new Set(chats.map(c => c.id).filter(Boolean));
    Object.keys(typingUnsubsRef.current).forEach(id => {
      if (!ids.has(id)) { typingUnsubsRef.current[id]?.(); delete typingUnsubsRef.current[id]; }
    });
    chats.forEach(chat => {
      if (!chat.id || !chat.otherUser?.id || typingUnsubsRef.current[chat.id]) return;
      const ref = doc(db, "chats", chat.id, "typing", chat.otherUser.id);
      typingUnsubsRef.current[chat.id] = onSnapshot(ref, snap => {
        if (snap.exists()) { const age = Date.now() - (snap.data().updatedAt?.toMillis?.() || 0); setTypingMap(p => ({ ...p, [chat.id]:age<5000 })); }
        else setTypingMap(p => ({ ...p, [chat.id]:false }));
      }, () => {});
    });
    return () => { Object.values(typingUnsubsRef.current).forEach(u => u?.()); typingUnsubsRef.current = {}; };
  }, [chats, currentUser]);

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    setChats(p => p.map(c => c.id===chat.id ? { ...c, unreadCount:0 } : c));
  };

  // FIX: onBackToDashboard — use router if no prop
  const handleBack = useCallback(() => {
    if (onBackToDashboard) onBackToDashboard();
    else router.back();
  }, [onBackToDashboard, router]);

  const showSidebar = !isMobile || !activeChat;
  const showChat    = !isMobile || !!activeChat;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#ccc; border-radius:3px; }
        @keyframes typingBounce { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-5px);opacity:1} }
        @keyframes menuPop { from{transform:scale(0.9);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideDown { from{transform:translateY(-10px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes slideInRight { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }
        @keyframes ripple { 0%{transform:translate(-50%,-50%) scale(0.8);opacity:0.6} 100%{transform:translate(-50%,-50%) scale(1.8);opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes pulseGreen { 0%,100%{box-shadow:0 4px 20px rgba(37,211,102,0.4)} 50%{box-shadow:0 4px 30px rgba(37,211,102,0.7)} }
        @media(max-width:767px){input,textarea,select{font-size:16px!important}}
      `}</style>

      {/* Notification permission bar */}
      {notifBar && (
        <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:9999, background:"#075E54", padding:"10px 16px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 2px 8px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize:22, flexShrink:0 }}>🔔</div>
          <div style={{ flex:1 }}>
            <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>Enable notifications</div>
            <div style={{ color:"rgba(255,255,255,0.75)", fontSize:12 }}>Get notified for new messages and calls</div>
          </div>
          <button onClick={async () => { setNotifBar(false); await Notification.requestPermission(); }} style={{ background:"#25D366", color:"#fff", border:"none", borderRadius:20, padding:"7px 18px", fontWeight:700, fontSize:13, cursor:"pointer" }}>Enable</button>
          <button onClick={() => setNotifBar(false)} style={{ background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)", borderRadius:20, padding:"7px 14px", fontWeight:600, fontSize:13, cursor:"pointer" }}>Not now</button>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div style={{ display:"flex", height:"100vh", width:"100vw", overflow:"hidden", background:"#f0f2f5", fontFamily:"'Nunito', sans-serif" }}>
        {showSidebar && (
          <Sidebar chats={chats} currentUser={currentUser} onSelectChat={handleSelectChat}
            activeChatId={activeChat?.id} isMobile={isMobile}
            onBackToDashboard={handleBack} typingMap={typingMap}
            wallpaper={wallpaper} onChangeWallpaper={setWallpaper} />
        )}
        {showChat && (
          activeChat
            ? <div style={{ flex:1, display:"flex", minWidth:0, overflow:"hidden" }}>
                <ChatPanel chat={activeChat} currentUser={currentUser} isMobile={isMobile}
                  onClose={() => setActiveChat(null)} addToast={addToast} allChats={chats} wallpaper={wallpaper} />
              </div>
            : !isMobile && (
              <div style={{ flex:1, background:"#f0f2f5", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
                <div style={{ fontSize:64 }}>💬</div>
                <div style={{ color:"#8696a0", fontSize:16 }}>Select a chat to start messaging</div>
              </div>
            )
        )}
      </div>
    </>
  );
}