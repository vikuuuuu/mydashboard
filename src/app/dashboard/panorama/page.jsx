'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, deleteDoc, doc,
  updateDoc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import styles from './panorama.module.css';

/* ══════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════ */
const CAPTURE_COLS   = 8;   // horizontal slices
const CAPTURE_ROWS   = 4;   // vertical slices
const TOTAL_FRAMES   = CAPTURE_COLS * CAPTURE_ROWS;
const FRAME_W        = 640;
const FRAME_H        = 480;
const PANO_W         = FRAME_W * CAPTURE_COLS;  // 5120
const PANO_H         = FRAME_H * CAPTURE_ROWS;  // 1920

/* ══════════════════════════════════════════════
   WEBGL 360 VIEWER  (equirectangular sphere)
══════════════════════════════════════════════ */
function use360Viewer(canvasRef, imageUrl, active) {
  const glRef    = useRef(null);
  const progRef  = useRef(null);
  const texRef   = useRef(null);
  const stateRef = useRef({
    yaw: 0, pitch: 0, fov: 75,
    dragging: false, lastX: 0, lastY: 0,
    velX: 0, velY: 0,
    autoRotate: false,
    animId: null,
  });

  /* init WebGL */
  useEffect(() => {
    if (!active || !canvasRef.current || !imageUrl) return;
    const canvas = canvasRef.current;
    const gl     = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;
    glRef.current = gl;

    /* Shaders */
    const vert = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }`;
    const frag = `
      precision highp float;
      uniform sampler2D u_tex;
      uniform float u_yaw;
      uniform float u_pitch;
      uniform float u_fov;
      uniform vec2 u_res;
      varying vec2 v_uv;
      const float PI = 3.14159265359;
      void main() {
        vec2 ndc = (v_uv * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
        float f   = 1.0 / tan(u_fov * 0.5 * PI / 180.0);
        vec3 ray  = normalize(vec3(ndc.x, ndc.y, f));
        float cy  = cos(u_yaw),   sy = sin(u_yaw);
        float cp  = cos(u_pitch), sp = sin(u_pitch);
        vec3 r;
        r.x =  cy * ray.x + sy * ray.z;
        r.z = -sy * ray.x + cy * ray.z;
        r.y =  sp * r.z + cp * ray.y;
        r.z =  cp * r.z - sp * ray.y;
        float lon = atan(r.x, r.z);
        float lat = asin(clamp(r.y / length(r), -1.0, 1.0));
        vec2 uv   = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
        gl_FragColor = texture2D(u_tex, uv);
      }`;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER,   vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    progRef.current = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    /* Texture */
    const tex = gl.createTexture();
    texRef.current = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20,20,40,255]));
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    };
    img.src = imageUrl;

    /* Render loop */
    const render = () => {
      const s   = stateRef.current;
      const W   = canvas.clientWidth;
      const H   = canvas.clientHeight;
      canvas.width  = W; canvas.height = H;
      gl.viewport(0, 0, W, H);

      if (s.autoRotate) s.yaw += 0.003;
      if (!s.dragging) { s.velX *= 0.93; s.velY *= 0.93; s.yaw += s.velX; s.pitch += s.velY; }
      s.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, s.pitch));

      gl.useProgram(prog);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'),   0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_yaw'),   s.yaw);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_pitch'), s.pitch);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_fov'),   s.fov);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_res'),   W, H);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      s.animId = requestAnimationFrame(render);
    };
    stateRef.current.animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(stateRef.current.animId);
      gl.deleteProgram(prog);
      gl.deleteTexture(tex);
    };
  }, [active, imageUrl]);

  /* Controls */
  const onMouseDown = e => { const s = stateRef.current; s.dragging = true; s.lastX = e.clientX; s.lastY = e.clientY; s.velX = 0; s.velY = 0; };
  const onMouseMove = e => {
    const s = stateRef.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY;
    s.velX = dx * 0.003; s.velY = dy * 0.003;
    s.yaw  -= dx * 0.004; s.pitch -= dy * 0.004;
    s.lastX = e.clientX; s.lastY = e.clientY;
  };
  const onMouseUp   = () => { stateRef.current.dragging = false; };
  const onWheel     = e => { const s = stateRef.current; s.fov = Math.max(20, Math.min(110, s.fov + e.deltaY * 0.05)); e.preventDefault(); };

  let lastDist = 0;
  const onTouchStart = e => {
    const s = stateRef.current;
    if (e.touches.length === 1) { s.dragging = true; s.lastX = e.touches[0].clientX; s.lastY = e.touches[0].clientY; }
    if (e.touches.length === 2) { lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
  };
  const onTouchMove = e => {
    e.preventDefault();
    const s = stateRef.current;
    if (e.touches.length === 1 && s.dragging) {
      const dx = e.touches[0].clientX - s.lastX, dy = e.touches[0].clientY - s.lastY;
      s.velX = dx * 0.003; s.velY = dy * 0.003;
      s.yaw -= dx * 0.004; s.pitch -= dy * 0.004;
      s.lastX = e.touches[0].clientX; s.lastY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      s.fov = Math.max(20, Math.min(110, s.fov - (d - lastDist) * 0.15));
      lastDist = d;
    }
  };
  const onTouchEnd  = () => { stateRef.current.dragging = false; };

  const toggleAutoRotate = () => { stateRef.current.autoRotate = !stateRef.current.autoRotate; };
  const resetView        = () => { const s = stateRef.current; s.yaw = 0; s.pitch = 0; s.fov = 75; s.velX = 0; s.velY = 0; };

  return { onMouseDown, onMouseMove, onMouseUp, onWheel, onTouchStart, onTouchMove, onTouchEnd, toggleAutoRotate, resetView, stateRef };
}

/* ══════════════════════════════════════════════
   PANORAMA CAPTURE ENGINE
══════════════════════════════════════════════ */
function usePanoCapture() {
  const videoRef    = useRef(null);
  const [frames,    setFrames]    = useState([]);  // {blob, col, row}
  const [capturing, setCapturing] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [progress,  setProgress]  = useState(0);   // 0..100
  const [step,      setStep]      = useState('idle'); // idle|guide|capturing|stitching|done
  const [panoBlob,  setPanoBlob]  = useState(null);
  const [panoUrl,   setPanoUrl]   = useState(null);
  const streamRef   = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: FRAME_W }, height: { ideal: FRAME_H } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setStep('guide');
    } catch (e) {
      alert('Camera permission denied or unavailable.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const captureFrame = useCallback(() => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_W; canvas.height = FRAME_H;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, FRAME_W, FRAME_H);
    return canvas;
  }, []);

  /* Auto-capture loop — captures one frame per ~400ms while step = 'capturing' */
  const captureAll = useCallback(async () => {
    setStep('capturing');
    setCapturing(true);
    const captured = [];
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      await new Promise(r => setTimeout(r, 380));
      const c = captureFrame();
      if (!c) continue;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      const row  = Math.floor(i / CAPTURE_COLS);
      const col  = i % CAPTURE_COLS;
      captured.push({ blob, col, row, url: URL.createObjectURL(blob) });
      setFrames([...captured]);
      setProgress(Math.round(((i + 1) / TOTAL_FRAMES) * 100));
    }
    setCapturing(false);
    setFrames(captured);
    await stitch(captured);
  }, [captureFrame]);

  /* Stitch all captured frames into one equirectangular canvas */
  const stitch = async (captured) => {
    setStep('stitching');
    setStitching(true);
    const canvas = document.createElement('canvas');
    canvas.width  = PANO_W;
    canvas.height = PANO_H;
    const ctx = canvas.getContext('2d');

    for (const frame of captured) {
      const img = new Image();
      img.src = frame.url;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      ctx.drawImage(img, frame.col * FRAME_W, frame.row * FRAME_H, FRAME_W, FRAME_H);
    }

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    const url  = URL.createObjectURL(blob);
    setPanoBlob(blob);
    setPanoUrl(url);
    setStitching(false);
    setStep('done');
    stopCamera();
  };

  const reset = () => {
    stopCamera();
    frames.forEach(f => URL.revokeObjectURL(f.url));
    if (panoUrl) URL.revokeObjectURL(panoUrl);
    setFrames([]); setProgress(0); setStep('idle');
    setPanoBlob(null); setPanoUrl(null); setCapturing(false); setStitching(false);
  };

  return { videoRef, frames, capturing, stitching, progress, step, panoBlob, panoUrl, startCamera, captureAll, reset };
}

/* ══════════════════════════════════════════════
   VIEWER COMPONENT
══════════════════════════════════════════════ */
function PanoViewer({ imageUrl, onClose }) {
  const canvasRef  = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoRot,    setAutoRot]    = useState(false);
  const [compass,    setCompass]    = useState(0);
  const { onMouseDown, onMouseMove, onMouseUp, onWheel,
          onTouchStart, onTouchMove, onTouchEnd,
          toggleAutoRotate, resetView, stateRef } = use360Viewer(canvasRef, imageUrl, true);

  /* Update compass from yaw */
  useEffect(() => {
    const id = setInterval(() => {
      if (stateRef.current) setCompass(((stateRef.current.yaw * 180 / Math.PI) % 360 + 360) % 360);
    }, 100);
    return () => clearInterval(id);
  }, [stateRef]);

  const handleFullscreen = () => {
    const el = canvasRef.current?.parentElement;
    if (!document.fullscreenElement) { el?.requestFullscreen(); setFullscreen(true); }
    else { document.exitFullscreen(); setFullscreen(false); }
  };

  const handleAutoRot = () => { setAutoRot(v => !v); toggleAutoRotate(); };

  return (
    <div className={styles.viewerWrap}>
      <div
        className={styles.viewerCanvas}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        <canvas ref={canvasRef} className={styles.glCanvas} />

        {/* Compass */}
        <div className={styles.compass}>
          <div className={styles.compassNeedle} style={{ transform: `rotate(${-compass}deg)` }}>
            <span className={styles.compassN}>N</span>
          </div>
        </div>

        {/* Controls overlay */}
        <div className={styles.viewerControls}>
          <button className={styles.vcBtn} onClick={resetView} title="Reset view">⌖</button>
          <button className={`${styles.vcBtn} ${autoRot ? styles.vcBtnActive : ''}`} onClick={handleAutoRot} title="Auto rotate">↻</button>
          <button className={styles.vcBtn} onClick={handleFullscreen} title="Fullscreen">⛶</button>
          {onClose && <button className={`${styles.vcBtn} ${styles.vcBtnClose}`} onClick={onClose} title="Close">✕</button>}
        </div>

        <div className={styles.viewerHint}>Drag to look around · Scroll to zoom</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   GALLERY CARD
══════════════════════════════════════════════ */
function GalleryCard({ pano, onView, onDelete, onRename }) {
  const [editing,   setEditing]   = useState(false);
  const [nameVal,   setNameVal]   = useState(pano.name);
  const [confirming, setConfirming] = useState(false);

  const saveRename = () => { if (nameVal.trim()) onRename(pano.id, nameVal.trim()); setEditing(false); };

  return (
    <div className={styles.galleryCard}>
      <div className={styles.galleryThumb} onClick={() => onView(pano)}>
        <img src={pano.url} alt={pano.name} className={styles.galleryImg} loading="lazy" />
        <div className={styles.galleryOverlay}>
          <span className={styles.galleryViewBtn}>🔭 View 360°</span>
        </div>
      </div>
      <div className={styles.galleryInfo}>
        {editing ? (
          <div className={styles.renameRow}>
            <input className={styles.renameInput} value={nameVal} onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(false); }}
              autoFocus />
            <button className={styles.renameOk} onClick={saveRename}>✓</button>
            <button className={styles.renameCancel} onClick={() => setEditing(false)}>✕</button>
          </div>
        ) : (
          <div className={styles.galleryName} onDoubleClick={() => setEditing(true)}>{pano.name}</div>
        )}
        <div className={styles.galleryDate}>{pano.createdAt?.toDate?.().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) || '—'}</div>
        <div className={styles.galleryActions}>
          <button className={styles.galBtn} onClick={() => onView(pano)}>View</button>
          <button className={styles.galBtn} onClick={() => setEditing(true)}>✏️</button>
          {confirming
            ? <><button className={styles.galBtnDanger} onClick={() => onDelete(pano)}>Confirm</button>
                <button className={styles.galBtn} onClick={() => setConfirming(false)}>Cancel</button></>
            : <button className={styles.galBtnDanger} onClick={() => setConfirming(true)}>🗑</button>
          }
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function PanoramaPage() {
  const router = useRouter();
  const [uid,        setUid]        = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDark,     setIsDark]     = useState(false);
  const [activeTab,  setActiveTab]  = useState('gallery'); // gallery|capture|viewer
  const [panoramas,  setPanoramas]  = useState([]);
  const [loadingPanos, setLoadingPanos] = useState(false);
  const [viewingPano,  setViewingPano]  = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadPct,    setUploadPct]    = useState(0);
  const [panoName,     setPanoName]     = useState('');

  const capture = usePanoCapture();

  /* ── Auth ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (u) { setUid(u.uid); setAuthLoading(false); }
      else    { router.replace('/login'); }
    });
    return unsub;
  }, [router]);

  /* ── Load panoramas ── */
  const loadPanoramas = useCallback(async () => {
    if (!uid) return;
    setLoadingPanos(true);
    const q    = query(collection(db, `users/${uid}/panoramas`), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    setPanoramas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoadingPanos(false);
  }, [uid]);

  useEffect(() => { loadPanoramas(); }, [loadPanoramas]);

  /* ── Save panorama to Firestore + Storage ── */
  const savePanorama = async () => {
    if (!capture.panoBlob || !uid) return;
    const name = panoName.trim() || `Panorama ${new Date().toLocaleDateString('en-IN')}`;
    setUploading(true); setUploadPct(10);
    try {
      const filename = `panoramas/${uid}/${Date.now()}.jpg`;
      const sRef     = storageRef(storage, filename);
      setUploadPct(30);
      await uploadBytes(sRef, capture.panoBlob);
      setUploadPct(70);
      const url = await getDownloadURL(sRef);
      setUploadPct(85);
      await addDoc(collection(db, `users/${uid}/panoramas`), {
        name, url, filename, createdAt: serverTimestamp(),
      });
      setUploadPct(100);
      await loadPanoramas();
      capture.reset();
      setPanoName('');
      setActiveTab('gallery');
    } catch (e) {
      console.error(e);
      alert('Upload failed. Check console.');
    }
    setUploading(false); setUploadPct(0);
  };

  /* ── Download panorama ── */
  const downloadPano = () => {
    if (!capture.panoUrl) return;
    const a  = document.createElement('a');
    a.href   = capture.panoUrl;
    a.download = `panorama-${Date.now()}.jpg`;
    a.click();
  };

  /* ── Upload existing image ── */
  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    setPanoName(name);
    setUploading(true); setUploadPct(20);
    try {
      const filename = `panoramas/${uid}/${Date.now()}.jpg`;
      const sRef     = storageRef(storage, filename);
      await uploadBytes(sRef, file);
      setUploadPct(60);
      const url = await getDownloadURL(sRef);
      setUploadPct(85);
      await addDoc(collection(db, `users/${uid}/panoramas`), {
        name, url, filename, createdAt: serverTimestamp(),
      });
      setUploadPct(100);
      await loadPanoramas();
    } catch (e) { console.error(e); alert('Upload failed.'); }
    setUploading(false); setUploadPct(0);
  };

  /* ── Delete panorama ── */
  const deletePanorama = async (pano) => {
    if (!uid) return;
    try {
      if (pano.filename) await deleteObject(storageRef(storage, pano.filename));
      await deleteDoc(doc(db, `users/${uid}/panoramas`, pano.id));
      setPanoramas(prev => prev.filter(p => p.id !== pano.id));
      if (viewingPano?.id === pano.id) { setViewingPano(null); setActiveTab('gallery'); }
    } catch (e) { console.error(e); }
  };

  /* ── Rename panorama ── */
  const renamePanorama = async (id, name) => {
    if (!uid) return;
    await updateDoc(doc(db, `users/${uid}/panoramas`, id), { name });
    setPanoramas(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  };

  /* ── View panorama ── */
  const viewPanorama = (pano) => { setViewingPano(pano); setActiveTab('viewer'); };

  if (authLoading) return (
    <div className={styles.loaderScreen}>
      <div className={styles.loaderRing} />
      <p>Loading…</p>
    </div>
  );

  const TABS = [
    { id: 'gallery', label: '🖼 Gallery' },
    { id: 'capture', label: '📷 Capture' },
    ...(viewingPano ? [{ id: 'viewer', label: '🔭 Viewer' }] : []),
  ];

  /* ───────────────────────────────── */
  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Dashboard</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🌐</div>
          <span>360 Panorama</span>
        </div>
        <div className={styles.topBarRight}>
          {/* Upload existing panorama */}
          <label className={styles.uploadExistingBtn} title="Upload existing panorama">
            ⬆ Upload
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadFile} />
          </label>
          <span className={styles.panoCount}>{panoramas.length} panorama{panoramas.length !== 1 ? 's' : ''}</span>
          <button className={styles.themeBtn} onClick={() => setIsDark(d => !d)}>{isDark ? '☀️' : '🌙'}</button>
        </div>
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className={styles.uploadBar}>
          <div className={styles.uploadFill} style={{ width: `${uploadPct}%` }} />
          <span className={styles.uploadLabel}>Saving panorama… {uploadPct}%</span>
        </div>
      )}

      {/* ── TABS ── */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ════════════════════════════════
          GALLERY TAB
      ════════════════════════════════ */}
      {activeTab === 'gallery' && (
        <div className={styles.content}>
          {loadingPanos ? (
            <div className={styles.centeredLoader}><div className={styles.loaderRing} /><p>Loading panoramas…</p></div>
          ) : panoramas.length === 0 ? (
            <div className={styles.emptyGallery}>
              <div className={styles.emptyIcon}>🌐</div>
              <div className={styles.emptyTitle}>No panoramas yet</div>
              <p className={styles.emptySub}>Capture your first 360° panorama or upload an existing equirectangular image.</p>
              <div className={styles.emptyActions}>
                <button className={styles.primaryBtn} onClick={() => setActiveTab('capture')}>📷 Capture Now</button>
                <label className={styles.outlineBtn}>
                  ⬆ Upload Image
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadFile} />
                </label>
              </div>
            </div>
          ) : (
            <div className={styles.galleryGrid}>
              {panoramas.map(p => (
                <GalleryCard key={p.id} pano={p} onView={viewPanorama} onDelete={deletePanorama} onRename={renamePanorama} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════
          CAPTURE TAB
      ════════════════════════════════ */}
      {activeTab === 'capture' && (
        <div className={styles.content}>
          <div className={styles.captureWrap}>

            {/* IDLE */}
            {capture.step === 'idle' && (
              <div className={styles.captureIdle}>
                <div className={styles.captureIdleIcon}>📷</div>
                <h2 className={styles.captureIdleTitle}>Capture 360° Panorama</h2>
                <p className={styles.captureIdleSub}>
                  We will automatically capture {TOTAL_FRAMES} frames while you slowly rotate your device in a full circle, covering top and bottom as well.
                </p>
                <div className={styles.captureSteps}>
                  {['Hold phone upright', 'Press Start', 'Slowly rotate 360°', 'Hold level for each direction'].map((s, i) => (
                    <div key={i} className={styles.captureStep}>
                      <div className={styles.captureStepNum}>{i + 1}</div>
                      <div className={styles.captureStepText}>{s}</div>
                    </div>
                  ))}
                </div>
                <button className={styles.primaryBtn} style={{ marginTop: 24 }} onClick={capture.startCamera}>
                  📷 Start Camera
                </button>
              </div>
            )}

            {/* GUIDE — camera ready, not yet capturing */}
            {capture.step === 'guide' && (
              <div className={styles.captureGuide}>
                <div className={styles.videoWrap}>
                  <video ref={capture.videoRef} className={styles.captureVideo} playsInline muted autoPlay />
                  <div className={styles.videoOverlay}>
                    <div className={styles.captureReticle} />
                    <div className={styles.captureGuideText}>
                      Point camera at scene → Press Capture
                    </div>
                  </div>
                </div>
                <div className={styles.captureGuideActions}>
                  <button className={styles.primaryBtn} onClick={capture.captureAll}>
                    ● Start Capturing ({TOTAL_FRAMES} frames)
                  </button>
                  <button className={styles.outlineBtn} onClick={capture.reset}>Cancel</button>
                </div>
              </div>
            )}

            {/* CAPTURING */}
            {capture.step === 'capturing' && (
              <div className={styles.capturingWrap}>
                <div className={styles.videoWrap}>
                  <video ref={capture.videoRef} className={styles.captureVideo} playsInline muted autoPlay />
                  <div className={styles.videoOverlay}>
                    <div className={styles.captureReticle} />
                    <div className={styles.captureProgressRing} style={{ '--pct': capture.progress }}>
                      <span className={styles.captureProgressNum}>{capture.progress}%</span>
                    </div>
                  </div>
                </div>
                <div className={styles.frameStrip}>
                  {capture.frames.slice(-8).map((f, i) => (
                    <img key={i} src={f.url} className={styles.frameThumb} alt="" />
                  ))}
                </div>
                <div className={styles.captureProgressBar}>
                  <div className={styles.captureProgressFill} style={{ width: `${capture.progress}%` }} />
                  <span className={styles.captureProgressLabel}>
                    Captured {capture.frames.length} / {TOTAL_FRAMES} frames — Slowly rotate your device
                  </span>
                </div>
              </div>
            )}

            {/* STITCHING */}
            {capture.step === 'stitching' && (
              <div className={styles.stitchingWrap}>
                <div className={styles.stitchingIcon}>🧵</div>
                <div className={styles.stitchingTitle}>Stitching panorama…</div>
                <p className={styles.stitchingSub}>Assembling {TOTAL_FRAMES} frames into one equirectangular image.</p>
                <div className={styles.stitchingBar}>
                  <div className={styles.stitchingFill} />
                </div>
              </div>
            )}

            {/* DONE */}
            {capture.step === 'done' && capture.panoUrl && (
              <div className={styles.doneWrap}>
                <div className={styles.doneHeader}>
                  <div className={styles.doneBadge}>✅ Panorama Ready</div>
                  <h2 className={styles.doneTitle}>Your 360° panorama is ready!</h2>
                </div>

                {/* Quick preview in viewer */}
                <div className={styles.doneViewer}>
                  <PanoViewer imageUrl={capture.panoUrl} />
                </div>

                <div className={styles.doneActions}>
                  <div className={styles.nameRow}>
                    <input
                      className={styles.nameInput}
                      value={panoName}
                      onChange={e => setPanoName(e.target.value)}
                      placeholder="Name your panorama…"
                    />
                  </div>
                  <div className={styles.doneButtons}>
                    <button className={styles.primaryBtn} onClick={savePanorama} disabled={uploading}>
                      {uploading ? `Saving… ${uploadPct}%` : '💾 Save to Gallery'}
                    </button>
                    <button className={styles.outlineBtn} onClick={downloadPano}>⬇ Download</button>
                    <button className={styles.outlineBtn} onClick={capture.reset}>🔄 Retake</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════
          VIEWER TAB
      ════════════════════════════════ */}
      {activeTab === 'viewer' && viewingPano && (
        <div className={styles.viewerPage}>
          <div className={styles.viewerPageHeader}>
            <div className={styles.viewerPageTitle}>🔭 {viewingPano.name}</div>
            <button className={styles.outlineBtn} onClick={() => { setActiveTab('gallery'); setViewingPano(null); }}>
              ← Back to Gallery
            </button>
          </div>
          <PanoViewer
            imageUrl={viewingPano.url}
            onClose={() => { setActiveTab('gallery'); setViewingPano(null); }}
          />
        </div>
      )}

    </div>
  );
}
