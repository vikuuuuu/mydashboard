"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";
import { auth } from "@/lib/firebaseAuth";
import {
  getCurrentUser,
  signInWithEmail,
  signInWithGoogle,
  changePassword,
} from "@/lib/firebaseAuth";

import { logLogin } from "@/lib/loginlogger";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

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

    try {
      await signInWithEmail(email.trim(), password);

      await logLogin({
        userId: auth.currentUser.uid,
        provider: "email",
      });

      toast.success("Login successful");
      router.replace("/dashboard");
    } catch (err) {
      toast.error("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  /* ================= GOOGLE LOGIN ================= */
  const handleGoogleLogin = async () => {
    setLoading(true);

    try {
      await signInWithGoogle();

      await logLogin({
        userId: auth.currentUser.uid,
        provider: "google",
      });

      toast.success("Google login successful");
      router.replace("/dashboard");
    } catch (err) {
      toast.error("Google login failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= RESET PASSWORD ================= */
  const handleResetPassword = async () => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }

    setLoading(true);

    try {
      await changePassword(email);
      toast.success("Password reset email sent");
    } catch (err) {
      toast.error("Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <Toaster position="top-right" />
      <div className={styles.loginCard}>
        <h1 className={styles.title}>File Dashboard</h1>
        <p className={styles.subtitle}>Login using Email or Google</p>

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

          {/* FORGOT PASSWORD */}
          <button
            type="button"
            className={styles.switchMode}
            onClick={handleResetPassword}
            disabled={loading}
          >
            Forgot Password?
          </button>

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
