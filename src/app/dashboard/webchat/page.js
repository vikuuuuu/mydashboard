"use client";

import { useEffect, useState, useRef } from "react";
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

// ─── Avatar ───────────────────────────────────────────────

function Avatar({ name = "?", size = 40, online = false }) {
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#aebac1","#FF6B6B","#6C5CE7"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `linear-gradient(135deg, ${color}, ${color}bb)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 700,
        fontSize: size * 0.4,
        fontFamily: "'Nunito', sans-serif",
        boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
        userSelect: "none",
      }}>
        {name.charAt(0).toUpperCase()}
      </div>
      {online && (
        <div style={{
          position: "absolute", bottom: 2, right: 2,
          width: size * 0.27, height: size * 0.27,
          borderRadius: "50%", background: "#25D366",
          border: "2px solid #fff",
        }} />
      )}
    </div>
  );
}

// ─── Back Arrow Icon ───────────────────────────────────────

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ─── Sidebar ──────────────────────────────────────────────

function Sidebar({ chats, currentUser, onSelectChat, activeChatId, isMobile, onBackToDashboard }) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (!search) { setSearchResults([]); return; }
    const q = query(
      collection(db, "users"),
      where("name", ">=", search),
      where("name", "<=", search + "\uf8ff")
    );
    const unsub = onSnapshot(q, snapshot => {
      const users = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.id !== currentUser?.uid);
      setSearchResults(users);
    });
    return () => unsub();
  }, [search, currentUser]);

  const filteredChats = chats.filter(c =>
    c.otherUser?.name?.toLowerCase().includes(search.toLowerCase())
  );
  const listToShow = search ? searchResults : filteredChats;

  const handleUserSelect = async (user) => {
    const existingChat = chats.find(c => c.participants?.includes(user.id));
    if (existingChat) {
      onSelectChat(existingChat);
    } else {
      const newChatDoc = await addDoc(collection(db, "chats"), {
        participants: [currentUser.uid, user.id],
        createdAt: serverTimestamp(),
      });
      onSelectChat({
        id: newChatDoc.id,
        participants: [currentUser.uid, user.id],
        otherUser: user,
        lastMessage: "",
        lastMessageTime: null,
      });
      setSearch("");
    }
  };

  return (
    <div style={{
      width: isMobile ? "100%" : 340,
      minWidth: isMobile ? "unset" : 280,
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      borderRight: isMobile ? "none" : "1px solid #ddd",
      height: "100%",
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        background: "#f0f2f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #ddd",
        gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, overflow: "hidden" }}>
          {/* Back to Dashboard btn */}
          <button
            onClick={onBackToDashboard}
            title="Back to Dashboard"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#54656f", padding: 4, display: "flex",
              alignItems: "center", flexShrink: 0,
            }}
          >
            <BackIcon />
          </button>
          <Avatar name={currentUser?.name || "Me"} size={40} online />
          <div style={{ overflow: "hidden" }}>
            <div style={{ color: "#111b21", fontWeight: 700, fontSize: 15, fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {currentUser?.name || "You"}
            </div>
            <div style={{ color: "#25D366", fontSize: 12 }}>Online</div>
          </div>
        </div>
        <button style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", fontSize: 20 }}>⋮</button>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 12px", background: "#fff" }}>
        <div style={{
          background: "#f0f2f5", borderRadius: 10,
          display: "flex", alignItems: "center",
          padding: "7px 12px", gap: 8,
        }}>
          <span style={{ color: "#8696a0", fontSize: 15 }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search or start new chat"
            style={{
              background: "none", border: "none", outline: "none",
              color: "#111b21", flex: 1, fontSize: 14,
              fontFamily: "'Nunito', sans-serif",
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {listToShow.length === 0 && (
          <div style={{ color: "#8696a0", textAlign: "center", padding: 30, fontSize: 14 }}>
            {search ? "No users found" : "No chats yet"}
          </div>
        )}
        {listToShow.map(item => {
          const isUser = !!item.email && !item.otherUser;
          const displayName = isUser ? item.name : (item.otherUser?.name || "Unknown");
          const subText = isUser ? item.email : (item.lastMessage || "No messages yet");
          const lastTime = !isUser && item.lastMessageTime ? formatTime(item.lastMessageTime) : "";
          const isActive = activeChatId === item.id;

          return (
            <div
              key={item.id}
              onClick={() => isUser ? handleUserSelect(item) : onSelectChat(item)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 16px",
                cursor: "pointer",
                background: isActive ? "#f0f2f5" : "#fff",
                borderBottom: "1px solid #f0f2f5",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f8f9fa"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "#fff"; }}
            >
              <Avatar name={displayName} size={46} online={item.online || item.otherUser?.online} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#111b21", fontWeight: 600, fontSize: 15, fontFamily: "'Nunito', sans-serif" }}>
                    {displayName}
                  </span>
                  {lastTime && <span style={{ color: "#8696a0", fontSize: 11, flexShrink: 0 }}>{lastTime}</span>}
                </div>
                <div style={{
                  color: "#8696a0", fontSize: 13,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  marginTop: 2,
                }}>
                  {subText}
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

function Bubble({ msg, isMine, senderName }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: isMine ? "flex-end" : "flex-start",
      marginBottom: 3,
      padding: "2px 10px",
    }}>
      <div style={{
        maxWidth: "72%",
        background: isMine ? "#d9fdd3" : "#fff",
        borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "7px 12px 5px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
      }}>
        {!isMine && senderName && (
          <div style={{ color: "#25D366", fontSize: 12, fontWeight: 700, marginBottom: 2, fontFamily: "'Nunito', sans-serif" }}>
            {senderName}
          </div>
        )}
        <div style={{ color: "#111b21", fontSize: 14.5, lineHeight: 1.45, wordBreak: "break-word", fontFamily: "'Nunito', sans-serif" }}>
          {msg.text}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3 }}>
          <span style={{ color: "#8696a0", fontSize: 11 }}>{formatTime(msg.createdAt)}</span>
          {isMine && <span style={{ color: "#53bdeb", fontSize: 13 }}>✓✓</span>}
        </div>
      </div>
    </div>
  );
}

function DateDivider({ label }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
      <div style={{
        background: "#fff", color: "#8696a0",
        fontSize: 12, padding: "4px 12px",
        borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        fontFamily: "'Nunito', sans-serif",
      }}>
        {label}
      </div>
    </div>
  );
}

// ─── Chat Panel ────────────────────────────────────────────

function ChatPanel({ chat, currentUser, onClose, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [userCache, setUserCache] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!chat?.id) { setMessages([]); return; }
    const q = query(
      collection(db, "messages"),
      where("chatId", "==", chat.id),
      orderBy("createdAt")
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(list);
      list.forEach(async m => {
        if (m.senderId && !userCache[m.senderId]) {
          const uDoc = await getDoc(doc(db, "users", m.senderId));
          if (uDoc.exists()) setUserCache(prev => ({ ...prev, [m.senderId]: uDoc.data() }));
        }
      });
    });
    return () => unsub();
  }, [chat?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const getOrCreateChatId = async () => {
    if (chat.id) return chat.id;
    const otherUserId = chat.otherUser?.id;
    if (!otherUserId) return null;
    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));
    const snap = await getDocs(q);
    const existing = snap.docs.find(d => (d.data().participants || []).includes(otherUserId));
    if (existing) { chat.id = existing.id; return existing.id; }
    const newChat = await addDoc(collection(db, "chats"), {
      participants: [currentUser.uid, otherUserId],
      createdAt: serverTimestamp(),
    });
    chat.id = newChat.id;
    return newChat.id;
  };

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const chatId = await getOrCreateChatId();
    if (!chatId) return;
    await addDoc(collection(db, "messages"), {
      chatId, text: trimmed,
      senderId: currentUser.uid,
      createdAt: serverTimestamp(),
    });
    setText("");
  };

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const grouped = [];
  let lastDate = null;
  messages.forEach(m => {
    const label = m.createdAt ? formatDate(m.createdAt) : null;
    if (label && label !== lastDate) { grouped.push({ type: "date", label }); lastDate = label; }
    grouped.push({ type: "msg", msg: m });
  });

  // Empty state
  if (!chat) {
    return (
      <div style={{
        flex: 1, background: "#f0f2f5",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
      }}>
        <div style={{ fontSize: 64 }}>💬</div>
        <div style={{ color: "#8696a0", fontSize: 16, fontFamily: "'Nunito', sans-serif" }}>
          Select a chat to start messaging
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "#efeae2", minWidth: 0 }}>
      {/* Chat Header */}
      <div style={{
        background: "#f0f2f5",
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid #ddd",
        flexShrink: 0,
      }}>
        {/* Back button — always visible on mobile, visible on desktop too to close chat */}
        <button
          onClick={onClose}
          title="Back"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#54656f", padding: 4,
            display: "flex", alignItems: "center",
            flexShrink: 0,
          }}
        >
          <BackIcon />
        </button>
        <Avatar name={chat.otherUser?.name || "?"} size={40} online={chat.otherUser?.online} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ color: "#111b21", fontWeight: 700, fontSize: 15, fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {chat.otherUser?.name || "Unknown"}
          </div>
          <div style={{ color: "#8696a0", fontSize: 12 }}>
            {chat.otherUser?.online ? "Online" : (chat.otherUser?.email || "")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
          {["🔍","📞","⋮"].map((ic, i) => (
            <button key={i} style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", fontSize: 18, padding: 4 }}>{ic}</button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {grouped.map((item, i) =>
          item.type === "date"
            ? <DateDivider key={i} label={item.label} />
            : <Bubble key={item.msg.id} msg={item.msg} isMine={item.msg.senderId === currentUser?.uid} senderName={userCache[item.msg.senderId]?.name} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "8px 12px", gap: 10,
        background: "#f0f2f5",
        borderTop: "1px solid #ddd",
        flexShrink: 0,
      }}>
        <button style={{ background: "none", border: "none", color: "#8696a0", fontSize: 22, cursor: "pointer", padding: 4, flexShrink: 0 }}>😊</button>
        <button style={{ background: "none", border: "none", color: "#8696a0", fontSize: 22, cursor: "pointer", padding: 4, flexShrink: 0 }}>📎</button>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message"
          style={{
            flex: 1, background: "#fff",
            border: "none", borderRadius: 24,
            padding: "10px 16px",
            color: "#111b21", fontSize: 14.5,
            outline: "none",
            fontFamily: "'Nunito', sans-serif",
            minWidth: 0,
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: text.trim() ? "#00a884" : "#8696a0",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, transition: "background 0.2s",
            flexShrink: 0, color: "#fff",
          }}
        >
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

  // Responsive check
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async user => {
      if (!user) return;
      const uDoc = await getDoc(doc(db, "users", user.uid));
      setCurrentUser({ uid: user.uid, ...(uDoc.exists() ? uDoc.data() : {}) });
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));
    const unsub = onSnapshot(q, async snap => {
      const chatList = await Promise.all(snap.docs.map(async d => {
        const data = { id: d.id, ...d.data() };
        const otherId = data.participants?.find(p => p !== currentUser.uid);
        let otherUser = null;
        if (otherId) {
          const uDoc = await getDoc(doc(db, "users", otherId));
          if (uDoc.exists()) otherUser = { id: otherId, ...uDoc.data() };
        }
        const msgQ = query(collection(db, "messages"), where("chatId", "==", d.id), orderBy("createdAt", "desc"));
        const msgSnap = await getDocs(msgQ);
        const lastMsg = msgSnap.docs[0]?.data();
        return { ...data, otherUser, lastMessage: lastMsg?.text || "", lastMessageTime: lastMsg?.createdAt || data.createdAt };
      }));
      setChats(chatList.sort((a, b) => (b.lastMessageTime?.seconds || 0) - (a.lastMessageTime?.seconds || 0)));
    });
    return () => unsub();
  }, [currentUser]);

  // Mobile: show either sidebar OR chat, not both
  const showSidebar = !isMobile || !activeChat;
  const showChat = !isMobile || !!activeChat;

  // Default onBackToDashboard if not provided
  const handleBackToDashboard = onBackToDashboard || (() => window.history.back());

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        @media (max-width: 767px) {
          .chat-wrapper { flex-direction: column !important; }
        }
      `}</style>
      <div className="chat-wrapper" style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        fontFamily: "'Nunito', sans-serif",
        overflow: "hidden",
        background: "#f0f2f5",
      }}>
        {showSidebar && (
          <Sidebar
            chats={chats}
            currentUser={currentUser}
            onSelectChat={setActiveChat}
            activeChatId={activeChat?.id}
            isMobile={isMobile}
            onBackToDashboard={handleBackToDashboard}
          />
        )}

        {showChat && (
          activeChat
            ? <ChatPanel
                chat={activeChat}
                currentUser={currentUser}
                isMobile={isMobile}
                onClose={() => setActiveChat(null)}
              />
            : !isMobile && (
              <div style={{
                flex: 1, background: "#f0f2f5",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 12,
              }}>
                <div style={{ fontSize: 64 }}>💬</div>
                <div style={{ color: "#8696a0", fontSize: 16, fontFamily: "'Nunito', sans-serif" }}>
                  Select a chat to start messaging
                </div>
              </div>
            )
        )}
      </div>
    </>
  );
}