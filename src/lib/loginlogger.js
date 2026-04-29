// File Path: lib/loginlogger.js

import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getDeviceDetails } from "@/lib/getDeviceDetails";

/**
 * Call this after every successful login (email or google)
 * Saves full session details to Firestore → login_logs collection
 *
 * Firestore Structure:
 * login_logs/
 *   {auto-id}/
 *     userId        : string
 *     provider      : "email" | "google"
 *     ip            : string
 *     browser       : string
 *     os            : string
 *     deviceType    : string   ("Mobile 📱" | "Desktop 💻" | "Tablet 📱" | "Smart TV 📺")
 *     screen        : string   ("1920×1080")
 *     city          : string
 *     region        : string
 *     country       : string
 *     timezone      : string
 *     isp           : string
 *     location      : string   ("Mumbai, Maharashtra, India")
 *     lat           : number | null
 *     lon           : number | null
 *     userAgent     : string
 *     createdAt     : Timestamp
 */
export async function logLogin({ userId, provider }) {
  try {
    const details = await getDeviceDetails();

    await addDoc(collection(db, "login_logs"), {
      userId,
      provider,

      // Device
      deviceType: details.deviceType,
      os:         details.os,
      browser:    details.browser,
      screen:     details.screen,
      userAgent:  details.userAgent,

      // Network
      ip:         details.ip,
      isp:        details.isp,

      // Location
      city:       details.city,
      region:     details.region,
      country:    details.country,
      timezone:   details.timezone,
      location:   details.location,
      lat:        details.lat,
      lon:        details.lon,

      createdAt:  serverTimestamp(),
    });
  } catch (err) {
    // Never crash the login flow due to logging failure
    console.warn("Login log failed (non-critical):", err);
  }
}