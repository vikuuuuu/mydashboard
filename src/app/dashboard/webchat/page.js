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
//  NOTIFICATION SYSTEM — WhatsApp Web style
//  Works on Desktop + Mobile browsers
// ════════════════════════════════════════════════════════════

// Notification sound via Web Audio API
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
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (_) {}
};

let _swReg = null;

// Register Service Worker from /sw-notifications.js (copy to public/)
const registerSW = async () => {
  if (!("serviceWorker" in navigator)) return null;
  try {
    // Try file-based SW first (better for mobile)
    const reg = await navigator.serviceWorker.register("/sw-notifications.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    // Fallback: inline SW via blob URL
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

// Request permission + setup SW
const askNotificationPermission = async () => {
  if (!("Notification" in window)) return false;
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm === "granted" && !_swReg) _swReg = await registerSW();
  return perm === "granted";
};

// Send notification — works in foreground + background + when tab is closed
const sendBrowserNotification = (title, body, options = {}) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  playNotifSound(options.sound || "message");

  const isCall = options.requireInteraction;
  const notifOpts = {
    body,
    icon: options.icon || "/icon-192.png",
    badge: "/favicon.ico",
    tag: options.tag || "chat-msg",
    requireInteraction: isCall || false,
    silent: false,
    vibrate: isCall ? [400, 200, 400, 200, 400] : [200, 100, 200],
    data: options.data || {},
    timestamp: Date.now(),
  };

  // Method 1: SW showNotification — works in background + when tab hidden
  if (_swReg) {
    _swReg.showNotification(title, notifOpts).catch(() => {
      // Fallback to basic Notification
      const n = new Notification(title, notifOpts);
      if (!isCall) setTimeout(() => n.close(), 6000);
    });
    return;
  }

  // Method 2: SW message — for cases SW is registered but not active yet
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SHOW_NOTIFICATION", title, body, options: notifOpts,
    });
    return;
  }

  // Method 3: Direct Notification API (foreground only)
  try {
    const n = new Notification(title, notifOpts);
    if (!isCall) setTimeout(() => n.close(), 6000);
  } catch {}
};

// ════════════════════════════════════════════════════════════
//  ICONS (SVG — no external deps)
// ════════════════════════════════════════════════════════════
const BackIcon  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
const SearchIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const CloseIcon  = ({ s = 18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const VideoIcon  = ({ s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>;
const PhoneIcon  = ({ s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>;
const EndCallIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>;

const MicIcon = ({ muted }) => muted
  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
  : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>;

const CamIcon = ({ off }) => off
  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4-4-14.5 14.5 2 2L8 15.5V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.5l-1-1zM16 13.85L8.15 6H16v7.85zM3 7v10a1 1 0 0 0 1 1h1.85l-2-2H4V7.85l-1-1V7z"/></svg>
  : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>;

const SpeakerIcon = ({ off }) => off
  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
  : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>;

// ════════════════════════════════════════════════════════════
//  AVATAR
// ════════════════════════════════════════════════════════════
function Avatar({ name = "?", photoURL = null, size = 40, online = false }) {
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#aebac1","#FF6B6B","#6C5CE7"];
  const color  = colors[name.charCodeAt(0) % colors.length];
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
//  IN-APP TOAST (message & call notifications)
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
//  CONTEXT MENU
// ════════════════════════════════════════════════════════════
function ContextMenu({ x, y, isMine, msgId, onDelete, onReact, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);
  return (
    <div ref={ref} style={{ position:"fixed", top:y, left:x, background:"#fff", borderRadius:12, boxShadow:"0 4px 24px rgba(0,0,0,0.18)", zIndex:1000, overflow:"hidden", minWidth:180, animation:"menuPop 0.15s ease" }}>
      <div style={{ display:"flex", gap:4, padding:"10px 12px", borderBottom:"1px solid #f0f2f5" }}>
        {EMOJI_LIST.map(emoji => (
          <button key={emoji} onClick={() => { onReact(emoji); onClose(); }}
            style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", borderRadius:8, padding:"2px 4px", transition:"transform 0.1s" }}
            onMouseEnter={e => e.currentTarget.style.transform="scale(1.3)"}
            onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}>
            {emoji}
          </button>
        ))}
      </div>
      {[
        { label:"Reply",   icon:"↩️" },
        { label:"Copy",    icon:"📋", action: () => {} },
        ...(isMine ? [{ label:"Delete", icon:"🗑️", danger:true, action: onDelete }] : []),
      ].map(({ label, icon, danger, action }) => (
        <button key={label} onClick={() => { action?.(); onClose(); }}
          style={{ display:"flex", alignItems:"center", gap:12, width:"100%", background:"none", border:"none", padding:"11px 16px", cursor:"pointer", textAlign:"left", color: danger?"#ef4444":"#111b21", fontSize:14, fontFamily:"'Nunito', sans-serif", transition:"background 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.background="#f0f2f5"}
          onMouseLeave={e => e.currentTarget.style.background="none"}>
          <span style={{ fontSize:16 }}>{icon}</span>{label}
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  CALL LOG BUBBLE — shown in chat for missed/answered calls
// ════════════════════════════════════════════════════════════
function CallLogBubble({ msg, isMine }) {
  const missed  = msg.callStatus === "missed";
  const callType = msg.callType === "video" ? "Video" : "Audio";
  const icon    = msg.callType === "video" ? "📹" : "📞";
  const color   = missed ? "#ef4444" : "#25D366";
  const label   = isMine
    ? (missed ? `Missed ${callType} Call` : `${callType} Call`)
    : (missed ? `Missed ${callType} Call` : `${callType} Call`);
  const sub     = isMine
    ? (missed ? "Not answered" : `Duration: ${msg.callDuration || "0:00"}`)
    : (missed ? "Tap to call back" : `Duration: ${msg.callDuration || "0:00"}`);

  return (
    <div style={{ display:"flex", justifyContent: isMine?"flex-end":"flex-start", padding:"4px 10px", marginBottom:3 }}>
      <div style={{ background: isMine?"#d9fdd3":"#fff", borderRadius:14, padding:"10px 14px", boxShadow:"0 1px 2px rgba(0,0,0,0.1)", display:"flex", alignItems:"center", gap:10, minWidth:200 }}>
        <div style={{ width:38, height:38, borderRadius:"50%", background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
          {missed ? "📵" : icon}
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
      <div style={{ zIndex:1, position:"relative", marginBottom:8 }}>
        <Avatar name={callerName} photoURL={callerPhoto} size={96} />
      </div>
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
//  CALLING SCREEN (outgoing wait)
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
      <div style={{ zIndex:1, position:"relative", marginBottom:8 }}>
        <Avatar name={otherUser?.name || "?"} photoURL={otherUser?.photoURL} size={96} />
      </div>
      <div style={{ color:"#fff", fontSize:24, fontWeight:700, fontFamily:"'Nunito', sans-serif", zIndex:1 }}>{otherUser?.name}</div>
      <div style={{ color:"#8696a0", fontSize:15, fontFamily:"'Nunito', sans-serif", zIndex:1 }}>
        {callType === "video" ? "📹 Video" : "📞 Audio"} · Calling{dots}
      </div>
      <button onClick={onCancel} style={{ marginTop:32, width:64, height:64, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(239,68,68,0.5)", zIndex:1 }}>
        <EndCallIcon />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  VIDEO CALL UI
// ════════════════════════════════════════════════════════════
function VideoCallUI({ localStream, remoteStream, callDuration, isMuted, isCameraOff, isSpeakerOff, onToggleMute, onToggleCamera, onToggleSpeaker, onEnd, otherUser, callType }) {
  const localRef  = useRef();
  const remoteRef = useRef();
  const [showCtrls, setShowCtrls] = useState(true);
  const ctrlTimer = useRef();
  const isAudio = callType === "audio";

  useEffect(() => { if (localRef.current && localStream)   localRef.current.srcObject  = localStream;  }, [localStream]);
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

  // ── AUDIO CALL UI ── (no video, just avatar)
  if (isAudio) {
    return (
      <div style={{ position:"fixed", inset:0, zIndex:3000, background:"linear-gradient(160deg,#0a1628,#0d2137)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
        {/* Hidden audio element for remote stream */}
        <audio ref={remoteRef} autoPlay style={{ display:"none" }} />
        <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={110} online />
        <div style={{ color:"#fff", fontSize:22, fontWeight:700, fontFamily:"'Nunito', sans-serif", marginTop:8 }}>{otherUser?.name}</div>
        <div style={{ color:"#25D366", fontSize:14, fontFamily:"'Nunito', sans-serif" }}>{fmt(callDuration)}</div>
        {/* Audio wave animation */}
        <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:32, marginTop:8 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ width:4, borderRadius:2, background:"rgba(37,211,102,0.7)",
              animation:`audioWave 1s ${i*0.12}s infinite ease-in-out`,
              height: isMuted ? 4 : undefined,
            }} />
          ))}
        </div>
        {/* Controls */}
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
    <div onMouseMove={showControls} onClick={showControls} style={{ position:"fixed", inset:0, zIndex:3000, background:"#000", display:"flex", alignItems:"center", justifyContent:"center" }}>
      {/* FIX: object-fit contain prevents zoom — shows full video */}
      <video ref={remoteRef} autoPlay playsInline style={{ width:"100%", height:"100%", objectFit:"contain", background:"#111" }} />
      {!remoteStream && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, background:"linear-gradient(160deg,#0a1628,#0d2137)" }}>
          <Avatar name={otherUser?.name||"?"} photoURL={otherUser?.photoURL} size={100} />
          <div style={{ color:"#fff", fontSize:20, fontWeight:700, fontFamily:"'Nunito', sans-serif" }}>{otherUser?.name}</div>
          <div style={{ color:"#8696a0", fontSize:14, fontFamily:"'Nunito', sans-serif" }}>Connecting…</div>
        </div>
      )}
      {/* PiP */}
      <div style={{ position:"absolute", bottom:100, right:16, width:110, height:155, borderRadius:16, overflow:"hidden", border:"2px solid rgba(255,255,255,0.3)", boxShadow:"0 4px 20px rgba(0,0,0,0.5)", background:"#222" }}>
        {isCameraOff
          ? <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#1a1a1a" }}><span style={{ fontSize:32 }}>🚫</span></div>
          : <video ref={localRef} autoPlay playsInline muted style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)" }} />
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
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"16px 0 36px", background:"linear-gradient(to top,rgba(0,0,0,0.7),transparent)", display:"flex", justifyContent:"center", alignItems:"center", gap:20, opacity: showCtrls?1:0, transition:"opacity 0.3s" }}>
        {[
          { onClick:onToggleSpeaker, active:!isSpeakerOff, label:isSpeakerOff?"Speaker Off":"Speaker",  icon:<SpeakerIcon off={isSpeakerOff} /> },
          { onClick:onToggleMute,    active:!isMuted,       label:isMuted?"Unmute":"Mute",               icon:<MicIcon muted={isMuted} /> },
        ].map(({ onClick, active, label, icon }) => (
          <div key={label} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <button onClick={onClick} style={{ width:48, height:48, borderRadius:"50%", background: active?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", backdropFilter:"blur(4px)", transition:"background 0.2s" }}>{icon}</button>
            <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:"'Nunito', sans-serif" }}>{label}</span>
          </div>
        ))}
        <button onClick={onEnd} style={{ width:64, height:64, borderRadius:"50%", background:"#ef4444", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 20px rgba(239,68,68,0.5)" }}><EndCallIcon /></button>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
          <button onClick={onToggleCamera} style={{ width:48, height:48, borderRadius:"50%", background: !isCameraOff?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}><CamIcon off={isCameraOff} /></button>
          <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:"'Nunito', sans-serif" }}>{isCameraOff?"Camera Off":"Camera"}</span>
        </div>
        <div style={{ width:48 }} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  useVideoCall HOOK
//  ─ startCall / acceptCall / rejectCall / endCall
//  ─ saves call log to Firestore chat messages
//  ─ sends browser notification on incoming call
// ════════════════════════════════════════════════════════════
function useVideoCall({ currentUser, chat, addToast }) {
  const [callState,       setCallState      ] = useState("idle");
  const [incomingData,    setIncomingData   ] = useState(null);
  const [localStream,     setLocalStream    ] = useState(null);
  const [remoteStream,    setRemoteStream   ] = useState(null);
  const [isMuted,         setIsMuted        ] = useState(false);
  const [isCameraOff,     setIsCameraOff    ] = useState(false);
  const [isSpeakerOff,    setIsSpeakerOff   ] = useState(false);
  const [callDuration,    setCallDuration   ] = useState(0);

  const pcRef            = useRef(null);
  const roomDocRef       = useRef(null);
  const callStartRef     = useRef(null);
  const localStreamRef   = useRef(null);
  const durationIv       = useRef(null);
  const unsubsRef        = useRef([]);
  const callStateRef     = useRef("idle");
  const callTypeRef      = useRef("video");

  useEffect(() => { callStateRef.current = callState; }, [callState]);

  const otherUserId = chat?.otherUser?.id;

  // ── Save call log message to Firestore ──
  const saveCallLog = useCallback(async (status) => {
    if (!chat?.id || !currentUser?.uid) return;
    const duration = callStartRef.current
      ? Math.floor((Date.now() - callStartRef.current) / 1000)
      : 0;
    const mm = String(Math.floor(duration / 60)).padStart(2,"0");
    const ss = String(duration % 60).padStart(2,"0");
    await addDoc(collection(db, "messages"), {
      chatId:      chat.id,
      participants: chat.participants,
      senderId:    currentUser.uid,
      type:        "call",
      callType:    callTypeRef.current,
      callStatus:  status,          // "answered" | "missed"
      callDuration: duration > 0 ? `${mm}:${ss}` : null,
      createdAt:   serverTimestamp(),
      read:        false,
    }).catch(() => {});
  }, [chat, currentUser]);

  // ── Listen for incoming calls (global — attached once per user) ──
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

        // ── Browser notification for incoming call ──
        const n = sendBrowserNotification(
          `📞 Incoming ${data.callType === "video" ? "Video" : "Audio"} Call`,
          `from ${data.callerName || "Someone"}`,
          {
            requireInteraction: true,
            tag: "incoming-call",
            sound: "call",
            data: { chatId: data.chatId, type: "call" },
          }
        );
        // In-app toast as well
        addToast({
          id: Date.now(),
          icon: data.callType === "video" ? "📹" : "📞",
          title: `Incoming ${data.callType === "video" ? "Video" : "Audio"} Call`,
          body: `from ${data.callerName || "Someone"}`,
          color: "#25D366",
        });

      } else if (data.status === "ended" && callStateRef.current !== "idle") {
        cleanupCall(false);
      }
    }, err => console.warn("callSignal:", err.code));
    return () => unsub();
  }, [currentUser?.uid]); // NO callState in deps

  // type: "video" = camera+mic, "audio" = mic only
  const getMedia = async (type = "video") => {
    const constraints = type === "audio"
      ? { video: false, audio: true }
      : { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: true };
    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = s; setLocalStream(s); return s;
    } catch {
      try {
        // Fallback: audio only if video fails
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

  // ── START CALL (caller) ──
  const startCall = useCallback(async (type = "video") => {
    if (!otherUserId || !currentUser?.uid) return;
    callTypeRef.current = type;
    setCallState("calling");
    try {
      const stream = await getMedia(type);  // pass type: audio=mic only, video=cam+mic
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

      // Signal callee
      await setDoc(doc(db, "users", otherUserId, "callSignal", "incoming"), {
        status: "calling", callerId: currentUser.uid,
        callerName: currentUser.name || "Unknown",
        callerPhoto: currentUser.photoURL || null,
        roomId: roomRef.id, chatId: chat?.id, callType: type,
      });

      // Listen for answer
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

      // Listen for callee ICE
      const u2 = onSnapshot(collection(db, "rooms", roomRef.id, "calleeCandidates"), snap => {
        snap.docChanges().forEach(async ch => {
          if (ch.type === "added") await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
        });
      });

      unsubsRef.current = [u1, u2];
    } catch { setCallState("idle"); }
  }, [otherUserId, currentUser, chat]);

  // ── ACCEPT CALL (callee) ──
  const acceptCall = useCallback(async () => {
    if (!incomingData) return;
    const { roomId, callType } = incomingData;
    callTypeRef.current = callType || "video";
    setCallState("connected");
    try {
      const stream = await getMedia(callType || "video");  // audio call = mic only
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

      // Listen for caller ICE
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

  // ── REJECT CALL ──
  const rejectCall = useCallback(async () => {
    if (incomingData?.roomId) {
      await updateDoc(doc(db, "rooms", incomingData.roomId), { status: "ended" }).catch(() => {});
      // Save missed call log on callee side too
      if (chat?.id && currentUser?.uid) {
        await addDoc(collection(db, "messages"), {
          chatId: chat.id, participants: chat.participants,
          senderId: incomingData.callerId, // caller's message
          type: "call", callType: incomingData.callType || "video",
          callStatus: "missed", callDuration: null,
          createdAt: serverTimestamp(), read: false,
        }).catch(() => {});
      }
    }
    await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
    setCallState("idle"); setIncomingData(null);
  }, [incomingData, currentUser, chat]);

  // ── CLEANUP ──
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

    // Save call log in chat
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
    setCallDuration(0); setIsMuted(false); setIsCameraOff(false);
  }, [otherUserId, currentUser, chat]);

  return {
    callState, incomingData, localStream, remoteStream,
    isMuted, isCameraOff, isSpeakerOff, callDuration,
    callType: callTypeRef.current,  // expose current call type
    startCall, acceptCall, rejectCall,
    endCall: () => cleanupCall(true, "answered"),
    toggleMute:    () => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setIsMuted(m => !m); },
    toggleCamera:  () => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setIsCameraOff(c => !c); },
    toggleSpeaker: () => setIsSpeakerOff(s => !s),
  };
}

// ════════════════════════════════════════════════════════════
//  MESSAGE BUBBLE
// ════════════════════════════════════════════════════════════
function Bubble({ msg, isMine, senderName, onContextMenu, deletedIds }) {
  const [hovered, setHovered] = useState(false);
  const isDeleted = deletedIds.has(msg.id);

  // Call log bubble
  if (msg.type === "call") return <CallLogBubble msg={msg} isMine={isMine} />;

  return (
    <div style={{ display:"flex", justifyContent: isMine?"flex-end":"flex-start", marginBottom:3, padding:"2px 10px" }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ maxWidth:"72%", position:"relative" }}>
        {hovered && !isDeleted && (
          <div style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", [isMine?"left":"right"]:-36, display:"flex", alignItems:"center", animation:"fadeIn 0.15s ease" }}>
            <button onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onContextMenu(r.right, r.top); }}
              style={{ background:"#fff", border:"none", cursor:"pointer", width:28, height:28, borderRadius:"50%", boxShadow:"0 1px 4px rgba(0,0,0,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#54656f" }}>▾</button>
          </div>
        )}
        <div style={{ background: isDeleted?"#f0f2f5":isMine?"#d9fdd3":"#fff", borderRadius: isMine?"18px 18px 4px 18px":"18px 18px 18px 4px", padding:"7px 12px 5px", boxShadow:"0 1px 2px rgba(0,0,0,0.1)" }}>
          {!isMine && senderName && !isDeleted && (
            <div style={{ color:"#25D366", fontSize:12, fontWeight:700, marginBottom:2, fontFamily:"'Nunito', sans-serif" }}>{senderName}</div>
          )}
          <div style={{ color: isDeleted?"#8696a0":"#111b21", fontSize:14.5, lineHeight:1.45, wordBreak:"break-word", fontFamily:"'Nunito', sans-serif", fontStyle: isDeleted?"italic":"normal" }}>
            {isDeleted ? (isMine ? "🚫 You deleted this message" : "🚫 This message was deleted") : msg.text}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap:4, marginTop:3 }}>
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
      <button onClick={onPrev}  disabled={!matchCount} style={{ background:"none", border:"none", cursor: matchCount?"pointer":"default", color: matchCount?"#54656f":"#ccc", fontSize:18, padding:2 }}>▲</button>
      <button onClick={onNext}  disabled={!matchCount} style={{ background:"none", border:"none", cursor: matchCount?"pointer":"default", color: matchCount?"#54656f":"#ccc", fontSize:18, padding:2 }}>▼</button>
      <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", display:"flex", alignItems:"center" }}><CloseIcon /></button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  NOTIFICATION PERMISSION BAR — WhatsApp Web style
//  Shows at top when permission not granted
// ════════════════════════════════════════════════════════════
function NotificationBar({ onAllow, onDismiss }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "#075E54",
      padding: "10px 16px",
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      animation: "slideDown 0.3s ease",
      fontFamily: "'Nunito', sans-serif",
    }}>
      <div style={{ fontSize: 22, flexShrink: 0 }}>🔔</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
          Enable notifications
        </div>
        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 }}>
          Get notified for new messages and calls, even when this tab is not active
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button onClick={onAllow} style={{
          background: "#25D366", color: "#fff",
          border: "none", borderRadius: 20,
          padding: "7px 18px", fontWeight: 700,
          fontSize: 13, cursor: "pointer",
          fontFamily: "'Nunito', sans-serif",
          transition: "background 0.2s",
          boxShadow: "0 2px 8px rgba(37,211,102,0.4)",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#1da851"}
          onMouseLeave={e => e.currentTarget.style.background = "#25D366"}
        >
          Enable
        </button>
        <button onClick={onDismiss} style={{
          background: "rgba(255,255,255,0.15)", color: "#fff",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 20, padding: "7px 14px",
          fontWeight: 600, fontSize: 13,
          cursor: "pointer", fontFamily: "'Nunito', sans-serif",
        }}>
          Not now
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════════════════════════
function Sidebar({ chats, currentUser, onSelectChat, activeChatId, isMobile, onBackToDashboard, typingMap }) {
  const [search,        setSearch       ] = useState("");
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
//  CHAT PANEL
// ════════════════════════════════════════════════════════════
function ChatPanel({ chat, currentUser, onClose, isMobile, addToast }) {
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
  const [prevMsgLen,    setPrevMsgLen   ] = useState(0);

  const bottomRef        = useRef();
  const containerRef     = useRef();
  const typingTimeoutRef = useRef();
  const typingDocRef     = useRef();

  const vc = useVideoCall({ currentUser, chat, addToast });

  // Listen other user data
  useEffect(() => {
    const id = chat?.otherUser?.id;
    if (!id) return;
    return onSnapshot(doc(db, "users", id), snap => { if (snap.exists()) setOtherUserData({ id, ...snap.data() }); });
  }, [chat?.otherUser?.id]);

  // Messages
  useEffect(() => {
    if (!chat?.id) { setMessages([]); return; }
    typingDocRef.current = doc(db, "chats", chat.id, "typing", currentUser.uid);
    const q = query(
      collection(db, "messages"),
      where("chatId", "==", chat.id),
      orderBy("createdAt"),
    );
    return onSnapshot(q, async snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));

      // Notify for new incoming messages while chat is open
      if (list.length > prevMsgLen && prevMsgLen > 0) {
        const newest = list[list.length - 1];
        if (newest.senderId !== currentUser.uid && newest.type !== "call") {
          const senderName = userCache[newest.senderId]?.name || otherUserData?.name || "Someone";
          // In-app toast
          addToast({ id: Date.now(), icon:"💬", title: senderName, body: newest.text, color:"#25D366" });
          // Browser notification
          sendBrowserNotification(senderName, newest.text, { tag:"new-message" });
        }
      }
      setPrevMsgLen(list.length);
      setMessages(list);
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

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !chat?.id) return;
    clearTimeout(typingTimeoutRef.current);
    if (typingDocRef.current) await deleteDoc(typingDocRef.current).catch(() => {});
    await addDoc(collection(db, "messages"), {
      chatId: chat.id, participants: chat.participants,
      text: trimmed, senderId: currentUser.uid,
      createdAt: serverTimestamp(), read: false,
    });
    setText("");
  };

  const handleKey = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleDelete = async msgId => {
    setDeletedIds(p => new Set([...p, msgId]));
    await updateDoc(doc(db, "messages", msgId), { deleted:true, text:"" }).catch(() => {});
  };

  const handleReact = async (msgId, emoji) => {
    await updateDoc(doc(db, "messages", msgId), { [`reactions.${currentUser.uid}`]: emoji }).catch(() => {});
  };

  // Build grouped list
  const grouped = [];
  let lastDate = null;
  messages.forEach(m => {
    const label = m.createdAt ? formatDate(m.createdAt) : null;
    if (label && label !== lastDate) { grouped.push({ type:"date", label }); lastDate = label; }
    grouped.push({ type:"msg", msg:m });
  });

  const displayUser = otherUserData || chat?.otherUser;
  const isOnline    = displayUser?.online;
  const statusText  = isTypingOther ? null : isOnline ? "Online" : formatLastSeen(displayUser?.lastSeen);
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
        <CallingScreen otherUser={displayUser} callType={vc.incomingData?.callType || "video"} onCancel={() => { vc.endCall(); }} />
      )}
      {vc.callState === "connected" && (
        <VideoCallUI localStream={vc.localStream} remoteStream={vc.remoteStream} callDuration={vc.callDuration}
          isMuted={vc.isMuted} isCameraOff={vc.isCameraOff} isSpeakerOff={vc.isSpeakerOff}
          onToggleMute={vc.toggleMute} onToggleCamera={vc.toggleCamera} onToggleSpeaker={vc.toggleSpeaker}
          onEnd={vc.endCall} otherUser={displayUser}
          callType={vc.callType || "video"} />
      )}

      {/* ── Context menu ── */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} isMine={contextMenu.isMine} msgId={contextMenu.msgId}
          onDelete={() => handleDelete(contextMenu.msgId)}
          onReact={emoji => handleReact(contextMenu.msgId, emoji)}
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
          {/* Audio call */}
          <button onClick={() => vc.startCall("audio")} title="Audio Call"
            style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:7, borderRadius:8, display:"flex", alignItems:"center", transition:"background 0.15s, color 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background="#e0f7ef"; e.currentTarget.style.color="#00a884"; }}
            onMouseLeave={e => { e.currentTarget.style.background="none"; e.currentTarget.style.color="#54656f"; }}>
            <PhoneIcon s={20} />
          </button>
          {/* Video call */}
          <button onClick={() => vc.startCall("video")} title="Video Call"
            style={{ background:"none", border:"none", cursor:"pointer", color:"#54656f", padding:7, borderRadius:8, display:"flex", alignItems:"center", transition:"background 0.15s, color 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background="#e0f7ef"; e.currentTarget.style.color="#00a884"; }}
            onMouseLeave={e => { e.currentTarget.style.background="none"; e.currentTarget.style.color="#54656f"; }}>
            <VideoIcon s={22} />
          </button>
          {/* Search */}
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
                onContextMenu={(x, y) => setContextMenu({ msgId:item.msg.id, x: Math.min(x, window.innerWidth-200), y: Math.min(y, window.innerHeight-220), isMine: item.msg.senderId === currentUser?.uid })}
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

      {/* ── Input ── */}
      <div style={{ display:"flex", alignItems:"center", padding:"8px 12px", gap:10, background:"#f0f2f5", borderTop:"1px solid #ddd", flexShrink:0 }}>
        <button style={{ background:"none", border:"none", color:"#8696a0", fontSize:22, cursor:"pointer", padding:4, flexShrink:0 }}>😊</button>
        <button style={{ background:"none", border:"none", color:"#8696a0", fontSize:22, cursor:"pointer", padding:4, flexShrink:0 }}>📎</button>
        <input value={text} onChange={e => handleTyping(e.target.value)} onKeyDown={handleKey} placeholder="Type a message"
          style={{ flex:1, background:"#fff", border:"none", borderRadius:24, padding:"10px 16px", color:"#111b21", fontSize:14.5, outline:"none", fontFamily:"'Nunito', sans-serif", minWidth:0 }} />
        <button onClick={sendMessage} style={{ width:44, height:44, borderRadius:"50%", background: text.trim()?"#00a884":"#8696a0", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, transition:"background 0.2s", flexShrink:0, color:"#fff" }}>
          {text.trim() ? "➤" : "🎤"}
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

  const typingUnsubsRef = useRef({});
  const prevMsgCountRef = useRef({});
  const [notifBarVisible, setNotifBarVisible] = useState(false);

  // Check notification permission — show bar if not granted
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Show bar after 2s so UI loads first
      const t = setTimeout(() => setNotifBarVisible(true), 2000);
      return () => clearTimeout(t);
    } else if (Notification.permission === "granted") {
      // Already granted — just register SW silently
      registerSW().then(reg => { if (reg) _swReg = reg; });
    }
  }, []);

  // Listen for SW messages (notification action clicks)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = e => {
      if (e.data?.type === "NOTIFICATION_CLICK") {
        // Focus the chat that was clicked
        const chatId = e.data?.data?.chatId;
        if (chatId) {
          const chat = chats.find(c => c.id === chatId);
          if (chat) handleSelectChat(chat);
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [chats]);

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

  // Global message listener — notifications for background chats
  useEffect(() => {
    if (!currentUser || !chats.length) return;
    const unsubs = chats.map(chat => {
      if (!chat.id) return () => {};
      const q = query(collection(db, "messages"), where("chatId","==",chat.id), orderBy("createdAt","desc"), limit(5));
      return onSnapshot(q, snap => {
        const msgs    = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        const prev    = prevMsgCountRef.current[chat.id] || 0;
        const newMsgs = msgs.filter(m => m.senderId !== currentUser.uid && !m.read && m.type !== "call");
        if (newMsgs.length > prev && activeChat?.id !== chat.id) {
          const newest   = newMsgs[0];
          const sender   = chat.otherUser?.name || "Someone";
          const toastId  = Date.now();
          addToast({ id:toastId, icon:"💬", title:sender, body:newest.text, color:"#25D366" });
          sendBrowserNotification(sender, newest.text, {
            tag: "msg-" + chat.id,
            data: { chatId: chat.id },
            icon: chat.otherUser?.photoURL || "/icon-192.png",
          });
          setTimeout(() => removeToast(toastId), 5000);
        }
        prevMsgCountRef.current[chat.id] = newMsgs.length;
      });
    });
    return () => unsubs.forEach(u => u());
  }, [chats, currentUser, activeChat]);

  // Typing listeners (stable)
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

  const addToast    = useCallback(t => setToasts(p => [...p, t]), []);
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
      `}</style>

      {/* Notification permission bar */}
      {notifBarVisible && (
        <NotificationBar
          onAllow={async () => {
            setNotifBarVisible(false);
            const granted = await askNotificationPermission();
            if (!granted) {
              addToast({ id: Date.now(), icon: "⚠️", title: "Notifications blocked", body: "Please enable in browser settings", color: "#f77f00" });
            }
          }}
          onDismiss={() => setNotifBarVisible(false)}
        />
      )}

      {/* Global toast container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div style={{ display:"flex", height:"100vh", width:"100vw", fontFamily:"'Nunito', sans-serif", overflow:"hidden", background:"#f0f2f5" }}>
        {showSidebar && (
          <Sidebar chats={chats} currentUser={currentUser} onSelectChat={handleSelectChat}
            activeChatId={activeChat?.id} isMobile={isMobile}
            onBackToDashboard={onBackToDashboard || (() => window.history.back())}
            typingMap={typingMap} />
        )}
        {showChat && (
          activeChat ? (
            <ChatPanel chat={activeChat} currentUser={currentUser} isMobile={isMobile}
              onClose={() => setActiveChat(null)} addToast={addToast} />
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
