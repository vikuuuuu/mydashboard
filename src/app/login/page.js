"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebaseAuth";
import {
  getCurrentUser,
  signInWithEmail,
  signInWithGoogle,
} from "@/lib/firebaseAuth";
import { logLogin } from "@/lib/loginlogger";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ================= AUTO REDIRECT ================= */
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      router.replace("/dashboard");
    }
  }, [router]);

  /* ================= EMAIL LOGIN ================= */
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmail(email.trim(), password);

      await logLogin({
        userId: auth.currentUser.uid,
        provider: "email",
      });

      router.replace("/dashboard");
    } catch (err) {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  /* ================= GOOGLE LOGIN ================= */
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      await signInWithGoogle();

      await logLogin({
        userId: auth.currentUser.uid,
        provider: "google",
      });

      router.replace("/dashboard");
    } catch (err) {
      setError("Google login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.loginCard}>
        <h1 className={styles.title}>File Dashboard</h1>
        <p className={styles.subtitle}>
          Login using Email or Google
        </p>

        {error && <div className={styles.error}>{error}</div>}

        {/* EMAIL LOGIN */}
        <form onSubmit={handleEmailLogin}>
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
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <div className={styles.divider}>OR</div>

        {/* GOOGLE LOGIN */}
        <button
          className={styles.googleBtn}
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}