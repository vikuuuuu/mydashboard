"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./studytool.module.css";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot,
  query, serverTimestamp, where, updateDoc, getDocs,
  setDoc, writeBatch, increment,
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

// ─── ACHIEVEMENTS (expanded with new tiers) ───────────────────────────────
// NOTE: `check(s)` receives a combined stats object — see `combinedStats` useMemo below.
// Unlocking now writes to a DETERMINISTIC Firestore doc id (`${uid}_${achievementId}`),
// which makes the whole system idempotent — even if this function runs twice in a race
// (e.g. Firestore's optimistic local snapshot firing before the achievements listener
// catches up), the second write just overwrites the same doc instead of creating a duplicate.
const ACHIEVEMENTS_LIST = [
  { id: "first_session", icon: "🎉", title: "First Step",         description: "Complete your first study session",        check: (s) => s.totalSessions >= 1 },
  { id: "streak_3",      icon: "🔥", title: "3-Day Streak",       description: "Study 3 days in a row",                    check: (s) => s.streak >= 3 },
  { id: "streak_7",      icon: "🚀", title: "Week Warrior",       description: "Study 7 days in a row",                    check: (s) => s.streak >= 7 },
  { id: "streak_30",     icon: "👑", title: "Monthly Master",     description: "Study 30 days in a row",                   check: (s) => s.streak >= 30 },
  { id: "streak_60",     icon: "💎", title: "Unstoppable",        description: "Study 60 days in a row",                   check: (s) => s.streak >= 60 },
  { id: "hours_10",      icon: "⏱️", title: "10 Hours Logged",    description: "Study for a total of 10 hours",            check: (s) => s.totalMins >= 600 },
  { id: "hours_50",      icon: "📚", title: "50 Hours Logged",    description: "Study for a total of 50 hours",            check: (s) => s.totalMins >= 3000 },
  { id: "hours_100",     icon: "🏅", title: "Century Club",       description: "Study for a total of 100 hours",           check: (s) => s.totalMins >= 6000 },
  { id: "hours_200",     icon: "🌟", title: "200 Club",           description: "Study for a total of 200 hours",           check: (s) => s.totalMins >= 12000 },
  { id: "sessions_25",   icon: "📈", title: "Consistent Learner", description: "Complete 25 study sessions",               check: (s) => s.totalSessions >= 25 },
  { id: "sessions_100",  icon: "💯", title: "Session Century",    description: "Complete 100 study sessions",              check: (s) => s.totalSessions >= 100 },
  { id: "accuracy_90",   icon: "🎯", title: "Sharp Shooter",      description: "Maintain 90%+ avg accuracy (5+ sessions)", check: (s) => s.totalSessions >= 5 && s.avgAccuracy >= 90 },
  { id: "pomodoro_10",   icon: "🍅", title: "Pomodoro Starter",   description: "Complete 10 Pomodoro focus cycles",        check: (s) => s.pomodoroTotal >= 10 },
  { id: "pomodoro_50",   icon: "🍅", title: "Pomodoro Pro",       description: "Complete 50 Pomodoro focus cycles",        check: (s) => s.pomodoroTotal >= 50 },
  { id: "syllabus_10",   icon: "📘", title: "Chapter Crusher",    description: "Complete 10 syllabus chapters",            check: (s) => s.syllabusDone >= 10 },
  { id: "syllabus_50",   icon: "📗", title: "Syllabus Slayer",    description: "Complete 50 syllabus chapters",            check: (s) => s.syllabusDone >= 50 },
  { id: "todo_50",       icon: "✅", title: "Task Titan",         description: "Complete 50 todos",                        check: (s) => s.todosDone >= 50 },
  { id: "habit_30",      icon: "🌱", title: "Habit Builder",      description: "Log 30 habit check-ins",                   check: (s) => s.habitCheckins >= 30 },
  { id: "early_bird",    icon: "🌅", title: "Early Bird",         description: "Complete a study session before 6 AM",     check: (s) => s.earlyBird },
  { id: "night_owl",     icon: "🦉", title: "Night Owl",          description: "Complete a study session after 11 PM",     check: (s) => s.nightOwl },
  { id: "subject_specialist_10", icon: "🎓", title: "Subject Specialist", description: "Log 10+ hours in a single subject",       check: (s) => s.maxSubjectMins >= 600 },
  { id: "subject_specialist_25", icon: "🏛️", title: "Deep Specialist",    description: "Log 25+ hours in a single subject",       check: (s) => s.maxSubjectMins >= 1500 },
  { id: "renaissance_5",         icon: "🎨", title: "Renaissance Learner",description: "Study 5+ different subjects total",       check: (s) => s.uniqueSubjectsCount >= 5 },
  { id: "weekly_variety",        icon: "🧩", title: "Balanced Week",      description: "Study 3+ subjects in a single week",       check: (s) => s.thisWeekSubjectsCount >= 3 },
  { id: "weekend_warrior",       icon: "🏖️", title: "Weekend Warrior",    description: "Study on both Saturday and Sunday",        check: (s) => s.weekendWarrior },
  { id: "achievement_hunter",    icon: "🗺️", title: "Achievement Hunter", description: "Unlock 10 achievements",                   check: (s) => s.achievementsUnlocked >= 10 },
  { id: "comeback_kid",          icon: "💪", title: "Comeback Kid",       description: "Resume a 3+ day streak after a gap",       check: (s) => s.comebackFlag },
];

// Maps achievement id -> [currentValue, targetValue] using combinedStats, used to render
// progress bars for the "Up Next" milestone roadmap.
const ACHIEVEMENT_PROGRESS = {
  first_session: (s) => [s.totalSessions, 1],
  streak_3:      (s) => [s.streak, 3],
  streak_7:      (s) => [s.streak, 7],
  streak_30:     (s) => [s.streak, 30],
  streak_60:     (s) => [s.streak, 60],
  hours_10:      (s) => [s.totalMins, 600],
  hours_50:      (s) => [s.totalMins, 3000],
  hours_100:     (s) => [s.totalMins, 6000],
  hours_200:     (s) => [s.totalMins, 12000],
  sessions_25:   (s) => [s.totalSessions, 25],
  sessions_100:  (s) => [s.totalSessions, 100],
  accuracy_90:   (s) => [s.avgAccuracy, 90],
  pomodoro_10:   (s) => [s.pomodoroTotal, 10],
  pomodoro_50:   (s) => [s.pomodoroTotal, 50],
  syllabus_10:   (s) => [s.syllabusDone, 10],
  syllabus_50:   (s) => [s.syllabusDone, 50],
  todo_50:       (s) => [s.todosDone, 50],
  habit_30:      (s) => [s.habitCheckins, 30],
  early_bird:    (s) => [s.earlyBird ? 1 : 0, 1],
  night_owl:     (s) => [s.nightOwl ? 1 : 0, 1],
  subject_specialist_10: (s) => [s.maxSubjectMins, 600],
  subject_specialist_25: (s) => [s.maxSubjectMins, 1500],
  renaissance_5:         (s) => [s.uniqueSubjectsCount, 5],
  weekly_variety:        (s) => [s.thisWeekSubjectsCount, 3],
  weekend_warrior:       (s) => [s.weekendWarrior ? 1 : 0, 1],
  achievement_hunter:    (s) => [s.achievementsUnlocked, 10],
  comeback_kid:          (s) => [s.comebackFlag ? 1 : 0, 1],
};

// ─── XP / LEVEL SYSTEM ─────────────────────────────────────────────────────
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];
const LEVEL_TITLES = ["Novice", "Learner", "Scholar", "Achiever", "Focused Mind", "Consistent Grinder", "Knowledge Seeker", "Study Master", "Elite Learner", "Legend"];
const LEVEL_STEP_AFTER_MAX = 1500;
// Flavor text shown on the new Level Roadmap card — one per LEVEL_TITLES entry.
const LEVEL_PERKS = [
  "Just getting started — every session counts",
  "The basics are clicking",
  "Consistency is starting to show",
  "You're building real momentum",
  "Distractions don't stand a chance",
  "Study time is a habit now, not a chore",
  "You actively hunt down what you don't know",
  "Mock tests fear you",
  "Elite consistency and elite accuracy",
  "The grind became the identity",
];

// ─── AUTO NEXT-YEAR TARGET ────────────────────────────────────────────────────
const getNextYearTarget = () => {
  const now = new Date();
  const nextYear = now.getFullYear() + 1;
  return new Date(`${nextYear}-01-01T00:00:00`);
};

const getStartOfWeek = (d = new Date()) => {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
};

const getWeekKey = (d = new Date()) => {
  const start = getStartOfWeek(d);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
};

// Mood emoji -> label used for the mood/accuracy analytics card (keeps the emoji, drops the word)
const moodEmoji = (mood) => (mood || "").split(" ")[0];

// Formats a Firestore Timestamp (or JS Date/ISO string) into a friendly "unlocked on" string.
// Firestore serverTimestamp() writes resolve to `null` locally until the server value arrives,
// so we fall back to "Just now" for the brief window between the optimistic write and the echo.
const formatUnlockDate = (ts) => {
  if (!ts) return "Just now";
  const d = ts?.toDate?.() ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "Just now";
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
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

  // ─── STUDY TIMER ─────────────────────────────────────────────────────────
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [studyFullScreen, setStudyFullScreen] = useState(false);
  const [activeSubject, setActiveSubject] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("60");
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [breakReminder, setBreakReminder] = useState(true);
  const [studyGoalMinutes, setStudyGoalMinutes] = useState(500);
  const [sessionNote, setSessionNote] = useState("");
  const [studyMood, setStudyMood] = useState("😊 Happy");
  const [studySessions, setStudySessions] = useState([]);
  const [sessionTags, setSessionTags] = useState("");

  const studyStartTimestamp = useRef(null);
  const studyTimerRef = useRef(null);

  // ─── POMODORO ─────────────────────────────────────────────────────────────
  const [isPomodoroMode, setIsPomodoroMode] = useState(false);
  const [pomodoroPreset, setPomodoroPreset] = useState(POMODORO_PRESETS[0]);
  const [pomodoroPhase, setPomodoroPhase] = useState("work");
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [customPomWork, setCustomPomWork] = useState(25);
  const [customPomBreak, setCustomPomBreak] = useState(5);
  const [pomodoroTotal, setPomodoroTotal] = useState(0); // lifetime completed cycles, persisted in Firestore

  const pomodoroStartTimestamp = useRef(null);
  const pomodoroBaseSeconds = useRef(25 * 60);
  const pomodoroRef = useRef(null);

  // Exams
  const [exams, setExams] = useState([]);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examPriority, setExamPriority] = useState("High");
  const [examSubjectsInput, setExamSubjectsInput] = useState("");
  const [examNotes, setExamNotes] = useState("");
  const [examTargetScore, setExamTargetScore] = useState("");

  // ─── SYLLABUS ─────────────────────────────────────────────────────────────
  const [syllabusItems, setSyllabusItems] = useState([]);
  const [selectedExamForSyllabus, setSelectedExamForSyllabus] = useState("");
  const [newSyllabusChapter, setNewSyllabusChapter] = useState("");
  const [newSyllabusSubject, setNewSyllabusSubject] = useState("");
  const [newSyllabusPriority, setNewSyllabusPriority] = useState("High");
  const [newSyllabusNotes, setNewSyllabusNotes] = useState("");
  const [syllabusFilter, setSyllabusFilter] = useState("all");
  const [syllabusSearch, setSyllabusSearch] = useState("");
  const [syllabusViewExam, setSyllabusViewExam] = useState("all");

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
  const [comebackFlag, setComebackFlag] = useState(false); // true when the current streak followed a 4+ day gap

  // Habits
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [habitFreq, setHabitFreq] = useState("daily");

  const fileInputRef = useRef(null);
  const achievementsRef = useRef([]);
  const unlockingRef = useRef(new Set()); // in-flight guard to prevent duplicate toasts during race windows

  const currentDayName = DAYS[new Date().getDay()];
  const allSubjects = useMemo(() => [...DEFAULT_SUBJECTS, ...customSubjects], [customSubjects]);

  const showToast = useCallback((msg, type = "success") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // ─── AUTO YEAR COUNTDOWN ──────────────────────────────────────────────────
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
      logToolUsage({ userId: u.uid, tool: "Study Hub", action: "visit", metadata: { version: "5.0" } });
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
    listenCol("study_syllabus", setSyllabusItems);
    const qSess = query(collection(db, "study_sessions"), where("userId", "==", uid));
    unsubs.push(onSnapshot(qSess, snap => {
      const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setStudySessions(sessions);
      calculateStats(sessions);
    }));
    // Lifetime pomodoro cycle counter — single doc per user, not a collection.
    unsubs.push(onSnapshot(doc(db, "study_pomodoro_stats", uid), snap => {
      setPomodoroTotal(snap.exists() ? (snap.data().totalCompleted || 0) : 0);
    }));
    return () => unsubs.forEach(u => u());
  }, [user]);

  useEffect(() => {
    achievementsRef.current = achievements;
  }, [achievements]);

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

  // ─── STUDY TIMER (background-tab safe) ───────────────────────────────────
  useEffect(() => {
    if (isStudyMode) {
      studyStartTimestamp.current = Date.now() - secondsElapsed * 1000;
      studyTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - studyStartTimestamp.current) / 1000);
        setSecondsElapsed(elapsed);
      }, 500);
    } else {
      clearInterval(studyTimerRef.current);
    }
    return () => clearInterval(studyTimerRef.current);
  }, [isStudyMode]);

  // ─── POMODORO TIMER (background-tab safe) ────────────────────────────────
  useEffect(() => {
    if (isPomodoroMode) {
      pomodoroStartTimestamp.current = Date.now();
      pomodoroBaseSeconds.current = pomodoroSeconds;
      pomodoroRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - pomodoroStartTimestamp.current) / 1000);
        const remaining = pomodoroBaseSeconds.current - elapsed;
        if (remaining <= 0) {
          const next = pomodoroPhase === "work" ? "break" : "work";
          setPomodoroPhase(next);
          if (next === "break") {
            setPomodoroCount(c => c + 1);
            // Persist lifetime pomodoro completions for the Pomodoro achievements.
            if (user) {
              setDoc(
                doc(db, "study_pomodoro_stats", user.uid),
                { userId: user.uid, totalCompleted: increment(1), updatedAt: serverTimestamp() },
                { merge: true }
              ).catch(() => {});
            }
          }
          showToast(
            next === "break" ? `☕ Break time! ${pomodoroPreset.short} min` : "🎯 Focus time! Let's go!",
            next === "break" ? "info" : "success"
          );
          const newSeconds = next === "work" ? pomodoroPreset.work * 60 : pomodoroPreset.short * 60;
          setPomodoroSeconds(newSeconds);
          pomodoroStartTimestamp.current = Date.now();
          pomodoroBaseSeconds.current = newSeconds;
        } else {
          setPomodoroSeconds(remaining);
        }
      }, 500);
    } else {
      clearInterval(pomodoroRef.current);
      pomodoroBaseSeconds.current = pomodoroSeconds;
    }
    return () => clearInterval(pomodoroRef.current);
  }, [isPomodoroMode, pomodoroPhase, pomodoroPreset, showToast, user]);

  // ─── Page Visibility API ──────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (isStudyMode && studyStartTimestamp.current) {
          const elapsed = Math.floor((Date.now() - studyStartTimestamp.current) / 1000);
          setSecondsElapsed(elapsed);
        }
        if (isPomodoroMode && pomodoroStartTimestamp.current) {
          const elapsed = Math.floor((Date.now() - pomodoroStartTimestamp.current) / 1000);
          const remaining = Math.max(0, pomodoroBaseSeconds.current - elapsed);
          setPomodoroSeconds(remaining);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isStudyMode, isPomodoroMode]);

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

  const getSubjectColor = useCallback((sub) => {
    let hash = 0;
    for (let i = 0; i < (sub || "").length; i++) hash = (sub.charCodeAt(i) + ((hash << 5) - hash));
    return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
  }, []);

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

  // ─── TIMETABLE CRUD ──────────────────────────────────────────────────────
  const addTask = async () => {
    if (!subject || !startTime || !endTime || !user) { showToast("Please fill all required fields!", "error"); return; }
    if (startTime >= endTime) { showToast("End time must be after start time!", "error"); return; }
    const daysToAdd = repeatDays.length > 0 ? repeatDays : [day];
    // Fire the writes in parallel instead of sequentially awaiting each addDoc — same
    // Firestore cost, noticeably faster when repeating a slot across many days.
    await Promise.all(daysToAdd.map(d => addDoc(collection(db, "study_tasks"), {
      userId: user.uid, subject, startTime, endTime, taskType, day: d,
      color: taskColorInput || getSubjectColor(subject), notes: taskNoteInput, createdAt: serverTimestamp(),
    })));
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
      const data = { tasks, customSubjects, exportedAt: new Date().toISOString(), version: "5.0" };
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

  // Firestore batched writes have a 500-operation limit per batch — chunk larger imports.
  const BATCH_CHUNK_SIZE = 400;
  const commitTaskBatch = async (taskDocs) => {
    let count = 0;
    for (let i = 0; i < taskDocs.length; i += BATCH_CHUNK_SIZE) {
      const chunk = taskDocs.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(data => {
        const ref = doc(collection(db, "study_tasks"));
        batch.set(ref, data);
      });
      await batch.commit();
      count += chunk.length;
    }
    return count;
  };

  const importTimetable = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isCSV = file.name.endsWith(".csv");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const taskDocs = [];
        if (isCSV) {
          const lines = ev.target.result.split("\n").slice(1);
          for (const line of lines) {
            const parts = line.split(",").map(s => s?.replace(/"/g, "").trim());
            const [d, sub, st, et, tt, col, notes] = parts;
            if (!d || !sub || !st || !et) continue;
            taskDocs.push({
              userId: user.uid, subject: sub, startTime: st, endTime: et,
              taskType: tt || "Class", day: d, color: col || getSubjectColor(sub),
              notes: notes || "", createdAt: serverTimestamp(),
            });
          }
        } else {
          const data = JSON.parse(ev.target.result);
          if (!data.tasks) { showToast("Invalid file format!", "error"); return; }
          for (const t of data.tasks) {
            taskDocs.push({
              userId: user.uid, subject: t.subject || "Untitled",
              startTime: t.startTime || "09:00", endTime: t.endTime || "10:00",
              taskType: t.taskType || "Class", day: t.day || "Monday",
              color: t.color || getSubjectColor(t.subject || ""),
              notes: t.notes || "", createdAt: serverTimestamp(),
            });
          }
          if (data.customSubjects?.length) {
            const merged = [...new Set([...customSubjects, ...data.customSubjects])];
            setCustomSubjects(merged); saveCustomSubjects(merged);
          }
        }
        const count = await commitTaskBatch(taskDocs);
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
    studyStartTimestamp.current = Date.now();
    setIsStudyMode(true);
    setStudyFullScreen(true);
    await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "start_study_session", resourceName: activeSubject, metadata: { targetMinutes, mood: studyMood } });
    showToast(`📚 Study session started: ${activeSubject}`);
  };

  const stopStudyMode = async () => {
    setIsStudyMode(false);
    setStudyFullScreen(false);
    const actualElapsed = studyStartTimestamp.current
      ? Math.floor((Date.now() - studyStartTimestamp.current) / 1000)
      : secondsElapsed;
    const actualMins = Math.round(actualElapsed / 60);
    const expected = parseInt(targetMinutes) || 1;
    const accuracy = Math.min(Math.round((actualMins / expected) * 100), 100);
    try {
      await addDoc(collection(db, "study_sessions"), {
        userId: user.uid, subjectName: activeSubject, targetTime: expected,
        actualTime: actualMins, accuracyPercentage: accuracy,
        mood: studyMood, notes: sessionNote, tags: sessionTags, createdAt: serverTimestamp(),
      });
      await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "stop_study_session", resourceName: activeSubject, metadata: { actualMins, accuracy, mood: studyMood } });
      showToast(`🎉 Session saved! ${actualMins} min • Accuracy: ${accuracy}%`);
    } catch (e) { showToast("Error saving session", "error"); }
    studyStartTimestamp.current = null;
    setSecondsElapsed(0); setSessionNote(""); setSessionTags("");
  };

  // ─── ACHIEVEMENT UNLOCKING (dedupe-safe) ──────────────────────────────────
  // Deterministic doc ID = idempotent write. Even if this fires twice in a race window
  // (Firestore's local-then-server onSnapshot double-fire), both writes target the same
  // document, so the collection can never end up with two rows for the same achievement.
  // `unlockingRef` additionally prevents a duplicate toast/log while the first write is in flight.
  const unlockAchievement = async (a, extra = {}) => {
    if (!user) return;
    const alreadyUnlocked = achievementsRef.current.some(ex => ex.achievementId === a.id);
    if (alreadyUnlocked || unlockingRef.current.has(a.id)) return;
    unlockingRef.current.add(a.id);
    try {
      await setDoc(doc(db, "study_achievements", `${user.uid}_${a.id}`), {
        userId: user.uid,
        achievementId: a.id,
        icon: a.icon,
        title: a.title,
        description: a.description,
        createdAt: serverTimestamp(),
        ...extra,
      });
      showToast(`🏆 Achievement Unlocked: ${a.title}!`);
      await logToolUsage({ userId: user.uid, tool: "Study Hub", action: "unlock_achievement", resourceName: a.title });
    } catch (e) {
      console.error(e);
    } finally {
      unlockingRef.current.delete(a.id);
    }
  };

  const checkAchievements = async (stats) => {
    if (!user) return;
    await Promise.all(ACHIEVEMENTS_LIST.filter(a => a.check(stats)).map(a => unlockAchievement(a)));
  };

  const calculateStats = (sessions) => {
    const today = new Date();
    // Single pass over sessions to build a date-string -> minutes map, instead of
    // filtering the full session list once per day (was O(7 * N), now O(N + 7)).
    const minutesByDateString = new Map();
    sessions.forEach(s => {
      const sd = s.createdAt?.toDate?.() || new Date(s.createdAt);
      const key = sd.toLocaleDateString();
      minutesByDateString.set(key, (minutesByDateString.get(key) || 0) + (s.actualTime || 0));
    });
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toLocaleDateString();
      last7.push({ day: DAYS[d.getDay()].slice(0, 3), minutes: minutesByDateString.get(ds) || 0 });
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

    // ─── STREAK ──────────────────────────────────────────────────────────
    const sorted = sessions.filter(s => s.createdAt).sort((a, b) => {
      const da = a.createdAt.toDate?.() || new Date(a.createdAt);
      const db2 = b.createdAt.toDate?.() || new Date(b.createdAt);
      return db2 - da;
    });

    let finalStreak = 0;
    let hadGapThenRestarted = false;
    if (sorted.length) {
      const oneDay = 86400000;
      const uniqueDayTimestamps = [...new Set(sorted.map(s => {
        const d = s.createdAt.toDate?.() || new Date(s.createdAt);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      }))].sort((a, b) => b - a);

      const todayMid = new Date();
      todayMid.setHours(0, 0, 0, 0);
      const todayTime = todayMid.getTime();

      if (uniqueDayTimestamps[0] === todayTime || uniqueDayTimestamps[0] === todayTime - oneDay) {
        finalStreak = 1;
        for (let i = 1; i < uniqueDayTimestamps.length; i++) {
          if (uniqueDayTimestamps[i - 1] - uniqueDayTimestamps[i] === oneDay) finalStreak++;
          else break;
        }
      }

      // "Comeback Kid": look at the gap immediately preceding the current streak's oldest day.
      // If that gap was 4+ days and the current streak has reached 3+ days, count it as a comeback.
      if (finalStreak >= 3) {
        const streakOldestIdx = finalStreak - 1;
        const nextOlderIdx = streakOldestIdx + 1;
        if (uniqueDayTimestamps[nextOlderIdx] !== undefined) {
          const gapDays = (uniqueDayTimestamps[streakOldestIdx] - uniqueDayTimestamps[nextOlderIdx]) / oneDay;
          if (gapDays >= 4) hadGapThenRestarted = true;
        }
      }
    }
    setStreak(finalStreak);
    setComebackFlag(hadGapThenRestarted);
    // NOTE: achievement checking has been moved OUT of here — it now runs from a single
    // `combinedStats` useEffect below, so it reacts consistently to sessions, todos,
    // syllabus, habits AND pomodoro data together instead of only sessions.
  };

  // ─── EXAM CRUD ────────────────────────────────────────────────────────────
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

  // ─── SYLLABUS CRUD ────────────────────────────────────────────────────────
  const addSyllabusItem = async () => {
    if (!newSyllabusChapter.trim() || !selectedExamForSyllabus) {
      showToast("Please select an exam and enter a chapter!", "error");
      return;
    }
    await addDoc(collection(db, "study_syllabus"), {
      userId: user.uid,
      examId: selectedExamForSyllabus,
      examName: exams.find(e => e.id === selectedExamForSyllabus)?.examName || "",
      chapter: newSyllabusChapter.trim(),
      subject: newSyllabusSubject || "",
      priority: newSyllabusPriority,
      notes: newSyllabusNotes || "",
      status: "pending",
      completedAt: null,
      createdAt: serverTimestamp(),
    });
    await logToolUsage({
      userId: user.uid,
      tool: "Study Hub",
      action: "add_syllabus_item",
      resourceName: newSyllabusChapter.trim(),
      metadata: { examId: selectedExamForSyllabus, subject: newSyllabusSubject, priority: newSyllabusPriority },
    });
    setNewSyllabusChapter("");
    setNewSyllabusSubject("");
    setNewSyllabusNotes("");
    showToast("📖 Chapter added to syllabus!");
  };

  const updateSyllabusStatus = async (id, status) => {
    await updateDoc(doc(db, "study_syllabus", id), {
      status,
      completedAt: status === "done" ? serverTimestamp() : null,
    });
    await logToolUsage({
      userId: user.uid,
      tool: "Study Hub",
      action: "update_syllabus_status",
      resourceId: id,
      metadata: { status },
    });
    showToast(status === "done" ? "✅ Marked complete!" : status === "in_progress" ? "🔄 In progress!" : "⏳ Marked pending");
  };

  const deleteSyllabusItem = async (id) => {
    await deleteDoc(doc(db, "study_syllabus", id));
    await logToolUsage({
      userId: user.uid,
      tool: "Study Hub",
      action: "delete_syllabus_item",
      resourceId: id,
    });
    showToast("Syllabus item deleted");
  };

  // ─── NOTES CRUD ───────────────────────────────────────────────────────────
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

  const editNote = (note) => {
    setNoteTitle(note.title); setQuickNotes(note.content);
    setNoteTag(note.tag || ""); setEditingNoteId(note.id); setActiveTab("notes");
  };

  // ─── FLASHCARD CRUD ───────────────────────────────────────────────────────
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

  // ─── TODO CRUD ────────────────────────────────────────────────────────────
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

  // ─── HABITS CRUD ──────────────────────────────────────────────────────────
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

  // ══════════════════════════════════════════════════════════════════════
  // ─── GAMIFICATION ENGINE: combined stats, XP/Level, heatmap, weekly challenge ───
  // ══════════════════════════════════════════════════════════════════════

  // Single source of truth for achievement checks — combines ALL relevant collections,
  // not just study_sessions, so achievements from todos/syllabus/habits/pomodoro all work.
  const combinedStats = useMemo(() => {
    const totalMins = studySessions.reduce((a, s) => a + (s.actualTime || 0), 0);
    const avgAccuracy = studySessions.length
      ? Math.round(studySessions.reduce((a, s) => a + (s.accuracyPercentage || 0), 0) / studySessions.length)
      : 0;
    const syllabusDone = syllabusItems.filter(s => s.status === "done").length;
    const todosDone = todos.filter(t => t.completed).length;
    const habitCheckins = habits.reduce((a, h) => a + (h.completedDates?.length || 0), 0);
    const earlyBird = studySessions.some(s => {
      const d = s.createdAt?.toDate?.() || new Date(s.createdAt);
      return d.getHours() < 6;
    });
    const nightOwl = studySessions.some(s => {
      const d = s.createdAt?.toDate?.() || new Date(s.createdAt);
      return d.getHours() >= 23;
    });

    // ── New: per-subject totals, drive subject-mastery + variety achievements ──
    const subjectMinutes = {};
    studySessions.forEach(s => {
      subjectMinutes[s.subjectName] = (subjectMinutes[s.subjectName] || 0) + (s.actualTime || 0);
    });
    const maxSubjectMins = Math.max(0, ...Object.values(subjectMinutes));
    const uniqueSubjectsCount = Object.keys(subjectMinutes).length;

    // ── New: subjects studied in the current calendar week ──
    const startOfThisWeek = getStartOfWeek();
    const thisWeekSubjects = new Set(
      studySessions
        .filter(s => (s.createdAt?.toDate?.() || new Date(s.createdAt)) >= startOfThisWeek)
        .map(s => s.subjectName)
    );

    // ── New: did the user study on both Saturday (6) and Sunday (0), ever? ──
    const weekendDays = new Set(
      studySessions
        .map(s => s.createdAt?.toDate?.() || new Date(s.createdAt))
        .filter(d => d.getDay() === 0 || d.getDay() === 6)
        .map(d => d.getDay())
    );
    const weekendWarrior = weekendDays.has(0) && weekendDays.has(6);

    return {
      streak, totalMins, totalSessions: studySessions.length, avgAccuracy,
      syllabusDone, todosDone, habitCheckins, pomodoroTotal, earlyBird, nightOwl,
      subjectMinutes, maxSubjectMins, uniqueSubjectsCount,
      thisWeekSubjectsCount: thisWeekSubjects.size, weekendWarrior,
      achievementsUnlocked: achievements.length, comebackFlag,
    };
  }, [studySessions, syllabusItems, todos, habits, streak, pomodoroTotal, achievements.length, comebackFlag]);

  useEffect(() => {
    if (!user) return;
    checkAchievements(combinedStats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedStats, user]);

  // XP: minutes studied + weighted bonuses for completed todos/chapters/habits/achievements.
  const totalXP = useMemo(() => {
    const totalStudiedMins = studySessions.reduce((a, s) => a + (s.actualTime || 0), 0);
    const studyXP = totalStudiedMins * 1;
    const todoXP = todos.filter(t => t.completed).length * 5;
    const syllabusXP = syllabusItems.filter(s => s.status === "done").length * 15;
    const habitXP = habits.reduce((a, h) => a + (h.completedDates?.length || 0), 0) * 2;
    const achievementXP = achievements.length * 25;
    return studyXP + todoXP + syllabusXP + habitXP + achievementXP;
  }, [studySessions, todos, syllabusItems, habits, achievements]);

  const levelInfo = useMemo(() => {
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (totalXP >= LEVEL_THRESHOLDS[i]) level = i + 1;
    }
    const extraLevels = totalXP > 5000 ? Math.floor((totalXP - 5000) / LEVEL_STEP_AFTER_MAX) : 0;
    level += extraLevels;
    const currentThreshold = level <= LEVEL_THRESHOLDS.length
      ? LEVEL_THRESHOLDS[level - 1]
      : 5000 + (level - LEVEL_THRESHOLDS.length) * LEVEL_STEP_AFTER_MAX;
    const nextThreshold = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : currentThreshold + LEVEL_STEP_AFTER_MAX;
    const pct = nextThreshold > currentThreshold
      ? Math.min(Math.round(((totalXP - currentThreshold) / (nextThreshold - currentThreshold)) * 100), 100)
      : 100;
    const title = level <= LEVEL_TITLES.length ? LEVEL_TITLES[level - 1] : `Legend +${level - LEVEL_TITLES.length}`;
    return { level, title, pct, xpToNext: Math.max(nextThreshold - totalXP, 0), currentThreshold, nextThreshold };
  }, [totalXP]);

  // ─── NEW FEATURE: Level-Up Celebration + Level Roadmap ────────────────────
  // Fires a distinct celebration toast the moment `levelInfo.level` increases, instead of
  // the level-up being a silent number change the user might not even notice. `prevLevelRef`
  // starts as `null` so the very first render (page load, level already N) never fires one.
  const prevLevelRef = useRef(null);
  useEffect(() => {
    if (prevLevelRef.current !== null && levelInfo.level > prevLevelRef.current) {
      showToast(`🎉 Level Up! You're now Level ${levelInfo.level} — ${levelInfo.title}`, "success");
      if (user) {
        logToolUsage({ userId: user.uid, tool: "Study Hub", action: "level_up", resourceName: levelInfo.title, metadata: { level: levelInfo.level } });
      }
    }
    prevLevelRef.current = levelInfo.level;
  }, [levelInfo.level, levelInfo.title, user, showToast]);

  // Full level roadmap (all named levels + a placeholder for what lies beyond) so the
  // Level/XP system has the same "what's coming next" visibility that achievements already
  // have via `upNextAchievements`. Purely derived from XP — no new Firestore reads/writes.
  const levelRoadmap = useMemo(() => {
    const rows = LEVEL_TITLES.map((title, i) => ({
      level: i + 1,
      title,
      perk: LEVEL_PERKS[i] || "Keep going!",
      threshold: LEVEL_THRESHOLDS[i],
      unlocked: totalXP >= LEVEL_THRESHOLDS[i],
      isCurrent: levelInfo.level === i + 1,
    }));
    rows.push({
      level: LEVEL_TITLES.length + 1,
      title: "Legend +1 and beyond",
      perk: `Every ${LEVEL_STEP_AFTER_MAX} XP past Legend earns another "+1"`,
      threshold: 5000 + LEVEL_STEP_AFTER_MAX,
      unlocked: totalXP >= 5000 + LEVEL_STEP_AFTER_MAX,
      isCurrent: levelInfo.level > LEVEL_TITLES.length,
    });
    return rows;
  }, [totalXP, levelInfo.level]);

  // Last 12 weeks of daily study minutes, GitHub-style.
  // Builds a single date-string -> minutes map in one pass over studySessions, then looks
  // each of the 84 days up in that map (was O(84 * N) via per-day filter, now O(N + 84)).
  const heatmapData = useMemo(() => {
    const minutesByDateString = new Map();
    studySessions.forEach(s => {
      const sd = s.createdAt?.toDate?.() || new Date(s.createdAt);
      const key = sd.toDateString();
      minutesByDateString.set(key, (minutesByDateString.get(key) || 0) + (s.actualTime || 0));
    });
    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toDateString();
      days.push({ date: d, mins: minutesByDateString.get(ds) || 0 });
    }
    return days;
  }, [studySessions]);

  const heatColor = (mins) => {
    if (mins <= 0) return "rgba(120,120,140,0.14)";
    if (mins < 30) return "#a7f3d0";
    if (mins < 60) return "#34d399";
    if (mins < 120) return "#10b981";
    return "#047857";
  };

  // ══════════════════════════════════════════════════════════════════════
  // ─── ENHANCED ANALYTICS ─────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  // a) Time-of-Day Productivity Map — 7 (day-of-week) × 24 (hour) grid of minutes studied.
  const timeOfDayMap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    studySessions.forEach(s => {
      const d = s.createdAt?.toDate?.() || new Date(s.createdAt);
      grid[d.getDay()][d.getHours()] += (s.actualTime || 0);
    });
    return grid;
  }, [studySessions]);

  const bestStudyHour = useMemo(() => {
    let best = { day: null, hour: null, mins: 0 };
    timeOfDayMap.forEach((row, dayIdx) => {
      row.forEach((mins, hour) => {
        if (mins > best.mins) best = { day: dayIdx, hour, mins };
      });
    });
    return best;
  }, [timeOfDayMap]);

  // b) Mood vs Accuracy correlation — turns the `mood` field (currently write-only) into an insight.
  const moodAccuracy = useMemo(() => {
    const byMood = {};
    studySessions.forEach(s => {
      if (!s.mood) return;
      if (!byMood[s.mood]) byMood[s.mood] = { total: 0, count: 0 };
      byMood[s.mood].total += s.accuracyPercentage || 0;
      byMood[s.mood].count += 1;
    });
    return Object.entries(byMood)
      .map(([mood, v]) => ({ mood, avg: Math.round(v.total / v.count), count: v.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [studySessions]);

  // c) Week-over-week comparison.
  const weekComparison = useMemo(() => {
    const thisWeekStart = getStartOfWeek();
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const sum = (from, to) => studySessions
      .filter(s => { const d = s.createdAt?.toDate?.() || new Date(s.createdAt); return d >= from && d < to; })
      .reduce((a, s) => a + (s.actualTime || 0), 0);
    const thisWeek = sum(thisWeekStart, new Date());
    const lastWeek = sum(lastWeekStart, thisWeekStart);
    const delta = lastWeek === 0 ? (thisWeek > 0 ? 100 : 0) : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    return { thisWeek, lastWeek, delta };
  }, [studySessions]);

  // Auto-tracked weekly challenge: study 300+ min this week.
  const weeklyChallenge = useMemo(() => {
    const startOfWeek = getStartOfWeek();
    const minsThisWeek = studySessions.filter(s => {
      const d = s.createdAt?.toDate?.() || new Date(s.createdAt);
      return d >= startOfWeek;
    }).reduce((a, s) => a + (s.actualTime || 0), 0);
    const target = 3500;
    return {
      target,
      current: minsThisWeek,
      pct: Math.min(Math.round((minsThisWeek / target) * 100), 100),
      weekKey: getWeekKey(),
      completed: minsThisWeek >= target,
    };
  }, [studySessions]);

  useEffect(() => {
    if (!user || !weeklyChallenge.completed) return;
    const achievementId = `weekly_${weeklyChallenge.weekKey}`;
    const already = achievementsRef.current.some(a => a.achievementId === achievementId) || unlockingRef.current.has(achievementId);
    if (already) return;
    unlockingRef.current.add(achievementId);
    (async () => {
      try {
        await setDoc(doc(db, "study_achievements", `${user.uid}_${achievementId}`), {
          userId: user.uid,
          achievementId,
          icon: "🏁",
          title: "Weekly Challenge Complete",
          description: `Studied ${weeklyChallenge.target}+ minutes this week`,
          createdAt: serverTimestamp(),
        });
        showToast("🏁 Weekly Challenge Complete! Bonus XP earned!");
      } catch (e) {
        console.error(e);
      } finally {
        unlockingRef.current.delete(achievementId);
      }
    })();
  }, [weeklyChallenge.completed, weeklyChallenge.weekKey, user]);

  // "Up Next" milestone roadmap — nearest incomplete achievements with live progress bars.
  const upNextAchievements = useMemo(() => {
    const unlockedIds = new Set(achievements.map(a => a.achievementId));
    return ACHIEVEMENTS_LIST
      .filter(a => !unlockedIds.has(a.id))
      .map(a => {
        const progressFn = ACHIEVEMENT_PROGRESS[a.id];
        const [current, target] = progressFn ? progressFn(combinedStats) : [0, 1];
        return { ...a, current, target, pct: Math.min(Math.round((current / target) * 100), 99) };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
  }, [achievements, combinedStats]);

  // Achievements sorted most-recently-unlocked first, for display in the Achievements grid.
  // Docs whose serverTimestamp hasn't echoed back yet (createdAt still null) are treated as
  // "now" so a just-unlocked achievement appears at the top instead of jumping around later.
  const sortedAchievements = useMemo(() => {
    const toMillis = (a) => a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : Date.now());
    return [...achievements].sort((a, b) => toMillis(b) - toMillis(a));
  }, [achievements]);

  // ─── COMPUTED VALUES (memoized — these previously recalculated on every 500ms timer tick) ──
  const totalStudiedMins = combinedStats.totalMins;
  const avgAccuracy = combinedStats.avgAccuracy;
  const todayStudied = useMemo(() => studySessions.filter(s => {
    const d = s.createdAt?.toDate?.() || new Date(s.createdAt);
    return d.toDateString() === new Date().toDateString();
  }).reduce((a, s) => a + (s.actualTime || 0), 0), [studySessions]);

  const filteredTasks = useMemo(() => tasks.filter(t => {
    const matchDay = filterDay === "today" ? t.day === currentDayName : filterDay === "week" ? true : t.day === filterDay;
    const matchSearch = !timetableSearch || t.subject.toLowerCase().includes(timetableSearch.toLowerCase());
    const matchType = timetableTypeFilter === "all" || t.taskType === timetableTypeFilter;
    return matchDay && matchSearch && matchType;
  }).sort((a, b) => a.startTime.localeCompare(b.startTime)), [tasks, filterDay, timetableSearch, timetableTypeFilter, currentDayName]);

  const filteredNotes = useMemo(() => savedNotes.filter(n => {
    const matchSearch = !noteSearch || n.title?.toLowerCase().includes(noteSearch.toLowerCase()) || n.content?.toLowerCase().includes(noteSearch.toLowerCase());
    const matchTag = !noteTagFilter || n.tag === noteTagFilter;
    return matchSearch && matchTag;
  }), [savedNotes, noteSearch, noteTagFilter]);

  const filteredTodos = useMemo(() => todos.filter(t => {
    if (todoFilter === "pending") return !t.completed;
    if (todoFilter === "done") return t.completed;
    return !todoSearch || t.text.toLowerCase().includes(todoSearch.toLowerCase());
  }).sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority || "Medium"] - { High: 0, Medium: 1, Low: 2 }[b.priority || "Medium"])),
  [todos, todoFilter, todoSearch]);

  const allNoteTags = useMemo(() => [...new Set(savedNotes.map(n => n.tag).filter(Boolean))], [savedNotes]);
  const allCardSubjects = useMemo(() => [...new Set(flashcards.map(f => f.subject).filter(Boolean))], [flashcards]);
  const filteredFlashcards = useMemo(() => (
    cardSubjectFilter === "all" ? flashcards : flashcards.filter(f => f.subject === cardSubjectFilter)
  ), [flashcards, cardSubjectFilter]);

  // avgExamDays / upcomingExams only need day-level precision, but `currentTime` (their old
  // dependency) ticks every second for the header clock — that was forcing both to recompute
  // 60x more often than needed. Keying off a once-per-minute value fixes that without touching
  // the per-second countdown UI, which still reads `currentTime` directly and unmemoized.
  const currentMinuteKey = Math.floor(currentTime.getTime() / 60000);
  const avgExamDays = useMemo(() => getExamAvgDaysRemaining(), [exams, currentMinuteKey]);
  const upcomingExams = useMemo(() => exams.filter(e => new Date(e.examDate) > new Date()), [exams, currentMinuteKey]);

  // ─── SYLLABUS COMPUTED ────────────────────────────────────────────────────
  const filteredSyllabus = useMemo(() => syllabusItems.filter(s => {
    const matchExam = syllabusViewExam === "all" || s.examId === syllabusViewExam;
    const matchStatus = syllabusFilter === "all" || s.status === syllabusFilter;
    const matchSearch = !syllabusSearch ||
      s.chapter.toLowerCase().includes(syllabusSearch.toLowerCase()) ||
      (s.subject || "").toLowerCase().includes(syllabusSearch.toLowerCase());
    return matchExam && matchStatus && matchSearch;
  }), [syllabusItems, syllabusViewExam, syllabusFilter, syllabusSearch]);

  const syllabusStatsByExam = useCallback((examId) => {
    const items = syllabusItems.filter(s => s.examId === examId);
    const done = items.filter(s => s.status === "done").length;
    const inProg = items.filter(s => s.status === "in_progress").length;
    return {
      total: items.length,
      done,
      inProg,
      pct: items.length ? Math.round((done / items.length) * 100) : 0,
    };
  }, [syllabusItems]);

  // d) Exam Readiness — combines syllabus completion % with days remaining into a required daily pace.
  const examReadiness = useCallback((exam) => {
    const st = syllabusStatsByExam(exam.id);
    if (st.total === 0) return null;
    const daysLeft = Math.max(1, Math.ceil((new Date(exam.examDate) - new Date()) / 86400000));
    const remaining = st.total - st.done;
    const requiredPacePerDay = remaining / daysLeft;
    const status = remaining <= 0 ? "done" : requiredPacePerDay <= 0.5 ? "on-track" : requiredPacePerDay <= 1.5 ? "manageable" : "at-risk";
    return { ...st, daysLeft, remaining, requiredPacePerDay: requiredPacePerDay.toFixed(1), status };
  }, [syllabusStatsByExam]);

  const readinessLabel = { "done": "✅ Syllabus complete", "on-track": "🟢 On track", "manageable": "🟡 Manageable pace", "at-risk": "🔴 At risk" };
  // Maps a readiness status to the CSS class-name suffix used by the .readiness* / .examReadinessPill* variants below.
  const READINESS_KEY = { "done": "Done", "on-track": "OnTrack", "manageable": "Manageable", "at-risk": "AtRisk" };

  // ─── YEAR PROGRESS ────────────────────────────────────────────────────────
  const currentYear = currentTime.getFullYear();
  const yearStart = new Date(`${currentYear}-01-01`);
  const yearEnd = new Date(`${currentYear + 1}-01-01`);
  const yearPct = Math.round(((currentTime - yearStart) / (yearEnd - yearStart)) * 100);

  // ─── FULLSCREEN STUDY MODE ────────────────────────────────────────────────
  if (studyFullScreen && isStudyMode) {
    const pct = Math.min((secondsElapsed / (parseInt(targetMinutes) * 60)) * 100, 100);
    const circumference = 2 * Math.PI * 90;
    const isOvertime = secondsElapsed > parseInt(targetMinutes) * 60;
    return (
      <div className={styles.studyFsOverlay}>
        <div className={styles.studyFsContent}>
          <div className={styles.studyFsHeader}>
            <div className={styles.studyFsSubjectBadge} style={{ background: getSubjectColor(activeSubject) }}>
              📚 {activeSubject}
            </div>
            <div className={styles.studyFsMoodBadge}>{studyMood}</div>
            <div className={styles.studyFsAccurateBadge} title="Timer is background-tab accurate">⚡ Accurate Timer</div>
            <button className={styles.studyFsEsc} onClick={() => setStudyFullScreen(false)} title="Minimize (Esc)">⤡ Minimize</button>
          </div>

          <div className={styles.studyFsRing}>
            <svg width="220" height="220" viewBox="0 0 220 220">
              <circle cx="110" cy="110" r="90" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
              <circle
                cx="110" cy="110" r="90" fill="none"
                stroke={isOvertime ? "url(#overtimeGrad)" : "url(#studyGrad)"}
                strokeWidth="12" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (Math.min(pct, 100) / 100) * circumference}
                transform="rotate(-90 110 110)"
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
              <defs>
                <linearGradient id="studyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
                <linearGradient id="overtimeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
            </svg>
            <div className={styles.studyFsRingInner}>
              <div className={styles.studyFsTimer}>{fmt(secondsElapsed)}</div>
              <div className={styles.studyFsTimerLabel}>ELAPSED</div>
              <div className={styles.studyFsPct} style={{ color: isOvertime ? "#fbbf24" : "#60a5fa" }}>
                {isOvertime ? `+${fmt(secondsElapsed - parseInt(targetMinutes) * 60)}` : `${Math.round(pct)}%`}
              </div>
            </div>
          </div>

          <div className={styles.studyFsStats}>
            <div className={styles.studyFsStat}>
              <span className={styles.studyFsStatVal}>{targetMinutes}</span>
              <span className={styles.studyFsStatLbl}>Target</span>
            </div>
            <div className={styles.studyFsStat}>
              <span className={styles.studyFsStatVal}>{Math.round(secondsElapsed / 60)}</span>
              <span className={styles.studyFsStatLbl}>Done (min)</span>
            </div>
            <div className={styles.studyFsStat}>
              <span className={styles.studyFsStatVal} style={{ color: isOvertime ? "#fbbf24" : "#60a5fa" }}>
                {isOvertime ? "OT" : Math.max(0, parseInt(targetMinutes) - Math.round(secondsElapsed / 60))}
              </span>
              <span className={styles.studyFsStatLbl}>{isOvertime ? "Overtime!" : "Remaining"}</span>
            </div>
          </div>

          <div className={styles.studyFsNoteArea}>
            <textarea placeholder="Session notes..." value={sessionNote} onChange={e => setSessionNote(e.target.value)} className={styles.studyFsNote} />
            <input placeholder="Tags (e.g. exam-prep, chapter-5)" value={sessionTags} onChange={e => setSessionTags(e.target.value)} className={styles.studyFsTagInput} />
          </div>

          <div className={styles.studyFsActions}>
            <button onClick={stopStudyMode} className={styles.studyFsStop}>⏹ Stop & Save Session</button>
            <button onClick={() => setStudyFullScreen(false)} className={styles.studyFsMin}>⤡ Minimize</button>
          </div>

          <div className={styles.studyFsBreakHint}>
            {isOvertime
              ? `🏆 Target complete! You're in overtime — great dedication!`
              : breakReminder && secondsElapsed > 0 && Math.floor(secondsElapsed / 1500) > 0 && secondsElapsed % 1500 < 10
                ? "☕ 25 min done — consider a short break!"
                : `🔥 ${streak} day streak • Stay focused!`}
          </div>
        </div>
      </div>
    );
  }

  // ─── FULLSCREEN TIMETABLE ─────────────────────────────────────────────────
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

  // ─── MAIN RENDER ──────────────────────────────────────────────────────────
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
              ⚡ Live: {fmt(secondsElapsed)}
            </button>
          )}
        </div>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Study Hub <span className={styles.vBadge}>v5.0</span></h1>
          <p className={styles.subtitle}>{currentTime.toLocaleTimeString("en-IN")} • {currentDayName}, {currentTime.toLocaleDateString("en-IN")}</p>
        </div>
      </div>

      {/* ── LEVEL / XP BANNER ── */}
      <div className={styles.xpBanner}>
        <div className={styles.xpAvatar}>Lv{levelInfo.level}</div>
        <div className={styles.xpInfo}>
          <div className={styles.xpTitleRow}>
            <strong>{levelInfo.title}</strong>
            <span>{totalXP} XP{levelInfo.pct < 100 ? ` • ${levelInfo.xpToNext} to next level` : ""}</span>
          </div>
          <div className={styles.xpBarTrack}>
            <div className={styles.xpBarFill} style={{ width: `${levelInfo.pct}%` }} />
          </div>
        </div>
        <div className={styles.xpWeekly}>
          🏁 Weekly: {weeklyChallenge.current}/{weeklyChallenge.target} min
          <div className={styles.xpWeeklyBar}>
            <div className={`${styles.xpWeeklyFill} ${weeklyChallenge.completed ? styles.xpWeeklyFillComplete : ""}`} style={{ width: `${weeklyChallenge.pct}%` }} />
          </div>
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
          <div>
            <h3>LIVE: {currentActiveClass.subject}</h3>
            <p>{currentActiveClass.startTime}–{currentActiveClass.endTime} • {currentActiveClass.taskType}</p>
          </div>
          <button className={styles.autoModeBadge} onClick={() => { setActiveSubject(currentActiveClass.subject); setActiveTab("study"); }}>▶ Start Session</button>
        </div>
      )}

      {/* ── STREAK BANNER ── */}
      <div className={styles.streakBanner}>
        <div className={styles.streakItem}>🔥<div><span className={styles.streakNumber}>{streak}</span><span className={styles.streakLabel}>Day Streak</span></div></div>
        <div className={styles.streakItem}>🎯<div><span className={styles.streakNumber}>{todayStudied}/{studyGoalMinutes}</span><span className={styles.streakLabel}>Today (min)</span></div></div>
        <div className={styles.streakItem}>🏆<div><span className={styles.streakNumber}>{achievements.length}</span><span className={styles.streakLabel}>Achievements</span></div></div>
        <div className={styles.streakItem}>📅<div><span className={styles.streakNumber}>{tasks.length}</span><span className={styles.streakLabel}>Slots</span></div></div>
        <div className={styles.streakItem}>📖<div><span className={styles.streakNumber}>{syllabusItems.filter(s => s.status === "done").length}/{syllabusItems.length}</span><span className={styles.streakLabel}>Syllabus</span></div></div>
        {isStudyMode && (
          <div className={styles.streakItem} style={{ cursor: "pointer" }} onClick={() => setStudyFullScreen(true)}>
            ⏱️<div><span className={styles.streakNumber} style={{ color: "#fbbf24" }}>{fmt(secondsElapsed)}</span><span className={styles.streakLabel}>Live Timer</span></div>
          </div>
        )}
        <div className={styles.progressBarContainer}>
          <div className={styles.progressBar} style={{ width: `${Math.min((todayStudied / studyGoalMinutes) * 100, 100)}%` }} />
        </div>
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
          { icon: "📖", val: `${syllabusItems.filter(s => s.status === "done").length}/${syllabusItems.length}`, lbl: "Syllabus Done" },
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
          <button className={styles.smBtn} onClick={() => setActiveTab("syllabus")}>📖 Syllabus →</button>
        </div>
      )}

      {/* ── TAB NAV ── */}
      <div className={styles.tabNav}>
        {[
          { id: "timetable",  label: "📅 Timetable"  },
          { id: "study",      label: "⏱️ Study Mode"  },
          { id: "analytics",  label: "📊 Analytics"   },
          { id: "exams",      label: "🎯 Exams"       },
          { id: "syllabus",   label: "📖 Syllabus"    },
          { id: "notes",      label: "📝 Notes"       },
          { id: "flashcards", label: "🗂️ Flashcards"  },
          { id: "todo",       label: "✅ Todo"         },
          { id: "habits",     label: "🌱 Habits"      },
        ].map(t => (
          <button
            key={t.id}
            className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
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
               {DAYS.map(d => (
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
          <div className={styles.resultCount}>📋 {filteredTasks.length} slots • {[...new Set(filteredTasks.map(t => t.subject))].length} subjects</div>
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
            <div className={styles.timerAccuracyNote}>✅ Background-tab accurate timer — switch tabs freely, timer stays correct</div>
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
                  <input type="number" value={studyGoalMinutes} onChange={e => setStudyGoalMinutes(parseInt(e.target.value) || 500)} className={styles.formInput} style={{ width: 80 }} />
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
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setStudyFullScreen(true)} className={styles.smBtn}>⤢ Fullscreen</button>
                  <button onClick={stopStudyMode} className={styles.stopModeBtn}>⏹ Stop & Save</button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}><span>🍅</span><h2>Pomodoro Timer</h2></div>
            <div className={styles.timerAccuracyNote}>✅ Background-tab accurate — tab switch karo, timer sahi rahega • Lifetime cycles: {pomodoroTotal}</div>
            <div className={styles.pomodoroPresets}>
              {POMODORO_PRESETS.map(p => (
                <button key={p.label}
                  className={`${styles.presetBtn} ${pomodoroPreset.label === p.label ? styles.presetBtnActive : ""}`}
                  onClick={() => {
                    setPomodoroPreset(p); setPomodoroSeconds(p.work * 60);
                    pomodoroBaseSeconds.current = p.work * 60;
                    setIsPomodoroMode(false); setPomodoroPhase("work"); setPomodoroCount(0);
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className={styles.customPomRow}>
              <input type="number" placeholder="Work min" value={customPomWork} onChange={e => setCustomPomWork(+e.target.value)} className={styles.formInput} style={{ width: 80 }} />
              <input type="number" placeholder="Break min" value={customPomBreak} onChange={e => setCustomPomBreak(+e.target.value)} className={styles.formInput} style={{ width: 80 }} />
              <button className={styles.smBtn} onClick={() => {
                const p = { label: "Custom", work: customPomWork, short: customPomBreak };
                setPomodoroPreset(p); setPomodoroSeconds(p.work * 60);
                pomodoroBaseSeconds.current = p.work * 60;
                setIsPomodoroMode(false); setPomodoroPhase("work"); setPomodoroCount(0);
              }}>Set Custom</button>
            </div>
            <div className={`${styles.pomodoroDisplay} ${pomodoroPhase === "break" ? styles.pomodoroBreak : ""}`}>
              <div className={styles.pomodoroPhaseLabel}>{pomodoroPhase === "work" ? "🎯 Focus Time" : "☕ Break Time"}</div>
              <div className={styles.pomodoroTime}>{fmtPom(pomodoroSeconds)}</div>
              <div className={styles.pomodoroCount}>🍅 × {pomodoroCount}</div>
              <div className={styles.pomodoroInfo}>{pomodoroPhase === "work" ? `${pomodoroPreset.work} min focus` : `${pomodoroPreset.short} min break`}</div>
            </div>
            <div className={styles.pomodoroControls}>
              <button onClick={() => setIsPomodoroMode(p => !p)} className={styles.startModeBtn}>{isPomodoroMode ? "⏹ Stop" : "▶ Start"}</button>
              <button onClick={() => {
                setIsPomodoroMode(false); setPomodoroPhase("work");
                const newSecs = pomodoroPreset.work * 60;
                setPomodoroSeconds(newSecs); pomodoroBaseSeconds.current = newSecs; setPomodoroCount(0);
              }} className={styles.smBtn}>↺ Reset</button>
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

          {/* ── WEEK-OVER-WEEK COMPARISON (new) ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}><span>⚖️</span><h2>Week-over-Week</h2></div>
            <div className={styles.weekCompareGrid}>
              <div className={styles.weekCompareCol}>
                <div className={styles.weekCompareValue}>
                  {Math.floor(weekComparison.thisWeek / 60)}h {weekComparison.thisWeek % 60}m
                </div>
                <div className={styles.weekCompareLabel}>This Week</div>
              </div>
              <div className={styles.weekCompareCol}>
                <div className={styles.weekCompareValueMuted}>
                  {Math.floor(weekComparison.lastWeek / 60)}h {weekComparison.lastWeek % 60}m
                </div>
                <div className={styles.weekCompareLabel}>Last Week</div>
              </div>
              <div className={`${styles.weekCompareDeltaBox} ${weekComparison.delta >= 0 ? styles.weekCompareDeltaUp : styles.weekCompareDeltaDown}`}>
                <div className={`${styles.weekCompareDeltaValue} ${weekComparison.delta >= 0 ? styles.weekCompareDeltaValueUp : styles.weekCompareDeltaValueDown}`}>
                  {weekComparison.delta >= 0 ? "▲" : "▼"} {Math.abs(weekComparison.delta)}%
                </div>
                <div className={styles.weekCompareLabel}>vs Last Week</div>
              </div>
            </div>
          </div>

          {/* ── STUDY HEATMAP ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}><span>🗓️</span><h2>Study Heatmap (12 weeks)</h2></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4, padding: "6px 2px" }}>
              {heatmapData.map((d, i) => (
                <div
                  key={i}
                  title={`${d.date.toLocaleDateString("en-IN")} — ${d.mins} min`}
                  style={{
                    width: "100%", aspectRatio: "1", borderRadius: 3,
                    background: heatColor(d.mins),
                    outline: d.date.toDateString() === new Date().toDateString() ? "2px solid #4361ee" : "none",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "0.75rem", color: "var(--text2, #6b7280)" }}>
              Less
              {[0, 15, 45, 90, 150].map(m => (
                <div key={m} style={{ width: 12, height: 12, borderRadius: 2, background: heatColor(m) }} />
              ))}
              More
            </div>
          </div>

          {/* ── TIME-OF-DAY PRODUCTIVITY MAP (new) ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}><span>🕐</span><h2>Best Study Hours</h2></div>
            {studySessions.length === 0 ? <p className={styles.emptyState}>Complete sessions to see your best hours</p> : (
              <>
                <div className={styles.timeOfDayScroll}>
                  <div className={styles.timeOfDayGrid}>
                    {timeOfDayMap.map((row, dayIdx) => (
                      <div key={dayIdx} className={styles.timeOfDayRow}>
                        <span className={styles.timeOfDayDayLabel}>{DAYS[dayIdx].slice(0, 2)}</span>
                        {row.map((mins, hour) => (
                          <div key={hour}
                            className={styles.timeOfDayCell}
                            title={`${DAYS[dayIdx]} ${String(hour).padStart(2, "0")}:00 — ${mins} min`}
                            style={{ background: heatColor(mins) }} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {bestStudyHour.mins > 0 && (
                  <p className={styles.timeOfDayInsight}>
                    ⭐ Your most productive slot: <strong>{DAYS[bestStudyHour.day]} at {String(bestStudyHour.hour).padStart(2, "0")}:00</strong> ({bestStudyHour.mins} min logged there)
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── MOOD VS ACCURACY (new) ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}><span>🧠</span><h2>Mood vs Accuracy</h2></div>
            {moodAccuracy.length === 0 ? <p className={styles.emptyState}>Log your mood in sessions to see this insight</p> : (
              <div className={styles.moodList}>
                {moodAccuracy.map(({ mood, avg, count }) => (
                  <div key={mood} className={styles.moodRow}>
                    <span className={styles.moodEmoji}>{moodEmoji(mood)}</span>
                    <span className={styles.moodLabel}>{mood.split(" ").slice(1).join(" ")}</span>
                    <div className={styles.moodBarTrack}>
                      <div
                        className={`${styles.moodBarFill} ${avg >= 80 ? styles.moodBarFillHigh : avg >= 50 ? styles.moodBarFillMid : styles.moodBarFillLow}`}
                        style={{ width: `${avg}%` }}
                      />
                    </div>
                    <span className={styles.moodPct}>{avg}%</span>
                    <span className={styles.moodCount}>({count})</span>
                  </div>
                ))}
              </div>
            )}
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

          {/* ── UP NEXT MILESTONE ROADMAP ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}><span>🧗</span><h2>Up Next — Milestones</h2></div>
            {upNextAchievements.length === 0 ? (
              <p className={styles.emptyState}>🎉 You've unlocked every achievement!</p>
            ) : (
              <div className={styles.milestoneList}>
                {upNextAchievements.map(a => (
                  <div key={a.id} className={styles.milestoneItem}>
                    <div className={styles.milestoneRow}>
                      <span className={styles.milestoneTitle}><span>{a.icon}</span><strong>{a.title}</strong></span>
                      <span className={styles.milestoneProgress}>{a.current}/{a.target}</span>
                    </div>
                    <div className={styles.milestoneBarTrack}>
                      <div className={styles.milestoneBarFill} style={{ width: `${a.pct}%` }} />
                    </div>
                    <p className={styles.milestoneDesc}>{a.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── EXAM READINESS (new) ── */}
          {upcomingExams.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHead}><span>🧭</span><h2>Exam Readiness</h2></div>
              <div className={styles.readinessList}>
                {upcomingExams.map(ex => {
                  const r = examReadiness(ex);
                  if (!r) return (
                    <div key={ex.id} className={styles.readinessEmpty}>
                      {ex.examName}: no syllabus chapters added yet
                    </div>
                  );
                  const key = READINESS_KEY[r.status];
                  return (
                    <div key={ex.id} className={styles.readinessItem}>
                      <div className={styles.readinessRow}>
                        <strong className={styles.readinessName}>{ex.examName}</strong>
                        <span className={`${styles.readinessBadge} ${styles[`readiness${key}`]}`}>{readinessLabel[r.status]}</span>
                      </div>
                      <div className={styles.readinessBarTrack}>
                        <div className={`${styles.readinessBarFill} ${styles[`readinessBarFill${key}`]}`} style={{ width: `${r.pct}%` }} />
                      </div>
                      <p className={styles.readinessDetail}>
                        {r.status === "done"
                          ? `All ${r.total} chapters complete!`
                          : `${r.done}/${r.total} chapters done • ${r.daysLeft} days left • need ~${r.requiredPacePerDay} chapters/day`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* ── LEVEL ROADMAP (new) — shows every level, current one highlighted, locked ones dimmed ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}><span>🧬</span><h2>Level Roadmap</h2></div>
            <div className={styles.levelRoadmapList}>
              {levelRoadmap.map(lv => (
                <div
                  key={lv.level}
                  className={`${styles.levelRoadmapItem} ${lv.isCurrent ? styles.levelRoadmapItemCurrent : ""} ${!lv.unlocked ? styles.levelRoadmapItemLocked : ""}`}
                >
                  <div className={styles.levelRoadmapBadge}>{lv.unlocked ? `Lv${lv.level}` : "🔒"}</div>
                  <div className={styles.levelRoadmapBody}>
                    <div className={styles.levelRoadmapRow}>
                      <strong>{lv.title}</strong>
                      <span className={styles.levelRoadmapXp}>{lv.threshold} XP</span>
                    </div>
                    <p className={styles.levelRoadmapPerk}>{lv.perk}</p>
                  </div>
                  {lv.isCurrent && <span className={styles.levelRoadmapHereTag}>You are here</span>}
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.card} ${styles.spanFull}`}>
            <div className={styles.cardHead}><span>🏆</span><h2>Achievements ({achievements.length})</h2></div>
            <div className={styles.achievementsGrid}>
              {sortedAchievements.length === 0 ? <p className={styles.emptyState}>Keep studying to unlock achievements!</p> :
                sortedAchievements.map(a => (
                  <div key={a.id} className={styles.achievementCard}>
                    <span className={styles.achievementIcon}>{a.icon}</span>
                    <h4>{a.title}</h4><p>{a.description}</p>
                    <span className={styles.achievementDate}>🕒 {formatUnlockDate(a.createdAt)}</span>
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
                { icon: "📋", num: upcomingExams.length, lbl: "Upcoming" },
                { icon: "⏳", num: avgExamDays ?? "—", lbl: "Avg Days Left" },
                { icon: "🔴", num: upcomingExams.filter(e => { const cd = getCD(e.examDate); return !cd.done && cd.d < 30; }).length, lbl: "Critical (<30d)" },
                { icon: "✅", num: exams.filter(e => new Date(e.examDate) <= new Date()).length, lbl: "Completed" },
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
                const sylSt = syllabusStatsByExam(ex.id);
                const readiness = examReadiness(ex);
                return (
                  <div key={ex.id} className={`${styles.examCountdownCard} ${!cd.done && cd.d < 7 ? styles.examUrgent : !cd.done && cd.d < 30 ? styles.examWarning : ""}`}>
                    <div className={styles.examCountdownInfo}>
                      <div className={styles.examHeader}>
                        <h4>{ex.examName}</h4>
                        <span className={`${styles.priorityBadge} ${styles[`priority_${ex.priority?.toLowerCase()}`]}`}>{ex.priority}</span>
                        {ex.targetScore && <span className={styles.examTargetScoreBadge}>🎯 Target: {ex.targetScore}</span>}
                        {sylSt.total > 0 && (
                          <button
                            className={styles.examSyllabusBtn}
                            onClick={() => { setSyllabusViewExam(ex.id); setActiveTab("syllabus"); }}
                          >
                            📖 Syllabus {sylSt.pct}%
                          </button>
                        )}
                        {readiness && (
                          <span className={`${styles.examReadinessPill} ${styles[`examReadinessPill${READINESS_KEY[readiness.status]}`]}`}>
                            {readinessLabel[readiness.status]}
                          </span>
                        )}
                      </div>
                      {ex.subjects && <p className={styles.examSubjects}>📚 {ex.subjects}</p>}
                      {ex.notes && <p className={styles.examNotes}>📌 {ex.notes}</p>}
                      {sylSt.total > 0 && (
                        <div className={styles.examInlineSyllabus}>
                          <div className={styles.examInlineSyllabusBar}>
                            <div className={styles.examInlineSyllabusFill} style={{ width: `${sylSt.pct}%` }} />
                          </div>
                          <span className={styles.examInlineSyllabusText}>
                            {sylSt.done}/{sylSt.total} chapters done
                          </span>
                        </div>
                      )}
                      {readiness && readiness.status !== "done" && (
                        <p className={styles.examReadinessNote}>
                          🧭 Need ~{readiness.requiredPacePerDay} chapters/day to finish in time
                        </p>
                      )}
                      {cd.done ? <p className={styles.examCompletedText}>✅ Exam Complete!</p> : (
                        <div className={styles.countdownGrid}>
                          {[{ v: cd.d, l: "Days" }, { v: cd.h, l: "Hours" }, { v: cd.m, l: "Mins" }, { v: cd.s, l: "Secs" }].map(u => (
                            <div key={u.l} className={styles.countdownUnit}>
                              <span className={styles.countdownNumber}>{u.v}</span>
                              <span className={styles.countdownLabel}>{u.l}</span>
                            </div>
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

      {/* ══════ SYLLABUS ══════ */}
      {activeTab === "syllabus" && (
        <div className={styles.syllabusWrap}>

          {/* ── Add Chapter ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span>📖</span><h2>Add Syllabus Chapter</h2>
              <div className={styles.cardHeadRight}>
                <span className={styles.syllabusStatBadge}>
                  ✅ {syllabusItems.filter(s => s.status === "done").length} / {syllabusItems.length} complete
                </span>
              </div>
            </div>
            <div className={styles.syllabusForm}>
              <select value={selectedExamForSyllabus} onChange={e => setSelectedExamForSyllabus(e.target.value)} className={styles.formSelect}>
                <option value="">-- Select Exam --</option>
                {upcomingExams.map(e => <option key={e.id} value={e.id}>{e.examName}</option>)}
              </select>
              <select value={newSyllabusSubject} onChange={e => setNewSyllabusSubject(e.target.value)} className={styles.formSelect}>
                <option value="">-- Subject (optional) --</option>
                {allSubjects.map(s => <option key={s}>{s}</option>)}
              </select>
              <input
                placeholder="Chapter / Topic name..."
                value={newSyllabusChapter}
                onChange={e => setNewSyllabusChapter(e.target.value)}
                onKeyPress={e => e.key === "Enter" && addSyllabusItem()}
                className={styles.formInput}
              />
              <select value={newSyllabusPriority} onChange={e => setNewSyllabusPriority(e.target.value)} className={styles.formSelect}>
                <option>High</option><option>Medium</option><option>Low</option>
              </select>
              <input
                placeholder="Notes (optional)"
                value={newSyllabusNotes}
                onChange={e => setNewSyllabusNotes(e.target.value)}
                className={styles.formInput}
              />
              <button onClick={addSyllabusItem} className={styles.addBtn}>+ Add Chapter</button>
            </div>
          </div>

          {/* ── Exam Progress Overview ── */}
          {upcomingExams.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHead}><span>📊</span><h2>Exam-wise Progress</h2>
                {syllabusViewExam !== "all" && (
                  <button className={styles.smBtn} onClick={() => setSyllabusViewExam("all")} style={{ marginLeft: "auto" }}>
                    ✕ Clear Filter
                  </button>
                )}
              </div>
              <div className={styles.examProgressGrid}>
                {upcomingExams.map(ex => {
                  const st = syllabusStatsByExam(ex.id);
                  return (
                    <div
                      key={ex.id}
                      className={`${styles.examProgressCard} ${syllabusViewExam === ex.id ? styles.examProgressCardActive : ""}`}
                      onClick={() => setSyllabusViewExam(v => v === ex.id ? "all" : ex.id)}
                    >
                      <div className={styles.examProgressHeader}>
                        <h4>{ex.examName}</h4>
                        <span className={`${styles.priorityBadge} ${styles[`priority_${ex.priority?.toLowerCase()}`]}`}>{ex.priority}</span>
                      </div>
                      {st.total > 0 ? (
                        <>
                          <div className={styles.examProgressStats}>
                            <span className={styles.epDone}>✅ {st.done} done</span>
                            <span className={styles.epInProg}>🔄 {st.inProg} in progress</span>
                            <span className={styles.epPending}>⏳ {st.total - st.done - st.inProg} pending</span>
                          </div>
                          <div className={styles.epBarWrap}>
                            <div className={styles.epBar}>
                              <div className={styles.epBarFill} style={{ width: `${st.pct}%` }} />
                            </div>
                            <span className={styles.epPct}>{st.pct}%</span>
                          </div>
                        </>
                      ) : (
                        <p className={styles.epEmpty}>No chapters added yet — click to add!</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {upcomingExams.length === 0 && (
            <div className={styles.card}>
              <p className={styles.emptyState}>
                📋 No upcoming exams found. First add an exam in the <strong>Exams</strong> tab, then come back here to add chapters!
              </p>
            </div>
          )}

          {/* ── Chapter List ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span>📋</span>
              <h2>
                Chapters ({filteredSyllabus.length}
                {syllabusViewExam !== "all" ? ` · ${upcomingExams.find(e => e.id === syllabusViewExam)?.examName || ""}` : ""})
              </h2>
            </div>

            <div className={styles.filterRow}>
              <input
                placeholder="🔍 Search chapters or subjects..."
                value={syllabusSearch}
                onChange={e => setSyllabusSearch(e.target.value)}
                className={styles.searchInput}
              />
              <div className={styles.filterBtns}>
                {[
                  { k: "all",         label: `All (${syllabusItems.length})` },
                  { k: "pending",     label: `⏳ Pending (${syllabusItems.filter(s => s.status === "pending").length})` },
                  { k: "in_progress", label: `🔄 Doing (${syllabusItems.filter(s => s.status === "in_progress").length})` },
                  { k: "done",        label: `✅ Done (${syllabusItems.filter(s => s.status === "done").length})` },
                ].map(({ k, label }) => (
                  <button
                    key={k}
                    className={`${styles.filterChip} ${syllabusFilter === k ? styles.filterChipActive : ""}`}
                    onClick={() => setSyllabusFilter(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select value={syllabusViewExam} onChange={e => setSyllabusViewExam(e.target.value)} className={styles.formSelect}>
                <option value="all">All Exams</option>
                {upcomingExams.map(e => <option key={e.id} value={e.id}>{e.examName}</option>)}
              </select>
            </div>

            <div className={styles.syllabusChapterList}>
              {filteredSyllabus.length === 0 ? (
                <p className={styles.emptyState}>No chapters found. Add some above! ☝️</p>
              ) : (
                filteredSyllabus
                  .sort((a, b) => {
                    const pri = { High: 0, Medium: 1, Low: 2 };
                    const statusOrder = { pending: 0, in_progress: 1, done: 2 };
                    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
                    return (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1);
                  })
                  .map(item => (
                    <div
                      key={item.id}
                      className={`${styles.syllabusChapterCard} ${item.status === "done" ? styles.scDone : ""} ${item.status === "in_progress" ? styles.scInProgress : ""}`}
                    >
                      <button
                        className={styles.scStatusBtn}
                        title="Click to cycle: Pending → In Progress → Done → Pending"
                        onClick={() => {
                          const next = item.status === "pending" ? "in_progress" : item.status === "in_progress" ? "done" : "pending";
                          updateSyllabusStatus(item.id, next);
                        }}
                      >
                        {item.status === "done" ? "✅" : item.status === "in_progress" ? "🔄" : "⏳"}
                      </button>

                      <div className={styles.scBody}>
                        <div className={styles.scTop}>
                          <span className={styles.scExamTag}>{item.examName}</span>
                          {item.subject && (
                            <span className={styles.scSubjectTag} style={{ background: getSubjectColor(item.subject) }}>
                              {item.subject}
                            </span>
                          )}
                          <span className={`${styles.priorityBadge} ${styles[`priority_${item.priority?.toLowerCase()}`]}`}>
                            {item.priority}
                          </span>
                          <span className={`${styles.scStatusLabel} ${styles[`scStatus_${item.status}`]}`}>
                            {item.status === "in_progress" ? "In Progress" : item.status === "done" ? "Done" : "Pending"}
                          </span>
                        </div>
                        <h3 className={styles.scChapterName}>{item.chapter}</h3>
                        {item.notes && <p className={styles.scNotes}>📌 {item.notes}</p>}
                      </div>

                      <div className={styles.scActions}>
                        <button className={styles.scActionBtn} onClick={() => updateSyllabusStatus(item.id, "pending")} title="Mark Pending">⏳</button>
                        <button className={styles.scActionBtn} onClick={() => updateSyllabusStatus(item.id, "in_progress")} title="Mark In Progress">🔄</button>
                        <button className={`${styles.scActionBtn} ${styles.scActionBtnGreen}`} onClick={() => updateSyllabusStatus(item.id, "done")} title="Mark Done">✅</button>
                        <button onClick={() => deleteSyllabusItem(item.id)} className={`${styles.iconBtnSm} ${styles.iconBtnDanger}`}>🗑</button>
                      </div>
                    </div>
                  ))
              )}
            </div>
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
