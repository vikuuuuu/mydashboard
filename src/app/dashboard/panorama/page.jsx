'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  updateDoc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import styles from './panorama.module.css';

/* ══════════════════════════════════════════════
   IndexedDB helper — stores blob as base64
══════════════════════════════════════════════ */
const IDB_NAME    = 'panorama360db';
const IDB_STORE   = 'images';
const IDB_VERSION = 1;

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
async function idbSave(id, dataUrl) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx   = db.transaction(IDB_STORE, 'readwrite');
    const req  = tx.objectStore(IDB_STORE).put({ id, dataUrl });
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}
async function idbGet(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = e => res(e.target.result?.dataUrl || null);
    req.onerror   = e => rej(e.target.error);
  });
}
async function idbDelete(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}
function blobToDataUrl(blob) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(blob);
  });
}

/* ══════════════════════════════════════════════
   CAPTURE GRID DEFINITION
   8 horizontal × 3 vertical = 24 shots
   each shot has a target yaw+pitch range
══════════════════════════════════════════════ */
const H_STEPS  = 8;
const V_LEVELS = [
  { label: 'Sky',   pitch: 60,  icon: '⬆️' },
  { label: 'Level', pitch: 0,   icon: '➡️' },
  { label: 'Ground',pitch: -45, icon: '⬇️' },
];
const SHOTS = [];
V_LEVELS.forEach((v, vi) => {
  for (let h = 0; h < H_STEPS; h++) {
    const yaw = Math.round(h * (360 / H_STEPS));
    SHOTS.push({ index: vi * H_STEPS + h, row: vi, col: h, yaw, pitch: v.pitch, label: v.label, icon: v.icon });
  }
});
const TOTAL_SHOTS = SHOTS.length; // 24

const FRAME_W = 640;
const FRAME_H = 480;
const PANO_W  = FRAME_W * H_STEPS;       // 5120
const PANO_H  = FRAME_H * V_LEVELS.length; // 1440

/* ══════════════════════════════════════════════
   WEBGL 360 VIEWER
══════════════════════════════════════════════ */
function use360Viewer(canvasRef, imageUrl, active) {
  const stateRef = useRef({
    yaw: 0, pitch: 0, fov: 75,
    dragging: false, lastX: 0, lastY: 0,
    velX: 0, velY: 0,
    autoRotate: false, animId: null,
    gyro: false,
  });
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!active || !canvasRef.current || !imageUrl) return;
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;

    const vert = `attribute vec2 a_pos; varying vec2 v_uv;
      void main(){ v_uv=a_pos*.5+.5; gl_Position=vec4(a_pos,0.,1.); }`;
    const frag = `precision highp float;
      uniform sampler2D u_tex; uniform float u_yaw,u_pitch,u_fov; uniform vec2 u_res;
      varying vec2 v_uv;
      const float PI=3.14159265359;
      void main(){
        vec2 ndc=(v_uv*2.-1.)*vec2(u_res.x/u_res.y,1.);
        float f=1./tan(u_fov*.5*PI/180.);
        vec3 ray=normalize(vec3(ndc.x,ndc.y,f));
        float cy=cos(u_yaw),sy=sin(u_yaw),cp=cos(u_pitch),sp=sin(u_pitch);
        vec3 r; r.x=cy*ray.x+sy*ray.z; r.z=-sy*ray.x+cy*ray.z;
        r.y=sp*r.z+cp*ray.y; r.z=cp*r.z-sp*ray.y;
        float lon=atan(r.x,r.z); float lat=asin(clamp(r.y/length(r),-1.,1.));
        vec2 uv=vec2(lon/(2.*PI)+.5,lat/PI+.5);
        gl_FragColor=texture2D(u_tex,uv);
      }`;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([15,15,30,255]));

    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    };
    img.src = imageUrl;

    const render = () => {
      const s = stateRef.current;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      if (s.autoRotate && !s.gyro) s.yaw += 0.003;
      if (!s.dragging) { s.velX *= 0.93; s.velY *= 0.93; s.yaw += s.velX; s.pitch += s.velY; }
      s.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, s.pitch));
      gl.useProgram(prog);
      const ul = n => gl.getUniformLocation(prog, n);
      gl.uniform1i(ul('u_tex'), 0);
      gl.uniform1f(ul('u_yaw'), s.yaw);
      gl.uniform1f(ul('u_pitch'), s.pitch);
      gl.uniform1f(ul('u_fov'), s.fov);
      gl.uniform2f(ul('u_res'), W, H);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      s.animId = requestAnimationFrame(render);
    };
    stateRef.current.animId = requestAnimationFrame(render);
    cleanupRef.current = () => {
      cancelAnimationFrame(stateRef.current.animId);
      gl.deleteProgram(prog); gl.deleteTexture(tex);
    };
    return () => cleanupRef.current?.();
  }, [active, imageUrl]);

  const onMouseDown = e => { const s = stateRef.current; s.dragging = true; s.lastX = e.clientX; s.lastY = e.clientY; s.velX = 0; s.velY = 0; };
  const onMouseMove = e => {
    const s = stateRef.current; if (!s.dragging) return;
    const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY;
    s.velX = dx * 0.003; s.velY = dy * 0.003;
    s.yaw -= dx * 0.005; s.pitch -= dy * 0.005;
    s.lastX = e.clientX; s.lastY = e.clientY;
  };
  const onMouseUp = () => { stateRef.current.dragging = false; };
  const onWheel   = e => { stateRef.current.fov = Math.max(20, Math.min(110, stateRef.current.fov + e.deltaY * 0.05)); e.preventDefault(); };

  let lastDist = 0;
  const onTouchStart = e => {
    const s = stateRef.current;
    if (e.touches.length === 1) { s.dragging = true; s.lastX = e.touches[0].clientX; s.lastY = e.touches[0].clientY; }
    if (e.touches.length === 2) lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  };
  const onTouchMove = e => {
    e.preventDefault(); const s = stateRef.current;
    if (e.touches.length === 1 && s.dragging) {
      const dx = e.touches[0].clientX - s.lastX, dy = e.touches[0].clientY - s.lastY;
      s.velX = dx * 0.003; s.velY = dy * 0.003;
      s.yaw -= dx * 0.005; s.pitch -= dy * 0.005;
      s.lastX = e.touches[0].clientX; s.lastY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      s.fov = Math.max(20, Math.min(110, s.fov - (d - lastDist) * 0.15));
      lastDist = d;
    }
  };
  const onTouchEnd = () => { stateRef.current.dragging = false; };

  const toggleAutoRotate = () => { stateRef.current.autoRotate = !stateRef.current.autoRotate; return stateRef.current.autoRotate; };
  const resetView        = () => { Object.assign(stateRef.current, { yaw: 0, pitch: 0, fov: 75, velX: 0, velY: 0 }); };

  /* Device orientation (gyro) */
  const enableGyro = async () => {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') return false;
    }
    const handler = e => {
      if (!stateRef.current.gyro) return;
      const alpha = e.alpha || 0, beta = e.beta || 0;
      stateRef.current.yaw   = -(alpha * Math.PI / 180);
      stateRef.current.pitch =  (beta  * Math.PI / 180) * 0.5;
    };
    window.addEventListener('deviceorientation', handler, true);
    stateRef.current.gyro = true;
    stateRef.current._gyroHandler = handler;
    return true;
  };
  const disableGyro = () => {
    if (stateRef.current._gyroHandler) window.removeEventListener('deviceorientation', stateRef.current._gyroHandler, true);
    stateRef.current.gyro = false;
  };

  return { onMouseDown, onMouseMove, onMouseUp, onWheel, onTouchStart, onTouchMove, onTouchEnd, toggleAutoRotate, resetView, enableGyro, disableGyro, stateRef };
}

/* ══════════════════════════════════════════════
   DIRECTION GUIDE OVERLAY
   Shows sphere diagram + which shot is next
══════════════════════════════════════════════ */
function DirectionGuide({ currentShot, capturedSet, deviceYaw, devicePitch }) {
  const shot    = SHOTS[currentShot];
  const targetY = shot.yaw;
  const targetP = shot.pitch;

  // How far off are we from target (using deviceYaw in degrees)
  const yawDiff   = ((deviceYaw - targetY + 540) % 360) - 180;   // -180..180
  const pitchDiff = devicePitch - targetP;

  const yawOk   = Math.abs(yawDiff)   < 20;
  const pitchOk = Math.abs(pitchDiff) < 15;
  const aligned = yawOk && pitchOk;

  // Arrow direction
  const arrowYaw   = yawDiff   >  15 ? '←' : yawDiff   < -15 ? '→' : '';
  const arrowPitch = pitchDiff >  10 ? '↑' : pitchDiff < -10 ? '↓' : '';

  return (
    <div className={styles.dirGuide}>
      {/* Mini sphere map — top view */}
      <div className={styles.sphereMap}>
        {SHOTS.filter(s => s.row === 1).map(s => {
          const angle  = (s.yaw * Math.PI) / 180;
          const r      = 38;
          const cx     = 50 + r * Math.sin(angle);
          const cy     = 50 - r * Math.cos(angle);
          const done   = capturedSet.has(s.index);
          const active = s.index === currentShot || (currentShot < H_STEPS * 1 && s.col === shot.col && s.row === 1);
          return (
            <div key={s.index} className={`${styles.sphereDot} ${done ? styles.sphereDotDone : ''} ${active ? styles.sphereDotActive : ''}`}
              style={{ left: `${cx}%`, top: `${cy}%` }} />
          );
        })}
        <div className={styles.sphereCenter}>
          <span className={styles.sphereYouLabel}>YOU</span>
        </div>
        {/* Current direction pointer */}
        <div className={styles.spherePointer} style={{ transform: `rotate(${deviceYaw}deg)` }} />
      </div>

      {/* Text instructions */}
      <div className={styles.dirInfo}>
        <div className={styles.dirLevel}>
          <span className={styles.dirLevelIcon}>{shot.icon}</span>
          <span className={styles.dirLevelText}>{shot.label} shot</span>
          <span className={styles.dirShotCount}>{currentShot + 1}/{TOTAL_SHOTS}</span>
        </div>

        <div className={styles.dirTarget}>
          Turn to <strong>{targetY}°</strong>
          {targetP !== 0 && <> · {targetP > 0 ? 'tilt up' : 'tilt down'} <strong>{Math.abs(targetP)}°</strong></>}
        </div>

        {/* Arrow nudge */}
        <div className={styles.dirArrows}>
          {arrowYaw   && <span className={styles.dirArrow}>{arrowYaw}</span>}
          {arrowPitch && <span className={styles.dirArrow}>{arrowPitch}</span>}
          {aligned    && <span className={styles.dirAligned}>✓ Aligned!</span>}
        </div>

        {/* Row progress pills */}
        <div className={styles.dirRows}>
          {V_LEVELS.map((v, vi) => {
            const rowDone  = SHOTS.filter(s => s.row === vi).filter(s => capturedSet.has(s.index)).length;
            return (
              <div key={vi} className={`${styles.dirRowPill} ${vi === shot.row ? styles.dirRowPillActive : ''}`}>
                {v.icon} {v.label} {rowDone}/{H_STEPS}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   CAPTURE ENGINE  (gyro-guided, manual tap)
══════════════════════════════════════════════ */
function usePanoCapture() {
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const gyroRef       = useRef({ yaw: 0, pitch: 0 });

  const [step,        setStep]        = useState('idle');
  const [capturedSet, setCapturedSet] = useState(new Set());
  const [frames,      setFrames]      = useState([]);
  const [currentShot, setCurrentShot] = useState(0);
  const [deviceYaw,   setDeviceYaw]   = useState(0);
  const [devicePitch, setDevicePitch] = useState(0);
  const [aligned,     setAligned]     = useState(false);
  const [stitching,   setStitching]   = useState(false);
  const [panoBlob,    setPanoBlob]    = useState(null);
  const [panoUrl,     setPanoUrl]     = useState(null);
  const [camError,    setCamError]    = useState('');

  /* Start camera */
  const startCamera = async () => {
    setCamError('');
    try {
      // Try rear camera first, fall back to any camera
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', '');
        videoRef.current.setAttribute('muted', '');
        await videoRef.current.play().catch(() => {});
      }
      setStep('guide');
    } catch (e) {
      setCamError('Camera access denied. Please allow camera permission and try again.');
    }
  };

  /* Gyroscope listener */
  useEffect(() => {
    if (step !== 'guide' && step !== 'capturing') return;
    const handler = e => {
      const yaw   = ((e.alpha || 0) + 360) % 360;
      const pitch = e.beta  || 0;
      gyroRef.current = { yaw, pitch };
      setDeviceYaw(Math.round(yaw));
      setDevicePitch(Math.round(pitch));
      // Check alignment with current shot
      const shot    = SHOTS[currentShot];
      const yawDiff = ((yaw - shot.yaw + 540) % 360) - 180;
      const pDiff   = pitch - shot.pitch;
      setAligned(Math.abs(yawDiff) < 20 && Math.abs(pDiff) < 15);
    };
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(p => {
        if (p === 'granted') window.addEventListener('deviceorientation', handler, true);
      });
    } else {
      window.addEventListener('deviceorientation', handler, true);
    }
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [step, currentShot]);

  /* Manual shot — called when user presses shutter button */
  const takeShot = useCallback(() => {
    if (!videoRef.current || step !== 'capturing') return;
    const shot   = SHOTS[currentShot];
    const canvas = document.createElement('canvas');
    canvas.width  = FRAME_W; canvas.height = FRAME_H;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, FRAME_W, FRAME_H);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setFrames(prev => [...prev, { blob, url, col: shot.col, row: shot.row, index: shot.index }]);
      setCapturedSet(prev => new Set([...prev, shot.index]));
      const next = currentShot + 1;
      if (next >= TOTAL_SHOTS) {
        // All shots done — stitch
        setCurrentShot(next);
        setStep('stitching');
      } else {
        setCurrentShot(next);
      }
    }, 'image/jpeg', 0.88);
  }, [step, currentShot]);

  /* Auto-capture when aligned (optional enhancement) */
  const autoTake = useCallback(() => {
    if (aligned && step === 'capturing') takeShot();
  }, [aligned, step, takeShot]);

  /* Start capture session */
  const startCapturing = () => { setStep('capturing'); setCurrentShot(0); };

  /* Stitch effect — runs when step becomes 'stitching' */
  useEffect(() => {
    if (step !== 'stitching') return;
    const doStitch = async () => {
      setStitching(true);
      const canvas = document.createElement('canvas');
      canvas.width  = PANO_W;
      canvas.height = PANO_H;
      const ctx = canvas.getContext('2d');
      // Fill black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, PANO_W, PANO_H);

      for (const frame of frames) {
        const img = new Image();
        img.src = frame.url;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        ctx.drawImage(img, frame.col * FRAME_W, frame.row * FRAME_H, FRAME_W, FRAME_H);
      }
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.93));
      const url  = URL.createObjectURL(blob);
      setPanoBlob(blob);
      setPanoUrl(url);
      setStitching(false);
      setStep('done');
      // Stop camera
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    doStitch();
  }, [step]);

  const stopCamera = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };

  const reset = () => {
    stopCamera();
    frames.forEach(f => URL.revokeObjectURL(f.url));
    if (panoUrl) URL.revokeObjectURL(panoUrl);
    setStep('idle'); setFrames([]); setCapturedSet(new Set());
    setCurrentShot(0); setAligned(false); setStitching(false);
    setPanoBlob(null); setPanoUrl(null); setCamError('');
  };

  const progress = Math.round((capturedSet.size / TOTAL_SHOTS) * 100);

  return {
    videoRef, step, capturedSet, frames, currentShot,
    deviceYaw, devicePitch, aligned, stitching, progress,
    panoBlob, panoUrl, camError,
    startCamera, startCapturing, takeShot, autoTake, reset,
  };
}

/* ══════════════════════════════════════════════
   VIEWER COMPONENT
══════════════════════════════════════════════ */
function PanoViewer({ imageUrl, onClose, title }) {
  const canvasRef    = useRef(null);
  const [autoRot,    setAutoRot]    = useState(false);
  const [gyroOn,     setGyroOn]     = useState(false);
  const [compass,    setCompass]    = useState(0);
  const { onMouseDown, onMouseMove, onMouseUp, onWheel,
          onTouchStart, onTouchMove, onTouchEnd,
          toggleAutoRotate, resetView, enableGyro, disableGyro, stateRef }
        = use360Viewer(canvasRef, imageUrl, true);

  useEffect(() => {
    const id = setInterval(() => {
      if (stateRef.current) setCompass((((stateRef.current.yaw * 180 / Math.PI) % 360) + 360) % 360);
    }, 100);
    return () => clearInterval(id);
  }, [stateRef]);

  const handleAutoRot = () => { const v = toggleAutoRotate(); setAutoRot(v); };
  const handleGyro    = async () => {
    if (gyroOn) { disableGyro(); setGyroOn(false); }
    else        { const ok = await enableGyro(); setGyroOn(ok); if (!ok) alert('Gyroscope not available or permission denied.'); }
  };
  const handleFullscreen = () => {
    const el = document.fullscreenElement;
    if (!el) canvasRef.current?.parentElement?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div className={styles.viewerWrap}>
      {title && <div className={styles.viewerTitle}>{title}</div>}
      <div className={styles.viewerCanvas}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

        <canvas ref={canvasRef} className={styles.glCanvas} />

        {/* Compass */}
        <div className={styles.compass}>
          <div className={styles.compassRing} style={{ transform: `rotate(${-compass}deg)` }}>
            <span className={styles.compassN}>N</span>
            <span className={styles.compassS}>S</span>
            <span className={styles.compassE}>E</span>
            <span className={styles.compassW}>W</span>
          </div>
          <div className={styles.compassDot} />
        </div>

        {/* Controls */}
        <div className={styles.viewerControls}>
          <button className={styles.vcBtn} onClick={resetView} title="Reset">⌖</button>
          <button className={`${styles.vcBtn} ${autoRot ? styles.vcBtnActive : ''}`} onClick={handleAutoRot} title="Auto rotate">↻</button>
          <button className={`${styles.vcBtn} ${gyroOn ? styles.vcBtnActive : ''}`} onClick={handleGyro} title="Gyroscope">📡</button>
          <button className={styles.vcBtn} onClick={handleFullscreen} title="Fullscreen">⛶</button>
          {onClose && <button className={`${styles.vcBtn} ${styles.vcBtnClose}`} onClick={onClose}>✕</button>}
        </div>

        <div className={styles.viewerHint}>Drag to look · Scroll to zoom · 📡 for gyro</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   GALLERY CARD
══════════════════════════════════════════════ */
function GalleryCard({ pano, onView, onDelete, onRename }) {
  const [editing,    setEditing]    = useState(false);
  const [nameVal,    setNameVal]    = useState(pano.name);
  const [confirming, setConfirming] = useState(false);
  const saveRename = () => { if (nameVal.trim()) onRename(pano.id, nameVal.trim()); setEditing(false); };
  return (
    <div className={styles.galleryCard}>
      <div className={styles.galleryThumb} onClick={() => onView(pano)}>
        {pano.url
          ? <img src={pano.url} alt={pano.name} className={styles.galleryImg} loading="lazy" />
          : <div className={styles.galleryNoThumb}>🌐</div>
        }
        <div className={styles.galleryOverlay}><span className={styles.galleryViewBtn}>🔭 View 360°</span></div>
      </div>
      <div className={styles.galleryInfo}>
        {editing ? (
          <div className={styles.renameRow}>
            <input className={styles.renameInput} value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(false); }}
              autoFocus />
            <button className={styles.renameOk} onClick={saveRename}>✓</button>
            <button className={styles.renameCancel} onClick={() => setEditing(false)}>✕</button>
          </div>
        ) : (
          <div className={styles.galleryName} onDoubleClick={() => setEditing(true)}>{pano.name}</div>
        )}
        <div className={styles.galleryMeta}>
          <span className={styles.galleryDate}>{pano.createdAt?.toDate?.().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) || '—'}</span>
          {pano.local && <span className={styles.galleryLocalBadge}>📱 Local</span>}
        </div>
        <div className={styles.galleryActions}>
          <button className={styles.galBtn} onClick={() => onView(pano)}>🔭 View</button>
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
  const [uid,          setUid]          = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [isDark,       setIsDark]       = useState(false);
  const [activeTab,    setActiveTab]    = useState('gallery');
  const [panoramas,    setPanoramas]    = useState([]);
  const [loadingPanos, setLoadingPanos] = useState(false);
  const [viewingPano,  setViewingPano]  = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [panoName,     setPanoName]     = useState('');

  const capture = usePanoCapture();

  /* Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (u) { setUid(u.uid); setAuthLoading(false); }
      else   { router.replace('/login'); }
    });
    return unsub;
  }, [router]);

  /* Load panoramas — metadata from Firestore, image from IndexedDB */
  const loadPanoramas = useCallback(async () => {
    if (!uid) return;
    setLoadingPanos(true);
    try {
      const q    = query(collection(db, `users/${uid}/panoramas`), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = await Promise.all(snap.docs.map(async d => {
        const data  = { id: d.id, ...d.data() };
        // Load image from IndexedDB
        const imgUrl = await idbGet(d.id).catch(() => null);
        return { ...data, url: imgUrl, local: true };
      }));
      setPanoramas(list);
    } catch (e) { console.error(e); }
    setLoadingPanos(false);
  }, [uid]);

  useEffect(() => { if (uid) loadPanoramas(); }, [uid, loadPanoramas]);

  /* Save panorama */
  const savePanorama = async () => {
    if (!capture.panoBlob || !uid) return;
    const name = panoName.trim() || `Panorama ${new Date().toLocaleDateString('en-IN')}`;
    setSaving(true);
    try {
      // Save metadata to Firestore
      const docRef = await addDoc(collection(db, `users/${uid}/panoramas`), {
        name,
        shots: capture.capturedSet.size,
        createdAt: serverTimestamp(),
      });
      // Save image blob to IndexedDB as dataUrl
      const dataUrl = await blobToDataUrl(capture.panoBlob);
      await idbSave(docRef.id, dataUrl);

      await loadPanoramas();
      capture.reset();
      setPanoName('');
      setActiveTab('gallery');
    } catch (e) {
      console.error(e);
      alert('Save failed: ' + e.message);
    }
    setSaving(false);
  };

  /* Delete panorama */
  const deletePanorama = async (pano) => {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/panoramas`, pano.id));
      await idbDelete(pano.id).catch(() => {});
      setPanoramas(prev => prev.filter(p => p.id !== pano.id));
      if (viewingPano?.id === pano.id) { setViewingPano(null); setActiveTab('gallery'); }
    } catch (e) { console.error(e); }
  };

  /* Rename */
  const renamePanorama = async (id, name) => {
    await updateDoc(doc(db, `users/${uid}/panoramas`, id), { name });
    setPanoramas(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  };

  /* Upload existing image */
  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    const name = panoName.trim() || file.name.replace(/\.[^.]+$/, '');
    setSaving(true);
    try {
      const docRef  = await addDoc(collection(db, `users/${uid}/panoramas`), {
        name, shots: 0, createdAt: serverTimestamp(),
      });
      const dataUrl = await blobToDataUrl(file);
      await idbSave(docRef.id, dataUrl);
      await loadPanoramas();
    } catch (e) { console.error(e); alert('Upload failed.'); }
    setSaving(false);
    e.target.value = '';
  };

  /* Download */
  const downloadPano = () => {
    if (!capture.panoUrl) return;
    const a = document.createElement('a');
    a.href = capture.panoUrl;
    a.download = `panorama-${Date.now()}.jpg`;
    a.click();
  };

  /* View */
  const viewPanorama = (pano) => { setViewingPano(pano); setActiveTab('viewer'); };

  if (authLoading) return (
    <div className={styles.loaderScreen}><div className={styles.loaderRing} /><p>Loading…</p></div>
  );

  const shotsDone = capture.capturedSet.size;
  const currentS  = SHOTS[capture.currentShot] || SHOTS[0];

  const TABS = [
    { id: 'gallery', label: '🖼 Gallery' },
    { id: 'capture', label: '📷 Capture' },
    ...(viewingPano ? [{ id: 'viewer', label: `🔭 ${viewingPano.name}` }] : []),
  ];

  return (
    <div className={styles.page} data-theme={isDark ? 'dark' : ''}>

      {/* TOP BAR */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Dashboard</button>
        <div className={styles.brand}><div className={styles.brandIcon}>🌐</div><span>360 Panorama</span></div>
        <div className={styles.topBarRight}>
          <label className={styles.uploadExistingBtn}>
            ⬆ Upload
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadFile} />
          </label>
          <span className={styles.panoCount}>{panoramas.length} saved</span>
          <button className={styles.themeBtn} onClick={() => setIsDark(d => !d)}>{isDark ? '☀️' : '🌙'}</button>
        </div>
      </div>

      {saving && (
        <div className={styles.uploadBar}>
          <div className={styles.uploadFill} style={{ width: '60%' }} />
          <span className={styles.uploadLabel}>Saving to device…</span>
        </div>
      )}

      {/* TABS */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id}
            className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}
          </button>
        ))}
      </div>

      {/* ══ GALLERY ══ */}
      {activeTab === 'gallery' && (
        <div className={styles.content}>
          {loadingPanos ? (
            <div className={styles.centeredLoader}><div className={styles.loaderRing} /><p>Loading…</p></div>
          ) : panoramas.length === 0 ? (
            <div className={styles.emptyGallery}>
              <div className={styles.emptyIcon}>🌐</div>
              <div className={styles.emptyTitle}>No panoramas yet</div>
              <p className={styles.emptySub}>Capture your first 360° panorama or upload an existing equirectangular image. All data is saved locally on your device — no cloud storage needed.</p>
              <div className={styles.emptyActions}>
                <button className={styles.primaryBtn} onClick={() => setActiveTab('capture')}>📷 Capture</button>
                <label className={styles.outlineBtn}>⬆ Upload<input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadFile} /></label>
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

      {/* ══ CAPTURE ══ */}
      {activeTab === 'capture' && (
        <div className={styles.content}>
          <div className={styles.captureWrap}>

            {/* IDLE */}
            {capture.step === 'idle' && (
              <div className={styles.captureIdle}>
                <div className={styles.captureIdleIcon}>🌐</div>
                <h2 className={styles.captureIdleTitle}>360° Panorama Capture</h2>
                <p className={styles.captureIdleSub}>
                  Guided capture — we show you exactly where to point your camera. Take <strong>{TOTAL_SHOTS} shots</strong> across 3 levels (sky, horizon, ground).
                </p>
                <div className={styles.captureSteps}>
                  {[
                    { icon: '📷', text: 'Allow camera access' },
                    { icon: '🧭', text: 'Follow direction arrows' },
                    { icon: '🔵', text: 'Tap shutter when aligned' },
                    { icon: '✅', text: 'Panorama stitches automatically' },
                  ].map((s, i) => (
                    <div key={i} className={styles.captureStep}>
                      <div className={styles.captureStepIcon}>{s.icon}</div>
                      <div className={styles.captureStepText}>{s.text}</div>
                    </div>
                  ))}
                </div>
                {capture.camError && <div className={styles.camError}>{capture.camError}</div>}
                <button className={styles.primaryBtn} style={{ marginTop: 24 }} onClick={capture.startCamera}>
                  📷 Start Camera
                </button>
              </div>
            )}

            {/* GUIDE — camera on, not yet capturing */}
            {capture.step === 'guide' && (
              <div className={styles.captureGuide}>
                <div className={styles.videoWrap}>
                  <video ref={capture.videoRef} className={styles.captureVideo} playsInline muted autoPlay />
                  <div className={styles.videoOverlay}>
                    <div className={styles.captureReticle} />
                    <div className={styles.captureGuideText}>Camera ready — Press Start Capture</div>
                  </div>
                </div>
                <div className={styles.captureGuideActions}>
                  <button className={styles.primaryBtn} onClick={capture.startCapturing}>
                    ● Start Guided Capture ({TOTAL_SHOTS} shots)
                  </button>
                  <button className={styles.outlineBtn} onClick={capture.reset}>Cancel</button>
                </div>
              </div>
            )}

            {/* CAPTURING — guided shots */}
            {capture.step === 'capturing' && (
              <div className={styles.capturingWrap}>
                {/* Live camera feed */}
                <div className={styles.videoWrap}>
                  <video ref={capture.videoRef} className={styles.captureVideo} playsInline muted autoPlay />
                  <div className={styles.videoOverlay}>
                    <div className={`${styles.captureReticle} ${capture.aligned ? styles.captureReticleAligned : ''}`} />
                    {/* Shot counter */}
                    <div className={styles.shotCounter}>{shotsDone}/{TOTAL_SHOTS}</div>
                    {/* Level indicator */}
                    <div className={styles.levelIndicator}>
                      <span>{currentS.icon}</span>
                      <span>{currentS.label}</span>
                    </div>
                    {/* Alignment tick */}
                    {capture.aligned && <div className={styles.alignedTick}>✓ Aligned — Tap to capture!</div>}
                  </div>
                  {/* Shutter button on video */}
                  <button
                    className={`${styles.shutterBtn} ${capture.aligned ? styles.shutterBtnReady : ''}`}
                    onClick={capture.takeShot}
                  >
                    <div className={styles.shutterInner} />
                  </button>
                </div>

                {/* Direction guide panel */}
                <DirectionGuide
                  currentShot={capture.currentShot}
                  capturedSet={capture.capturedSet}
                  deviceYaw={capture.deviceYaw}
                  devicePitch={capture.devicePitch}
                />

                {/* Frame strip */}
                {capture.frames.length > 0 && (
                  <div className={styles.frameStrip}>
                    {capture.frames.slice(-10).map((f, i) => (
                      <img key={i} src={f.url} className={styles.frameThumb} alt="" />
                    ))}
                  </div>
                )}

                {/* Progress bar */}
                <div className={styles.captureProgressBar}>
                  <div className={styles.captureProgressFill} style={{ width: `${capture.progress}%` }} />
                </div>
                <div className={styles.captureProgressLabel}>
                  {shotsDone} / {TOTAL_SHOTS} shots captured
                </div>

                <button className={`${styles.outlineBtn} ${styles.cancelCaptureBtn}`} onClick={capture.reset}>
                  ✕ Cancel
                </button>
              </div>
            )}

            {/* STITCHING */}
            {capture.step === 'stitching' && (
              <div className={styles.stitchingWrap}>
                <div className={styles.stitchingIcon}>🧵</div>
                <div className={styles.stitchingTitle}>Stitching panorama…</div>
                <p className={styles.stitchingSub}>Assembling {shotsDone} frames into a 360° equirectangular image. This may take a few seconds.</p>
                <div className={styles.stitchingBar}><div className={styles.stitchingFill} /></div>
              </div>
            )}

            {/* DONE */}
            {capture.step === 'done' && capture.panoUrl && (
              <div className={styles.doneWrap}>
                <div className={styles.doneHeader}>
                  <div className={styles.doneBadge}>✅ Panorama Ready</div>
                  <h2 className={styles.doneTitle}>Your 360° panorama is ready!</h2>
                  <p className={styles.doneSub}>{capture.capturedSet.size} frames captured · Tap and drag to explore</p>
                </div>
                <div className={styles.doneViewer}>
                  <PanoViewer imageUrl={capture.panoUrl} />
                </div>
                <div className={styles.doneActions}>
                  <input className={styles.nameInput} value={panoName} onChange={e => setPanoName(e.target.value)} placeholder="Name your panorama (optional)…" />
                  <div className={styles.doneButtons}>
                    <button className={styles.primaryBtn} onClick={savePanorama} disabled={saving}>
                      {saving ? 'Saving…' : '💾 Save to Gallery'}
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

      {/* ══ VIEWER ══ */}
      {activeTab === 'viewer' && viewingPano && (
        <div className={styles.viewerPage}>
          <div className={styles.viewerPageHeader}>
            <div className={styles.viewerPageTitle}>🔭 {viewingPano.name}</div>
            <button className={styles.outlineBtn} onClick={() => { setActiveTab('gallery'); setViewingPano(null); }}>
              ← Gallery
            </button>
          </div>
          <PanoViewer imageUrl={viewingPano.url} onClose={() => { setActiveTab('gallery'); setViewingPano(null); }} />
        </div>
      )}

    </div>
  );
}
