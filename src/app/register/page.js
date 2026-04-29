"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";
import { registerWithEmail, db } from "@/lib/firebaseAuth"; // Import db here
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getDeviceDetails } from "@/lib/getDeviceDetails";

import styles from "../login/login.module.css";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Assuming registerWithEmail returns the user credential
      const userCredential = await registerWithEmail(name, email, password);
      const user = userCredential.user;

      // Get device details at registration
      const deviceDetails = await getDeviceDetails();

      // Save user profile in Firestore 'users' collection
      await setDoc(doc(db, "users", user.uid), {
        name,
        email: user.email,
        createdAt: serverTimestamp(),
        registeredIp: deviceDetails.ip,
        registeredDevice: deviceDetails.os,
        registeredBrowser: deviceDetails.browser,
      });

      toast.success("Account created successfully");
      router.replace("/dashboard");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <Toaster position="top-right" />
      <div className={styles.loginCard}>
        <h1 className={styles.title}>Create Account</h1>
        <p className={styles.subtitle}>Register to start using dashboard</p>

        <form onSubmit={handleRegister}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Name</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          <button className={styles.loginBtn} disabled={loading}>
            {loading ? "Creating..." : "Register"}
          </button>
        </form>
        
        <div style={{ marginTop: "15px", fontSize: "14px", textAlign: "center" }}>
          Already have an account? 
          <button
            style={{
              background: "none",
              border: "none",
              color: "#2563eb",
              cursor: "pointer",
              textDecoration: "underline",
              marginLeft: "5px",
              fontWeight: "600"
            }}
            onClick={() => router.push("/login")}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}
