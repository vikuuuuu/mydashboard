// File: app/login/page.js
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";

import {
  getCurrentUser,
  signInWithEmail,
  signInWithGoogle,
  getGoogleRedirectResult,
  changePassword,
} from "@/lib/firebaseAuth";
import { logLogin } from "@/lib/loginlogger";
import {
  checkExistingSession,
  forceRegisterSession,
  registerSession,
} from "@/lib/sessionManager";

import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Session conflict
  const [conflict, setConflict] = useState(null);
  const [pendingUid, setPendingUid] = useState(null);
  const [pendingProvider, setPendingProvider] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  /* ── Auto redirect + Google redirect ── */
  useEffect(() => {
    if (getCurrentUser()) {
      router.replace("/dashboard");
      return;
    }
    getGoogleRedirectResult()
      .then(async (result) => {
        if (!result?.user) return;
        await handlePostLogin(result.user.uid, "google");
      })
      .catch((err) => {
        if (err?.code !== "auth/no-redirect-result") console.error(err);
      });
  }, [router]);

  /* ── Post-login: session conflict check ── */
  const handlePostLogin = async (uid, provider) => {
    // 🔥 WAIT for auth to stabilize
    await new Promise((res) => setTimeout(res, 500));

    const existing = await checkExistingSession(uid);

    if (existing) {
      setPendingUid(uid);
      setPendingProvider(provider);
      setConflict(existing);
      setLoading(false);
      return;
    }

    await registerSession(uid);
    await logLogin({ userId: uid, provider });

    toast.success("Login successful!");
    router.replace("/dashboard");
  };

  /* ── Force login (logout other device) ── */
  const handleForceLogin = async () => {
    if (!pendingUid) return;
    setConfirmLoading(true);
    try {
      await forceRegisterSession(pendingUid);
      await logLogin({ userId: pendingUid, provider: pendingProvider });
      toast.success("Logged in on this device!");
      router.replace("/dashboard");
    } catch {
      toast.error("Failed. Please try again.");
    } finally {
      setConfirmLoading(false);
      setConflict(null);
    }
  };

  const handleCancelLogin = () => {
    setConflict(null);
    setPendingUid(null);
    setPendingProvider(null);
  };

  /* ── Email Login ── */
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await signInWithEmail(email.trim(), password);
      const uid = cred?.user?.uid;
      if (!uid) throw new Error("UID missing");
      await handlePostLogin(uid, "email");
    } catch (err) {
      const msg =
        {
          "auth/user-not-found": "No account with this email",
          "auth/wrong-password": "Incorrect password",
          "auth/invalid-credential": "Invalid email or password",
          "auth/too-many-requests": "Too many attempts. Try later.",
        }[err.code] || "Login failed";
      toast.error(msg);
      setLoading(false);
    }
  };

  /* ── Google Login ── */
  const handleGoogleLogin = async () => {
    try {
      document.activeElement?.blur(); // 🔥 fix focus warning
      await signInWithGoogle(); // redirect होगा
    } catch (err) {
      toast.error(err.message || "Google login failed");
    }
  };

  /* ── Reset Password ── */
  const handleResetPassword = async () => {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }
    setLoading(true);
    try {
      await changePassword(email.trim());
      toast.success("Reset email sent!");
    } catch {
      toast.error("Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return "Unknown";
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
      return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown";
    }
  };

  return (
    <div className={styles.wrapper}>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontFamily: "'DM Sans', sans-serif", fontSize: "13.5px" },
        }}
      />

      {/* ════ SESSION CONFLICT MODAL ════ */}
      {conflict && (
        <div className={styles.conflictOverlay}>
          <div className={styles.conflictModal}>
            <div className={styles.conflictHeader}>
              <span className={styles.conflictHeaderIcon}>⚠️</span>
              <h2 className={styles.conflictTitle}>Already Logged In</h2>
              <p className={styles.conflictDesc}>
                Your account is active on another device. Only{" "}
                <strong>one device</strong> can be signed in at a time.
              </p>
            </div>

            <div className={styles.conflictInfo}>
              <div className={styles.conflictInfoTitle}>
                Active Session Details
              </div>
              <div className={styles.conflictRow}>
                <span className={styles.conflictLabel}>📱 Device</span>
                <span className={styles.conflictValue}>
                  {conflict.deviceType || "—"}
                </span>
              </div>
              <div className={styles.conflictRow}>
                <span className={styles.conflictLabel}>💿 OS</span>
                <span className={styles.conflictValue}>
                  {conflict.os || "—"}
                </span>
              </div>
              <div className={styles.conflictRow}>
                <span className={styles.conflictLabel}>🌐 Browser</span>
                <span className={styles.conflictValue}>
                  {conflict.browser || "—"}
                </span>
              </div>
              <div className={styles.conflictRow}>
                <span className={styles.conflictLabel}>🔌 IP Address</span>
                <span
                  className={`${styles.conflictValue} ${styles.conflictMono}`}
                >
                  {conflict.ip || "—"}
                </span>
              </div>
              <div className={styles.conflictRow}>
                <span className={styles.conflictLabel}>📍 Location</span>
                <span className={styles.conflictValue}>
                  {conflict.location || "—"}
                </span>
              </div>
              <div className={styles.conflictRow}>
                <span className={styles.conflictLabel}>🕐 Logged in at</span>
                <span
                  className={`${styles.conflictValue} ${styles.conflictMono}`}
                >
                  {formatDate(conflict.loginAt)}
                </span>
              </div>
            </div>

            <div className={styles.conflictWarningBox}>
              <span>⚠️</span>
              <span>
                Confirming will <strong>immediately logout</strong> the other
                device.
              </span>
            </div>

            <div className={styles.conflictBtns}>
              <button
                className={styles.conflictCancel}
                onClick={handleCancelLogin}
              >
                Cancel
              </button>
              <button
                className={`${styles.conflictConfirm} ${confirmLoading ? styles.conflictBusy : ""}`}
                onClick={handleForceLogin}
                disabled={confirmLoading}
              >
                {confirmLoading ? (
                  <>
                    <span className={styles.btnSpinner} /> Logging in…
                  </>
                ) : (
                  "✓ Login on This Device"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ LOGIN CARD ════ */}
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>📊</div>
          <h1 className={styles.title}>File Dashboard</h1>
          <p className={styles.subtitle}>Sign in to your account</p>
        </div>

        <form onSubmit={handleEmailLogin} className={styles.form}>
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
                onClick={() => setShowPass((p) => !p)}
                tabIndex={-1}
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button className={styles.loginBtn} disabled={loading}>
            {loading && <span className={styles.btnSpinner} />}
            {loading ? "Signing in…" : "Login →"}
          </button>

          <div className={styles.linkRow}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={handleResetPassword}
              disabled={loading}
            >
              Forgot Password?
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => router.push("/register")}
            >
              Create Account
            </button>
          </div>
        </form>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>OR</span>
          <span className={styles.dividerLine} />
        </div>

        <button
          type="button"
          className={styles.googleBtn}
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 48 48"
            style={{ flexShrink: 0 }}
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
