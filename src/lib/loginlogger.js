// lib/loginlogger.js
import { db } from "./firebaseAuth"; // Ensure Firestore is exported from your firebase config
import { collection, addDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getDeviceDetails } from "./getDeviceDetails";

export const logLogin = async ({ userId, provider }) => {
  try {
    const deviceDetails = await getDeviceDetails();

    // 1. Update user's last login in their main profile document
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      lastLogin: serverTimestamp(),
      lastIp: deviceDetails.ip,
      lastDevice: deviceDetails.os,
    }, { merge: true });

    // 2. Save a detailed log in the 'loginLogs' collection
    await addDoc(collection(db, "loginLogs"), {
      userId,
      provider,
      ...deviceDetails,
      loginTime: serverTimestamp(),
    });

    console.log("Login details saved successfully");
  } catch (error) {
    console.error("Error saving login logs:", error);
  }
};
