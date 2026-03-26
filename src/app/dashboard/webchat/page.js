"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, orderBy, getDocs, doc, getDoc,
  updateDoc, setDoc, deleteDoc, limit,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
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

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const EMOJI_LIST = ["❤️", "😂", "😮", "😢", "🙏", "👍"];

// ════════════════════════════════════════════════════════════
//  NOTIFICATION SYSTEM
// ════════════════════════════════════════════════════════════
const playNotifSound = (type = "message") => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "call") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(480, ctx.currentTime);
      osc.frequency.setValueAtTime(520, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
    }
  } catch (_) {}
};

let _swReg = null;

const registerSW = async () => {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw-notifications.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    try {
      const swCode = [
        'self.addEventListener("install",()=>self.skipWaiting());',
        'self.addEventListener("activate",e=>e.waitUntil(clients.claim()));',
        'self.addEventListener("notificationclick",e=>{',
        '  e.notification.close();',
        '  e.waitUntil(clients.matchAll({type:"window"}).then(cs=>{',
        '    const c=cs.find(x=>"focus"in x);',
        '    if(c)return c.focus();',
        '    return clients.openWindow("/");',
        '  }));',
        '});',
      ].join("\n");
      const blob = new Blob([swCode], { type: "application/javascript" });
      const reg2 = await navigator.serviceWorker.register(URL.createObjectURL(blob));
      return reg2;
    } catch { return null; }
  }
};

const askNotificationPermission = async () => {
  if (!("Notification" in window)) return false;
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm === "granted" && !_swReg) _swReg = await registerSW();
  return perm === "granted";
};

const sendBrowserNotification = (title, body, options = {}) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  playNotifSound(options.sound || "message");
  const isCall = options.requireInteraction;
  const notifOpts = {
    body, icon: options.icon || "/icon-192.png", badge: "/favicon.ico",
    tag: options.tag || "chat-msg", requireInteraction: isCall || false,
    silent: false, vibrate: isCall ? [400, 200, 400, 200, 400] : [200, 100, 200],
    data: options.data || {}, timestamp: Date.now(),
  };
  if (_swReg) {
    _swReg.showNotification(title, notifOpts).catch(() => {
      const n = new Notification(title, notifOpts);
      if (!isCall) setTimeout(() => n.close(), 6000);
    });
    return;
  }
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "SHOW_NOTIFICATION", title, body, options: notifOpts });
    return;
  }
  try {
    const n = new Notification(title, notifOpts);
    if (!isCall) setTimeout(() => n.close(), 6000);
  } catch {}
};

// ════════════════════════════════════════════════════════════
//  ICONS (SVG)
// ════════════════════════════════════════════════════════════
const BackIcon    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
const SearchIcon  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const CloseIcon   = ({ s = 18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const VideoIcon   = ({ s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>;
const PhoneIcon   = ({ s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>;
const EndCallIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>;
const MicIcon     = ({ muted }) => muted
  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
  : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>;
const CamIcon     = ({ off }) => off
  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4-4-14.5 14.5 2 2L8 15.5V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.5l-1-1zM16 13.85L8.15 6H16v7.85zM3 7v10a1 1 0 0 0 1 1h1.85l-2-2H4V7.85l-1-1V7z"/></svg>
  : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>;
const SpeakerIcon = ({ off }) => off
  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
  : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>;
const FlipCamIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-5 11.5V14H9v2.5L5.5 13 9 9.5V12h6V9.5l3.5 3.5-3.5 3.5z"/></svg>;
const ReplyIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>;
const ForwardIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>;
const EditIcon    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>;
const DeleteIcon  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>;
const CopyIcon    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>;
const SendIcon    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>;

// ════════════════════════════════════════════════════════════
//  AVATAR
// ════════════════════════════════════════════════════════════
function Avatar({ name = "?", photoURL = null, size = 40, online = false }) {
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#aebac1","#FF6B6B","#6C5CE7"];
  const color  = colors[(name.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {photoURL
        ? <img src={photoURL} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
        : <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${color}, ${color}bb)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: size * 0.4, fontFamily: "'Nunito', sans-serif" }}>
            {name.charAt(0).toUpperCase()}
          </div>
      }
      {online && <div style={{ position: "absolute", bottom: 2, right: 2, width: size * 0.27, height: size * 0.27, borderRadius: "50%", background: "#25D366", border: "2px solid #fff" }} />}
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {[0,1,2].map(i => <span key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#25D366", display:"inline-block", animation:`typingBounce 1.2s ${i*0.2}s infinite ease-in-out` }} />)}
    </span>
  );
}

// ════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={{ position:"fixed", top:16, right:16, zIndex:9990, display:"flex", flexDirection:"column", gap:8, maxWidth:340, pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => onDismiss(t.id)}
          style={{ background:"#fff", borderRadius:14, padding:"12px 14px", boxShadow:"0 6px 24px rgba(0,0,0,0.18)", display:"flex", alignItems:"center", gap:12, cursor:"pointer", borderLeft:`4px solid ${t.color||"#25D366"}`, animation:"slideInRight 0.28s ease", pointerEvents:"all" }}>
          <div style={{ fontSize:22, flexShrink:0 }}>{t.icon || "💬"}</div>
          <div style={{ flex:1, overflow:"hidden" }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#111b21", fontFamily:"'Nunito', sans-serif" }}>{t.title}</div>
            <div style={{ fontSize:12, color:"#8696a0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.body}</div>
          </div>
          <button onClick={e => { e.stopPropagation(); onDismiss(t.id); }}
            style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", padding:2 }}>
            <CloseIcon s={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  CONTEXT MENU — with Reply, Forward, Edit, Copy, Delete
// ════════════════════════════════════════════════════════════
function ContextMenu({ x, y, isMine, msgId, msgText, onDelete, onReact, onReply, onForward, onEdit, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", fn);
    document.addEventListener("touchstart", fn);
    return () => { document.removeEventListener("mousedown", fn); document.removeEventListener("touchstart", fn); };
  }, [onClose]);

  // Adjust position so menu doesn't overflow screen
  const [pos, setPos] = useState({ top: y, left: x });
  useEffect(() => {
    const menuH = 280, menuW = 200;
    const top  = Math.min(y, window.innerHeight - menuH - 10);
    const left = Math.min(x, window.innerWidth  - menuW - 10);
    setPos({ top: Math.max(top, 10), left: Math.max(left, 10) });
  }, [x, y]);

  return (
    <div ref={ref} style={{ position:"fixed", top:pos.top, left:pos.left, background:"#fff", borderRadius:14, boxShadow:"0 4px 28px rgba(0,0,0,0.2)", zIndex:2000, overflow:"hidden", minWidth:190, animation:"menuPop 0.15s ease" }}>
      {/* Emoji reactions */}
      <div style={{ display:"flex", gap:2, padding:"10px 10px 8px", borderBottom:"1px solid #f0f2f5" }}>
        {EMOJI_LIST.map(emoji => (
          <button key={emoji} onClick={() => { onReact(emoji); onClose(); }}
            style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", borderRadius:8, padding:"2px 4px", transition:"transform 0.1s" }}
            onMouseEnter={e => e.currentTarget.style.transform="scale(1.35)"}
            onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}>
            {emoji}
          </button>
        ))}
      </div>
      {/* Actions */}
      {[
        { label:"Reply",   icon:<ReplyIcon />,   action: () => { onReply(); onClose(); }, show: true },
        { label:"Forward", icon:<ForwardIcon />, action: () => { onForward(); onClose(); }, show: true },
        { label:"Copy",    icon:<CopyIcon />,    action: () => { navigator.clipboard?.writeText(msgText || ""); onClose(); }, show: !!(msgText) },
        { label:"Edit",    icon:<EditIcon />,    action: () => { onEdit(); onClose(); }, show: isMine && !!(msgText) },
        { label:"Delete",  icon:<DeleteIcon />,  action: () => { onDelete(); onClose(); }, danger: true, show: isMine },
      ].filter(a => a.show).map(({ label, icon, danger, action }) => (
        <button key={label} onClick={action}
          style={{ display:"flex", alignItems:"center", gap:12, width:"100%", background:"none", border:"none", padding:"11px 16px", cursor:"pointer", textAlign:"left", color: danger?"#ef4444":"#111b21", fontSize:14, fontFamily:"'Nunito', sans-serif", transition:"background 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.background="#f0f2f5"}
          onMouseLeave={e => e.currentTarget.style.background="none"}>
          <span style={{ color: danger?"#ef4444":"#8696a0", display:"flex", alignItems:"center" }}>{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  CALL LOG BUBBLE
// ════════════════════════════════════════════════════════════
function CallLogBubble({ msg, isMine }) {
  const missed   = msg.callStatus === "missed";
  const callType = msg.callType === "video" ? "Video" : "Audio";
  const color    = missed ? "#ef4444" : "#25D366";
  const label    = missed ? `Missed ${callType} Call` : `${callType} Call`;
  const sub      = isMine
    ? (missed ? "Not answered" : `Duration: ${msg.callDuration || "0:00"}`)
    : (missed ? "Tap to call back" : `Duration: ${msg.callDuration || "0:00"}`);
  return (
    <div style={{ display:"flex", justifyContent: isMine?"flex-end":"flex-start", padding:"4px 10px", marginBottom:3 }}>
      <div style={{ background: isMine?"#d9fdd3":"#fff", borderRadius:14, padding:"10px 14px", boxShadow:"0 1px 2px rgba(0,0,0,0.1)", display:"flex", alignItems:"center", gap:10, minWidth:200 }}>
        <div style={{ width:38, height:38, borderRadius:"50%", background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
          {missed ? "📵" : (callType === "Video" ? "📹" : "📞")}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700, color, fontFamily:"'Nunito', sans-serif" }}>{label}</div>
          <div style={{ fontSize:11.5, color:"#8696a0", fontFamily:"'Nunito', sans-serif", marginTop:2 }}>{sub}</div>
        </div>
        <span style={{ fontSize:11, color:"#8696a0" }}>{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  INCOMING CALL SCREEN
// ════════════════════════════════════════════════════════════
function IncomingCallScreen({ callerName, callerPhoto, callType, onAccept, onReject }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:3000, background:"linear-gradient(160deg,#0a1628 0%,#0d2137 50%,#0a1628 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:24 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ position:"absolute", top:"30%", left:"50%", transform:"translate(-50%,-50%)", width:80+i*40, height:80+i*40, borderRadius:"50%", border:"2px solid rgba(37,211,102,0.25)", animation:`ripple 2s ${i*0.4}s infinite ease-out`, pointerEvents:"none" }} />
      ))}
      <div style={{ zIndex:1, position:"relative", marginBottom:8 }}><Avatar name={callerName} photoURL={callerPhoto} size={96} /></div>
      <div style={{ textAlign:"center", zIndex:1 }}>
        <div style={{ color:"#fff", fontSize:26, fontWeight:700, fontFamily:"'Nunito', sans-serif", marginBottom:6 }}>{callerName}</div>
        <div style={{ color:"#25D366", fontSize:15, letterSpacing:1, fontFamily:"'Nunito', sans-serif" }}>
          Incoming {callType === "video" ? "📹 Video" : "📞 Audio"} Call…
        </div>
      </div>
      <div style={{ display:"flex", gap:56, marginTop:24, zIndex:1 }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
          <button onClick={onReject} style={{ width:64, height:64, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(239,68,68,0.5)", animation:"pulse 1.5s infinite" }}>
            <EndCallIcon />
          </button>
          <span style={{ color:"#aaa", fontSize:12, fontFamily:"'Nunito', sans-serif" }}>Decline</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
          <button onClick={onAccept} style={{ width:64, height:64, borderRadius:"50%", background:"#25D366", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(37,211,102,0.5)", animation:"pulseGreen 1.5s 0.3s infinite" }}>
            {callType === "video" ? <VideoIcon s={26} /> : <PhoneIcon s={26} />}
          </button>
          <span style={{ color:"#aaa", fontSize:12, fontFamily:"'Nunito', sans-serif" }}>Accept</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  CALLING SCREEN (outgoing)
// ════════════════════════════════════════════════════════════
function CallingScreen({ otherUser, callType, onCancel }) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 500);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:3000, background:"linear-gradient(160deg,#0a1628,#0d2137)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ position:"absolute", top:"30%", left:"50%", transform:"translate(-50%,-50%)", width:80+i*40, height:80+i*40, borderRadius:"50%", border:"2px solid rgba(37,211,102,0.2)", animation:`ripple 2.5s ${i*0.5}s infinite ease-out`, pointerEvents:"none" }} />
      ))}
      <div style={{ zIndex:1, position:"relative", marginBottom:8 }}><Avatar name={otherUser?.name || "?"} photoURL={otherUser?.photoURL} size={96} /></div>
      <div style={{ color:"#fff", fontSize:24, fontWeight:700, fontFamily:"'Nunito', sans-serif", zIndex:1 }}>{otherUser?.name}</div>
      <div style={{ color:"#8696a0", fontSize:15, fontFamily:"'Nunito', sans-serif", zIndex:1 }}>{callType === "video" ? "📹 Video" : "📞 Audio"} · Calling{dots}</div>
      <button onClick={onCancel} style={{ marginTop:32, width:64, height:64, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(239,68,68,0.5)", zIndex:1 }}>
        <EndCallIcon />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  VIDEO CALL UI — with back camera flip
// ════════════════════════════════════════════════════════════
function VideoCallUI({ localStream, remoteStream, callDuration, isMuted, isCameraOff, isSpeakerOff, isFrontCam, onToggleMute, onToggleCamera, onToggleSpeaker, onFlipCamera, onEnd, otherUser, callType }) {
  const localRef  = useRef();
  const remoteRef = useRef();
  const [showCtrls, setShowCtrls] = useState(true);
  const ctrlTimer = useRef();
  const isAudio = callType === "audio";

  useEffect(() => { if (localRef.current && localStream) localRef.current.srcObject = localStream; }, [localStream]);
  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      remoteRef.current.srcObject = remoteStream;
      remoteRef.current.muted = !!isSpeakerOff;
    }
  }, [remoteStream, isSpeakerOff]);

  const showControls = () => {
    setShowCtrls(true);
    clearTimeout(ctrlTimer.current);
    ctrlTimer.current = setTimeout(() => setShowCtrls(false), 3500);
  };
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  // ── AUDIO CALL UI ──
  if (isAudio) {
    return (
      <div style={{ position:"fixed", inset:0, zIndex:3000, background:"linear-gradient(160deg,#0a1628,#0d2137)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
        <audio ref={remoteRef} autoPlay style={{ display:"none" }} />
        <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={110} online />
        <div style={{ color:"#fff", fontSize:22, fontWeight:700, fontFamily:"'Nunito', sans-serif", marginTop:8 }}>{otherUser?.name}</div>
        <div style={{ color:"#25D366", fontSize:14, fontFamily:"'Nunito', sans-serif" }}>{fmt(callDuration)}</div>
        <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:32, marginTop:8 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ width:4, borderRadius:2, background:"rgba(37,211,102,0.7)", animation: isMuted ? "none" : `audioWave 1s ${i*0.12}s infinite ease-in-out`, height: isMuted ? 4 : undefined }} />
          ))}
        </div>
        <div style={{ display:"flex", gap:24, marginTop:32, alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <button onClick={onToggleSpeaker} style={{ width:52, height:52, borderRadius:"50%", background: isSpeakerOff?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.2)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>
              <SpeakerIcon off={isSpeakerOff} />
            </button>
            <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:"'Nunito', sans-serif" }}>{isSpeakerOff?"Off":"Speaker"}</span>
          </div>
          <button onClick={onEnd} style={{ width:68, height:68, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 24px rgba(239,68,68,0.6)" }}>
            <EndCallIcon />
          </button>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <button onClick={onToggleMute} style={{ width:52, height:52, borderRadius:"50%", background: isMuted?"#ef4444":"rgba(255,255,255,0.2)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>
              <MicIcon muted={isMuted} />
            </button>
            <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:"'Nunito', sans-serif" }}>{isMuted?"Unmute":"Mute"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onMouseMove={showControls} onClick={showControls}
      style={{ position:"fixed", inset:0, zIndex:3000, background:"#000", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <video ref={remoteRef} autoPlay playsInline style={{ width:"100%", height:"100%", objectFit:"contain", background:"#111" }} />
      {!remoteStream && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, background:"linear-gradient(160deg,#0a1628,#0d2137)" }}>
          <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={100} />
          <div style={{ color:"#fff", fontSize:20, fontWeight:700, fontFamily:"'Nunito', sans-serif" }}>{otherUser?.name}</div>
          <div style={{ color:"#8696a0", fontSize:14, fontFamily:"'Nunito', sans-serif" }}>Connecting…</div>
        </div>
      )}
      {/* PiP local */}
      <div style={{ position:"absolute", bottom:100, right:16, width:110, height:155, borderRadius:16, overflow:"hidden", border:"2px solid rgba(255,255,255,0.3)", boxShadow:"0 4px 20px rgba(0,0,0,0.5)", background:"#222" }}>
        {isCameraOff
          ? <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#1a1a1a" }}><span style={{ fontSize:32 }}>🚫</span></div>
          : <video ref={localRef} autoPlay playsInline muted style={{ width:"100%", height:"100%", objectFit:"cover", transform: isFrontCam ? "scaleX(-1)" : "scaleX(1)" }} />
        }
      </div>
      {/* Top bar */}
      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"20px 20px 16px", background:"linear-gradient(to bottom,rgba(0,0,0,0.6),transparent)", display:"flex", alignItems:"center", justifyContent:"space-between", opacity: showCtrls?1:0, transition:"opacity 0.3s" }}>
        <div>
          <div style={{ color:"#fff", fontWeight:700, fontSize:17, fontFamily:"'Nunito', sans-serif" }}>{otherUser?.name}</div>
          <div style={{ color:"#25D366", fontSize:13, fontFamily:"'Nunito', sans-serif" }}>{fmt(callDuration)}</div>
        </div>
        <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={36} />
      </div>
      {/* Bottom controls */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"16px 0 36px", background:"linear-gradient(to top,rgba(0,0,0,0.7),transparent)", display:"flex", justifyContent:"center", alignItems:"center", gap:16, flexWrap:"wrap", opacity: showCtrls?1:0, transition:"opacity 0.3s" }}>
        {[
          { onClick:onToggleSpeaker, active:!isSpeakerOff, label:isSpeakerOff?"Speaker Off":"Speaker", icon:<SpeakerIcon off={isSpeakerOff} /> },
          { onClick:onToggleMute,    active:!isMuted,       label:isMuted?"Unmute":"Mute",              icon:<MicIcon muted={isMuted} /> },
        ].map(({ onClick, active, label, icon }) => (
          <div key={label} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <button onClick={onClick} style={{ width:48, height:48, borderRadius:"50%", background: active?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", backdropFilter:"blur(4px)", transition:"background 0.2s" }}>{icon}</button>
            <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:"'Nunito', sans-serif" }}>{label}</span>
          </div>
        ))}
        <button onClick={onEnd} style={{ width:64, height:64, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(239,68,68,0.5)" }}><EndCallIcon /></button>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
          <button onClick={onToggleCamera} style={{ width:48, height:48, borderRadius:"50%", background: !isCameraOff?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}><CamIcon off={isCameraOff} /></button>
          <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:"'Nunito', sans-serif" }}>{isCameraOff?"Cam Off":"Cam"}</span>
        </div>
        {/* ✅ Camera flip button */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
          <button onClick={onFlipCamera} style={{ width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,0.2)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}><FlipCamIcon /></button>
          <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:"'Nunito', sans-serif" }}>{isFrontCam?"Back Cam":"Front Cam"}</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  useVideoCall HOOK — with camera flip support
// ════════════════════════════════════════════════════════════
function useVideoCall({ currentUser, chat, addToast }) {
  const [callState,    setCallState   ] = useState("idle");
  const [incomingData, setIncomingData] = useState(null);
  const [localStream,  setLocalStream ] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted,      setIsMuted     ] = useState(false);
  const [isCameraOff,  setIsCameraOff ] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isFrontCam,   setIsFrontCam  ] = useState(true);   // ✅ NEW
  const [callDuration, setCallDuration] = useState(0);

  const pcRef          = useRef(null);
  const roomDocRef     = useRef(null);
  const callStartRef   = useRef(null);
  const localStreamRef = useRef(null);
  const durationIv     = useRef(null);
  const unsubsRef      = useRef([]);
  const callStateRef   = useRef("idle");
  const callTypeRef    = useRef("video");

  useEffect(() => { callStateRef.current = callState; }, [callState]);

  const otherUserId = chat?.otherUser?.id;

  // ── Incoming call listener ──
  useEffect(() => {
    if (!currentUser?.uid) return;
    const signalRef = doc(db, "users", currentUser.uid, "callSignal", "incoming");
    const unsub = onSnapshot(signalRef, async snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === "calling" && callStateRef.current === "idle") {
        setIncomingData(data);
        setCallState("incoming");
        callTypeRef.current = data.callType || "video";
        sendBrowserNotification(
          `📞 Incoming ${data.callType === "video" ? "Video" : "Audio"} Call`,
          `from ${data.callerName || "Someone"}`,
          { requireInteraction: true, tag: "incoming-call", sound: "call", data: { chatId: data.chatId, type: "call" } }
        );
        addToast({ id: Date.now(), icon: data.callType === "video" ? "📹" : "📞", title: `Incoming ${data.callType === "video" ? "Video" : "Audio"} Call`, body: `from ${data.callerName || "Someone"}`, color: "#25D366" });
      } else if (data.status === "ended" && callStateRef.current !== "idle") {
        cleanupCall(false);
      }
    }, err => console.warn("callSignal:", err.code));
    return () => unsub();
  }, [currentUser?.uid]);

  const getMedia = async (type = "video", facingMode = "user") => {
    const constraints = type === "audio"
      ? { video: false, audio: true }
      : { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode }, audio: true };
    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = s; setLocalStream(s); return s;
    } catch {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = s; setLocalStream(s); return s;
      } catch {
        addToast({ id: Date.now(), icon: "⚠️", title: "Permission Denied", body: "Mic/camera access blocked.", color: "#ef4444" });
        throw new Error("No media");
      }
    }
  };

  const buildPC = stream => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    const remote = new MediaStream();
    setRemoteStream(remote);
    pc.ontrack = e => e.streams[0].getTracks().forEach(t => remote.addTrack(t));
    pc.onconnectionstatechange = () => {
      if (["disconnected","failed"].includes(pc.connectionState)) cleanupCall(true, "answered");
    };
    return pc;
  };

  const startCall = useCallback(async (type = "video") => {
    if (!otherUserId || !currentUser?.uid) return;
    callTypeRef.current = type;
    setIsFrontCam(true);
    setCallState("calling");
    try {
      const stream = await getMedia(type, "user");
      const pc     = buildPC(stream);
      pcRef.current = pc;
      const roomRef = await addDoc(collection(db, "rooms"), {
        callerId: currentUser.uid, calleeId: otherUserId,
        chatId: chat?.id, callType: type,
        createdAt: serverTimestamp(), status: "calling",
      });
      roomDocRef.current = roomRef;
      pc.onicecandidate = async e => {
        if (e.candidate) await addDoc(collection(db, "rooms", roomRef.id, "callerCandidates"), e.candidate.toJSON());
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp } });
      await setDoc(doc(db, "users", otherUserId, "callSignal", "incoming"), {
        status: "calling", callerId: currentUser.uid,
        callerName: currentUser.name || "Unknown",
        callerPhoto: currentUser.photoURL || null,
        roomId: roomRef.id, chatId: chat?.id, callType: type,
      });
      const u1 = onSnapshot(roomRef, async snap => {
        const d = snap.data();
        if (d?.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
          setCallState("connected");
          callStartRef.current = Date.now();
          clearInterval(durationIv.current);
          durationIv.current = setInterval(() => setCallDuration(x => x + 1), 1000);
        }
        if (d?.status === "ended") cleanupCall(false, "answered");
      });
      const u2 = onSnapshot(collection(db, "rooms", roomRef.id, "calleeCandidates"), snap => {
        snap.docChanges().forEach(async ch => {
          if (ch.type === "added") await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
        });
      });
      unsubsRef.current = [u1, u2];
    } catch { setCallState("idle"); }
  }, [otherUserId, currentUser, chat]);

  const acceptCall = useCallback(async () => {
    if (!incomingData) return;
    const { roomId, callType } = incomingData;
    callTypeRef.current = callType || "video";
    setIsFrontCam(true);
    setCallState("connected");
    try {
      const stream = await getMedia(callType || "video", "user");
      const pc     = buildPC(stream);
      pcRef.current = pc;
      const roomRef = doc(db, "rooms", roomId);
      roomDocRef.current = roomRef;
      pc.onicecandidate = async e => {
        if (e.candidate) await addDoc(collection(db, "rooms", roomId, "calleeCandidates"), e.candidate.toJSON());
      };
      const snap = await getDoc(roomRef);
      const { offer } = snap.data();
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp }, status: "connected" });
      const u1 = onSnapshot(collection(db, "rooms", roomId, "callerCandidates"), snap => {
        snap.docChanges().forEach(async ch => {
          if (ch.type === "added") await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
        });
      });
      unsubsRef.current = [u1];
      await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
      callStartRef.current = Date.now();
      clearInterval(durationIv.current);
      durationIv.current = setInterval(() => setCallDuration(x => x + 1), 1000);
    } catch { setCallState("idle"); }
  }, [incomingData, currentUser]);

  const rejectCall = useCallback(async () => {
    if (incomingData?.roomId) {
      await updateDoc(doc(db, "rooms", incomingData.roomId), { status: "ended" }).catch(() => {});
      if (chat?.id && currentUser?.uid) {
        await addDoc(collection(db, "messages"), {
          chatId: chat.id, participants: chat.participants,
          senderId: incomingData.callerId,
          type: "call", callType: incomingData.callType || "video",
          callStatus: "missed", callDuration: null,
          createdAt: serverTimestamp(), read: false,
        }).catch(() => {});
      }
    }
    await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
    setCallState("idle"); setIncomingData(null);
  }, [incomingData, currentUser, chat]);

  // ✅ Flip camera — stop current tracks, get new stream, replace tracks in PC
  const flipCamera = useCallback(async () => {
    if (callTypeRef.current === "audio") return;
    const newFacing = isFrontCam ? "environment" : "user";
    try {
      // Stop old video track
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      // Get new stream with new facingMode
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      // Replace track in RTCPeerConnection
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(newVideoTrack);
      }
      // Replace track in local stream
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => localStreamRef.current.removeTrack(t));
        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
      setIsFrontCam(!isFrontCam);
    } catch (err) {
      addToast({ id: Date.now(), icon: "⚠️", title: "Camera Flip Failed", body: "Back camera not available.", color: "#f77f00" });
    }
  }, [isFrontCam, addToast]);

  const cleanupCall = useCallback(async (notify = true, status = "answered") => {
    clearInterval(durationIv.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    unsubsRef.current.forEach(u => u?.());
    unsubsRef.current = [];
    if (notify && roomDocRef.current) {
      await updateDoc(roomDocRef.current, { status: "ended" }).catch(() => {});
    }
    if (notify && otherUserId) {
      await setDoc(doc(db, "users", otherUserId, "callSignal", "incoming"), { status: "ended" }).catch(() => {});
    }
    if (currentUser?.uid) {
      await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
    }
    if (notify && chat?.id) {
      const dur = callStartRef.current ? Math.floor((Date.now() - callStartRef.current)/1000) : 0;
      const mm  = String(Math.floor(dur/60)).padStart(2,"0");
      const ss  = String(dur%60).padStart(2,"0");
      await addDoc(collection(db, "messages"), {
        chatId: chat.id, participants: chat.participants,
        senderId: currentUser.uid, type: "call",
        callType: callTypeRef.current, callStatus: status,
        callDuration: dur > 0 ? `${mm}:${ss}` : null,
        createdAt: serverTimestamp(), read: false,
      }).catch(() => {});
    }
    localStreamRef.current = null;
    roomDocRef.current = null;
    callStartRef.current = null;
    setLocalStream(null); setRemoteStream(null);
    setCallState("idle"); setIncomingData(null);
    setCallDuration(0); setIsMuted(false); setIsCameraOff(false); setIsFrontCam(true);
  }, [otherUserId, currentUser, chat]);

  return {
    callState, incomingData, localStream, remoteStream,
    isMuted, isCameraOff, isSpeakerOff, isFrontCam, callDuration,
    callType: callTypeRef.current,
    startCall, acceptCall, rejectCall,
    endCall:       () => cleanupCall(true, "answered"),
    toggleMute:    () => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setIsMuted(m => !m); },
    toggleCamera:  () => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setIsCameraOff(c => !c); },
    toggleSpeaker: () => setIsSpeakerOff(s => !s),
    flipCamera,
  };
}

// ════════════════════════════════════════════════════════════
//  REPLY PREVIEW BAR (shown above input when replying)
// ════════════════════════════════════════════════════════════
function ReplyPreviewBar({ replyTo, onCancel }) {
  if (!replyTo) return null;
  return (
    <div style={{ background:"#f0f2f5", borderLeft:"4px solid #25D366", padding:"8px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, borderBottom:"1px solid #ddd", animation:"slideDown 0.15s ease" }}>
      <div style={{ flex:1, overflow:"hidden" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#25D366", fontFamily:"'Nunito', sans-serif", marginBottom:2 }}>
          {replyTo.isMine ? "You" : replyTo.senderName || "Them"}
        </div>
        <div style={{ fontSize:12, color:"#8696a0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontFamily:"'Nunito', sans-serif" }}>
          {replyTo.text || "(message)"}
        </div>
      </div>
      <button onClick={onCancel} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", display:"flex", alignItems:"center", padding:4, flexShrink:0 }}>
        <CloseIcon s={18} />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  FORWARD MODAL — pick a chat to forward to
// ════════════════════════════════════════════════════════════
function ForwardModal({ chats, currentUser, msgText, onForward, onClose }) {
  const [selected, setSelected] = useState(null);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:2500, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:18, padding:0, width: Math.min(380, window.innerWidth - 32), maxHeight:"70vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.22)", animation:"menuPop 0.2s ease" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #f0f2f5", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontWeight:700, fontSize:16, color:"#111b21", fontFamily:"'Nunito', sans-serif" }}>Forward Message</span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0" }}><CloseIcon s={20} /></button>
        </div>
        <div style={{ padding:"10px 16px 4px", background:"#f8f9fa", margin:"0 16px 8px", borderRadius:10, fontSize:13, color:"#54656f", fontFamily:"'Nunito', sans-serif", fontStyle:"italic" }}>
          "{msgText?.slice(0,80)}{msgText?.length > 80 ? "…" : ""}"
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {chats.map(c => (
            <div key={c.id} onClick={() => setSelected(c.id === selected ? null : c.id)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px", cursor:"pointer", background: selected === c.id ? "#e8f5e9" : "#fff", borderBottom:"1px solid #f0f2f5", transition:"background 0.15s" }}>
              <Avatar name={c.otherUser?.name || "?"} photoURL={c.otherUser?.photoURL} size={40} />
              <span style={{ fontWeight:600, fontSize:14, color:"#111b21", fontFamily:"'Nunito', sans-serif" }}>{c.otherUser?.name}</span>
              {selected === c.id && <span style={{ marginLeft:"auto", color:"#25D366", fontSize:18 }}>✓</span>}
            </div>
          ))}
        </div>
        <div style={{ padding:"14px 20px", borderTop:"1px solid #f0f2f5" }}>
          <button onClick={() => selected && onForward(selected)} disabled={!selected}
            style={{ width:"100%", padding:"12px", borderRadius:24, background: selected?"#25D366":"#ccc", border:"none", cursor: selected?"pointer":"default", color:"#fff", fontWeight:700, fontSize:15, fontFamily:"'Nunito', sans-serif", transition:"background 0.2s" }}>
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  MESSAGE BUBBLE — with reply preview, edited label, reactions
// ════════════════════════════════════════════════════════════
function Bubble({ msg, isMine, senderName, onContextMenu, deletedIds, allMessages, userCache }) {
  const [hovered, setHovered] = useState(false);
  const isDeleted = deletedIds.has(msg.id);

  if (msg.type === "call") return <CallLogBubble msg={msg} isMine={isMine} />;

  // Find replied-to message
  const replyMsg = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;
  const replySenderName = replyMsg
    ? (replyMsg.senderId === msg.senderId ? (isMine ? "You" : senderName) : (isMine ? senderName : "You"))
    : null;

  return (
    <div style={{ display:"flex", justifyContent: isMine?"flex-end":"flex-start", marginBottom:3, padding:"2px 10px" }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ maxWidth:"72%", position:"relative" }}>
        {/* Context menu trigger */}
        {hovered && !isDeleted && (
          <div style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", [isMine?"left":"right"]:-36, display:"flex", alignItems:"center", animation:"fadeIn 0.15s ease" }}>
            <button onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onContextMenu(r.right, r.top); }}
              style={{ background:"#fff", border:"none", cursor:"pointer", width:28, height:28, borderRadius:"50%", boxShadow:"0 1px 4px rgba(0,0,0,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#54656f" }}>▾</button>
          </div>
        )}
        <div style={{ background: isDeleted?"#f0f2f5":isMine?"#d9fdd3":"#fff", borderRadius: isMine?"18px 18px 4px 18px":"18px 18px 18px 4px", padding:"7px 12px 5px", boxShadow:"0 1px 2px rgba(0,0,0,0.1)" }}>
          {/* Sender name (group or non-mine) */}
          {!isMine && senderName && !isDeleted && (
            <div style={{ color:"#25D366", fontSize:12, fontWeight:700, marginBottom:2, fontFamily:"'Nunito', sans-serif" }}>{senderName}</div>
          )}
          {/* Reply preview inside bubble */}
          {replyMsg && !isDeleted && (
            <div style={{ background: isMine?"rgba(0,0,0,0.06)":"rgba(0,0,0,0.05)", borderLeft:"3px solid #25D366", borderRadius:"8px 8px 0 0", padding:"6px 10px", marginBottom:6, cursor:"default" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#25D366", fontFamily:"'Nunito', sans-serif", marginBottom:2 }}>{replySenderName}</div>
              <div style={{ fontSize:12, color:"#54656f", fontFamily:"'Nunito', sans-serif", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {deletedIds.has(replyMsg.id) ? "🚫 Deleted message" : (replyMsg.text || "(message)")}
              </div>
            </div>
          )}
          {/* Message text */}
          <div style={{ color: isDeleted?"#8696a0":"#111b21", fontSize:14.5, lineHeight:1.45, wordBreak:"break-word", fontFamily:"'Nunito', sans-serif", fontStyle: isDeleted?"italic":"normal" }}>
            {isDeleted ? (isMine ? "🚫 You deleted this message" : "🚫 This message was deleted") : msg.text}
          </div>
          {/* Time + edited + read receipt */}
          <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap:4, marginTop:3 }}>
            {msg.edited && !isDeleted && <span style={{ fontSize:10, color:"#8696a0", fontStyle:"italic" }}>edited</span>}
            <span style={{ color:"#8696a0", fontSize:11 }}>{formatTime(msg.createdAt)}</span>
            {isMine && !isDeleted && <span style={{ fontSize:13, color: msg.read?"#53bdeb":"#8696a0" }}>✓✓</span>}
          </div>
        </div>
        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginTop:3, justifyContent: isMine?"flex-end":"flex-start" }}>
            {Object.entries(Object.values(msg.reactions).reduce((a,e) => { a[e]=(a[e]||0)+1; return a; }, {})).map(([emoji,count]) => (
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
      <div style={{ background:"#fff", color:"#8696a0", fontSize:12, padding:"4px 12px", borderRadius:8, boxShadow:"0 1px 2px rgba(0,0,0,0.08)", fontFamily:"'Nunito', sans-serif" }}>{label}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  CHAT SEARCH BAR
// ════════════════════════════════════════════════════════════
function ChatSearchBar({ value, onChange, onClose, onNext, onPrev, matchCount, currentMatch }) {
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div style={{ background:"#f0f2f5", borderBottom:"1px solid #ddd", padding:"8px 12px", display:"flex", alignItems:"center", gap:10, animation:"slideDown 0.2s ease" }}>
      <SearchIcon />
      <input ref={inputRef} value={value} onChange={e => onChange(e.target.value)} placeholder="Search in chat…"
        style={{ flex:1, background:"#fff", border:"none", borderRadius:20, padding:"8px 14px", fontSize:14, outline:"none", fontFamily:"'Nunito', sans-serif", color:"#111b21" }} />
      {value && <span style={{ color:"#8696a0", fontSize:13, whiteSpace:"nowrap" }}>{matchCount===0?"No results":`${currentMatch+1} / ${matchCount}`}</span>}
      <button onClick={onPrev} disabled={!matchCount} style={{ background:"none", border:"none", cursor: matchCount?"pointer":"default", color: matchCount?"#54656f":"#ccc", fontSize:18, padding:2 }}>▲</button>
      <button onClick={onNext} disabled={!matchCount} style={{ background:"none", border:"none", cursor: matchCount?"pointer":"default", color: matchCount?"#54656f":"#ccc", fontSize:18, padding:2 }}>▼</button>
      <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", display:"flex", alignItems:"center" }}><CloseIcon /></button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  NOTIFICATION BAR
// ════════════════════════════════════════════════════════════
function NotificationBar({ onAllow, onDismiss }) {
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:9999, background:"#075E54", padding:"10px 16px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 2px 8px rgba(0,0,0,0.3)", animation:"slideDown 0.3s ease", fontFamily:"'Nunito', sans-serif" }}>
      <div style={{ fontSize:22, flexShrink:0 }}>🔔</div>
      <div style={{ flex:1 }}>
        <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>Enable notifications</div>
        <div style={{ color:"rgba(255,255,255,0.75)", fontSize:12, marginTop:2 }}>Get notified for new messages and calls</div>
      </div>
      <div style={{ display:"flex", gap:8, flexShrink:0 }}>
        <button onClick={onAllow} style={{ background:"#25D366", color:"#fff", border:"none", borderRadius:20, padding:"7px 18px", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Nunito', sans-serif" }}>Enable</button>
        <button onClick={onDismiss} style={{ background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)", borderRadius:20, padding:"7px 14px", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"'Nunito', sans-serif" }}>Not now</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════════════════════════
function Sidebar({ chats, currentUser, onSelectChat, activeChatId, isMobile, onBackToDashboard, typingMap }) {
  const [search, setSearch]               = useState("");
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (!search) { setSearchResults([]); return; }
    const q = query(collection(db, "users"), where("name", ">=", search), where("name", "<=", search + "\uf8ff"));
    const unsub = onSnapshot(q, snap => {
      setSearchResults(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => u.id !== currentUser?.uid));
    });
    return () => unsub();
  }, [search, currentUser]);

  const list = search ? searchResults : chats.filter(c => c.otherUser?.name?.toLowerCase().includes(search.toLowerCase()));

  const handleUserSelect = async user => {
    const ex = chats.find(c => c.participants?.includes(user.id));
    if (ex) { onSelectChat(ex); setSearch(""); return; }
    const ref = await addDoc(collection(db, "chats"), { participants:[currentUser.uid, user.id], createdAt:serverTimestamp() });
    onSelectChat({ id:ref.id, participants:[currentUser.uid,user.id], otherUser:user, lastMessage:"", lastMessageTime:null });
    setSearch("");
  };

  return (
    <div style={{ width: isMobile?"100%":340, minWidth: isMobile?"unset":280, background:"#fff", display:"flex", flexDirection:"column", borderRight: isMobile?"none":"1px solid #ddd", height:"100%", flexShrink:0 }}>
      <div style={{ padding:"14px 16px", background:"#f0f2f5", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #ddd", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, overflow:"hidden" }}>
          <button onClick={onBackToDashboard} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:4, display:"flex", alignItems:"center", flexShrink:0 }}><BackIcon /></button>
          <Avatar name={currentUser?.name||"Me"} photoURL={currentUser?.photoURL} size={40} online />
          <div style={{ overflow:"hidden" }}>
            <div style={{ color:"#111b21", fontWeight:700, fontSize:15, fontFamily:"'Nunito', sans-serif", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{currentUser?.name||"You"}</div>
            <div style={{ color:"#25D366", fontSize:12 }}>Online</div>
          </div>
        </div>
        <button style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", fontSize:20 }}>⋮</button>
      </div>
      <div style={{ padding:"8px 12px", background:"#fff" }}>
        <div style={{ background:"#f0f2f5", borderRadius:10, display:"flex", alignItems:"center", padding:"7px 12px", gap:8 }}>
          <span style={{ color:"#8696a0", fontSize:15 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or start new chat"
            style={{ background:"none", border:"none", outline:"none", color:"#111b21", flex:1, fontSize:14, fontFamily:"'Nunito', sans-serif" }} />
          {search && <button onClick={() => setSearch("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", display:"flex", alignItems:"center" }}><CloseIcon s={16} /></button>}
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto" }}>
        {list.length === 0 && <div style={{ color:"#8696a0", textAlign:"center", padding:30, fontSize:14 }}>{search?"No users found":"No chats yet"}</div>}
        {list.map(item => {
          const isUser   = !!item.email && !item.otherUser;
          const name     = isUser ? item.name : item.otherUser?.name || "Unknown";
          const isActive = activeChatId === item.id;
          const unread   = !isUser ? item.unreadCount || 0 : 0;
          const isTyping = !isUser && typingMap?.[item.id];
          const lastTime = !isUser && item.lastMessageTime ? formatTime(item.lastMessageTime) : "";
          const sub      = isUser ? item.email : item.lastMessage || "No messages yet";
          return (
            <div key={item.id} onClick={() => isUser ? handleUserSelect(item) : onSelectChat(item)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", cursor:"pointer", background: isActive?"#f0f2f5":"#fff", borderBottom:"1px solid #f0f2f5", transition:"background 0.15s" }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f8f9fa"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "#fff"; }}>
              <Avatar name={name} photoURL={item.photoURL||item.otherUser?.photoURL} size={46} online={item.online||item.otherUser?.online} />
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"#111b21", fontWeight:600, fontSize:15, fontFamily:"'Nunito', sans-serif" }}>{name}</span>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, flexShrink:0 }}>
                    {lastTime && <span style={{ color: unread>0?"#25D366":"#8696a0", fontSize:11 }}>{lastTime}</span>}
                    {unread > 0 && <span style={{ background:"#25D366", color:"#fff", borderRadius:12, minWidth:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, padding:"0 5px" }}>{unread > 99 ? "99+" : unread}</span>}
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

// ════════════════════════════════════════════════════════════
//  CHAT PANEL — full featured
// ════════════════════════════════════════════════════════════
function ChatPanel({ chat, currentUser, onClose, isMobile, addToast, allChats }) {
  const [messages,      setMessages     ] = useState([]);
  const [text,          setText         ] = useState("");
  const [userCache,     setUserCache    ] = useState({});
  const [otherUserData, setOtherUserData] = useState(null);
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [contextMenu,   setContextMenu  ] = useState(null);
  const [deletedIds,    setDeletedIds   ] = useState(new Set());
  const [searchOpen,    setSearchOpen   ] = useState(false);
  const [searchQuery,   setSearchQuery  ] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [searchIndex,   setSearchIndex  ] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [replyTo,       setReplyTo      ] = useState(null);   // ✅ reply state
  const [editingMsg,    setEditingMsg   ] = useState(null);   // ✅ edit state
  const [forwardMsg,    setForwardMsg   ] = useState(null);   // ✅ forward state

  const bottomRef        = useRef();
  const containerRef     = useRef();
  const inputRef         = useRef();
  const typingTimeoutRef = useRef();
  const typingDocRef     = useRef();

  const vc = useVideoCall({ currentUser, chat, addToast });

  // Other user data
  useEffect(() => {
    const id = chat?.otherUser?.id;
    if (!id) return;
    return onSnapshot(doc(db, "users", id), snap => { if (snap.exists()) setOtherUserData({ id, ...snap.data() }); });
  }, [chat?.otherUser?.id]);

  // Messages
  useEffect(() => {
    if (!chat?.id) { setMessages([]); return; }
    typingDocRef.current = doc(db, "chats", chat.id, "typing", currentUser.uid);
    const q = query(collection(db, "messages"), where("chatId", "==", chat.id), orderBy("createdAt"));
    return onSnapshot(q, async snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      setMessages(prev => {
        if (prev.length > 0 && list.length > prev.length) {
          const newest = list[list.length - 1];
          if (newest && newest.senderId !== currentUser.uid && newest.type !== "call") {
            const senderName = otherUserData?.name || "Someone";
            addToast({ id: Date.now(), icon:"💬", title: senderName, body: newest.text, color:"#25D366" });
            sendBrowserNotification(senderName, newest.text, { tag:"new-message" });
          }
        }
        return list;
      });
      list.forEach(async m => {
        if (m.senderId !== currentUser.uid && !m.read) {
          updateDoc(doc(db, "messages", m.id), { read:true }).catch(() => {});
        }
        if (m.senderId && !userCache[m.senderId]) {
          const uDoc = await getDoc(doc(db, "users", m.senderId));
          if (uDoc.exists()) setUserCache(p => ({ ...p, [m.senderId]: uDoc.data() }));
        }
      });
      setDeletedIds(new Set(list.filter(m => m.deleted).map(m => m.id)));
    });
  }, [chat?.id]);

  // Typing
  useEffect(() => {
    const id = chat?.otherUser?.id;
    if (!chat?.id || !id) return;
    return onSnapshot(doc(db, "chats", chat.id, "typing", id), snap => {
      if (snap.exists()) { const age = Date.now() - (snap.data().updatedAt?.toMillis?.() || 0); setIsTypingOther(age < 5000); }
      else setIsTypingOther(false);
    });
  }, [chat?.id, chat?.otherUser?.id]);

  // Auto-scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
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

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchMatches([]); setSearchIndex(0); return; }
    const q = searchQuery.toLowerCase();
    const matches = messages.map((m,i) => ({ i, id:m.id })).filter(({ i }) => messages[i]?.text?.toLowerCase().includes(q));
    setSearchMatches(matches);
    setSearchIndex(matches.length - 1);
  }, [searchQuery, messages]);

  useEffect(() => {
    if (!searchMatches.length) return;
    document.getElementById(`msg-${searchMatches[searchIndex]?.id}`)?.scrollIntoView({ behavior:"smooth", block:"center" });
  }, [searchIndex, searchMatches]);

  const handleTyping = async val => {
    setText(val);
    if (!chat?.id || !typingDocRef.current) return;
    await setDoc(typingDocRef.current, { typing:true, updatedAt:serverTimestamp() }).catch(() => {});
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(async () => { await deleteDoc(typingDocRef.current).catch(() => {}); }, 3000);
  };

  // ✅ Send message — handles normal, reply, edit modes
  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !chat?.id) return;
    clearTimeout(typingTimeoutRef.current);
    if (typingDocRef.current) await deleteDoc(typingDocRef.current).catch(() => {});

    if (editingMsg) {
      // ── EDIT MODE ──
      await updateDoc(doc(db, "messages", editingMsg.id), {
        text: trimmed,
        edited: true,
        editedAt: serverTimestamp(),
      }).catch(() => {});
      setEditingMsg(null);
    } else {
      // ── SEND MODE (with optional reply) ──
      const msgData = {
        chatId:      chat.id,
        participants: chat.participants,
        text:        trimmed,
        senderId:    currentUser.uid,
        createdAt:   serverTimestamp(),
        read:        false,
      };
      if (replyTo) {
        msgData.replyTo       = replyTo.id;
        msgData.replyToText   = replyTo.text;
        msgData.replyToSender = replyTo.senderId;
      }
      await addDoc(collection(db, "messages"), msgData);
      setReplyTo(null);
    }
    setText("");
    inputRef.current?.focus();
  };

  const handleKey = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === "Escape") { setReplyTo(null); setEditingMsg(null); setText(""); }
  };

  const handleDelete = async msgId => {
    setDeletedIds(p => new Set([...p, msgId]));
    await updateDoc(doc(db, "messages", msgId), { deleted:true, text:"" }).catch(() => {});
  };

  const handleReact = async (msgId, emoji) => {
    await updateDoc(doc(db, "messages", msgId), { [`reactions.${currentUser.uid}`]: emoji }).catch(() => {});
  };

  // ✅ Start editing a message
  const handleEdit = (msg) => {
    setEditingMsg(msg);
    setText(msg.text);
    setReplyTo(null);
    setTimeout(() => {
      inputRef.current?.focus();
      const len = msg.text.length;
      inputRef.current?.setSelectionRange(len, len);
    }, 50);
  };

  // ✅ Start replying to a message
  const handleReply = (msg) => {
    setReplyTo({ id:msg.id, text:msg.text, senderId:msg.senderId, isMine: msg.senderId === currentUser.uid, senderName: userCache[msg.senderId]?.name || otherUserData?.name });
    setEditingMsg(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ✅ Forward message to another chat
  const handleForwardConfirm = async (targetChatId) => {
    if (!forwardMsg || !targetChatId) return;
    const targetChat = allChats.find(c => c.id === targetChatId);
    if (!targetChat) return;
    await addDoc(collection(db, "messages"), {
      chatId:      targetChatId,
      participants: targetChat.participants,
      text:        forwardMsg.text,
      senderId:    currentUser.uid,
      createdAt:   serverTimestamp(),
      read:        false,
      forwarded:   true,
    });
    setForwardMsg(null);
    addToast({ id: Date.now(), icon:"↩️", title:"Message Forwarded", body:`Sent to ${targetChat.otherUser?.name}`, color:"#25D366" });
  };

  // Build grouped list
  const grouped = [];
  let lastDate = null;
  messages.forEach(m => {
    const label = m.createdAt ? formatDate(m.createdAt) : null;
    if (label && label !== lastDate) { grouped.push({ type:"date", label }); lastDate = label; }
    grouped.push({ type:"msg", msg:m });
  });

  const displayUser    = otherUserData || chat?.otherUser;
  const isOnline       = displayUser?.online;
  const statusText     = isTypingOther ? null : isOnline ? "Online" : formatLastSeen(displayUser?.lastSeen);
  const currentMatchId = searchMatches[searchIndex]?.id;

  if (!chat) return (
    <div style={{ flex:1, background:"#f0f2f5", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
      <div style={{ fontSize:64 }}>💬</div>
      <div style={{ color:"#8696a0", fontSize:16, fontFamily:"'Nunito', sans-serif" }}>Select a chat to start messaging</div>
    </div>
  );

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", height:"100%", background:"#efeae2", minWidth:0 }}
      onClick={() => contextMenu && setContextMenu(null)}>

      {/* ── Call overlays ── */}
      {vc.callState === "incoming" && (
        <IncomingCallScreen callerName={vc.incomingData?.callerName||"Unknown"} callerPhoto={vc.incomingData?.callerPhoto}
          callType={vc.incomingData?.callType||"video"} onAccept={vc.acceptCall} onReject={vc.rejectCall} />
      )}
      {vc.callState === "calling" && (
        <CallingScreen otherUser={displayUser} callType={vc.callType} onCancel={() => vc.endCall()} />
      )}
      {vc.callState === "connected" && (
        <VideoCallUI localStream={vc.localStream} remoteStream={vc.remoteStream} callDuration={vc.callDuration}
          isMuted={vc.isMuted} isCameraOff={vc.isCameraOff} isSpeakerOff={vc.isSpeakerOff} isFrontCam={vc.isFrontCam}
          onToggleMute={vc.toggleMute} onToggleCamera={vc.toggleCamera} onToggleSpeaker={vc.toggleSpeaker}
          onFlipCamera={vc.flipCamera} onEnd={vc.endCall} otherUser={displayUser} callType={vc.callType} />
      )}

      {/* ── Forward modal ── */}
      {forwardMsg && (
        <ForwardModal chats={allChats.filter(c => c.id !== chat.id)} currentUser={currentUser}
          msgText={forwardMsg.text} onForward={handleForwardConfirm} onClose={() => setForwardMsg(null)} />
      )}

      {/* ── Context menu ── */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} isMine={contextMenu.isMine}
          msgId={contextMenu.msgId} msgText={contextMenu.msgText}
          onDelete={() => handleDelete(contextMenu.msgId)}
          onReact={emoji => handleReact(contextMenu.msgId, emoji)}
          onReply={() => { const m = messages.find(msg => msg.id === contextMenu.msgId); if(m) handleReply(m); }}
          onForward={() => { const m = messages.find(msg => msg.id === contextMenu.msgId); if(m) setForwardMsg(m); }}
          onEdit={() => { const m = messages.find(msg => msg.id === contextMenu.msgId); if(m) handleEdit(m); }}
          onClose={() => setContextMenu(null)} />
      )}

      {/* ── Header ── */}
      <div style={{ background:"#f0f2f5", padding:"10px 16px", display:"flex", alignItems:"center", gap:12, borderBottom:"1px solid #ddd", flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:4, display:"flex", alignItems:"center", flexShrink:0 }}><BackIcon /></button>
        <Avatar name={displayUser?.name||"?"} photoURL={displayUser?.photoURL} size={40} online={isOnline} />
        <div style={{ flex:1, overflow:"hidden" }}>
          <div style={{ color:"#111b21", fontWeight:700, fontSize:15, fontFamily:"'Nunito', sans-serif", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{displayUser?.name||"Unknown"}</div>
          <div style={{ fontSize:12, color: isTypingOther||isOnline?"#25D366":"#8696a0", display:"flex", alignItems:"center", gap:5 }}>
            {isTypingOther ? <><span>typing</span><TypingDots /></> : statusText}
          </div>
        </div>
        <div style={{ display:"flex", gap:4, flexShrink:0, alignItems:"center" }}>
          <button onClick={() => vc.startCall("audio")} title="Audio Call"
            style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:7, borderRadius:8, display:"flex", alignItems:"center", transition:"background 0.15s, color 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background="#e0f7ef"; e.currentTarget.style.color="#00a884"; }}
            onMouseLeave={e => { e.currentTarget.style.background="none"; e.currentTarget.style.color="#54656f"; }}>
            <PhoneIcon s={20} />
          </button>
          <button onClick={() => vc.startCall("video")} title="Video Call"
            style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:7, borderRadius:8, display:"flex", alignItems:"center", transition:"background 0.15s, color 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background="#e0f7ef"; e.currentTarget.style.color="#00a884"; }}
            onMouseLeave={e => { e.currentTarget.style.background="none"; e.currentTarget.style.color="#54656f"; }}>
            <VideoIcon s={22} />
          </button>
          <button onClick={() => { setSearchOpen(s => !s); if (searchOpen) setSearchQuery(""); }}
            style={{ background: searchOpen?"#e0e0e0":"none", border:"none", cursor:"pointer", color:"#54656f", padding:7, borderRadius:8, display:"flex", alignItems:"center" }}>
            <SearchIcon />
          </button>
        </div>
      </div>

      {searchOpen && (
        <ChatSearchBar value={searchQuery} onChange={setSearchQuery}
          onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
          onNext={() => setSearchIndex(i => (i - 1 + searchMatches.length) % searchMatches.length)}
          onPrev={() => setSearchIndex(i => (i + 1) % searchMatches.length)}
          matchCount={searchMatches.length} currentMatch={searchIndex} />
      )}

      {/* ── Messages ── */}
      <div ref={containerRef} style={{ flex:1, overflowY:"auto", padding:"8px 0", position:"relative" }}>
        {grouped.map((item, i) =>
          item.type === "date" ? <DateDivider key={i} label={item.label} /> : (
            <div id={`msg-${item.msg.id}`} key={item.msg.id}
              style={{ background: searchQuery && item.msg.id === currentMatchId ? "rgba(37,211,102,0.12)" : "transparent", transition:"background 0.5s" }}>
              <Bubble
                msg={item.msg}
                isMine={item.msg.senderId === currentUser?.uid}
                senderName={userCache[item.msg.senderId]?.name}
                deletedIds={deletedIds}
                allMessages={messages}
                userCache={userCache}
                onContextMenu={(x, y) => setContextMenu({
                  msgId: item.msg.id,
                  msgText: item.msg.text,
                  x: Math.min(x, window.innerWidth-200),
                  y: Math.min(y, window.innerHeight-320),
                  isMine: item.msg.senderId === currentUser?.uid,
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

      {showScrollBtn && (
        <div style={{ position:"relative" }}>
          <button onClick={() => bottomRef.current?.scrollIntoView({ behavior:"smooth" })}
            style={{ position:"absolute", bottom:80, right:20, width:42, height:42, borderRadius:"50%", background:"#fff", border:"none", cursor:"pointer", boxShadow:"0 2px 12px rgba(0,0,0,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"#54656f", zIndex:10, animation:"fadeIn 0.2s ease" }}>↓</button>
        </div>
      )}

      {/* ── Reply/Edit preview bar ── */}
      {editingMsg && (
        <div style={{ background:"#f0f2f5", borderLeft:"4px solid #34B7F1", padding:"8px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, borderBottom:"1px solid #ddd" }}>
          <div style={{ flex:1, overflow:"hidden" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#34B7F1", fontFamily:"'Nunito', sans-serif", marginBottom:2 }}>Editing message</div>
            <div style={{ fontSize:12, color:"#8696a0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontFamily:"'Nunito', sans-serif" }}>{editingMsg.text}</div>
          </div>
          <button onClick={() => { setEditingMsg(null); setText(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#8696a0", display:"flex", alignItems:"center", padding:4 }}><CloseIcon s={18} /></button>
        </div>
      )}
      <ReplyPreviewBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />

      {/* ── Input bar ── */}
      <div style={{ display:"flex", alignItems:"center", padding:"8px 12px", gap:10, background:"#f0f2f5", borderTop:"1px solid #ddd", flexShrink:0 }}>
        <button style={{ background:"none", border:"none", color:"#8696a0", fontSize:22, cursor:"pointer", padding:4, flexShrink:0 }}>😊</button>
        <button style={{ background:"none", border:"none", color:"#8696a0", fontSize:22, cursor:"pointer", padding:4, flexShrink:0 }}>📎</button>
        <input ref={inputRef} value={text} onChange={e => handleTyping(e.target.value)} onKeyDown={handleKey}
          placeholder={editingMsg ? "Edit message…" : replyTo ? "Type a reply…" : "Type a message"}
          style={{ flex:1, background:"#fff", border:"none", borderRadius:24, padding:"10px 16px", color:"#111b21", fontSize:14.5, outline:"none", fontFamily:"'Nunito', sans-serif", minWidth:0 }} />
        <button onClick={sendMessage} style={{ width:44, height:44, borderRadius:"50%", background: text.trim()?"#00a884":"#8696a0", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, transition:"background 0.2s", flexShrink:0, color:"#fff" }}>
          {text.trim() ? <SendIcon /> : "🎤"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════════
export default function WhatsAppUI({ onBackToDashboard }) {
  const [chats,       setChats      ] = useState([]);
  const [activeChat,  setActiveChat ] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobile,    setIsMobile   ] = useState(false);
  const [typingMap,   setTypingMap  ] = useState({});
  const [toasts,      setToasts     ] = useState([]);
  const [notifBarVisible, setNotifBarVisible] = useState(false);

  const typingUnsubsRef = useRef({});
  const prevMsgCountRef = useRef({});

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      const t = setTimeout(() => setNotifBarVisible(true), 2000);
      return () => clearTimeout(t);
    } else if (Notification.permission === "granted") {
      registerSW().then(reg => { if (reg) _swReg = reg; });
    }
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    return auth.onAuthStateChanged(async user => {
      if (!user) return;
      const uDoc = await getDoc(doc(db, "users", user.uid));
      setCurrentUser({ uid:user.uid, ...(uDoc.exists() ? uDoc.data() : {}) });
      updateDoc(doc(db, "users", user.uid), { online:true }).catch(() => {});
    });
  }, []);

  // Chats listener
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));
    return onSnapshot(q, async snap => {
      const list = await Promise.all(snap.docs.map(async d => {
        const data    = { id:d.id, ...d.data() };
        const otherId = data.participants?.find(p => p !== currentUser.uid);
        let otherUser = null;
        if (otherId) { const uDoc = await getDoc(doc(db, "users", otherId)); if (uDoc.exists()) otherUser = { id:otherId, ...uDoc.data() }; }
        const msgQ    = query(collection(db, "messages"), where("chatId","==",d.id), orderBy("createdAt","desc"), limit(1));
        const msgSnap = await getDocs(msgQ);
        const lastMsg = msgSnap.docs[0]?.data();
        const unreadQ = query(collection(db, "messages"), where("chatId","==",d.id), where("senderId","!=",currentUser.uid), where("read","==",false));
        const unreadSnap = await getDocs(unreadQ);
        return { ...data, otherUser, lastMessage: lastMsg?.text||"", lastMessageTime: lastMsg?.createdAt||data.createdAt, unreadCount: unreadSnap.size };
      }));
      list.sort((a,b) => (b.lastMessageTime?.seconds||0) - (a.lastMessageTime?.seconds||0));
      setChats(list);
    });
  }, [currentUser]);

  // Global background message notifications
  useEffect(() => {
    if (!currentUser || !chats.length) return;
    prevMsgCountRef.current = {};
    const unsubs = chats.map(chat => {
      if (!chat.id) return () => {};
      const q = query(collection(db, "messages"), where("chatId","==",chat.id), orderBy("createdAt","desc"), limit(5));
      return onSnapshot(q, snap => {
        const msgs    = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        const prev    = prevMsgCountRef.current[chat.id] || 0;
        const newMsgs = msgs.filter(m => m.senderId !== currentUser.uid && !m.read && m.type !== "call");
        if (newMsgs.length > prev && activeChat?.id !== chat.id) {
          const newest  = newMsgs[0];
          const sender  = chat.otherUser?.name || "Someone";
          const toastId = Date.now();
          addToast({ id:toastId, icon:"💬", title:sender, body:newest.text, color:"#25D366" });
          sendBrowserNotification(sender, newest.text, { tag: "msg-" + chat.id, data: { chatId: chat.id }, icon: chat.otherUser?.photoURL || "/icon-192.png" });
          setTimeout(() => removeToast(toastId), 5000);
        }
        prevMsgCountRef.current[chat.id] = newMsgs.length;
      });
    });
    return () => { unsubs.forEach(u => u()); prevMsgCountRef.current = {}; };
  }, [chats, currentUser, activeChat]);

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
        if (snap.exists()) { const age = Date.now() - (snap.data().updatedAt?.toMillis?.() || 0); setTypingMap(p => ({ ...p, [chat.id]: age < 5000 })); }
        else setTypingMap(p => ({ ...p, [chat.id]: false }));
      }, () => {});
    });
    return () => { Object.values(typingUnsubsRef.current).forEach(u => u?.()); typingUnsubsRef.current = {}; };
  }, [chats, currentUser]);

  const addToast    = useCallback(t => { setToasts(p => [...p, t]); setTimeout(() => removeToast(t.id), 5000); }, []);
  const removeToast = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), []);

  const handleSelectChat = chat => {
    setActiveChat(chat);
    setChats(p => p.map(c => c.id === chat.id ? { ...c, unreadCount:0 } : c));
  };

  const showSidebar = !isMobile || !activeChat;
  const showChat    = !isMobile || !!activeChat;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#ccc; border-radius:3px; }
        @keyframes typingBounce {
          0%,60%,100% { transform:translateY(0); opacity:0.4; }
          30% { transform:translateY(-5px); opacity:1; }
        }
        @keyframes menuPop {
          from { transform:scale(0.9); opacity:0; } to { transform:scale(1); opacity:1; }
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes slideDown {
          from { transform:translateY(-10px); opacity:0; } to { transform:translateY(0); opacity:1; }
        }
        @keyframes slideInRight {
          from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); }
        }
        @keyframes ripple {
          0% { transform:translate(-50%,-50%) scale(0.8); opacity:0.6; }
          100% { transform:translate(-50%,-50%) scale(1.8); opacity:0; }
        }
        @keyframes pulse {
          0%,100% { transform:scale(1); box-shadow:0 4px 20px rgba(239,68,68,0.4); }
          50% { transform:scale(1.06); box-shadow:0 4px 30px rgba(239,68,68,0.7); }
        }
        @keyframes pulseGreen {
          0%,100% { transform:scale(1); box-shadow:0 4px 20px rgba(37,211,102,0.4); }
          50% { transform:scale(1.06); box-shadow:0 4px 30px rgba(37,211,102,0.7); }
        }
        @keyframes audioWave {
          0%,100% { height:6px; }
          50% { height:28px; }
        }
        /* Responsive — mobile full screen */
        @media (max-width: 767px) {
          .chat-layout { flex-direction: column !important; }
          .sidebar-panel { width: 100% !important; min-width: unset !important; border-right: none !important; }
          .chat-panel-wrap { width: 100% !important; }
          input, textarea, select { font-size: 16px !important; }
        }
      `}</style>

      {notifBarVisible && (
        <NotificationBar
          onAllow={async () => {
            setNotifBarVisible(false);
            const granted = await askNotificationPermission();
            if (!granted) addToast({ id: Date.now(), icon: "⚠️", title: "Notifications blocked", body: "Please enable in browser settings", color: "#f77f00" });
          }}
          onDismiss={() => setNotifBarVisible(false)}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div className="chat-layout" style={{ display:"flex", height:"100vh", width:"100vw", fontFamily:"'Nunito', sans-serif", overflow:"hidden", background:"#f0f2f5" }}>
        {showSidebar && (
          <div className="sidebar-panel" style={{ width: isMobile?"100%":340, minWidth: isMobile?"unset":280, display:"flex", height:"100%", flexShrink:0 }}>
            <Sidebar chats={chats} currentUser={currentUser} onSelectChat={handleSelectChat}
              activeChatId={activeChat?.id} isMobile={isMobile}
              onBackToDashboard={onBackToDashboard || (() => window.history.back())}
              typingMap={typingMap} />
          </div>
        )}
        {showChat && (
          activeChat ? (
            <div className="chat-panel-wrap" style={{ flex:1, display:"flex", minWidth:0, overflow:"hidden" }}>
              <ChatPanel chat={activeChat} currentUser={currentUser} isMobile={isMobile}
                onClose={() => setActiveChat(null)} addToast={addToast} allChats={chats} />
            </div>
          ) : !isMobile && (
            <div style={{ flex:1, background:"#f0f2f5", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
              <div style={{ fontSize:64 }}>💬</div>
              <div style={{ color:"#8696a0", fontSize:16, fontFamily:"'Nunito', sans-serif" }}>Select a chat to start messaging</div>
            </div>
          )
        )}
      </div>
    </>
  );
}
