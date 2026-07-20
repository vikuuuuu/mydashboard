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

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────
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
  { id: "weekend_warrior",       icon: "🏖️", title: "Weekend Warrior",    description: "Study on both Saturday and Sunday",         check: (s) => s.weekendWarrior },
  { id: "achievement_hunter",    icon: "🗺️", title: "Achievement Hunter", description: "Unlock 10 achievements",                   check: (s) => s.achievementsUnlocked >= 10 },
  { id: "comeback_kid",          icon: "💪", title: "Comeback Kid",       description: "Resume a 3+ day streak after a gap",       check: (s) => s.comebackFlag },
];

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

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];
const LEVEL_TITLES = ["Novice", "Learner", "Scholar", "Achiever", "Focused Mind", "Consistent Grinder", "Knowledge Seeker", "Study Master", "Elite Learner", "Legend"];
const LEVEL_STEP_AFTER_MAX = 1500;

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

const moodEmoji = (mood) => (mood || "").split(" ")[0];

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

  // Subjects & Dependency Tree
  const [customSubjects, setCustomSubjects] = useState([]);
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [dependencies, setDependencies] = useState([]); // Array of { parent, child }
  const [depParent, setDepParent] = useState("");
  const [depChild, setDepChild] = useState("");

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
  const [pomodoroTotal, setPomodoroTotal] = useState(0);

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

  // Syllabus
  const [syllabusItems, setSyllabusItems] = useState([]);
  const [selectedExamForSyllabus, setSelectedExamForSyllabus] = useState("");
  const [newSyllabusChapter, setNewSyllabusChapter] = useState("");
  const [newSyllabusSubject, setNewSyllabusSubject] = useState("");
  const [newSyllabusPriority, setNewSyllabusPriority] = useState("High");
  const [newSyllabusNotes, setNewSyllabusNotes] = useState("");
  const [syllabusFilter, setSyllabusFilter] = useState("all");
  const [syllabusSearch, setSyllabusSearch] = useState("");
  const [syllabusViewExam, setSyllabusViewExam] = useState("all");

  // Notes & AI Generator Modal
  const [quickNotes, setQuickNotes] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteTag, setNoteTag] = useState("");
  const [savedNotes, setSavedNotes] = useState([]);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [noteTagFilter, setNoteTagFilter] = useState("");
  
  // AI Modal States
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPromptText, setAiPromptText] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Flashcards (SRS Integrated)
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

  // Analytics & Gamification / Shop
  const [weeklyProgress, setWeeklyProgress] = useState([]);
  const [subjectStats, setSubjectStats] = useState({});
  const [streak, setStreak] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [currentActiveClass, setCurrentActiveClass] = useState(null);
  const [upcomingClasses, setUpcomingClasses] = useState([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [comebackFlag, setComebackFlag] = useState(false);
  const [streakFreezes, setStreakFreezes] = useState(0);

  // Habits
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [habitFreq, setHabitFreq] = useState("daily");

  // ─── AUDIO SOUNDSCAPES STATE ─────────────────────────────────────────────
  const [activeSound, setActiveSound] = useState("none"); // "none" | "rain" | "white" | "binaural"
  const audioCtxRef = useRef(null);
  const soundNodesRef = useRef([]);

  const fileInputRef = useRef(null);
  const achievementsRef = useRef([]);
  const unlockingRef = useRef(new Set());

  const currentDayName = DAYS[new Date().getDay()];
  const allSubjects = useMemo(() => [...DEFAULT_SUBJECTS, ...customSubjects], [customSubjects]);

  const showToast = useCallback((msg, type = "success") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // ─── FEATURE 1: AUDIO SOUNDSCAPES SYNTHESIZER ────────────────────────────
  const stopSoundscapes = useCallback(() => {
    soundNodesRef.current.forEach(node => {
      try { node.stop ? node.stop() : node.disconnect(); } catch (e) {}
    });
    soundNodesRef.current = [];
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const startSoundscape = useCallback((type) => {
    stopSoundscapes();
    if (type === "none") return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      showToast("Web Audio API is not supported in this browser.", "error");
      return;
    }
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    if (type === "binaural") {
      // 200Hz left, 210Hz right (10Hz Alpha Waves for focus)
      const oscL = ctx.createOscillator();
      const oscR = ctx.createOscillator();
      const merger = ctx.createChannelMerger(2);
      const gain = ctx.createGain();
      gain.gain.value = 0.08;

      oscL.type = "sine"; oscL.frequency.value = 200;
      oscR.type = "sine"; oscR.frequency.value = 210;

      oscL.connect(merger, 0, 0); // left
      oscR.connect(merger, 0, 1); // right
      merger.connect(gain);
      gain.connect(ctx.destination);

      oscL.start(); oscR.start();
      soundNodesRef.current = [oscL, oscR, gain];
    } else if (type === "white" || type === "rain") {
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const gain = ctx.createGain();
      gain.gain.value = type === "rain" ? 0.12 : 0.04;

      if (type === "rain") {
        // Lowpass filter for Rain sound effect
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 800;
        whiteNoise.connect(filter);
        filter.connect(gain);
      } else {
        whiteNoise.connect(gain);
      }

      gain.connect(ctx.destination);
      whiteNoise.start();
      soundNodesRef.current = [whiteNoise, gain];
    }
  }, [stopSoundscapes, showToast]);

  const toggleSoundscape = (type) => {
    if (activeSound === type) {
      setActiveSound("none");
      stopSoundscapes();
    } else {
      setActiveSound(type);
      startSoundscape(type);
    }
  };

  useEffect(() => {
    return () => stopSoundscapes();
  }, [stopSoundscapes]);

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
      logToolUsage({ userId: u.uid, tool: "Study Hub", action: "visit", metadata: { version: "6.0" } });
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
    listenCol("subject_dependencies", setDependencies);

    const qSess = query(collection(db, "study_sessions"), where("userId", "==", uid));
    unsubs.push(onSnapshot(qSess, snap => {
      const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setStudySessions(sessions);
      calculateStats(sessions);
    }));

    unsubs.push(onSnapshot(doc(db, "study_pomodoro_stats", uid), snap => {
      setPomodoroTotal(snap.exists() ? (snap.data().totalCompleted || 0) : 0);
    }));

    unsubs.push(onSnapshot(doc(db, "study_user_meta", uid), snap => {
      if (snap.exists()) setStreakFreezes(snap.data().streakFreezes || 0);
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

  // ─── STUDY TIMER ─────────────────────────────────────────────────────────
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

  // ─── POMODORO TIMER ──────────────────────────────────────────────────────
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

  // Page Visibility
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

  // ─── FEATURE 7: SUBJECT DEPENDENCY TREE CRUD ────────────────────────────
  const addDependency = async () => {
    if (!depParent || !depChild || !user) { showToast("Select both parent & child subject!", "error"); return; }
    if (depParent === depChild) { showToast("Subject cannot depend on itself!", "error"); return; }
    await addDoc(collection(db, "subject_dependencies"), {
      userId: user.uid, parent: depParent, child: depChild, createdAt: serverTimestamp()
    });
    setDepParent(""); setDepChild("");
    showToast("Dependency link added! 🔗");
  };

  const deleteDependency = async (id) => {
    await deleteDoc(doc(db, "subject_dependencies", id));
    showToast("Dependency removed");
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

  // TIMETABLE CRUD
  const addTask = async () => {
    if (!subject || !startTime || !endTime || !user) { showToast("Please fill all required fields!", "error"); return; }
    if (startTime >= endTime) { showToast("End time must be after start time!", "error"); return; }
    const daysToAdd = repeatDays.length > 0 ? repeatDays : [day];
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
      const data = { tasks, customSubjects, exportedAt: new Date().toISOString(), version: "6.0" };
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
  };

  // EXAM CRUD
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

  // SYLLABUS CRUD
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
    setNewSyllabusChapter(""); setNewSyllabusSubject(""); setNewSyllabusNotes("");
    showToast("📖 Chapter added to syllabus!");
  };

  const updateSyllabusStatus = async (id, status) => {
    await updateDoc(doc(db, "study_syllabus", id), {
      status,
      completedAt: status === "done" ? serverTimestamp() : null,
    });
    showToast(status === "done" ? "✅ Marked complete!" : status === "in_progress" ? "🔄 In progress!" : "⏳ Marked pending");
  };

  const deleteSyllabusItem = async (id) => {
    await deleteDoc(doc(db, "study_syllabus", id));
    showToast("Syllabus item deleted");
  };

  // NOTES CRUD & FEATURE 6: AI GENERATOR
  const saveNote = async () => {
    if (!quickNotes) { showToast("Please write something!", "error"); return; }
    if (editingNoteId) {
      await updateDoc(doc(db, "study_notes", editingNoteId), { title: noteTitle || "Untitled", content: quickNotes, tag: noteTag, updatedAt: serverTimestamp() });
      setEditingNoteId(null); showToast("Note updated!");
    } else {
      await addDoc(collection(db, "study_notes"), { userId: user.uid, title: noteTitle || "Untitled", content: quickNotes, tag: noteTag, createdAt: serverTimestamp() });
      showToast("Note saved! 📝");
    }
    setQuickNotes(""); setNoteTitle(""); setNoteTag("");
  };

  const deleteNote = async (id) => {
    await deleteDoc(doc(db, "study_notes", id));
    showToast("Note deleted");
  };

  const editNote = (note) => {
    setNoteTitle(note.title); setQuickNotes(note.content);
    setNoteTag(note.tag || ""); setEditingNoteId(note.id); setActiveTab("notes");
  };

  const runAiGenerator = async () => {
    if (!aiPromptText.trim()) { showToast("Please enter text or a topic!", "error"); return; }
    setIsAiProcessing(true);
    try {
      // Fast Client-side Smart Extractor simulation (Generate Summary & 2 Flashcards)
      const text = aiPromptText.trim();
      const summaryText = `📌 AI Summary:\n${text.slice(0, 200)}...\n\nKey Concepts Identified:\n• Core Principle\n• Practical Application`;
      
      await addDoc(collection(db, "study_notes"), {
        userId: user.uid, title: `AI: ${text.slice(0, 20)}...`, content: summaryText, tag: "AI Generated", createdAt: serverTimestamp()
      });

      // Auto Generate Flashcard
      await addDoc(collection(db, "study_flashcards"), {
        userId: user.uid, front: `What is the main idea of: ${text.slice(0, 30)}...?`, back: text.slice(0, 100),
        subject: "General", tag: "AI Generated", reviewCount: 0, confidence: 0, interval: 1, easeFactor: 2.5, nextReviewDate: new Date().toISOString(), createdAt: serverTimestamp()
      });

      showToast("🤖 AI generated Notes & Flashcards!");
      setShowAiModal(false); setAiPromptText("");
    } catch (e) {
      showToast("Error generating AI content", "error");
    } finally {
      setIsAiProcessing(false);
    }
  };

  // FLASHCARD CRUD & FEATURE 2: ANKI SRS (SM-2 ALGORITHM)
  const addFlashcard = async () => {
    if (!newFront || !newBack) { showToast("Please fill front and back!", "error"); return; }
    await addDoc(collection(db, "study_flashcards"), {
      userId: user.uid, front: newFront, back: newBack, subject: newCardSubject || "General",
      tag: newCardTag, reviewCount: 0, confidence: 0, interval: 1, easeFactor: 2.5,
      nextReviewDate: new Date().toISOString(), createdAt: serverTimestamp()
    });
    setNewFront(""); setNewBack(""); showToast("Flashcard added! 🗂️");
  };

  const deleteFlashcard = async (id) => {
    await deleteDoc(doc(db, "study_flashcards", id));
    showToast("Flashcard deleted");
  };

  const startReview = (subjectFilter = "all") => {
    let cards = subjectFilter === "all" ? [...flashcards] : flashcards.filter(f => f.subject === subjectFilter);
    // Filter due cards (nextReviewDate <= today) or unreviewed
    const now = new Date().toISOString();
    cards = cards.filter(c => !c.nextReviewDate || c.nextReviewDate <= now);

    if (cards.length === 0) {
      showToast("🎉 No due cards to review right now! Great job!", "info");
      return;
    }

    if (shuffleCards) cards = cards.sort(() => Math.random() - 0.5);
    setReviewCards(cards); setReviewIndex(0); setShowAnswer(false); setReviewMode(true);
  };

  const rateCardSRS = async (id, quality) => {
    // SuperMemo-2 (SM-2) Algorithm implementation
    const card = flashcards.find(f => f.id === id);
    if (!card) return;

    let reps = card.reviewCount || 0;
    let interval = card.interval || 1;
    let ease = card.easeFactor || 2.5;

    if (quality >= 3) {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 6;
      else interval = Math.round(interval * ease);
      reps += 1;
    } else {
      reps = 0;
      interval = 1;
    }

    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ease < 1.3) ease = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    await updateDoc(doc(db, "study_flashcards", id), {
      confidence: quality, reviewCount: reps, interval, easeFactor: ease,
      nextReviewDate: nextDate.toISOString(), lastReviewed: serverTimestamp()
    });

    if (reviewIndex < reviewCards.length - 1) {
      setReviewIndex(reviewIndex + 1); setShowAnswer(false);
    } else {
      setReviewMode(false);
      showToast(`🎉 Review complete! Next review calculated via SRS algorithm.`);
    }
  };

  // TODO CRUD
  const addTodo = async () => {
    if (!newTodo) { showToast("Please write a todo!", "error"); return; }
    await addDoc(collection(db, "study_todos"), { userId: user.uid, text: newTodo, subject: todoSubject, dueDate: todoDue, priority: todoPriority, tag: todoTag, completed: false, createdAt: serverTimestamp() });
    setNewTodo(""); setTodoDue(""); setTodoSubject(""); setTodoTag("");
    showToast("Todo added! ✅");
  };

  const toggleTodo = async (id, completed) => {
    await updateDoc(doc(db, "study_todos", id), { completed: !completed });
  };

  const deleteTodo = async (id) => {
    await deleteDoc(doc(db, "study_todos", id));
    showToast("Todo deleted");
  };

  // HABITS CRUD
  const addHabit = async () => {
    if (!newHabit.trim() || !user) return;
    await addDoc(collection(db, "study_habits"), {
      userId: user.uid, text: newHabit.trim(), freq: habitFreq, completedDates: [], createdAt: serverTimestamp()
    });
    setNewHabit(""); showToast("Habit added! 🌱");
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
    await updateDoc(doc(db, "study_habits", id), { completedDates: updatedDates });
  };

  const deleteHabit = async (id) => {
    await deleteDoc(doc(db, "study_habits", id));
    showToast("Habit deleted");
  };

  // GAMIFICATION & FEATURE 5: STREAK FREEZE SHOP
  const combinedStats = useMemo(() => {
    const totalMins = studySessions.reduce((a, s) => a + (s.actualTime || 0), 0);
    const avgAccuracy = studySessions.length
      ? Math.round(studySessions.reduce((a, s) => a + (s.accuracyPercentage || 0), 0) / studySessions.length)
      : 0;
    const syllabusDone = syllabusItems.filter(s => s.status === "done").length;
    const todosDone = todos.filter(t => t.completed).length;
    const habitCheckins = habits.reduce((a, h) => a + (h.completedDates?.length || 0), 0);
    const earlyBird = studySessions.some(s => (s.createdAt?.toDate?.() || new Date(s.createdAt)).getHours() < 6);
    const nightOwl = studySessions.some(s => (s.createdAt?.toDate?.() || new Date(s.createdAt)).getHours() >= 23);

    const subjectMinutes = {};
    studySessions.forEach(s => { subjectMinutes[s.subjectName] = (subjectMinutes[s.subjectName] || 0) + (s.actualTime || 0); });
    const maxSubjectMins = Math.max(0, ...Object.values(subjectMinutes));
    const uniqueSubjectsCount = Object.keys(subjectMinutes).length;

    const startOfThisWeek = getStartOfWeek();
    const thisWeekSubjects = new Set(studySessions.filter(s => (s.createdAt?.toDate?.() || new Date(s.createdAt)) >= startOfThisWeek).map(s => s.subjectName));

    const weekendDays = new Set(studySessions.map(s => s.createdAt?.toDate?.() || new Date(s.createdAt)).filter(d => d.getDay() === 0 || d.getDay() === 6).map(d => d.getDay()));
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
  }, [combinedStats, user]);

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

  const buyStreakFreeze = async () => {
    const cost = 300;
    if (totalXP < cost) { showToast(`You need ${cost} XP to buy a Streak Freeze!`, "error"); return; }
    if (!user) return;
    await setDoc(doc(db, "study_user_meta", user.uid), {
      userId: user.uid, streakFreezes: increment(1), updatedAt: serverTimestamp()
    }, { merge: true });
    showToast("🛡️ Streak Freeze Purchased!");
  };

  const heatmapData = useMemo(() => {
    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toDateString();
      const mins = studySessions.filter(s => {
        const sd = s.createdAt?.toDate?.() || new Date(s.createdAt);
        return sd.toDateString() === ds;
      }).reduce((a, s) => a + (s.actualTime || 0), 0);
      days.push({ date: d, mins });
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

  // FEATURE 4: TIME OF DAY MAP
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

  const moodAccuracy = useMemo(() => {
    const byMood = {};
    studySessions.forEach(s => {
      if (!s.mood) return;
      if (!byMood[s.mood]) byMood[s.mood] = { total: 0, count: 0 };
      byMood[s.mood].total += s.accuracyPercentage || 0;
      byMood[s.mood].count += 1;
    });
    return Object.entries(byMood).map(([mood, v]) => ({ mood, avg: Math.round(v.total / v.count), count: v.count })).sort((a, b) => b.avg - a.avg);
  }, [studySessions]);

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

  const weeklyChallenge = useMemo(() => {
    const startOfWeek = getStartOfWeek();
    const minsThisWeek = studySessions.filter(s => (s.createdAt?.toDate?.() || new Date(s.createdAt)) >= startOfWeek).reduce((a, s) => a + (s.actualTime || 0), 0);
    const target = 3500;
    return {
      target, current: minsThisWeek, pct: Math.min(Math.round((minsThisWeek / target) * 100), 100),
      weekKey: getWeekKey(), completed: minsThisWeek >= target,
    };
  }, [studySessions]);

  const upNextAchievements = useMemo(() => {
    const unlockedIds = new Set(achievements.map(a => a.achievementId));
    return ACHIEVEMENTS_LIST.filter(a => !unlockedIds.has(a.id)).map(a => {
      const progressFn = ACHIEVEMENT_PROGRESS[a.id];
      const [current, target] = progressFn ? progressFn(combinedStats) : [0, 1];
      return { ...a, current, target, pct: Math.min(Math.round((current / target) * 100), 99) };
    }).sort((a, b) => b.pct - a.pct).slice(0, 4);
  }, [achievements, combinedStats]);

  const totalStudiedMins = combinedStats.totalMins;
  const avgAccuracy = combinedStats.avgAccuracy;
  const todayStudied = useMemo(() => studySessions.filter(s => (s.createdAt?.toDate?.() || new Date(s.createdAt)).toDateString() === new Date().toDateString()).reduce((a, s) => a + (s.actualTime || 0), 0), [studySessions]);

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
  }).sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority || "Medium"] - { High: 0, Medium: 1, Low: 2 }[b.priority || "Medium"])), [todos, todoFilter, todoSearch]);

  const allNoteTags = useMemo(() => [...new Set(savedNotes.map(n => n.tag).filter(Boolean))], [savedNotes]);
  const allCardSubjects = useMemo(() => [...new Set(flashcards.map(f => f.subject).filter(Boolean))], [flashcards]);
  const filteredFlashcards = useMemo(() => (
    cardSubjectFilter === "all" ? flashcards : flashcards.filter(f => f.subject === cardSubjectFilter)
  ), [flashcards, cardSubjectFilter]);
  const avgExamDays = useMemo(() => getExamAvgDaysRemaining(), [exams, currentTime]);
  const upcomingExams = useMemo(() => exams.filter(e => new Date(e.examDate) > new Date()), [exams, currentTime]);

  const filteredSyllabus = useMemo(() => syllabusItems.filter(s => {
    const matchExam = syllabusViewExam === "all" || s.examId === syllabusViewExam;
    const matchStatus = syllabusFilter === "all" || s.status === syllabusFilter;
    const matchSearch = !syllabusSearch || s.chapter.toLowerCase().includes(syllabusSearch.toLowerCase()) || (s.subject || "").toLowerCase().includes(syllabusSearch.toLowerCase());
    return matchExam && matchStatus && matchSearch;
  }), [syllabusItems, syllabusViewExam, syllabusFilter, syllabusSearch]);

  const syllabusStatsByExam = useCallback((examId) => {
    const items = syllabusItems.filter(s => s.examId === examId);
    const done = items.filter(s => s.status === "done").length;
    const inProg = items.filter(s => s.status === "in_progress").length;
    return { total: items.length, done, inProg, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
  }, [syllabusItems]);

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
  const READINESS_KEY = { "done": "Done", "on-track": "OnTrack", "manageable": "Manageable", "at-risk": "AtRisk" };

  const currentYear = currentTime.getFullYear();
  const yearStart = new Date(`${currentYear}-01-01`);
  const yearEnd = new Date(`${currentYear + 1}-01-01`);
  const yearPct = Math.round(((currentTime - yearStart) / (yearEnd - yearStart)) * 100);

  // FULLSCREEN STUDY MODE
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
            <div className={styles.studyFsAccurateBadge}>⚡ Accurate Timer</div>
            <button className={styles.studyFsEsc} onClick={() => setStudyFullScreen(false)}>⤡ Minimize</button>
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

          {/* SOUNDSCAPE CONTROL BAR IN FULLSCREEN MODE */}
          <div className={styles.audioBar}>
            <span>🔊 Soundscape:</span>
            {["none", "rain", "white", "binaural"].map(snd => (
              <button key={snd} className={`${styles.smBtn} ${activeSound === snd ? styles.presetBtnActive : ""}`} onClick={() => toggleSoundscape(snd)}>
                {snd === "none" ? "🔇 Off" : snd === "rain" ? "🌧️ Rain" : snd === "white" ? "💨 White" : "🎧 Binaural"}
              </button>
            ))}
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
            <input placeholder="Tags (e.g. exam-prep)" value={sessionTags} onChange={e => setSessionTags(e.target.value)} className={styles.studyFsTagInput} />
          </div>

          <div className={styles.studyFsActions}>
            <button onClick={stopStudyMode} className={styles.studyFsStop}>⏹ Stop & Save Session</button>
            <button onClick={() => setStudyFullScreen(false)} className={styles.studyFsMin}>⤡ Minimize</button>
          </div>
        </div>
      </div>
    );
  }

  // FULLSCREEN TIMETABLE
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
                        <div key={t.id} className={`${styles.fullScreenSlot} ${isTaskActive(t) ? styles.activeSlot : ""}`} style={{ borderLeft: `4px solid ${t.color || getSubjectColor(t.subject)}` }}>
                          <span className={styles.slotTime}>{t.startTime}–{t.endTime}</span>
                          <h4>{t.subject}</h4>
                          <span className={styles.slotType}>{t.taskType}</span>
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
                  <div key={t.id} className={`${styles.dayViewSlot} ${isTaskActive(t) ? styles.activeSlot : ""}`} style={{ borderLeft: `6px solid ${t.color || getSubjectColor(t.subject)}` }}>
                    <div className={styles.slotTimeBlock}><span className={styles.slotStartTime}>{t.startTime}</span></div>
                    <div className={styles.slotContent}><h3>{t.subject}</h3></div>
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

      {/* TOP BAR */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push("/dashboard")}>← Back</button>
        <div className={styles.leftControls}>
          <button className={`${styles.controlBtn} ${darkMode ? styles.controlBtnActive : ""}`} onClick={() => setDarkMode(p => !p)} title="Theme">
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button className={`${styles.controlBtn} ${!notificationsEnabled ? styles.controlBtnMuted : ""}`} onClick={() => setNotificationsEnabled(p => !p)} title="Notifications">
            {notificationsEnabled ? "🔔" : "🔕"}
          </button>
        </div>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Study Hub <span className={styles.vBadge}>v6.0</span></h1>
          <p className={styles.subtitle}>{currentTime.toLocaleTimeString("en-IN")} • {currentDayName}</p>
        </div>
      </div>

      {/* LEVEL / XP & SHOP BANNER */}
      <div className={styles.xpBanner}>
        <div className={styles.xpAvatar}>Lv{levelInfo.level}</div>
        <div className={styles.xpInfo}>
          <div className={styles.xpTitleRow}>
            <strong>{levelInfo.title}</strong>
            <span>{totalXP} XP • 🛡️ {streakFreezes} Freezes</span>
          </div>
          <div className={styles.xpBarTrack}><div className={styles.xpBarFill} style={{ width: `${levelInfo.pct}%` }} /></div>
        </div>
        <button className={styles.shopBtn} onClick={buyStreakFreeze}>🛒 Buy Freeze (300 XP)</button>
      </div>

      {/* STREAK BANNER */}
      <div className={styles.streakBanner}>
        <div className={styles.streakItem}>🔥<div><span className={styles.streakNumber}>{streak}</span><span className={styles.streakLabel}>Streak</span></div></div>
        <div className={styles.streakItem}>🎯<div><span className={styles.streakNumber}>{todayStudied}/{studyGoalMinutes}</span><span className={styles.streakLabel}>Today (m)</span></div></div>
        <div className={styles.streakItem}>🏆<div><span className={styles.streakNumber}>{achievements.length}</span><span className={styles.streakLabel}>Badges</span></div></div>
      </div>

      {/* TAB NAV */}
      <div className={styles.tabNav}>
        {[
          { id: "timetable",  label: "📅 Timetable"  },
          { id: "study",      label: "⏱️ Study Mode"  },
          { id: "analytics",  label: "📊 Analytics"   },
          { id: "exams",      label: "🎯 Exams & Boss" },
          { id: "syllabus",   label: "📖 Syllabus"    },
          { id: "notes",      label: "📝 Notes & AI"  },
          { id: "flashcards", label: "🗂️ Flashcard SRS" },
          { id: "todo",       label: "✅ Todo"         },
          { id: "habits",     label: "🌱 Habits"      },
          { id: "tree",       label: "🔗 Subject Tree"},
        ].map(t => (
          <button key={t.id} className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabActive : ""}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════ TIMETABLE ══════ */}
      {activeTab === "timetable" && (
        <div className={styles.card}>
          <div className={styles.cardHead}><span>📅</span><h2>Timetable</h2></div>
          <div className={styles.timetableForm}>
            <select value={day} onChange={e => setDay(e.target.value)} className={styles.formSelect}>{DAYS.map(d => <option key={d}>{d}</option>)}</select>
            <select value={subject} onChange={e => setSubject(e.target.value)} className={styles.formSelect}>
              <option value="">-- Select Subject --</option>
              {allSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={styles.formInput} />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={styles.formInput} />
            <button onClick={addTask} className={styles.addBtn}>+ Add Slot</button>
          </div>
          <div className={styles.taskList}>
            {filteredTasks.map(t => (
              <div key={t.id} className={styles.taskCard}>
                <div><strong>{t.subject}</strong> ({t.startTime}–{t.endTime})</div>
                <button onClick={() => deleteTask(t.id)} className={styles.miniDeleteBtn}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ STUDY MODE ══════ */}
      {activeTab === "study" && (
        <div className={styles.studyGrid}>
          <div className={styles.card}>
            <div className={styles.cardHead}><span>⏱️</span><h2>Study Timer</h2></div>
            {!isStudyMode ? (
              <div className={styles.studySetupForm}>
                <select value={activeSubject} onChange={e => setActiveSubject(e.target.value)} className={styles.formSelect}>
                  <option value="">-- Select Subject --</option>
                  {allSubjects.map(s => <option key={s}>{s}</option>)}
                </select>
                <input type="number" placeholder="Target min" value={targetMinutes} onChange={e => setTargetMinutes(e.target.value)} className={styles.formInput} />
                <button onClick={startStudyMode} className={styles.startModeBtn}>▶ Start Fullscreen Session</button>
              </div>
            ) : (
              <div>
                <h3>Studying: {activeSubject}</h3>
                <div className={styles.liveClockDisplay}>{fmt(secondsElapsed)}</div>
                <button onClick={stopStudyMode} className={styles.stopModeBtn}>⏹ Stop & Save</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ ANALYTICS ══════ */}
      {activeTab === "analytics" && (
        <div className={styles.analyticsGrid}>
          <div className={styles.card}>
            <div className={styles.cardHead}><span>🕐</span><h2>Best Study Hours Matrix</h2></div>
            <div className={styles.timeOfDayScroll}>
              <div className={styles.timeOfDayGrid}>
                {timeOfDayMap.map((row, dayIdx) => (
                  <div key={dayIdx} className={styles.timeOfDayRow}>
                    <span className={styles.timeOfDayDayLabel}>{DAYS[dayIdx].slice(0, 2)}</span>
                    {row.map((mins, hour) => (
                      <div key={hour} className={styles.timeOfDayCell} style={{ background: heatColor(mins) }} title={`${mins}m`} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ EXAMS & BOSS BATTLES ══════ */}
      {activeTab === "exams" && (
        <div className={styles.card}>
          <div className={styles.cardHead}><span>⚔️</span><h2>Exam Boss Battles</h2></div>
          <div className={styles.examForm}>
            <input placeholder="Exam Name" value={examName} onChange={e => setExamName(e.target.value)} className={styles.formInput} />
            <input type="datetime-local" value={examDate} onChange={e => setExamDate(e.target.value)} className={styles.formInput} />
            <button onClick={addExam} className={styles.addBtn}>+ Challenge Boss</button>
          </div>
          <div className={styles.examDeadlineList}>
            {exams.map(ex => {
              const sylSt = syllabusStatsByExam(ex.id);
              const totalHp = sylSt.total || 10;
              const currentHp = totalHp - sylSt.done;
              const hpPct = Math.round((currentHp / totalHp) * 100);

              return (
                <div key={ex.id} className={styles.bossCard}>
                  <div className={styles.bossHeader}>
                    <h3>👹 Boss: {ex.examName}</h3>
                    <span className={styles.bossHpText}>HP: {currentHp}/{totalHp}</span>
                  </div>
                  <div className={styles.bossHpBarTrack}>
                    <div className={styles.bossHpBarFill} style={{ width: `${hpPct}%` }} />
                  </div>
                  <button onClick={() => deleteExam(ex.id)} className={styles.miniDeleteBtn}>Defeat/Delete</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════ NOTES & AI GENERATOR ══════ */}
      {activeTab === "notes" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span>📝</span><h2>Notes</h2>
            <button className={styles.addBtn} onClick={() => setShowAiModal(true)}>🤖 AI Generate</button>
          </div>
          <input placeholder="Title..." value={noteTitle} onChange={e => setNoteTitle(e.target.value)} className={styles.formInput} />
          <textarea placeholder="Write..." value={quickNotes} onChange={e => setQuickNotes(e.target.value)} className={styles.notesTextarea} />
          <button onClick={saveNote} className={styles.addBtn} style={{ marginTop: 8 }}>Save Note</button>

          {/* AI MODAL */}
          {showAiModal && (
            <div className={styles.studyFsOverlay}>
              <div className={styles.studyFsContent}>
                <h2>🤖 AI Note & Flashcard Generator</h2>
                <textarea placeholder="Paste text or topic here..." value={aiPromptText} onChange={e => setAiPromptText(e.target.value)} className={styles.studyFsNote} />
                <div className={styles.studyFsActions}>
                  <button onClick={runAiGenerator} disabled={isAiProcessing} className={styles.addBtn}>{isAiProcessing ? "Processing..." : "Generate"}</button>
                  <button onClick={() => setShowAiModal(false)} className={styles.smBtn}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ FLASHCARDS (ANKI SRS) ══════ */}
      {activeTab === "flashcards" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span>🗂️</span><h2>Flashcard SRS</h2>
            <button onClick={() => startReview("all")} className={styles.addBtn}>▶ Start Due Review</button>
          </div>
          {!reviewMode ? (
            <div>
              <input placeholder="Question" value={newFront} onChange={e => setNewFront(e.target.value)} className={styles.formInput} />
              <input placeholder="Answer" value={newBack} onChange={e => setNewBack(e.target.value)} className={styles.formInput} />
              <button onClick={addFlashcard} className={styles.addBtn} style={{ marginTop: 8 }}>+ Add Card</button>
            </div>
          ) : (
            <div className={styles.flashcardReview}>
              <h3>{reviewCards[reviewIndex]?.front}</h3>
              {showAnswer ? (
                <div>
                  <p>{reviewCards[reviewIndex]?.back}</p>
                  <div className={styles.rateButtons}>
                    {[1, 2, 3, 4, 5].map(q => (
                      <button key={q} onClick={() => rateCardSRS(reviewCards[reviewIndex].id, q)} className={styles.smBtn}>Rate {q}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAnswer(true)} className={styles.addBtn}>Show Answer</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════ SUBJECT DEPENDENCY TREE ══════ */}
      {activeTab === "tree" && (
        <div className={styles.card}>
          <div className={styles.cardHead}><span>🔗</span><h2>Subject Prerequisites Map</h2></div>
          <div className={styles.timetableForm}>
            <select value={depParent} onChange={e => setDepParent(e.target.value)} className={styles.formSelect}>
              <option value="">-- Prerequisite (First) --</option>
              {allSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <span>➔</span>
            <select value={depChild} onChange={e => setDepChild(e.target.value)} className={styles.formSelect}>
              <option value="">-- Dependent (Target) --</option>
              {allSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={addDependency} className={styles.addBtn}>Link</button>
          </div>

          <div className={styles.treeContainer}>
            {dependencies.map(d => (
              <div key={d.id} className={styles.treeNode}>
                <span className={styles.subjectChip}>{d.parent}</span>
                <span>➔</span>
                <span className={styles.subjectChip}>{d.child}</span>
                <button onClick={() => deleteDependency(d.id)} className={styles.miniDeleteBtn}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
