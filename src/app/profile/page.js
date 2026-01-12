"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, ArrowLeft, Save, Upload, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "./profile.module.css";

export default function ProfilePage() {
  const router = useRouter();

  const [sessionUser, setSessionUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState({
    full_name: "",
    location: "",
    avatar_url: "",
    about_image_url: "",
  });

  // password
  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  // auth + fetch profile
  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return router.push("/login");

      setSessionUser(session.user);

      const { data } = await supabase
        .from("portfolio_profile")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setProfile({
        full_name: data?.full_name || "",
        location: data?.location || "",
        avatar_url: data?.avatar_url || "",
        about_image_url: data?.about_image_url || "",
      });
    };

    init();
  }, [router]);

  // save admin profile
  const saveAdminProfile = async () => {
    if (!sessionUser) return;
    setLoading(true);

    try {
      const { data: existing } = await supabase
        .from("portfolio_profile")
        .select("id")
        .eq("user_id", sessionUser.id)
        .maybeSingle();

      const payload = {
        full_name: profile.full_name,
        location: profile.location,
        avatar_url: profile.avatar_url,
        about_image_url: profile.about_image_url,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("portfolio_profile")
          .update(payload)
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("portfolio_profile")
          .insert([{ user_id: sessionUser.id, ...payload }]);

        if (error) throw error;
      }

      alert("Profile Updated ✅");
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // upload avatar image
  const uploadAvatar = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !sessionUser) return;

      setLoading(true);

      const ext = file.name.split(".").pop();
      const filePath = `${sessionUser.id}/avatar_${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("portfolio-projects")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage
        .from("portfolio-projects")
        .getPublicUrl(filePath);

      setProfile((prev) => ({ ...prev, avatar_url: data.publicUrl }));
      alert("Avatar Uploaded ✅");
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // upload about image
  const uploadAboutImage = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !sessionUser) return;

      setLoading(true);

      const ext = file.name.split(".").pop();
      const filePath = `${sessionUser.id}/about_${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("portfolio-projects")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage
        .from("portfolio-projects")
        .getPublicUrl(filePath);

      setProfile((prev) => ({ ...prev, about_image_url: data.publicUrl }));
      alert("About Image Uploaded ✅");
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // change password
  const changePassword = async () => {
    if (passwordForm.newPassword.length < 6)
      return alert("Password minimum 6 characters");

    if (passwordForm.newPassword !== passwordForm.confirmPassword)
      return alert("Password not match!");

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });

      if (error) throw error;

      alert("Password Updated ✅");
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <button onClick={() => router.back()} className={styles.backBtn}>
          <ArrowLeft size={18} /> Back
        </button>

        <h2>Admin Profile</h2>
      </div>

      {/* profile card */}
      <div className={styles.card}>
        <div className={styles.avatarRow}>
          <div className={styles.avatarBox}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" />
            ) : (
              <User size={36} />
            )}
          </div>

          <label className={styles.uploadBtn}>
            <Upload size={16} /> Upload Avatar
            <input
              type="file"
              accept="image/*"
              onChange={uploadAvatar}
              style={{ display: "none" }}
            />
          </label>
        </div>

        <input
          className={styles.input}
          placeholder="Full Name"
          value={profile.full_name}
          onChange={(e) =>
            setProfile((prev) => ({ ...prev, full_name: e.target.value }))
          }
        />

        <input
          className={styles.input}
          placeholder="Location"
          value={profile.location}
          onChange={(e) =>
            setProfile((prev) => ({ ...prev, location: e.target.value }))
          }
        />

        {/* About image */}
        <div className={styles.aboutRow}>
          <label className={styles.uploadBtn}>
            <Upload size={16} /> Upload About Image
            <input
              type="file"
              accept="image/*"
              onChange={uploadAboutImage}
              style={{ display: "none" }}
            />
          </label>

          {profile.about_image_url ? (
            <img
              src={profile.about_image_url}
              alt="about"
              className={styles.aboutPreview}
            />
          ) : (
            <p className={styles.small}>No about image</p>
          )}
        </div>

        <button
          disabled={loading}
          onClick={saveAdminProfile}
          className={styles.primaryBtn}
        >
          <Save size={18} /> Save Profile
        </button>
      </div>

      {/* password card */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          <Lock size={18} /> Change Password
        </h3>

        <input
          className={styles.input}
          placeholder="New Password"
          type="password"
          value={passwordForm.newPassword}
          onChange={(e) =>
            setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))
          }
        />

        <input
          className={styles.input}
          placeholder="Confirm Password"
          type="password"
          value={passwordForm.confirmPassword}
          onChange={(e) =>
            setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))
          }
        />

        <button className={styles.primaryBtn} onClick={changePassword}>
          Update Password
        </button>
      </div>
    </div>
  );
}
