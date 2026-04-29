// File Path: app/login/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";

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
      const userCredential = await signInWithEmail(email.trim(), password);
      const uid = userCredential?.user?.uid;

      if (!uid) throw new Error("Could not retrieve User ID");

      await logLogin({
        userId: uid,
        provider: "email",
      });

      toast.success("Login successful");
      router.replace("/dashboard");
    } catch (err) {
      console.error("Email Login Error:", err);
      toast.error("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  /* ================= GOOGLE LOGIN ================= */
  const handleGoogleLogin = async () => {
    setLoading(true);

    try {
      const result = await signInWithGoogle();
      const currentUid = result?.user?.uid;

      if (!currentUid) {
        throw new Error("Failed to load User ID from Google!");
      }

      await logLogin({
        userId: currentUid,
        provider: "google",
      });

      toast.success("Google login successful");
      router.replace("/dashboard");
    } catch (err) {
      console.error("GOOGLE LOGIN ERROR:", err);

      if (err.code === "auth/popup-closed-by-user") {
        toast.error("Login cancelled. Please try again.");
      } else if (err.code === "auth/unauthorized-domain") {
        toast.error("Domain not authorized in Firebase Console.");
      } else {
        toast.error(err.message || "Google login failed");
      }
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

          <div className={styles.forgetbtn}>
            <button
              type="button"
              className={styles.switchMode}
              onClick={handleResetPassword}
              disabled={loading}
            >
              Forgot Password?
            </button>

            <button
              type="button"
              className={styles.switchMode}
              onClick={() => router.push("/register")}
            >
              Create new account
            </button>
          </div>
        </form>

        <div className={styles.divider}>OR</div>

        <button
          type="button"
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
