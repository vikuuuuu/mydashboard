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
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
} from "lucide-react";

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

  /* ================= CONTROLS ================= */

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
    <main
      style={{
        height: "100vh",
        background: "#0f172a",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* VIDEO AREA */}
      <div style={{ flex: 1, position: "relative" }}>
        <video
          ref={remoteVideo}
          autoPlay
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            background: "#000",
          }}
        />

        {/* Local Preview */}
        <video
          ref={localVideo}
          autoPlay
          muted
          playsInline
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            width: 140,
            height: 200,
            objectFit: "cover",
            borderRadius: 12,
            border: "2px solid #22c55e",
          }}
        />
      </div>

      {/* CONTROLS */}
      <div
        style={{
          padding: 20,
          display: "flex",
          justifyContent: "center",
          gap: 20,
          background: "#020617",
        }}
      >
        <button onClick={toggleMic} style={controlBtnStyle}>
          {micOn ? <Mic /> : <MicOff />}
        </button>

        <button onClick={toggleCamera} style={controlBtnStyle}>
          {camOn ? <Video /> : <VideoOff />}
        </button>

        <button
          onClick={endCall}
          style={{ ...controlBtnStyle, background: "#dc2626" }}
        >
          <PhoneOff />
        </button>
      </div>
    </main>
  );
}

/* ================= STYLES ================= */
const controlBtnStyle = {
  width: 60,
  height: 60,
  borderRadius: "50%",
  border: "none",
  background: "#1e293b",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
