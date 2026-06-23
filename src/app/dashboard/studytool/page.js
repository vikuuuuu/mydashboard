"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./studytool.module.css";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot,
  query, serverTimestamp, where, updateDoc, getDocs,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { logToolUsage } from "@/lib/firestore";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_SUBJECTS = ["Mathematics","Reasoning","English Language","Rajasthan Arts & Culture","General Science","History","Geography","Computer Science","Physics","Chemistry","Biology","Economics","Current Affairs","Hindi"];
const TASK_TYPES = ["Class","Revision","Practice","Mock Test","Assignment","Self Study","Group Study","Doubt Session","Lab Work","Project Work"];
const POMODORO_PRESETS = [
  { label:"Classic",   work:25, short:5  },
  { label:"Long Focus",work:50, short:10 },
  { label:"Sprint",    work:15, short:3  },
  { label:"Deep Work", work:90, short:20 },
];
const MOODS = ["😊 Happy","😤 Focused","😴 Tired","😰 Stressed","🔥 Motivated","🧘 Calm","😐 Neutral"];
const SUBJECT_COLORS = ["#4361ee","#f77f00","#e63946","#0f9d6e","#9b5de5","#f15bb5","#00bbf9","#ffd166","#06d6a0","#118ab2","#e76f51","#2a9d8f"];

// ─── AUTO NEXT-YEAR TARGET ────────────────────────────────────────────────────
const getNextYearTarget = () => {
  const now = new Date();
  const nextYear = now.getFullYear() + 1;
  return new Date(`${nextYear}-01-01T00:00:00`);
};

export default function UltraStudyHub() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState("timetable");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [toastMsg, setToastMsg] = useState(null);
  const [yearCountdown, setYearCountdown] = useState({ d:0,h:0,m:0,s:0, targetYear: getNextYearTarget().getFullYear() });

  // Timetable
  const [tasks, setTasks] = useState([]);
  const [subject, setSubject] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [taskType, setTaskType] = useState("Class");
  const [day, setDay] = useState("Monday");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [timetableSearch, setTimetableSearch] = useState("");
  const [timetableTypeFilter, setTimetableTypeFilter] = useState("all");
  const [filterDay, setFilterDay] = useState("today");
  const [fullScreenTimetable, setFullScreenTimetable] = useState(false);
  const [timetableViewMode, setTimetableViewMode] = useState("week");
  const [taskNoteInput, setTaskNoteInput] = useState("");
  const [taskColorInput, setTaskColorInput] = useState("#4361ee");
  const [repeatDays, setRepeatDays] = useState([]);

  // Subjects
  const [customSubjects, setCustomSubjects] = useState([]);
  const [newSubjectInput, setNewSubjectInput] = useState("");

  // Study Timer
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [studyFullScreen, setStudyFullScreen] = useState(false);
  const [activeSubject, setActiveSubject] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("60");
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [breakReminder, setBreakReminder] = useState(true);
  const [studyGoalMinutes, setStudyGoalMinutes] = useState(120);
  const [sessionNote, setSessionNote] = useState("");
  const [studyMood, setStudyMood] = useState("😊 Happy");
  const [studySessions, setStudySessions] = useState([]);
  const [sessionTags, setSessionTags] = useState("");

  // Pomodoro
  const [isPomodoroMode, setIsPomodoroMode] = useState(false);
  const [pomodoroPreset, setPomodoroPreset] = useState(POMODORO_PRESETS[0]);
  const [pomodoroPhase, setPomodoroPhase] = useState("work");
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [customPomWork, setCustomPomWork] = useState(25);
  const [customPomBreak, setCustomPomBreak] = useState(5);

  // Exams
  const [exams, setExams] = useState([]);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examPriority, setExamPriority] = useState("High");
  const [examSubjectsInput, setExamSubjectsInput] = useState("");
  const [examNotes, setExamNotes] = useState("");
  const [examTargetScore, setExamTargetScore] = useState("");

  // Notes
  const [quickNotes, setQuickNotes] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteTag, setNoteTag] = useState("");
  const [savedNotes, setSavedNotes] = useState([]);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [noteTagFilter, setNoteTagFilter] = useState("");

  // Flashcards
  const [flashcards, setFlashcards] = useState([]);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [newCardSubject, setNewCardSubject] = useState("");
  const [newCardTag, setNewCardTag] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewCards, setReviewCards] = useState([]);
  const [shuffleCards, setShuffleCards] = useState(false);
  const [cardSubjectFilter, setCardSubjectFilter] = useState("all");

  // Todo
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [todoSubject, setTodoSubject] = useState("");
  const [todoDue, setTodoDue] = useState("");
  const [todoPriority, setTodoPriority] = useState("Medium");
  const [todoFilter, setTodoFilter] = useState("all");
  const [todoSearch, setTodoSearch] = useState("");
  const [todoTag, setTodoTag] = useState("");

  // Analytics
  const [weeklyProgress, setWeeklyProgress] = useState([]);
  const [subjectStats, setSubjectStats] = useState({});
  const [streak, setStreak] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [currentActiveClass, setCurrentActiveClass] = useState(null);
  const [upcomingClasses, setUpcomingClasses] = useState([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [monthlyStats, setMonthlyStats] = useState([]);

  // Habits
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [habitFreq, setHabitFreq] = useState("daily");

  const fileInputRef = useRef(null);
  const studyTimerRef = useRef(null);
  const pomodoroRef = useRef(null);

  const currentDayName = DAYS[new Date().getDay()];
  const allSubjects = [...DEFAULT_SUBJECTS, ...customSubjects];

  const showToast = useCallback((msg, type = "success") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // ─── AUTO YEAR COUNTDOWN ──────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const target = getNextYearTarget();
      const diff = target - now;
      if (diff <= 0) {
        setYearCountdown({ d:0, h:0, m:0, s:0, targetYear: target.getFullYear() });
        return;
      }
      setYearCountdown({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff / 3600000) % 24),
        m: Math.floor((diff / 60000) % 60),
        s: Math.floor((diff / 1000) % 60),
        targetYear: target.getFullYear(),
      });
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) { router.replace("/login"); return; }
      setUser(u);
      setDarkMode(localStorage.getItem("studyDarkMode") === "true");
      loadCustomSubjects(u.uid);
      logToolUsage({ userId: u.uid, tool: "Study Hub", action: "visit", metadata: { version: "4.0" } });
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("studyDarkMode", darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const unsubs = [];
    const listenCol = (col, setter) => {
      const q = query(collection(db, col), where("userId", "==", uid));
      unsubs.push(onSnapshot(q, snap => setter(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    };
    listenCol("study_tasks", setTasks);
    listenCol("study_exams", setExams);
    listenCol("study_flashcards", setFlashcards);
    listenCol("study_todos", setTodos);
    listenCol("study_achievements", setAchievements);
    listenCol("study_notes", setSavedNotes);
    listenCol("study_habits", setHabits);
    const qSess = query(collection(db, "study_sessions"), where("userId", "==", uid));
    unsubs.push(onSnapshot(qSess, snap => {
      const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setStudySessions(sessions);
      calculateStats(sessions);
    }));
    return () => unsubs.forEach(u => u());
  }, [user]);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const today = DAYS[now.getDay()];
      setUpcomingClasses(tasks.filter(t => {
        if (t.day !== today) return false;
        const [h, m] = t.startTime.split(":").map(Number);
        const diff = h * 60 + m - nowMin;
        return diff > 0 && diff <= 15;
      }));
      setCurrentActiveClass(tasks.find(t => {
        if (t.day !== today) return false;
        const [sh, sm] = t.startTime.split(":").map(Number);
        const [eh, em] = t.endTime.split(":").map(Number);
        return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
      }) || null);
    };
    check();
    const i = setInterval(check, 30000);
    return () => clearInterval(i);
  }, [tasks]);

  useEffect(() => {
    if (isStudyMode) {
      studyTimerRef.current = setInterval(() => setSecondsElapsed(p => p + 1), 1000);
    } else clearInterval(studyTimerRef.current);
    return () => clearInterval(studyTimerRef.current);
  }, [isStudyMode]);

  useEffect(() => {
    if (isPomodoroMode) {
      pomodoroRef.current = setInterval(() => {
        setPomodoroSeconds(p => {
          if (p <= 1) {
            const next = pomodoroPhase === "work" ? "break" : "work";
            setPomodoroPhase(next);
            if (next === "break") setPomodoroCount(c => c + 1);
            showToast(next === "break" ? `☕ Break time! ${pomodoroPreset.short} min` : "🎯 Focus time! Let's go!", next === "break" ? "info" : "success");
            return next === "work" ? pomodoroPreset.work * 60 : pomodoroPreset.short * 60;
          }
          return p - 1;
        });
      }, 1000);
    } else clearInterval(pomodoroRef.current);
    return () => clearInterval(pomodoroRef.current);
  }, [isPomodoroMode, pomodoroPhase, pomodoroPreset, showToast]);

  // ─── ESC key exits study fullscreen ──────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape" && studyFullScreen) setStudyFullScreen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [studyFullScreen]);

  const loadCustomSubjects = async (uid) => {
    try {
      const q = query(collection(db, "custom_subjects"), where("userId", "==", uid));
      const snap = await getDocs(q);
      if (!snap.empty) setCustomSubjects(snap.docs[0].data().subjects || []);
      else {
        const s = localStorage.getItem(`customSubjects_${uid}`);
        if (s) setCustomSubjects(JSON.parse(s));
      }
    } catch (e) { console.error(e); }
  };

  const saveCustomSubjects = async (subjects) => {
    if (!user) return;
    localStorage.setItem(`customSubjects_${user.uid}`, JSON.stringify(subjects));
    try {
      const q = query(collection(db, "custom_subjects"), where("userId", "==", user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) await updateDoc(doc(db, "custom_subjects", snap.docs[0].id), { subjects, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "custom_subjects"), { userId: user.uid, subjects, createdAt: serverTimestamp() });
    } catch (e) { console.error(e); }
  };

  const addCustomSubject = () => {
    const s = newSubjectInput.trim();
    if (!s) return;
    if (allSubjects.includes(s)) { showToast("Subject already exists!", "error"); return; }
    const updated = [...customSubjects, s];
    setCustomSubjects(updated); saveCustomSubjects(updated); setNewSubjectInput("");
    showToast(`"${s}" added!`);
  };

  const deleteCustomSubject = (s) => {
    const updated = customSubjects.filter(x => x !== s);
    setCustomSubjects(updated); saveCustomSubjects(updated);
  };

  const getSubjectColor = (sub) => {
    let hash = 0;
    for (let i = 0; i < (sub || "").length; i++) hash = (sub.charCodeAt(i) + ((hash << 5) - hash));
    return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
  };

  const isTaskActive = useCallback((task) => {
    const now = new Date();
    if (task.day !== DAYS[now.getDay()]) return false;
    const [sh, sm] = task.startTime.split(":").map(Number);
    const [eh, em] = task.endTime.split(":").map(Number);
    const nowM = now.getHours() * 60 + now.getMinutes();
    return nowM >= sh * 60 + sm && nowM < eh * 60 + em;
  }, []);

  const fmt = (secs) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const fmtPom = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const getCD = (dateStr) => {
    const diff = new Date(dateStr) - currentTime;
    if (diff <= 0) return { done: true };
    return { d: Math.floor(diff / 86400000), h: Math.floor((diff / 3600000) % 24), m: Math.floor((diff / 60000) % 60), s: Math.floor((diff / 1000) % 60), done: false };
  };

  const getExamAvgDaysRemaining = () => {
    const upcoming = exams.filter(e => new Date(e.examDate) > new Date());
    if (!upcoming.length) return null;
    const avg = upcoming.reduce((sum, e) => sum + (new Date(e.examDate) - new Date()), 0) / upcoming.length;
    return Math.floor(avg / 86400000);
  };

  // ─── TIMETABLE CRUD ──────────────────────────────────────────────────────────
  const addTask = async () => {
    if (!subject || !startTime || !endTime || !user) { showToast("Please fill all required fields!", "error"); return; }
    if (startTime >= endTime) { showToast("End time must be after start time!", "error"); return; }
    const daysToAdd = repeatDays.length > 0 ? repeatDays : [day];
    for (const d of daysToAdd) {
      await addDoc(collection(db, "study_tasks"), {
        userId: user.uid, subject, startTime, endTime, taskType, day: d,
        color: taskColorInput || getSubjectColor(subject), notes: taskNoteInput, createdAt: serverTimestamp(),
      });
    }
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "add_task", resourceName: subject, metadata: { days: daysToAdd, taskType } });
    setSubject(""); setStartTime(""); setEndTime(""); setTaskNoteInput(""); setRepeatDays([]);
    showToast(`Slot added${daysToAdd.length > 1 ? ` for ${daysToAdd.length} days` : ""} ✅`);
  };

  const deleteTask = async (id) => {
    await deleteDoc(doc(db, "study_tasks", id));
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "delete_task", resourceId: id });
    showToast("Slot deleted");
  };

  const saveEditTask = async (id) => {
    await updateDoc(doc(db, "study_tasks", id), editForm);
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "edit_task", resourceId: id });
    setEditingTaskId(null); setEditForm({}); showToast("Slot updated!");
  };

  const duplicateTask = async (task) => {
    await addDoc(collection(db, "study_tasks"), {
      userId: user.uid, subject: task.subject, startTime: task.startTime,
      endTime: task.endTime, taskType: task.taskType, day: task.day,
      color: task.color, notes: task.notes || "", createdAt: serverTimestamp(),
    });
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "duplicate_task", resourceName: task.subject });
    showToast("Slot duplicated!");
  };

  const exportTimetable = (format = "json") => {
    if (format === "json") {
      const data = { tasks, customSubjects, exportedAt: new Date().toISOString(), version: "4.0" };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `timetable-${new Date().toISOString().split("T")[0]}.json`;
      a.click(); showToast("JSON exported! ✅");
    } else {
      const headers = ["Day","Subject","Start","End","Type","Color","Notes"];
      const rows = tasks.map(t => [t.day, t.subject, t.startTime, t.endTime, t.taskType, t.color || "", t.notes || ""]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `timetable-${new Date().toISOString().split("T")[0]}.csv`;
      a.click(); showToast("CSV exported! ✅");
    }
    logToolUsage({ userId: user?.uid, tool: "Study Hub", action: "export_timetable", metadata: { format } });
  };

  const importTimetable = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isCSV = file.name.endsWith(".csv");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let count = 0;
      try {
        if (isCSV) {
          const lines = ev.target.result.split("\n").slice(1);
          for (const line of lines) {
            const parts = line.split(",").map(s => s?.replace(/"/g, "").trim());
            const [d, sub, st, et, tt, col, notes] = parts;
            if (!d || !sub || !st || !et) continue;
            await addDoc(collection(db, "study_tasks"), {
              userId: user.uid, subject: sub, startTime: st, endTime: et,
              taskType: tt || "Class", day: d, color: col || getSubjectColor(sub),
              notes: notes || "", createdAt: serverTimestamp(),
            });
            count++;
          }
        } else {
          const data = JSON.parse(ev.target.result);
          if (!data.tasks) { showToast("Invalid file format!", "error"); return; }
          for (const t of data.tasks) {
            await addDoc(collection(db, "study_tasks"), {
              userId: user.uid, subject: t.subject || "Untitled",
              startTime: t.startTime || "09:00", endTime: t.endTime || "10:00",
              taskType: t.taskType || "Class", day: t.day || "Monday",
              color: t.color || getSubjectColor(t.subject || ""),
              notes: t.notes || "", createdAt: serverTimestamp(),
            });
            count++;
          }
          if (data.customSubjects?.length) {
            const merged = [...new Set([...customSubjects, ...data.customSubjects])];
            setCustomSubjects(merged); saveCustomSubjects(merged);
          }
        }
        await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "import_timetable", metadata: { count, format: isCSV ? "csv" : "json" } });
        showToast(`✅ ${count} slots imported!`);
      } catch (err) { showToast("❌ Import failed!", "error"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const startStudyMode = async () => {
    if (!activeSubject) { showToast("Please select a subject!", "error"); return; }
    setSecondsElapsed(0);
    setIsStudyMode(true);
    setStudyFullScreen(true);
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "start_study_session", resourceName: activeSubject, metadata: { targetMinutes, mood: studyMood } });
    showToast(`📚 Study session started: ${activeSubject}`);
  };

  const stopStudyMode = async () => {
    setIsStudyMode(false);
    setStudyFullScreen(false);
    const actualMins = Math.round(secondsElapsed / 60);
    const expected = parseInt(targetMinutes) || 1;
    const accuracy = Math.min(Math.round((actualMins / expected) * 100), 100);
    try {
      await addDoc(collection(db, "study_sessions"), {
        userId: user.uid, subjectName: activeSubject, targetTime: expected,
        actualTime: actualMins, accuracyPercentage: accuracy,
        mood: studyMood, notes: sessionNote, tags: sessionTags, createdAt: serverTimestamp(),
      });
      await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "stop_study_session", resourceName: activeSubject, metadata: { actualMins, accuracy, mood: studyMood } });
      showToast(`🎉 Session saved! Accuracy: ${accuracy}%`);
    } catch (e) { showToast("Error saving session", "error"); }
    setSecondsElapsed(0); setSessionNote(""); setSessionTags("");
  };

  const calculateStats = (sessions) => {
    const today = new Date();
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toLocaleDateString();
      const mins = sessions.filter(s => {
        const sd = s.createdAt?.toDate?.() || new Date(s.createdAt);
        return sd.toLocaleDateString() === ds;
      }).reduce((sum, s) => sum + (s.actualTime || 0), 0);
      last7.push({ day: DAYS[d.getDay()].slice(0, 3), minutes: mins });
    }
    setWeeklyProgress(last7);

    const monthly = {};
    sessions.forEach(s => {
      const d = s.createdAt?.toDate?.() || new Date(s.createdAt);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[k]) monthly[k] = { mins: 0, sessions: 0 };
      monthly[k].mins += s.actualTime || 0;
      monthly[k].sessions += 1;
    });
    setMonthlyStats(Object.entries(monthly).slice(-6).map(([k, v]) => ({ month: k, ...v })));

    const sm = {};
    sessions.forEach(s => {
      if (!sm[s.subjectName]) sm[s.subjectName] = { totalTime: 0, sessions: 0, totalAcc: 0, lastStudied: null };
      sm[s.subjectName].totalTime += s.actualTime || 0;
      sm[s.subjectName].sessions += 1;
      sm[s.subjectName].totalAcc += s.accuracyPercentage || 0;
      const d = s.createdAt?.toDate?.() || new Date(s.createdAt);
      if (!sm[s.subjectName].lastStudied || d > sm[s.subjectName].lastStudied) sm[s.subjectName].lastStudied = d;
    });
    Object.keys(sm).forEach(k => { sm[k].avgAccuracy = Math.round(sm[k].totalAcc / sm[k].sessions); });
    setSubjectStats(sm);

    const sorted = sessions.filter(s => s.createdAt).sort((a, b) => {
      const da = a.createdAt.toDate?.() || new Date(a.createdAt);
      const db2 = b.createdAt.toDate?.() || new Date(b.createdAt);
      return db2 - da;
    });
    if (!sorted.length) { setStreak(0); return; }
    let st = 1, last = sorted[0].createdAt.toDate?.() || new Date(sorted[0].createdAt);
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i].createdAt.toDate?.() || new Date(sorted[i].createdAt);
      if (Math.floor((last - cur) / 86400000) === 1) { st++; last = cur; } else break;
    }
    setStreak(st);
  };

  const addExam = async () => {
    if (!examName || !examDate) { showToast("Exam name and date are required!", "error"); return; }
    await addDoc(collection(db, "study_exams"), {
      userId: user.uid, examName, examDate, priority: examPriority,
      subjects: examSubjectsInput, notes: examNotes,
      targetScore: examTargetScore || "", createdAt: serverTimestamp()
    });
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "add_exam", resourceName: examName, metadata: { examDate, priority: examPriority } });
    setExamName(""); setExamDate(""); setExamSubjectsInput(""); setExamNotes(""); setExamTargetScore("");
    showToast(`🎯 "${examName}" added!`);
  };
  const deleteExam = async (id) => {
    await deleteDoc(doc(db, "study_exams", id));
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "delete_exam", resourceId: id });
    showToast("Exam deleted");
  };

  const saveNote = async () => {
    if (!quickNotes) { showToast("Please write something!", "error"); return; }
    if (editingNoteId) {
      await updateDoc(doc(db, "study_notes", editingNoteId), { title: noteTitle || "Untitled", content: quickNotes, tag: noteTag, updatedAt: serverTimestamp() });
      await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "edit_note", resourceId: editingNoteId, resourceName: noteTitle });
      setEditingNoteId(null); showToast("Note updated!");
    } else {
      await addDoc(collection(db, "study_notes"), { userId: user.uid, title: noteTitle || "Untitled", content: quickNotes, tag: noteTag, createdAt: serverTimestamp() });
      await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "add_note", resourceName: noteTitle || "Untitled" });
      showToast("Note saved! 📝");
    }
    setQuickNotes(""); setNoteTitle(""); setNoteTag("");
  };
  const deleteNote = async (id) => {
    await deleteDoc(doc(db, "study_notes", id));
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "delete_note", resourceId: id });
    showToast("Note deleted");
  };
  const editNote = (note) => { setNoteTitle(note.title); setQuickNotes(note.content); setNoteTag(note.tag || ""); setEditingNoteId(note.id); setActiveTab("notes"); };

  const addFlashcard = async () => {
    if (!newFront || !newBack) { showToast("Please fill front and back!", "error"); return; }
    await addDoc(collection(db, "study_flashcards"), { userId: user.uid, front: newFront, back: newBack, subject: newCardSubject || "General", tag: newCardTag, reviewCount: 0, confidence: 0, createdAt: serverTimestamp() });
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "add_flashcard", resourceName: newCardSubject || "General" });
    setNewFront(""); setNewBack(""); showToast("Flashcard added! 🗂️");
  };
  const deleteFlashcard = async (id) => {
    await deleteDoc(doc(db, "study_flashcards", id));
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "delete_flashcard", resourceId: id });
    showToast("Flashcard deleted");
  };
  const startReview = (subjectFilter = "all") => {
    let cards = subjectFilter === "all" ? [...flashcards] : flashcards.filter(f => f.subject === subjectFilter);
    if (shuffleCards) cards = cards.sort(() => Math.random() - 0.5);
    setReviewCards(cards); setReviewIndex(0); setShowAnswer(false); setReviewMode(true);
    logToolUsage({ userId: user.uid, tool: "Study Hub", action: "start_flashcard_review", metadata: { count: cards.length, subjectFilter } });
  };
  const rateCard = async (id, confidence) => {
    const card = flashcards.find(f => f.id === id);
    await updateDoc(doc(db, "study_flashcards", id), { confidence, reviewCount: (card?.reviewCount || 0) + 1, lastReviewed: serverTimestamp() });
    if (reviewIndex < reviewCards.length - 1) { setReviewIndex(reviewIndex + 1); setShowAnswer(false); }
    else { setReviewMode(false); showToast(`🎉 Review complete! ${reviewCards.length} cards reviewed`); }
  };

  const addTodo = async () => {
    if (!newTodo) { showToast("Please write a todo!", "error"); return; }
    await addDoc(collection(db, "study_todos"), { userId: user.uid, text: newTodo, subject: todoSubject, dueDate: todoDue, priority: todoPriority, tag: todoTag, completed: false, createdAt: serverTimestamp() });
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "add_todo", resourceName: newTodo.slice(0, 50), metadata: { priority: todoPriority } });
    setNewTodo(""); setTodoDue(""); setTodoSubject(""); setTodoTag("");
    showToast("Todo added! ✅");
  };
  const toggleTodo = async (id, completed) => {
    await updateDoc(doc(db, "study_todos", id), { completed: !completed });
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: completed ? "uncomplete_todo" : "complete_todo", resourceId: id });
  };
  const deleteTodo = async (id) => {
    await deleteDoc(doc(db, "study_todos", id));
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "delete_todo", resourceId: id });
    showToast("Todo deleted");
  };

  // ─── HABITS ──────────────────────────────────────────────────────────────────
  const addHabit = async () => {
    if (!newHabit.trim() || !user) return;
    try {
      await addDoc(collection(db, "study_habits"), {
        userId: user.uid, text: newHabit.trim(), freq: habitFreq,
        completedDates: [], createdAt: serverTimestamp()
      });
      await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "add_habit", resourceName: newHabit.trim(), metadata: { freq: habitFreq } });
      setNewHabit("");
      showToast("Habit added! 🌱");
    } catch (e) { showToast("Error adding habit", "error"); }
  };

  const toggleHabit = async (id) => {
    if (!user) return;
    const today = new Date().toDateString();
    const habitToToggle = habits.find(h => h.id === id);
    if (!habitToToggle) return;
    const isDoneToday = habitToToggle.completedDates.includes(today);
    const updatedDates = isDoneToday
      ? habitToToggle.completedDates.filter(d => d !== today)
      : [...habitToToggle.completedDates, today];
    try {
      await updateDoc(doc(db, "study_habits", id), { completedDates: updatedDates });
      await logToolUsage({ userId: user.uid, tool: "Study Hub", action: isDoneToday ? "uncheck_habit" : "check_habit", resourceId: id, resourceName: habitToToggle.text });
    } catch (e) { showToast("Error updating habit", "error"); }
  };

  const deleteHabit = async (id) => {
    try {
      await deleteDoc(doc(db, "study_habits", id));
      await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "delete_habit", resourceId: id });
      showToast("Habit deleted");
    } catch (e) { showToast("Error deleting habit", "error"); }
  };

  // ─── COMPUTED VALUES ──────────────────────────────────────────────────────────
  const totalStudiedMins = studySessions.reduce((a, s) => a + (s.actualTime || 0), 0);
  const avgAccuracy = studySessions.length ? Math.round(studySessions.reduce((a, s) => a + (s.accuracyPercentage || 0), 0) / studySessions.length) : 0;
  const todayStudied = studySessions.filter(s => {
    const d = s.createdAt?.toDate?.() || new Date(s.createdAt);
    return d.toDateString() === new Date().toDateString();
  }).reduce((a, s) => a + (s.actualTime || 0), 0);

  const filteredTasks = tasks.filter(t => {
    const matchDay = filterDay === "today" ? t.day === currentDayName : filterDay === "week" ? true : t.day === filterDay;
    const matchSearch = !timetableSearch || t.subject.toLowerCase().includes(timetableSearch.toLowerCase());
    const matchType = timetableTypeFilter === "all" || t.taskType === timetableTypeFilter;
    return matchDay && matchSearch && matchType;
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const filteredNotes = savedNotes.filter(n => {
    const matchSearch = !noteSearch || n.title?.toLowerCase().includes(noteSearch.toLowerCase()) || n.content?.toLowerCase().includes(noteSearch.toLowerCase());
    const matchTag = !noteTagFilter || n.tag === noteTagFilter;
    return matchSearch && matchTag;
  });

  const filteredTodos = todos.filter(t => {
    if (todoFilter === "pending") return !t.completed;
    if (todoFilter === "done") return t.completed;
    return !todoSearch || t.text.toLowerCase().includes(todoSearch.toLowerCase());
  }).sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority || "Medium"] - { High: 0, Medium: 1, Low: 2 }[b.priority || "Medium"]));

  const allNoteTags = [...new Set(savedNotes.map(n => n.tag).filter(Boolean))];
  const allCardSubjects = [...new Set(flashcards.map(f => f.subject).filter(Boolean))];
  const filteredFlashcards = cardSubjectFilter === "all" ? flashcards : flashcards.filter(f => f.subject === cardSubjectFilter);
  const avgExamDays = getExamAvgDaysRemaining();
  const upcomingExams = exams.filter(e => new Date(e.examDate) > new Date());

  // ─── YEAR PROGRESS ────────────────────────────────────────────────────────────
  const currentYear = currentTime.getFullYear();
  const yearStart = new Date(`${currentYear}-01-01`);
  const yearEnd = new Date(`${currentYear + 1}-01-01`);
  const yearPct = Math.round(((currentTime - yearStart) / (yearEnd - yearStart)) * 100);

  // ─── FULLSCREEN STUDY MODE ────────────────────────────────────────────────────
  if (studyFullScreen && isStudyMode) {
    const pct = Math.min((secondsElapsed / (parseInt(targetMinutes) * 60)) * 100, 100);
    const circumference = 2 * Math.PI * 90;
    return (
      <div className={styles.studyFsOverlay}>
        <div className={styles.studyFsContent}>
          <div className={styles.studyFsHeader}>
            <div className={styles.studyFsSubjectBadge} style={{ background: getSubjectColor(activeSubject) }}>
              📚 {activeSubject}
            </div>
            <div className={styles.studyFsMoodBadge}>{studyMood}</div>
            <button className={styles.studyFsEsc} onClick={() => setStudyFullScreen(false)} title="Minimize (Esc)">⤡ Minimize</button>
          </div>

          <div className={styles.studyFsRing}>
            <svg width="220" height="220" viewBox="0 0 220 220">
              <circle cx="110" cy="110" r="90" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
              <circle
                cx="110" cy="110" r="90" fill="none"
                stroke="url(#studyGrad)" strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (pct / 100) * circumference}
                transform="rotate(-90 110 110)"
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
              <defs>
                <linearGradient id="studyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <div className={styles.studyFsRingInner}>
              <div className={styles.studyFsTimer}>{fmt(secondsElapsed)}</div>
              <div className={styles.studyFsTimerLabel}>Elapsed</div>
              <div className={styles.studyFsPct}>{Math.round(pct)}%</div>
            </div>
          </div>

          <div className={styles.studyFsStats}>
            <div className={styles.studyFsStat}>
              <span className={styles.studyFsStatVal}>{targetMinutes}</span>
              <span className={styles.studyFsStatLbl}>Target (min)</span>
            </div>
            <div className={styles.studyFsStat}>
              <span className={styles.studyFsStatVal}>{Math.round(secondsElapsed / 60)}</span>
              <span className={styles.studyFsStatLbl}>Done (min)</span>
            </div>
            <div className={styles.studyFsStat}>
              <span className={styles.studyFsStatVal}>{Math.max(0, parseInt(targetMinutes) - Math.round(secondsElapsed / 60))}</span>
              <span className={styles.studyFsStatLbl}>Remaining</span>
            </div>
          </div>

          <div className={styles.studyFsNoteArea}>
            <textarea
              placeholder="Add session notes..."
              value={sessionNote}
              onChange={e => setSessionNote(e.target.value)}
              className={styles.studyFsNote}
            />
            <input
              placeholder="Tags (e.g. exam-prep, chapter-5)"
              value={sessionTags}
              onChange={e => setSessionTags(e.target.value)}
              className={styles.studyFsTagInput}
            />
          </div>

          <div className={styles.studyFsActions}>
            <button onClick={stopStudyMode} className={styles.studyFsStop}>
              ⏹ Stop & Save Session
            </button>
            <button onClick={() => setStudyFullScreen(false)} className={styles.studyFsMin}>
              ⤡ Minimize
            </button>
          </div>

          <div className={styles.studyFsBreakHint}>
            {breakReminder && secondsElapsed > 0 && secondsElapsed % 1500 < 5
              ? "☕ Time for a short break! You've been studying for 25 minutes."
              : `🔥 Stay focused! ${streak} day streak going strong.`
            }
          </div>
        </div>
      </div>
    );
  }

  // ─── FULLSCREEN TIMETABLE ──────────────────────────────────────────────────
  if (fullScreenTimetable) {
    const grouped = {};
    DAYS.forEach(d => { grouped[d] = tasks.filter(t => t.day === d).sort((a, b) => a.startTime.localeCompare(b.startTime)); });
    return (
      <div className={styles.fullScreenOverlay}>
        <div className={styles.fullScreenContent}>
          <div className={styles.fullScreenHeader}>
            <h1>📅 Weekly Timetable</h1>
            <div className={styles.fullScreenControls}>
              <button className={styles.smBtn} onClick={() => setTimetableViewMode(v => v === "week" ? "day" : "week")}>
                {timetableViewMode === "week" ? "📋 Day View" : "📊 Week View"}
              </button>
              <button className={styles.smBtn} onClick={() => exportTimetable("csv")}>⬇ CSV</button>
              <button className={styles.smBtn} onClick={() => exportTimetable("json")}>⬇ JSON</button>
              <button className={styles.closeFullScreen} onClick={() => setFullScreenTimetable(false)}>✕ Close</button>
            </div>
          </div>
          {timetableViewMode === "week" ? (
            <div className={styles.weekViewGrid}>
              {DAYS.map(d => (
                <div key={d} className={`${styles.dayColumn} ${d === currentDayName ? styles.todayColumn : ""}`}>
                  <h3>{d.slice(0, 3)}</h3>
                  <div className={styles.daySlots}>
                    {grouped[d].length === 0 ? <p className={styles.noSlots}>Free 🎉</p> :
                      grouped[d].map(t => (
                        <div key={t.id} className={`${styles.fullScreenSlot} ${isTaskActive(t) ? styles.activeSlot : ""}`}
                          style={{ borderLeft: `4px solid ${t.color || getSubjectColor(t.subject)}` }}>
                          <span className={styles.slotTime}>{t.startTime}–{t.endTime}</span>
                          <h4>{t.subject}</h4>
                          <span className={styles.slotType}>{t.taskType}</span>
                          {t.notes && <p className={styles.slotNote}>📌 {t.notes}</p>}
                          {isTaskActive(t) && <div className={styles.liveIndicator}>● LIVE NOW</div>}
                        </div>
                      ))
                    }
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.dayViewContainer}>
              <h2>{currentDayName}'s Schedule</h2>
              {grouped[currentDayName].length === 0 ? <p className={styles.emptyState}>No classes today 🎉</p> :
                grouped[currentDayName].map(t => (
                  <div key={t.id} className={`${styles.dayViewSlot} ${isTaskActive(t) ? styles.activeSlot : ""}`}
                    style={{ borderLeft: `6px solid ${t.color || getSubjectColor(t.subject)}` }}>
                    <div className={styles.slotTimeBlock}>
                      <span className={styles.slotStartTime}>{t.startTime}</span>
                      <span className={styles.slotEndTime}> → {t.endTime}</span>
                    </div>
                    <div className={styles.slotContent}>
                      <h3>{t.subject}</h3>
                      <span className={styles.slotTypeBadge}>{t.taskType}</span>
                      {t.notes && <p className={styles.slotNote}>📌 {t.notes}</p>}
                    </div>
                    {isTaskActive(t) && <div className={styles.liveIndicatorLarge}>🔴 LIVE NOW</div>}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── MAIN RENDER ──────────────────────────────────────────────────────────────
  return (
    <div className={`${styles.page} ${darkMode ? styles.darkMode : ""}`}>
      {toastMsg && <div className={`${styles.toast} ${styles[`toast_${toastMsg.type}`]}`}>{toastMsg.msg}</div>}

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push("/dashboard")}>← Back</button>
        <div className={styles.leftControls}>
          <button className={`${styles.controlBtn} ${darkMode ? styles.controlBtnActive : ""}`} onClick={() => setDarkMode(p => !p)} title={darkMode ? "Light Mode" : "Dark Mode"}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button className={`${styles.controlBtn} ${!notificationsEnabled ? styles.controlBtnMuted : ""}`} onClick={() => setNotificationsEnabled(p => !p)} title="Toggle Notifications">
            {notificationsEnabled ? "🔔" : "🔕"}
          </button>
          {isStudyMode && (
            <button className={styles.controlBtnLive} onClick={() => setStudyFullScreen(true)} title="Open Study Fullscreen">
              ⚡ Live Session
            </button>
          )}
        </div>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Study Hub <span className={styles.vBadge}>v4.0</span></h1>
          <p className={styles.subtitle}>{currentTime.toLocaleTimeString("en-IN")} • {currentDayName}, {currentTime.toLocaleDateString("en-IN")}</p>
        </div>
      </div>

      {/* ── YEAR COUNTDOWN BANNER ── */}
      <div className={styles.yearCountdownBanner}>
        <div className={styles.yearCountdownLeft}>
          <span className={styles.yearIcon}>🗓️</span>
          <div>
            <div className={styles.yearLabel}>{currentYear} → {yearCountdown.targetYear} Countdown</div>
            <div className={styles.yearSub}>Days remaining until New Year {yearCountdown.targetYear}</div>
          </div>
        </div>
        <div className={styles.yearCountdownUnits}>
          {[
            { v: yearCountdown.d, l: "Days" },
            { v: yearCountdown.h, l: "Hours" },
            { v: yearCountdown.m, l: "Mins" },
            { v: yearCountdown.s, l: "Secs" },
          ].map(({ v, l }) => (
            <div key={l} className={styles.yearUnit}>
              <span className={styles.yearUnitNum}>{String(v).padStart(2, "0")}</span>
              <span className={styles.yearUnitLabel}>{l}</span>
            </div>
          ))}
        </div>
        <div className={styles.yearProgress}>
          <div className={styles.yearProgressLabel}>{currentYear} Progress</div>
          <div className={styles.yearProgressBar}>
            <div className={styles.yearProgressFill} style={{ width: `${yearPct}%` }} />
          </div>
          <div className={styles.yearProgressPct}>{yearPct}% of {currentYear} complete</div>
        </div>
      </div>

      {/* ── ALERTS ── */}
      {upcomingClasses.length > 0 && (
        <div className={styles.upcomingAlert}>
          ⏰ <span><strong>In 15 minutes:</strong> {upcomingClasses[0].subject} at {upcomingClasses[0].startTime}</span>
        </div>
      )}
      {currentActiveClass && (
        <div className={styles.activeClassBanner}>
          <span className={styles.pulseIcon}>🔴</span>
          <div><h3>LIVE: {currentActiveClass.subject}</h3><p>{currentActiveClass.startTime}–{currentActiveClass.endTime} • {currentActiveClass.taskType}</p></div>
          <button className={styles.autoModeBadge} onClick={() => { setActiveSubject(currentActiveClass.subject); setActiveTab("study"); }}>▶ Start Session</button>
        </div>
      )}

      {/* ── STREAK BANNER ── */}
      <div className={styles.streakBanner}>
        <div className={styles.streakItem}>🔥<div><span className={styles.streakNumber}>{streak}</span><span className={styles.streakLabel}>Day Streak</span></div></div>
        <div className={styles.streakItem}>🎯<div><span className={styles.streakNumber}>{todayStudied}/{studyGoalMinutes}</span><span className={styles.streakLabel}>Today (min)</span></div></div>
        <div className={styles.streakItem}>🏆<div><span className={styles.streakNumber}>{achievements.length}</span><span className={styles.streakLabel}>Achievements</span></div></div>
        <div className={styles.streakItem}>📅<div><span className={styles.streakNumber}>{tasks.length}</span><span className={styles.streakLabel}>Slots</span></div></div>
        <div className={styles.progressBarContainer}><div className={styles.progressBar} style={{ width: `${Math.min((todayStudied / studyGoalMinutes) * 100, 100)}%` }} /></div>
      </div>

      {/* ── STATS GRID ── */}
      <div className={styles.statsGrid}>
        {[
          { icon: "⏱️", val: `${Math.floor(totalStudiedMins / 60)}h ${totalStudiedMins % 60}m`, lbl: "Total Studied" },
          { icon: "🎯", val: `${avgAccuracy}%`, lbl: "Avg Accuracy" },
          { icon: "📚", val: studySessions.length, lbl: "Sessions" },
          { icon: "✅", val: `${todos.filter(t => t.completed).length}/${todos.length}`, lbl: "Todos Done" },
          { icon: "🗂️", val: flashcards.length, lbl: "Flashcards" },
          { icon: "📝", val: savedNotes.length, lbl: "Notes Saved" },
        ].map(({ icon, val, lbl }) => (
          <div key={lbl} className={styles.statCard}>
            <span className={styles.statIcon}>{icon}</span>
            <div><span className={styles.statValue}>{val}</span><span className={styles.statLabel}>{lbl}</span></div>
          </div>
        ))}
      </div>

      {/* ── EXAM QUICK BAR ── */}
      {upcomingExams.length > 0 && (
        <div className={styles.examQuickBar}>
          <div className={styles.examQuickInfo}>
            <span className={styles.examQuickIcon}>📋</span>
            <div>
              <span className={styles.examQuickTitle}>{upcomingExams.length} Upcoming Exam{upcomingExams.length > 1 ? "s" : ""}</span>
              {avgExamDays !== null && <span className={styles.examQuickAvg}>Avg {avgExamDays} days remaining</span>}
            </div>
          </div>
          <div className={styles.examQuickList}>
            {upcomingExams.slice(0, 3).map(e => {
              const cd = getCD(e.examDate);
              return (
                <div key={e.id} className={styles.examQuickChip}>
                  <span>{e.examName}</span>
                  {!cd.done && <span className={styles.examQuickDays}>{cd.d}d left</span>}
                </div>
              );
            })}
            {upcomingExams.length > 3 && <span className={styles.examQuickMore}>+{upcomingExams.length - 3} more</span>}
          </div>
          <button className={styles.smBtn} onClick={() => setActiveTab("exams")}>View All →</button>
        </div>
      )}

      {/* ── TAB NAV ── */}
      <div className={styles.tabNav}>
        {[
          { id: "timetable", label: "📅 Timetable" },
          { id: "study", label: "⏱️ Study Mode" },
          { id: "analytics", label: "📊 Analytics" },
          { id: "exams", label: "🎯 Exams" },
          { id: "notes", label: "📝 Notes" },
          { id: "flashcards", label: "🗂️ Flashcards" },
          { id: "todo", label: "✅ Todo" },
          { id: "habits", label: "🌱 Habits" },
        ].map(t => (
          <button key={t.id} className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabActive : ""}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ══════ TIMETABLE ══════ */}
      {activeTab === "timetable" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span>📅</span><h2>Smart Timetable</h2>
            <div className={styles.cardHeadRight}>
              <button className={styles.smBtn} onClick={() => setFullScreenTimetable(true)}>🔲 Full View</button>
              <button className={styles.smBtn} onClick={() => exportTimetable("json")}>⬇ JSON</button>
              <button className={styles.smBtn} onClick={() => exportTimetable("csv")}>⬇ CSV</button>
              <button className={`${styles.smBtn} ${styles.smBtnGreen}`} onClick={() => fileInputRef.current?.click()}>⬆ Import</button>
              <input ref={fileInputRef} type="file" accept=".json,.csv" style={{ display: "none" }} onChange={importTimetable} />
            </div>
          </div>
          <div className={styles.timetableForm}>
            <select value={day} onChange={e => setDay(e.target.value)} className={styles.formSelect}>{DAYS.map(d => <option key={d}>{d}</option>)}</select>
            <select value={subject} onChange={e => setSubject(e.target.value)} className={styles.formSelect}>
              <option value="">-- Select Subject --</option>
              {allSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={taskType} onChange={e => setTaskType(e.target.value)} className={styles.formSelect}>{TASK_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={styles.formInput} />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={styles.formInput} />
            <input type="color" value={taskColorInput} onChange={e => setTaskColorInput(e.target.value)} className={styles.colorPicker} title="Slot color" />
            <button onClick={addTask} className={styles.addBtn}>+ Add Slot</button>
          </div>
          <div className={styles.advancedForm}>
            <input placeholder="Slot notes (optional)" value={taskNoteInput} onChange={e => setTaskNoteInput(e.target.value)} className={styles.formInput} style={{ flex: 1 }} />
            <div className={styles.repeatRow}>
              <span className={styles.repeatLabel}>Repeat on:</span>
              {DAYS.slice(1, 6).map(d => (
                <button key={d} className={`${styles.repeatDay} ${repeatDays.includes(d) ? styles.repeatDayActive : ""}`}
                  onClick={() => setRepeatDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])}>
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.subjectManager}>
            <input type="text" placeholder="Add custom subject..." value={newSubjectInput} onChange={e => setNewSubjectInput(e.target.value)} onKeyPress={e => e.key === "Enter" && addCustomSubject()} className={styles.formInput} />
            <button onClick={addCustomSubject} className={styles.smBtn}>+ Subject</button>
            {customSubjects.map(s => (
              <div key={s} className={styles.subjectChip} style={{ background: getSubjectColor(s) }}>
                {s}<button onClick={() => deleteCustomSubject(s)} className={styles.chipDel}>✕</button>
              </div>
            ))}
          </div>
          <div className={styles.filterRow}>
            <input placeholder="🔍 Search slots..." value={timetableSearch} onChange={e => setTimetableSearch(e.target.value)} className={styles.searchInput} />
            <div className={styles.filterBtns}>
              {["today", "week", ...DAYS].map(f => (
                <button key={f} className={`${styles.filterChip} ${filterDay === f ? styles.filterChipActive : ""}`} onClick={() => setFilterDay(f)}>
                  {f === "today" ? "Today" : f === "week" ? "All Week" : f.slice(0, 3)}
                </button>
              ))}
            </div>
            <select value={timetableTypeFilter} onChange={e => setTimetableTypeFilter(e.target.value)} className={styles.formSelect}>
              <option value="all">All Types</option>
              {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.resultCount}>
            📋 {filteredTasks.length} slots • {[...new Set(filteredTasks.map(t => t.subject))].length} subjects
          </div>
          <div className={styles.taskList}>
            {filteredTasks.length === 0 ? <p className={styles.emptyState}>No slots found. Add one above!</p> :
              filteredTasks.map(task => (
                <div key={task.id} className={`${styles.taskCard} ${isTaskActive(task) ? styles.activeTaskCard : ""}`}
                  style={{ borderLeft: `4px solid ${task.color || getSubjectColor(task.subject)}` }}>
                  {editingTaskId === task.id ? (
                    <div className={styles.editFormInline}>
                      <select defaultValue={task.subject} onChange={e => setEditForm(p => ({ ...p, subject: e.target.value }))} className={styles.formSelect}>{allSubjects.map(s => <option key={s}>{s}</option>)}</select>
                      <select defaultValue={task.day} onChange={e => setEditForm(p => ({ ...p, day: e.target.value }))} className={styles.formSelect}>{DAYS.map(d => <option key={d}>{d}</option>)}</select>
                      <input type="time" defaultValue={task.startTime} onChange={e => setEditForm(p => ({ ...p, startTime: e.target.value }))} className={styles.formInput} />
                      <input type="time" defaultValue={task.endTime} onChange={e => setEditForm(p => ({ ...p, endTime: e.target.value }))} className={styles.formInput} />
                      <select defaultValue={task.taskType} onChange={e => setEditForm(p => ({ ...p, taskType: e.target.value }))} className={styles.formSelect}>{TASK_TYPES.map(t => <option key={t}>{t}</option>)}</select>
                      <input placeholder="Notes..." defaultValue={task.notes || ""} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} className={styles.formInput} />
                      <button onClick={() => saveEditTask(task.id)} className={styles.smBtn}>✓ Save</button>
                      <button onClick={() => setEditingTaskId(null)} className={styles.smBtn}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div className={styles.taskInfo}>
                        <div className={styles.taskTop}>
                          <span className={styles.typeBadge}>{task.taskType}</span>
                          <span className={styles.dayBadge}>{task.day}</span>
                          {isTaskActive(task) && <span className={styles.liveTag}>● LIVE</span>}
                        </div>
                        <h3>{task.subject}</h3>
                        <p>⏰ {task.startTime} – {task.endTime}</p>
                        {task.notes && <p className={styles.taskNote}>📌 {task.notes}</p>}
                      </div>
                      <div className={styles.taskActions}>
                        <button onClick={() => { setActiveSubject(task.subject); setActiveTab("study"); }} className={styles.iconBtnSm} title="Start Study">▶</button>
                        <button onClick={() => { setEditingTaskId(task.id); setEditForm({}); }} className={styles.iconBtnSm}>✏️</button>
                        <button onClick={() => duplicateTask(task)} className={styles.iconBtnSm}>⎘</button>
                        <button onClick={() => deleteTask(task.id)} className={`${styles.iconBtnSm} ${styles.iconBtnDanger}`}>🗑</button>
                      </div>
                    </>
                  )}
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ══════ STUDY MODE ══════ */}
      {activeTab === "study" && (
        <div className={styles.studyGrid}>
          <div className={`${styles.card} ${isStudyMode ? styles.activeStudyPulse : ""}`}>
            <div className={styles.cardHead}>
              <span>⏱️</span>
              <h2>{isStudyMode ? "⚡ LIVE — Session Running" : "Study Timer"}</h2>
              {isStudyMode && (
                <button className={styles.fsBtnInline} onClick={() => setStudyFullScreen(true)}>⤢ Fullscreen</button>
              )}
            </div>
            {!isStudyMode ? (
              <div className={styles.studySetupForm}>
                <select value={activeSubject} onChange={e => setActiveSubject(e.target.value)} className={styles.formSelect}>
                  <option value="">-- Select Subject --</option>
                  {allSubjects.map(s => <option key={s}>{s}</option>)}
                </select>
                <input type="number" placeholder="Target minutes (e.g. 60)" value={targetMinutes} onChange={e => setTargetMinutes(e.target.value)} className={styles.formInput} />
                <select value={studyMood} onChange={e => setStudyMood(e.target.value)} className={styles.formSelect}>{MOODS.map(m => <option key={m}>{m}</option>)}</select>
                <div className={styles.goalRow}>
                  <label>Daily Goal (min):</label>
                  <input type="number" value={studyGoalMinutes} onChange={e => setStudyGoalMinutes(parseInt(e.target.value) || 120)} className={styles.formInput} style={{ width: 80 }} />
                </div>
                <label className={styles.checkLabel}><input type="checkbox" checked={breakReminder} onChange={e => setBreakReminder(e.target.checked)} /> ☕ Break reminder every 25 min</label>
                <button onClick={startStudyMode} className={styles.startModeBtn}>▶ Start Study Session (Fullscreen)</button>
              </div>
            ) : (
              <div className={styles.liveConsoleArea}>
                <h3>Studying: <mark>{activeSubject}</mark></h3>
                <div className={styles.liveClockDisplay}>{fmt(secondsElapsed)}</div>
                <p>Target: {targetMinutes} min | Mood: {studyMood.split(" ")[0]}</p>
                <div className={styles.liveProgress}><div className={styles.liveProgressFill} style={{ width: `${Math.min((secondsElapsed / (parseInt(targetMinutes) * 60)) * 100, 100)}%` }} /></div>
                <textarea placeholder="Session notes..." value={sessionNote} onChange={e => setSessionNote(e.target.value)} className={styles.sessionNote} />
                <input placeholder="Tags (e.g. exam-prep)" value={sessionTags} onChange={e => setSessionTags(e.target.value)} className={`${styles.formInput} ${styles.tagInput}`} />
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button onClick={() => setStudyFullScreen(true)} className={styles.smBtn}>⤢ Fullscreen</button>
                  <button onClick={stopStudyMode} className={styles.stopModeBtn}>⏹ Stop & Save</button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}><span>🍅</span><h2>Pomodoro Timer</h2></div>
            <div className={styles.pomodoroPresets}>
              {POMODORO_PRESETS.map(p => (
                <button key={p.label}
                  className={`${styles.presetBtn} ${pomodoroPreset.label === p.label ? styles.presetBtnActive : ""}`}
                  onClick={() => { setPomodoroPreset(p); setPomodoroSeconds(p.work * 60); setIsPomodoroMode(false); setPomodoroPhase("work"); setPomodoroCount(0); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className={styles.customPomRow}>
              <input type="number" placeholder="Work min" value={customPomWork} onChange={e => setCustomPomWork(+e.target.value)} className={styles.formInput} style={{ width: 80 }} />
              <input type="number" placeholder="Break min" value={customPomBreak} onChange={e => setCustomPomBreak(+e.target.value)} className={styles.formInput} style={{ width: 80 }} />
              <button className={styles.smBtn} onClick={() => { const p = { label: "Custom", work: customPomWork, short: customPomBreak }; setPomodoroPreset(p); setPomodoroSeconds(p.work * 60); setIsPomodoroMode(false); setPomodoroPhase("work"); setPomodoroCount(0); }}>Set Custom</button>
            </div>
            <div className={`${styles.pomodoroDisplay} ${pomodoroPhase === "break" ? styles.pomodoroBreak : ""}`}>
              <div className={styles.pomodoroPhaseLabel}>{pomodoroPhase === "work" ? "🎯 Focus Time" : "☕ Break Time"}</div>
              <div className={styles.pomodoroTime}>{fmtPom(pomodoroSeconds)}</div>
              <div className={styles.pomodoroCount}>🍅 × {pomodoroCount}</div>
              <div className={styles.pomodoroInfo}>{pomodoroPhase === "work" ? `${pomodoroPreset.work} min focus` : `${pomodoroPreset.short} min break`}</div>
            </div>
            <div className={styles.pomodoroControls}>
              <button onClick={() => setIsPomodoroMode(p => !p)} className={styles.startModeBtn}>{isPomodoroMode ? "⏹ Stop" : "▶ Start"}</button>
              <button onClick={() => { setIsPomodoroMode(false); setPomodoroPhase("work"); setPomodoroSeconds(pomodoroPreset.work * 60); setPomodoroCount(0); }} className={styles.smBtn}>↺ Reset</button>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}><span>📋</span><h2>Recent Sessions</h2></div>
            <div className={styles.sessionHistoryContainer}>
              {studySessions.length === 0 ? <p className={styles.emptyState}>No sessions yet. Start studying!</p> :
                studySessions.slice(-10).reverse().map(s => (
                  <div key={s.id} className={styles.historyItemLog}>
                    <div className={styles.historyMetaRow}>
                      <strong>{s.subjectName}</strong>
                      <span className={s.accuracyPercentage >= 80 ? styles.goodScore : styles.badScore}>{s.accuracyPercentage}%</span>
                    </div>
                    <p>{s.actualTime}min / {s.targetTime}min {s.mood && `• ${s.mood.split(" ")[0]}`}</p>
                    {s.notes && <p className={styles.sessionNoteDisplay}>📝 {s.notes}</p>}
                    {s.tags && <p className={styles.sessionTags}>🏷️ {s.tags}</p>}
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ══════ ANALYTICS ══════ */}
      {activeTab === "analytics" && (
        <div className={styles.analyticsGrid}>
          <div className={styles.card}>
            <div className={styles.cardHead}><span>📈</span><h2>7-Day Progress</h2></div>
            <div className={styles.chartContainer}>
              {weeklyProgress.map((d, i) => (
                <div key={i} className={styles.barChartItem}>
                  <div className={styles.bar} style={{
                    height: `${Math.min((d.minutes / 120) * 100, 100)}%`,
                    background: d.day === currentDayName.slice(0, 3) ? "linear-gradient(to top,#f77f00,#ffba08)" : "linear-gradient(to top,#4361ee,#3a86ff)"
                  }}>
                    <span className={styles.barLabel}>{d.minutes}m</span>
                  </div>
                  <span className={styles.barDay}>{d.day}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardHead}><span>📅</span><h2>Monthly Overview</h2></div>
            {monthlyStats.length === 0 ? <p className={styles.emptyState}>No data yet</p> : (
              <div className={styles.monthlyGrid}>
                {monthlyStats.map((m, i) => (
                  <div key={i} className={styles.monthCard}>
                    <div className={styles.monthLabel}>{m.month}</div>
                    <div className={styles.monthMins}>{Math.floor(m.mins / 60)}h {m.mins % 60}m</div>
                    <div className={styles.monthSessions}>{m.sessions} sessions</div>
                    <div className={styles.monthBar}><div className={styles.monthBarFill} style={{ width: `${Math.min((m.mins / 1200) * 100, 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={styles.card}>
            <div className={styles.cardHead}><span>📊</span><h2>Subject Performance</h2></div>
            <div className={styles.subjectStatsContainer}>
              {Object.entries(subjectStats).length === 0 ? <p className={styles.emptyState}>No data yet</p> :
                Object.entries(subjectStats).sort((a, b) => b[1].avgAccuracy - a[1].avgAccuracy).map(([sub, st]) => (
                  <div key={sub} className={styles.subjectStatItem}>
                    <div className={styles.subjectStatHeader}><span className={styles.subjectName}>{sub}</span><span className={styles.subjectAccuracy}>{st.avgAccuracy}%</span></div>
                    <div className={styles.subjectStatBar}><div className={styles.subjectStatFill} style={{ width: `${st.avgAccuracy}%`, background: st.avgAccuracy >= 80 ? "#0f9d6e" : st.avgAccuracy >= 50 ? "#f77f00" : "#ef4444" }} /></div>
                    <div className={styles.subjectStatMeta}>{st.totalTime} min • {st.sessions} sessions</div>
                  </div>
                ))
              }
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardHead}><span>🧠</span><h2>AI Insights</h2></div>
            <div className={styles.recommendationsContainer}>
              {Object.entries(subjectStats).length > 0 ? (
                <>
                  <div className={styles.recommendation}>
                    <span className={styles.recIcon}>⚠️</span>
                    <div><strong>Weak Area</strong><p>Focus more on <mark>{Object.entries(subjectStats).sort((a, b) => a[1].avgAccuracy - b[1].avgAccuracy)[0]?.[0]}</mark></p></div>
                  </div>
                  <div className={styles.recommendation}>
                    <span className={styles.recIcon}>⭐</span>
                    <div><strong>Top Subject</strong><p><mark>{Object.entries(subjectStats).sort((a, b) => b[1].avgAccuracy - a[1].avgAccuracy)[0]?.[0]}</mark> — best performance!</p></div>
                  </div>
                  {Object.entries(subjectStats).filter(([, v]) => { const d = v.lastStudied; return d && (new Date() - d) > 7 * 86400000; }).slice(0, 2).map(([sub]) => (
                    <div key={sub} className={styles.recommendation}>
                      <span className={styles.recIcon}>📅</span>
                      <div><strong>Not Studied Recently</strong><p>Revise <mark>{sub}</mark> — it's been over 7 days!</p></div>
                    </div>
                  ))}
                </>
              ) : <p className={styles.emptyState}>Complete study sessions to see insights</p>}
              {avgAccuracy < 70 && <div className={styles.recommendation}><span className={styles.recIcon}>💡</span><div><strong>Tip</strong><p>Try 25-min Pomodoro sessions to improve focus and accuracy</p></div></div>}
              {streak >= 3 && <div className={styles.recommendation}><span className={styles.recIcon}>🔥</span><div><strong>On Fire!</strong><p>{streak}-day study streak! Keep it going!</p></div></div>}
              {yearCountdown.d < 200 && (
                <div className={styles.recommendation}>
                  <span className={styles.recIcon}>🗓️</span>
                  <div><strong>{yearCountdown.targetYear} is Coming!</strong><p>Only <mark>{yearCountdown.d} days</mark> left — set your goals now!</p></div>
                </div>
              )}
            </div>
          </div>
          <div className={`${styles.card} ${styles.spanFull}`}>
            <div className={styles.cardHead}><span>🏆</span><h2>Achievements ({achievements.length})</h2></div>
            <div className={styles.achievementsGrid}>
              {achievements.length === 0 ? <p className={styles.emptyState}>Keep studying to unlock achievements!</p> :
                achievements.map(a => (
                  <div key={a.id} className={styles.achievementCard}>
                    <span className={styles.achievementIcon}>{a.icon}</span>
                    <h4>{a.title}</h4><p>{a.description}</p>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ══════ EXAMS ══════ */}
      {activeTab === "exams" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span>🎯</span><h2>Exam Deadlines</h2>
            {avgExamDays !== null && (
              <div className={styles.examAvgBadge}>📊 Avg {avgExamDays} days remaining across {upcomingExams.length} exam{upcomingExams.length > 1 ? "s" : ""}</div>
            )}
          </div>
          <div className={styles.examForm}>
            <input placeholder="Exam name (e.g. SSC CGL, UPSC)" value={examName} onChange={e => setExamName(e.target.value)} className={styles.formInput} />
            <input type="datetime-local" value={examDate} onChange={e => setExamDate(e.target.value)} className={styles.formInput} />
            <select value={examPriority} onChange={e => setExamPriority(e.target.value)} className={styles.formSelect}><option>High</option><option>Medium</option><option>Low</option></select>
            <input placeholder="Key subjects (optional)" value={examSubjectsInput} onChange={e => setExamSubjectsInput(e.target.value)} className={styles.formInput} />
            <input placeholder="Target score (optional)" value={examTargetScore} onChange={e => setExamTargetScore(e.target.value)} className={styles.formInput} />
            <input placeholder="Notes (optional)" value={examNotes} onChange={e => setExamNotes(e.target.value)} className={styles.formInput} />
            <button onClick={addExam} className={styles.addBtn}>+ Set Target</button>
          </div>

          {upcomingExams.length > 0 && (
            <div className={styles.examSummaryRow}>
              {[
                { icon:"📋", num: upcomingExams.length, lbl:"Upcoming" },
                { icon:"⏳", num: avgExamDays ?? "—", lbl:"Avg Days Left" },
                { icon:"🔴", num: upcomingExams.filter(e => { const cd = getCD(e.examDate); return !cd.done && cd.d < 30; }).length, lbl:"Critical (<30d)" },
                { icon:"✅", num: exams.filter(e => new Date(e.examDate) <= new Date()).length, lbl:"Completed" },
              ].map(({ icon, num, lbl }) => (
                <div key={lbl} className={styles.examSummaryCard}>
                  <span className={styles.examSummaryIcon}>{icon}</span>
                  <span className={styles.examSummaryNum}>{num}</span>
                  <span className={styles.examSummaryLabel}>{lbl}</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.examDeadlineList}>
            {exams.length === 0 ? <p className={styles.emptyState}>No exam targets set yet.</p> :
              exams.sort((a, b) => new Date(a.examDate) - new Date(b.examDate)).map(ex => {
                const cd = getCD(ex.examDate);
                return (
                  <div key={ex.id} className={`${styles.examCountdownCard} ${!cd.done && cd.d < 7 ? styles.examUrgent : !cd.done && cd.d < 30 ? styles.examWarning : ""}`}>
                    <div className={styles.examCountdownInfo}>
                      <div className={styles.examHeader}>
                        <h4>{ex.examName}</h4>
                        <span className={`${styles.priorityBadge} ${styles[`priority_${ex.priority?.toLowerCase()}`]}`}>{ex.priority}</span>
                        {ex.targetScore && <span className={styles.examTargetScoreBadge}>🎯 Target: {ex.targetScore}</span>}
                      </div>
                      {ex.subjects && <p className={styles.examSubjects}>📚 {ex.subjects}</p>}
                      {ex.notes && <p className={styles.examNotes}>📌 {ex.notes}</p>}
                      {cd.done ? <p className={styles.examCompletedText}>✅ Exam Complete!</p> : (
                        <div className={styles.countdownGrid}>
                          {[{ v: cd.d, l: "Days" }, { v: cd.h, l: "Hours" }, { v: cd.m, l: "Mins" }, { v: cd.s, l: "Secs" }].map(u => (
                            <div key={u.l} className={styles.countdownUnit}><span className={styles.countdownNumber}>{u.v}</span><span className={styles.countdownLabel}>{u.l}</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteExam(ex.id)} className={styles.miniDeleteBtn}>🗑</button>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* ══════ NOTES ══════ */}
      {activeTab === "notes" && (
        <div className={styles.notesGrid}>
          <div className={styles.card}>
            <div className={styles.cardHead}><span>📝</span><h2>{editingNoteId ? "Edit Note" : "New Note"}</h2></div>
            <input placeholder="Title..." value={noteTitle} onChange={e => setNoteTitle(e.target.value)} className={`${styles.formInput} ${styles.noteTitleInput}`} />
            <input placeholder="Tag (e.g. Math, Important)" value={noteTag} onChange={e => setNoteTag(e.target.value)} className={styles.formInput} style={{ marginBottom: 10 }} />
            <textarea placeholder="Write your note here..." value={quickNotes} onChange={e => setQuickNotes(e.target.value)} className={styles.notesTextarea} />
            <div className={styles.noteActions}>
              <button onClick={saveNote} className={styles.addBtn}>💾 {editingNoteId ? "Update Note" : "Save Note"}</button>
              {editingNoteId && <button onClick={() => { setEditingNoteId(null); setQuickNotes(""); setNoteTitle(""); setNoteTag(""); }} className={styles.smBtn}>✕ Cancel</button>}
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardHead}><span>📚</span><h2>Saved Notes ({savedNotes.length})</h2></div>
            <div className={styles.filterRow}>
              <input placeholder="🔍 Search notes..." value={noteSearch} onChange={e => setNoteSearch(e.target.value)} className={styles.searchInput} />
              <div className={styles.filterBtns}>
                <button className={`${styles.filterChip} ${noteTagFilter === "" ? styles.filterChipActive : ""}`} onClick={() => setNoteTagFilter("")}>All</button>
                {allNoteTags.map(t => <button key={t} className={`${styles.filterChip} ${noteTagFilter === t ? styles.filterChipActive : ""}`} onClick={() => setNoteTagFilter(t)}>{t}</button>)}
              </div>
            </div>
            <div className={styles.notesList}>
              {filteredNotes.length === 0 ? <p className={styles.emptyState}>No notes found.</p> :
                filteredNotes.map(n => (
                  <div key={n.id} className={styles.noteCard}>
                    <div className={styles.noteCardHeader}>
                      <div><h4>{n.title}</h4>{n.tag && <span className={styles.noteTag}>{n.tag}</span>}</div>
                      <div className={styles.noteCardActions}>
                        <button onClick={() => editNote(n)} className={styles.iconBtnSm}>✏️</button>
                        <button onClick={() => deleteNote(n.id)} className={`${styles.iconBtnSm} ${styles.iconBtnDanger}`}>🗑</button>
                      </div>
                    </div>
                    <p>{n.content?.slice(0, 130)}{n.content?.length > 130 ? "..." : ""}</p>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ══════ FLASHCARDS ══════ */}
      {activeTab === "flashcards" && (
        <div className={styles.flashcardsGrid}>
          {!reviewMode ? (
            <>
              <div className={styles.card}>
                <div className={styles.cardHead}><span>🗂️</span><h2>Add Flashcard</h2></div>
                <select value={newCardSubject} onChange={e => setNewCardSubject(e.target.value)} className={styles.formSelect}>
                  <option value="">-- Select Subject --</option>
                  {allSubjects.map(s => <option key={s}>{s}</option>)}
                </select>
                <input placeholder="Tag (optional)" value={newCardTag} onChange={e => setNewCardTag(e.target.value)} className={styles.formInput} style={{ marginBottom: 8, marginTop: 8 }} />
                <textarea placeholder="Front: Question / Term..." value={newFront} onChange={e => setNewFront(e.target.value)} className={styles.flashcardInput} />
                <textarea placeholder="Back: Answer / Definition..." value={newBack} onChange={e => setNewBack(e.target.value)} className={styles.flashcardInput} />
                <button onClick={addFlashcard} className={styles.addBtn}>+ Add Card</button>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span>📖</span><h2>My Cards ({flashcards.length})</h2>
                  <div className={styles.cardHeadRight}>
                    <label className={styles.checkLabel}><input type="checkbox" checked={shuffleCards} onChange={e => setShuffleCards(e.target.checked)} /> 🔀 Shuffle</label>
                    <button onClick={() => startReview(cardSubjectFilter)} className={styles.addBtn} disabled={flashcards.length === 0}>▶ Start Review</button>
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterBtns}>
                    <button className={`${styles.filterChip} ${cardSubjectFilter === "all" ? styles.filterChipActive : ""}`} onClick={() => setCardSubjectFilter("all")}>All ({flashcards.length})</button>
                    {allCardSubjects.map(s => <button key={s} className={`${styles.filterChip} ${cardSubjectFilter === s ? styles.filterChipActive : ""}`} onClick={() => setCardSubjectFilter(s)}>{s} ({flashcards.filter(f => f.subject === s).length})</button>)}
                  </div>
                </div>
                <div className={styles.flashcardsList}>
                  {filteredFlashcards.length === 0 ? <p className={styles.emptyState}>No cards found.</p> :
                    filteredFlashcards.map(f => (
                      <div key={f.id} className={styles.flashcardItem}>
                        <div className={styles.flashcardHeader}>
                          <div className={styles.flashcardSubject} style={{ background: getSubjectColor(f.subject) }}>{f.subject}</div>
                          {f.tag && <span className={styles.cardTag}>{f.tag}</span>}
                        </div>
                        <div className={styles.flashcardContent}><strong>Q:</strong> {f.front}</div>
                        <div className={styles.flashcardAnswer}><strong>A:</strong> {f.back}</div>
                        <div className={styles.flashcardMeta}>
                          {"⭐".repeat(f.confidence || 0)}{"☆".repeat(5 - (f.confidence || 0))} • {f.reviewCount || 0} reviews
                          <button onClick={() => deleteFlashcard(f.id)} className={`${styles.iconBtnSm} ${styles.iconBtnDanger}`}>🗑</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </>
          ) : (
            <div className={styles.card} style={{ maxWidth: 620, margin: "0 auto" }}>
              <div className={styles.cardHead}><span>🧠</span><h2>Review Mode ({reviewIndex + 1}/{reviewCards.length})</h2></div>
              <div className={styles.reviewProgress}><div className={styles.reviewProgressFill} style={{ width: `${((reviewIndex + 1) / reviewCards.length) * 100}%` }} /></div>
              <div className={styles.flashcardReview}>
                <div className={styles.reviewSubject} style={{ background: getSubjectColor(reviewCards[reviewIndex]?.subject) }}>{reviewCards[reviewIndex]?.subject}</div>
                <div className={styles.reviewQuestion}>{reviewCards[reviewIndex]?.front}</div>
                {!showAnswer ? (
                  <button onClick={() => setShowAnswer(true)} className={styles.showAnswerBtn}>👁️ Show Answer</button>
                ) : (
                  <>
                    <div className={styles.reviewAnswer}>{reviewCards[reviewIndex]?.back}</div>
                    <p style={{ textAlign: "center", color: "var(--text2)", fontSize: "0.88rem", marginBottom: 12 }}>How well did you remember?</p>
                    <div className={styles.rateButtons}>
                      {[{ r: 1, l: "😓 Forgot" }, { r: 2, l: "😕 Barely" }, { r: 3, l: "🙂 Okay" }, { r: 4, l: "😊 Good" }, { r: 5, l: "🔥 Perfect!" }].map(({ r, l }) => (
                        <button key={r} onClick={() => rateCard(reviewCards[reviewIndex].id, r)} className={`${styles.rateBtn} ${styles[`rate${r}`]}`}>{l}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setReviewMode(false)} className={styles.smBtn} style={{ marginTop: 12 }}>✕ Exit Review</button>
            </div>
          )}
        </div>
      )}

      {/* ══════ TODO ══════ */}
      {activeTab === "todo" && (
        <div className={styles.card}>
          <div className={styles.cardHead}><span>✅</span><h2>Study Todo List</h2></div>
          <div className={styles.todoForm}>
            <input placeholder="Write a todo..." value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyPress={e => e.key === "Enter" && addTodo()} className={styles.formInput} />
            <select value={todoSubject} onChange={e => setTodoSubject(e.target.value)} className={styles.formSelect}>
              <option value="">-- Subject --</option>
              {allSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <input type="date" value={todoDue} onChange={e => setTodoDue(e.target.value)} className={styles.formInput} />
            <select value={todoPriority} onChange={e => setTodoPriority(e.target.value)} className={styles.formSelect}><option>High</option><option>Medium</option><option>Low</option></select>
            <input placeholder="Tag (optional)" value={todoTag} onChange={e => setTodoTag(e.target.value)} className={styles.formInput} />
            <button onClick={addTodo} className={styles.addBtn}>+ Add</button>
          </div>
          <div className={styles.filterRow}>
            <div className={styles.filterBtns}>
              {["all", "pending", "done"].map(f => (
                <button key={f} className={`${styles.filterChip} ${todoFilter === f ? styles.filterChipActive : ""}`} onClick={() => setTodoFilter(f)}>
                  {f === "all" ? `All (${todos.length})` : f === "pending" ? `Pending (${todos.filter(t => !t.completed).length})` : `Done (${todos.filter(t => t.completed).length})`}
                </button>
              ))}
            </div>
            <input placeholder="🔍 Search todos..." value={todoSearch} onChange={e => setTodoSearch(e.target.value)} className={styles.searchInput} />
          </div>
          <div className={styles.todoList}>
            {filteredTodos.length === 0 ? <p className={styles.emptyState}>No todos yet. Add one above!</p> :
              filteredTodos.map(t => (
                <div key={t.id} className={`${styles.todoItem} ${t.completed ? styles.todoDone : ""}`}>
                  <button onClick={() => toggleTodo(t.id, t.completed)} className={styles.todoCheck}>{t.completed ? "✅" : <div className={styles.todoUnchecked} />}</button>
                  <div className={styles.todoContent}>
                    <span className={styles.todoText}>{t.text}</span>
                    <div className={styles.todoMeta}>
                      {t.subject && <span className={styles.todoSubject} style={{ background: getSubjectColor(t.subject) }}>{t.subject}</span>}
                      {t.dueDate && <span className={`${styles.todoDue} ${new Date(t.dueDate) < new Date() && !t.completed ? styles.todoDueOverdue : ""}`}>📅 {new Date(t.dueDate).toLocaleDateString("en-IN")}</span>}
                      <span className={`${styles.todoPriority} ${styles[`priority_${t.priority?.toLowerCase()}`]}`}>{t.priority}</span>
                      {t.tag && <span className={styles.todoTagBadge}>🏷️ {t.tag}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteTodo(t.id)} className={`${styles.iconBtnSm} ${styles.iconBtnDanger}`}>🗑</button>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ══════ HABITS ══════ */}
      {activeTab === "habits" && (
        <div className={styles.card}>
          <div className={styles.cardHead}><span>🌱</span><h2>Habit Tracker</h2></div>
          <div className={styles.habitForm}>
            <input placeholder="New habit (e.g. Read for 30 minutes daily)" value={newHabit} onChange={e => setNewHabit(e.target.value)} onKeyPress={e => e.key === "Enter" && addHabit()} className={styles.formInput} />
            <select value={habitFreq} onChange={e => setHabitFreq(e.target.value)} className={styles.formSelect}><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
            <button onClick={addHabit} className={styles.addBtn}>+ Add Habit</button>
          </div>
          <div className={styles.habitList}>
            {habits.length === 0 ? <p className={styles.emptyState}>No habits set. Add one to get started!</p> :
              habits.map(h => {
                const todayStr = new Date().toDateString();
                const doneToday = h.completedDates.includes(todayStr);
                const last7Days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toDateString(); }).reverse();
                return (
                  <div key={h.id} className={`${styles.habitCard} ${doneToday ? styles.habitDone : ""}`}>
                    <div className={styles.habitInfo}>
                      <div className={styles.habitHeader}>
                        <h3>{h.text}</h3>
                        <span className={styles.habitFreqBadge}>{h.freq}</span>
                      </div>
                      <div className={styles.habitDots}>
                        {last7Days.map((d, i) => (
                          <div key={i} className={`${styles.habitDot} ${h.completedDates.includes(d) ? styles.habitDotFilled : ""}`} title={d} />
                        ))}
                        <span className={styles.habitStreakLabel}>{h.completedDates.filter(d => last7Days.includes(d)).length}/7 this week</span>
                      </div>
                    </div>
                    <div className={styles.habitActions}>
                      <button onClick={() => toggleHabit(h.id)} className={`${styles.habitCheckBtn} ${doneToday ? styles.habitCheckDone : ""}`}>
                        {doneToday ? "✅ Done" : "○ Mark Done"}
                      </button>
                      <button onClick={() => deleteHabit(h.id)} className={`${styles.iconBtnSm} ${styles.iconBtnDanger}`}>🗑</button>
                    </div>
                  </div>
                );
              })
            }
          </div>
          {habits.length > 0 && (
            <div className={styles.habitSummary}>
              <span>📊 Today: {habits.filter(h => h.completedDates.includes(new Date().toDateString())).length}/{habits.length} habits complete</span>
              <div className={styles.habitProgressBar}><div className={styles.habitProgressFill} style={{ width: `${(habits.filter(h => h.completedDates.includes(new Date().toDateString())).length / habits.length) * 100}%` }} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
