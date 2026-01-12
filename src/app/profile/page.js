"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Save, ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "../dashboard.module.css";

export default function ProfilePage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const [password, setPassword] = useState({
    newPass: "",
    confirmPass: "",
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push("/login");

      setSessionUser(session.user);

      const { data } = await supabase
        .from("portfolio_profile")
        .select("full_name, location")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setName(data?.full_name || "");
      setLocation(data?.location || "");
    };

    init();
  }, [router]);

  const saveAdminProfile = async () => {
    if (!sessionUser) return;

    const { data: existing } = await supabase
      .from("portfolio_profile")
      .select("id")
      .eq("user_id", sessionUser.id)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("portfolio_profile")
        .update({ full_name: name, location })
        .eq("id", existing.id);
    }

    alert("Profile Updated ✅");
  };

  const changePassword = async () => {
    if (password.newPass.length < 6) return alert("Password min 6 chars");
    if (password.newPass !== password.confirmPass) return alert("Password not match");

    const { error } = await supabase.auth.updateUser({
      password: password.newPass,
    });

    if (error) return alert(error.message);

    alert("Password updated ✅");
    setPassword({ newPass: "", confirmPass: "" });
  };

  return (
    <div className={styles.main} style={{ padding: "2rem" }}>
      <div className={styles.sectionCard}>
        <button className={styles.secondaryBtn} onClick={() => router.push("/")}>
          <ArrowLeft size={16} /> Back
        </button>

        <h2 className={styles.sectionTitle} style={{ marginTop: "1rem" }}>
          Admin Profile
        </h2>

        <div className={styles.adminHeader}>
          <div className={styles.adminAvatar}>
            <User size={32} />
          </div>
          <div>
            <h3 className={styles.adminName}>{name || "Admin"}</h3>
            <p className={styles.smallText}>{sessionUser?.email}</p>
          </div>
        </div>

        <div className={styles.grid2}>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" />
          <input className={styles.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" />
        </div>

        <button className={styles.primaryBtn} onClick={saveAdminProfile}>
          <Save size={18} /> Update Profile
        </button>
      </div>

      <div className={styles.sectionCard} style={{ marginTop: "1.5rem" }}>
        <h2 className={styles.sectionTitle}>
          <Lock size={18} /> Change Password
        </h2>

        <input className={styles.input} type="password" placeholder="New Password"
          value={password.newPass}
          onChange={(e) => setPassword({ ...password, newPass: e.target.value })}
        />

        <input className={styles.input} type="password" placeholder="Confirm Password"
          value={password.confirmPass}
          onChange={(e) => setPassword({ ...password, confirmPass: e.target.value })}
        />

        <button className={styles.primaryBtn} onClick={changePassword}>
          Update Password
        </button>
      </div>
    </div>
  );
}
