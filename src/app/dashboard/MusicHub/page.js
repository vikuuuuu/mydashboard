// app/musichub/page.js
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, where, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { logToolUsage } from '@/lib/firestore';
import styles from './musichub.module.css';

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
function extractVideoId(url) {
  if (!url) return null;
  const match = url.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  return match?.[2]?.length === 11 ? match[2] : null;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function makeTrackPayload(title, url, videoId) {
  return { id: generateId(), title, url, videoId, lyrics: '', addedAt: new Date().toISOString() };
}

function formatTime(sec) {
  if (!sec || !isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getPlaylistCoverUrl(playlist) {
  const firstWithVideo = playlist.tracks?.find(t => t.videoId);
  return firstWithVideo ? `https://img.youtube.com/vi/${firstWithVideo.videoId}/mqdefault.jpg` : null;
}

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */

/** Single track row — inline edit, drag-reorder, pin, lyrics */
function TrackRow({
  track,
  index,
  playlistId,
  isActive,
  canEdit,
  isOwner,
  onPlay,
  onMoveUp,
  onMoveDown,
  onEjectToQuick,
  onEdit,
  onDelete,
  onOpenLyrics,
  totalTracks,
  draggable,
  onDragStartRow,
  onDropRow,
  // quick-song-only props
  isQuickSong,
  quickSongId,
  playlists,
  onMoveQuickToPlaylist,
  pinned,
  onTogglePin,
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: track.title, url: track.url || '' });
  const [dragOver, setDragOver] = useState(false);

  function handleSave() {
    const vid = extractVideoId(form.url);
    if (!form.title.trim()) return alert('Track title is required.');
    if (!isQuickSong && !vid) return alert('Invalid YouTube URL.');
    onEdit({ title: form.title.trim(), url: form.url.trim(), videoId: vid });
    setEditing(false);
  }

  return (
    <div
      className={`${styles.trackRow} ${isActive ? styles.trackRowActive : ''} ${dragOver ? styles.trackRowDragOver : ''}`}
      draggable={draggable && !editing}
      onDragStart={() => onDragStartRow?.(index)}
      onDragOver={e => { if (draggable) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); onDropRow?.(index); }}
    >
      <div className={styles.trackLeft}>
        {!isQuickSong && <span className={styles.trackNum}>{String(index + 1).padStart(2, '0')}</span>}
        {isQuickSong && (
          <button
            className={`${styles.pinBtn} ${pinned ? styles.pinBtnActive : ''}`}
            onClick={onTogglePin}
            title={pinned ? 'Unpin' : 'Pin to top'}
          >📌</button>
        )}
        <button className={styles.playBtn} onClick={onPlay} title="Play">▶</button>

        {editing ? (
          <div className={styles.inlineEditRow} onClick={e => e.stopPropagation()}>
            <input
              className={styles.inlineInput}
              value={form.title}
              placeholder="Track title"
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            {!isQuickSong && (
              <input
                className={styles.inlineInput}
                value={form.url}
                placeholder="YouTube URL"
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
            )}
            <button className={styles.inlineSaveBtn} onClick={handleSave}>✓</button>
            <button className={styles.inlineCancelBtn} onClick={() => setEditing(false)}>✕</button>
          </div>
        ) : (
          <div className={styles.trackMeta}>
            <p className={styles.trackTitle} onClick={onPlay}>{track.title}</p>
          </div>
        )}
      </div>

      {!editing && (
        <div className={styles.trackActions}>
          {isQuickSong && playlists?.length > 0 && (
            <select
              className={styles.moveSelect}
              defaultValue=""
              onChange={e => { onMoveQuickToPlaylist(e.target.value); e.target.value = ''; }}
            >
              <option value="" disabled>Move to…</option>
              {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button
            className={`${styles.iconBtn} ${track.lyrics ? styles.iconBtnHighlight : ''}`}
            title="Lyrics"
            onClick={onOpenLyrics}
          >📝</button>
          {canEdit && !isQuickSong && (
            <button className={styles.iconBtn} title="Eject to Quick Songs" onClick={onEjectToQuick}>📤</button>
          )}
          {(canEdit || isQuickSong) && (
            <button className={styles.iconBtn} onClick={() => { setEditing(true); setForm({ title: track.title, url: track.url || '' }); }}>✏️</button>
          )}
          {canEdit && !isQuickSong && (
            <>
              <button className={styles.iconBtn} onClick={onMoveUp} disabled={index === 0} title="Move up">▲</button>
              <button className={styles.iconBtn} onClick={onMoveDown} disabled={index === totalTracks - 1} title="Move down">▼</button>
              <span className={styles.dragHandle} title="Drag to reorder">⠿</span>
            </>
          )}
          <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onDelete}>✕</button>
        </div>
      )}
    </div>
  );
}

/** Comment feed + input for a playlist */
function CommentFeed({ playlist, onPost }) {
  const [text, setText] = useState('');

  function handlePost() {
    if (!text.trim()) return;
    onPost(playlist.id, text.trim());
    setText('');
  }

  return (
    <div className={styles.comments}>
      <p className={styles.commentsTitle}>💬 Team comments</p>
      <div className={styles.commentsFeed}>
        {(playlist.comments || []).map((c, i) => (
          <div key={i} className={styles.commentBubble}>
            <span className={styles.commentAuthor}>{c.authorName}</span>
            <span className={styles.commentText}>{c.text}</span>
          </div>
        ))}
      </div>
      <div className={styles.commentInputRow}>
        <input
          className={styles.input}
          placeholder="Add a comment…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handlePost()}
        />
        <button className={styles.commentSendBtn} onClick={handlePost}>Send</button>
      </div>
    </div>
  );
}

/** Toast stack */
function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className={styles.toastStack}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={`${styles.toast} ${t.type === 'error' ? styles.toastError : styles.toastSuccess}`}
          onClick={() => onDismiss(t.id)}
        >
          <span>{t.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/** Custom confirm dialog — replaces window.confirm */
function ConfirmDialog({ state, onCancel }) {
  if (!state?.open) return null;
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
        <p className={styles.confirmMessage}>{state.message}</p>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={`${styles.confirmBtn} ${styles.confirmBtnDanger}`} onClick={state.onConfirm}>
            {state.confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lyrics modal — view or edit lyrics for a track */
function LyricsModal({ state, onClose, onSave, onDraftChange }) {
  if (!state?.open) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.lyricsModal} onClick={e => e.stopPropagation()}>
        <div className={styles.lyricsHeader}>
          <h3 className={styles.modalTitle}>📝 {state.title}</h3>
          <button className={styles.closeX} onClick={onClose}>✕</button>
        </div>

        {state.canEdit ? (
          <textarea
            className={styles.lyricsTextarea}
            value={state.draft}
            placeholder="Paste or type the lyrics here…"
            onChange={e => onDraftChange(e.target.value)}
          />
        ) : (
          <div className={styles.lyricsView}>
            {state.draft
              ? state.draft.split('\n').map((line, i) => <p key={i}>{line || '\u00A0'}</p>)
              : <p className={styles.empty}>No lyrics added yet.</p>}
          </div>
        )}

        {state.canEdit && (
          <div className={styles.modalActions}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button className={styles.confirmBtn} onClick={onSave}>Save Lyrics</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
export default function MusicHubPage() {
  const router = useRouter();

  // Auth
  const [uid, setUid] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data
  const [playlists, setPlaylists] = useState([]);
  const [sharedPlaylists, setSharedPlaylists] = useState([]);
  const [quickSongs, setQuickSongs] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  // Player
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [nowPlayingTitle, setNowPlayingTitle] = useState('');
  const [queuePlaylist, setQueuePlaylist] = useState(null);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [ytReady, setYtReady] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // off | all | one
  const [playerStatus, setPlayerStatus] = useState({
    isPlaying: false, currentTime: 0, duration: 0, volume: 80, muted: false,
  });
  const playerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const shuffleRef = useRef(false);
  const repeatModeRef = useRef('off');
  const queuePlaylistRef = useRef(null);
  const queueIndexRef = useRef(-1);
  const dragFromRef = useRef(null);

  // UI
  const [activeTab, setActiveTab] = useState('quick');
  const [searchQ, setSearchQ] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [lyricsState, setLyricsState] = useState(null);
  const toastTimers = useRef({});

  // Add-track form
  const [trackForm, setTrackForm] = useState({ title: '', url: '', targetPlaylist: 'quick' });

  // Playlist inline-edit
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  const [playlistEditForm, setPlaylistEditForm] = useState({ name: '', desc: '' });

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', desc: '' });
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [shareForm, setShareForm] = useState({ email: '', permission: 'view' });

  /* ── Toasts ── */
  const addToast = useCallback((message, type = 'success') => {
    const id = generateId();
    setToasts(t => [...t, { id, message, type }]);
    toastTimers.current[id] = setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id));
      delete toastTimers.current[id];
    }, 3200);
  }, []);
  const dismissToast = useCallback(id => {
    setToasts(t => t.filter(x => x.id !== id));
    if (toastTimers.current[id]) { clearTimeout(toastTimers.current[id]); delete toastTimers.current[id]; }
  }, []);

  /* ── Confirm dialog ── */
  function askConfirm(message, onConfirm, confirmLabel) {
    setConfirmState({
      open: true,
      message,
      confirmLabel,
      onConfirm: () => { onConfirm(); setConfirmState(null); },
    });
  }

  /* ── Auth ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        setUid(user.uid);
        setCurrentUser({ uid: user.uid, email: user.email, displayName: user.displayName || 'User' });
        logToolUsage({ userId: user.uid, tool: 'MusicHub', action: 'PAGE_VISIT' });
      } else {
        router.push('/login');
      }
    });
    return unsub;
  }, [router]);

  /* ── Data fetch ── */
  const fetchData = useCallback(async () => {
    if (!uid || !currentUser?.email) return;
    try {
      const [ownedSnap, sharedSnap, quickSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, 'playlists'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'playlists'), where('sharedWithEmails', 'array-contains', currentUser.email))),
        getDocs(query(collection(db, `users/${uid}/quicksongs`), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'users')),
      ]);
      setPlaylists(ownedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSharedPlaylists(sharedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setQuickSongs(quickSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== uid));
    } catch (err) {
      console.error('[MusicHub] fetch error:', err);
      addToast('Could not load your data. Retrying may help.', 'error');
    } finally {
      setLoading(false);
    }
  }, [uid, currentUser, addToast]);

  useEffect(() => {
    if (uid && currentUser?.email) fetchData();
  }, [uid, currentUser, fetchData]);

  /* ── Keep refs in sync (avoid stale closures inside YT event callbacks) ── */
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { queuePlaylistRef.current = queuePlaylist; }, [queuePlaylist]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  /* ── Local state helpers (optimistic updates — no full refetch) ── */
  function updateLocalPlaylistTracks(playlistId, tracks) {
    setPlaylists(ps => ps.map(p => (p.id === playlistId ? { ...p, tracks } : p)));
    setSharedPlaylists(ps => ps.map(p => (p.id === playlistId ? { ...p, tracks } : p)));
  }
  function updateLocalPlaylist(playlistId, updater) {
    setPlaylists(ps => ps.map(p => (p.id === playlistId ? updater(p) : p)));
    setSharedPlaylists(ps => ps.map(p => (p.id === playlistId ? updater(p) : p)));
  }

  /* ── Load YouTube IFrame API once ── */
  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtReady(true); return; }
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
    const prevCb = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      setYtReady(true);
      if (typeof prevCb === 'function') prevCb();
    };
  }, []);

  /* ── Progress timer ── */
  function startProgressTimer() {
    stopProgressTimer();
    progressTimerRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== 'function') return;
      setPlayerStatus(s => ({ ...s, currentTime: p.getCurrentTime() || 0, duration: p.getDuration() || 0 }));
    }, 500);
  }
  function stopProgressTimer() {
    if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
  }
  useEffect(() => () => stopProgressTimer(), []);

  /* ── Track-ended logic (repeat / shuffle / auto-advance) ── */
  function handleTrackEnded() {
    stopProgressTimer();
    if (repeatModeRef.current === 'one') {
      playerRef.current?.seekTo(0);
      playerRef.current?.playVideo();
      return;
    }
    const pl = queuePlaylistRef.current;
    const idx = queueIndexRef.current;
    if (!pl || idx < 0 || !pl.tracks?.length) return;
    let nextIdx;
    if (shuffleRef.current && pl.tracks.length > 1) {
      do { nextIdx = Math.floor(Math.random() * pl.tracks.length); } while (nextIdx === idx);
    } else {
      nextIdx = idx + 1;
      if (nextIdx >= pl.tracks.length) {
        if (repeatModeRef.current === 'all') nextIdx = 0;
        else { setQueuePlaylist(null); setQueueIndex(-1); return; }
      }
    }
    const t = pl.tracks[nextIdx];
    if (!t) return;
    setQueueIndex(nextIdx);
    setActiveVideoId(t.videoId);
    setNowPlayingTitle(t.title);
  }

  function handlePlayerStateChange(e) {
    const state = e.data;
    setPlayerStatus(s => ({ ...s, isPlaying: state === window.YT.PlayerState.PLAYING }));
    if (state === window.YT.PlayerState.PLAYING) startProgressTimer();
    if (state === window.YT.PlayerState.PAUSED) stopProgressTimer();
    if (state === window.YT.PlayerState.ENDED) handleTrackEnded();
  }

  /* ── Create / update the YT player when the active video changes ── */
  useEffect(() => {
    if (!ytReady || !activeVideoId) return;
    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
      playerRef.current.loadVideoById(activeVideoId);
      return;
    }
    playerRef.current = new window.YT.Player('yt-player-mount', {
      videoId: activeVideoId,
      playerVars: { autoplay: 1, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: e => { e.target.setVolume(playerStatus.volume); e.target.playVideo(); },
        onStateChange: handlePlayerStateChange,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytReady, activeVideoId]);

  /* ── Spacebar play/pause shortcut ── */
  useEffect(() => {
    function handleKey(e) {
      const tag = document.activeElement?.tagName;
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && activeVideoId) {
        e.preventDefault();
        togglePlayPause();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerStatus.isPlaying, activeVideoId]);

  /* ── Player controls ── */
  function play(url, title, playlist = null, index = -1) {
    const vid = extractVideoId(url);
    if (!vid) return addToast('Could not parse a YouTube video ID from that URL.', 'error');
    setActiveVideoId(vid);
    setNowPlayingTitle(title);
    setQueuePlaylist(playlist);
    setQueueIndex(index);
  }

  function togglePlayPause() {
    if (!playerRef.current) return;
    if (playerStatus.isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }

  function playNextManual() {
    const pl = queuePlaylistRef.current;
    const idx = queueIndexRef.current;
    if (!pl?.tracks?.length) return;
    let nextIdx;
    if (shuffleRef.current && pl.tracks.length > 1) {
      do { nextIdx = Math.floor(Math.random() * pl.tracks.length); } while (nextIdx === idx);
    } else {
      nextIdx = Math.min(idx + 1, pl.tracks.length - 1);
    }
    const t = pl.tracks[nextIdx];
    if (!t) return;
    setQueueIndex(nextIdx);
    setActiveVideoId(t.videoId);
    setNowPlayingTitle(t.title);
  }

  function playPrevManual() {
    const pl = queuePlaylistRef.current;
    const idx = queueIndexRef.current;
    if (!pl?.tracks?.length) return;
    const prevIdx = Math.max(idx - 1, 0);
    const t = pl.tracks[prevIdx];
    if (!t) return;
    setQueueIndex(prevIdx);
    setActiveVideoId(t.videoId);
    setNowPlayingTitle(t.title);
  }

  function handleSeek(e) {
    if (!playerRef.current || !playerStatus.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    playerRef.current.seekTo(pct * playerStatus.duration, true);
  }

  function handleVolumeChange(e) {
    const v = Number(e.target.value);
    setPlayerStatus(s => ({ ...s, volume: v, muted: v === 0 }));
    playerRef.current?.setVolume(v);
    if (v === 0) playerRef.current?.mute();
    else playerRef.current?.unMute();
  }

  function toggleMute() {
    if (!playerRef.current) return;
    if (playerStatus.muted) { playerRef.current.unMute(); setPlayerStatus(s => ({ ...s, muted: false })); }
    else { playerRef.current.mute(); setPlayerStatus(s => ({ ...s, muted: true })); }
  }

  /* ── Computed ── */
  const allPlaylists = useMemo(() => [...playlists, ...sharedPlaylists], [playlists, sharedPlaylists]);

  const sortedQuickSongs = useMemo(() => {
    const arr = [...quickSongs];
    arr.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return arr;
  }, [quickSongs]);

  const filteredQuickSongs = useMemo(
    () => sortedQuickSongs.filter(s => s.title.toLowerCase().includes(searchQ.toLowerCase())),
    [sortedQuickSongs, searchQ]
  );

  function trackMatches(t) {
    return t.title.toLowerCase().includes(searchQ.toLowerCase());
  }

  /* ── Lyrics ── */
  function openLyricsFor(track, target, canEditFlag) {
    setLyricsState({
      open: true,
      title: track.title,
      draft: track.lyrics || '',
      canEdit: canEditFlag,
      target,
    });
  }

  async function saveLyrics() {
    if (!lyricsState?.target) return;
    const { target, draft } = lyricsState;
    if (target.type === 'quick') {
      setQuickSongs(qs => qs.map(s => (s.id === target.id ? { ...s, lyrics: draft } : s)));
      try {
        await updateDoc(doc(db, `users/${uid}/quicksongs`, target.id), { lyrics: draft });
        addToast('Lyrics saved.');
      } catch (err) {
        console.error(err);
        addToast('Could not save lyrics.', 'error');
        fetchData();
      }
    } else {
      const p = allPlaylists.find(pl => pl.id === target.playlistId);
      if (!p) return;
      const tracks = [...p.tracks];
      tracks[target.index] = { ...tracks[target.index], lyrics: draft };
      updateLocalPlaylistTracks(target.playlistId, tracks);
      try {
        await updateDoc(doc(db, 'playlists', target.playlistId), { tracks });
        addToast('Lyrics saved.');
      } catch (err) {
        console.error(err);
        addToast('Could not save lyrics.', 'error');
        fetchData();
      }
    }
    setLyricsState(null);
  }

  /* ── Playlist CRUD ── */
  async function createPlaylist() {
    const name = createForm.name.trim();
    if (!name) return addToast('Playlist name is required.', 'error');
    setSaving(true);
    try {
      const desc = createForm.desc.trim();
      const docRef = await addDoc(collection(db, 'playlists'), {
        name, desc, ownerId: uid,
        ownerName: currentUser.displayName, ownerEmail: currentUser.email,
        tracks: [], sharedWith: [], sharedWithEmails: [], comments: [],
        createdAt: serverTimestamp(),
      });
      setPlaylists(ps => [{
        id: docRef.id, name, desc, ownerId: uid,
        ownerName: currentUser.displayName, ownerEmail: currentUser.email,
        tracks: [], sharedWith: [], sharedWithEmails: [], comments: [],
      }, ...ps]);
      setShowCreateModal(false);
      setCreateForm({ name: '', desc: '' });
      addToast('Playlist created.');
    } catch (err) {
      console.error(err);
      addToast('Could not create playlist.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function savePlaylistMeta(id) {
    const name = playlistEditForm.name.trim();
    if (!name) return addToast('Playlist name cannot be empty.', 'error');
    const desc = playlistEditForm.desc.trim();
    updateLocalPlaylist(id, p => ({ ...p, name, desc }));
    setEditingPlaylistId(null);
    try {
      await updateDoc(doc(db, 'playlists', id), { name, desc });
    } catch (err) {
      console.error(err);
      addToast('Could not save changes.', 'error');
      fetchData();
    }
  }

  function deletePlaylist(id) {
    askConfirm('Delete this playlist permanently? This cannot be undone.', async () => {
      const snapshot = playlists;
      setPlaylists(ps => ps.filter(p => p.id !== id));
      try {
        await deleteDoc(doc(db, 'playlists', id));
        addToast('Playlist deleted.');
      } catch (err) {
        console.error(err);
        setPlaylists(snapshot);
        addToast('Could not delete playlist.', 'error');
      }
    });
  }

  function leaveSharedPlaylist(playlist) {
    askConfirm('Remove yourself from this shared playlist?', async () => {
      setSharedPlaylists(ps => ps.filter(p => p.id !== playlist.id));
      try {
        await updateDoc(doc(db, 'playlists', playlist.id), {
          sharedWith: (playlist.sharedWith || []).filter(u => u.email !== currentUser.email),
          sharedWithEmails: (playlist.sharedWithEmails || []).filter(e => e !== currentUser.email),
        });
      } catch (err) {
        console.error(err);
        addToast('Could not leave playlist.', 'error');
        fetchData();
      }
    });
  }

  /* ── Track CRUD ── */
  async function addTrack() {
    const title = trackForm.title.trim();
    const url = trackForm.url.trim();
    if (!title || !url) return addToast('Title and URL are both required.', 'error');
    const videoId = extractVideoId(url);
    if (!videoId) return addToast('Invalid YouTube URL — no video ID found.', 'error');
    setSaving(true);
    try {
      if (trackForm.targetPlaylist === 'quick') {
        const docRef = await addDoc(collection(db, `users/${uid}/quicksongs`), {
          ...makeTrackPayload(title, url, videoId), pinned: false, createdAt: serverTimestamp(),
        });
        setQuickSongs(qs => [{ id: docRef.id, title, url, videoId, lyrics: '', pinned: false, addedAt: new Date().toISOString() }, ...qs]);
      } else {
        const target = allPlaylists.find(p => p.id === trackForm.targetPlaylist);
        if (!target) { addToast('Playlist not found.', 'error'); return; }
        const isOwner = target.ownerId === uid;
        const canEdit = isOwner || target.sharedWith?.find(s => s.email === currentUser.email)?.permission === 'edit';
        if (!canEdit) { addToast("You don't have permission to add tracks to this playlist.", 'error'); return; }
        const tracks = [...(target.tracks || []), makeTrackPayload(title, url, videoId)];
        updateLocalPlaylistTracks(target.id, tracks);
        await updateDoc(doc(db, 'playlists', target.id), { tracks });
      }
      setTrackForm({ title: '', url: '', targetPlaylist: 'quick' });
      addToast('Track added.');
    } catch (err) {
      console.error(err);
      addToast('Could not add track.', 'error');
      fetchData();
    } finally {
      setSaving(false);
    }
  }

  async function moveQuickSongToPlaylist(song, playlistId) {
    if (!playlistId) return;
    const target = playlists.find(p => p.id === playlistId) || sharedPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    const newTrack = { id: song.id, title: song.title, url: song.url, videoId: song.videoId, lyrics: song.lyrics || '', addedAt: song.addedAt || new Date().toISOString() };
    const tracks = [...(target.tracks || []), newTrack];
    updateLocalPlaylistTracks(playlistId, tracks);
    setQuickSongs(qs => qs.filter(s => s.id !== song.id));
    try {
      await Promise.all([
        updateDoc(doc(db, 'playlists', playlistId), { tracks }),
        deleteDoc(doc(db, `users/${uid}/quicksongs`, song.id)),
      ]);
      addToast('Moved to playlist.');
    } catch (err) {
      console.error(err);
      addToast('Could not move track.', 'error');
      fetchData();
    }
  }

  async function ejectTrackToQuick(playlistId, index) {
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    const track = target.tracks[index];
    const tracks = target.tracks.filter((_, i) => i !== index);
    updateLocalPlaylistTracks(playlistId, tracks);
    const tempId = generateId();
    setQuickSongs(qs => [{ id: tempId, title: track.title, url: track.url, videoId: track.videoId, lyrics: track.lyrics || '', pinned: false, addedAt: new Date().toISOString() }, ...qs]);
    try {
      const docRef = await addDoc(collection(db, `users/${uid}/quicksongs`), {
        title: track.title, url: track.url, videoId: track.videoId, lyrics: track.lyrics || '', pinned: false,
        addedAt: new Date().toISOString(), createdAt: serverTimestamp(),
      });
      setQuickSongs(qs => qs.map(s => (s.id === tempId ? { ...s, id: docRef.id } : s)));
      await updateDoc(doc(db, 'playlists', playlistId), { tracks });
      addToast('Moved to Quick Songs.');
    } catch (err) {
      console.error(err);
      addToast('Could not eject track.', 'error');
      fetchData();
    }
  }

  async function editPlaylistTrack(playlistId, index, updated) {
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    const tracks = [...target.tracks];
    tracks[index] = { ...tracks[index], ...updated };
    updateLocalPlaylistTracks(playlistId, tracks);
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { tracks });
    } catch (err) {
      console.error(err);
      addToast('Could not save track.', 'error');
      fetchData();
    }
  }

  function deletePlaylistTrack(playlistId, index) {
    askConfirm('Remove this track from the playlist?', async () => {
      const target = allPlaylists.find(p => p.id === playlistId);
      if (!target) return;
      const tracks = target.tracks.filter((_, i) => i !== index);
      updateLocalPlaylistTracks(playlistId, tracks);
      try {
        await updateDoc(doc(db, 'playlists', playlistId), { tracks });
      } catch (err) {
        console.error(err);
        addToast('Could not remove track.', 'error');
        fetchData();
      }
    });
  }

  async function reorderTrack(playlistId, index, direction) {
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target?.tracks) return;
    const tracks = [...target.tracks];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= tracks.length) return;
    [tracks[index], tracks[swapIdx]] = [tracks[swapIdx], tracks[index]];
    updateLocalPlaylistTracks(playlistId, tracks);
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { tracks });
    } catch (err) {
      console.error(err);
      addToast('Could not reorder tracks.', 'error');
      fetchData();
    }
  }

  function handleDragStartRow(index) {
    dragFromRef.current = index;
  }
  async function handleDropRow(playlistId, toIndex) {
    const fromIndex = dragFromRef.current;
    dragFromRef.current = null;
    if (fromIndex === null || fromIndex === undefined || fromIndex === toIndex) return;
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target?.tracks) return;
    const tracks = [...target.tracks];
    const [moved] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, moved);
    updateLocalPlaylistTracks(playlistId, tracks);
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { tracks });
    } catch (err) {
      console.error(err);
      addToast('Could not reorder tracks.', 'error');
      fetchData();
    }
  }

  async function editQuickSong(id, title) {
    const t = title.trim();
    if (!t) return;
    setQuickSongs(qs => qs.map(s => (s.id === id ? { ...s, title: t } : s)));
    try {
      await updateDoc(doc(db, `users/${uid}/quicksongs`, id), { title: t });
    } catch (err) {
      console.error(err);
      addToast('Could not rename track.', 'error');
      fetchData();
    }
  }

  function deleteQuickSong(id) {
    askConfirm('Delete this track?', async () => {
      setQuickSongs(qs => qs.filter(s => s.id !== id));
      try {
        await deleteDoc(doc(db, `users/${uid}/quicksongs`, id));
      } catch (err) {
        console.error(err);
        addToast('Could not delete track.', 'error');
        fetchData();
      }
    });
  }

  async function togglePinQuickSong(id, pinned) {
    setQuickSongs(qs => qs.map(s => (s.id === id ? { ...s, pinned: !pinned } : s)));
    try {
      await updateDoc(doc(db, `users/${uid}/quicksongs`, id), { pinned: !pinned });
    } catch (err) {
      console.error(err);
      addToast('Could not update pin.', 'error');
      fetchData();
    }
  }

  /* ── Sharing ── */
  async function sharePlaylist() {
    if (!shareForm.email) return addToast('Select a user to share with.', 'error');
    if (shareTarget.sharedWithEmails?.includes(shareForm.email)) return addToast('This user already has access.', 'error');
    setSaving(true);
    const targetUser = allUsers.find(u => u.email === shareForm.email);
    const entry = { email: shareForm.email, name: targetUser?.displayName || targetUser?.name || 'Workspace member', permission: shareForm.permission };
    const playlistId = shareTarget.id;
    const prevSharedWith = shareTarget.sharedWith || [];
    const prevSharedWithEmails = shareTarget.sharedWithEmails || [];
    updateLocalPlaylist(playlistId, p => ({
      ...p,
      sharedWith: [...(p.sharedWith || []), entry],
      sharedWithEmails: [...(p.sharedWithEmails || []), shareForm.email],
    }));
    try {
      await updateDoc(doc(db, 'playlists', playlistId), {
        sharedWith: [...prevSharedWith, entry],
        sharedWithEmails: [...prevSharedWithEmails, shareForm.email],
      });
      setShowShareModal(false);
      setShareForm({ email: '', permission: 'view' });
      addToast('Playlist shared.');
    } catch (err) {
      console.error(err);
      addToast('Could not share playlist.', 'error');
      fetchData();
    } finally {
      setSaving(false);
    }
  }

  async function changePermission(playlist, email, permission) {
    updateLocalPlaylist(playlist.id, p => ({
      ...p, sharedWith: p.sharedWith.map(s => (s.email === email ? { ...s, permission } : s)),
    }));
    try {
      await updateDoc(doc(db, 'playlists', playlist.id), {
        sharedWith: playlist.sharedWith.map(s => (s.email === email ? { ...s, permission } : s)),
      });
    } catch (err) {
      console.error(err);
      addToast('Could not update permission.', 'error');
      fetchData();
    }
  }

  function revokeAccess(playlist, email) {
    askConfirm('Revoke access for this user?', async () => {
      updateLocalPlaylist(playlist.id, p => ({
        ...p,
        sharedWith: p.sharedWith.filter(s => s.email !== email),
        sharedWithEmails: p.sharedWithEmails.filter(e => e !== email),
      }));
      try {
        await updateDoc(doc(db, 'playlists', playlist.id), {
          sharedWith: playlist.sharedWith.filter(s => s.email !== email),
          sharedWithEmails: playlist.sharedWithEmails.filter(e => e !== email),
        });
      } catch (err) {
        console.error(err);
        addToast('Could not revoke access.', 'error');
        fetchData();
      }
    });
  }

  /* ── Comments ── */
  async function postComment(playlistId, text) {
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    const comment = { authorName: currentUser.displayName, authorEmail: currentUser.email, text, timestamp: new Date().toISOString() };
    updateLocalPlaylist(playlistId, p => ({ ...p, comments: [...(p.comments || []), comment] }));
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { comments: [...(target.comments || []), comment] });
    } catch (err) {
      console.error(err);
      addToast('Could not post comment.', 'error');
      fetchData();
    }
  }

  /* ── Render helpers ── */
  function renderPlaylistTracks(playlist, canEdit, isOwner) {
    const entries = (playlist.tracks || [])
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => !searchQ.trim() || trackMatches(t));

    if (!entries.length) {
      return (
        <p className={styles.empty}>
          {searchQ.trim() ? 'No matching tracks.' : 'No tracks yet — add one above.'}
        </p>
      );
    }
    return (
      <div className={styles.trackList}>
        {entries.map(({ t, idx }) => (
          <TrackRow
            key={t.id || idx}
            track={t}
            index={idx}
            playlistId={playlist.id}
            isActive={queuePlaylist?.id === playlist.id && queueIndex === idx}
            canEdit={canEdit}
            isOwner={isOwner}
            totalTracks={playlist.tracks.length}
            draggable={canEdit}
            onDragStartRow={handleDragStartRow}
            onDropRow={i => handleDropRow(playlist.id, i)}
            onPlay={() => play(t.url, t.title, playlist, idx)}
            onMoveUp={() => reorderTrack(playlist.id, idx, 'up')}
            onMoveDown={() => reorderTrack(playlist.id, idx, 'down')}
            onEjectToQuick={() => ejectTrackToQuick(playlist.id, idx)}
            onEdit={updated => editPlaylistTrack(playlist.id, idx, updated)}
            onDelete={() => deletePlaylistTrack(playlist.id, idx)}
            onOpenLyrics={() => openLyricsFor(t, { type: 'playlist', playlistId: playlist.id, index: idx }, canEdit)}
          />
        ))}
      </div>
    );
  }

  /* ─────────── RENDER ─────────── */
  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading Music Hub…</p>
      </div>
    );
  }

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
      <LyricsModal
        state={lyricsState}
        onClose={() => setLyricsState(null)}
        onSave={saveLyrics}
        onDraftChange={v => setLyricsState(s => ({ ...s, draft: v }))}
      />

      {/* TOP BAR */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Back</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🎵</div>
          <span>Music Hub</span>
        </div>
        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            placeholder="Search tracks…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
        <button className={styles.createBtn} onClick={() => setShowCreateModal(true)}>
          <span className={styles.desktopOnly}>+ New Playlist</span>
          <span className={styles.mobileOnly}>📁+</span>
        </button>
        <button className={styles.themeBtn} onClick={() => setIsDark(d => !d)}>
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* LAYOUT */}
      <div className={styles.layout}>

        {/* MAIN FEED */}
        <div className={styles.feed}>

          {/* ADD TRACK */}
          <div className={styles.addTrackCard}>
            <h3 className={styles.cardTitle}>Add a track</h3>
            <div className={styles.addTrackRow}>
              <input
                className={styles.input}
                placeholder="Title"
                value={trackForm.title}
                onChange={e => setTrackForm(f => ({ ...f, title: e.target.value }))}
              />
              <input
                className={styles.input}
                placeholder="YouTube URL"
                value={trackForm.url}
                onChange={e => setTrackForm(f => ({ ...f, url: e.target.value }))}
              />
              <select
                className={styles.select}
                value={trackForm.targetPlaylist}
                onChange={e => setTrackForm(f => ({ ...f, targetPlaylist: e.target.value }))}
              >
                <option value="quick">⚡ Quick Songs (no playlist)</option>
                {allPlaylists.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.ownerId === uid ? '📁 ' : '🌐 '}{p.name}
                  </option>
                ))}
              </select>
              <button className={styles.mountBtn} onClick={addTrack} disabled={saving}>
                {saving ? '…' : 'Add'}
              </button>
            </div>
          </div>

          {/* TABS */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'quick' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('quick')}
            >⚡ Quick Songs ({quickSongs.length})</button>
            <button
              className={`${styles.tab} ${activeTab === 'playlists' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('playlists')}
            >📁 My Playlists ({playlists.length})</button>
            <button
              className={`${styles.tab} ${activeTab === 'shared' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('shared')}
            >🌐 Shared With Me ({sharedPlaylists.length})</button>
          </div>

          {/* QUICK SONGS */}
          {activeTab === 'quick' && (
            <div className={styles.viewCard}>
              <p className={styles.sectionLabel}>Quick Songs — no playlist</p>
              {filteredQuickSongs.length === 0
                ? <p className={styles.empty}>{searchQ.trim() ? 'No matching tracks.' : 'No quick songs yet. Add one above.'}</p>
                : (
                  <div className={styles.trackList}>
                    {filteredQuickSongs.map(s => (
                      <TrackRow
                        key={s.id}
                        track={s}
                        index={0}
                        isActive={activeVideoId && extractVideoId(s.url) === activeVideoId && !queuePlaylist}
                        canEdit
                        isOwner
                        isQuickSong
                        quickSongId={s.id}
                        playlists={playlists}
                        totalTracks={1}
                        pinned={!!s.pinned}
                        onTogglePin={() => togglePinQuickSong(s.id, s.pinned)}
                        onPlay={() => play(s.url, s.title)}
                        onEdit={({ title }) => editQuickSong(s.id, title)}
                        onDelete={() => deleteQuickSong(s.id)}
                        onMoveQuickToPlaylist={playlistId => moveQuickSongToPlaylist(s, playlistId)}
                        onOpenLyrics={() => openLyricsFor(s, { type: 'quick', id: s.id }, true)}
                      />
                    ))}
                  </div>
                )
              }
            </div>
          )}

          {/* MY PLAYLISTS */}
          {activeTab === 'playlists' && (
            <div className={styles.playlistGrid}>
              {playlists.length === 0
                ? <p className={styles.empty}>You haven't created any playlists yet.</p>
                : playlists.map(p => {
                  const coverUrl = getPlaylistCoverUrl(p);
                  return (
                    <div key={p.id} className={styles.playlistCard}>
                      <div className={styles.playlistHeader}>
                        <div className={styles.playlistHeaderLeft}>
                          {editingPlaylistId === p.id ? (
                            <div className={styles.metaEditStack}>
                              <input
                                className={styles.input}
                                value={playlistEditForm.name}
                                placeholder="Playlist name"
                                onChange={e => setPlaylistEditForm(f => ({ ...f, name: e.target.value }))}
                              />
                              <input
                                className={styles.input}
                                value={playlistEditForm.desc}
                                placeholder="Description (optional)"
                                onChange={e => setPlaylistEditForm(f => ({ ...f, desc: e.target.value }))}
                              />
                              <div className={styles.metaEditActions}>
                                <button className={styles.metaSaveBtn} onClick={() => savePlaylistMeta(p.id)}>Save</button>
                                <button className={styles.metaCancelBtn} onClick={() => setEditingPlaylistId(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className={styles.playlistTitleRow}>
                              {coverUrl
                                ? <img src={coverUrl} alt="" className={styles.playlistCover} />
                                : <div className={styles.playlistCoverFallback}>📁</div>}
                              <div>
                                <h4 className={styles.playlistName}>
                                  {p.name}
                                  <button
                                    className={styles.editNameBtn}
                                    onClick={() => { setEditingPlaylistId(p.id); setPlaylistEditForm({ name: p.name, desc: p.desc || '' }); }}
                                  >✏️ Edit</button>
                                </h4>
                                <p className={styles.playlistDesc}>{p.desc || 'No description.'}</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className={styles.playlistHeaderRight}>
                          <button className={styles.shareBtn} onClick={() => { setShareTarget(p); setShowShareModal(true); }}>🌐 Share</button>
                          <button className={styles.deleteBtn} onClick={() => deletePlaylist(p.id)}>🗑️ Delete</button>
                        </div>
                      </div>

                      {p.sharedWith?.length > 0 && (
                        <div className={styles.sharedUsersRow}>
                          <span className={styles.sharedLabel}>Shared with</span>
                          {p.sharedWith.map((u, i) => (
                            <div key={i} className={styles.userChip}>
                              <span className={styles.userName}>👤 {u.name}</span>
                              <select
                                className={styles.permSelect}
                                value={u.permission}
                                onChange={e => changePermission(p, u.email, e.target.value)}
                              >
                                <option value="view">View</option>
                                <option value="edit">Edit</option>
                              </select>
                              <button className={styles.revokeBtn} onClick={() => revokeAccess(p, u.email)}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {renderPlaylistTracks(p, true, true)}
                      <CommentFeed playlist={p} onPost={postComment} />
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* SHARED WITH ME */}
          {activeTab === 'shared' && (
            <div className={styles.playlistGrid}>
              {sharedPlaylists.length === 0
                ? <p className={styles.empty}>No playlists have been shared with you yet.</p>
                : sharedPlaylists.map(p => {
                  const myRole = p.sharedWith?.find(s => s.email === currentUser.email);
                  const canEdit = myRole?.permission === 'edit';
                  const coverUrl = getPlaylistCoverUrl(p);
                  return (
                    <div key={p.id} className={styles.playlistCardShared}>
                      <div className={styles.playlistHeader}>
                        <div className={styles.playlistTitleRow}>
                          {coverUrl
                            ? <img src={coverUrl} alt="" className={styles.playlistCover} />
                            : <div className={styles.playlistCoverFallback}>🌐</div>}
                          <div>
                            <h4 className={styles.playlistName}>{p.name}</h4>
                            <p className={styles.playlistDesc}>by {p.ownerName} ({p.ownerEmail})</p>
                          </div>
                        </div>
                        <div className={styles.playlistHeaderRight}>
                          <span className={styles.roleBadge}>{myRole?.permission?.toUpperCase()}</span>
                          <button className={styles.deleteBtn} onClick={() => leaveSharedPlaylist(p)}>Leave</button>
                        </div>
                      </div>
                      {renderPlaylistTracks(p, canEdit, false)}
                      <CommentFeed playlist={p} onPost={postComment} />
                    </div>
                  );
                })
              }
            </div>
          )}
        </div>

        {/* SIDEBAR PLAYER */}
        <div className={styles.sidebar}>
          <div className={styles.player}>
            <h3 className={styles.cardTitle}>Now Playing</h3>
            <div className={styles.playerInner}>
              <div className={styles.videoWrap}>
                <div id="yt-player-mount" className={styles.ytMount}></div>
                {!activeVideoId && (
                  <div className={styles.playerIdleOverlay}>
                    <div className={styles.playerIdleIcon}>🎵</div>
                    <p>Select a track to play</p>
                  </div>
                )}
              </div>

              {activeVideoId && (
                <>
                  <div className={styles.nowPlaying}>
                    <p className={styles.nowPlayingLabel}>▶ Now playing</p>
                    <p className={styles.nowPlayingTitle}>{nowPlayingTitle}</p>
                    {queuePlaylist && (
                      <span className={styles.queueInfo}>
                        Track {queueIndex + 1} of {queuePlaylist.tracks?.length} · {queuePlaylist.name}
                      </span>
                    )}
                  </div>

                  <div className={styles.playerControls}>
                    <div className={styles.progressRow} onClick={handleSeek}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${playerStatus.duration ? (playerStatus.currentTime / playerStatus.duration) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className={styles.timeRow}>
                      <span>{formatTime(playerStatus.currentTime)}</span>
                      <span>{formatTime(playerStatus.duration)}</span>
                    </div>
                    <div className={styles.controlsRow}>
                      <button
                        className={`${styles.ctrlBtn} ${shuffle ? styles.ctrlBtnActive : ''}`}
                        onClick={() => setShuffle(s => !s)}
                        title="Shuffle"
                      >🔀</button>
                      <button className={styles.ctrlBtn} onClick={playPrevManual} title="Previous">⏮</button>
                      <button className={styles.playPauseBtn} onClick={togglePlayPause} title={playerStatus.isPlaying ? 'Pause' : 'Play'}>
                        {playerStatus.isPlaying ? '⏸' : '▶'}
                      </button>
                      <button className={styles.ctrlBtn} onClick={playNextManual} title="Next">⏭</button>
                      <button
                        className={`${styles.ctrlBtn} ${repeatMode !== 'off' ? styles.ctrlBtnActive : ''}`}
                        onClick={() => setRepeatMode(m => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'))}
                        title={`Repeat: ${repeatMode}`}
                      >{repeatMode === 'one' ? '🔂' : '🔁'}</button>
                    </div>
                    <div className={styles.volumeRow}>
                      <button className={styles.ctrlBtn} onClick={toggleMute}>
                        {playerStatus.muted || playerStatus.volume === 0 ? '🔇' : '🔊'}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={playerStatus.muted ? 0 : playerStatus.volume}
                        onChange={handleVolumeChange}
                        className={styles.volumeSlider}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CREATE PLAYLIST MODAL */}
      {showCreateModal && (
        <div className={styles.overlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>New Playlist</h3>
            <div className={styles.modalForm}>
              <input
                className={styles.input}
                placeholder="Playlist name"
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
              />
              <textarea
                className={styles.textarea}
                placeholder="Description (optional)"
                value={createForm.desc}
                onChange={e => setCreateForm(f => ({ ...f, desc: e.target.value }))}
              />
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button className={styles.confirmBtn} onClick={createPlaylist} disabled={saving}>
                  {saving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHARE MODAL */}
      {showShareModal && shareTarget && (
        <div className={styles.overlay} onClick={() => setShowShareModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Share "{shareTarget.name}"</h3>
            <div className={styles.modalForm}>
              <select
                className={styles.select}
                value={shareForm.email}
                onChange={e => setShareForm(f => ({ ...f, email: e.target.value }))}
              >
                <option value="">Select a person…</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.email}>
                    {u.displayName || u.name || 'Workspace member'} ({u.email})
                  </option>
                ))}
              </select>
              <select
                className={styles.select}
                value={shareForm.permission}
                onChange={e => setShareForm(f => ({ ...f, permission: e.target.value }))}
              >
                <option value="view">👀 Can view</option>
                <option value="edit">✏️ Can edit</option>
              </select>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowShareModal(false)}>Cancel</button>
                <button className={styles.confirmBtn} onClick={sharePlaylist} disabled={saving}>
                  {saving ? 'Sharing…' : 'Share'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
