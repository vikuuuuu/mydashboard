"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  FileText,
  Image as ImageIcon,
  LogOut,
  User,
  Save,
  Plus,
  Trash2,
  Upload,
  Link as LinkIcon,
  Shield,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { encryptText, decryptText } from "@/lib/crypto";
import styles from "./dashboard.module.css";

const DEFAULT_SECRET = "PORTFOLIO_SECRET_KEY";

export default function Dashboard() {
  const router = useRouter();

  const [sessionUser, setSessionUser] = useState(null);
  const [secret, setSecret] = useState(DEFAULT_SECRET);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: "" });

  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadingProjectImgId, setUploadingProjectImgId] = useState(null);
  const [profileImageUploading, setProfileImageUploading] = useState(false);

  const [profile, setProfile] = useState({
    full_name: "",
    subtitle: "",
    about: "",
    resume_url: "",
    about_image_url: "",

    email: "",
    phone: "",
    location: "",
    website: "",

    github: "",
    linkedin: "",
    instagram: "",
    twitter: "",
    youtube: "",

    avatar_url: "",
  });

  const [skills, setSkills] = useState([]);
  const [projects, setProjects] = useState([]);
  const [certs, setCerts] = useState([]);
  const [edu, setEdu] = useState([]);
  const [exp, setExp] = useState([]);

  const [loading, setLoading] = useState(false);

  // ---------- Toast ----------
  const showToast = (msg) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: "" }), 2500);
  };

  // ---------- AUTH ----------
  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return router.push("/login");

      setSessionUser(session.user);
      await fetchAll(session.user.id);
    };

    init();

    // close dropdown on outside click
    const close = () => setUserMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [router]);

  // ✅ decrypt only About when secret changes
  useEffect(() => {
    const decryptAgain = async () => {
      if (!sessionUser?.id) return;

      const { data } = await supabase
        .from("portfolio_profile")
        .select("about")
        .eq("user_id", sessionUser.id)
        .maybeSingle();

      if (data?.about) {
        try {
          const decrypted = await decryptText(JSON.parse(data.about), secret);
          setProfile((prev) => ({ ...prev, about: decrypted || "" }));
        } catch {
          setProfile((prev) => ({ ...prev, about: "" }));
        }
      }
    };

    decryptAgain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // ---------- FETCH ----------
  const fetchAll = async (userId) => {
    setLoading(true);
    try {
      // Profile
      const { data: profileData } = await supabase
        .from("portfolio_profile")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      let decryptedAbout = "";
      if (profileData?.about) {
        try {
          decryptedAbout = await decryptText(
            JSON.parse(profileData.about),
            secret
          );
        } catch {
          decryptedAbout = "";
        }
      }

      setProfile({
        full_name: profileData?.full_name || "",
        subtitle: profileData?.subtitle || "",
        about: decryptedAbout || "",
        resume_url: profileData?.resume_url || "",
        about_image_url: profileData?.about_image_url || "",

        email: profileData?.email || "",
        phone: profileData?.phone || "",
        location: profileData?.location || "",
        website: profileData?.website || "",

        github: profileData?.github || "",
        linkedin: profileData?.linkedin || "",
        instagram: profileData?.instagram || "",
        twitter: profileData?.twitter || "",
        youtube: profileData?.youtube || "",

        avatar_url: profileData?.avatar_url || "",
      });

      // Skills
      const { data: skillsData } = await supabase
        .from("portfolio_skills")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true });

      // Projects
      const { data: projectsData } = await supabase
        .from("portfolio_projects")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      // Others
      const { data: certsData } = await supabase
        .from("portfolio_certifications")
        .select("*")
        .eq("user_id", userId);

      const { data: eduData } = await supabase
        .from("portfolio_education")
        .select("*")
        .eq("user_id", userId);

      const { data: expData } = await supabase
        .from("portfolio_experience")
        .select("*")
        .eq("user_id", userId);

      setSkills(skillsData || []);
      setProjects(projectsData || []);
      setCerts(certsData || []);
      setEdu(eduData || []);
      setExp(expData || []);
    } catch (e) {
      console.log(e);
      showToast("Fetch error ❌");
    } finally {
      setLoading(false);
    }
  };

  // ---------- SAVE PROFILE ----------
  const saveProfile = async () => {
    if (!sessionUser) return;

    setLoading(true);
    try {
      const encryptedAbout = await encryptText(profile.about, secret);

      const { data: existing } = await supabase
        .from("portfolio_profile")
        .select("id")
        .eq("user_id", sessionUser.id)
        .maybeSingle();

      const payload = {
        full_name: profile.full_name,
        subtitle: profile.subtitle,
        about: JSON.stringify(encryptedAbout),
        resume_url: profile.resume_url,
        about_image_url: profile.about_image_url,

        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        website: profile.website,

        github: profile.github,
        linkedin: profile.linkedin,
        instagram: profile.instagram,
        twitter: profile.twitter,
        youtube: profile.youtube,

        avatar_url: profile.avatar_url,
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

      showToast("Profile saved ✅");
    } catch (e) {
      alert(e.message);
      showToast("Save error ❌");
    } finally {
      setLoading(false);
    }
  };

  // ---------- UPLOAD RESUME ----------
  const handleResumeUpload = async (e) => {
    try {
      setUploadingResume(true);

      const file = e.target.files?.[0];
      if (!file || !sessionUser) return;

      const ext = file.name.split(".").pop();
      const filePath = `${sessionUser.id}/resume_${Date.now()}.${ext}`;

      // ✅ NOTE: bucket should allow user upload (see SQL below)
      const { error } = await supabase.storage
        .from("portfolio-resume")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      // Signed URL for private resume bucket
      const { data: signed } = await supabase.storage
        .from("portfolio-resume")
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      const url = signed?.signedUrl || "";
      setProfile((prev) => ({ ...prev, resume_url: url }));

      showToast("Resume uploaded ✅");
    } catch (e) {
      alert(e.message);
      showToast("Resume upload error ❌");
    } finally {
      setUploadingResume(false);
    }
  };

  // ---------- UPLOAD ABOUT IMAGE ----------
  const uploadAboutImage = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !sessionUser) return;

      setProfileImageUploading(true);

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
      showToast("About image uploaded ✅");
    } catch (e) {
      alert(e.message);
      showToast("About image error ❌");
    } finally {
      setProfileImageUploading(false);
    }
  };

  // ---------- PROJECT IMAGE ----------
  const uploadProjectImage = async (e, index) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !sessionUser) return;

      setUploadingProjectImgId(index);

      const ext = file.name.split(".").pop();
      const filePath = `${sessionUser.id}/project_${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("portfolio-projects")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage
        .from("portfolio-projects")
        .getPublicUrl(filePath);

      const arr = [...projects];
      arr[index].image_url = data.publicUrl;
      setProjects(arr);

      showToast("Project image uploaded ✅");
    } catch (e) {
      alert(e.message);
      showToast("Image upload error ❌");
    } finally {
      setUploadingProjectImgId(null);
    }
  };

  // ---------- CRUD helpers ----------
  const addRow = (setter, template) =>
    setter((prev) => [{ ...template, id: undefined }, ...prev]);

  const removeRow = async (table, id, setter) => {
    if (!id) return setter((prev) => prev.slice(1));

    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return alert(error.message);

    setter((prev) => prev.filter((x) => x.id !== id));
  };

  // ✅ FIXED UPSERT (ID null bug fix)
  const upsertRows = async (table, rows, setter) => {
    if (!sessionUser) return;

    setLoading(true);
    try {
      const cleaned = rows.map((row) => {
        const obj = { ...row };
        if (obj.id === null || obj.id === "" || obj.id === undefined) delete obj.id;
        obj.user_id = sessionUser.id;
        return obj;
      });

      const { data, error } = await supabase.from(table).upsert(cleaned).select("*");
      if (error) throw error;

      setter(data || []);
      showToast(`${table} saved ✅`);
    } catch (e) {
      alert(e.message);
      showToast("Save error ❌");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    return {
      skills: skills.length,
      projects: projects.length,
      secure: "Encrypted",
    };
  }, [skills.length, projects.length]);

  return (
    <div className={styles.container}>
      {/* Toast */}
      {toast.show && (
        <div className={styles.toast}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast({ show: false, msg: "" })}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Lock size={24} />
          <span>Admin Panel</span>
        </div>

        <nav className={styles.menu}>
          <button className={styles.active}>Dashboard</button>

          <button onClick={() => document.getElementById("portfolio")?.scrollIntoView({ behavior: "smooth" })}>
            Portfolio
          </button>

          <button onClick={() => document.getElementById("social")?.scrollIntoView({ behavior: "smooth" })}>
            Social Links
          </button>

          <button onClick={() => document.getElementById("skills")?.scrollIntoView({ behavior: "smooth" })}>
            Skills
          </button>

          <button onClick={() => document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" })}>
            Projects
          </button>

          <button onClick={() => document.getElementById("certs")?.scrollIntoView({ behavior: "smooth" })}>
            Certifications
          </button>

          <button onClick={() => document.getElementById("edu")?.scrollIntoView({ behavior: "smooth" })}>
            Education
          </button>

          <button onClick={() => document.getElementById("exp")?.scrollIntoView({ behavior: "smooth" })}>
            Experience
          </button>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.secBox}>
            <Shield size={16} />
            <span>Encrypted Data</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <section className={styles.statsGrid}>
            <div className={styles.card}>
              <FileText />
              <p>Skills</p>
              <h2>{stats.skills}</h2>
            </div>

            <div className={styles.card}>
              <ImageIcon />
              <p>Projects</p>
              <h2>{stats.projects}</h2>
            </div>

            <div className={styles.card}>
              <Lock />
              <p>Status</p>
              <h2 className={styles.secure}>{stats.secure}</h2>
            </div>
          </section>

          {/* user menu */}
          <div
            className={styles.userBox}
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen(!userMenuOpen);
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="user"
                className={styles.userAvatar}
              />
            ) : (
              <User />
            )}

            {userMenuOpen && (
              <div className={styles.userDropdown}>
                <button onClick={() => router.push("/profile")}>
                  <Settings size={16} /> Profile
                </button>
                <button onClick={logout}>
                  <LogOut size={16} /> Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Encryption key */}
        <section className={styles.uploadBox}>
          <div className={styles.keyRow}>
            <div>
              <h3>Encryption Key</h3>
              <p className={styles.smallText}>
                This key encrypt/decrypt About section.
              </p>
            </div>

            <input
              className={styles.keyInput}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Secret Key"
            />
          </div>
        </section>

        {/* Portfolio */}
        <section id="portfolio" className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Portfolio</h2>

          <div className={styles.grid2}>
            <input
              className={styles.input}
              placeholder="Full Name"
              value={profile.full_name}
              onChange={(e) =>
                setProfile({ ...profile, full_name: e.target.value })
              }
            />

            <input
              className={styles.input}
              placeholder="Subtitle"
              value={profile.subtitle}
              onChange={(e) =>
                setProfile({ ...profile, subtitle: e.target.value })
              }
            />
          </div>

          <textarea
            className={styles.textarea}
            placeholder="About (Encrypted)"
            value={profile.about}
            onChange={(e) => setProfile({ ...profile, about: e.target.value })}
            rows={6}
          />

          <div className={styles.aboutImageRow}>
            <label className={styles.uploadResumeBtn}>
              <Upload size={16} />
              {profileImageUploading ? "Uploading..." : "Upload About Image"}
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
                className={styles.aboutImagePreview}
              />
            ) : (
              <span className={styles.smallText}>No image</span>
            )}
          </div>

          <button
            disabled={loading}
            onClick={saveProfile}
            className={styles.primaryBtn}
          >
            <Save size={18} /> Save Portfolio
          </button>
        </section>

        {/* ✅ SOCIAL LINKS */}
        <section id="social" className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Social & Contact</h2>

          <div className={styles.grid2}>
            <input
              className={styles.input}
              placeholder="Email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
            <input
              className={styles.input}
              placeholder="Phone"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </div>

          <div className={styles.grid2}>
            <input
              className={styles.input}
              placeholder="Location"
              value={profile.location}
              onChange={(e) =>
                setProfile({ ...profile, location: e.target.value })
              }
            />
            <input
              className={styles.input}
              placeholder="Website"
              value={profile.website}
              onChange={(e) =>
                setProfile({ ...profile, website: e.target.value })
              }
            />
          </div>

          <div className={styles.grid2}>
            <input
              className={styles.input}
              placeholder="GitHub"
              value={profile.github}
              onChange={(e) =>
                setProfile({ ...profile, github: e.target.value })
              }
            />
            <input
              className={styles.input}
              placeholder="LinkedIn"
              value={profile.linkedin}
              onChange={(e) =>
                setProfile({ ...profile, linkedin: e.target.value })
              }
            />
          </div>

          <div className={styles.grid2}>
            <input
              className={styles.input}
              placeholder="Instagram"
              value={profile.instagram}
              onChange={(e) =>
                setProfile({ ...profile, instagram: e.target.value })
              }
            />
            <input
              className={styles.input}
              placeholder="Twitter/X"
              value={profile.twitter}
              onChange={(e) =>
                setProfile({ ...profile, twitter: e.target.value })
              }
            />
          </div>

          <input
            className={styles.input}
            placeholder="YouTube"
            value={profile.youtube}
            onChange={(e) =>
              setProfile({ ...profile, youtube: e.target.value })
            }
          />

          <button
            disabled={loading}
            onClick={saveProfile}
            className={styles.primaryBtn}
          >
            <Save size={18} /> Save Social
          </button>
        </section>

        {/* Resume */}
        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Resume</h2>

          <div className={styles.resumeRow}>
            <label className={styles.uploadResumeBtn}>
              <Upload size={16} />
              {uploadingResume ? "Uploading..." : "Upload Resume"}
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleResumeUpload}
                style={{ display: "none" }}
              />
            </label>

            {profile.resume_url ? (
              <a
                className={styles.resumeLink}
                href={profile.resume_url}
                target="_blank"
                rel="noreferrer"
              >
                <LinkIcon size={16} /> View
              </a>
            ) : (
              <p className={styles.smallText}>No resume</p>
            )}
          </div>
        </section>

        {/* Skills */}
        <section id="skills" className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Skills</h2>
            <button
              className={styles.secondaryBtn}
              onClick={() =>
                addRow(setSkills, {
                  title: "",
                  level: "Beginner",
                  sort_order: 0,
                })
              }
            >
              <Plus size={16} /> Add
            </button>
          </div>

          {skills.map((s, idx) => (
            <div key={s.id || idx} className={styles.row}>
              <input
                className={styles.input}
                placeholder="Skill"
                value={s.title || ""}
                onChange={(e) => {
                  const arr = [...skills];
                  arr[idx].title = e.target.value;
                  setSkills(arr);
                }}
              />
              <input
                className={styles.input}
                placeholder="Level"
                value={s.level || ""}
                onChange={(e) => {
                  const arr = [...skills];
                  arr[idx].level = e.target.value;
                  setSkills(arr);
                }}
              />
              <button
                className={styles.dangerBtn}
                onClick={() => removeRow("portfolio_skills", s.id, setSkills)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <button
            disabled={loading}
            className={styles.primaryBtn}
            onClick={() => upsertRows("portfolio_skills", skills, setSkills)}
          >
            <Save size={18} /> Save Skills
          </button>
        </section>

        {/* Projects */}
        <section id="projects" className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Projects</h2>
            <button
              className={styles.secondaryBtn}
              onClick={() =>
                addRow(setProjects, {
                  title: "",
                  description: "",
                  tech_stack: "",
                  live_url: "",
                  github_url: "",
                  image_url: "",
                })
              }
            >
              <Plus size={16} /> Add
            </button>
          </div>

          {projects.map((p, idx) => (
            <div key={p.id || idx} className={styles.projectCard}>
              <div className={styles.grid2}>
                <input
                  className={styles.input}
                  placeholder="Title"
                  value={p.title || ""}
                  onChange={(e) => {
                    const arr = [...projects];
                    arr[idx].title = e.target.value;
                    setProjects(arr);
                  }}
                />
                <input
                  className={styles.input}
                  placeholder="Tech Stack"
                  value={p.tech_stack || ""}
                  onChange={(e) => {
                    const arr = [...projects];
                    arr[idx].tech_stack = e.target.value;
                    setProjects(arr);
                  }}
                />
              </div>

              <textarea
                className={styles.textarea}
                placeholder="Description"
                value={p.description || ""}
                rows={4}
                onChange={(e) => {
                  const arr = [...projects];
                  arr[idx].description = e.target.value;
                  setProjects(arr);
                }}
              />

              <div className={styles.grid2}>
                <input
                  className={styles.input}
                  placeholder="Live URL"
                  value={p.live_url || ""}
                  onChange={(e) => {
                    const arr = [...projects];
                    arr[idx].live_url = e.target.value;
                    setProjects(arr);
                  }}
                />
                <input
                  className={styles.input}
                  placeholder="GitHub URL"
                  value={p.github_url || ""}
                  onChange={(e) => {
                    const arr = [...projects];
                    arr[idx].github_url = e.target.value;
                    setProjects(arr);
                  }}
                />
              </div>

              {/* ✅ Project Image Upload + Preview */}
              <div className={styles.projectImageRow}>
                <label className={styles.uploadResumeBtn}>
                  <Upload size={16} />
                  {uploadingProjectImgId === idx ? "Uploading..." : "Upload Image"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => uploadProjectImage(e, idx)}
                    style={{ display: "none" }}
                  />
                </label>

                {p.image_url ? (
                  <div className={styles.imagePreviewBox}>
                    <img
                      src={p.image_url}
                      alt="preview"
                      className={styles.imagePreview}
                    />
                    <a
                      className={styles.resumeLink}
                      href={p.image_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <LinkIcon size={16} /> Open
                    </a>
                  </div>
                ) : (
                  <p className={styles.smallText}>No image</p>
                )}
              </div>

              <div className={styles.actionRow}>
                <button
                  className={styles.dangerBtn}
                  onClick={() => removeRow("portfolio_projects", p.id, setProjects)}
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          ))}

          <button
            disabled={loading}
            className={styles.primaryBtn}
            onClick={() => upsertRows("portfolio_projects", projects, setProjects)}
          >
            <Save size={18} /> Save Projects
          </button>
        </section>

        {/* Certifications / Education / Experience */}
        <SectionList
          id="certs"
          title="Certifications"
          table="portfolio_certifications"
          rows={certs}
          setRows={setCerts}
          template={{ title: "", issuer: "", date: "", link: "" }}
          loading={loading}
          upsertRows={upsertRows}
          removeRow={removeRow}
        />

        <SectionList
          id="edu"
          title="Education"
          table="portfolio_education"
          rows={edu}
          setRows={setEdu}
          template={{ degree: "", institute: "", year: "", description: "" }}
          textareaKey="description"
          loading={loading}
          upsertRows={upsertRows}
          removeRow={removeRow}
        />

        <SectionList
          id="exp"
          title="Experience"
          table="portfolio_experience"
          rows={exp}
          setRows={setExp}
          template={{ role: "", company: "", duration: "", description: "" }}
          textareaKey="description"
          loading={loading}
          upsertRows={upsertRows}
          removeRow={removeRow}
        />
      </main>
    </div>
  );
}

// ✅ Reusable SectionList
function SectionList({
  id,
  title,
  table,
  rows,
  setRows,
  template,
  loading,
  upsertRows,
  removeRow,
  textareaKey,
}) {
  return (
    <section id={id} className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <button
          className={styles.secondaryBtn}
          onClick={() => setRows((prev) => [{ ...template, id: undefined }, ...prev])}
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {rows.map((r, idx) => (
        <div key={r.id || idx} className={styles.projectCard}>
          {Object.keys(template).map((key) => {
            if (textareaKey === key) {
              return (
                <textarea
                  key={key}
                  className={styles.textarea}
                  placeholder={key}
                  value={r[key] || ""}
                  rows={3}
                  onChange={(e) => {
                    const arr = [...rows];
                    arr[idx][key] = e.target.value;
                    setRows(arr);
                  }}
                />
              );
            }
            return (
              <input
                key={key}
                className={styles.input}
                placeholder={key}
                value={r[key] || ""}
                onChange={(e) => {
                  const arr = [...rows];
                  arr[idx][key] = e.target.value;
                  setRows(arr);
                }}
              />
            );
          })}

          <div className={styles.actionRow}>
            <button
              className={styles.dangerBtn}
              onClick={() => removeRow(table, r.id, setRows)}
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      ))}

      <button
        disabled={loading}
        className={styles.primaryBtn}
        onClick={() => upsertRows(table, rows, setRows)}
      >
        <Save size={18} /> Save {title}
      </button>
    </section>
  );
}
