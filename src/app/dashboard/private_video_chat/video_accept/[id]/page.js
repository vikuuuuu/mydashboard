"use client";

import { useEffect, useRef } from "react";
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
          cleanup();
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

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    pc.current?.close();
    router.push("/dashboard/private_video_chat");
  };

  return (
    <main style={{ textAlign: "center" }}>
      <h2>📞 Receiver</h2>

      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <video ref={localVideo} autoPlay muted playsInline width={280} />
        <video ref={remoteVideo} autoPlay playsInline width={280} />
      </div>

      <button onClick={cleanup} style={{ marginTop: 20, color: "red" }}>
        ❌ End Call
      </button>
    </main>
  );
}