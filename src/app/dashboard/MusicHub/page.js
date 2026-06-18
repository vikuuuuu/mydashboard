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

function makeTrackPayload(title, url, videoId) {
  return { title, url, videoId, addedAt: new Date().toISOString() };
}

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */

/** Single track row — handles own edit mode inline */
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
  totalTracks,
  // quick-song-only props
  isQuickSong,
  quickSongId,
  playlists,
  onMoveQuickToPlaylist,
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: track.title, url: track.url || '' });

  function handleSave() {
    const vid = extractVideoId(form.url);
    if (!form.title.trim()) return alert('Track title is required.');
    if (!isQuickSong && !vid) return alert('Invalid YouTube URL.');
    onEdit({ title: form.title.trim(), url: form.url.trim(), videoId: vid });
    setEditing(false);
  }

  return (
    <div className={`${styles.trackRow} ${isActive ? styles.trackRowActive : ''}`}>
      <div className={styles.trackLeft}>
        {!isQuickSong && <span className={styles.trackNum}>{String(index + 1).padStart(2, '0')}</span>}
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
          {canEdit && !isQuickSong && (
            <button className={styles.iconBtn} title="Eject to Quick Songs" onClick={onEjectToQuick}>📤</button>
          )}
          {(canEdit || isQuickSong) && (
            <button className={styles.iconBtn} onClick={() => { setEditing(true); setForm({ title: track.title, url: track.url || '' }); }}>✏️</button>
          )}
          {canEdit && !isQuickSong && (
            <>
              <button className={styles.iconBtn} onClick={onMoveUp}  disabled={index === 0}>▲</button>
              <button className={styles.iconBtn} onClick={onMoveDown} disabled={index === totalTracks - 1}>▼</button>
            </>
          )}
          <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onDelete}>✕</button>
        </div>
      )}
    </div>
  );
}

/** Comment feed + input for a playlist */
function CommentFeed({ playlist, currentUser, onPost }) {
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
  const iframeRef = useRef(null);

  // UI
  const [activeTab, setActiveTab] = useState('quick');
  const [searchQ, setSearchQ] = useState('');
  const [isDark, setIsDark] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }, [uid, currentUser]);

  useEffect(() => {
    if (uid && currentUser?.email) fetchData();
  }, [uid, currentUser, fetchData]);

  /* ── Auto-advance queue ── */
  const playNext = useCallback(() => {
    if (!queuePlaylist || queueIndex < 0) return;
    const next = queueIndex + 1;
    if (queuePlaylist.tracks?.[next]) {
      const t = queuePlaylist.tracks[next];
      setQueueIndex(next);
      setActiveVideoId(t.videoId);
      setNowPlayingTitle(t.title);
    } else {
      setQueuePlaylist(null);
      setQueueIndex(-1);
    }
  }, [queuePlaylist, queueIndex]);

  useEffect(() => {
    const handler = e => {
      if (e.origin !== 'https://www.youtube.com' && e.origin !== 'https://www.youtube-nocookie.com') return;
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'infoDelivery' && data.info?.playerState === 0) playNext();
      } catch (_) {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [playNext]);

  /* ── Play ── */
  function play(url, title, playlist = null, index = -1) {
    const vid = extractVideoId(url);
    if (!vid) return alert('Could not parse a YouTube video ID from that URL.');
    setActiveVideoId(vid);
    setNowPlayingTitle(title);
    setQueuePlaylist(playlist);
    setQueueIndex(index);
  }

  /* ── Computed ── */
  const allPlaylists = useMemo(() => [...playlists, ...sharedPlaylists], [playlists, sharedPlaylists]);

  const filteredQuickSongs = useMemo(
    () => quickSongs.filter(s => s.title.toLowerCase().includes(searchQ.toLowerCase())),
    [quickSongs, searchQ]
  );

  /* ── Playlist CRUD ── */
  async function createPlaylist() {
    if (!createForm.name.trim()) return alert('Playlist name is required.');
    setSaving(true);
    try {
      await addDoc(collection(db, 'playlists'), {
        name: createForm.name.trim(),
        desc: createForm.desc.trim(),
        ownerId: uid,
        ownerName: currentUser.displayName,
        ownerEmail: currentUser.email,
        tracks: [],
        sharedWith: [],
        sharedWithEmails: [],
        comments: [],
        createdAt: serverTimestamp(),
      });
      await fetchData();
      setShowCreateModal(false);
      setCreateForm({ name: '', desc: '' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function savePlaylistMeta(id) {
    if (!playlistEditForm.name.trim()) return alert('Playlist name cannot be empty.');
    try {
      await updateDoc(doc(db, 'playlists', id), {
        name: playlistEditForm.name.trim(),
        desc: playlistEditForm.desc.trim(),
      });
      setEditingPlaylistId(null);
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function deletePlaylist(id) {
    if (!confirm('Delete this playlist permanently?')) return;
    try {
      await deleteDoc(doc(db, 'playlists', id));
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function leaveSharedPlaylist(playlist) {
    if (!confirm('Remove yourself from this shared playlist?')) return;
    try {
      await updateDoc(doc(db, 'playlists', playlist.id), {
        sharedWith: (playlist.sharedWith || []).filter(u => u.email !== currentUser.email),
        sharedWithEmails: (playlist.sharedWithEmails || []).filter(e => e !== currentUser.email),
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  /* ── Track CRUD ── */
  async function addTrack() {
    if (!trackForm.title.trim() || !trackForm.url.trim()) return alert('Title and URL are both required.');
    const videoId = extractVideoId(trackForm.url);
    if (!videoId) return alert('Invalid YouTube URL — no video ID found.');
    setSaving(true);
    try {
      if (trackForm.targetPlaylist === 'quick') {
        await addDoc(collection(db, `users/${uid}/quicksongs`), {
          ...makeTrackPayload(trackForm.title.trim(), trackForm.url.trim(), videoId),
          createdAt: serverTimestamp(),
        });
      } else {
        const target = allPlaylists.find(p => p.id === trackForm.targetPlaylist);
        if (!target) { alert('Playlist not found.'); return; }
        const isOwner = target.ownerId === uid;
        const canEdit = isOwner || target.sharedWith?.find(s => s.email === currentUser.email)?.permission === 'edit';
        if (!canEdit) { alert('You don\'t have permission to add tracks to this playlist.'); return; }
        await updateDoc(doc(db, 'playlists', target.id), {
          tracks: [...(target.tracks || []), makeTrackPayload(trackForm.title.trim(), trackForm.url.trim(), videoId)],
        });
      }
      await fetchData();
      setTrackForm({ title: '', url: '', targetPlaylist: 'quick' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function moveQuickSongToPlaylist(song, playlistId) {
    if (!playlistId) return;
    const target = playlists.find(p => p.id === playlistId) || sharedPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    try {
      await Promise.all([
        updateDoc(doc(db, 'playlists', playlistId), {
          tracks: [...(target.tracks || []), makeTrackPayload(song.title, song.url, song.videoId)],
        }),
        deleteDoc(doc(db, `users/${uid}/quicksongs`, song.id)),
      ]);
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function ejectTrackToQuick(playlistId, index) {
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    const track = target.tracks[index];
    try {
      await Promise.all([
        addDoc(collection(db, `users/${uid}/quicksongs`), {
          ...makeTrackPayload(track.title, track.url, track.videoId),
          createdAt: serverTimestamp(),
        }),
        updateDoc(doc(db, 'playlists', playlistId), {
          tracks: target.tracks.filter((_, i) => i !== index),
        }),
      ]);
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function editPlaylistTrack(playlistId, index, updated) {
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    const tracks = [...target.tracks];
    tracks[index] = { ...tracks[index], ...updated };
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { tracks });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function deletePlaylistTrack(playlistId, index) {
    if (!confirm('Remove this track from the playlist?')) return;
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    try {
      await updateDoc(doc(db, 'playlists', playlistId), {
        tracks: target.tracks.filter((_, i) => i !== index),
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function editQuickSong(id, title) {
    if (!title.trim()) return;
    try {
      await updateDoc(doc(db, `users/${uid}/quicksongs`, id), { title: title.trim() });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteQuickSong(id) {
    if (!confirm('Delete this track?')) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/quicksongs`, id));
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function reorderTrack(playlistId, index, direction) {
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target?.tracks) return;
    const tracks = [...target.tracks];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= tracks.length) return;
    [tracks[index], tracks[swapIdx]] = [tracks[swapIdx], tracks[index]];
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { tracks });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  /* ── Sharing ── */
  async function sharePlaylist() {
    if (!shareForm.email) return alert('Select a user to share with.');
    if (shareTarget.sharedWithEmails?.includes(shareForm.email)) return alert('This user already has access.');
    setSaving(true);
    try {
      const targetUser = allUsers.find(u => u.email === shareForm.email);
      const entry = {
        email: shareForm.email,
        name: targetUser?.displayName || targetUser?.name || 'Workspace member',
        permission: shareForm.permission,
      };
      await updateDoc(doc(db, 'playlists', shareTarget.id), {
        sharedWith: [...(shareTarget.sharedWith || []), entry],
        sharedWithEmails: [...(shareTarget.sharedWithEmails || []), shareForm.email],
      });
      await fetchData();
      setShowShareModal(false);
      setShareForm({ email: '', permission: 'view' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function changePermission(playlist, email, permission) {
    try {
      await updateDoc(doc(db, 'playlists', playlist.id), {
        sharedWith: playlist.sharedWith.map(s => s.email === email ? { ...s, permission } : s),
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function revokeAccess(playlist, email) {
    if (!confirm('Revoke access for this user?')) return;
    try {
      await updateDoc(doc(db, 'playlists', playlist.id), {
        sharedWith: playlist.sharedWith.filter(s => s.email !== email),
        sharedWithEmails: playlist.sharedWithEmails.filter(e => e !== email),
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  /* ── Comments ── */
  async function postComment(playlistId, text) {
    const target = allPlaylists.find(p => p.id === playlistId);
    if (!target) return;
    try {
      await updateDoc(doc(db, 'playlists', playlistId), {
        comments: [...(target.comments || []), {
          authorName: currentUser.displayName,
          authorEmail: currentUser.email,
          text,
          timestamp: new Date().toISOString(),
        }],
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  /* ── Render helpers ── */
  function renderPlaylistTracks(playlist, canEdit, isOwner) {
    if (!playlist.tracks?.length) return <p className={styles.empty}>No tracks yet — add one above.</p>;
    return (
      <div className={styles.trackList}>
        {playlist.tracks.map((t, idx) => (
          <TrackRow
            key={idx}
            track={t}
            index={idx}
            playlistId={playlist.id}
            isActive={queuePlaylist?.id === playlist.id && queueIndex === idx}
            canEdit={canEdit}
            isOwner={isOwner}
            totalTracks={playlist.tracks.length}
            onPlay={() => play(t.url, t.title, playlist, idx)}
            onMoveUp={() => reorderTrack(playlist.id, idx, 'up')}
            onMoveDown={() => reorderTrack(playlist.id, idx, 'down')}
            onEjectToQuick={() => ejectTrackToQuick(playlist.id, idx)}
            onEdit={updated => editPlaylistTrack(playlist.id, idx, updated)}
            onDelete={() => deletePlaylistTrack(playlist.id, idx)}
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
                ? <p className={styles.empty}>No quick songs yet. Add one above.</p>
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
                        onPlay={() => play(s.url, s.title)}
                        onEdit={({ title }) => editQuickSong(s.id, title)}
                        onDelete={() => deleteQuickSong(s.id)}
                        onMoveQuickToPlaylist={playlistId => moveQuickSongToPlaylist(s, playlistId)}
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
                : playlists.map(p => (
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
                          <>
                            <h4 className={styles.playlistName}>
                              📁 {p.name}
                              <button
                                className={styles.editNameBtn}
                                onClick={() => { setEditingPlaylistId(p.id); setPlaylistEditForm({ name: p.name, desc: p.desc || '' }); }}
                              >✏️ Edit</button>
                            </h4>
                            <p className={styles.playlistDesc}>{p.desc || 'No description.'}</p>
                          </>
                        )}
                      </div>
                      <div className={styles.playlistHeaderRight}>
                        <button className={styles.shareBtn} onClick={() => { setShareTarget(p); setShowShareModal(true); }}>🌐 Share</button>
                        <button className={styles.deleteBtn} onClick={() => deletePlaylist(p.id)}>🗑️ Delete</button>
                      </div>
                    </div>

                    {/* shared users */}
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
                    <CommentFeed playlist={p} currentUser={currentUser} onPost={postComment} />
                  </div>
                ))
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
                  return (
                    <div key={p.id} className={styles.playlistCardShared}>
                      <div className={styles.playlistHeader}>
                        <div>
                          <h4 className={styles.playlistName}>🌐 {p.name}</h4>
                          <p className={styles.playlistDesc}>by {p.ownerName} ({p.ownerEmail})</p>
                        </div>
                        <div className={styles.playlistHeaderRight}>
                          <span className={styles.roleBadge}>{myRole?.permission?.toUpperCase()}</span>
                          <button className={styles.deleteBtn} onClick={() => leaveSharedPlaylist(p)}>Leave</button>
                        </div>
                      </div>
                      {renderPlaylistTracks(p, canEdit, false)}
                      <CommentFeed playlist={p} currentUser={currentUser} onPost={postComment} />
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
            {activeVideoId ? (
              <div className={styles.playerInner}>
                <div className={styles.videoWrap}>
                  <iframe
                    ref={iframeRef}
                    className={styles.iframe}
                    src={`https://www.youtube.com/embed/${activeVideoId}?enablejsapi=1&autoplay=1&modestbranding=1&rel=0`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={nowPlayingTitle}
                  />
                </div>
                <div className={styles.nowPlaying}>
                  <p className={styles.nowPlayingLabel}>▶ Now playing</p>
                  <p className={styles.nowPlayingTitle}>{nowPlayingTitle}</p>
                  {queuePlaylist && (
                    <span className={styles.queueInfo}>
                      Track {queueIndex + 1} of {queuePlaylist.tracks?.length} · {queuePlaylist.name}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.playerIdle}>
                <div className={styles.playerIdleIcon}>🎵</div>
                <p>Select a track to play</p>
              </div>
            )}
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
