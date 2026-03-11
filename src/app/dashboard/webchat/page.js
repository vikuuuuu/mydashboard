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
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

// ─── Avatar ───────────────────────────────────────────────

function Avatar({ name = "?", photoURL = null, size = 40, online = false }) {
  const colors = [
    "#25D366",
    "#128C7E",
    "#075E54",
    "#34B7F1",
    "#aebac1",
    "#FF6B6B",
    "#6C5CE7",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {photoURL ? (
        <img
          src={photoURL}
          alt={name}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${color}, ${color}bb)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: size * 0.4,
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      {online && (
        <div
          style={{
            position: "absolute",
            bottom: 2,
            right: 2,
            width: size * 0.27,
            height: size * 0.27,
            borderRadius: "50%",
            background: "#25D366",
            border: "2px solid #fff",
          }}
        />
      )}
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ─── Typing Dots ───────────────────────────────────────────

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#25D366",
            display: "inline-block",
            animation: `typingBounce 1.2s ${i * 0.2}s infinite ease-in-out`,
          }}
        />
      ))}
    </span>
  );
}

// ─── Sidebar ──────────────────────────────────────────────

function Sidebar({
  chats,
  currentUser,
  onSelectChat,
  activeChatId,
  isMobile,
  onBackToDashboard,
  typingMap,
}) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (!search) {
      setSearchResults([]);
      return;
    }
    const q = query(
      collection(db, "users"),
      where("name", ">=", search),
      where("name", "<=", search + "\uf8ff"),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.id !== currentUser?.uid);
      setSearchResults(users);
    });
    return () => unsub();
  }, [search, currentUser]);

  const filteredChats = chats.filter((c) =>
    c.otherUser?.name?.toLowerCase().includes(search.toLowerCase()),
  );
  const listToShow = search ? searchResults : filteredChats;

  const handleUserSelect = async (user) => {
    const existingChat = chats.find((c) => c.participants?.includes(user.id));
    if (existingChat) {
      onSelectChat(existingChat);
      return;
    }
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
  };

  return (
    <div
      style={{
        width: isMobile ? "100%" : 340,
        minWidth: isMobile ? "unset" : 280,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        borderRight: isMobile ? "none" : "1px solid #ddd",
        height: "100%",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          background: "#f0f2f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #ddd",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            overflow: "hidden",
          }}
        >
          <button
            onClick={onBackToDashboard}
            title="Back to Dashboard"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#54656f",
              padding: 4,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <BackIcon />
          </button>
          <Avatar
            name={currentUser?.name || "Me"}
            photoURL={currentUser?.photoURL}
            size={40}
            online
          />
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                color: "#111b21",
                fontWeight: 700,
                fontSize: 15,
                fontFamily: "'Nunito', sans-serif",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentUser?.name || "You"}
            </div>
            <div style={{ color: "#25D366", fontSize: 12 }}>Online</div>
          </div>
        </div>
        <button
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#54656f",
            fontSize: 20,
          }}
        >
          ⋮
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 12px", background: "#fff" }}>
        <div
          style={{
            background: "#f0f2f5",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            padding: "7px 12px",
            gap: 8,
          }}
        >
          <span style={{ color: "#8696a0", fontSize: 15 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start new chat"
            style={{
              background: "none",
              border: "none",
              outline: "none",
              color: "#111b21",
              flex: 1,
              fontSize: 14,
              fontFamily: "'Nunito', sans-serif",
            }}
          />
        </div>
      </div>

      {/* Chat List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {listToShow.length === 0 && (
          <div
            style={{
              color: "#8696a0",
              textAlign: "center",
              padding: 30,
              fontSize: 14,
            }}
          >
            {search ? "No users found" : "No chats yet"}
          </div>
        )}
        {listToShow.map((item) => {
          const isUser = !!item.email && !item.otherUser;
          const displayName = isUser
            ? item.name
            : item.otherUser?.name || "Unknown";
          const isActive = activeChatId === item.id;
          const unreadCount = !isUser ? item.unreadCount || 0 : 0;
          const isTyping = !isUser && typingMap?.[item.id];
          const lastTime =
            !isUser && item.lastMessageTime
              ? formatTime(item.lastMessageTime)
              : "";
          const subText = isUser
            ? item.email
            : item.lastMessage || "No messages yet";

          return (
            <div
              key={item.id}
              onClick={() =>
                isUser ? handleUserSelect(item) : onSelectChat(item)
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                cursor: "pointer",
                background: isActive ? "#f0f2f5" : "#fff",
                borderBottom: "1px solid #f0f2f5",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "#f8f9fa";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "#fff";
              }}
            >
              <Avatar
                name={displayName}
                photoURL={item.photoURL || item.otherUser?.photoURL}
                size={46}
                online={item.online || item.otherUser?.online}
              />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      color: "#111b21",
                      fontWeight: 600,
                      fontSize: 15,
                      fontFamily: "'Nunito', sans-serif",
                    }}
                  >
                    {displayName}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 2,
                      flexShrink: 0,
                    }}
                  >
                    {lastTime && (
                      <span
                        style={{
                          color: unreadCount > 0 ? "#25D366" : "#8696a0",
                          fontSize: 11,
                        }}
                      >
                        {lastTime}
                      </span>
                    )}
                    {/* Unread Badge */}
                    {unreadCount > 0 && (
                      <span
                        style={{
                          background: "#25D366",
                          color: "#fff",
                          borderRadius: 12,
                          minWidth: 20,
                          height: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "0 5px",
                        }}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                {/* Sub text / typing */}
                <div
                  style={{
                    color: "#8696a0",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {isTyping ? (
                    <span
                      style={{
                        color: "#25D366",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      typing <TypingDots />
                    </span>
                  ) : (
                    subText
                  )}
                  
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
    <div
      style={{
        display: "flex",
        justifyContent: isMine ? "flex-end" : "flex-start",
        marginBottom: 3,
        padding: "2px 10px",
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          background: isMine ? "#d9fdd3" : "#fff",
          borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          padding: "7px 12px 5px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        }}
      >
        {!isMine && senderName && (
          <div
            style={{
              color: "#25D366",
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 2,
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            {senderName}
          </div>
        )}
        <div
          style={{
            color: "#111b21",
            fontSize: 14.5,
            lineHeight: 1.45,
            wordBreak: "break-word",
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          {msg.text}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 4,
            marginTop: 3,
          }}
        >
          <span style={{ color: "#8696a0", fontSize: 11 }}>
            {formatTime(msg.createdAt)}
          </span>
          {isMine && (
            // Blue ticks if read, grey if sent
            <span
              style={{ fontSize: 13, color: msg.read ? "#53bdeb" : "#8696a0" }}
            >
              ✓✓
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DateDivider({ label }) {
  return (
    <div
      style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}
    >
      <div
        style={{
          background: "#fff",
          color: "#8696a0",
          fontSize: 12,
          padding: "4px 12px",
          borderRadius: 8,
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          fontFamily: "'Nunito', sans-serif",
        }}
      >
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
  const [otherUserData, setOtherUserData] = useState(null);
  const [isTypingOther, setIsTypingOther] = useState(false);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingDocRef = useRef(null);

  // Live listen to other user's online/lastSeen
  useEffect(() => {
    const otherId = chat?.otherUser?.id;
    if (!otherId) return;
    const unsub = onSnapshot(doc(db, "users", otherId), (snap) => {
      if (snap.exists()) setOtherUserData({ id: otherId, ...snap.data() });
    });
    return () => unsub();
  }, [chat?.otherUser?.id]);

  // Messages listener
  useEffect(() => {
    if (!chat?.id) {
      setMessages([]);
      return;
    }

    typingDocRef.current = doc(db, "chats", chat.id, "typing", currentUser.uid);

    const q = query(
      collection(db, "messages"),
      where("chatId", "==", chat.id),
      orderBy("createdAt"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(list);

      // Mark incoming messages as read
      list.forEach(async (m) => {
        if (m.senderId !== currentUser.uid && !m.read) {
          await updateDoc(doc(db, "messages", m.id), { read: true }).catch(
            () => {},
          );
        }
      });

      // Cache senders
      list.forEach(async (m) => {
        if (m.senderId && !userCache[m.senderId]) {
          const uDoc = await getDoc(doc(db, "users", m.senderId));
          if (uDoc.exists())
            setUserCache((prev) => ({ ...prev, [m.senderId]: uDoc.data() }));
        }
      });
    });
    return () => unsub();
  }, [chat?.id]);

  // Listen to other user typing
  useEffect(() => {
    if (!chat?.id || !chat?.otherUser?.id) return;
    const typRef = doc(db, "chats", chat.id, "typing", chat.otherUser.id);
    const unsub = onSnapshot(typRef, (snap) => {
      if (snap.exists()) {
        const age = Date.now() - (snap.data().updatedAt?.toMillis?.() || 0);
        setIsTypingOther(age < 5000);
      } else {
        setIsTypingOther(false);
      }
    });
    return () => unsub();
  }, [chat?.id, chat?.otherUser?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTypingOther]);

  // Set self online, update lastSeen on unmount
  useEffect(() => {
    if (!currentUser?.uid) return;
    const userRef = doc(db, "users", currentUser.uid);
    updateDoc(userRef, { online: true }).catch(() => {});
    return () => {
      updateDoc(userRef, { online: false, lastSeen: serverTimestamp() }).catch(
        () => {},
      );
    };
  }, [currentUser?.uid]);

  const getOrCreateChatId = async () => {
    if (chat.id) return chat.id;
    const otherUserId = chat.otherUser?.id;
    if (!otherUserId) return null;
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", currentUser.uid),
    );
    const snap = await getDocs(q);
    const existing = snap.docs.find((d) =>
      (d.data().participants || []).includes(otherUserId),
    );
    if (existing) {
      chat.id = existing.id;
      return existing.id;
    }
    const newChat = await addDoc(collection(db, "chats"), {
      participants: [currentUser.uid, otherUserId],
      createdAt: serverTimestamp(),
    });
    chat.id = newChat.id;
    typingDocRef.current = doc(
      db,
      "chats",
      newChat.id,
      "typing",
      currentUser.uid,
    );
    return newChat.id;
  };

  const handleTyping = async (val) => {
    setText(val);
    if (!chat?.id) return;
    if (typingDocRef.current) {
      await setDoc(typingDocRef.current, {
        typing: true,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(async () => {
      if (typingDocRef.current) {
        await deleteDoc(typingDocRef.current).catch(() => {});
      }
    }, 3000);
  };

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const chatId = await getOrCreateChatId();
    if (!chatId) return;
    clearTimeout(typingTimeoutRef.current);
    if (typingDocRef.current)
      await deleteDoc(typingDocRef.current).catch(() => {});
    await addDoc(collection(db, "messages"), {
      chatId,
      text: trimmed,
      senderId: currentUser.uid,
      createdAt: serverTimestamp(),
      read: false,
    });
    setText("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const grouped = [];
  let lastDate = null;
  messages.forEach((m) => {
    const label = m.createdAt ? formatDate(m.createdAt) : null;
    if (label && label !== lastDate) {
      grouped.push({ type: "date", label });
      lastDate = label;
    }
    grouped.push({ type: "msg", msg: m });
  });

  const displayUser = otherUserData || chat?.otherUser;
  const isOnline = displayUser?.online;
  const statusText = isTypingOther
    ? null
    : isOnline
      ? "Online"
      : formatLastSeen(displayUser?.lastSeen);

  if (!chat) {
    return (
      <div
        style={{
          flex: 1,
          background: "#f0f2f5",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 64 }}>💬</div>
        <div
          style={{
            color: "#8696a0",
            fontSize: 16,
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          Select a chat to start messaging
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#efeae2",
        minWidth: 0,
      }}
    >
      {/* Chat Header */}
      <div
        style={{
          background: "#f0f2f5",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid #ddd",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          title="Back"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#54656f",
            padding: 4,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <BackIcon />
        </button>
        <Avatar
          name={displayUser?.name || "?"}
          photoURL={displayUser?.photoURL}
          size={40}
          online={isOnline}
        />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            style={{
              color: "#111b21",
              fontWeight: 700,
              fontSize: 15,
              fontFamily: "'Nunito', sans-serif",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayUser?.name || "Unknown"}
          </div>
          {/* Online / Last seen / Typing */}
          <div
            style={{
              fontSize: 12,
              color: isTypingOther || isOnline ? "#25D366" : "#8696a0",
              display: "flex",
              alignItems: "center",
              gap: 5,
              transition: "color 0.3s",
            }}
          >
            {isTypingOther ? (
              <>
                <span>typing</span>
                <TypingDots />
              </>
            ) : (
              statusText
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
          {["🔍", "📞", "⋮"].map((ic, i) => (
            <button
              key={i}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#54656f",
                fontSize: 18,
                padding: 4,
              }}
            >
              {ic}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {grouped.map((item, i) =>
          item.type === "date" ? (
            <DateDivider key={i} label={item.label} />
          ) : (
            <Bubble
              key={item.msg.id}
              msg={item.msg}
              isMine={item.msg.senderId === currentUser?.uid}
              senderName={userCache[item.msg.senderId]?.name}
            />
          ),
        )}
        {/* Animated typing bubble */}
        {isTypingOther && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              padding: "4px 10px",
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "18px 18px 18px 4px",
                padding: "12px 16px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          gap: 10,
          background: "#f0f2f5",
          borderTop: "1px solid #ddd",
          flexShrink: 0,
        }}
      >
        <button
          style={{
            background: "none",
            border: "none",
            color: "#8696a0",
            fontSize: 22,
            cursor: "pointer",
            padding: 4,
            flexShrink: 0,
          }}
        >
          😊
        </button>
        <button
          style={{
            background: "none",
            border: "none",
            color: "#8696a0",
            fontSize: 22,
            cursor: "pointer",
            padding: 4,
            flexShrink: 0,
          }}
        >
          📎
        </button>
        <input
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message"
          style={{
            flex: 1,
            background: "#fff",
            border: "none",
            borderRadius: 24,
            padding: "10px 16px",
            color: "#111b21",
            fontSize: 14.5,
            outline: "none",
            fontFamily: "'Nunito', sans-serif",
            minWidth: 0,
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: text.trim() ? "#00a884" : "#8696a0",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            transition: "background 0.2s",
            flexShrink: 0,
            color: "#fff",
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
      // Mark online
      await updateDoc(doc(db, "users", user.uid), { online: true }).catch(
        () => {},
      );
    });
    return () => unsubAuth();
  }, []);

  // Load chats with unread counts
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", currentUser.uid),
    );
    const unsub = onSnapshot(q, async (snap) => {
      const chatList = await Promise.all(
        snap.docs.map(async (d) => {
          const data = { id: d.id, ...d.data() };
          const otherId = data.participants?.find((p) => p !== currentUser.uid);
          let otherUser = null;
          if (otherId) {
            const uDoc = await getDoc(doc(db, "users", otherId));
            if (uDoc.exists()) otherUser = { id: otherId, ...uDoc.data() };
          }

          // Get last message for chat
          const msgQ = query(
            collection(db, "messages"),
            where("chatId", "==", d.id),
            orderBy("createdAt", "desc"),
            // Limit to 1 to optimize
            limit(1),
          );
          const msgSnap = await getDocs(msgQ);
          const lastMsg = msgSnap.docs[0]?.data();

          // Get unread count for this chat
          const unreadQ = query(
            collection(db, "messages"),
            where("chatId", "==", d.id),
            where("senderId", "!=", currentUser.uid), // Only one inequality filter
            where("read", "==", false), // Equality filter (allowed!)
          );
          const unreadSnap = await getDocs(unreadQ);
          const unreadCount = unreadSnap.size;

          return {
            ...data,
            otherUser,
            lastMessage: lastMsg?.text || "",
            lastMessageTime: lastMsg?.createdAt || data.createdAt,
            unreadCount,
          };
        }),
      );
      // Sort chats by last message time descending
      chatList.sort(
        (a, b) =>
          (b.lastMessageTime?.seconds || 0) - (a.lastMessageTime?.seconds || 0),
      );
      setChats(chatList);
    });
    return () => unsub();
  }, [currentUser]);

  // Listen to typing indicators for all chats
  useEffect(() => {
    if (!currentUser || chats.length === 0) return;
    const unsubs = chats.map((chat) => {
      if (!chat.id || !chat.otherUser?.id) return () => {};
      const typRef = doc(db, "chats", chat.id, "typing", chat.otherUser.id);
      return onSnapshot(typRef, (snap) => {
        if (snap.exists()) {
          const age = Date.now() - (snap.data().updatedAt?.toMillis?.() || 0);
          setTypingMap((prev) => ({ ...prev, [chat.id]: age < 5000 }));
        } else {
          setTypingMap((prev) => ({ ...prev, [chat.id]: false }));
        }
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [chats.length, currentUser]);

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    // Reset unread locally immediately
    setChats((prev) =>
      prev.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c)),
    );
  };

  const showSidebar = !isMobile || !activeChat;
  const showChat = !isMobile || !!activeChat;
  const handleBackToDashboard =
    onBackToDashboard || (() => window.history.back());

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
      `}</style>
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          fontFamily: "'Nunito', sans-serif",
          overflow: "hidden",
          background: "#f0f2f5",
        }}
      >
        {showSidebar && (
          <Sidebar
            chats={chats}
            currentUser={currentUser}
            onSelectChat={handleSelectChat}
            activeChatId={activeChat?.id}
            isMobile={isMobile}
            onBackToDashboard={handleBackToDashboard}
            typingMap={typingMap}
          />
        )}
        {showChat &&
          (activeChat ? (
            <ChatPanel
              chat={activeChat}
              currentUser={currentUser}
              isMobile={isMobile}
              onClose={() => setActiveChat(null)}
            />
          ) : (
            !isMobile && (
              <div
                style={{
                  flex: 1,
                  background: "#f0f2f5",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 64 }}>💬</div>
                <div
                  style={{
                    color: "#8696a0",
                    fontSize: 16,
                    fontFamily: "'Nunito', sans-serif",
                  }}
                >
                  Select a chat to start messaging
                </div>
              </div>
            )
          ))}
      </div>
    </>
  );
}
