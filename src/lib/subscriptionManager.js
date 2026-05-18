// lib/subscriptionManager.js
// Handles all subscription logic: check, save, expiry

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { app } from "@/lib/firebase";

const YEARLY_PRICE_INR = 9; // ₹9/year — change as needed

/**
 * Returns subscription doc for a user
 * Shape: { active, startDate, endDate, plan, orderId, paymentId }
 */
export async function getSubscription(uid) {
  const db = getFirestore(app);
  const snap = await getDoc(doc(db, "subscriptions", uid));
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Returns true if subscription is currently active (endDate > now)
 */
export async function isSubscriptionActive(uid) {
  const sub = await getSubscription(uid);
  if (!sub || !sub.endDate) return false;
  const end = sub.endDate?.toDate ? sub.endDate.toDate() : new Date(sub.endDate);
  return end > new Date();
}

/**
 * Save subscription after successful Razorpay payment
 */
export async function saveSubscription(uid, { orderId, paymentId, plan = "yearly" }) {
  const db = getFirestore(app);
  const now = new Date();
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1); // +1 year

  await setDoc(doc(db, "subscriptions", uid), {
    active: true,
    plan,
    orderId,
    paymentId,
    startDate: serverTimestamp(),
    endDate: end,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Returns days remaining (0 if expired/none)
 */
export function getDaysRemaining(sub) {
  if (!sub || !sub.endDate) return 0;
  const end = sub.endDate?.toDate ? sub.endDate.toDate() : new Date(sub.endDate);
  const diff = end - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Returns formatted expiry date string
 */
export function getExpiryDisplay(sub) {
  if (!sub || !sub.endDate) return "—";
  const end = sub.endDate?.toDate ? sub.endDate.toDate() : new Date(sub.endDate);
  return end.toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

export { YEARLY_PRICE_INR };