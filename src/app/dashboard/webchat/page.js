"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  limit,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

// ─── Helpers ───────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

function formatLastSeen(ts) {
  if (!ts) return "Last seen recently";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d;
  if (diff < 60000) return "Last seen just now";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d >= today) return `Last seen today at ${time}`;
  if (d >= yesterday) return `Last seen yesterday at ${time}`;
  return `Last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })} at ${time}`;
}

const EMOJI_LIST = ["❤️", "😂", "😮", "😢", "🙏", "👍"];

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ─── Icons ────────────────────────────────────────────────

function Avatar({ name = "?", photoURL = null, size = 40, online = false }) {
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#aebac1","#FF6B6B","#6C5CE7"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {photoURL ? (
        <img src={photoURL} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${color}, ${color}bb)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: size * 0.4, fontFamily: "'Nunito', sans-serif" }}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      {online && <div style={{ position: "absolute", bottom: 2, right: 2, width: size * 0.27, height: size * 0.27, borderRadius: "50%", background: "#25D366", border: "2px solid #fff" }} />}
    </div>
  );
}

function BackIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
}

function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}

function CloseIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}

function VideoCallIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>;
}

function MicIcon({ muted }) {
  return muted ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>
  );
}

function CameraIcon({ off }) {
  return off ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4-4-14.5 14.5 2 2L8 15.5V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.5l-1-1zM16 13.85L8.15 6H16v7.85zM3 7v10a1 1 0 0 0 1 1h1.85l-2-2H4V7.85l-1-1V7z"/></svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
  );
}

function EndCallIcon() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>;
}

function SpeakerIcon({ off }) {
  return off ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
  );
}

// ─── Typing Dots ───────────────────────────────────────────

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#25D366", display: "inline-block", animation: `typingBounce 1.2s ${i * 0.2}s infinite ease-in-out` }} />
      ))}
    </span>
  );
}

// ─── Context Menu ─────────────────────────────────────────

function ContextMenu({ x, y, isMine, onDelete, onReact, onClose }) {
  const menuRef = useRef(null);
  useEffect(() => {
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div ref={menuRef} style={{ position: "fixed", top: y, left: x, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.18)", zIndex: 1000, overflow: "hidden", minWidth: 180, animation: "menuPop 0.15s ease" }}>
      <div style={{ display: "flex", gap: 4, padding: "10px 12px", borderBottom: "1px solid #f0f2f5" }}>
        {EMOJI_LIST.map((emoji) => (
          <button key={emoji} onClick={() => { onReact(emoji); onClose(); }}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", borderRadius: 8, padding: "2px 4px", transition: "transform 0.1s, background 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.3)"; e.currentTarget.style.background = "#f0f2f5"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "none"; }}>
            {emoji}
          </button>
        ))}
      </div>
      {[
        { label: "Reply", icon: "↩️" },
        { label: "Copy", icon: "📋", action: () => {} },
        { label: "Forward", icon: "↪️" },
        ...(isMine ? [{ label: "Delete", icon: "🗑️", danger: true, action: onDelete }] : []),
      ].map(({ label, icon, danger, action }) => (
        <button key={label} onClick={() => { action?.(); onClose(); }}
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", padding: "11px 16px", cursor: "pointer", textAlign: "left", color: danger ? "#ef4444" : "#111b21", fontSize: 14, fontFamily: "'Nunito', sans-serif", transition: "background 0.15s" }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#f0f2f5"}
          onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
          <span style={{ fontSize: 16 }}>{icon}</span>{label}
        </button>
      ))}
    </div>
  );
}

// ─── Incoming Call Screen ─────────────────────────────────

function IncomingCallScreen({ callerName, callerPhoto, onAccept, onReject }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "linear-gradient(160deg, #0a1628 0%, #0d2137 50%, #0a1628 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div style={{ position: "relative", marginBottom: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 80 + i * 36, height: 80 + i * 36, borderRadius: "50%", border: "2px solid rgba(37,211,102,0.25)", animation: `ripple 2s ${i * 0.4}s infinite ease-out` }} />
        ))}
        <Avatar name={callerName} photoURL={callerPhoto} size={96} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#fff", fontSize: 26, fontWeight: 700, fontFamily: "'Nunito', sans-serif", marginBottom: 6 }}>{callerName}</div>
        <div style={{ color: "#25D366", fontSize: 15, fontFamily: "'Nunito', sans-serif", letterSpacing: 1 }}>Incoming video call...</div>
      </div>
      <div style={{ display: "flex", gap: 56, marginTop: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <button onClick={onReject} style={{ width: 64, height: 64, borderRadius: "50%", background: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 20px rgba(239,68,68,0.5)", animation: "pulse 1.5s infinite" }}>
            <EndCallIcon />
          </button>
          <span style={{ color: "#aaa", fontSize: 12, fontFamily: "'Nunito', sans-serif" }}>Decline</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <button onClick={onAccept} style={{ width: 64, height: 64, borderRadius: "50%", background: "#25D366", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 20px rgba(37,211,102,0.5)", animation: "pulseGreen 1.5s 0.3s infinite" }}>
            <VideoCallIcon size={26} />
          </button>
          <span style={{ color: "#aaa", fontSize: 12, fontFamily: "'Nunito', sans-serif" }}>Accept</span>
        </div>
      </div>
    </div>
  );
}

// ─── Call Control Button ──────────────────────────────────

function CallControlBtn({ onClick, active, label, size = 48, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button onClick={onClick} style={{ width: size, height: size, borderRadius: "50%", background: active ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: active ? "#fff" : "#666", backdropFilter: "blur(4px)", transition: "background 0.2s" }}>
        {children}
      </button>
      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "'Nunito', sans-serif" }}>{label}</span>
    </div>
  );
}

// ─── Outgoing Call Wait Screen ────────────────────────────

function CallingScreen({ otherUser, onCancel }) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const interval = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 500);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "linear-gradient(160deg, #0a1628, #0d2137)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <div style={{ position: "relative", marginBottom: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 80 + i * 36, height: 80 + i * 36, borderRadius: "50%", border: "2px solid rgba(37,211,102,0.2)", animation: `ripple 2.5s ${i * 0.5}s infinite ease-out` }} />
        ))}
        <Avatar name={otherUser?.name || "?"} photoURL={otherUser?.photoURL} size={96} />
      </div>
      <div style={{ color: "#fff", fontSize: 24, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>{otherUser?.name}</div>
      <div style={{ color: "#8696a0", fontSize: 15, fontFamily: "'Nunito', sans-serif" }}>Calling{dots}</div>
      <button onClick={onCancel} style={{ marginTop: 32, width: 64, height: 64, borderRadius: "50%", background: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 20px rgba(239,68,68,0.5)" }}>
        <EndCallIcon />
      </button>
    </div>
  );
}

// ─── Video Call UI ────────────────────────────────────────

function VideoCallUI({ localStream, remoteStream, callDuration, isMuted, isCameraOff, isSpeakerOff, onToggleMute, onToggleCamera, onToggleSpeaker, onEnd, otherUser }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);

  useEffect(() => { if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream; }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = !!isSpeakerOff;
    }
  }, [remoteStream, isSpeakerOff]);

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3500);
  };

  const formatDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div onMouseMove={handleMouseMove} onClick={handleMouseMove} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Remote video */}
      <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover", background: "#111" }} />

      {/* No remote video fallback */}
      {!remoteStream && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "linear-gradient(160deg, #0a1628, #0d2137)" }}>
          <Avatar name={otherUser?.name || "?"} photoURL={otherUser?.photoURL} size={100} />
          <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>{otherUser?.name}</div>
          <div style={{ color: "#8696a0", fontSize: 14, fontFamily: "'Nunito', sans-serif" }}>Connecting...</div>
        </div>
      )}

      {/* Local video PiP */}
      <div style={{ position: "absolute", bottom: 100, right: 16, width: 110, height: 155, borderRadius: 16, overflow: "hidden", border: "2px solid rgba(255,255,255,0.3)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", background: "#222" }}>
        {isCameraOff ? (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a1a" }}>
            <span style={{ fontSize: 32 }}>🚫</span>
          </div>
        ) : (
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
        )}
      </div>

      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "20px 20px 16px", background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "opacity 0.3s", opacity: showControls ? 1 : 0 }}>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 17, fontFamily: "'Nunito', sans-serif" }}>{otherUser?.name}</div>
          <div style={{ color: "#25D366", fontSize: 13, fontFamily: "'Nunito', sans-serif" }}>{formatDuration(callDuration)}</div>
        </div>
        <Avatar name={otherUser?.name || "?"} photoURL={otherUser?.photoURL} size={36} />
      </div>

      {/* Bottom controls */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 0 36px", background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)", display: "flex", justifyContent: "center", alignItems: "center", gap: 20, transition: "opacity 0.3s", opacity: showControls ? 1 : 0 }}>
        <CallControlBtn onClick={onToggleSpeaker} active={!isSpeakerOff} label={isSpeakerOff ? "Speaker Off" : "Speaker"} size={48}><SpeakerIcon off={isSpeakerOff} /></CallControlBtn>
        <CallControlBtn onClick={onToggleMute} active={!isMuted} label={isMuted ? "Unmute" : "Mute"} size={48}><MicIcon muted={isMuted} /></CallControlBtn>
        <button onClick={onEnd} style={{ width: 64, height: 64, borderRadius: "50%", background: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 20px rgba(239,68,68,0.5)" }}>
          <EndCallIcon />
        </button>
        <CallControlBtn onClick={onToggleCamera} active={!isCameraOff} label={isCameraOff ? "Camera Off" : "Camera"} size={48}><CameraIcon off={isCameraOff} /></CallControlBtn>
        <div style={{ width: 48 }} />
      </div>
    </div>
  );
}

// ─── useVideoCall Hook ────────────────────────────────────

function useVideoCall({ currentUser, chat }) {
  const [callState, setCallState] = useState("idle"); // idle | calling | incoming | connected
  const [incomingCallData, setIncomingCallData] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef = useRef(null);
  const roomDocRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const unsubscribesRef = useRef([]);
  const localStreamRef = useRef(null);
  const callStateRef = useRef("idle"); // stable ref to avoid stale closure in listener

  const otherUserId = chat?.otherUser?.id;

  // Keep callStateRef in sync
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Listen for incoming calls — attach ONCE, use ref for callState check
  useEffect(() => {
    if (!currentUser?.uid) return;
    const signalRef = doc(db, "users", currentUser.uid, "callSignal", "incoming");
    const unsub = onSnapshot(signalRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === "calling" && callStateRef.current === "idle") {
        setIncomingCallData(data);
        setCallState("incoming");
      } else if (data.status === "ended") {
        cleanupCall(false);
      }
    }, (err) => {
      // Silently ignore permission errors during cleanup
      console.warn("callSignal listener error:", err.code);
    });
    return () => unsub();
  }, [currentUser?.uid]); // ← NO callState dependency — prevents re-subscription

  const getMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (err) {
        alert("Camera/mic access denied.");
        throw err;
      }
    }
  };

  const createPC = (stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const remote = new MediaStream();
    setRemoteStream(remote);
    pc.ontrack = (e) => e.streams[0].getTracks().forEach((t) => remote.addTrack(t));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") cleanupCall(true);
    };
    return pc;
  };

  const startCall = async () => {
    if (!otherUserId || !currentUser?.uid) return;
    setCallState("calling");
    try {
      const stream = await getMedia();
      const pc = createPC(stream);
      pcRef.current = pc;

      const roomRef = await addDoc(collection(db, "rooms"), {
        callerId: currentUser.uid, calleeId: otherUserId,
        chatId: chat?.id, createdAt: serverTimestamp(), status: "calling",
      });
      roomDocRef.current = roomRef;

      pc.onicecandidate = async (e) => {
        if (e.candidate) await addDoc(collection(db, "rooms", roomRef.id, "callerCandidates"), e.candidate.toJSON());
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp } });

      await setDoc(doc(db, "users", otherUserId, "callSignal", "incoming"), {
        status: "calling", callerId: currentUser.uid,
        callerName: currentUser.name || "Unknown",
        callerPhoto: currentUser.photoURL || null,
        roomId: roomRef.id, chatId: chat?.id,
      });

      const unsubRoom = onSnapshot(roomRef, async (snap) => {
        const data = snap.data();
        if (data?.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          setCallState("connected");
          startTimer();
        }
        if (data?.status === "ended") cleanupCall(false);
      });

      const unsubCallee = onSnapshot(collection(db, "rooms", roomRef.id, "calleeCandidates"), (snap) => {
        snap.docChanges().forEach(async (ch) => {
          if (ch.type === "added") await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
        });
      });

      unsubscribesRef.current = [unsubRoom, unsubCallee];
    } catch (err) {
      setCallState("idle");
    }
  };

  const acceptCall = async () => {
    if (!incomingCallData) return;
    const { roomId } = incomingCallData;
    setCallState("connected");
    try {
      const stream = await getMedia();
      const pc = createPC(stream);
      pcRef.current = pc;

      const roomRef = doc(db, "rooms", roomId);
      roomDocRef.current = roomRef;

      pc.onicecandidate = async (e) => {
        if (e.candidate) await addDoc(collection(db, "rooms", roomId, "calleeCandidates"), e.candidate.toJSON());
      };

      const roomSnap = await getDoc(roomRef);
      const { offer } = roomSnap.data();
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp }, status: "connected" });

      const unsubCaller = onSnapshot(collection(db, "rooms", roomId, "callerCandidates"), (snap) => {
        snap.docChanges().forEach(async (ch) => {
          if (ch.type === "added") await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
        });
      });

      unsubscribesRef.current = [unsubCaller];
      await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
      startTimer();
    } catch (err) {
      setCallState("idle");
    }
  };

  const rejectCall = async () => {
    if (incomingCallData?.roomId) {
      await updateDoc(doc(db, "rooms", incomingCallData.roomId), { status: "ended" }).catch(() => {});
    }
    await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
    setCallState("idle");
    setIncomingCallData(null);
  };

  const cleanupCall = useCallback(async (notify = true) => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    unsubscribesRef.current.forEach((u) => u?.());
    unsubscribesRef.current = [];
    clearInterval(durationIntervalRef.current);

    if (notify && roomDocRef.current) {
      await updateDoc(roomDocRef.current, { status: "ended" }).catch(() => {});
    }
    if (notify && otherUserId) {
      await setDoc(doc(db, "users", otherUserId, "callSignal", "incoming"), { status: "ended" }).catch(() => {});
    }
    if (currentUser?.uid) {
      await deleteDoc(doc(db, "users", currentUser.uid, "callSignal", "incoming")).catch(() => {});
    }

    localStreamRef.current = null;
    roomDocRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallState("idle");
    setIncomingCallData(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
  }, [otherUserId, currentUser?.uid]);

  const startTimer = () => {
    clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted((m) => !m);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsCameraOff((c) => !c);
  };

  return {
    callState, incomingCallData, localStream, remoteStream,
    isMuted, isCameraOff, isSpeakerOff, callDuration,
    startCall, acceptCall, rejectCall,
    endCall: () => cleanupCall(true),
    toggleMute, toggleCamera,
    toggleSpeaker: () => setIsSpeakerOff((s) => !s),
  };
}

// ─── Sidebar ──────────────────────────────────────────────

function Sidebar({ chats, currentUser, onSelectChat, activeChatId, isMobile, onBackToDashboard, typingMap }) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (!search) { setSearchResults([]); return; }
    const q = query(collection(db, "users"), where("name", ">=", search), where("name", "<=", search + "\uf8ff"));
    const unsub = onSnapshot(q, (snap) => {
      setSearchResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.id !== currentUser?.uid));
    });
    return () => unsub();
  }, [search, currentUser]);

  const filteredChats = chats.filter((c) => c.otherUser?.name?.toLowerCase().includes(search.toLowerCase()));
  const listToShow = search ? searchResults : filteredChats;

  const handleUserSelect = async (user) => {
    const existingChat = chats.find((c) => c.participants?.includes(user.id));
    if (existingChat) { onSelectChat(existingChat); return; }
    const newChatDoc = await addDoc(collection(db, "chats"), { participants: [currentUser.uid, user.id], createdAt: serverTimestamp() });
    onSelectChat({ id: newChatDoc.id, participants: [currentUser.uid, user.id], otherUser: user, lastMessage: "", lastMessageTime: null });
    setSearch("");
  };

  return (
    <div style={{ width: isMobile ? "100%" : 340, minWidth: isMobile ? "unset" : 280, background: "#ffffff", display: "flex", flexDirection: "column", borderRight: isMobile ? "none" : "1px solid #ddd", height: "100%", flexShrink: 0 }}>
      <div style={{ padding: "14px 16px", background: "#f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #ddd", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, overflow: "hidden" }}>
          <button onClick={onBackToDashboard} style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", padding: 4, display: "flex", alignItems: "center", flexShrink: 0 }}><BackIcon /></button>
          <Avatar name={currentUser?.name || "Me"} photoURL={currentUser?.photoURL} size={40} online />
          <div style={{ overflow: "hidden" }}>
            <div style={{ color: "#111b21", fontWeight: 700, fontSize: 15, fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser?.name || "You"}</div>
            <div style={{ color: "#25D366", fontSize: 12 }}>Online</div>
          </div>
        </div>
        <button style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", fontSize: 20 }}>⋮</button>
      </div>
      <div style={{ padding: "8px 12px", background: "#fff" }}>
        <div style={{ background: "#f0f2f5", borderRadius: 10, display: "flex", alignItems: "center", padding: "7px 12px", gap: 8 }}>
          <span style={{ color: "#8696a0", fontSize: 15 }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search or start new chat"
            style={{ background: "none", border: "none", outline: "none", color: "#111b21", flex: 1, fontSize: 14, fontFamily: "'Nunito', sans-serif" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0", display: "flex", alignItems: "center" }}><CloseIcon size={16} /></button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {listToShow.length === 0 && <div style={{ color: "#8696a0", textAlign: "center", padding: 30, fontSize: 14 }}>{search ? "No users found" : "No chats yet"}</div>}
        {listToShow.map((item) => {
          const isUser = !!item.email && !item.otherUser;
          const displayName = isUser ? item.name : item.otherUser?.name || "Unknown";
          const isActive = activeChatId === item.id;
          const unreadCount = !isUser ? item.unreadCount || 0 : 0;
          const isTyping = !isUser && typingMap?.[item.id];
          const lastTime = !isUser && item.lastMessageTime ? formatTime(item.lastMessageTime) : "";
          const subText = isUser ? item.email : item.lastMessage || "No messages yet";
          return (
            <div key={item.id} onClick={() => isUser ? handleUserSelect(item) : onSelectChat(item)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", background: isActive ? "#f0f2f5" : "#fff", borderBottom: "1px solid #f0f2f5", transition: "background 0.15s" }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f8f9fa"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#fff"; }}>
              <Avatar name={displayName} photoURL={item.photoURL || item.otherUser?.photoURL} size={46} online={item.online || item.otherUser?.online} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#111b21", fontWeight: 600, fontSize: 15, fontFamily: "'Nunito', sans-serif" }}>{displayName}</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    {lastTime && <span style={{ color: unreadCount > 0 ? "#25D366" : "#8696a0", fontSize: 11 }}>{lastTime}</span>}
                    {unreadCount > 0 && <span style={{ background: "#25D366", color: "#fff", borderRadius: 12, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "0 5px" }}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
                  </div>
                </div>
                <div style={{ color: "#8696a0", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  {isTyping ? <span style={{ color: "#25D366", display: "flex", alignItems: "center", gap: 5 }}>typing <TypingDots /></span> : subText}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bubble ────────────────────────────────────────────────

function Bubble({ msg, isMine, senderName, onContextMenu, isDeleted, isHighlighted }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 3, padding: "2px 10px", background: isHighlighted ? "rgba(37,211,102,0.12)" : "transparent", transition: "background 0.5s" }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ maxWidth: "72%", position: "relative" }}>
        {hovered && !isDeleted && (
          <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [isMine ? "left" : "right"]: -36, display: "flex", alignItems: "center", animation: "fadeIn 0.15s ease" }}>
            <button onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); onContextMenu(e, rect.right, rect.top); }}
              style={{ background: "#fff", border: "none", cursor: "pointer", width: 28, height: 28, borderRadius: "50%", boxShadow: "0 1px 4px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#54656f" }}>▾</button>
          </div>
        )}
        <div style={{ background: isDeleted ? "#f0f2f5" : isMine ? "#d9fdd3" : "#fff", borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "7px 12px 5px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)", border: isDeleted ? "1px solid #e0e0e0" : "none" }}>
          {!isMine && senderName && !isDeleted && <div style={{ color: "#25D366", fontSize: 12, fontWeight: 700, marginBottom: 2, fontFamily: "'Nunito', sans-serif" }}>{senderName}</div>}
          <div style={{ color: isDeleted ? "#8696a0" : "#111b21", fontSize: 14.5, lineHeight: 1.45, wordBreak: "break-word", fontFamily: "'Nunito', sans-serif", fontStyle: isDeleted ? "italic" : "normal" }}>
            {isDeleted ? (isMine ? "🚫 You deleted this message" : "🚫 This message was deleted") : msg.text}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3 }}>
            <span style={{ color: "#8696a0", fontSize: 11 }}>{formatTime(msg.createdAt)}</span>
            {isMine && !isDeleted && <span style={{ fontSize: 13, color: msg.read ? "#53bdeb" : "#8696a0" }}>✓✓</span>}
          </div>
        </div>
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3, justifyContent: isMine ? "flex-end" : "flex-start" }}>
            {Object.entries(Object.values(msg.reactions).reduce((acc, emoji) => { acc[emoji] = (acc[emoji] || 0) + 1; return acc; }, {})).map(([emoji, count]) => (
              <span key={emoji} style={{ background: "#fff", borderRadius: 12, padding: "2px 7px", fontSize: 13, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", gap: 3, border: "1px solid #e0e0e0" }}>
                {emoji} {count > 1 && <span style={{ fontSize: 11, color: "#555", fontWeight: 700 }}>{count}</span>}
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
    <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
      <div style={{ background: "#fff", color: "#8696a0", fontSize: 12, padding: "4px 12px", borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.08)", fontFamily: "'Nunito', sans-serif" }}>{label}</div>
    </div>
  );
}

function ChatSearchBar({ value, onChange, onClose, onNext, onPrev, matchCount, currentMatch }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div style={{ background: "#f0f2f5", borderBottom: "1px solid #ddd", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, animation: "slideDown 0.2s ease" }}>
      <SearchIcon />
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search in chat..."
        style={{ flex: 1, background: "#fff", border: "none", borderRadius: 20, padding: "8px 14px", fontSize: 14, outline: "none", fontFamily: "'Nunito', sans-serif", color: "#111b21" }} />
      {value && <span style={{ color: "#8696a0", fontSize: 13, whiteSpace: "nowrap" }}>{matchCount === 0 ? "No results" : `${currentMatch + 1} / ${matchCount}`}</span>}
      <button onClick={onPrev} disabled={matchCount === 0} style={{ background: "none", border: "none", cursor: matchCount > 0 ? "pointer" : "default", color: matchCount > 0 ? "#54656f" : "#ccc", fontSize: 18, padding: 2 }}>▲</button>
      <button onClick={onNext} disabled={matchCount === 0} style={{ background: "none", border: "none", cursor: matchCount > 0 ? "pointer" : "default", color: matchCount > 0 ? "#54656f" : "#ccc", fontSize: 18, padding: 2 }}>▼</button>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", display: "flex", alignItems: "center" }}><CloseIcon size={18} /></button>
    </div>
  );
}

// ─── Chat Panel ────────────────────────────────────────────

function ChatPanel({ chat, currentUser, onClose, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [userCache, setUserCache] = useState({});
  const [otherUserData, setOtherUserData] = useState(null);
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [deletedIds, setDeletedIds] = useState(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingDocRef = useRef(null);

  const videoCall = useVideoCall({ currentUser, chat });

  useEffect(() => {
    const otherId = chat?.otherUser?.id;
    if (!otherId) return;
    const unsub = onSnapshot(doc(db, "users", otherId), (snap) => { if (snap.exists()) setOtherUserData({ id: otherId, ...snap.data() }); });
    return () => unsub();
  }, [chat?.otherUser?.id]);

  useEffect(() => {
    if (!chat?.id) { setMessages([]); return; }
    typingDocRef.current = doc(db, "chats", chat.id, "typing", currentUser.uid);
    const q = query(collection(db, "messages"), where("chatId", "==", chat.id), orderBy("createdAt"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(list);
      list.forEach(async (m) => { if (m.senderId !== currentUser.uid && !m.read) await updateDoc(doc(db, "messages", m.id), { read: true }).catch(() => {}); });
      list.forEach(async (m) => { if (m.senderId && !userCache[m.senderId]) { const uDoc = await getDoc(doc(db, "users", m.senderId)); if (uDoc.exists()) setUserCache((prev) => ({ ...prev, [m.senderId]: uDoc.data() })); } });
      setDeletedIds(new Set(list.filter((m) => m.deleted).map((m) => m.id)));
    });
    return () => unsub();
  }, [chat?.id]);

  useEffect(() => {
    if (!chat?.id || !chat?.otherUser?.id) return;
    const typRef = doc(db, "chats", chat.id, "typing", chat.otherUser.id);
    const unsub = onSnapshot(typRef, (snap) => {
      if (snap.exists()) { const age = Date.now() - (snap.data().updatedAt?.toMillis?.() || 0); setIsTypingOther(age < 5000); }
      else setIsTypingOther(false);
    });
    return () => unsub();
  }, [chat?.id, chat?.otherUser?.id]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isAtBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTypingOther]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const h = () => setShowScrollBtn(container.scrollHeight - container.scrollTop - container.clientHeight > 150);
    container.addEventListener("scroll", h);
    return () => container.removeEventListener("scroll", h);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchMatches([]); setSearchIndex(0); return; }
    const q = searchQuery.toLowerCase();
    const matches = messages.map((m, i) => ({ index: i, id: m.id })).filter(({ index }) => messages[index]?.text?.toLowerCase().includes(q));
    setSearchMatches(matches);
    setSearchIndex(matches.length - 1);
  }, [searchQuery, messages]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const match = searchMatches[searchIndex];
    if (!match) return;
    document.getElementById(`msg-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchIndex, searchMatches]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const userRef = doc(db, "users", currentUser.uid);
    updateDoc(userRef, { online: true }).catch(() => {});
    return () => { updateDoc(userRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {}); };
  }, [currentUser?.uid]);

  const getOrCreateChatId = async () => {
    if (chat.id) return chat.id;
    const otherUserId = chat.otherUser?.id;
    if (!otherUserId) return null;
    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));
    const snap = await getDocs(q);
    const existing = snap.docs.find((d) => (d.data().participants || []).includes(otherUserId));
    if (existing) { chat.id = existing.id; return existing.id; }
    const newChat = await addDoc(collection(db, "chats"), { participants: [currentUser.uid, otherUserId], createdAt: serverTimestamp() });
    chat.id = newChat.id;
    typingDocRef.current = doc(db, "chats", newChat.id, "typing", currentUser.uid);
    return newChat.id;
  };

  const handleTyping = async (val) => {
    setText(val);
    if (!chat?.id) return;
    if (typingDocRef.current) await setDoc(typingDocRef.current, { typing: true, updatedAt: serverTimestamp() }).catch(() => {});
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(async () => { if (typingDocRef.current) await deleteDoc(typingDocRef.current).catch(() => {}); }, 3000);
  };

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const chatId = await getOrCreateChatId();
    if (!chatId) return;
    clearTimeout(typingTimeoutRef.current);
    if (typingDocRef.current) await deleteDoc(typingDocRef.current).catch(() => {});
    await addDoc(collection(db, "messages"), { chatId, text: trimmed, senderId: currentUser.uid, createdAt: serverTimestamp(), read: false });
    setText("");
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const handleDelete = async (msgId) => {
    setDeletedIds((prev) => new Set([...prev, msgId]));
    await updateDoc(doc(db, "messages", msgId), { deleted: true, text: "" }).catch(() => {});
  };

  const handleReact = async (msgId, emoji) => {
    await updateDoc(doc(db, "messages", msgId), { [`reactions.${currentUser.uid}`]: emoji }).catch(() => {});
  };

  const handleContextMenu = (e, msgId, isMine) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ msgId, x: Math.min(e.clientX ?? e.x, window.innerWidth - 200), y: Math.min(e.clientY ?? e.y, window.innerHeight - 220), isMine });
  };

  const grouped = [];
  let lastDate = null;
  messages.forEach((m) => {
    const label = m.createdAt ? formatDate(m.createdAt) : null;
    if (label && label !== lastDate) { grouped.push({ type: "date", label }); lastDate = label; }
    grouped.push({ type: "msg", msg: m });
  });

  const displayUser = otherUserData || chat?.otherUser;
  const isOnline = displayUser?.online;
  const statusText = isTypingOther ? null : isOnline ? "Online" : formatLastSeen(displayUser?.lastSeen);
  const currentMatchId = searchMatches[searchIndex]?.id;

  if (!chat) {
    return (
      <div style={{ flex: 1, background: "#f0f2f5", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ fontSize: 64 }}>💬</div>
        <div style={{ color: "#8696a0", fontSize: 16, fontFamily: "'Nunito', sans-serif" }}>Select a chat to start messaging</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "#efeae2", minWidth: 0 }} onClick={() => contextMenu && setContextMenu(null)}>

      {/* ── Video Call Overlays ── */}
      {videoCall.callState === "incoming" && (
        <IncomingCallScreen
          callerName={videoCall.incomingCallData?.callerName || "Unknown"}
          callerPhoto={videoCall.incomingCallData?.callerPhoto}
          onAccept={videoCall.acceptCall}
          onReject={videoCall.rejectCall}
        />
      )}
      {videoCall.callState === "calling" && (
        <CallingScreen otherUser={displayUser} onCancel={videoCall.endCall} />
      )}
      {videoCall.callState === "connected" && (
        <VideoCallUI
          localStream={videoCall.localStream}
          remoteStream={videoCall.remoteStream}
          callDuration={videoCall.callDuration}
          isMuted={videoCall.isMuted}
          isCameraOff={videoCall.isCameraOff}
          isSpeakerOff={videoCall.isSpeakerOff}
          onToggleMute={videoCall.toggleMute}
          onToggleCamera={videoCall.toggleCamera}
          onToggleSpeaker={videoCall.toggleSpeaker}
          onEnd={videoCall.endCall}
          otherUser={displayUser}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} isMine={contextMenu.isMine}
          onDelete={() => handleDelete(contextMenu.msgId)}
          onReact={(emoji) => handleReact(contextMenu.msgId, emoji)}
          onClose={() => setContextMenu(null)} />
      )}

      {/* Chat Header */}
      <div style={{ background: "#f0f2f5", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #ddd", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", padding: 4, display: "flex", alignItems: "center", flexShrink: 0 }}><BackIcon /></button>
        <Avatar name={displayUser?.name || "?"} photoURL={displayUser?.photoURL} size={40} online={isOnline} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ color: "#111b21", fontWeight: 700, fontSize: 15, fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayUser?.name || "Unknown"}</div>
          <div style={{ fontSize: 12, color: isTypingOther || isOnline ? "#25D366" : "#8696a0", display: "flex", alignItems: "center", gap: 5, transition: "color 0.3s" }}>
            {isTypingOther ? (<><span>typing</span><TypingDots /></>) : statusText}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
          {/* 📹 Video Call Button */}
          <button onClick={videoCall.startCall} title="Start video call"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", padding: 7, borderRadius: 8, display: "flex", alignItems: "center", transition: "background 0.15s, color 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#e0f7ef"; e.currentTarget.style.color = "#00a884"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#54656f"; }}>
            <VideoCallIcon size={22} />
          </button>
          <button onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(""); }}
            style={{ background: searchOpen ? "#e0e0e0" : "none", border: "none", cursor: "pointer", color: "#54656f", padding: 7, borderRadius: 8, display: "flex", alignItems: "center" }}>
            <SearchIcon />
          </button>
          {["📞", "⋮"].map((ic, i) => <button key={i} style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", fontSize: 18, padding: 4 }}>{ic}</button>)}
        </div>
      </div>

      {searchOpen && (
        <ChatSearchBar value={searchQuery} onChange={setSearchQuery}
          onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
          onNext={() => setSearchIndex((i) => (i - 1 + searchMatches.length) % searchMatches.length)}
          onPrev={() => setSearchIndex((i) => (i + 1) % searchMatches.length)}
          matchCount={searchMatches.length} currentMatch={searchIndex} />
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} style={{ flex: 1, overflowY: "auto", padding: "8px 0", position: "relative" }}>
        {grouped.map((item, i) =>
          item.type === "date" ? <DateDivider key={i} label={item.label} /> : (
            <div id={`msg-${item.msg.id}`} key={item.msg.id}>
              <Bubble
                msg={item.msg}
                isMine={item.msg.senderId === currentUser?.uid}
                senderName={userCache[item.msg.senderId]?.name}
                isDeleted={deletedIds.has(item.msg.id)}
                isHighlighted={searchQuery && item.msg.id === currentMatchId}
                onContextMenu={(e, x, y) => handleContextMenu({ clientX: x, clientY: y, preventDefault: () => {}, stopPropagation: () => {} }, item.msg.id, item.msg.senderId === currentUser?.uid)}
              />
            </div>
          )
        )}
        {isTypingOther && (
          <div style={{ display: "flex", justifyContent: "flex-start", padding: "4px 10px" }}>
            <div style={{ background: "#fff", borderRadius: "18px 18px 18px 4px", padding: "12px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", gap: 4 }}><TypingDots /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showScrollBtn && (
        <div style={{ position: "relative" }}>
          <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
            style={{ position: "absolute", bottom: 80, right: 20, width: 42, height: 42, borderRadius: "50%", background: "#fff", border: "none", cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#54656f", zIndex: 10, animation: "fadeIn 0.2s ease" }}>↓</button>
        </div>
      )}

      {/* Input */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 10, background: "#f0f2f5", borderTop: "1px solid #ddd", flexShrink: 0 }}>
        <button style={{ background: "none", border: "none", color: "#8696a0", fontSize: 22, cursor: "pointer", padding: 4, flexShrink: 0 }}>😊</button>
        <button style={{ background: "none", border: "none", color: "#8696a0", fontSize: 22, cursor: "pointer", padding: 4, flexShrink: 0 }}>📎</button>
        <input value={text} onChange={(e) => handleTyping(e.target.value)} onKeyDown={handleKey} placeholder="Type a message"
          style={{ flex: 1, background: "#fff", border: "none", borderRadius: 24, padding: "10px 16px", color: "#111b21", fontSize: 14.5, outline: "none", fontFamily: "'Nunito', sans-serif", minWidth: 0 }} />
        <button onClick={sendMessage} style={{ width: 44, height: 44, borderRadius: "50%", background: text.trim() ? "#00a884" : "#8696a0", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, transition: "background 0.2s", flexShrink: 0, color: "#fff" }}>
          {text.trim() ? "➤" : "🎤"}
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────

export default function WhatsAppUI({ onBackToDashboard }) {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [typingMap, setTypingMap] = useState({});

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      const uDoc = await getDoc(doc(db, "users", user.uid));
      setCurrentUser({ uid: user.uid, ...(uDoc.exists() ? uDoc.data() : {}) });
      await updateDoc(doc(db, "users", user.uid), { online: true }).catch(() => {});
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));
    const unsub = onSnapshot(q, async (snap) => {
      const chatList = await Promise.all(
        snap.docs.map(async (d) => {
          const data = { id: d.id, ...d.data() };
          const otherId = data.participants?.find((p) => p !== currentUser.uid);
          let otherUser = null;
          if (otherId) { const uDoc = await getDoc(doc(db, "users", otherId)); if (uDoc.exists()) otherUser = { id: otherId, ...uDoc.data() }; }
          const msgQ = query(collection(db, "messages"), where("chatId", "==", d.id), orderBy("createdAt", "desc"), limit(1));
          const msgSnap = await getDocs(msgQ);
          const lastMsg = msgSnap.docs[0]?.data();
          const unreadQ = query(collection(db, "messages"), where("chatId", "==", d.id), where("senderId", "!=", currentUser.uid), where("read", "==", false));
          const unreadSnap = await getDocs(unreadQ);
          return { ...data, otherUser, lastMessage: lastMsg?.text || "", lastMessageTime: lastMsg?.createdAt || data.createdAt, unreadCount: unreadSnap.size };
        }),
      );
      chatList.sort((a, b) => (b.lastMessageTime?.seconds || 0) - (a.lastMessageTime?.seconds || 0));
      setChats(chatList);
    });
    return () => unsub();
  }, [currentUser]);

  // Stable typing listeners — attach once per chatId, never re-subscribe
  const typingUnsubsRef = useRef({});
  useEffect(() => {
    if (!currentUser) return;
    const currentIds = new Set(chats.map((c) => c.id).filter(Boolean));

    // Detach removed chats
    Object.keys(typingUnsubsRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        typingUnsubsRef.current[id]?.();
        delete typingUnsubsRef.current[id];
      }
    });

    // Attach only NEW chats
    chats.forEach((chat) => {
      if (!chat.id || !chat.otherUser?.id || typingUnsubsRef.current[chat.id]) return;
      const typRef = doc(db, "chats", chat.id, "typing", chat.otherUser.id);
      typingUnsubsRef.current[chat.id] = onSnapshot(typRef, (snap) => {
        if (snap.exists()) {
          const age = Date.now() - (snap.data().updatedAt?.toMillis?.() || 0);
          setTypingMap((prev) => ({ ...prev, [chat.id]: age < 5000 }));
        } else {
          setTypingMap((prev) => ({ ...prev, [chat.id]: false }));
        }
      }, () => {}); // silently ignore errors
    });

    return () => {
      Object.values(typingUnsubsRef.current).forEach((u) => u?.());
      typingUnsubsRef.current = {};
    };
  }, [chats, currentUser]);

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c)));
  };

  const showSidebar = !isMobile || !activeChat;
  const showChat = !isMobile || !!activeChat;
  const handleBackToDashboard = onBackToDashboard || (() => window.history.back());

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes menuPop {
          from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; }
        }
        @keyframes ripple {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(239,68,68,0.4); }
          50% { transform: scale(1.06); box-shadow: 0 4px 30px rgba(239,68,68,0.7); }
        }
        @keyframes pulseGreen {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(37,211,102,0.4); }
          50% { transform: scale(1.06); box-shadow: 0 4px 30px rgba(37,211,102,0.7); }
        }
      `}</style>
      <div style={{ display: "flex", height: "100vh", width: "100vw", fontFamily: "'Nunito', sans-serif", overflow: "hidden", background: "#f0f2f5" }}>
        {showSidebar && <Sidebar chats={chats} currentUser={currentUser} onSelectChat={handleSelectChat} activeChatId={activeChat?.id} isMobile={isMobile} onBackToDashboard={handleBackToDashboard} typingMap={typingMap} />}
        {showChat && (
          activeChat ? (
            <ChatPanel chat={activeChat} currentUser={currentUser} isMobile={isMobile} onClose={() => setActiveChat(null)} />
          ) : (
            !isMobile && (
              <div style={{ flex: 1, background: "#f0f2f5", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ fontSize: 64 }}>💬</div>
                <div style={{ color: "#8696a0", fontSize: 16, fontFamily: "'Nunito', sans-serif" }}>Select a chat to start messaging</div>
              </div>
            )
          )
        )}
      </div>
    </>
  );
}