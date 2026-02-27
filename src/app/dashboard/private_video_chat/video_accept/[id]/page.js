"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import styles from "./page.module.css";

import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";

const iceServers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VideoAcceptPage() {
  const { id } = useParams();
  const router = useRouter();

  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const pc = useRef(null);
  const streamRef = useRef(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    const joinCall = async () => {
      pc.current = new RTCPeerConnection(iceServers);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      streamRef.current = stream;
      localVideo.current.srcObject = stream;
      stream.getTracks().forEach((t) => pc.current.addTrack(t, stream));

      pc.current.ontrack = (e) => {
        remoteVideo.current.srcObject = e.streams[0];
      };

      const roomRef = doc(db, "rooms", id);
      const snap = await getDoc(roomRef);
      const data = snap.data();

      if (!data?.offer) {
        router.push("/dashboard/private_video_chat");
        return;
      }

      await pc.current.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);

      await updateDoc(roomRef, {
        answer: { type: answer.type, sdp: answer.sdp },
      });

      pc.current.onicecandidate = (e) => {
        e.candidate &&
          addDoc(
            collection(db, "rooms", id, "calleeCandidates"),
            e.candidate.toJSON()
          );
      };

      onSnapshot(doc(db, "rooms", id), (snap) => {
        if (snap.data()?.status === "ended") {
          endCall();
        }
      });

      onSnapshot(
        collection(db, "rooms", id, "callerCandidates"),
        (snap) =>
          snap.docChanges().forEach((c) => {
            if (c.type === "added" && pc.current) {
              pc.current.addIceCandidate(
                new RTCIceCandidate(c.doc.data())
              );
            }
          })
      );
    };

    joinCall();
    return () => {};
  }, [id]);

  /* ===== Controls ===== */

  const toggleMic = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  };

  const toggleCamera = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  };

  const endCall = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    pc.current?.close();
    router.push("/dashboard/private_video_chat");
  };

  return (
    <div className={styles.container}>
      {/* Remote video (FULL SCREEN) */}
      <video
        ref={remoteVideo}
        autoPlay
        playsInline
        className={styles.remoteVideo}
      />

      {/* Local preview */}
      <video
        ref={localVideo}
        autoPlay
        muted
        playsInline
        className={styles.localVideo}
      />

      {/* Controls */}
      <div className={styles.controls}>
        <button onClick={toggleMic} className={styles.controlBtn}>
          {micOn ? <Mic /> : <MicOff />}
        </button>

        <button onClick={toggleCamera} className={styles.controlBtn}>
          {camOn ? <Video /> : <VideoOff />}
        </button>

        <button
          onClick={endCall}
          className={`${styles.controlBtn} ${styles.end}`}
        >
          <PhoneOff />
        </button>
      </div>
    </div>
  );
}
