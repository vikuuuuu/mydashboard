// File Path: app/register/page.js
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";

import { registerWithEmail } from "@/lib/firebaseAuth";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getDeviceDetails } from "@/lib/getDeviceDetails";

import styles from "../login/login.module.css";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await registerWithEmail(name, email, password);
      const user = userCredential.user;

      const deviceDetails = await getDeviceDetails();

      // Save full profile to Firestore
      await setDoc(doc(db, "users", user.uid), {
        name,
        email: user.email,
        createdAt:           serverTimestamp(),
        registeredIp:        deviceDetails.ip,
        registeredDevice:    deviceDetails.deviceType,
        registeredOS:        deviceDetails.os,
        registeredBrowser:   deviceDetails.browser,
        registeredScreen:    deviceDetails.screen,
        registeredLocation:  deviceDetails.location,
        registeredCity:      deviceDetails.city,
        registeredRegion:    deviceDetails.region,
        registeredCountry:   deviceDetails.country,
        registeredTimezone:  deviceDetails.timezone,
        registeredISP:       deviceDetails.isp,
        registeredLat:       deviceDetails.lat,
        registeredLon:       deviceDetails.lon,
      });

      toast.success("Account created successfully!");
      router.replace("/dashboard");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") toast.error("Email already registered");
      else if (err.code === "auth/weak-password") toast.error("Password too weak (min 6 chars)");
      else toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <Toaster position="top-right" toastOptions={{
        style: { fontFamily: "'DM Sans', sans-serif", fontSize: "13.5px" }
      }} />

      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🚀</div>
          <h1 className={styles.title}>Create Account</h1>
          <p className={styles.subtitle}>Register to start using dashboard</p>
        </div>

        <form onSubmit={handleRegister} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Full Name</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}>👤</span>
              <input
                className={styles.input}
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Email Address</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}>✉️</span>
              <input
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}>🔑</span>
              <input
                type={showPass ? "text" : "password"}
                className={styles.input}
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPass(!showPass)}
                tabIndex={-1}
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button className={styles.loginBtn} disabled={loading}>
            {loading ? <span className={styles.btnSpinner} /> : null}
            {loading ? "Creating account…" : "Create Account →"}
          </button>
        </form>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>Already have an account?</span>
          <span className={styles.dividerLine} />
        </div>

        <button
          type="button"
          className={styles.googleBtn}
          onClick={() => router.push("/login")}
        >
          ← Back to Login
        </button>
      </div>
    </div>
  );
}