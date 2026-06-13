'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, where, orderBy
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { logToolUsage } from '@/lib/firestore';
import styles from './musichub.module.css';

const extractYoutubeId = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export default function MusicHubPage() {
  const router = useRouter();
  
  // Core Authentication & Profile States
  const [uid, setUid] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Real-Time Reactive Local Vectors
  const [playlists, setPlaylists] = useState([]);
  const [sharedPlaylists, setSharedPlaylists] = useState([]);
  const [quickSongs, setQuickSongs] = useState([]);
  const [allUsers, setAllUsers] = useState([]); 

  // Viewport Player & Tab States
  const [activeTab, setActiveTab] = useState('hub');
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [currentTrackTitle, setCurrentTrackTitle] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [isDark, setIsDark] = useState(false);

  // Automated Queue Matrix Binders
  const [activePlaylistQueue, setActivePlaylistQueue] = useState(null);
  const [activeTrackIndex, setActiveTrackIndex] = useState(-1);
  
  // Modals Framework Control
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  // Inline Inline Mutation Nodes (Editing Tracks/Playlists)
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  const [editingPlaylistName, setEditingPlaylistIdName] = useState('');
  const [editingTrackIndex, setEditingTrackIndex] = useState(null);
  const [editingTrackForm, setEditingTrackForm] = useState({ title: '', url: '' });
  const [editingQuickSongId, setEditingQuickSongId] = useState(null);

  // Form Binding Structures
  const [playlistForm, setPlaylistForm] = useState({ name: '', desc: '' });
  const [songForm, setFormSong] = useState({ title: '', url: '', targetPlaylist: 'quick' });
  const [shareForm, setShareForm] = useState({ targetEmail: '', permission: 'view' });
  const [commentInputs, setCommentInputs] = useState({}); // Bound by playlist.id

  const iframeRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        setCurrentUserData({ uid: user.uid, email: user.email, displayName: user.displayName || 'User Node' });
        logToolUsage({ userId: user.uid, tool: 'MusicHub', action: 'PAGE_VISIT' });
      } else {
        router.push('/login');
      }
    });
    return unsub;
  }, [router]);

  const fetchCoreHubData = useCallback(async () => {
    if (!uid || !currentUserData?.email) return;
    try {
      const playlistsRef = collection(db, 'playlists');
      
      const qOwned = query(playlistsRef, where('ownerId', '==', uid));
      const ownedSnap = await getDocs(qOwned);
      setPlaylists(ownedSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const qShared = query(playlistsRef, where('sharedWithEmails', 'array-contains', currentUserData.email));
      const sharedSnap = await getDocs(qShared);
      setSharedPlaylists(sharedSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const quickRef = collection(db, `users/${uid}/quicksongs`);
      const qSnap = await getDocs(query(quickRef, orderBy('createdAt', 'desc')));
      setQuickSongs(qSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const usersSnap = await getDocs(collection(db, 'users'));
      setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== uid));

    } catch (err) {
      console.error('System synchronization error:', err);
    } finally {
      setLoading(false);
    }
  }, [uid, currentUserData]);

  useEffect(() => {
    if (uid && currentUserData?.email) {
      fetchCoreHubData();
    }
  }, [uid, currentUserData, fetchCoreHubData]);

  const triggerNextSequentialTrack = useCallback(() => {
    if (!activePlaylistQueue || activeTrackIndex === -1) return;
    const nextIndex = activeTrackIndex + 1;
    if (activePlaylistQueue.tracks && nextIndex < activePlaylistQueue.tracks.length) {
      const nextTrack = activePlaylistQueue.tracks[nextIndex];
      setActiveTrackIndex(nextIndex);
      setActiveVideoId(nextTrack.videoId);
      setCurrentTrackTitle(nextTrack.title);
    } else {
      setActiveTrackIndex(-1);
      setActivePlaylistQueue(null);
    }
  }, [activePlaylistQueue, activeTrackIndex]);

  useEffect(() => {
    const handleGlobalMessageInversion = (event) => {
      if (event.origin !== 'https://www.youtube.com' && event.origin !== 'https://www.youtube-nocookie.com') return;
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'infoDelivery' && data.info && data.info.playerState === 0) {
          triggerNextSequentialTrack();
        }
      } catch (e) {}
    };
    window.addEventListener('message', handleGlobalMessageInversion);
    return () => window.removeEventListener('message', handleGlobalMessageInversion);
  }, [triggerNextSequentialTrack]);

  const handleInitializePlaybackNode = (url, title, playlistContext = null, index = -1) => {
    const vId = extractYoutubeId(url);
    if (!vId) return alert('Invalid stream asset location.');
    setActiveVideoId(vId);
    setCurrentTrackTitle(title);
    setActivePlaylistQueue(playlistContext);
    setActiveTrackIndex(index);
  };

  /* ── PLAYLIST CORE MUTATIONS ── */
  const handleCreatePlaylist = async () => {
    if (!playlistForm.name.trim()) return alert('Playlist name required.');
    setSaving(true);
    try {
      const payload = {
        name: playlistForm.name.trim(),
        desc: playlistForm.desc.trim(),
        ownerId: uid,
        ownerName: currentUserData.displayName,
        ownerEmail: currentUserData.email,
        tracks: [],
        sharedWith: [], 
        sharedWithEmails: [],
        comments: [],
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'playlists'), payload);
      await fetchCoreHubData();
      setShowPlaylistModal(false);
      setPlaylistForm({ name: '', desc: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePlaylistNameInline = async (playlistId) => {
    if (!editingPlaylistName.trim()) return;
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { name: editingPlaylistName.trim() });
      setEditingPlaylistId(null);
      await fetchCoreHubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePurgeWholePlaylistNode = async (playlistId) => {
    if (!confirm('Permanently delete this playlist structure?')) return;
    try {
      await deleteDoc(doc(db, 'playlists', playlistId));
      await fetchCoreHubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelfRemoveFromSharedPlaylist = async (playlist) => {
    if (!confirm('Remove yourself from this shared ecosystem playlist?')) return;
    try {
      const updatedSharedWith = playlist.sharedWith.filter(u => u.email !== currentUserData.email);
      const updatedEmails = playlist.sharedWithEmails.filter(e => e !== currentUserData.email);
      await updateDoc(doc(db, 'playlists', playlist.id), {
        sharedWith: updatedSharedWith,
        sharedWithEmails: updatedEmails
      });
      await fetchCoreHubData();
    } catch (err) {
      console.error(err);
    }
  };

  /* ── TRACKS CONFIGURATION MUTATIONS ── */
  const handleAddSong = async () => {
    if (!songForm.title.trim() || !songForm.url.trim()) return alert('Fields cannot be blank.');
    const targetVideoId = extractYoutubeId(songForm.url);
    if (!targetVideoId) return alert('Invalid YouTube stream pattern URL.');

    setSaving(true);
    try {
      const trackPayload = {
        title: songForm.title.trim(),
        url: songForm.url.trim(),
        videoId: targetVideoId,
        createdAt: new Date().toISOString()
      };

      if (songForm.targetPlaylist === 'quick') {
        await addDoc(collection(db, `users/${uid}/quicksongs`), { ...trackPayload, createdAt: serverTimestamp() });
        setQuickSongs(prev => [trackPayload, ...prev]); // Optimistic instant render update
      } else {
        const playlistId = songForm.targetPlaylist;
        const currentP = allAvailablePlaylists.find(p => p.id === playlistId);
        
        if (currentP.ownerId !== uid && currentP.sharedWith?.find(s => s.email === currentUserData.email)?.permission !== 'edit') {
          alert('Write privilege missing.');
          setSaving(false);
          return;
        }

        const updatedTracks = [...(currentP.tracks || []), trackPayload];
        await updateDoc(doc(db, 'playlists', playlistId), { tracks: updatedTracks });
      }

      await fetchCoreHubData();
      setFormSong({ title: '', url: '', targetPlaylist: 'quick' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleInlineTrackEditSave = async (playlistId, index) => {
    const targetP = allAvailablePlaylists.find(p => p.id === playlistId);
    if (!targetP || !editingTrackForm.title.trim()) return;

    const vId = extractYoutubeId(editingTrackForm.url);
    if (!vId) return alert('Invalid video location asset URL.');

    const updatedTracks = [...targetP.tracks];
    updatedTracks[index] = {
      title: editingTrackForm.title.trim(),
      url: editingTrackForm.url.trim(),
      videoId: vId,
      createdAt: updatedTracks[index].createdAt
    };

    try {
      await updateDoc(doc(db, 'playlists', playlistId), { tracks: updatedTracks });
      setEditingTrackIndex(null);
      await fetchCoreHubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEraseTrackFromContainer = async (playlistId, index) => {
    if (!confirm('Remove track from this playlist container?')) return;
    const targetP = allAvailablePlaylists.find(p => p.id === playlistId);
    if (!targetP) return;

    const modifiedTracks = (targetP.tracks || []).filter((_, idx) => idx !== index);
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { tracks: modifiedTracks });
      setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, tracks: modifiedTracks } : p)); // Instant rendering sync mutation
      await fetchCoreHubData();
    } catch (err) {
      console.error(err);
    }
  };

  /* ── ISOLATED QUICK NOTE TRACKS EDIT/DELETE ── */
  const handleUpdateQuickSongInline = async (id, updatedTitle) => {
    if (!updatedTitle.trim()) return;
    try {
      await updateDoc(doc(db, `users/${uid}/quicksongs`, id), { title: updatedTitle.trim() });
      setEditingQuickSongId(null);
      await fetchCoreHubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePurgeQuickSong = async (id) => {
    if (!confirm('Delete this single quick asset?')) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/quicksongs`, id));
      setQuickSongs(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleAlterTrackSortingIndices = async (playlistId, index, direction) => {
    const targetP = allAvailablePlaylists.find(p => p.id === playlistId);
    if (!targetP || !targetP.tracks) return;
    
    const factoryTracks = [...targetP.tracks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= factoryTracks.length) return;

    const backupBufferElement = factoryTracks[index];
    factoryTracks[index] = factoryTracks[targetIndex];
    factoryTracks[targetIndex] = backupBufferElement;

    try {
      await updateDoc(doc(db, 'playlists', playlistId), { tracks: factoryTracks });
      await fetchCoreHubData();
    } catch (err) {
      console.error(err);
    }
  };

  /* ── ACCESS PRIVILEGE DISTRIBUTION ROUTING ── */
  const handleApplySharePermission = async () => {
    if (!shareForm.targetEmail) return alert('Select target collaborator identity profile.');
    if (selectedPlaylist.sharedWithEmails?.includes(shareForm.targetEmail)) {
      return alert('Identity constraint violation: Asset already paired to this link configuration.');
    }

    setSaving(true);
    try {
      const targetUser = allUsers.find(u => u.email === shareForm.targetEmail);
      const shareObject = {
        email: shareForm.targetEmail,
        name: targetUser?.displayName || targetUser?.name || 'Workspace Account',
        permission: shareForm.permission
      };

      const updatedShareList = [...(selectedPlaylist.sharedWith || []), shareObject];
      const updatedEmailsList = [...(selectedPlaylist.sharedWithEmails || []), shareForm.targetEmail];

      await updateDoc(doc(db, 'playlists', selectedPlaylist.id), { 
        sharedWith: updatedShareList,
        sharedWithEmails: updatedEmailsList
      });
      
      await fetchCoreHubData();
      setShowShareModal(false);
      setShareForm({ targetEmail: '', permission: 'view' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  /* ── PLAYLIST LIVE COMMENT FEEDS ── */
  const handlePostCommentNode = async (playlistId) => {
    const cText = commentInputs[playlistId];
    if (!cText || !cText.trim()) return;

    const targetP = allAvailablePlaylists.find(p => p.id === playlistId);
    if (!targetP) return;

    const newCommentObject = {
      authorName: currentUserData.displayName,
      authorEmail: currentUserData.email,
      text: cText.trim(),
      timestamp: new Date().toISOString()
    };

    const updatedComments = [...(targetP.comments || []), newCommentObject];
    try {
      await updateDoc(doc(db, 'playlists', playlistId), { comments: updatedComments });
      setCommentInputs(prev => ({ ...prev, [playlistId]: '' }));
      await fetchCoreHubData();
    } catch (err) {
      console.error(err);
    }
  };

  const searchedQuickSongs = useMemo(() => {
    return quickSongs.filter(s => s.title.toLowerCase().includes(searchQ.toLowerCase()));
  }, [quickSongs, searchQ]);

  const allAvailablePlaylists = useMemo(() => {
    return [...playlists, ...sharedPlaylists];
  }, [playlists, sharedPlaylists]);

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinnerInner} /><p>Initializing Studio Infrastructure...</p></div>;

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>
      
      {/* ── TOP BAR ENGINE ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Portal</button>
        <div className={styles.brand}><div className={styles.brandIcon}>🎵</div>Music Hub</div>
        <div className={styles.searchWrap}>
          <input 
            className={styles.searchInput} 
            placeholder="Search audio tracks..." 
            value={searchQ} 
            onChange={e => setSearchQ(e.target.value)} 
          />
        </div>
        <button className={styles.addNewBtn} onClick={() => setShowPlaylistModal(true)}>
          <span className={styles.mobileHiddenLabel}>+ Create Playlist</span>
          <span className={styles.mobileVisibleLabel}>📁+</span>
        </button>
        <button className={styles.themeBtn} onClick={() => setIsDark(!isDark)}>{isDark ? '☀️' : '🌙'}</button>
      </div>

      {/* ── CONTENT GRID SYSTEM ── */}
      <div className={styles.contentLayout}>
        <div className={styles.mainFeedSection}>
          
          {/* TRACK INGESTION MODULE */}
          <div className={styles.ingestContainer}>
            <h3 className={styles.blockTitle}>🧬 Load Direct Audio Stream Target</h3>
            <div className={styles.formRow}>
              <input 
                className={styles.formInput} 
                placeholder="Track Title Reference..." 
                value={songForm.title} 
                onChange={e => setFormSong({...songForm, title: e.target.value})}
              />
              <input 
                className={styles.formInput} 
                placeholder="YouTube / YouTube Music URL..." 
                value={songForm.url} 
                onChange={e => setFormSong({...songForm, url: e.target.value})}
              />
              <select 
                className={styles.formSelect}
                value={songForm.targetPlaylist}
                onChange={e => setFormSong({...songForm, targetPlaylist: e.target.value})}
              >
                <option value="quick">⚡ No Playlist (Isolated Track)</option>
                {allAvailablePlaylists.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.ownerId === uid ? '📁 Owned: ' : '🌐 Shared: '} {p.name}
                  </option>
                ))}
              </select>
              <button className={styles.mountButton} onClick={handleAddSong} disabled={saving}>Mount</button>
            </div>
          </div>

          <div className={styles.tabRow}>
            <button className={`${styles.tabLink} ${activeTab === 'hub' ? styles.tabLinkActive : ''}`} onClick={() => setActiveTab('hub')}>🎛️ Streams Base</button>
            <button className={`${styles.tabLink} ${activeTab === 'playlists' ? styles.tabLinkActive : ''}`} onClick={() => setActiveTab('playlists')}>📁 Vault Storage ({playlists.length})</button>
            <button className={`${styles.tabLink} ${activeTab === 'shared' ? styles.tabLinkActive : ''}`} onClick={() => setActiveTab('shared')}>🌐 Shared Ecosystem ({sharedPlaylists.length})</button>
          </div>

          {/* VIEWPORTS */}
          {activeTab === 'hub' && (
            <div className={styles.viewPortContainer}>
              <h4 className={styles.sectionHeading}>⚡ Single Stream Engine (No Playlist Records)</h4>
              {searchedQuickSongs.length === 0 ? <p className={styles.emptyText}>No single track matrix vectors loaded.</p> : (
                <div className={styles.trackListList}>
                  {searchedQuickSongs.map(song => (
                    <div key={song.id} className={styles.trackRowItem}>
                      <div className={styles.clickableAreaRow} onClick={() => handleInitializePlaybackNode(song.url, song.title)}>
                        <div className={styles.rowPlayIndicator}>▶</div>
                        {editingQuickSongId === song.id ? (
                          <input 
                            className={styles.inlineRenameInputItem}
                            value={song.title}
                            autoFocus
                            onChange={e => {
                              const updatedTitle = e.target.value;
                              setQuickSongs(prev => prev.map(s => s.id === song.id ? { ...s, title: updatedTitle } : s));
                            }}
                            onBlur={e => handleUpdateQuickSongInline(song.id, e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateQuickSongInline(song.id, e.target.value)}
                          />
                        ) : (
                          <p className={styles.trackName}>{song.title}</p>
                        )}
                      </div>
                      <div className={styles.trackMutationInterfaceActionCluster}>
                        <button className={styles.mutationArrowBtn} onClick={() => setEditingQuickSongId(song.id)}>✏️</button>
                        <button className={styles.mutationDeleteBtn} onClick={() => handlePurgeQuickSong(song.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OWN STORAGE STORAGE HUB */}
          {activeTab === 'playlists' && (
            <div className={styles.playlistsVerticalGrid}>
              {playlists.length === 0 ? <p className={styles.emptyText}>Vault is currently clean of containers.</p> : playlists.map(p => (
                <div key={p.id} className={styles.playlistMegaBlock}>
                  <div className={styles.playlistBlockHeader}>
                    <div className={styles.titleContextBlockHeaderWrap}>
                      {editingPlaylistId === p.id ? (
                        <input 
                          className={styles.inlineRenameInputItem}
                          value={editingPlaylistName}
                          autoFocus
                          onChange={e => setEditingPlaylistIdName(e.target.value)}
                          onBlur={() => handleUpdatePlaylistNameInline(p.id)}
                          onKeyDown={e => e.key === 'Enter' && handleUpdatePlaylistNameInline(p.id)}
                        />
                      ) : (
                        <h4 className={styles.pNameDisplay} onClick={() => { setEditingPlaylistId(p.id); setEditingPlaylistIdName(p.name); }}>
                          📁 {p.name} <span className={styles.pencilEditMiniTrigger}>✏️</span>
                        </h4>
                      )}
                      <p className={styles.pDescDisplay}>{p.desc || 'No metadata description.'}</p>
                    </div>
                    <div className={styles.playlistHeaderControlsActionStackRow}>
                      <button className={styles.shareActionTrigger} onClick={() => { setSelectedPlaylist(p); setShowShareModal(true); }}>🌐 Share</button>
                      <button className={styles.purgePlaylistTriggerBtn} onClick={() => handlePurgeWholePlaylistNode(p.id)}>🗑️ Purge</button>
                    </div>
                  </div>

                  {p.sharedWith && p.sharedWith.length > 0 && (
                    <div className={styles.sharedUsersTransparencyTrack}>
                      <span className={styles.transparencyLabel}>Shared Workspace Nodes:</span>
                      {p.sharedWith.map((user, idx) => (
                        <span key={idx} className={styles.sharedUserChipBadge}>👤 {user.name} ({user.permission})</span>
                      ))}
                    </div>
                  )}

                  {/* INITIALIZE INTERNAL CONTAINER TRACKS LISTING MODULE */}
                  <div className={styles.playlistTracksInternalWrap}>
                    {!p.tracks || p.tracks.length === 0 ? <p className={styles.emptyTextSub}>No streaming items linked to this array container.</p> : p.tracks.map((t, idx) => {
                      const isCurrentlyActiveStreamNode = activePlaylistQueue?.id === p.id && activeTrackIndex === idx;
                      const isCurrentlyEditingTrackIndex = editingTrackIndex === `${p.id}-${idx}`;

                      return (
                        <div key={idx} className={`${styles.trackRowItem} ${isCurrentlyActiveStreamNode ? styles.activeTrackHighlightPulseNode : ''}`}>
                          <div className={styles.clickableAreaRow} onClick={() => handleInitializePlaybackNode(t.url, t.title, p, idx)}>
                            <span className={styles.trackIdx}>{(idx + 1).toString().padStart(2, '0')}</span>
                            {isCurrentlyEditingTrackIndex ? (
                              <div className={styles.inlineTrackEditingInputsWrapper} onClick={e => e.stopPropagation()}>
                                <input 
                                  className={styles.formInputSmall} 
                                  value={editingTrackForm.title} 
                                  onChange={e => setEditingTrackForm({ ...editingTrackForm, title: e.target.value })}
                                />
                                <input 
                                  className={styles.formInputSmall} 
                                  value={editingTrackForm.url} 
                                  onChange={e => setEditingTrackForm({ ...editingTrackForm, url: e.target.value })}
                                />
                                <button className={styles.inlineSaveCheckTrackBtn} onClick={() => handleInlineTrackEditSave(p.id, idx)}>✓</button>
                              </div>
                            ) : (
                              <div className={styles.rowDetails}><p className={styles.trackName}>{t.title}</p></div>
                            )}
                          </div>
                          
                          <div className={styles.trackMutationInterfaceActionCluster}>
                            <button className={styles.mutationArrowBtn} onClick={(e) => { 
                              e.stopPropagation(); 
                              setEditingTrackIndex(`${p.id}-${idx}`); 
                              setEditingTrackForm({ title: t.title, url: t.url }); 
                            }}>✏️</button>
                            <button className={styles.mutationArrowBtn} onClick={(e) => { e.stopPropagation(); handleAlterTrackSortingIndices(p.id, idx, 'up'); }} disabled={idx === 0}>🗘▲</button>
                            <button className={styles.mutationArrowBtn} onClick={(e) => { e.stopPropagation(); handleAlterTrackSortingIndices(p.id, idx, 'down'); }} disabled={idx === p.tracks.length - 1}>🗘▼</button>
                            <button className={styles.mutationDeleteBtn} onClick={(e) => { e.stopPropagation(); handleEraseTrackFromContainer(p.id, idx); }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* COMMENT SUB-SYSTEM MODULE SYSTEM BLOCK */}
                  <div className={styles.playlistCommentsMatrixModule}>
                    <h5 className={styles.commentWidgetLabelHead}>💬 Team Feed Streams</h5>
                    <div className={styles.commentTimelineScrollTrackContainer}>
                      {p.comments && p.comments.map((c, cIdx) => (
                        <div key={cIdx} className={styles.commentBubbleNodeItem}>
                          <span className={styles.commentAuthorStamp}><strong>{c.authorName}</strong>:</span>
                          <span className={styles.commentTextBodyOutput}>{c.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.commentIngestionRowSubmitField}>
                      <input 
                        className={styles.formInput}
                        placeholder="Write inside project feed..."
                        value={commentInputs[p.id] || ''}
                        onChange={e => setCommentInputs({ ...commentInputs, [p.id]: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && handlePostCommentNode(p.id)}
                      />
                      <button className={styles.sendCommentArrowTriggerBtn} onClick={() => handlePostCommentNode(p.id)}>Send</button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}

          {/* SHARED RECEPTIONS HUB TAB */}
          {activeTab === 'shared' && (
            <div className={styles.playlistsVerticalGrid}>
              {sharedPlaylists.length === 0 ? <p className={styles.emptyText}>No cross-platform shared configurations found.</p> : sharedPlaylists.map(p => (
                <div key={p.id} className={styles.playlistMegaBlockShared}>
                  <div className={styles.playlistBlockHeader}>
                    <div>
                      <h4 className={styles.pNameDisplay}>🌐 {p.name}</h4>
                      <p className={styles.pDescDisplay}>Author Node: <strong>{p.ownerName}</strong> ({p.ownerEmail})</p>
                    </div>
                    <div className={styles.playlistHeaderControlsActionStackRow}>
                      <span className={styles.privilegeRoleLabelBadge}>Role: {p.sharedWith?.find(s => s.email === currentUserData.email)?.permission?.toUpperCase()}</span>
                      <button className={styles.purgePlaylistTriggerBtn} onClick={() => handleSelfRemoveFromSharedPlaylist(p)}>Disconnect Me</button>
                    </div>
                  </div>

                  <div className={styles.playlistTracksInternalWrap}>
                    {!p.tracks || p.tracks.length === 0 ? <p className={styles.emptyTextSub}>Shared pipeline buffer empty.</p> : p.tracks.map((t, idx) => {
                      const isCurrentlyActiveStreamNode = activePlaylistQueue?.id === p.id && activeTrackIndex === idx;
                      const hasWritePrivileges = p.sharedWith?.find(s => s.email === currentUserData.email)?.permission === 'edit';
                      const isCurrentlyEditingTrackIndex = editingTrackIndex === `${p.id}-${idx}`;

                      return (
                        <div key={idx} className={`${styles.trackRowItem} ${isCurrentlyActiveStreamNode ? styles.activeTrackHighlightPulseNode : ''}`}>
                          <div className={styles.clickableAreaRow} onClick={() => handleInitializePlaybackNode(t.url, t.title, p, idx)}>
                            <span className={styles.trackIdx}>{(idx + 1).toString().padStart(2, '0')}</span>
                            {isCurrentlyEditingTrackIndex ? (
                              <div className={styles.inlineTrackEditingInputsWrapper} onClick={e => e.stopPropagation()}>
                                <input 
                                  className={styles.formInputSmall} 
                                  value={editingTrackForm.title} 
                                  onChange={e => setEditingTrackForm({ ...editingTrackForm, title: e.target.value })}
                                />
                                <input 
                                  className={styles.formInputSmall} 
                                  value={editingTrackForm.url} 
                                  onChange={e => setEditingTrackForm({ ...editingTrackForm, url: e.target.value })}
                                />
                                <button className={styles.inlineSaveCheckTrackBtn} onClick={() => handleInlineTrackEditSave(p.id, idx)}>✓</button>
                              </div>
                            ) : (
                              <div className={styles.rowDetails}><p className={styles.trackName}>{t.title}</p></div>
                            )}
                          </div>
                          
                          {hasWritePrivileges && (
                            <div className={styles.trackMutationInterfaceActionCluster}>
                              <button className={styles.mutationArrowBtn} onClick={(e) => { 
                                e.stopPropagation(); 
                                setEditingTrackIndex(`${p.id}-${idx}`); 
                                setEditingTrackForm({ title: t.title, url: t.url }); 
                              }}>✏️</button>
                              <button className={styles.mutationArrowBtn} onClick={(e) => { e.stopPropagation(); handleAlterTrackSortingIndices(p.id, idx, 'up'); }} disabled={idx === 0}>🗘▲</button>
                              <button className={styles.mutationArrowBtn} onClick={(e) => { e.stopPropagation(); handleAlterTrackSortingIndices(p.id, idx, 'down'); }} disabled={idx === p.tracks.length - 1}>🗘▼</button>
                              <button className={styles.mutationDeleteBtn} onClick={(e) => { e.stopPropagation(); handleEraseTrackFromContainer(p.id, idx); }}>✕</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* COMMENTS WINDOW INSIDE SHARED ECOSYSTEM COMPONENT CONTAINER */}
                  <div className={styles.playlistCommentsMatrixModule}>
                    <h5 className={styles.commentWidgetLabelHead}>💬 Team Feed Streams</h5>
                    <div className={styles.commentTimelineScrollTrackContainer}>
                      {p.comments && p.comments.map((c, cIdx) => (
                        <div key={cIdx} className={styles.commentBubbleNodeItem}>
                          <span className={styles.commentAuthorStamp}><strong>{c.authorName}</strong>:</span>
                          <span className={styles.commentTextBodyOutput}>{c.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.commentIngestionRowSubmitField}>
                      <input 
                        className={styles.formInput}
                        placeholder="Write inside project feed..."
                        value={commentInputs[p.id] || ''}
                        onChange={e => setCommentInputs({ ...commentInputs, [p.id]: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && handlePostCommentNode(p.id)}
                      />
                      <button className={styles.sendCommentArrowTriggerBtn} onClick={() => handlePostCommentNode(p.id)}>Send</button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>

        {/* COMPACTED CORE HARDWARE TERMINAL */}
        <div className={styles.sidePlaybackSection}>
          <div className={styles.stickyHardwarePlayer}>
            <h3 className={styles.blockTitle}>⚡ Core Hardware</h3>
            {activeVideoId ? (
              <div className={styles.playerWrapperContainer}>
                <div className={styles.videoEmbedContainer}>
                  <iframe
                    ref={iframeRef}
                    className={styles.youtubeIframeHardware}
                    src={`https://www.youtube.com/embed/${activeVideoId}?enablejsapi=1&autoplay=1&modestbranding=1&rel=0`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Hardware Frame Engine"
                  />
                </div>
                <div className={styles.activeTrackConsoleDisplayMetadata}>
                  <p className={styles.livePulseHeading}>⚡ RECEIVING STREAM:</p>
                  <p className={styles.liveTrackTitleText}>{currentTrackTitle}</p>
                  {activePlaylistQueue && (
                    <span className={styles.queueMetadataContextIndexChip}>
                      Index: {activeTrackIndex + 1} / {activePlaylistQueue.tracks?.length} inside &ldquo;{activePlaylistQueue.name}&rdquo;
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.playerStandbyScreen}>
                <div className={styles.standbyRadarPulse}>🎵</div>
                <p>Terminal Idle.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CONFIG COMPILATION */}
      {showPlaylistModal && (
        <div className={styles.modalOverlay} onClick={() => setShowPlaylistModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalHeadline}>📁 Compile Storage Vault Node</h3>
            <div className={styles.modalFormStack}>
              <input 
                className={styles.formInput} 
                placeholder="Playlist Unique Alias..." 
                value={playlistForm.name}
                onChange={e => setPlaylistForm({...playlistForm, name: e.target.value})}
              />
              <textarea 
                className={styles.formTextarea} 
                placeholder="Meta Context Allocation Description..." 
                value={playlistForm.desc}
                onChange={e => setPlaylistForm({...playlistForm, desc: e.target.value})}
              />
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowPlaylistModal(false)}>Cancel</button>
                <button className={styles.confirmBtn} onClick={handleCreatePlaylist}>Deploy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SHARE ACCESS ROUTER */}
      {showShareModal && (
        <div className={styles.modalOverlay} onClick={() => setShowShareModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalHeadline}>🌐 Target Distribution Router</h3>
            <div className={styles.modalFormStack}>
              <select 
                className={styles.formSelect}
                value={shareForm.targetEmail}
                onChange={e => setShareForm({...shareForm, targetEmail: e.target.value})}
              >
                <option value="">-- Select Destination User Entity --</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.email}>
                    {u.displayName || u.name || 'Workspace Account'} ({u.email})
                  </option>
                ))}
              </select>

              <select 
                className={styles.formSelect}
                value={shareForm.permission}
                onChange={e => setShareForm({...shareForm, permission: e.target.value})}
              >
                <option value="view">👀 View Privilege Node Only</option>
                <option value="edit">⚡ Full Read/Write Collaborator Link</option>
              </select>

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowShareModal(false)}>Cancel</button>
                <button className={styles.confirmBtn} onClick={handleApplySharePermission}>Bind</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
