"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, orderBy, getDocs, doc, getDoc,
  updateDoc, setDoc, deleteDoc, limit, writeBatch, arrayUnion
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

// ══════════════════════════════════════════════════════════════
//  DESIGN TOKENS
// ══════════════════════════════════════════════════════════════
const T = {
  bg:          "#0a0e14",
  bgCard:      "#111620",
  bgHover:     "#181e2a",
  bgActive:    "#1a2235",
  border:      "rgba(56,68,88,0.7)",
  green:       "#00d084",
  greenHi:     "#00e896",
  greenMuted:  "#00a366",
  greenGlow:   "rgba(0,208,132,0.14)",
  msgOut:      "#0a2e1f",
  msgIn:       "#111620",
  accent:      "#4d9fff",
  text:        "#e8eef8",
  textSec:     "#8a9bb8",
  textMuted:   "#5a6a84",
  danger:      "#ff4757",
  warn:        "#ffa502",
  radius:      "14px",
  radiusSm:    "9px",
  radiusLg:    "20px",
  shadow:      "0 12px 40px rgba(0,0,0,0.5)",
  shadowSm:    "0 2px 10px rgba(0,0,0,0.35)",
  shadowGlow:  "0 0 20px rgba(0,208,132,0.18)",
};

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

const EMOJI_LIST   = ["❤️","😂","😮","😢","🙏","👍","🔥","😍"];
const EMOJI_PICKER = ["😊","😂","❤️","👍","🙏","😮","😢","🎉","🔥","😍","🤔","👎","😡","🥰","😎","🤝","💪","✅","❌","⭐","🎊","🙌","👋","😴","🤣","😇","🥺","💯","🚀","💡","🫶","🫡","🤯","🥳","😈","💀","🫠","🫣","🫤","🤌"];

const STATUS_THEMES = [
  { bg:"linear-gradient(135deg,#0a0e14,#1a2235)", fg:"#e8eef8" },
  { bg:"linear-gradient(135deg,#0a2e1f,#0d4a2e)", fg:"#00e896" },
  { bg:"linear-gradient(135deg,#1a1200,#2a1e00)", fg:"#ffa502" },
  { bg:"linear-gradient(135deg,#1c0a00,#2e1200)", fg:"#ff8c42" },
  { bg:"linear-gradient(135deg,#1b0014,#2e0020)", fg:"#ff6b9d" },
  { bg:"linear-gradient(135deg,#001a2e,#002e4a)", fg:"#4d9fff" },
];

// ══════════════════════════════════════════════════════════════
//  DRAFT STORE
// ══════════════════════════════════════════════════════════════
const DraftStore = {
  get: (chatId) => { try { return localStorage.getItem(`draft_${chatId}`) || ""; } catch { return ""; } },
  set: (chatId, text) => { try { if (text?.trim()) localStorage.setItem(`draft_${chatId}`, text); else localStorage.removeItem(`draft_${chatId}`); } catch {} },
  remove: (chatId) => { try { localStorage.removeItem(`draft_${chatId}`); } catch {} },
};

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
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const time = d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  if (d>=today) return `Last seen today at ${time}`;
  if (d>=yesterday) return `Last seen yesterday at ${time}`;
  return `Last seen ${d.toLocaleDateString([],{day:"numeric",month:"short"})} at ${time}`;
};
const formatDuration = (sec) => `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
const formatVoiceDur = (sec) => { if (!sec) return "0:00"; return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,"0")}`; };
const fmtFileSize    = (b)   => { if (!b) return ""; if (b<1024) return b+"B"; if (b<1048576) return (b/1024).toFixed(1)+"KB"; return (b/1048576).toFixed(2)+"MB"; };

const playNotifSound = (type="message") => {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine";
    if (type==="call") {
      osc.frequency.setValueAtTime(660,ctx.currentTime);
      osc.frequency.setValueAtTime(880,ctx.currentTime+0.15);
      gain.gain.setValueAtTime(0.28,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.7);
      osc.start(); osc.stop(ctx.currentTime+0.7);
    } else {
      osc.frequency.setValueAtTime(1320,ctx.currentTime);
      osc.frequency.setValueAtTime(880,ctx.currentTime+0.06);
      gain.gain.setValueAtTime(0.1,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.18);
      osc.start(); osc.stop(ctx.currentTime+0.18);
    }
  } catch(_){}
};

const sendBrowserNotif = (title, body, opts={}) => {
  if(!("Notification" in window)||Notification.permission!=="granted") return;
  playNotifSound(opts.sound||"message");
  try {
    const n = new Notification(title,{body,icon:"/icon-192.png",tag:opts.tag||"chat",requireInteraction:!!opts.requireInteraction,silent:false});
    if(!opts.requireInteraction) setTimeout(()=>n.close(),5000);
  } catch(_){}
};

// ══════════════════════════════════════════════════════════════
//  ICONS
// ══════════════════════════════════════════════════════════════
const Ic = {
  Back:    ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  Search:  ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Close:   ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Video:   ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>,
  Phone:   ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>,
  End:     ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>,
  Mic:     ({muted})=>muted
    ?<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
    :<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>,
  Cam:     ({off})=>off
    ?<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4-4-14.5 14.5 2 2L8 15.5V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.5l-1-1zM16 13.85L8.15 6H16v7.85zM3 7v10a1 1 0 0 0 1 1h1.85l-2-2H4V7.85l-1-1V7z"/></svg>
    :<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>,
  Speaker: ({off})=>off
    ?<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
    :<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>,
  FlipCam: ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-5 11.5V14H9v2.5L5.5 13 9 9.5V12h6V9.5l3.5 3.5-3.5 3.5z"/></svg>,
  Send:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>,
  Attach:  ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>,
  Mic2:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>,
  Pin:     ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>,
  Reply:   ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>,
  Forward: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>,
  Edit:    ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>,
  Delete:  ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
  Copy:    ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>,
  Doc:     ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>,
  Play:    ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  Stop:    ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>,
  Check:   ({double=false,blue=false})=>double
    ?<span style={{color:blue?"#4d9fff":"#5a6a84",fontSize:12,letterSpacing:"-2px"}}>✓✓</span>
    :<span style={{color:"#5a6a84",fontSize:12}}>✓</span>,
  Star:    ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>,
  More:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>,
  Starred: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>,
  Archive: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>,
  Unread:  ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>,
  Trash:   ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
  Clear:   ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 13h14v-2H5v2zm-2 4h14v-2H3v2zM7 7v2h14V7H7z"/></svg>,
  Eye:     ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>,
  Plus:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

// ══════════════════════════════════════════════════════════════
//  AVATAR
// ══════════════════════════════════════════════════════════════
function Avatar({ name="?", photoURL=null, size=40, online=false, hasStatus=false }) {
  const colors = ["#00a366","#1f6feb","#7c3aed","#b45309","#dc2626","#0891b2"];
  const color  = colors[(name?.charCodeAt(0)||0) % colors.length];
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{ position:"relative", flexShrink:0 }}>
      {hasStatus && (
        <div style={{ position:"absolute", inset:-3, borderRadius:"50%",
          background:`conic-gradient(${T.green} 0% 80%, rgba(0,208,132,0.12) 80%)`,
          zIndex:0 }} />
      )}
      <div style={{ position:"relative", zIndex:1, borderRadius:"50%", padding:hasStatus?3:0, background:hasStatus?T.bg:"transparent" }}>
        {photoURL && !imgErr
          ? <img src={photoURL} alt={name} onError={()=>setImgErr(true)}
              style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",display:"block"}} />
          : <div style={{width:size,height:size,borderRadius:"50%",background:`linear-gradient(145deg,${color},${color}99)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:size*0.4,flexShrink:0}}>
              {(name?.charAt(0)||"?").toUpperCase()}
            </div>
        }
      </div>
      {online && (
        <div style={{position:"absolute",bottom:hasStatus?4:1,right:hasStatus?4:1,width:size*0.27,height:size*0.27,borderRadius:"50%",background:T.green,border:`2.5px solid ${T.bg}`,zIndex:2,boxShadow:`0 0 6px ${T.green}88`}} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CONFIRM DIALOG
// ══════════════════════════════════════════════════════════════
function ConfirmDialog({ title, body, confirmLabel="Confirm", dangerConfirm=false, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{position:"fixed",inset:0,zIndex:5000,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:T.radiusLg,width:Math.min(360,window.innerWidth-32),boxShadow:T.shadow,animation:"popIn 0.2s cubic-bezier(0.16,1,0.3,1)",overflow:"hidden"}}>
        <div style={{padding:"22px 22px 0"}}>
          <div style={{color:T.text,fontWeight:800,fontSize:16,marginBottom:8}}>{title}</div>
          <div style={{color:T.textSec,fontSize:13,lineHeight:1.6}}>{body}</div>
        </div>
        <div style={{display:"flex",gap:10,padding:22,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={{padding:"9px 20px",borderRadius:T.radius,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,color:T.textSec,cursor:"pointer",fontSize:13,fontWeight:600}}
            onMouseEnter={e=>e.currentTarget.style.background=T.bgHover} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{padding:"9px 20px",borderRadius:T.radius,background:dangerConfirm?T.danger:T.green,border:"none",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}
            onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"} onMouseLeave={e=>e.currentTarget.style.filter="none"}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={{position:"fixed",top:16,right:16,zIndex:9990,display:"flex",flexDirection:"column",gap:8,maxWidth:320,pointerEvents:"none"}}>
      {toasts.map(t => (
        <div key={t.id} onClick={()=>onDismiss(t.id)}
          style={{background:T.bgCard,borderRadius:T.radius,padding:"11px 14px",boxShadow:T.shadow,display:"flex",alignItems:"center",gap:10,cursor:"pointer",border:`1px solid ${T.border}`,borderLeft:`3px solid ${t.color||T.green}`,animation:"toastIn 0.28s cubic-bezier(0.16,1,0.3,1)",pointerEvents:"all"}}>
          <div style={{fontSize:18,flexShrink:0}}>{t.icon||"💬"}</div>
          <div style={{flex:1,overflow:"hidden"}}>
            <div style={{fontWeight:700,fontSize:13,color:T.text}}>{t.title}</div>
            <div style={{fontSize:12,color:T.textSec,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.body}</div>
          </div>
          <button onClick={e=>{e.stopPropagation();onDismiss(t.id);}} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,display:"flex"}}>
            <Ic.Close s={12} />
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
    <span style={{display:"inline-flex",alignItems:"center",gap:3,height:14}}>
      {[0,1,2].map(i=>(
        <span key={i} style={{width:5,height:5,borderRadius:"50%",background:T.green,display:"inline-block",animation:`bounce 1.2s ${i*0.18}s infinite ease-in-out`}} />
      ))}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
//  MEDIA MODAL
// ══════════════════════════════════════════════════════════════
function MediaModal({ src, type, onClose }) {
  useEffect(()=>{ const h=e=>{if(e.key==="Escape")onClose();}; window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h); },[onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:4000,background:"rgba(0,0,0,0.96)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(12px)"}}>
      <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.08)",border:`1px solid ${T.border}`,color:"#fff",borderRadius:"50%",width:42,height:42,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <Ic.Close s={18} />
      </button>
      <div onClick={e=>e.stopPropagation()} style={{maxWidth:"90vw",maxHeight:"90vh"}}>
        {type==="image"
          ? <img src={src} alt="" style={{maxWidth:"90vw",maxHeight:"90vh",borderRadius:T.radius,objectFit:"contain",boxShadow:T.shadow}} />
          : <video src={src} controls autoPlay style={{maxWidth:"90vw",maxHeight:"90vh",borderRadius:T.radius}} />
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  VOICE PLAYER — Fixed audio cleanup & seek
// ══════════════════════════════════════════════════════════════
function VoicePlayer({ url, duration, isMine }) {
  const [playing,  setPlaying ] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed,  setElapsed ] = useState(0);
  const audioRef = useRef(null);

  useEffect(()=>{
    const a = new Audio(url);
    audioRef.current = a;
    const onEnd  = ()=>{setPlaying(false);setProgress(0);setElapsed(0);};
    const onTime = ()=>{
      const p = a.duration ? (a.currentTime/a.duration)*100 : 0;
      setProgress(p); setElapsed(Math.floor(a.currentTime));
    };
    a.addEventListener("ended",onEnd); a.addEventListener("timeupdate",onTime);
    return ()=>{ a.removeEventListener("ended",onEnd); a.removeEventListener("timeupdate",onTime); a.pause(); a.src=""; };
  },[url]);

  const toggle = () => {
    const a = audioRef.current; if(!a) return;
    if(playing){a.pause();setPlaying(false);}
    else{a.play().then(()=>setPlaying(true)).catch(()=>{});}
  };

  const seekClick = (e) => {
    const a = audioRef.current; if(!a||!a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX-rect.left)/rect.width)*a.duration;
  };

  return (
    <div style={{display:"flex",alignItems:"center",gap:10,minWidth:200}}>
      <button onClick={toggle} style={{width:38,height:38,borderRadius:"50%",background:isMine?"rgba(0,208,132,0.2)":"rgba(255,255,255,0.06)",border:`1px solid ${isMine?"rgba(0,208,132,0.4)":T.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:isMine?T.greenHi:T.textSec}}>
        {playing?<Ic.Stop />:<Ic.Play />}
      </button>
      <div style={{flex:1}}>
        <div onClick={seekClick} style={{height:4,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden",marginBottom:4,cursor:"pointer"}}>
          <div style={{width:`${progress}%`,height:"100%",background:isMine?T.green:T.greenHi,borderRadius:2,transition:"width 0.1s linear"}} />
        </div>
        <div style={{fontSize:11,color:isMine?"rgba(255,255,255,0.45)":T.textMuted}}>
          {playing?formatVoiceDur(elapsed):formatVoiceDur(duration)}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CONTEXT MENU
// ══════════════════════════════════════════════════════════════
function ContextMenu({ x, y, isMine, msgId, msgText, msgType, onDelete, onReact, onReply, onForward, onEdit, onPin, onStar, onClose }) {
  const ref = useRef();
  const [pos, setPos] = useState({top:y,left:x});

  useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))onClose();};
    document.addEventListener("mousedown",fn); document.addEventListener("touchstart",fn);
    return ()=>{ document.removeEventListener("mousedown",fn); document.removeEventListener("touchstart",fn); };
  },[onClose]);

  useEffect(()=>{
    if(!ref.current) return;
    const rect=ref.current.getBoundingClientRect(), ww=window.innerWidth, wh=window.innerHeight;
    let top=y, left=x;
    if(left+rect.width>ww-8) left=ww-rect.width-8;
    if(top+rect.height>wh-8) top=wh-rect.height-8;
    if(left<8) left=8; if(top<8) top=8;
    setPos({top,left});
  },[x,y]);

  const isText = !msgType||msgType==="text";
  return (
    <div ref={ref} style={{position:"fixed",top:pos.top,left:pos.left,background:T.bgCard,borderRadius:T.radius,boxShadow:T.shadow,zIndex:3000,overflow:"hidden",minWidth:210,animation:"popIn 0.15s cubic-bezier(0.16,1,0.3,1)",border:`1px solid ${T.border}`}}>
      <div style={{display:"flex",gap:1,padding:"10px 8px 9px",borderBottom:`1px solid ${T.border}`,background:"rgba(255,255,255,0.02)"}}>
        {EMOJI_LIST.map(e=>(
          <button key={e} onClick={()=>{onReact(e);onClose();}}
            style={{background:"none",border:"none",fontSize:20,cursor:"pointer",borderRadius:T.radiusSm,padding:"3px 4px",transition:"transform 0.12s"}}
            onMouseEnter={ev=>ev.currentTarget.style.transform="scale(1.45)"}
            onMouseLeave={ev=>ev.currentTarget.style.transform="scale(1)"}>
            {e}
          </button>
        ))}
      </div>
      {[
        {label:"Reply",    icon:<Ic.Reply />,   fn:()=>{onReply();onClose();},   show:true},
        {label:"Forward",  icon:<Ic.Forward />, fn:()=>{onForward();onClose();}, show:isText},
        {label:"Star",     icon:<Ic.Star />,    fn:()=>{onStar?.();onClose();},  show:true},
        {label:"Pin",      icon:<Ic.Pin />,     fn:()=>{onPin();onClose();},     show:true},
        {label:"Copy",     icon:<Ic.Copy />,    fn:()=>{navigator.clipboard?.writeText(msgText||"");onClose();}, show:isText},
        {label:"Edit",     icon:<Ic.Edit />,    fn:()=>{onEdit();onClose();},    show:isMine&&isText},
        {label:"Delete",   icon:<Ic.Delete />,  fn:()=>{onDelete();onClose();},  show:isMine, danger:true},
      ].filter(a=>a.show).map(({label,icon,fn,danger})=>(
        <button key={label} onClick={fn}
          style={{display:"flex",alignItems:"center",gap:12,width:"100%",background:"none",border:"none",padding:"10px 16px",cursor:"pointer",textAlign:"left",color:danger?T.danger:T.text,fontSize:13,transition:"background 0.12s"}}
          onMouseEnter={e=>e.currentTarget.style.background=T.bgHover}
          onMouseLeave={e=>e.currentTarget.style.background="none"}>
          <span style={{color:danger?T.danger:T.textMuted,display:"flex"}}>{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  STATUS VIEWER — Multi-status, views list, delete, add more
// ══════════════════════════════════════════════════════════════
function StatusViewer({ statuses, initialIndex=0, currentUser, onClose, onAddMore }) {
  const [idx,       setIdx      ] = useState(initialIndex);
  const [progress,  setProgress ] = useState(0);
  const [showViews, setShowViews] = useState(false);
  const ivRef = useRef(null);
  const status = statuses[idx];

  // Mark viewed
  useEffect(()=>{
    if(!status) return;
    if(status.authorId !== currentUser?.uid && currentUser?.uid) {
      const already = (status.views||[]).some(v=>v.uid===currentUser.uid);
      if(!already) {
        updateDoc(doc(db,"statuses",status.id),{
          views: arrayUnion({ uid:currentUser.uid, name:currentUser.name||"Someone", at:Date.now() })
        }).catch(()=>{});
      }
    }
  },[idx, status?.id]);

  // Progress timer — auto advance
  useEffect(()=>{
    setProgress(0); setShowViews(false);
    clearInterval(ivRef.current);
    ivRef.current = setInterval(()=>{
      setProgress(p=>{
        if(p>=100){
          clearInterval(ivRef.current);
          if(idx < statuses.length-1) setIdx(i=>i+1);
          else onClose();
          return 100;
        }
        return p+0.5;
      });
    },30);
    return ()=>clearInterval(ivRef.current);
  },[idx, statuses.length]);

  const handleDelete = async() => {
    if(!confirm("Delete this status?")) return;
    try {
      await deleteDoc(doc(db,"statuses",status.id));
      if(statuses.length<=1) onClose();
      else if(idx>0) setIdx(i=>i-1);
      else setIdx(0);
    } catch(e){ alert("Failed: "+e.message); }
  };

  if(!status) return null;
  const isMyStatus = status.authorId === currentUser?.uid;
  const views = status.views||[];

  return (
    <div style={{position:"fixed",inset:0,zIndex:3500,background:"#000",display:"flex",flexDirection:"column"}}>
      {/* Progress bars */}
      <div style={{padding:"10px 12px 6px",display:"flex",gap:4,zIndex:2}}>
        {statuses.map((_,i)=>(
          <div key={i} style={{flex:1,height:3,background:"rgba(255,255,255,0.22)",borderRadius:2,overflow:"hidden"}}>
            <div style={{width:i<idx?"100%":i===idx?`${progress}%`:"0%",height:"100%",background:"#fff",transition:i===idx?"width 0.03s linear":"none"}} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{padding:"8px 16px 12px",display:"flex",alignItems:"center",gap:10,zIndex:2}}>
        <Avatar name={status.authorName||"?"} photoURL={status.authorPhoto} size={42} />
        <div style={{flex:1}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:14}}>{status.authorName}</div>
          <div style={{color:"rgba(255,255,255,0.5)",fontSize:11}}>{formatTime(status.createdAt)}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isMyStatus && (
            <>
              <button onClick={onAddMore} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",cursor:"pointer",padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
                <Ic.Plus /> Add
              </button>
              <button onClick={handleDelete} style={{background:"rgba(255,71,87,0.15)",border:"1px solid rgba(255,71,87,0.3)",color:T.danger,cursor:"pointer",borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Ic.Trash />
              </button>
            </>
          )}
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",cursor:"pointer",borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Ic.Close s={16} />
          </button>
        </div>
      </div>

      {/* Tap prev/next */}
      <div style={{position:"absolute",left:0,top:0,width:"35%",height:"100%",zIndex:1,cursor:"pointer"}} onClick={()=>{if(idx>0)setIdx(i=>i-1);}} />
      <div style={{position:"absolute",right:0,top:0,width:"35%",height:"100%",zIndex:1,cursor:"pointer"}} onClick={()=>{if(idx<statuses.length-1)setIdx(i=>i+1);else onClose();}} />

      {/* Content */}
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 32px",background:status.bg||"#0a0e14"}}>
        {status.type==="text"
          ? <div style={{color:status.color||"#e8eef8",fontSize:28,fontWeight:800,textAlign:"center",lineHeight:1.4,textShadow:"0 2px 12px rgba(0,0,0,0.6)"}}>{status.text}</div>
          : status.type==="image"
          ? <img src={status.mediaUrl} alt="" style={{maxWidth:"100%",maxHeight:"70vh",borderRadius:T.radius,objectFit:"contain"}} />
          : null
        }
      </div>

      {/* Views panel — only my status */}
      {isMyStatus && (
        <div style={{background:"rgba(10,14,20,0.95)",borderTop:`1px solid ${T.border}`,padding:"10px 16px"}}>
          <button onClick={()=>setShowViews(s=>!s)}
            style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",color:T.textSec,fontSize:13,fontWeight:600,width:"100%",textAlign:"left"}}>
            <Ic.Eye /> {views.length} {views.length===1?"view":"views"}
            <span style={{marginLeft:"auto",color:T.textMuted,fontSize:11}}>{showViews?"▲":"▼"}</span>
          </button>
          {showViews && (
            <div style={{marginTop:8,maxHeight:120,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
              {views.length===0
                ? <div style={{color:T.textMuted,fontSize:12,fontStyle:"italic",paddingLeft:4}}>No views yet</div>
                : views.map((v,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,color:T.text,fontSize:13}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:T.green,flexShrink:0}} />
                    {v.name}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  STATUS COMPOSER — Post multiple statuses
// ══════════════════════════════════════════════════════════════
function StatusComposer({ currentUser, onClose, addToast }) {
  const [text,    setText   ] = useState("");
  const [theme,   setTheme  ] = useState(0);
  const [posting, setPosting] = useState(false);

  const post = async() => {
    if(!text.trim()||!currentUser?.uid||posting) return;
    setPosting(true);
    try {
      await addDoc(collection(db,"statuses"),{
        authorId:    currentUser.uid,
        authorName:  currentUser.name||"Me",
        authorPhoto: currentUser.photoURL||null,
        type:        "text",
        text:        text.trim(),
        bg:          STATUS_THEMES[theme].bg,
        color:       STATUS_THEMES[theme].fg,
        createdAt:   serverTimestamp(),
        expiresAt:   new Date(Date.now()+86400000),
        views:       [],
      });
      addToast({id:Date.now(),icon:"✅",title:"Status posted!",body:"Visible for 24 hours",color:T.green});
      onClose();
    } catch(err){
      addToast({id:Date.now(),icon:"❌",title:"Failed",body:err.message,color:T.danger});
    } finally { setPosting(false); }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:3500,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:T.radiusLg,width:Math.min(420,window.innerWidth-32),overflow:"hidden",boxShadow:T.shadow,animation:"popIn 0.2s cubic-bezier(0.16,1,0.3,1)"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontWeight:800,fontSize:16,color:T.text}}>Post Status</span>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,display:"flex"}}><Ic.Close s={18} /></button>
        </div>
        <div style={{padding:20}}>
          <div style={{borderRadius:T.radius,padding:"36px 20px",marginBottom:16,background:STATUS_THEMES[theme].bg,minHeight:130,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="What's on your mind?" maxLength={200}
              style={{background:"none",border:"none",outline:"none",color:STATUS_THEMES[theme].fg,fontSize:24,fontWeight:800,textAlign:"center",resize:"none",width:"100%",fontFamily:"inherit",lineHeight:1.4}}
              rows={3} />
            <div style={{position:"absolute",bottom:8,right:10,color:STATUS_THEMES[theme].fg,opacity:0.35,fontSize:11}}>{text.length}/200</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
            <span style={{color:T.textMuted,fontSize:11,marginRight:4}}>Theme:</span>
            {STATUS_THEMES.map((th,i)=>(
              <button key={i} onClick={()=>setTheme(i)}
                style={{width:28,height:28,borderRadius:"50%",background:th.bg,border:theme===i?`3px solid ${T.green}`:`1px solid ${T.border}`,cursor:"pointer",transition:"transform 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.transform="scale(1.2)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"} />
            ))}
          </div>
          <button onClick={post} disabled={!text.trim()||posting}
            style={{width:"100%",padding:"12px",borderRadius:T.radius,background:text.trim()&&!posting?T.green:"rgba(0,208,132,0.2)",border:"none",cursor:text.trim()&&!posting?"pointer":"default",color:"#fff",fontWeight:800,fontSize:15}}>
            {posting?"Posting…":"Post Status"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CALL LOG BUBBLE
// ══════════════════════════════════════════════════════════════
function CallLogBubble({ msg }) {
  const missed = msg.callStatus==="missed";
  return (
    <div style={{display:"flex",justifyContent:"center",padding:"6px 10px"}}>
      <div style={{background:T.bgCard,borderRadius:T.radiusLg,padding:"8px 18px",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8,fontSize:12.5}}>
        <span style={{fontSize:16}}>{missed?"📵":(msg.callType==="video"?"📹":"📞")}</span>
        <span style={{fontWeight:700,color:missed?T.danger:T.green}}>{missed?`Missed ${msg.callType==="video"?"Video":"Voice"} Call`:`${msg.callType==="video"?"Video":"Voice"} Call`}</span>
        {msg.callDuration&&<span style={{color:T.textMuted}}>· {msg.callDuration}</span>}
        <span style={{color:T.textMuted}}>{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MESSAGE BUBBLE
// ══════════════════════════════════════════════════════════════
function Bubble({ msg, isMine, senderName, onContextMenu, deletedIds, allMessages, onMediaClick, isHighlighted, isStarred }) {
  const isDeleted = deletedIds.has(msg.id);
  const replyMsg  = msg.replyTo ? allMessages.find(m=>m.id===msg.replyTo) : null;
  if(msg.type==="call") return <CallLogBubble msg={msg} />;

  return (
    <div style={{display:"flex",justifyContent:isMine?"flex-end":"flex-start",marginBottom:2,padding:"2px 12px"}}
      onContextMenu={e=>{e.preventDefault();onContextMenu(e.clientX,e.clientY);}}>
      <div style={{maxWidth:"72%",position:"relative"}}>
        {isStarred && (
          <div style={{position:"absolute",top:-7,right:isMine?-7:undefined,left:!isMine?-7:undefined,background:T.warn,borderRadius:"50%",width:17,height:17,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1}}>
            <span style={{fontSize:9,color:"#000"}}>★</span>
          </div>
        )}
        <div style={{
          background:isDeleted?T.bgCard:isMine?T.msgOut:T.msgIn,
          borderRadius:isMine?"18px 18px 4px 18px":"18px 18px 18px 4px",
          padding:"9px 12px 7px",
          border:`1px solid ${isMine?"rgba(0,208,132,0.2)":T.border}`,
          boxShadow:isHighlighted?`0 0 0 2px ${T.green}`:T.shadowSm,
          transition:"box-shadow 0.4s"
        }}>
          {!isMine&&senderName&&!isDeleted&&(
            <div style={{color:T.green,fontSize:12,fontWeight:700,marginBottom:3}}>{senderName}</div>
          )}
          {msg.forwarded&&!isDeleted&&(
            <div style={{color:T.textMuted,fontSize:11,fontStyle:"italic",marginBottom:4,display:"flex",alignItems:"center",gap:4}}>
              <Ic.Forward /> Forwarded
            </div>
          )}
          {replyMsg&&!isDeleted&&(
            <div style={{background:"rgba(255,255,255,0.04)",borderLeft:`3px solid ${T.green}`,borderRadius:"8px 8px 0 0",padding:"6px 10px",marginBottom:7}}>
              <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:2}}>
                {replyMsg.senderId===msg.senderId?(isMine?"You":senderName):(isMine?senderName:"You")}
              </div>
              <div style={{fontSize:12,color:T.textSec,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {deletedIds.has(replyMsg.id)?"🚫 Deleted":(replyMsg.text||(replyMsg.type==="voice"?"🎤 Voice":replyMsg.type==="image"?"🖼 Image":"(media)"))}
              </div>
            </div>
          )}
          {msg.pinned&&!isDeleted&&<div style={{fontSize:10,color:T.textMuted,marginBottom:3,display:"flex",alignItems:"center",gap:4}}><Ic.Pin/> Pinned</div>}
          {isDeleted?(
            <div style={{color:T.textMuted,fontSize:14,fontStyle:"italic"}}>{isMine?"🚫 You deleted this message":"🚫 This message was deleted"}</div>
          ):msg.type==="image"?(
            <div onClick={()=>onMediaClick(msg.fileURL,"image")} style={{cursor:"pointer",borderRadius:T.radiusSm,overflow:"hidden",marginBottom:4}}>
              <img src={msg.fileURL} alt="" style={{maxWidth:240,maxHeight:200,objectFit:"cover",display:"block",borderRadius:T.radiusSm}} />
            </div>
          ):msg.type==="video"?(
            <div onClick={()=>onMediaClick(msg.fileURL,"video")} style={{cursor:"pointer",position:"relative",borderRadius:T.radiusSm,overflow:"hidden",marginBottom:4}}>
              <video src={msg.fileURL} style={{maxWidth:240,maxHeight:200,objectFit:"cover",display:"block",borderRadius:T.radiusSm}} />
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{background:"rgba(0,0,0,0.65)",borderRadius:"50%",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}><Ic.Play /></div>
              </div>
            </div>
          ):msg.type==="voice"?(
            <VoicePlayer url={msg.fileURL} duration={msg.voiceDuration} isMine={isMine} />
          ):msg.type==="file"?(
            <a href={msg.fileURL} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none",padding:"4px 0",minWidth:160}}>
              <div style={{width:38,height:38,borderRadius:T.radiusSm,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:T.green}}><Ic.Doc /></div>
              <div style={{flex:1,overflow:"hidden"}}>
                <div style={{fontSize:13,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{msg.fileName}</div>
                <div style={{fontSize:11,color:T.textMuted}}>{fmtFileSize(msg.fileSize)}</div>
              </div>
            </a>
          ):(
            <div style={{color:T.text,fontSize:14.5,lineHeight:1.55,wordBreak:"break-word"}}>{msg.text}</div>
          )}
          {msg.caption&&!isDeleted&&<div style={{color:T.text,fontSize:14,marginTop:4,wordBreak:"break-word"}}>{msg.caption}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:4,marginTop:5}}>
            {msg.edited&&!isDeleted&&<span style={{fontSize:10,color:T.textMuted,fontStyle:"italic"}}>edited</span>}
            <span style={{color:T.textMuted,fontSize:11}}>{formatTime(msg.createdAt)}</span>
            {isMine&&!isDeleted&&<Ic.Check double={msg.delivered||msg.read} blue={msg.read} />}
          </div>
        </div>
        {msg.reactions&&Object.keys(msg.reactions).length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4,justifyContent:isMine?"flex-end":"flex-start"}}>
            {Object.entries(Object.values(msg.reactions).reduce((a,e)=>{a[e]=(a[e]||0)+1;return a;},{})).map(([emoji,count])=>(
              <span key={emoji} style={{background:T.bgCard,borderRadius:12,padding:"2px 8px",fontSize:13,boxShadow:T.shadowSm,display:"flex",alignItems:"center",gap:3,border:`1px solid ${T.border}`}}>
                {emoji}{count>1&&<span style={{fontSize:11,color:T.textSec,fontWeight:700}}>{count}</span>}
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
    <div style={{display:"flex",justifyContent:"center",margin:"12px 0"}}>
      <div style={{background:T.bgCard,color:T.textMuted,fontSize:11,padding:"4px 14px",borderRadius:T.radiusSm,border:`1px solid ${T.border}`}}>{label}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  UPLOAD PROGRESS
// ══════════════════════════════════════════════════════════════
function UploadProgress({ progress, onCancel }) {
  return (
    <div style={{background:T.bgCard,padding:"8px 14px",display:"flex",alignItems:"center",gap:10,borderTop:`1px solid ${T.border}`}}>
      <div style={{flex:1}}>
        <div style={{fontSize:12,color:T.textSec,marginBottom:4}}>Uploading… {Math.round(progress)}%</div>
        <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2}}>
          <div style={{width:`${progress}%`,height:"100%",background:T.green,borderRadius:2,transition:"width 0.2s"}} />
        </div>
      </div>
      <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,display:"flex"}}><Ic.Close s={14} /></button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  REPLY / EDIT BARS
// ══════════════════════════════════════════════════════════════
function ReplyBar({ replyTo, onCancel }) {
  if(!replyTo) return null;
  return (
    <div style={{background:T.bgCard,borderLeft:`3px solid ${T.green}`,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,borderTop:`1px solid ${T.border}`}}>
      <div style={{flex:1,overflow:"hidden"}}>
        <div style={{fontSize:12,fontWeight:700,color:T.green,marginBottom:2}}>{replyTo.isMine?"You":replyTo.senderName||"Them"}</div>
        <div style={{fontSize:12,color:T.textSec,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{replyTo.text||(replyTo.type==="voice"?"🎤 Voice":"(media)")}</div>
      </div>
      <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,display:"flex"}}><Ic.Close s={16} /></button>
    </div>
  );
}
function EditBar({ editingMsg, onCancel }) {
  if(!editingMsg) return null;
  return (
    <div style={{background:T.bgCard,borderLeft:`3px solid ${T.accent}`,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,borderTop:`1px solid ${T.border}`}}>
      <div style={{flex:1,overflow:"hidden"}}>
        <div style={{fontSize:12,fontWeight:700,color:T.accent,marginBottom:2}}>Editing message</div>
        <div style={{fontSize:12,color:T.textSec,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{editingMsg.text}</div>
      </div>
      <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,display:"flex"}}><Ic.Close s={16} /></button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  FORWARD MODAL
// ══════════════════════════════════════════════════════════════
function ForwardModal({ chats, currentUser, msgText, onForward, onClose }) {
  const [sel, setSel] = useState(null);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:3500,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:T.radiusLg,width:Math.min(380,window.innerWidth-32),maxHeight:"70vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:T.shadow,animation:"popIn 0.2s cubic-bezier(0.16,1,0.3,1)"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontWeight:800,fontSize:16,color:T.text}}>Forward Message</span>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,display:"flex"}}><Ic.Close s={18} /></button>
        </div>
        <div style={{padding:"10px 16px 4px",background:"rgba(255,255,255,0.02)",margin:"8px 16px",borderRadius:T.radiusSm,fontSize:13,color:T.textSec,fontStyle:"italic",border:`1px solid ${T.border}`}}>
          "{msgText?.slice(0,80)}{(msgText?.length||0)>80?"…":""}"
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {chats.map(c=>(
            <div key={c.id} onClick={()=>setSel(c.id===sel?null:c.id)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"10px 20px",cursor:"pointer",background:sel===c.id?T.greenGlow:T.bgCard,borderBottom:`1px solid ${T.border}`,transition:"background 0.15s"}}>
              <Avatar name={c.otherUser?.name||"?"} photoURL={c.otherUser?.photoURL} size={38} />
              <span style={{fontWeight:600,fontSize:14,color:T.text,flex:1}}>{c.otherUser?.name}</span>
              {sel===c.id&&<span style={{color:T.green,fontSize:18}}>✓</span>}
            </div>
          ))}
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`}}>
          <button onClick={()=>sel&&onForward(sel)} disabled={!sel}
            style={{width:"100%",padding:"12px",borderRadius:T.radius,background:sel?T.green:"rgba(0,208,132,0.15)",border:"none",cursor:sel?"pointer":"default",color:"#fff",fontWeight:700,fontSize:14}}>
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
  useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))onClose();};
    document.addEventListener("mousedown",fn);
    return ()=>document.removeEventListener("mousedown",fn);
  },[onClose]);
  return (
    <div ref={ref} style={{position:"absolute",bottom:"100%",left:0,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:T.radius,boxShadow:T.shadow,padding:10,zIndex:1000,width:280,maxHeight:220,overflowY:"auto",animation:"popIn 0.15s ease",marginBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {EMOJI_PICKER.map(e=>(
          <button key={e} onClick={()=>onSelect(e)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,borderRadius:T.radiusSm,padding:4,display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.1s"}}
            onMouseEnter={ev=>{ev.currentTarget.style.transform="scale(1.3)";ev.currentTarget.style.background="rgba(255,255,255,0.07)";}}
            onMouseLeave={ev=>{ev.currentTarget.style.transform="scale(1)";ev.currentTarget.style.background="none";}}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  PINNED BAR
// ══════════════════════════════════════════════════════════════
function PinnedBar({ messages, onClose }) {
  const pinned = messages.filter(m=>m.pinned&&!m.deleted);
  if(!pinned.length) return null;
  const last = pinned[pinned.length-1];
  return (
    <div style={{background:T.bgCard,borderBottom:`1px solid ${T.border}`,padding:"8px 16px",display:"flex",alignItems:"center",gap:10}}>
      <span style={{color:T.green,display:"flex"}}><Ic.Pin /></span>
      <div style={{flex:1,overflow:"hidden"}}>
        <div style={{fontSize:11,color:T.green,fontWeight:700,marginBottom:1}}>📌 Pinned Message</div>
        <div style={{fontSize:13,color:T.textSec,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{last.text||"📎 Media"}</div>
      </div>
      <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,display:"flex"}}><Ic.Close s={14} /></button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  STARRED PANEL
// ══════════════════════════════════════════════════════════════
function StarredPanel({ messages, onClose }) {
  const starred = messages.filter(m=>m.starred&&!m.deleted);
  return (
    <div style={{position:"absolute",inset:0,background:T.bg,zIndex:100,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12,background:T.bgCard}}>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:T.textSec,display:"flex"}}><Ic.Back /></button>
        <span style={{color:T.text,fontWeight:700,fontSize:15}}>⭐ Starred Messages</span>
        <span style={{color:T.textMuted,fontSize:13,marginLeft:"auto"}}>{starred.length}</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
        {starred.length===0
          ? <div style={{color:T.textMuted,textAlign:"center",padding:40,fontSize:14}}>No starred messages</div>
          : starred.map(m=>(
            <div key={m.id} style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,background:T.bgCard,margin:"4px 12px",borderRadius:T.radius,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:T.warn,marginBottom:4,fontWeight:700}}>★ Starred</div>
              <div style={{fontSize:14,color:T.text,lineHeight:1.5}}>{m.text||"📎 Media"}</div>
              <div style={{fontSize:11,color:T.textMuted,marginTop:6}}>{formatTime(m.createdAt)}</div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  INCOMING CALL SCREEN
// ══════════════════════════════════════════════════════════════
function IncomingCallScreen({ callerName, callerPhoto, callType, onAccept, onReject }) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:3000,background:"linear-gradient(160deg,#0a0e14 0%,#0d1520 50%,#0a0e14 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24}}>
      {[1,2,3].map(i=>(
        <div key={i} style={{position:"absolute",top:"32%",left:"50%",transform:"translate(-50%,-50%)",width:90+i*52,height:90+i*52,borderRadius:"50%",border:`1px solid rgba(0,208,132,${0.25-i*0.06})`,animation:`ripple 2.2s ${i*0.4}s infinite ease-out`,pointerEvents:"none"}} />
      ))}
      <div style={{zIndex:1}}><Avatar name={callerName} photoURL={callerPhoto} size={100} online /></div>
      <div style={{textAlign:"center",zIndex:1}}>
        <div style={{color:T.text,fontSize:26,fontWeight:800,marginBottom:6}}>{callerName}</div>
        <div style={{color:T.green,fontSize:14}}>{callType==="video"?"📹 Incoming Video Call":"📞 Incoming Voice Call"}</div>
      </div>
      <div style={{display:"flex",gap:60,marginTop:32,zIndex:1}}>
        {[
          {icon:<Ic.End />,fn:onReject,label:"Decline",color:T.danger},
          {icon:callType==="video"?<Ic.Video s={26} />:<Ic.Phone s={26} />,fn:onAccept,label:"Accept",color:T.green},
        ].map(({icon,fn,label,color})=>(
          <div key={label} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <button onClick={fn} style={{width:68,height:68,borderRadius:"50%",background:color,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",boxShadow:`0 0 24px ${color}66`}}>{icon}</button>
            <span style={{color:T.textSec,fontSize:13,fontWeight:600}}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CALLING SCREEN
// ══════════════════════════════════════════════════════════════
function CallingScreen({ otherUser, callType, onCancel }) {
  const [dots,setDots]=useState(".");
  useEffect(()=>{const iv=setInterval(()=>setDots(d=>d.length>=3?".":d+"."),600);return ()=>clearInterval(iv);},[]);
  return (
    <div style={{position:"fixed",inset:0,zIndex:3000,background:"linear-gradient(160deg,#0a0e14,#0d1520)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20}}>
      {[1,2,3].map(i=>(
        <div key={i} style={{position:"absolute",top:"32%",left:"50%",transform:"translate(-50%,-50%)",width:90+i*52,height:90+i*52,borderRadius:"50%",border:`1px solid rgba(0,208,132,${0.18-i*0.05})`,animation:`ripple 2.8s ${i*0.55}s infinite ease-out`,pointerEvents:"none"}} />
      ))}
      <div style={{zIndex:1}}><Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={100} /></div>
      <div style={{color:T.text,fontSize:24,fontWeight:800,zIndex:1}}>{otherUser?.name}</div>
      <div style={{color:T.textMuted,fontSize:14,zIndex:1}}>{callType==="video"?"📹 Video":"📞 Voice"} · Calling{dots}</div>
      <button onClick={onCancel} style={{marginTop:36,width:68,height:68,borderRadius:"50%",background:T.danger,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",boxShadow:`0 0 24px ${T.danger}55`,zIndex:1}}>
        <Ic.End />
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  VIDEO CALL UI — Fixed remote audio, speaker toggle
// ══════════════════════════════════════════════════════════════
function VideoCallUI({ localStream, remoteStream, callDuration, isMuted, isCameraOff, isSpeakerOff, isFrontCam, onToggleMute, onToggleCamera, onToggleSpeaker, onFlipCamera, onEnd, otherUser, callType }) {
  const localRef  = useRef(null);
  const remoteRef = useRef(null);
  const [showCtrls, setShowCtrls] = useState(true);
  const ctrlTimer = useRef(null);

  useEffect(()=>{ if(localRef.current&&localStream) localRef.current.srcObject=localStream; },[localStream]);
  useEffect(()=>{
    if(remoteRef.current&&remoteStream) {
      remoteRef.current.srcObject=remoteStream;
      remoteRef.current.muted=!!isSpeakerOff;
    }
  },[remoteStream]);
  // Fix: sync speaker toggle even without new remoteStream
  useEffect(()=>{ if(remoteRef.current) remoteRef.current.muted=!!isSpeakerOff; },[isSpeakerOff]);

  const resetCtrlTimer = () => {
    setShowCtrls(true);
    clearTimeout(ctrlTimer.current);
    ctrlTimer.current = setTimeout(()=>setShowCtrls(false),4500);
  };

  const dur = formatDuration(callDuration);

  if(callType==="audio") {
    return (
      <div style={{position:"fixed",inset:0,zIndex:3000,background:"linear-gradient(160deg,#0a0e14,#0d1520)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        {/* Fix: audio element for remote stream */}
        <audio ref={remoteRef} autoPlay playsInline />
        <div style={{width:120,height:120,borderRadius:"50%",background:`radial-gradient(circle,rgba(0,208,132,0.12),transparent)`,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse 2s infinite"}}>
          <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={100} online />
        </div>
        <div style={{color:T.text,fontSize:24,fontWeight:800,marginTop:8}}>{otherUser?.name}</div>
        <div style={{color:T.green,fontSize:14,fontWeight:600}}>{dur}</div>
        <div style={{display:"flex",gap:24,marginTop:32,alignItems:"center"}}>
          {[
            {icon:<Ic.Speaker off={isSpeakerOff}/>,fn:onToggleSpeaker,label:isSpeakerOff?"Speaker Off":"Speaker",color:isSpeakerOff?T.danger:"rgba(255,255,255,0.12)"},
            {icon:<Ic.End />,fn:onEnd,label:"End",color:T.danger,big:true},
            {icon:<Ic.Mic muted={isMuted}/>,fn:onToggleMute,label:isMuted?"Unmute":"Mute",color:isMuted?T.danger:"rgba(255,255,255,0.12)"},
          ].map(({icon,fn,label,color,big})=>(
            <div key={label} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              <button onClick={fn} style={{width:big?68:54,height:big?68:54,borderRadius:"50%",background:color,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}>{icon}</button>
              <span style={{color:T.textMuted,fontSize:11,fontWeight:600}}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div onMouseMove={resetCtrlTimer} onClick={resetCtrlTimer}
      style={{position:"fixed",inset:0,zIndex:3000,background:"#000",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <video ref={remoteRef} autoPlay playsInline style={{width:"100%",height:"100%",objectFit:"contain",background:"#111"}} />
      {!remoteStream&&(
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,background:"linear-gradient(160deg,#0a0e14,#0d1520)"}}>
          <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={100} />
          <div style={{color:T.text,fontSize:22,fontWeight:800}}>{otherUser?.name}</div>
          <div style={{color:T.textMuted,fontSize:14,display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:T.green,animation:"pulse 1s infinite"}} />
            Connecting…
          </div>
        </div>
      )}
      {/* Local preview */}
      <div style={{position:"absolute",bottom:100,right:16,width:110,height:150,borderRadius:T.radius,overflow:"hidden",border:"1px solid rgba(255,255,255,0.2)",boxShadow:T.shadow,background:"#1a1a1a"}}>
        {isCameraOff
          ? <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#111",flexDirection:"column",gap:6}}>
              <span style={{color:T.textMuted,fontSize:24}}>🚫</span>
              <span style={{color:T.textMuted,fontSize:10}}>Cam Off</span>
            </div>
          : <video ref={localRef} autoPlay playsInline muted style={{width:"100%",height:"100%",objectFit:"cover",transform:isFrontCam?"scaleX(-1)":"none"}} />
        }
      </div>
      {/* Top bar */}
      <div style={{position:"absolute",top:0,left:0,right:0,padding:"20px 24px",background:"linear-gradient(to bottom,rgba(0,0,0,0.75),transparent)",display:"flex",alignItems:"center",opacity:showCtrls?1:0,transition:"opacity 0.35s"}}>
        <div>
          <div style={{color:"#fff",fontWeight:800,fontSize:18}}>{otherUser?.name}</div>
          <div style={{color:T.green,fontSize:13,fontWeight:600}}>{dur}</div>
        </div>
      </div>
      {/* Bottom controls */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 0 40px",background:"linear-gradient(to top,rgba(0,0,0,0.85),transparent)",display:"flex",justifyContent:"center",alignItems:"center",gap:16,flexWrap:"wrap",opacity:showCtrls?1:0,transition:"opacity 0.35s"}}>
        {[
          {icon:<Ic.Speaker off={isSpeakerOff}/>,fn:onToggleSpeaker,label:"Speaker",active:!isSpeakerOff},
          {icon:<Ic.Mic muted={isMuted}/>,fn:onToggleMute,label:isMuted?"Unmute":"Mute",active:!isMuted},
        ].map(({icon,fn,label,active})=>(
          <div key={label} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <button onClick={fn} style={{width:52,height:52,borderRadius:"50%",background:active?"rgba(255,255,255,0.15)":T.danger,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}>{icon}</button>
            <span style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:600}}>{label}</span>
          </div>
        ))}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <button onClick={onEnd} style={{width:68,height:68,borderRadius:"50%",background:T.danger,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",boxShadow:`0 0 28px ${T.danger}66`}}>
            <Ic.End />
          </button>
          <span style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:600}}>End</span>
        </div>
        {[
          {icon:<Ic.Cam off={isCameraOff}/>,fn:onToggleCamera,label:"Camera",active:!isCameraOff},
          {icon:<Ic.FlipCam />,fn:onFlipCamera,label:"Flip",active:true},
        ].map(({icon,fn,label,active})=>(
          <div key={label} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <button onClick={fn} style={{width:52,height:52,borderRadius:"50%",background:active?"rgba(255,255,255,0.15)":T.danger,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}>{icon}</button>
            <span style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:600}}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  useVideoCall HOOK — Fixed cleanup & double-fire prevention
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

  const pcRef           = useRef(null);
  const roomDocRef      = useRef(null);
  const callStartRef    = useRef(null);
  const localStreamRef  = useRef(null);
  const durationIv      = useRef(null);
  const unsubsRef       = useRef([]);
  const callStateRef    = useRef("idle");
  const callTypeRef     = useRef("video");
  const wasConnectedRef = useRef(false);
  const chatRef         = useRef(chat);
  const cleaningUp      = useRef(false);

  useEffect(()=>{ callStateRef.current=callState; },[callState]);
  useEffect(()=>{ chatRef.current=chat; },[chat]);

  // Listen for incoming
  useEffect(()=>{
    if(!currentUser?.uid) return;
    return onSnapshot(doc(db,"users",currentUser.uid,"callSignal","incoming"),snap=>{
      if(!snap.exists()) return;
      const data=snap.data();
      if(data.status==="calling"&&callStateRef.current==="idle"){
        setIncomingData(data); setCallState("incoming");
        callTypeRef.current=data.callType||"video";
        playNotifSound("call");
        sendBrowserNotif(`Incoming ${data.callType==="video"?"Video":"Voice"} Call`,`from ${data.callerName||"Someone"}`,{requireInteraction:true,sound:"call"});
        addToast({id:Date.now(),icon:data.callType==="video"?"📹":"📞",title:`Incoming ${data.callType==="video"?"Video":"Voice"} Call`,body:`from ${data.callerName||"Someone"}`,color:T.green});
      } else if(data.status==="ended"&&callStateRef.current!=="idle"){
        cleanupCall(false);
      }
    });
  },[currentUser?.uid]);

  const getMedia=async(type="video",facingMode="user")=>{
    const constraints=type==="audio"?{video:false,audio:true}:{video:{width:{ideal:1280},height:{ideal:720},facingMode},audio:true};
    try{const s=await navigator.mediaDevices.getUserMedia(constraints);localStreamRef.current=s;setLocalStream(s);return s;}
    catch(err){
      console.warn("getMedia fallback:",err);
      try{const s=await navigator.mediaDevices.getUserMedia({audio:true});localStreamRef.current=s;setLocalStream(s);return s;}
      catch(e2){addToast({id:Date.now(),icon:"⚠️",title:"Media Error",body:e2.message,color:T.danger});throw e2;}
    }
  };

  const buildPC=(stream)=>{
    const pc=new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach(t=>pc.addTrack(t,stream));
    const remote=new MediaStream(); setRemoteStream(remote);
    pc.ontrack=e=>e.streams[0].getTracks().forEach(t=>remote.addTrack(t));
    pc.onconnectionstatechange=()=>{
      if(pc.connectionState==="connected") wasConnectedRef.current=true;
      if(["disconnected","failed","closed"].includes(pc.connectionState)&&!cleaningUp.current)
        cleanupCall(true,wasConnectedRef.current?"answered":"missed");
    };
    return pc;
  };

  const startCall=useCallback(async(type="video")=>{
    if(!currentUser?.uid) return;
    const currentChat=chatRef.current;
    if(!currentChat?.otherUser?.id) return;
    callTypeRef.current=type; wasConnectedRef.current=false; cleaningUp.current=false;
    setIsFrontCam(true); setCallState("calling"); setCallDuration(0); setIsMuted(false); setIsCameraOff(false);
    try{
      const stream=await getMedia(type,"user");
      const pc=buildPC(stream); pcRef.current=pc;
      const roomRef=await addDoc(collection(db,"rooms"),{callerId:currentUser.uid,calleeId:currentChat.otherUser.id,chatId:currentChat.id,callType:type,createdAt:serverTimestamp(),status:"calling"});
      roomDocRef.current=roomRef;
      pc.onicecandidate=async e=>{if(e.candidate)await addDoc(collection(db,"rooms",roomRef.id,"callerCandidates"),e.candidate.toJSON());};
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(roomRef,{offer:{type:offer.type,sdp:offer.sdp}});
      await setDoc(doc(db,"users",currentChat.otherUser.id,"callSignal","incoming"),{status:"calling",callerId:currentUser.uid,callerName:currentUser.name||"Unknown",callerPhoto:currentUser.photoURL||null,roomId:roomRef.id,chatId:currentChat.id,callType:type});
      const u1=onSnapshot(roomRef,async snap=>{
        const d=snap.data();
        if(d?.answer&&!pc.currentRemoteDescription){
          try{await pc.setRemoteDescription(new RTCSessionDescription(d.answer));wasConnectedRef.current=true;setCallState("connected");callStartRef.current=Date.now();clearInterval(durationIv.current);durationIv.current=setInterval(()=>setCallDuration(x=>x+1),1000);}
          catch(e){console.error("setRemoteDesc:",e);}
        }
        if(d?.status==="ended") cleanupCall(false,"answered");
      });
      const u2=onSnapshot(collection(db,"rooms",roomRef.id,"calleeCandidates"),snap=>{
        snap.docChanges().forEach(async ch=>{if(ch.type==="added")await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(()=>{});});
      });
      unsubsRef.current=[u1,u2];
    }catch(err){console.error("startCall:",err);setCallState("idle");}
  },[currentUser]);

  const acceptCall=useCallback(async()=>{
    if(!incomingData) return;
    const{roomId,callType}=incomingData;
    callTypeRef.current=callType||"video"; wasConnectedRef.current=false; cleaningUp.current=false;
    setIsFrontCam(true); setCallState("connected"); setCallDuration(0); setIsMuted(false); setIsCameraOff(false);
    try{
      const stream=await getMedia(callType||"video","user");
      const pc=buildPC(stream); pcRef.current=pc;
      const roomRef=doc(db,"rooms",roomId); roomDocRef.current=roomRef;
      pc.onicecandidate=async e=>{if(e.candidate)await addDoc(collection(db,"rooms",roomId,"calleeCandidates"),e.candidate.toJSON());};
      const snap=await getDoc(roomRef);
      const offer=snap.data()?.offer;
      if(!offer){setCallState("idle");return;}
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(roomRef,{answer:{type:answer.type,sdp:answer.sdp},status:"connected"});
      const u1=onSnapshot(collection(db,"rooms",roomId,"callerCandidates"),snap=>{
        snap.docChanges().forEach(async ch=>{if(ch.type==="added")await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(()=>{});});
      });
      unsubsRef.current=[u1];
      await deleteDoc(doc(db,"users",currentUser.uid,"callSignal","incoming")).catch(()=>{});
      wasConnectedRef.current=true; callStartRef.current=Date.now();
      clearInterval(durationIv.current); durationIv.current=setInterval(()=>setCallDuration(x=>x+1),1000);
    }catch(err){console.error("acceptCall:",err);setCallState("idle");}
  },[incomingData,currentUser]);

  const rejectCall=useCallback(async()=>{
    const currentChat=chatRef.current;
    if(incomingData?.roomId){
      await updateDoc(doc(db,"rooms",incomingData.roomId),{status:"ended"}).catch(()=>{});
      if(currentChat?.id&&currentChat?.participants){
        await addDoc(collection(db,"messages"),{chatId:currentChat.id,participants:currentChat.participants,senderId:incomingData.callerId,type:"call",callType:incomingData.callType||"video",callStatus:"missed",callDuration:null,createdAt:serverTimestamp(),read:false}).catch(()=>{});
      }
    }
    await deleteDoc(doc(db,"users",currentUser.uid,"callSignal","incoming")).catch(()=>{});
    setCallState("idle"); setIncomingData(null);
  },[incomingData,currentUser]);

  const flipCamera=useCallback(async()=>{
    if(callTypeRef.current==="audio") return;
    const newFacing=isFrontCam?"environment":"user";
    try{
      const ns=await navigator.mediaDevices.getUserMedia({video:{facingMode:newFacing},audio:false});
      const nvt=ns.getVideoTracks()[0];
      if(pcRef.current){const sender=pcRef.current.getSenders().find(s=>s.track?.kind==="video");if(sender)await sender.replaceTrack(nvt);}
      if(localStreamRef.current){
        localStreamRef.current.getVideoTracks().forEach(t=>{t.stop();localStreamRef.current.removeTrack(t);});
        localStreamRef.current.addTrack(nvt);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
      setIsFrontCam(f=>!f);
    }catch{addToast({id:Date.now(),icon:"⚠️",title:"Camera Flip Failed",body:"Back camera unavailable",color:T.warn});}
  },[isFrontCam,addToast]);

  const cleanupCall=useCallback(async(notify=true,status="missed")=>{
    if(cleaningUp.current) return;
    cleaningUp.current=true;
    clearInterval(durationIv.current);
    const duration=callStartRef.current?Math.floor((Date.now()-callStartRef.current)/1000):0;
    const finalStatus=duration>0?"answered":(wasConnectedRef.current?"answered":status);
    localStreamRef.current?.getTracks().forEach(t=>t.stop());
    try{pcRef.current?.close();}catch{}
    pcRef.current=null; unsubsRef.current.forEach(u=>u?.()); unsubsRef.current=[];
    if(notify&&roomDocRef.current) await updateDoc(roomDocRef.current,{status:"ended"}).catch(()=>{});
    const currentChat=chatRef.current;
    const otherId=currentChat?.otherUser?.id;
    if(notify&&otherId) await setDoc(doc(db,"users",otherId,"callSignal","incoming"),{status:"ended"}).catch(()=>{});
    if(currentUser?.uid) await deleteDoc(doc(db,"users",currentUser.uid,"callSignal","incoming")).catch(()=>{});
    if(notify&&currentChat?.id&&currentChat?.participants){
      const mm=String(Math.floor(duration/60)).padStart(2,"0"), ss=String(duration%60).padStart(2,"0");
      await addDoc(collection(db,"messages"),{chatId:currentChat.id,participants:currentChat.participants,senderId:currentUser.uid,type:"call",callType:callTypeRef.current,callStatus:finalStatus,callDuration:duration>0?`${mm}:${ss}`:null,createdAt:serverTimestamp(),read:false}).catch(()=>{});
    }
    wasConnectedRef.current=false; callStartRef.current=null; localStreamRef.current=null; roomDocRef.current=null;
    setLocalStream(null); setRemoteStream(null); setCallState("idle"); setIncomingData(null);
    setCallDuration(0); setIsMuted(false); setIsCameraOff(false);
    setTimeout(()=>{cleaningUp.current=false;},500);
  },[currentUser]);

  return {
    callState,incomingData,localStream,remoteStream,
    isMuted,isCameraOff,isSpeakerOff,isFrontCam,callDuration,callType:callTypeRef.current,
    startCall,acceptCall,rejectCall,
    endCall:()=>cleanupCall(true,wasConnectedRef.current?"answered":"missed"),
    toggleMute:    ()=>{localStreamRef.current?.getAudioTracks().forEach(t=>{t.enabled=!t.enabled;});setIsMuted(m=>!m);},
    toggleCamera:  ()=>{localStreamRef.current?.getVideoTracks().forEach(t=>{t.enabled=!t.enabled;});setIsCameraOff(c=>!c);},
    toggleSpeaker: ()=>setIsSpeakerOff(s=>!s),
    flipCamera,
  };
}

// ══════════════════════════════════════════════════════════════
//  FILTER TABS
// ══════════════════════════════════════════════════════════════
function FilterTabs({ active, onChange }) {
  return (
    <div style={{display:"flex",gap:4,padding:"6px 12px",background:T.bg,borderBottom:`1px solid ${T.border}`,overflowX:"auto"}}>
      {["All","Unread","Groups","Archived"].map(t=>(
        <button key={t} onClick={()=>onChange(t)}
          style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap",background:active===t?T.green:"rgba(255,255,255,0.04)",color:active===t?"#fff":T.textSec,transition:"all 0.15s"}}>
          {t}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CHAT ITEM MENU (right-click)
// ══════════════════════════════════════════════════════════════
function ChatItemMenu({ pos, onClose, onClearMessages, onDeleteChat }) {
  const ref = useRef();
  useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))onClose();};
    document.addEventListener("mousedown",fn);
    return ()=>document.removeEventListener("mousedown",fn);
  },[onClose]);
  return (
    <div ref={ref} style={{position:"fixed",top:pos.y,left:pos.x,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:T.radius,boxShadow:T.shadow,zIndex:3000,overflow:"hidden",minWidth:190,animation:"popIn 0.15s ease"}}>
      {[
        {icon:<Ic.Clear />,label:"Clear Messages",fn:onClearMessages,danger:false},
        {icon:<Ic.Trash />,label:"Delete Chat",   fn:onDeleteChat,   danger:true},
      ].map(({icon,label,fn,danger})=>(
        <button key={label} onClick={()=>{fn();onClose();}}
          style={{display:"flex",alignItems:"center",gap:12,width:"100%",background:"none",border:"none",padding:"11px 16px",cursor:"pointer",textAlign:"left",color:danger?T.danger:T.text,fontSize:13,fontWeight:600,transition:"background 0.12s"}}
          onMouseEnter={e=>e.currentTarget.style.background=T.bgHover}
          onMouseLeave={e=>e.currentTarget.style.background="none"}>
          <span style={{color:danger?T.danger:T.textMuted,display:"flex"}}>{icon}</span>{label}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════════
function Sidebar({ chats, currentUser, onSelectChat, activeChatId, isMobile, onBackToDashboard, typingMap, statuses, onViewStatuses, onComposeStatus, onClearMessages, onDeleteChat, drafts }) {
  const [search,        setSearch       ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [filter,        setFilter       ] = useState("All");
  const [menuOpen,      setMenuOpen     ] = useState(false);
  const [chatMenu,      setChatMenu     ] = useState(null);
  const menuRef = useRef();

  useEffect(()=>{
    if(!search.trim()){setSearchResults([]);return;}
    const q=query(collection(db,"users"),where("name",">=",search),where("name","<=",search+"\uf8ff"));
    return onSnapshot(q,snap=>{setSearchResults(snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.id!==currentUser?.uid));});
  },[search,currentUser]);

  useEffect(()=>{
    const fn=e=>{if(menuRef.current&&!menuRef.current.contains(e.target))setMenuOpen(false);};
    document.addEventListener("mousedown",fn); return ()=>document.removeEventListener("mousedown",fn);
  },[]);

  const filtered=useMemo(()=>{
    let list=search?searchResults:chats;
    if(!search){
      if(filter==="Unread") list=list.filter(c=>c.unreadCount>0);
      else if(filter==="Groups") list=list.filter(c=>c.isGroup);
      else if(filter==="Archived") list=list.filter(c=>c.archived);
      else list=list.filter(c=>!c.archived);
    }
    return list;
  },[chats,search,searchResults,filter]);

  const handleUserSelect=async(user)=>{
    const ex=chats.find(c=>c.participants?.includes(user.id)&&!c.isGroup);
    if(ex){onSelectChat(ex);setSearch("");return;}
    const ref=await addDoc(collection(db,"chats"),{participants:[currentUser.uid,user.id],createdAt:serverTimestamp(),lastMessage:"",lastMessageTime:serverTimestamp()});
    onSelectChat({id:ref.id,participants:[currentUser.uid,user.id],otherUser:user,lastMessage:"",lastMessageTime:null});
    setSearch("");
  };

  const totalUnread=chats.filter(c=>!c.archived).reduce((s,c)=>s+(c.unreadCount||0),0);
  const myStatuses=statuses?.filter(s=>s.authorId===currentUser?.uid)||[];

  // Group other users' statuses by author
  const othersGrouped=useMemo(()=>{
    const map={};
    (statuses||[]).filter(s=>s.authorId!==currentUser?.uid).forEach(s=>{
      if(!map[s.authorId]) map[s.authorId]={author:s,all:[]};
      map[s.authorId].all.push(s);
    });
    return Object.values(map);
  },[statuses,currentUser]);

  return (
    <div style={{width:isMobile?"100%":340,background:T.bg,display:"flex",flexDirection:"column",borderRight:`1px solid ${T.border}`,height:"100%",flexShrink:0}}>
      {chatMenu&&(
        <ChatItemMenu
          pos={{x:chatMenu.x,y:chatMenu.y}}
          onClose={()=>setChatMenu(null)}
          onClearMessages={()=>onClearMessages(chatMenu.chatId)}
          onDeleteChat={()=>onDeleteChat(chatMenu.chatId)}
        />
      )}

      {/* Header */}
      <div style={{padding:"12px 14px",background:T.bgCard,display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${T.border}`,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flex:1,overflow:"hidden"}}>
          <button onClick={onBackToDashboard} style={{background:"none",border:"none",cursor:"pointer",color:T.textSec,padding:4,display:"flex",flexShrink:0,transition:"color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.color=T.text} onMouseLeave={e=>e.currentTarget.style.color=T.textSec}>
            <Ic.Back />
          </button>
          <Avatar name={currentUser?.name||"Me"} photoURL={currentUser?.photoURL} size={36} online />
          <div style={{overflow:"hidden"}}>
            <div style={{color:T.text,fontWeight:800,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{currentUser?.name||"You"}</div>
            <div style={{color:T.green,fontSize:11,display:"flex",alignItems:"center",gap:4,fontWeight:600}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:T.green,display:"inline-block",boxShadow:`0 0 4px ${T.green}`}} />
              Online
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center"}}>
          {totalUnread>0&&<span style={{background:T.green,color:"#fff",borderRadius:12,minWidth:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,padding:"0 5px"}}>{totalUnread>99?"99+":totalUnread}</span>}
          <div ref={menuRef} style={{position:"relative"}}>
            <button onClick={()=>setMenuOpen(s=>!s)} style={{background:"none",border:"none",cursor:"pointer",color:menuOpen?T.green:T.textSec,padding:6,borderRadius:T.radiusSm,display:"flex",transition:"all 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.bgHover} onMouseLeave={e=>e.currentTarget.style.background="none"}>
              <Ic.More />
            </button>
            {menuOpen&&(
              <div style={{position:"absolute",top:"100%",right:0,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:T.radius,boxShadow:T.shadow,minWidth:180,zIndex:100,animation:"popIn 0.15s ease",overflow:"hidden"}}>
                {["⊕ New Group","⭐ Starred","📦 Archived","⚙️ Settings"].map(label=>(
                  <button key={label} style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:"none",border:"none",padding:"11px 16px",cursor:"pointer",textAlign:"left",color:T.text,fontSize:13,fontWeight:600,transition:"background 0.12s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=T.bgHover} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Row */}
      <div style={{padding:"10px 14px",background:T.bg,borderBottom:`1px solid ${T.border}`,overflowX:"auto"}}>
        <div style={{display:"flex",gap:14,alignItems:"flex-start",minWidth:"max-content"}}>
          {/* My status */}
          <button onClick={()=>myStatuses.length>0?onViewStatuses(myStatuses,0):onComposeStatus()}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",flexShrink:0}}>
            <div style={{position:"relative",width:50,height:50}}>
              <Avatar name={currentUser?.name||"Me"} photoURL={currentUser?.photoURL} size={50} hasStatus={myStatuses.length>0} />
              <div style={{position:"absolute",bottom:0,right:0,width:19,height:19,borderRadius:"50%",background:myStatuses.length>0?T.accent:T.green,border:`2.5px solid ${T.bg}`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:myStatuses.length>0?11:14,fontWeight:800,lineHeight:1}}>
                {myStatuses.length>0?"👁":"＋"}
              </div>
            </div>
            <span style={{fontSize:10,color:T.textSec,whiteSpace:"nowrap",maxWidth:56,overflow:"hidden",textOverflow:"ellipsis",fontWeight:600}}>
              {myStatuses.length>0?"My Status":"Add Status"}
            </span>
          </button>

          {/* Add more (if has statuses) */}
          {myStatuses.length>0&&(
            <button onClick={onComposeStatus}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",flexShrink:0}}>
              <div style={{width:50,height:50,borderRadius:"50%",border:`2px dashed ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.textMuted,background:"rgba(255,255,255,0.02)"}}>
                <Ic.Plus />
              </div>
              <span style={{fontSize:10,color:T.textMuted,fontWeight:600}}>Add More</span>
            </button>
          )}

          {/* Others */}
          {othersGrouped.slice(0,5).map((grp,i)=>(
            <button key={grp.author.authorId||i} onClick={()=>onViewStatuses(grp.all,0)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",flexShrink:0}}>
              <div style={{position:"relative"}}>
                <Avatar name={grp.author.authorName||"?"} photoURL={grp.author.authorPhoto} size={50} hasStatus />
                {grp.all.length>1&&<div style={{position:"absolute",bottom:-2,right:-2,background:T.accent,color:"#fff",borderRadius:10,fontSize:9,fontWeight:700,padding:"1px 5px",border:`1.5px solid ${T.bg}`}}>{grp.all.length}</div>}
              </div>
              <span style={{fontSize:10,color:T.textSec,whiteSpace:"nowrap",maxWidth:56,overflow:"hidden",textOverflow:"ellipsis",fontWeight:600}}>{grp.author.authorName?.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{padding:"8px 12px",background:T.bg}}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:T.radius,display:"flex",alignItems:"center",padding:"8px 12px",gap:8,transition:"border-color 0.15s"}}
          onFocusCapture={e=>e.currentTarget.style.borderColor=T.green} onBlurCapture={e=>e.currentTarget.style.borderColor=T.border}>
          <span style={{color:T.textMuted}}><Ic.Search /></span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search or start new chat"
            style={{background:"none",border:"none",outline:"none",color:T.text,flex:1,fontSize:13}} />
          {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,display:"flex"}}><Ic.Close s={14} /></button>}
        </div>
      </div>

      {!search&&<FilterTabs active={filter} onChange={setFilter} />}

      {/* Chat list */}
      <div style={{flex:1,overflowY:"auto"}}>
        {filtered.length===0&&(
          <div style={{color:T.textMuted,textAlign:"center",padding:32,fontSize:13}}>{search?"No users found":"No chats yet"}</div>
        )}
        {filtered.map(item=>{
          const isUser=!!item.email&&!item.otherUser;
          const name=isUser?item.name:item.otherUser?.name||"Unknown";
          const isActive=activeChatId===item.id;
          const unread=!isUser?(item.unreadCount||0):0;
          const isTyping=!isUser&&typingMap?.[item.id];
          const lastTime=!isUser&&item.lastMessageTime?formatTime(item.lastMessageTime):"";
          const draft=!isUser&&drafts?.[item.id]||"";
          const sub=isUser?item.email:(draft?draft:(item.lastMessage||"Say hello 👋"));
          return (
            <div key={item.id}
              onClick={()=>isUser?handleUserSelect(item):onSelectChat(item)}
              onContextMenu={e=>{
                if(isUser) return; e.preventDefault();
                let x=e.clientX,y=e.clientY;
                if(x+200>window.innerWidth) x=window.innerWidth-210;
                if(y+110>window.innerHeight) y=window.innerHeight-120;
                setChatMenu({chatId:item.id,x,y});
              }}
              style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",cursor:"pointer",background:isActive?T.bgActive:T.bg,borderBottom:`1px solid ${T.border}`,transition:"background 0.12s",position:"relative"}}
              onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=T.bgHover;}}
              onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background=T.bg;}}>
              {isActive&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:T.green,borderRadius:"0 3px 3px 0"}} />}
              <Avatar name={name} photoURL={item.photoURL||item.otherUser?.photoURL} size={46} online={item.online||item.otherUser?.online} />
              <div style={{flex:1,overflow:"hidden"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:T.text,fontWeight:700,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{name}</span>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0,marginLeft:8}}>
                    {lastTime&&<span style={{color:unread>0?T.green:T.textMuted,fontSize:11,fontWeight:unread>0?700:400}}>{lastTime}</span>}
                    {unread>0&&<span style={{background:T.green,color:"#fff",borderRadius:12,minWidth:20,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,padding:"0 5px"}}>{unread>99?"99+":unread}</span>}
                  </div>
                </div>
                <div style={{fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:2,display:"flex",alignItems:"center",gap:3}}>
                  {isTyping
                    ? <span style={{color:T.green,display:"flex",alignItems:"center",gap:5,fontWeight:600}}>typing <TypingDots /></span>
                    : <>{draft&&<span style={{color:T.danger,fontSize:12,fontWeight:700,flexShrink:0}}>Draft: </span>}<span style={{color:draft?T.textSec:T.textMuted}}>{sub}</span></>
                  }
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
//  CHAT PANEL
// ══════════════════════════════════════════════════════════════
function ChatPanel({ chat, currentUser, onClose, isMobile, addToast, allChats, onDraftChange }) {
  const [messages,      setMessages     ] = useState([]);
  const [text,          setText         ] = useState(()=>DraftStore.get(chat?.id||""));
  const [userCache,     setUserCache    ] = useState({});
  const [otherUserData, setOtherUser    ] = useState(null);
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [contextMenu,   setContextMenu  ] = useState(null);
  const [deletedIds,    setDeletedIds   ] = useState(new Set());
  const [starredIds,    setStarredIds   ] = useState(new Set());
  const [searchOpen,    setSearchOpen   ] = useState(false);
  const [searchQuery,   setSearchQuery  ] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [searchIndex,   setSearchIndex  ] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [replyTo,       setReplyTo      ] = useState(null);
  const [editingMsg,    setEditingMsg   ] = useState(null);
  const [forwardMsg,    setForwardMsg   ] = useState(null);
  const [showEmoji,     setShowEmoji    ] = useState(false);
  const [uploadProgress,setUploadProg   ] = useState(null);
  const [uploadCancel,  setUploadCancel ] = useState(null);
  const [mediaPreview,  setMediaPreview ] = useState(null);
  const [isRecording,   setIsRecording  ] = useState(false);
  const [recDuration,   setRecDuration  ] = useState(0);
  const [showPinned,    setShowPinned   ] = useState(true);
  const [showStarred,   setShowStarred  ] = useState(false);
  const [showProfile,   setShowProfile  ] = useState(false);
  const [moreMenuOpen,  setMoreMenu     ] = useState(false);
  const [confirmClear,  setConfirmClear ] = useState(false);
  const [confirmDelMsg, setConfirmDelMsg] = useState(null);
  const moreMenuRef = useRef();

  const bottomRef    = useRef();
  const containerRef = useRef();
  const inputRef     = useRef();
  const typingTimeout= useRef();
  const typingDocRef = useRef();
  const fileInputRef = useRef();
  const mediaRecRef  = useRef(null);
  const recChunks    = useRef([]);
  const recTimer     = useRef(null);

  const vc = useVideoCall({ currentUser, chat, addToast });

  useEffect(()=>{
    if(chat?.id){ setText(DraftStore.get(chat.id)); }
  },[chat?.id]);

  useEffect(()=>{
    return ()=>{ if(chat?.id) DraftStore.set(chat.id, inputRef.current?.value||""); };
  },[chat?.id]);

  useEffect(()=>{
    const id=chat?.otherUser?.id; if(!id) return;
    return onSnapshot(doc(db,"users",id),snap=>{if(snap.exists())setOtherUser({id,...snap.data()});});
  },[chat?.otherUser?.id]);

  useEffect(()=>{
    if(!chat?.id){setMessages([]);return;}
    typingDocRef.current=doc(db,"chats",chat.id,"typing",currentUser.uid);
    const q=query(collection(db,"messages"),where("chatId","==",chat.id),orderBy("createdAt","asc"));
    return onSnapshot(q,async snap=>{
      const list=snap.docs.map(d=>({id:d.id,...d.data()}));
      setMessages(prev=>{
        if(prev.length>0&&list.length>prev.length){
          const newest=list[list.length-1];
          if(newest?.senderId!==currentUser.uid&&newest?.type!=="call"){
            const name=otherUserData?.name||"Someone";
            addToast({id:Date.now(),icon:"💬",title:name,body:newest.text||"📎 Media",color:T.green});
            sendBrowserNotif(name,newest.text||"📎 Media",{tag:"msg-"+chat.id});
          }
        }
        return list;
      });
      const batch=writeBatch(db); let hasUpdates=false;
      list.forEach(m=>{
        if(m.senderId!==currentUser.uid){
          if(!m.read){batch.update(doc(db,"messages",m.id),{read:true,delivered:true});hasUpdates=true;}
          else if(!m.delivered){batch.update(doc(db,"messages",m.id),{delivered:true});hasUpdates=true;}
        }
        if(m.senderId&&!userCache[m.senderId]){
          getDoc(doc(db,"users",m.senderId)).then(ud=>{if(ud.exists())setUserCache(p=>({...p,[m.senderId]:ud.data()}));});
        }
      });
      if(hasUpdates) batch.commit().catch(()=>{});
      setDeletedIds(new Set(list.filter(m=>m.deleted).map(m=>m.id)));
      setStarredIds(new Set(list.filter(m=>m.starred).map(m=>m.id)));
    });
  },[chat?.id,currentUser.uid]);

  useEffect(()=>{
    const id=chat?.otherUser?.id; if(!chat?.id||!id) return;
    return onSnapshot(doc(db,"chats",chat.id,"typing",id),snap=>{
      if(snap.exists()){const age=Date.now()-(snap.data().updatedAt?.toMillis?.()||0);setIsTypingOther(age<5000);}
      else setIsTypingOther(false);
    });
  },[chat?.id,chat?.otherUser?.id]);

  useEffect(()=>{
    const el=containerRef.current; if(!el) return;
    const atBottom=el.scrollHeight-el.scrollTop-el.clientHeight<140;
    if(atBottom) bottomRef.current?.scrollIntoView({behavior:"smooth"});
  },[messages,isTypingOther]);

  useEffect(()=>{
    const el=containerRef.current; if(!el) return;
    const fn=()=>setShowScrollBtn(el.scrollHeight-el.scrollTop-el.clientHeight>160);
    el.addEventListener("scroll",fn); return ()=>el.removeEventListener("scroll",fn);
  },[]);

  useEffect(()=>{
    if(!currentUser?.uid) return;
    updateDoc(doc(db,"users",currentUser.uid),{online:true}).catch(()=>{});
    return ()=>updateDoc(doc(db,"users",currentUser.uid),{online:false,lastSeen:serverTimestamp()}).catch(()=>{});
  },[currentUser?.uid]);

  useEffect(()=>{
    if(!searchQuery.trim()){setSearchMatches([]);setSearchIndex(0);return;}
    const q=searchQuery.toLowerCase();
    const matches=messages.reduce((acc,m)=>{if(m.text?.toLowerCase().includes(q))acc.push({id:m.id});return acc;},[]);
    setSearchMatches(matches); setSearchIndex(matches.length>0?matches.length-1:0);
  },[searchQuery,messages]);

  useEffect(()=>{
    if(!searchMatches.length) return;
    document.getElementById(`msg-${searchMatches[searchIndex]?.id}`)?.scrollIntoView({behavior:"smooth",block:"center"});
  },[searchIndex,searchMatches]);

  useEffect(()=>{ return ()=>{ clearTimeout(typingTimeout.current); if(typingDocRef.current)deleteDoc(typingDocRef.current).catch(()=>{}); }; },[chat?.id]);

  useEffect(()=>{
    const fn=e=>{if(moreMenuRef.current&&!moreMenuRef.current.contains(e.target))setMoreMenu(false);};
    document.addEventListener("mousedown",fn); return ()=>document.removeEventListener("mousedown",fn);
  },[]);

  const searchNext=()=>setSearchIndex(i=>searchMatches.length>0?(i-1+searchMatches.length)%searchMatches.length:0);
  const searchPrev=()=>setSearchIndex(i=>searchMatches.length>0?(i+1)%searchMatches.length:0);

  const handleTyping=async(val)=>{
    setText(val);
    if(chat?.id){DraftStore.set(chat.id,val);onDraftChange?.(chat.id,val);}
    if(!chat?.id||!typingDocRef.current) return;
    await setDoc(typingDocRef.current,{typing:true,updatedAt:serverTimestamp()}).catch(()=>{});
    clearTimeout(typingTimeout.current);
    typingTimeout.current=setTimeout(async()=>{await deleteDoc(typingDocRef.current).catch(()=>{});},3000);
  };

  const sendMessage=async()=>{
    const trimmed=text.trim(); if(!trimmed||!chat?.id) return;
    clearTimeout(typingTimeout.current);
    if(typingDocRef.current) await deleteDoc(typingDocRef.current).catch(()=>{});
    if(editingMsg){
      await updateDoc(doc(db,"messages",editingMsg.id),{text:trimmed,edited:true,editedAt:serverTimestamp()}).catch(()=>{});
      setEditingMsg(null);
    } else {
      const msgData={chatId:chat.id,participants:chat.participants||[currentUser.uid,chat.otherUser?.id].filter(Boolean),text:trimmed,senderId:currentUser.uid,createdAt:serverTimestamp(),read:false,delivered:false,type:"text"};
      if(replyTo){msgData.replyTo=replyTo.id;msgData.replyToText=replyTo.text;}
      await addDoc(collection(db,"messages"),msgData);
      await updateDoc(doc(db,"chats",chat.id),{lastMessage:trimmed,lastMessageTime:serverTimestamp()}).catch(()=>{});
      setReplyTo(null);
    }
    DraftStore.remove(chat.id); onDraftChange?.(chat.id,"");
    setText(""); setTimeout(()=>inputRef.current?.focus(),0);
  };

  const handleKey=(e)=>{
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}
    if(e.key==="Escape"){setReplyTo(null);setEditingMsg(null);setText("");setShowEmoji(false);}
  };

  const handleFileUpload=async(file)=>{
    if(!file||!chat?.id) return;
    const storage=getStorage();
    const fileType=file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":"file";
    const sRef=storageRef(storage,`chat_media/${chat.id}/${Date.now()}_${file.name}`);
    const task=uploadBytesResumable(sRef,file);
    let cancelled=false;
    setUploadCancel(()=>()=>{task.cancel();cancelled=true;setUploadProg(null);});
    task.on("state_changed",
      snap=>setUploadProg((snap.bytesTransferred/snap.totalBytes)*100),
      err=>{console.error(err);setUploadProg(null);addToast({id:Date.now(),icon:"❌",title:"Upload failed",body:err.message,color:T.danger});},
      async()=>{
        if(cancelled) return;
        const url=await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db,"messages"),{chatId:chat.id,participants:chat.participants||[currentUser.uid,chat.otherUser?.id].filter(Boolean),senderId:currentUser.uid,createdAt:serverTimestamp(),read:false,delivered:false,type:fileType,fileURL:url,fileName:file.name,fileSize:file.size});
        await updateDoc(doc(db,"chats",chat.id),{lastMessage:`📎 ${fileType==="image"?"Image":fileType==="video"?"Video":"File"}`,lastMessageTime:serverTimestamp()}).catch(()=>{});
        setUploadProg(null);
      }
    );
  };

  const startRecording=async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mr=new MediaRecorder(stream); mediaRecRef.current=mr; recChunks.current=[];
      mr.ondataavailable=e=>{if(e.data.size>0)recChunks.current.push(e.data);};
      mr.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(recChunks.current,{type:"audio/webm"}); const dur=recDuration;
        setIsRecording(false); setRecDuration(0); clearInterval(recTimer.current);
        const sRef=storageRef(getStorage(),`chat_media/${chat.id}/voice_${Date.now()}.webm`);
        const task=uploadBytesResumable(sRef,blob);
        task.on("state_changed",null,null,async()=>{
          const url=await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db,"messages"),{chatId:chat.id,participants:chat.participants||[currentUser.uid,chat.otherUser?.id].filter(Boolean),senderId:currentUser.uid,createdAt:serverTimestamp(),read:false,delivered:false,type:"voice",fileURL:url,voiceDuration:dur});
          await updateDoc(doc(db,"chats",chat.id),{lastMessage:"🎤 Voice Note",lastMessageTime:serverTimestamp()}).catch(()=>{});
        });
      };
      mr.start(); setIsRecording(true); setRecDuration(0);
      recTimer.current=setInterval(()=>setRecDuration(d=>d+1),1000);
    }catch{ addToast({id:Date.now(),icon:"⚠️",title:"Mic blocked",body:"Enable microphone permission.",color:T.danger}); }
  };

  const stopRecording=()=>{mediaRecRef.current?.stop();clearInterval(recTimer.current);};
  const cancelRecording=()=>{
    if(mediaRecRef.current&&isRecording){
      mediaRecRef.current.ondataavailable=null; mediaRecRef.current.onstop=null;
      try{mediaRecRef.current.stop();}catch{}
      setIsRecording(false); setRecDuration(0); clearInterval(recTimer.current);
    }
  };

  const handleDeleteMsg=async(id)=>{
    setDeletedIds(p=>new Set([...p,id]));
    await updateDoc(doc(db,"messages",id),{deleted:true,text:""}).catch(()=>{});
    setConfirmDelMsg(null);
  };

  const handleClearMessages=async()=>{
    if(!chat?.id) return;
    try{
      const snap=await getDocs(query(collection(db,"messages"),where("chatId","==",chat.id)));
      const batch=writeBatch(db); snap.docs.forEach(d=>batch.delete(d.ref));
      await batch.commit();
      await updateDoc(doc(db,"chats",chat.id),{lastMessage:"",lastMessageTime:serverTimestamp()}).catch(()=>{});
      DraftStore.remove(chat.id); onDraftChange?.(chat.id,""); setText("");
      setConfirmClear(false);
      addToast({id:Date.now(),icon:"🗑️",title:"Messages Cleared",body:"All messages deleted",color:T.warn});
    }catch(err){ addToast({id:Date.now(),icon:"❌",title:"Error",body:err.message,color:T.danger}); }
  };

  const handleReact   = async(id,emoji)=>{ await updateDoc(doc(db,"messages",id),{[`reactions.${currentUser.uid}`]:emoji}).catch(()=>{}); };
  const handlePin     = async(id)=>{ const m=messages.find(x=>x.id===id); await updateDoc(doc(db,"messages",id),{pinned:!m?.pinned}).catch(()=>{}); };
  const handleStar    = async(id)=>{ const m=messages.find(x=>x.id===id); await updateDoc(doc(db,"messages",id),{starred:!m?.starred}).catch(()=>{}); };
  const handleEdit    = (msg)=>{ setEditingMsg(msg); setText(msg.text); setReplyTo(null); setTimeout(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(msg.text.length,msg.text.length);},50); };
  const handleReply   = (msg)=>{ setReplyTo({id:msg.id,text:msg.text,type:msg.type,senderId:msg.senderId,isMine:msg.senderId===currentUser.uid,senderName:userCache[msg.senderId]?.name||otherUserData?.name}); setEditingMsg(null); setTimeout(()=>inputRef.current?.focus(),50); };

  const handleForwardConfirm=async(targetChatId)=>{
    const targetChat=allChats.find(c=>c.id===targetChatId); if(!targetChat||!forwardMsg) return;
    await addDoc(collection(db,"messages"),{chatId:targetChatId,participants:targetChat.participants||[currentUser.uid,targetChat.otherUser?.id].filter(Boolean),text:forwardMsg.text,senderId:currentUser.uid,createdAt:serverTimestamp(),read:false,delivered:false,type:"text",forwarded:true});
    await updateDoc(doc(db,"chats",targetChatId),{lastMessage:forwardMsg.text,lastMessageTime:serverTimestamp()}).catch(()=>{});
    setForwardMsg(null); addToast({id:Date.now(),icon:"↩️",title:"Forwarded",body:`Sent to ${targetChat.otherUser?.name}`,color:T.green});
  };

  const grouped=useMemo(()=>{
    const g=[]; let lastDate=null;
    messages.forEach(m=>{
      const label=m.createdAt?formatDate(m.createdAt):null;
      if(label&&label!==lastDate){g.push({type:"date",label});lastDate=label;}
      g.push({type:"msg",msg:m});
    });
    return g;
  },[messages]);

  const displayUser    = otherUserData||chat?.otherUser;
  const isOnline       = displayUser?.online;
  const statusText     = isTypingOther?null:isOnline?"Online":formatLastSeen(displayUser?.lastSeen);
  const currentMatchId = searchMatches[searchIndex]?.id;

  if(!chat) {
    return (
      <div style={{flex:1,background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <div style={{width:88,height:88,borderRadius:"50%",background:T.bgCard,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>💬</div>
        <div style={{color:T.textSec,fontSize:16,fontWeight:700}}>Select a chat to start messaging</div>
        <div style={{color:T.textMuted,fontSize:13}}>🔒 End-to-end encrypted</div>
      </div>
    );
  }

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",height:"100%",minWidth:0,position:"relative",background:T.bg}}
      onClick={()=>{if(contextMenu)setContextMenu(null);if(showEmoji)setShowEmoji(false);}}>

      {confirmClear&&<ConfirmDialog title="Clear All Messages?" body={`Permanently delete all messages with ${displayUser?.name}?`} confirmLabel="Clear" dangerConfirm onConfirm={handleClearMessages} onCancel={()=>setConfirmClear(false)} />}
      {confirmDelMsg&&<ConfirmDialog title="Delete Message?" body="This message will be deleted for you only." confirmLabel="Delete" dangerConfirm onConfirm={()=>handleDeleteMsg(confirmDelMsg)} onCancel={()=>setConfirmDelMsg(null)} />}

      {vc.callState==="incoming"&&<IncomingCallScreen callerName={vc.incomingData?.callerName||"Unknown"} callerPhoto={vc.incomingData?.callerPhoto} callType={vc.incomingData?.callType||"video"} onAccept={vc.acceptCall} onReject={vc.rejectCall} />}
      {vc.callState==="calling"  &&<CallingScreen otherUser={displayUser} callType={vc.callType} onCancel={vc.endCall} />}
      {vc.callState==="connected"&&<VideoCallUI localStream={vc.localStream} remoteStream={vc.remoteStream} callDuration={vc.callDuration} isMuted={vc.isMuted} isCameraOff={vc.isCameraOff} isSpeakerOff={vc.isSpeakerOff} isFrontCam={vc.isFrontCam} onToggleMute={vc.toggleMute} onToggleCamera={vc.toggleCamera} onToggleSpeaker={vc.toggleSpeaker} onFlipCamera={vc.flipCamera} onEnd={vc.endCall} otherUser={displayUser} callType={vc.callType} />}

      {showStarred&&<StarredPanel messages={messages} onClose={()=>setShowStarred(false)} />}
      {forwardMsg&&<ForwardModal chats={allChats.filter(c=>c.id!==chat.id)} currentUser={currentUser} msgText={forwardMsg.text} onForward={handleForwardConfirm} onClose={()=>setForwardMsg(null)} />}
      {mediaPreview&&<MediaModal src={mediaPreview.src} type={mediaPreview.type} onClose={()=>setMediaPreview(null)} />}
      {contextMenu&&(
        <ContextMenu x={contextMenu.x} y={contextMenu.y} isMine={contextMenu.isMine} msgId={contextMenu.msgId} msgText={contextMenu.msgText} msgType={contextMenu.msgType}
          onDelete={()=>setConfirmDelMsg(contextMenu.msgId)}
          onReact={emoji=>handleReact(contextMenu.msgId,emoji)}
          onReply={()=>{const m=messages.find(x=>x.id===contextMenu.msgId);if(m)handleReply(m);}}
          onForward={()=>{const m=messages.find(x=>x.id===contextMenu.msgId);if(m)setForwardMsg(m);}}
          onEdit={()=>{const m=messages.find(x=>x.id===contextMenu.msgId);if(m)handleEdit(m);}}
          onPin={()=>handlePin(contextMenu.msgId)}
          onStar={()=>handleStar(contextMenu.msgId)}
          onClose={()=>setContextMenu(null)} />
      )}

      {/* Header */}
      <div style={{background:T.bgCard,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:T.textSec,padding:4,display:"flex",flexShrink:0}}><Ic.Back /></button>
        <button onClick={()=>setShowProfile(s=>!s)} style={{background:"none",border:"none",cursor:"pointer",flexShrink:0,padding:0}}>
          <Avatar name={displayUser?.name||"?"} photoURL={displayUser?.photoURL} size={40} online={isOnline} />
        </button>
        <div style={{flex:1,overflow:"hidden"}}>
          <div style={{color:T.text,fontWeight:800,fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{displayUser?.name||"Unknown"}</div>
          <div style={{fontSize:11,color:isTypingOther||isOnline?T.green:T.textMuted,display:"flex",alignItems:"center",gap:5,fontWeight:isTypingOther||isOnline?600:400}}>
            {isTypingOther?<><span>typing</span><TypingDots /></>:statusText}
          </div>
        </div>
        <div style={{display:"flex",gap:2,flexShrink:0,alignItems:"center"}}>
          {[
            {icon:<Ic.Phone s={18}/>,fn:()=>vc.startCall("audio"),title:"Voice call"},
            {icon:<Ic.Video s={18}/>,fn:()=>vc.startCall("video"),title:"Video call"},
            {icon:<Ic.Search />,fn:()=>{setSearchOpen(s=>!s);if(searchOpen)setSearchQuery("");},active:searchOpen,title:"Search"},
          ].map(({icon,fn,title,active})=>(
            <button key={title} onClick={fn} title={title}
              style={{background:active?T.greenGlow:"none",border:"none",cursor:"pointer",color:active?T.green:T.textSec,padding:8,borderRadius:T.radiusSm,display:"flex",transition:"all 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=active?T.greenGlow:T.bgHover}
              onMouseLeave={e=>e.currentTarget.style.background=active?T.greenGlow:"none"}>
              {icon}
            </button>
          ))}
          <div ref={moreMenuRef} style={{position:"relative"}}>
            <button onClick={()=>setMoreMenu(s=>!s)} style={{background:moreMenuOpen?T.bgHover:"none",border:"none",cursor:"pointer",color:T.textSec,padding:8,borderRadius:T.radiusSm,display:"flex",transition:"all 0.15s"}}>
              <Ic.More />
            </button>
            {moreMenuOpen&&(
              <div style={{position:"absolute",top:"100%",right:0,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:T.radius,boxShadow:T.shadow,minWidth:200,zIndex:200,animation:"popIn 0.15s ease",overflow:"hidden"}}>
                {[
                  {icon:<Ic.Starred />,label:"Starred Messages",fn:()=>{setShowStarred(true);setMoreMenu(false);}},
                  {icon:<Ic.Archive />,label:"Archive Chat",     fn:()=>setMoreMenu(false)},
                  {icon:<Ic.Unread />, label:"Mark as Unread",   fn:()=>setMoreMenu(false)},
                  {icon:<Ic.Clear />,  label:"Clear Messages",   fn:()=>{setConfirmClear(true);setMoreMenu(false);}},
                ].map(({icon,label,fn})=>(
                  <button key={label} onClick={fn}
                    style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:"none",border:"none",padding:"11px 16px",cursor:"pointer",textAlign:"left",color:T.text,fontSize:13,fontWeight:600,transition:"background 0.12s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=T.bgHover}
                    onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    <span style={{color:T.textMuted,display:"flex"}}>{icon}</span>{label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen&&(
        <div style={{background:T.bgCard,borderBottom:`1px solid ${T.border}`,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,animation:"slideDown 0.18s ease"}}>
          <span style={{color:T.textMuted}}><Ic.Search /></span>
          <input autoFocus value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search in chat…"
            style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.radius,padding:"7px 14px",fontSize:13,outline:"none",color:T.text}} />
          {searchQuery&&<span style={{color:T.textMuted,fontSize:12,whiteSpace:"nowrap"}}>{searchMatches.length===0?"No results":`${searchIndex+1}/${searchMatches.length}`}</span>}
          <button onClick={searchNext} disabled={!searchMatches.length} style={{background:"none",border:"none",cursor:"pointer",color:searchMatches.length?T.textSec:T.textMuted,fontSize:14}}>▲</button>
          <button onClick={searchPrev} disabled={!searchMatches.length} style={{background:"none",border:"none",cursor:"pointer",color:searchMatches.length?T.textSec:T.textMuted,fontSize:14}}>▼</button>
          <button onClick={()=>{setSearchOpen(false);setSearchQuery("");}} style={{background:"none",border:"none",cursor:"pointer",color:T.textSec,display:"flex"}}><Ic.Close /></button>
        </div>
      )}

      {showPinned&&<PinnedBar messages={messages} onClose={()=>setShowPinned(false)} />}

      {/* Profile panel */}
      {showProfile&&(
        <div style={{position:"absolute",top:62,right:0,width:290,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:`0 0 0 ${T.radius}`,zIndex:50,boxShadow:T.shadow,animation:"slideDown 0.2s ease",padding:20}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,marginBottom:16}}>
            <Avatar name={displayUser?.name||"?"} photoURL={displayUser?.photoURL} size={76} online={isOnline} />
            <div style={{color:T.text,fontWeight:800,fontSize:17}}>{displayUser?.name}</div>
            <div style={{color:isOnline?T.green:T.textMuted,fontSize:12,fontWeight:600}}>{isOnline?"● Online":formatLastSeen(displayUser?.lastSeen)}</div>
          </div>
          {displayUser?.bio&&<div style={{background:T.bg,borderRadius:T.radiusSm,padding:"10px 12px",fontSize:13,color:T.textSec,fontStyle:"italic",marginBottom:14}}>"{displayUser.bio}"</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setConfirmClear(true);setShowProfile(false);}} style={{flex:1,padding:"9px",borderRadius:T.radiusSm,background:"rgba(255,71,87,0.08)",border:`1px solid rgba(255,71,87,0.25)`,color:T.danger,cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <Ic.Clear /> Clear Chat
            </button>
            <button onClick={()=>setShowProfile(false)} style={{flex:1,padding:"9px",borderRadius:T.radiusSm,background:T.bgHover,border:`1px solid ${T.border}`,color:T.textSec,cursor:"pointer",fontSize:13,fontWeight:600}}>Close</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={containerRef} style={{flex:1,overflowY:"auto",padding:"8px 0",background:T.bg}}>
        {grouped.length===0&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12,opacity:0.45,paddingTop:60}}>
            <div style={{fontSize:44}}>👋</div>
            <div style={{color:T.textMuted,fontSize:14,fontWeight:600}}>Say hello to {displayUser?.name}</div>
          </div>
        )}
        {grouped.map((item,i)=>
          item.type==="date"?<DateDivider key={i} label={item.label} />:(
            <div id={`msg-${item.msg.id}`} key={item.msg.id} style={{background:searchQuery&&item.msg.id===currentMatchId?"rgba(0,208,132,0.06)":"transparent",transition:"background 0.5s"}}>
              <Bubble
                msg={item.msg}
                isMine={item.msg.senderId===currentUser?.uid}
                senderName={userCache[item.msg.senderId]?.name}
                deletedIds={deletedIds} allMessages={messages}
                isHighlighted={!!(searchQuery&&item.msg.id===currentMatchId)}
                isStarred={starredIds.has(item.msg.id)}
                onMediaClick={(src,type)=>setMediaPreview({src,type})}
                onContextMenu={(x,y)=>setContextMenu({msgId:item.msg.id,msgText:item.msg.text,msgType:item.msg.type,x,y,isMine:item.msg.senderId===currentUser?.uid})}
              />
            </div>
          )
        )}
        {isTypingOther&&(
          <div style={{display:"flex",justifyContent:"flex-start",padding:"4px 12px"}}>
            <div style={{background:T.msgIn,borderRadius:"18px 18px 18px 4px",padding:"12px 16px",border:`1px solid ${T.border}`,display:"flex",gap:4}}><TypingDots /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showScrollBtn&&(
        <div style={{position:"relative"}}>
          <button onClick={()=>bottomRef.current?.scrollIntoView({behavior:"smooth"})}
            style={{position:"absolute",bottom:84,right:16,width:42,height:42,borderRadius:"50%",background:T.bgCard,border:`1px solid ${T.border}`,cursor:"pointer",boxShadow:T.shadow,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:T.textSec,zIndex:10}}
            onMouseEnter={e=>e.currentTarget.style.background=T.bgHover}
            onMouseLeave={e=>e.currentTarget.style.background=T.bgCard}>
            ↓
          </button>
        </div>
      )}

      {uploadProgress!==null&&<UploadProgress progress={uploadProgress} onCancel={uploadCancel} />}
      <EditBar editingMsg={editingMsg} onCancel={()=>{setEditingMsg(null);setText("");}} />
      <ReplyBar replyTo={replyTo} onCancel={()=>setReplyTo(null)} />

      {/* Input */}
      <div style={{flexShrink:0}}>
        <input ref={fileInputRef} type="file" hidden accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={e=>{if(e.target.files?.[0])handleFileUpload(e.target.files[0]);e.target.value="";}} />
        {isRecording?(
          <div style={{display:"flex",alignItems:"center",padding:"10px 14px",gap:12,background:T.bgCard,borderTop:`1px solid ${T.border}`}}>
            <button onClick={cancelRecording} style={{background:"none",border:"none",cursor:"pointer",color:T.danger,fontSize:20,fontWeight:700}}>✕</button>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:9,height:9,borderRadius:"50%",background:T.danger,animation:"pulse 1s infinite"}} />
              <span style={{color:T.text,fontSize:14,fontWeight:600}}>Recording · {formatVoiceDur(recDuration)}</span>
            </div>
            <button onClick={stopRecording} style={{width:44,height:44,borderRadius:"50%",background:T.green,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}>
              <Ic.Send />
            </button>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",padding:"8px 10px",gap:6,background:T.bgCard,borderTop:`1px solid ${T.border}`,position:"relative"}}>
            {showEmoji&&<EmojiPicker onSelect={e=>{const v=text+e;setText(v);if(chat?.id){DraftStore.set(chat.id,v);onDraftChange?.(chat.id,v);}setShowEmoji(false);setTimeout(()=>inputRef.current?.focus(),0);}} onClose={()=>setShowEmoji(false)} />}
            <button onClick={e=>{e.stopPropagation();setShowEmoji(s=>!s);}}
              style={{background:showEmoji?T.greenGlow:"none",border:"none",color:showEmoji?T.green:T.textMuted,fontSize:22,cursor:"pointer",padding:6,borderRadius:T.radiusSm,flexShrink:0,transition:"all 0.15s"}}>
              😊
            </button>
            <button onClick={()=>fileInputRef.current?.click()}
              style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",padding:6,borderRadius:T.radiusSm,flexShrink:0,display:"flex",transition:"color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.color=T.textSec} onMouseLeave={e=>e.currentTarget.style.color=T.textMuted}>
              <Ic.Attach />
            </button>
            <input ref={inputRef} value={text} onChange={e=>handleTyping(e.target.value)} onKeyDown={handleKey}
              placeholder={editingMsg?"Edit message…":replyTo?"Type a reply…":"Message…"}
              style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:T.radiusLg,padding:"10px 16px",color:T.text,fontSize:14,outline:"none",minWidth:0,transition:"border-color 0.15s"}}
              onFocus={e=>e.target.style.borderColor=T.green} onBlur={e=>e.target.style.borderColor=T.border} />
            {text.trim()?(
              <button onClick={sendMessage}
                style={{width:44,height:44,borderRadius:"50%",background:T.green,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0,transition:"transform 0.12s"}}
                onMouseEnter={e=>e.currentTarget.style.transform="scale(1.08)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                <Ic.Send />
              </button>
            ):(
              <button onMouseDown={startRecording}
                style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,padding:6,flexShrink:0,display:"flex",transition:"color 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.color=T.green} onMouseLeave={e=>e.currentTarget.style.color=T.textMuted}>
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
  const [chats,             setChats            ] = useState([]);
  const [activeChat,        setActiveChat       ] = useState(null);
  const [currentUser,       setCurrentUser      ] = useState(null);
  const [isMobile,          setIsMobile         ] = useState(false);
  const [typingMap,         setTypingMap        ] = useState({});
  const [toasts,            setToasts           ] = useState([]);
  const [statuses,          setStatuses         ] = useState([]);
  const [statusView,        setStatusView       ] = useState(null); // {list, idx}
  const [composingStatus,   setComposingStatus  ] = useState(false);
  const [notifBar,          setNotifBar         ] = useState(false);
  const [drafts,            setDrafts           ] = useState({});
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(null);

  const toastTimers     = useRef({});
  const typingUnsubsRef = useRef({});

  const addToast=useCallback((t)=>{
    setToasts(p=>[...p.slice(-4),t]);
    const tid=setTimeout(()=>removeToast(t.id),5000);
    toastTimers.current[t.id]=tid;
  },[]);
  const removeToast=useCallback((id)=>{
    clearTimeout(toastTimers.current[id]);
    delete toastTimers.current[id];
    setToasts(p=>p.filter(t=>t.id!==id));
  },[]);

  useEffect(()=>{return()=>Object.values(toastTimers.current).forEach(clearTimeout);},[]);

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    check(); window.addEventListener("resize",check); return()=>window.removeEventListener("resize",check);
  },[]);

  useEffect(()=>{
    if(!("Notification" in window)) return;
    if(Notification.permission==="default") setTimeout(()=>setNotifBar(true),2500);
  },[]);

  useEffect(()=>{
    return auth.onAuthStateChanged(async user=>{
      if(!user) return;
      const uDoc=await getDoc(doc(db,"users",user.uid));
      setCurrentUser({uid:user.uid,...(uDoc.exists()?uDoc.data():{})});
      updateDoc(doc(db,"users",user.uid),{online:true}).catch(()=>{});
      try{
        const loadedDrafts={};
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if(k?.startsWith("draft_")){loadedDrafts[k.replace("draft_","")]=localStorage.getItem(k)||"";}
        }
        setDrafts(loadedDrafts);
      }catch{}
    });
  },[]);

  useEffect(()=>{
    if(!currentUser) return;
    const q=query(collection(db,"chats"),where("participants","array-contains",currentUser.uid));
    return onSnapshot(q,async snap=>{
      const list=await Promise.all(snap.docs.map(async d=>{
        const data={id:d.id,...d.data()};
        const otherId=data.participants?.find(p=>p!==currentUser.uid);
        let otherUser=null;
        if(otherId){const ud=await getDoc(doc(db,"users",otherId));if(ud.exists())otherUser={id:otherId,...ud.data()};}
        const msgQ=query(collection(db,"messages"),where("chatId","==",d.id),orderBy("createdAt","desc"),limit(1));
        const msgSnap=await getDocs(msgQ); const lastMsg=msgSnap.docs[0]?.data();
        const unreadQ=query(collection(db,"messages"),where("chatId","==",d.id),where("senderId","!=",currentUser.uid),where("read","==",false));
        const unreadSnap=await getDocs(unreadQ);
        return {...data,otherUser,lastMessage:lastMsg?.text||data.lastMessage||"",lastMessageTime:lastMsg?.createdAt||data.lastMessageTime||data.createdAt,unreadCount:unreadSnap.size};
      }));
      list.sort((a,b)=>(b.lastMessageTime?.seconds||0)-(a.lastMessageTime?.seconds||0));
      setChats(list);
    });
  },[currentUser]);

  useEffect(()=>{
    if(!currentUser) return;
    const cutoff=new Date(Date.now()-86400000);
    const q=query(collection(db,"statuses"),where("createdAt",">=",cutoff),orderBy("createdAt","desc"));
    return onSnapshot(q,snap=>setStatuses(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[currentUser]);

  useEffect(()=>{
    if(!currentUser) return;
    const ids=new Set(chats.map(c=>c.id).filter(Boolean));
    Object.keys(typingUnsubsRef.current).forEach(id=>{
      if(!ids.has(id)){typingUnsubsRef.current[id]?.();delete typingUnsubsRef.current[id];}
    });
    chats.forEach(chat=>{
      if(!chat.id||!chat.otherUser?.id||typingUnsubsRef.current[chat.id]) return;
      const ref=doc(db,"chats",chat.id,"typing",chat.otherUser.id);
      typingUnsubsRef.current[chat.id]=onSnapshot(ref,snap=>{
        if(snap.exists()){const age=Date.now()-(snap.data().updatedAt?.toMillis?.()||0);setTypingMap(p=>({...p,[chat.id]:age<5000}));}
        else setTypingMap(p=>({...p,[chat.id]:false}));
      },()=>{});
    });
    return()=>{Object.values(typingUnsubsRef.current).forEach(u=>u?.());typingUnsubsRef.current={};};
  },[chats,currentUser]);

  const handleDraftChange=useCallback((chatId,text)=>{ setDrafts(p=>({...p,[chatId]:text})); },[]);

  const handleClearMessages=useCallback(async(chatId)=>{
    try{
      const snap=await getDocs(query(collection(db,"messages"),where("chatId","==",chatId)));
      const batch=writeBatch(db); snap.docs.forEach(d=>batch.delete(d.ref));
      await batch.commit();
      await updateDoc(doc(db,"chats",chatId),{lastMessage:"",lastMessageTime:serverTimestamp()}).catch(()=>{});
      DraftStore.remove(chatId); setDrafts(p=>{const n={...p};delete n[chatId];return n;});
      addToast({id:Date.now(),icon:"🗑️",title:"Messages Cleared",body:"All messages deleted",color:T.warn});
    }catch(err){ addToast({id:Date.now(),icon:"❌",title:"Error",body:err.message,color:T.danger}); }
  },[addToast]);

  const handleDeleteChat=useCallback((chatId)=>{ setConfirmDeleteChat(chatId); },[]);

  const confirmDeleteChatAction=useCallback(async()=>{
    const chatId=confirmDeleteChat; if(!chatId) return;
    try{
      const msgSnap=await getDocs(query(collection(db,"messages"),where("chatId","==",chatId)));
      const batch=writeBatch(db); msgSnap.docs.forEach(d=>batch.delete(d.ref));
      const typSnap=await getDocs(collection(db,"chats",chatId,"typing")).catch(()=>({docs:[]}));
      typSnap.docs.forEach(d=>batch.delete(d.ref));
      batch.delete(doc(db,"chats",chatId));
      await batch.commit();
      DraftStore.remove(chatId); setDrafts(p=>{const n={...p};delete n[chatId];return n;});
      if(activeChat?.id===chatId) setActiveChat(null);
      setConfirmDeleteChat(null);
      addToast({id:Date.now(),icon:"🗑️",title:"Chat Deleted",body:"Chat removed",color:T.warn});
    }catch(err){ addToast({id:Date.now(),icon:"❌",title:"Error",body:err.message,color:T.danger}); setConfirmDeleteChat(null); }
  },[confirmDeleteChat,activeChat,addToast]);

  const handleSelectChat=(chat)=>{ setActiveChat(chat); setChats(p=>p.map(c=>c.id===chat.id?{...c,unreadCount:0}:c)); };
  const handleBack=useCallback(()=>{ if(onBackToDashboard)onBackToDashboard(); else router.back(); },[onBackToDashboard,router]);

  const showSidebar=!isMobile||!activeChat;
  const showChat   =!isMobile||!!activeChat;

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}
        ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.2);}
        @keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:0.35}30%{transform:translateY(-6px);opacity:1}}
        @keyframes popIn{from{transform:scale(0.9);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes slideDown{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes toastIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
        @keyframes ripple{0%{transform:translate(-50%,-50%) scale(0.7);opacity:0.6}100%{transform:translate(-50%,-50%) scale(2.2);opacity:0}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}
        @media(max-width:767px){input,textarea,select{font-size:16px!important}}
      `}</style>

      {confirmDeleteChat&&(
        <ConfirmDialog title="Delete Chat?" body="Permanently delete chat and all messages? Cannot be undone." confirmLabel="Delete Chat" dangerConfirm onConfirm={confirmDeleteChatAction} onCancel={()=>setConfirmDeleteChat(null)} />
      )}

      {notifBar&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:T.bgCard,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:T.shadowSm,borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:20}}>🔔</div>
          <div style={{flex:1}}>
            <div style={{color:T.text,fontWeight:700,fontSize:13}}>Enable notifications</div>
            <div style={{color:T.textMuted,fontSize:11}}>Get notified for messages and calls</div>
          </div>
          <button onClick={async()=>{setNotifBar(false);await Notification.requestPermission();}} style={{background:T.green,color:"#fff",border:"none",borderRadius:20,padding:"6px 16px",fontWeight:700,fontSize:12,cursor:"pointer"}}>Enable</button>
          <button onClick={()=>setNotifBar(false)} style={{background:"none",color:T.textMuted,border:`1px solid ${T.border}`,borderRadius:20,padding:"6px 12px",fontWeight:600,fontSize:12,cursor:"pointer"}}>Later</button>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {statusView&&(
        <StatusViewer
          statuses={statusView.list}
          initialIndex={statusView.idx}
          currentUser={currentUser}
          onClose={()=>setStatusView(null)}
          onAddMore={()=>{setStatusView(null);setComposingStatus(true);}}
        />
      )}
      {composingStatus&&<StatusComposer currentUser={currentUser} onClose={()=>setComposingStatus(false)} addToast={addToast} />}

      <div style={{display:"flex",height:"100vh",width:"100vw",overflow:"hidden",background:T.bg,fontFamily:"system-ui,-apple-system,sans-serif"}}>
        {showSidebar&&(
          <Sidebar
            chats={chats} currentUser={currentUser} onSelectChat={handleSelectChat}
            activeChatId={activeChat?.id} isMobile={isMobile}
            onBackToDashboard={handleBack} typingMap={typingMap}
            statuses={statuses}
            onViewStatuses={(list,idx)=>setStatusView({list,idx})}
            onComposeStatus={()=>setComposingStatus(true)}
            onClearMessages={handleClearMessages}
            onDeleteChat={handleDeleteChat}
            drafts={drafts}
          />
        )}
        {showChat&&(
          activeChat
            ? <div style={{flex:1,display:"flex",minWidth:0,overflow:"hidden"}}>
                <ChatPanel
                  key={activeChat.id}
                  chat={activeChat} currentUser={currentUser} isMobile={isMobile}
                  onClose={()=>setActiveChat(null)} addToast={addToast} allChats={chats}
                  onDraftChange={handleDraftChange}
                />
              </div>
            : !isMobile&&(
              <div style={{flex:1,background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18}}>
                <div style={{width:96,height:96,borderRadius:"50%",background:T.bgCard,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,boxShadow:T.shadow}}>💬</div>
                <div style={{textAlign:"center"}}>
                  <div style={{color:T.text,fontSize:22,fontWeight:800}}>Open a conversation</div>
                  <div style={{color:T.textMuted,fontSize:13,marginTop:6}}>Select from sidebar or search for someone</div>
                </div>
                <div style={{fontSize:12,color:T.textMuted,display:"flex",alignItems:"center",gap:6}}>
                  <span>🔒</span> End-to-end encrypted
                </div>
              </div>
            )
        )}
      </div>
    </>
  );
}
