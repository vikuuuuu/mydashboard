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

/* ════════════════════════════════════════
   IndexedDB helpers
════════════════════════════════════════ */
const IDB_NAME = 'pano360_v6', IDB_STORE = 'panos', IDB_VER = 1;

function openIDB() {
  return new Promise((res, rej) => {
    if (typeof window === 'undefined') return rej(new Error('SSR'));
    const r = indexedDB.open(IDB_NAME, IDB_VER);
    r.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains(IDB_STORE))
        e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror   = e => rej(e.target.error);
  });
}
async function idbSave(id, dataUrl) {
  const idb = await openIDB();
  await new Promise((res, rej) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ id, dataUrl, ts: Date.now() });
    tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
  });
  try {
    const idb2 = await openIDB();
    const all  = await new Promise(r => {
      const tx  = idb2.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = e => r(e.target.result || []); req.onerror = () => r([]);
    });
    if (all.length > 10) {
      const toRm = all.sort((a, b) => a.ts - b.ts).slice(0, all.length - 10);
      const idb3 = await openIDB();
      for (const x of toRm) await new Promise(r => {
        const tx = idb3.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(x.id);
        tx.oncomplete = r; tx.onerror = r;
      });
    }
  } catch { /* silent */ }
}
async function idbGet(id) {
  const idb = await openIDB();
  return new Promise((res, rej) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = e => res(e.target.result?.dataUrl || null);
    req.onerror   = e => rej(e.target.error);
  });
}
async function idbDel(id) {
  const idb = await openIDB();
  return new Promise(res => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = res; tx.onerror = res;
  });
}
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(new Error('FileReader error'));
    r.readAsDataURL(blob);
  });
}

/* ════════════════════════════════════════
   PHOTO SPHERE SHOT PLAN
   7 latitude levels → 30 shots total
   Geodesic distribution for full sphere coverage
════════════════════════════════════════ */
const SHOT_LEVELS = [
  { pitch:  75, count: 1, label: 'Zenith',     icon: '🔝', hfov: 80, vfov: 40 },
  { pitch:  55, count: 4, label: 'Upper Sky',  icon: '⬆️',  hfov: 65, vfov: 40 },
  { pitch:  30, count: 6, label: 'Sky',        icon: '↗️',  hfov: 55, vfov: 38 },
  { pitch:   0, count: 8, label: 'Horizon',    icon: '➡️',  hfov: 52, vfov: 36 },
  { pitch: -30, count: 6, label: 'Low',        icon: '↘️',  hfov: 55, vfov: 38 },
  { pitch: -55, count: 4, label: 'Ground',     icon: '⬇️',  hfov: 65, vfov: 40 },
  { pitch: -75, count: 1, label: 'Nadir',      icon: '🔻', hfov: 80, vfov: 40 },
];

const SHOTS = [];
SHOT_LEVELS.forEach(lev => {
  for (let i = 0; i < lev.count; i++) {
    const yaw = lev.count > 1 ? Math.round(i * 360 / lev.count) : 0;
    SHOTS.push({
      idx:   SHOTS.length,
      yaw,
      pitch: lev.pitch,
      label: lev.label,
      icon:  lev.icon,
      hfov:  lev.hfov,
      vfov:  lev.vfov,
    });
  }
});
const TOTAL = SHOTS.length; // 30

// Equirectangular output — 2:1 ratio required
const PANO_W = 4096;
const PANO_H = 2048;

// Alignment thresholds (degrees)
const YAW_TOL   = 18; // tighter than before
const PITCH_TOL = 15;

/* ════════════════════════════════════════
   BLUR DETECTION
   Variance of Laplacian on a 160×120 downsample.
   Score < BLUR_THRESH → reject frame.
════════════════════════════════════════ */
const BLUR_THRESH = 80; // tuned empirically; lower = stricter

function computeBlurScore(videoEl) {
  const W = 160, H = 120;
  const cv  = document.createElement('canvas');
  cv.width  = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoEl, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  // Convert to greyscale
  const grey = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++)
    grey[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];

  // Laplacian kernel [0,1,0,1,-4,1,0,1,0]
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const lap =
        grey[(y-1)*W+x] + grey[(y+1)*W+x] +
        grey[y*W+x-1]   + grey[y*W+x+1]   -
        4 * grey[y*W+x];
      sum  += lap;
      sum2 += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  const variance = sum2 / n - mean * mean;
  return variance; // higher = sharper
}

/* ════════════════════════════════════════
   EQUIRECTANGULAR STITCHER
   Fix for xMax/xMin wrap bug:
   Compute pixel coords in continuous space,
   handle seam wrap AFTER computing dstW.
════════════════════════════════════════ */
async function stitchEquirectangular(frames, onProgress) {
  const cv  = document.createElement('canvas');
  cv.width  = PANO_W;
  cv.height = PANO_H;
  const ctx = cv.getContext('2d', { alpha: false });
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, PANO_W, PANO_H);

  // Load all images in parallel
  const loaded = await Promise.all(
    frames.map(f => new Promise(res => {
      const im = new window.Image();
      im.onload  = () => res({ im, ...f });
      im.onerror = () => { console.warn('Frame load failed', f.idx); res(null); };
      im.src = f.url;
    }))
  );

  let done = 0;
  for (const entry of loaded) {
    if (!entry) { done++; onProgress?.(Math.round(done / loaded.length * 100)); continue; }
    const { im, yaw, pitch, hfov, vfov } = entry;

    // Equirectangular mapping:
    // lon ∈ [0,360), lat ∈ (-90,90)
    // px = (lon/360)*W, py = (0.5 - lat/180)*H
    const lonC = yaw;
    const latC = pitch;

    const lonMin = lonC - hfov / 2;
    const lonMax = lonC + hfov / 2;
    const latMax = latC + vfov / 2;
    const latMin = latC - vfov / 2;

    // Y is simple — no wrap
    const yPx = (0.5 - latMax / 180) * PANO_H;
    const hPx = (latMax - latMin) / 180 * PANO_H;
    if (hPx <= 0) { done++; continue; }

    // X — handle 360° seam
    const xStart = ((lonMin % 360) + 360) % 360 / 360 * PANO_W;
    const wPx    = hfov / 360 * PANO_W;

    if (xStart + wPx <= PANO_W) {
      // No wrap
      ctx.drawImage(im, xStart, yPx, wPx, hPx);
    } else {
      // Wrap: draw in two strips
      const w1 = PANO_W - xStart;
      const w2 = wPx - w1;
      const srcW = im.naturalWidth || im.width;
      const frac = w1 / wPx; // fraction covered by left strip
      ctx.drawImage(im, 0, 0, Math.round(srcW * frac), im.naturalHeight || im.height,
                        xStart, yPx, w1, hPx);
      ctx.drawImage(im, Math.round(srcW * frac), 0, Math.round(srcW * (1 - frac)), im.naturalHeight || im.height,
                        0, yPx, w2, hPx);
    }

    done++;
    onProgress?.(Math.round(done / loaded.length * 100));
    await new Promise(r => setTimeout(r, 0));
  }

  return new Promise(res => cv.toBlob(b => res(b), 'image/jpeg', 0.95));
}

/* ════════════════════════════════════════
   WEBGL 360 EQUIRECTANGULAR VIEWER
════════════════════════════════════════ */
function use360(canvasRef, src, active) {
  const S = useRef({ yaw:0, pitch:0, fov:75, drag:false, lx:0, ly:0, vx:0, vy:0, auto:false, gyro:false, _gh:null });
  const tdRef = useRef({ d: 0 });

  useEffect(() => {
    if (!active || !canvasRef.current || !src) return;
    const cv = canvasRef.current;
    const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!gl) return;

    const mkShader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const pg = gl.createProgram();
    gl.attachShader(pg, mkShader(gl.VERTEX_SHADER,
      `attribute vec2 p;varying vec2 u;
       void main(){u=p*.5+.5;gl_Position=vec4(p,0.,1.);}`));
    gl.attachShader(pg, mkShader(gl.FRAGMENT_SHADER,
      `precision highp float;
       uniform sampler2D t;uniform float Y,P,F;uniform vec2 R;varying vec2 u;
       const float PI=3.14159265358979;
       void main(){
         vec2 n=(u*2.-1.)*vec2(R.x/R.y,1.);
         float f=1./tan(F*.5*PI/180.);
         vec3 r=normalize(vec3(n,f));
         float cy=cos(Y),sy=sin(Y),cp=cos(P),sp=sin(P);
         vec3 q;
         q.x=cy*r.x+sy*r.z; q.z=-sy*r.x+cy*r.z;
         q.y=sp*q.z+cp*r.y; q.z=cp*q.z-sp*r.y;
         float lo=atan(q.x,q.z);
         float la=asin(clamp(q.y/length(q),-1.,1.));
         gl_FragColor=texture2D(t,vec2(lo/(2.*PI)+.5,la/PI+.5));
       }`));
    gl.linkProgram(pg);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(pg, 'p');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([10,10,25,255]));

    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    };
    img.src = src;

    const ul = n => gl.getUniformLocation(pg, n);
    let aid;
    const loop = () => {
      const s = S.current;
      const W = cv.clientWidth||800, H = cv.clientHeight||450;
      if (cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
      gl.viewport(0,0,W,H);
      if (s.auto&&!s.gyro) s.yaw+=.003;
      if (!s.drag){s.vx*=.92;s.vy*=.92;s.yaw+=s.vx;s.pitch+=s.vy;}
      s.pitch=Math.max(-1.45,Math.min(1.45,s.pitch));
      gl.useProgram(pg);
      gl.uniform1i(ul('t'),0); gl.uniform1f(ul('Y'),s.yaw);
      gl.uniform1f(ul('P'),s.pitch); gl.uniform1f(ul('F'),s.fov);
      gl.uniform2f(ul('R'),W,H);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      aid=requestAnimationFrame(loop);
    };
    aid=requestAnimationFrame(loop);
    return ()=>{cancelAnimationFrame(aid);try{gl.deleteProgram(pg);gl.deleteTexture(tex);gl.deleteBuffer(buf);}catch{/**/}};
  },[active,src]); // eslint-disable-line

  const onMD=useCallback(e=>{const s=S.current;s.drag=true;s.lx=e.clientX;s.ly=e.clientY;s.vx=s.vy=0;},[]);
  const onMM=useCallback(e=>{const s=S.current;if(!s.drag)return;const dx=e.clientX-s.lx,dy=e.clientY-s.ly;s.vx=dx*.003;s.vy=dy*.003;s.yaw-=dx*.005;s.pitch-=dy*.005;s.lx=e.clientX;s.ly=e.clientY;},[]);
  const onMU=useCallback(()=>{S.current.drag=false;},[]);
  const onW =useCallback(e=>{e.preventDefault();S.current.fov=Math.max(20,Math.min(110,S.current.fov+e.deltaY*.05));},[]);
  const onTS=useCallback(e=>{const s=S.current;if(e.touches.length===1){s.drag=true;s.lx=e.touches[0].clientX;s.ly=e.touches[0].clientY;}if(e.touches.length===2)tdRef.current.d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);},[]);
  const onTM=useCallback(e=>{e.preventDefault();const s=S.current;if(e.touches.length===1&&s.drag){const dx=e.touches[0].clientX-s.lx,dy=e.touches[0].clientY-s.ly;s.vx=dx*.003;s.vy=dy*.003;s.yaw-=dx*.005;s.pitch-=dy*.005;s.lx=e.touches[0].clientX;s.ly=e.touches[0].clientY;}if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);s.fov=Math.max(20,Math.min(110,s.fov-(d-tdRef.current.d)*.15));tdRef.current.d=d;}},[]);
  const onTE=useCallback(()=>{S.current.drag=false;},[]);
  const toggleAuto=useCallback(()=>{S.current.auto=!S.current.auto;return S.current.auto;},[]);
  const resetView=useCallback(()=>{Object.assign(S.current,{yaw:0,pitch:0,fov:75,vx:0,vy:0});},[]);
  const enableGyro=useCallback(async()=>{
    if(typeof DeviceOrientationEvent==='undefined')return false;
    try{if(typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')return false;}}catch{return false;}
    const h=e=>{if(!S.current.gyro)return;S.current.yaw=-(e.alpha||0)*Math.PI/180;S.current.pitch=(e.beta||0)*Math.PI/180*.5;};
    window.addEventListener('deviceorientation',h,true);S.current.gyro=true;S.current._gh=h;return true;
  },[]);
  const disableGyro=useCallback(()=>{if(S.current._gh)window.removeEventListener('deviceorientation',S.current._gh,true);S.current.gyro=false;S.current._gh=null;},[]);

  return{onMD,onMM,onMU,onW,onTS,onTM,onTE,toggleAuto,resetView,enableGyro,disableGyro,S};
}

/* ════════════════════════════════════════
   SENSOR HOOK
   Runs sensor in a ref — no state lag.
   Provides: yaw, pitch, roll (degrees)
   stability: rolling window of motion magnitude
════════════════════════════════════════ */
function useSensor() {
  const sensorRef = useRef({ yaw: 0, pitch: 0, roll: 0, stable: false });
  const histRef   = useRef([]); // rolling motion history
  const cleanupRef= useRef(null);

  const start = useCallback(async () => {
    let handler;
    const attach = () => {
      let prevAlpha = null, prevBeta = null;
      handler = e => {
        const alpha = (e.alpha || 0);
        const beta  = (e.beta  || 0);
        const gamma = (e.gamma || 0);

        // Compass yaw: alpha (0–360), 0 = North
        const yaw   = alpha;
        const pitch = beta;   // -180..180, 0 = flat face-up, 90 = upright
        const roll  = gamma;  // -90..90

        sensorRef.current.yaw   = yaw;
        sensorRef.current.pitch = pitch;
        sensorRef.current.roll  = roll;

        // Stability: track angular delta over last 300ms
        if (prevAlpha !== null) {
          const dA = Math.abs(((alpha - prevAlpha + 540) % 360) - 180);
          const dB = Math.abs(beta - prevBeta);
          const mag = Math.sqrt(dA*dA + dB*dB);
          histRef.current.push({ mag, ts: Date.now() });
          // Keep only last 350ms
          const cutoff = Date.now() - 350;
          histRef.current = histRef.current.filter(x => x.ts > cutoff);
          const maxMag = Math.max(...histRef.current.map(x => x.mag), 0);
          sensorRef.current.stable = maxMag < 1.2; // degrees/frame threshold
        }
        prevAlpha = alpha; prevBeta = beta;
      };
      window.addEventListener('deviceorientation', handler, true);
    };

    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') attach();
      } catch { /* denied */ }
    } else {
      attach();
    }

    cleanupRef.current = () => {
      if (handler) window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  const stop = useCallback(() => { cleanupRef.current?.(); }, []);

  return { sensorRef, start, stop };
}

/* ════════════════════════════════════════
   MAIN CAPTURE HOOK
   Auto-capture when: aligned + stable + not blurry
════════════════════════════════════════ */
function useCapture() {
  const vidRef      = useRef(null);
  const streamRef   = useRef(null);
  const framesRef   = useRef([]);
  const capturedSet = useRef(new Set()); // prevent duplicate shots
  const autoTimerRef= useRef(null);
  const { sensorRef, start: startSensor, stop: stopSensor } = useSensor();

  const [step,       setStep]       = useState('idle');
  const [shotIdx,    setShotIdx]    = useState(0);
  const [doneSet,    setDoneSet]    = useState(new Set());
  const [panoBlob,   setPanoBlob]   = useState(null);
  const [panoUrl,    setPanoUrl]    = useState(null);
  const [err,        setErr]        = useState('');
  const [thumbs,     setThumbs]     = useState([]);
  const [stitchProg, setStitchProg] = useState(0);
  const [camRes,     setCamRes]     = useState({ w: 1280, h: 720 });

  // Real-time UI state (updated via rAF, not per sensor event)
  const [sensorUi, setSensorUi]  = useState({ yaw:0, pitch:0, roll:0, stable:false });
  const [captureStatus, setCaptureStatus] = useState(''); // 'aligning'|'steady'|'capturing'|'blur'|''
  const uiRafRef = useRef(null);

  // Drive UI state from sensor ref at 30fps (not 60 — plenty for display)
  useEffect(() => {
    if (step !== 'capturing') { cancelAnimationFrame(uiRafRef.current); return; }
    let last = 0;
    const tick = ts => {
      if (ts - last > 33) { // ~30fps
        last = ts;
        const s = sensorRef.current;
        setSensorUi({ yaw: s.yaw, pitch: s.pitch, roll: s.roll, stable: s.stable });
      }
      uiRafRef.current = requestAnimationFrame(tick);
    };
    uiRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(uiRafRef.current);
  }, [step, sensorRef]);

  /* ── Start camera ── */
  const startCam = useCallback(async () => {
    setErr(''); setStep('camStarting');
    if (!navigator?.mediaDevices?.getUserMedia) {
      setErr('Camera not supported. Use Chrome/Safari on a real device.');
      setStep('idle'); return;
    }
    try {
      let stream;
      const tries = [
        { video: { facingMode:{ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080} }, audio:false },
        { video: { facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} },  audio:false },
        { video: { width:{ideal:1280}, height:{ideal:720} }, audio:false },
        { video: true, audio:false },
      ];
      for (const c of tries) { try { stream=await navigator.mediaDevices.getUserMedia(c); break; } catch{/**/} }
      if (!stream) throw new Error('No camera available');

      streamRef.current = stream;
      const v = vidRef.current;
      if (!v) { stream.getTracks().forEach(t=>t.stop()); setErr('Video element not ready.'); setStep('idle'); return; }

      v.srcObject=stream; v.muted=true; v.playsInline=true;
      await new Promise(res=>{
        if(v.readyState>=2){res();return;}
        v.onloadedmetadata=res; v.onerror=res; setTimeout(res,6000);
      });
      try { await v.play(); } catch{/**/}

      const track = stream.getVideoTracks()[0];
      const s2    = track?.getSettings?.() || {};
      setCamRes({ w: s2.width||v.videoWidth||1280, h: s2.height||v.videoHeight||720 });

      await startSensor();
      setStep('guide');
    } catch(e) {
      const msg = e.name==='NotAllowedError' ? 'Camera permission denied.' :
                  e.name==='NotFoundError'   ? 'No camera found.'          :
                  `Camera error: ${e.message}`;
      setErr(msg); setStep('idle');
    }
  }, [startSensor]);

  /* ── Take one shot — with blur check ── */
  const shotIdxRef = useRef(0); // shadow state for use inside callbacks
  useEffect(() => { shotIdxRef.current = shotIdx; }, [shotIdx]);

  const captureFrame = useCallback((shot) => {
    const v = vidRef.current;
    if (!v || v.readyState < 2) return;
    if (capturedSet.current.has(shot.idx)) return; // deduplicate

    // Blur check
    let blurScore = 999;
    try { blurScore = computeBlurScore(v); } catch{/**/}
    if (blurScore < BLUR_THRESH) {
      setCaptureStatus('blur');
      setTimeout(() => setCaptureStatus('aligning'), 800);
      return;
    }

    setCaptureStatus('capturing');
    capturedSet.current.add(shot.idx);

    requestAnimationFrame(() => {
      const vW = v.videoWidth  || camRes.w;
      const vH = v.videoHeight || camRes.h;
      const cv = document.createElement('canvas');
      cv.width=vW; cv.height=vH;
      const ctx = cv.getContext('2d',{alpha:false});
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      try { ctx.drawImage(v,0,0,vW,vH); } catch(e){ setErr(`Capture: ${e.message}`); return; }

      // Thumbnail for strip
      const tCv=document.createElement('canvas'); tCv.width=160; tCv.height=90;
      tCv.getContext('2d').drawImage(cv,0,0,160,90);
      const thumbUrl=tCv.toDataURL('image/jpeg',0.7);

      cv.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        framesRef.current.push({ blob, url, idx:shot.idx, yaw:shot.yaw, pitch:shot.pitch, hfov:shot.hfov, vfov:shot.vfov });
        setThumbs(prev=>[...prev, thumbUrl]);
        setDoneSet(prev=>new Set([...prev, shot.idx]));

        const next = shotIdxRef.current + 1;
        if (next >= TOTAL) { setShotIdx(next); setStep('stitching'); }
        else { setShotIdx(next); setCaptureStatus(''); }
      }, 'image/png'); // lossless internal
    });
  }, [camRes]);

  /* ── Auto-capture loop ──
     Runs on every sensorRef update (via RAF).
     When aligned + stable → wait 400ms holding → capture.
  */
  const autoCapRef = useRef({ holdStart: null, lastShot: -1 });

  useEffect(() => {
    if (step !== 'capturing') { clearTimeout(autoTimerRef.current); return; }

    const tick = () => {
      if (step !== 'capturing') return;
      const s    = sensorRef.current;
      const si   = shotIdxRef.current;
      if (si >= TOTAL) return;

      const shot  = SHOTS[si];
      const yawD  = ((s.yaw - shot.yaw + 540) % 360) - 180;
      const pitchD = s.pitch - shot.pitch;
      const aligned= Math.abs(yawD) < YAW_TOL && Math.abs(pitchD) < PITCH_TOL;
      const ac     = autoCapRef.current;

      if (aligned && s.stable) {
        if (ac.holdStart === null) {
          ac.holdStart = Date.now();
          setCaptureStatus('steady');
        } else if (Date.now() - ac.holdStart > 400 && ac.lastShot !== si) {
          ac.lastShot  = si;
          ac.holdStart = null;
          captureFrame(shot);
        }
      } else {
        if (ac.holdStart !== null) { ac.holdStart = null; setCaptureStatus('aligning'); }
        else if (captureStatus !== 'aligning' && captureStatus !== 'blur' && captureStatus !== 'capturing') {
          setCaptureStatus('aligning');
        }
      }
      autoTimerRef.current = setTimeout(tick, 50); // 20 checks/sec
    };
    autoTimerRef.current = setTimeout(tick, 100);
    return () => clearTimeout(autoTimerRef.current);
  }, [step, sensorRef, captureFrame, captureStatus]);

  /* ── Manual capture (tap shutter) ── */
  const manualCapture = useCallback(() => {
    const si   = shotIdxRef.current;
    if (si >= TOTAL || step !== 'capturing') return;
    captureFrame(SHOTS[si]);
  }, [step, captureFrame]);

  const startCapturing = useCallback(() => {
    setShotIdx(0); setDoneSet(new Set()); framesRef.current=[];
    capturedSet.current.clear(); setCaptureStatus('aligning');
    autoCapRef.current = { holdStart:null, lastShot:-1 };
    setStep('capturing');
  }, []);

  /* ── Stitch ── */
  useEffect(() => {
    if (step !== 'stitching') return;
    const run = async () => {
      try {
        setStitchProg(0);
        const blob = await stitchEquirectangular(framesRef.current, pct=>setStitchProg(pct));
        if (!blob) { setStep('idle'); return; }
        setPanoBlob(blob);
        setPanoUrl(URL.createObjectURL(blob));
        setStep('done');
        streamRef.current?.getTracks().forEach(t=>t.stop());
        stopSensor();
      } catch(e) { console.error(e); setErr(`Stitch failed: ${e.message}`); setStep('done'); }
    };
    run();
  }, [step, stopSensor]); // eslint-disable-line

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current=null;
    if (vidRef.current) vidRef.current.srcObject=null;
    stopSensor();
  }, [stopSensor]);

  const reset = useCallback(() => {
    clearTimeout(autoTimerRef.current);
    stopCam();
    framesRef.current.forEach(f=>{ try{URL.revokeObjectURL(f.url);}catch{/**/} });
    framesRef.current=[];
    if (panoUrl) try{URL.revokeObjectURL(panoUrl);}catch{/**/}
    capturedSet.current.clear();
    setStep('idle'); setShotIdx(0); setDoneSet(new Set()); setPanoBlob(null); setPanoUrl(null);
    setErr(''); setThumbs([]); setStitchProg(0); setCaptureStatus('');
  }, [stopCam, panoUrl]);

  const progress = TOTAL > 0 ? Math.round(doneSet.size / TOTAL * 100) : 0;

  return {
    vidRef, step, shotIdx, doneSet, sensorUi, captureStatus,
    panoBlob, panoUrl, err, thumbs, progress, stitchProg, camRes,
    startCam, startCapturing, manualCapture, reset, framesRef,
  };
}

/* ════════════════════════════════════════
   CAPTURE GUIDE — Google Street View style
════════════════════════════════════════ */
function CaptureGuide({ shotIdx, doneSet, sensorUi, captureStatus }) {
  const si    = Math.min(shotIdx, TOTAL - 1);
  const shot  = SHOTS[si];
  const s     = sensorUi;

  const yawD   = ((s.yaw - shot.yaw + 540) % 360) - 180;
  const pitchD = s.pitch - shot.pitch;
  const aligned= Math.abs(yawD) < YAW_TOL && Math.abs(pitchD) < PITCH_TOL;
  const stable = s.stable;

  // Direction hints
  const dirY = yawD >  YAW_TOL   ? 'Turn Left ←'   : yawD  < -YAW_TOL   ? 'Turn Right →'  : '';
  const dirP = pitchD > PITCH_TOL ? 'Tilt Down ↓'   : pitchD < -PITCH_TOL ? 'Tilt Up ↑'    : '';

  // Status message
  const statusMsg =
    captureStatus === 'capturing' ? 'Capturing…' :
    captureStatus === 'blur'      ? 'Blurry — hold steady' :
    captureStatus === 'steady'    ? 'Hold steady…' :
    !aligned ? [dirY, dirP].filter(Boolean).join(' · ') || 'Rotate to next position' :
    !stable  ? 'Hold device steady' :
    '✓ Perfect position';

  const statusColor =
    captureStatus === 'capturing' ? '#3a86ff' :
    captureStatus === 'blur'      ? '#e63946' :
    captureStatus === 'steady'    ? '#f77f00' :
    aligned && stable             ? '#0f9d6e' :
    '#fff';

  // Level labels for top-view ring
  const levelGroups = SHOT_LEVELS.map(lev => ({
    ...lev,
    shots: SHOTS.filter(sh => sh.pitch === lev.pitch),
  }));

  // Progress ring
  const R = 36, C = 2 * Math.PI * R;
  const pct = doneSet.size / TOTAL;

  return (
    <div className={styles.guideWrap}>

      {/* Top: compass + progress */}
      <div className={styles.guideTop}>
        {/* Compass */}
        <div className={styles.guideCompass}>
          <div className={styles.gcDial} style={{ transform: `rotate(${-s.yaw}deg)` }}>
            <span className={styles.gcN}>N</span>
            <span className={styles.gcS}>S</span>
            <span className={styles.gcE}>E</span>
            <span className={styles.gcW}>W</span>
          </div>
          <div className={styles.gcDot} />
          <div className={styles.gcYaw}>{Math.round(s.yaw)}°</div>
        </div>

        {/* Progress ring */}
        <div className={styles.guideRingWrap}>
          <svg className={styles.guideRing} viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5"/>
            <circle cx="40" cy="40" r={R} fill="none" stroke="#3a86ff" strokeWidth="5"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
              strokeLinecap="round" transform="rotate(-90 40 40)"
              style={{transition:'stroke-dashoffset .4s ease'}}/>
            <text x="40" y="36" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="DM Mono,monospace">{doneSet.size}</text>
            <text x="40" y="50" textAnchor="middle" fill="rgba(255,255,255,.5)" fontSize="9" fontFamily="DM Mono,monospace">/{TOTAL}</text>
          </svg>
        </div>

        {/* Shot info */}
        <div className={styles.guideInfo}>
          <div className={styles.guideShot}>{shot.icon} {shot.label}</div>
          <div className={styles.guideAngle}>{shot.yaw}° · {shot.pitch>0?'+':''}{shot.pitch}°</div>
          <div className={styles.guidePitch}>
            pitch: <b>{Math.round(s.pitch)}°</b>
          </div>
        </div>
      </div>

      {/* Sphere top-view mini-map */}
      <div className={styles.miniMap}>
        {SHOTS.filter(sh => sh.pitch === 0).map(sh => {
          const a  = sh.yaw * Math.PI / 180;
          const cx = 50 + 40 * Math.sin(a);
          const cy = 50 - 40 * Math.cos(a);
          const isDone  = doneSet.has(sh.idx);
          const isNext  = sh.idx === si;
          return (
            <div key={sh.idx}
              className={`${styles.mmDot} ${isDone?styles.mmDone:''} ${isNext?styles.mmNext:''}`}
              style={{ left:`${cx}%`, top:`${cy}%` }}
            />
          );
        })}
        <div className={styles.mmCenter}>YOU</div>
      </div>

      {/* Horizontal level bar */}
      <div className={styles.levelBar}>
        <div className={styles.levelFill}
          style={{ transform: `translateX(${Math.max(-40,Math.min(40,-yawD * 0.8))}px)` }}
        />
        <div className={styles.levelCenter}/>
      </div>

      {/* Status */}
      <div className={styles.guideStatus} style={{ color: statusColor }}>
        {statusMsg}
      </div>

      {/* Direction arrows */}
      <div className={styles.guideArrows}>
        {dirP.includes('Up')   && <div className={styles.arrowUp}   >▲</div>}
        {dirP.includes('Down') && <div className={styles.arrowDown} >▼</div>}
        {dirY.includes('Left') && <div className={styles.arrowLeft} >◀</div>}
        {dirY.includes('Right')&& <div className={styles.arrowRight}>▶</div>}
      </div>

      {/* Level progress pills */}
      <div className={styles.levelPills}>
        {SHOT_LEVELS.map((lev, li) => {
          const shots = SHOTS.filter(sh => sh.pitch === lev.pitch);
          const done  = shots.filter(sh => doneSet.has(sh.idx)).length;
          const isAct = shot.pitch === lev.pitch;
          return (
            <div key={li} className={`${styles.lvlPill} ${isAct?styles.lvlPillOn:''} ${done===shots.length?styles.lvlPillDone:''}`}>
              {lev.icon} {done}/{shots.length}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   360 VIEWER COMPONENT
════════════════════════════════════════ */
function Viewer({ src, onClose }) {
  const cvRef = useRef(null);
  const wRef  = useRef(null);
  const [ar, setAr] = useState(false);
  const [gy, setGy] = useState(false);
  const [cmp,setCmp]= useState(0);

  const {onMD,onMM,onMU,onW,onTS,onTM,onTE,toggleAuto,resetView,enableGyro,disableGyro,S}
    = use360(cvRef, src, true);

  useEffect(()=>{const id=setInterval(()=>{if(S.current)setCmp((((S.current.yaw*180/Math.PI)%360)+360)%360);},100);return()=>clearInterval(id);},[S]);
  useEffect(()=>{const el=wRef.current;if(!el)return;el.addEventListener('wheel',onW,{passive:false});return()=>el.removeEventListener('wheel',onW);},[onW]);

  const doAuto=()=>{setAr(toggleAuto());};
  const doGyro=async()=>{if(gy){disableGyro();setGy(false);}else{const ok=await enableGyro();setGy(ok);if(!ok)alert('Gyroscope unavailable.');}};
  const doFS=()=>{if(!document.fullscreenElement)wRef.current?.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.().catch(()=>{});};

  return (
    <div className={styles.vWrap}>
      <div ref={wRef} className={styles.vCv}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}
        onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
        <canvas ref={cvRef} className={styles.glCv}/>
        <div className={styles.compass}>
          <div className={styles.cmpRing} style={{transform:`rotate(${-cmp}deg)`}}>
            <span className={styles.cN}>N</span><span className={styles.cS}>S</span>
            <span className={styles.cE}>E</span><span className={styles.cW}>W</span>
          </div>
          <div className={styles.cDot}/>
        </div>
        <div className={styles.vCtrl}>
          <button className={styles.vcb} onClick={resetView} title="Reset">⌖</button>
          <button className={`${styles.vcb}${ar?` ${styles.vcbOn}`:''}`} onClick={doAuto} title="Auto-rotate">↻</button>
          <button className={`${styles.vcb}${gy?` ${styles.vcbOn}`:''}`} onClick={doGyro} title="Gyroscope">📡</button>
          <button className={styles.vcb} onClick={doFS} title="Fullscreen">⛶</button>
          {onClose&&<button className={`${styles.vcb} ${styles.vcbX}`} onClick={onClose} title="Close">✕</button>}
        </div>
        <div className={styles.vHint}>Drag to look · Scroll/pinch to zoom</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   GALLERY CARD
════════════════════════════════════════ */
function Card({ p, onView, onDel, onRen }) {
  const [ed,setEd]=useState(false);
  const [nv,setNv]=useState(p.name);
  const [cf,setCf]=useState(false);
  const save=()=>{if(nv.trim())onRen(p.id,nv.trim());setEd(false);};
  return (
    <div className={styles.gc}>
      <div className={styles.gcThumb} onClick={()=>onView(p)}>
        {p.url?<img src={p.url} alt={p.name} className={styles.gcImg} loading="lazy"/>:<div className={styles.gcNone}>🌐</div>}
        <div className={styles.gcOvl}><span className={styles.gcViewLbl}>🔭 View 360°</span></div>
      </div>
      <div className={styles.gcBody}>
        {ed?(
          <div className={styles.rnRow}>
            <input className={styles.rnIn} value={nv} onChange={e=>setNv(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape')setEd(false);}} autoFocus/>
            <button className={styles.rnOk} onClick={save}>✓</button>
            <button className={styles.rnNo} onClick={()=>setEd(false)}>✕</button>
          </div>
        ):(
          <div className={styles.gcName} onDoubleClick={()=>setEd(true)} title="Double-click to rename">{p.name}</div>
        )}
        <div className={styles.gcMeta}>
          <span className={styles.gcDate}>{p.createdAt?.toDate?.().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})||'—'}</span>
          <span className={styles.gcBadge}>📱 Local</span>
        </div>
        <div className={styles.gcActs}>
          <button className={styles.gBtn} onClick={()=>onView(p)}>🔭 View</button>
          <button className={styles.gBtn} onClick={()=>setEd(true)}>✏️</button>
          {cf?(<><button className={styles.gBtnR} onClick={()=>onDel(p)}>Confirm</button><button className={styles.gBtn} onClick={()=>setCf(false)}>Cancel</button></>):(<button className={styles.gBtnR} onClick={()=>setCf(true)}>🗑</button>)}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════ */
export default function PanoramaPage() {
  const router = useRouter();
  const [uid,    setUid]    = useState(null);
  const [authOk, setAuthOk] = useState(false);
  const [dark,   setDark]   = useState(true);
  const [tab,    setTab]    = useState('gallery');
  const [panos,  setPanos]  = useState([]);
  const [loading,setLoading]= useState(false);
  const [viewing,setViewing]= useState(null);
  const [saving, setSaving] = useState(false);
  const [pName,  setPName]  = useState('');

  const cap = useCapture();

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,user=>{
      if(user){setUid(user.uid);setAuthOk(true);}else router.replace('/login');
    });
    return unsub;
  },[router]);

  const loadPanos=useCallback(async()=>{
    if(!uid)return; setLoading(true);
    try{
      const q=query(collection(db,`users/${uid}/panoramas`),orderBy('createdAt','desc'));
      const snap=await getDocs(q);
      const list=await Promise.all(snap.docs.map(async d=>{
        const data={id:d.id,...d.data()};
        const url=await idbGet(d.id).catch(()=>null);
        return{...data,url};
      }));
      setPanos(list);
    }catch(e){console.error(e);}
    setLoading(false);
  },[uid]);

  useEffect(()=>{if(uid)loadPanos();},[uid,loadPanos]);

  const savePano=async()=>{
    if(!cap.panoBlob||!uid)return;
    const name=pName.trim()||`PhotoSphere ${new Date().toLocaleDateString('en-IN')}`;
    setSaving(true);
    try{
      const ref=await addDoc(collection(db,`users/${uid}/panoramas`),{name,shots:cap.doneSet.size,createdAt:serverTimestamp()});
      const du=await blobToDataUrl(cap.panoBlob);
      await idbSave(ref.id,du);
      await loadPanos();
      cap.reset(); setPName(''); setTab('gallery');
    }catch(e){alert(`Save failed: ${e.message}`);}
    setSaving(false);
  };

  const delPano=async p=>{
    if(!uid)return;
    try{
      await deleteDoc(doc(db,`users/${uid}/panoramas`,p.id));
      await idbDel(p.id);
      setPanos(prev=>prev.filter(x=>x.id!==p.id));
      if(viewing?.id===p.id){setViewing(null);setTab('gallery');}
    }catch(e){console.error(e);}
  };

  const renPano=async(id,name)=>{
    try{
      await updateDoc(doc(db,`users/${uid}/panoramas`,id),{name});
      setPanos(prev=>prev.map(p=>p.id===id?{...p,name}:p));
    }catch(e){console.error(e);}
  };

  const uploadFile=async e=>{
    const f=e.target.files?.[0]; if(!f||!uid)return;
    setSaving(true);
    try{
      const name=f.name.replace(/\.[^.]+$/,'');
      const ref=await addDoc(collection(db,`users/${uid}/panoramas`),{name,shots:0,createdAt:serverTimestamp()});
      const du=await blobToDataUrl(f);
      await idbSave(ref.id,du);
      await loadPanos();
    }catch(e){alert('Upload failed.');console.error(e);}
    setSaving(false); e.target.value='';
  };

  // Download panorama (equirectangular)
  const downloadPano=()=>{
    if(!cap.panoUrl)return;
    const a=document.createElement('a');
    a.href=cap.panoUrl; a.download=`photosphere-${Date.now()}.jpg`; a.click();
  };

  // Download all individual frames as separate PNG files — no collage
  const downloadFrames=()=>{
    if(!cap.framesRef?.current?.length) return;
    cap.framesRef.current.forEach((f,i)=>{
      const a=document.createElement('a');
      a.href=f.url;
      a.download=`frame-${String(i+1).padStart(2,'0')}-yaw${f.yaw}-pitch${f.pitch}.png`;
      a.click();
    });
  };

  if(!authOk)return(<div className={styles.loaderScreen}><div className={styles.loaderRing}/><p>Loading…</p></div>);

  const camActive=cap.step==='guide'||cap.step==='capturing';
  const TABS=[
    {id:'gallery',lbl:'🖼 Gallery'},
    {id:'capture',lbl:'📷 Capture'},
    ...(viewing?[{id:'viewer',lbl:`🔭 ${viewing.name}`}]:[]),
  ];

  return (
    <div className={styles.page} data-theme={dark?'dark':''}>
      {/* TOP BAR */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={()=>router.push('/dashboard')}>← Dashboard</button>
        <div className={styles.brand}><div className={styles.brandIcon}>🌐</div><span>Photo Sphere</span></div>
        <div className={styles.topRight}>
          <label className={styles.upBtn}>⬆ Upload<input type="file" accept="image/*" style={{display:'none'}} onChange={uploadFile}/></label>
          <span className={styles.cnt}>{panos.length} saved</span>
          <button className={styles.themeBtn} onClick={()=>setDark(d=>!d)}>{dark?'☀️':'🌙'}</button>
        </div>
      </div>

      {saving&&<div className={styles.savBar}><div className={styles.savFill}/></div>}

      {/* TABS */}
      <div className={styles.tabs}>
        {TABS.map(t=>(
          <button key={t.id} className={`${styles.tab}${tab===t.id?` ${styles.tabOn}`:''}`} onClick={()=>setTab(t.id)}>{t.lbl}</button>
        ))}
      </div>

      {/* GALLERY */}
      {tab==='gallery'&&(
        <div className={styles.content}>
          {loading?(
            <div className={styles.cLoader}><div className={styles.loaderRing}/><p>Loading gallery…</p></div>
          ):panos.length===0?(
            <div className={styles.empty}>
              <div className={styles.emptyIco}>🌐</div>
              <div className={styles.emptyT}>No Photo Spheres yet</div>
              <p className={styles.emptySub}>Capture a 360° Photo Sphere or upload an equirectangular image.</p>
              <div className={styles.emptyActs}>
                <button className={styles.pri} onClick={()=>setTab('capture')}>📷 Capture Now</button>
                <label className={styles.sec}>⬆ Upload<input type="file" accept="image/*" style={{display:'none'}} onChange={uploadFile}/></label>
              </div>
            </div>
          ):(
            <div className={styles.grid}>
              {panos.map(p=>(
                <Card key={p.id} p={p}
                  onView={x=>{setViewing(x);setTab('viewer');}}
                  onDel={delPano} onRen={renPano}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CAPTURE */}
      {tab==='capture'&&(
        <div className={styles.capPage}>
          {/* Always-mounted video */}
          <div className={`${styles.vidBox}${camActive?` ${styles.vidBoxVisible}`:` ${styles.vidBoxHidden}`}`}>
            <video ref={cap.vidRef} className={styles.vid} playsInline muted autoPlay/>

            {/* Viewfinder overlay during capture */}
            {cap.step==='capturing'&&(
              <div className={styles.viewfinderOvl}>
                {/* Cross-hair target */}
                <div className={`${styles.crosshair}${cap.captureStatus==='steady'||cap.captureStatus==='capturing'?` ${styles.crosshairOk}`:''}`}>
                  <div className={styles.chTop}/>
                  <div className={styles.chRight}/>
                  <div className={styles.chBottom}/>
                  <div className={styles.chLeft}/>
                  {cap.captureStatus==='capturing'&&<div className={styles.chFlash}/>}
                </div>

                {/* Roll indicator */}
                <div className={styles.rollLine}
                  style={{transform:`rotate(${cap.sensorUi.roll}deg)`}}/>

                {/* HUD badges */}
                <div className={styles.hudTL}>
                  <span className={styles.hudBadge}>{cap.doneSet.size}/{TOTAL}</span>
                </div>
                <div className={styles.hudTR}>
                  <span className={styles.hudBadge} style={{background:'rgba(67,97,238,.7)'}}>
                    {Math.round(cap.sensorUi.yaw)}°
                  </span>
                </div>
              </div>
            )}

            {cap.step==='guide'&&(
              <div className={styles.vidOvl}>
                <div className={styles.reticle}/>
                <div className={styles.guideTxt}>Camera ready — tap Start Capture</div>
              </div>
            )}

            {/* Manual shutter — always visible during capturing */}
            {cap.step==='capturing'&&(
              <button className={`${styles.shutter}${cap.captureStatus==='steady'?` ${styles.shutterReady}`:''}`}
                onClick={cap.manualCapture} title="Manual capture">
                <div className={styles.shutterIn}/>
              </button>
            )}
          </div>

          {/* ── IDLE ── */}
          {cap.step==='idle'&&(
            <div className={styles.capWrap}>
              <div className={styles.capIdle}>
                <div className={styles.capIdleIco}>🌐</div>
                <h2 className={styles.capIdleT}>360° Photo Sphere</h2>
                <p className={styles.capIdleSub}>
                  <b>{TOTAL} guided shots</b> across 7 elevation levels.<br/>
                  Auto-captures when aligned and stable — like Google Street View.
                </p>
                <div className={styles.capSteps}>
                  {[
                    {i:'📷',t:'Point camera, follow guide'},
                    {i:'🧭',t:'Auto-detects position via gyro'},
                    {i:'✅',t:'Auto-captures when aligned'},
                    {i:'🌐',t:'Generates equirectangular 360°'},
                  ].map((s,i)=>(
                    <div key={i} className={styles.capStep}>
                      <span className={styles.capStepIco}>{s.i}</span>
                      <span className={styles.capStepT}>{s.t}</span>
                    </div>
                  ))}
                </div>
                {cap.err&&<div className={styles.camErr}>{cap.err}</div>}
                <button className={styles.pri} style={{marginTop:24}} onClick={cap.startCam}>
                  📷 Start Camera
                </button>
              </div>
            </div>
          )}

          {/* ── CAM STARTING ── */}
          {cap.step==='camStarting'&&(
            <div className={styles.capWrap}>
              <div className={styles.camStarting}>
                <div className={styles.loaderRing}/>
                <p>Starting camera…</p>
                <p className={styles.camStartSub}>Allow camera permission when prompted</p>
              </div>
            </div>
          )}

          {/* ── GUIDE ── */}
          {cap.step==='guide'&&(
            <div className={styles.capWrap}>
              <div className={styles.guideBtns}>
                <button className={styles.pri} onClick={cap.startCapturing}>
                  ● Start Photo Sphere ({TOTAL} shots)
                </button>
                <button className={styles.sec} onClick={cap.reset}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── CAPTURING ── */}
          {cap.step==='capturing'&&(
            <div className={styles.capturePanel}>
              <CaptureGuide
                shotIdx={cap.shotIdx}
                doneSet={cap.doneSet}
                sensorUi={cap.sensorUi}
                captureStatus={cap.captureStatus}
              />
              {cap.err&&<div className={styles.camErr}>{cap.err}</div>}
              {cap.thumbs.length>0&&(
                <div className={styles.strip}>
                  {cap.thumbs.slice(-16).map((u,i)=>(
                    <img key={i} src={u} className={styles.stripThumb} alt=""/>
                  ))}
                </div>
              )}
              <div className={styles.progBar}>
                <div className={styles.progFill} style={{width:`${cap.progress}%`}}/>
              </div>
              <button className={`${styles.sec} ${styles.cancelBtn}`} onClick={cap.reset}>✕ Cancel</button>
            </div>
          )}

          {/* ── STITCHING ── */}
          {cap.step==='stitching'&&(
            <div className={styles.capWrap}>
              <div className={styles.stitchBox}>
                <div className={styles.stitchIco}>🧵</div>
                <div className={styles.stitchT}>Building Photo Sphere…</div>
                <p className={styles.stitchSub}>Mapping {cap.doneSet.size} frames to equirectangular projection</p>
                <div className={styles.stitchBar}>
                  <div className={styles.stitchFillProg} style={{width:`${cap.stitchProg}%`}}/>
                </div>
                <div className={styles.stitchPct}>{cap.stitchProg}%</div>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {cap.step==='done'&&cap.panoUrl&&(
            <div className={styles.capWrap}>
              <div className={styles.doneBox}>
                <div className={styles.doneHead}>
                  <div className={styles.doneBadge}>✅ Photo Sphere Ready</div>
                  <h2 className={styles.doneT}>Your 360° Photo Sphere is ready!</h2>
                  <p className={styles.doneSub}>{cap.doneSet.size} frames · {PANO_W}×{PANO_H}px equirectangular</p>
                </div>
                <div className={styles.doneViewer}><Viewer src={cap.panoUrl}/></div>
                <div className={styles.doneFoot}>
                  <input className={styles.nameIn} value={pName} onChange={e=>setPName(e.target.value)} placeholder="Name your Photo Sphere…"/>
                  <div className={styles.doneBtns}>
                    <button className={styles.pri} onClick={savePano} disabled={saving}>{saving?'Saving…':'💾 Save to Gallery'}</button>
                    <button className={styles.sec} onClick={downloadPano}>⬇ Panorama</button>
                    <button className={styles.sec} onClick={downloadFrames}>⬇ Frames</button>
                    <button className={styles.sec} onClick={cap.reset}>🔄 Retake</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEWER */}
      {tab==='viewer'&&viewing&&(
        <div className={styles.viewPage}>
          <div className={styles.viewHdr}>
            <div className={styles.viewHdrT}>🔭 {viewing.name}</div>
            <button className={styles.sec} onClick={()=>{setTab('gallery');setViewing(null);}}>← Gallery</button>
          </div>
          <Viewer src={viewing.url} onClose={()=>{setTab('gallery');setViewing(null);}}/>
        </div>
      )}
    </div>
  );
}
