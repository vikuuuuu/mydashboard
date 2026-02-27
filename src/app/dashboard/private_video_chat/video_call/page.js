"use client";

import { useRef, useState } from "react";
import {
  collection,
  addDoc,
  setDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ArrowLeft,
} from "lucide-react";

const iceServers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function StreamPage() {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const pc = useRef(null);
  const streamRef = useRef(null);

  const [roomId, setRoomId] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const router = useRouter();

  /* ================= START CALL ================= */
  const startCall = async () => {
    pc.current = new RTCPeerConnection(iceServers);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    streamRef.current = stream;
    localVideo.current.srcObject = stream;

    stream.getTracks().forEach((t) => pc.current.addTrack(t, stream));

    pc.current.ontrack = (e) => {
      remoteVideo.current.srcObject = e.streams[0];
    };

    const roomRef = await addDoc(collection(db, "rooms"), {});
    setRoomId(roomRef.id);

    pc.current.onicecandidate = (e) => {
      e.candidate &&
        addDoc(
          collection(db, "rooms", roomRef.id, "callerCandidates"),
          e.candidate.toJSON()
        );
    };

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);

    await setDoc(doc(db, "rooms", roomRef.id), {
      offer: { type: offer.type, sdp: offer.sdp },
      status: "live",
    });

    onSnapshot(doc(db, "rooms", roomRef.id), async (snap) => {
      const data = snap.data();
      if (data?.answer && !pc.current.currentRemoteDescription) {
        await pc.current.setRemoteDescription(data.answer);
      }
    });

    onSnapshot(
      collection(db, "rooms", roomRef.id, "calleeCandidates"),
      (snap) =>
        snap.docChanges().forEach((c) => {
          if (c.type === "added") {
            pc.current.addIceCandidate(c.doc.data());
          }
        })
    );
  };

  /* ================= CONTROLS ================= */
  const toggleMic = () => {
    const track = streamRef.current.getAudioTracks()[0];
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  };

  const toggleCamera = () => {
    const track = streamRef.current.getVideoTracks()[0];
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  };

  const endCall = async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    pc.current?.close();

    if (roomId) {
      await setDoc(
        doc(db, "rooms", roomId),
        { status: "ended" },
        { merge: true }
      );
    }

    router.push("/dashboard/private_video_chat");
  };

  return (
    <main className={styles.page}>
      {/* Back */}
      <button className={styles.backBtn} onClick={() => router.back()}>
        <ArrowLeft size={16} /> Back
      </button>

      {/* Card */}
      <div className={styles.card}>
        <h2 className={styles.title}>Private Video Call</h2>

        {/* Videos */}
        <div className={styles.videoGrid}>
          <div className={styles.videoBox}>
            <span>You</span>
            <video ref={localVideo} autoPlay muted playsInline />
          </div>

          <div className={styles.videoBox}>
            <span>Guest</span>
            <video ref={remoteVideo} autoPlay playsInline />
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <button onClick={toggleMic} className={styles.controlBtn}>
            {micOn ? <Mic /> : <MicOff />}
          </button>

          <button onClick={toggleCamera} className={styles.controlBtn}>
            {camOn ? <Video /> : <VideoOff />}
          </button>

          {!roomId ? (
            <button
              onClick={startCall}
              className={`${styles.controlBtn} ${styles.start}`}
            >
              Start Call
            </button>
          ) : (
            <button
              onClick={endCall}
              className={`${styles.controlBtn} ${styles.end}`}
            >
              <PhoneOff />
            </button>
          )}
        </div>

        {roomId && (
          <p className={styles.shareText}>
            Share Room ID with your guest to join:
            <br />
            <strong>/watch/{roomId}</strong>
          </p>
        )}
      </div>
    </main>
  );
}