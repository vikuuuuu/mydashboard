"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./studytool.module.css";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  updateDoc,
} from "firebase/firestore";

import { db, auth } from "@/lib/firebase";
import { logToolUsage } from "@/lib/firestore";

import {
  CalendarDays,
  Plus,
  Trash2,
  Clock3,
  ArrowLeft,
  BookOpen,
  BarChart3,
  Play,
  Square,
  Target,
  Percent,
  Timer,
  Eye,
  TrendingUp,
  Award,
  Zap,
  Coffee,
  Moon,
  Sun,
  Download,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  X,
  Flame,
  Brain,
  LineChart,
  PieChart,
  Activity,
  Star,
  AlertCircle,
} from "lucide-react";

export default function AdvancedStudyHubPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  // Timetable Form & Data States
  const [subject, setSubject] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [taskType, setTaskType] = useState("Class");
  const [day, setDay] = useState("Monday");
  const [tasks, setTasks] = useState([]);

  // Target Exam Configuration States
  const [exams, setExams] = useState([]);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");

  // Live Study Mode Analytics States
  const [studySessions, setStudySessions] = useState([]);
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [activeSubject, setActiveSubject] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("60");
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // Advanced Features States
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [filterToday, setFilterToday] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [streak, setStreak] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [breakReminder, setBreakReminder] = useState(true);
  const [studyGoalMinutes, setStudyGoalMinutes] = useState(120);

  // Performance tracking
  const [weeklyProgress, setWeeklyProgress] = useState([]);
  const [subjectStats, setSubjectStats] = useState({});

  const activeSessionRef = useRef(null);
  const breakReminderRef = useRef(null);

  const daysMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDayName = daysMap[new Date().getDay()];

  const subjects = [
    "Mathematics",
    "Reasoning",
    "English Language",
    "General Knowledge (GK)",
    "Science",
    "History",
    "Geography",
    "Computer Science",
  ];

  /* 🌟 CENTRALIZED LOG MECHANISM */
  const createProfileLog = async (userId, logDescription) => {
    try {
      await logToolUsage({
        userId: userId,
        tool: logDescription,
      });
    } catch (e) {
      console.error("Profile Log create karne me dikkat hui:", e);
    }
  };

  /* AUTH SYSTEM */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      createProfileLog(u.uid, "Advanced Exam Hub - Page Visit");
      
      // Load dark mode preference
      const savedDarkMode = localStorage.getItem("darkMode") === "true";
      setDarkMode(savedDarkMode);
    });
    return () => unsub();
  }, [router]);

  /* READ DATA FROM FIRESTORE */
  useEffect(() => {
    if (!user || !user.uid) return;

    let unsubTasks = () => {};
    let unsubExams = () => {};
    let unsubSessions = () => {};
    let unsubAchievements = () => {};

    try {
      const qTasks = query(collection(db, "study_tasks"), where("userId", "==", user.uid));
      unsubTasks = onSnapshot(qTasks, (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      const qExams = query(collection(db, "study_exams"), where("userId", "==", user.uid));
      unsubExams = onSnapshot(qExams, (snap) => {
        setExams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      const qSessions = query(collection(db, "study_sessions"), where("userId", "==", user.uid));
      unsubSessions = onSnapshot(qSessions, (snap) => {
        const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStudySessions(sessions);
        calculateAdvancedStats(sessions);
        checkAchievements(sessions);
      });

      const qAchievements = query(collection(db, "study_achievements"), where("userId", "==", user.uid));
      unsubAchievements = onSnapshot(qAchievements, (snap) => {
        setAchievements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch (error) {
      console.error("Firestore loading crashed:", error);
    }

    return () => {
      unsubTasks();
      unsubExams();
      unsubSessions();
      unsubAchievements();
    };
  }, [user]);

  /* CALCULATE ADVANCED STATISTICS */
  const calculateAdvancedStats = (sessions) => {
    // Weekly progress calculation
    const last7Days = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString();
      
      const dayTotal = sessions
        .filter(s => {
          if (!s.createdAt) return false;
          const sessionDate = s.createdAt.toDate?.() || new Date(s.createdAt);
          return sessionDate.toLocaleDateString() === dateStr;
        })
        .reduce((sum, s) => sum + (s.actualTime || 0), 0);
      
      last7Days.push({
        day: daysMap[date.getDay()].slice(0, 3),
        minutes: dayTotal,
      });
    }
    setWeeklyProgress(last7Days);

    // Subject-wise statistics
    const subjectMap = {};
    sessions.forEach(s => {
      if (!subjectMap[s.subjectName]) {
        subjectMap[s.subjectName] = {
          totalTime: 0,
          sessions: 0,
          avgAccuracy: 0,
        };
      }
      subjectMap[s.subjectName].totalTime += s.actualTime || 0;
      subjectMap[s.subjectName].sessions += 1;
      subjectMap[s.subjectName].avgAccuracy += s.accuracyPercentage || 0;
    });

    Object.keys(subjectMap).forEach(key => {
      subjectMap[key].avgAccuracy = Math.round(
        subjectMap[key].avgAccuracy / subjectMap[key].sessions
      );
    });

    setSubjectStats(subjectMap);

    // Calculate streak
    calculateStreak(sessions);
  };

  /* CALCULATE STUDY STREAK */
  const calculateStreak = (sessions) => {
    if (sessions.length === 0) {
      setStreak(0);
      return;
    }

    const sortedSessions = sessions
      .filter(s => s.createdAt)
      .sort((a, b) => {
        const dateA = a.createdAt.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });

    let currentStreak = 1;
    let lastDate = sortedSessions[0].createdAt.toDate?.() || new Date(sortedSessions[0].createdAt);

    for (let i = 1; i < sortedSessions.length; i++) {
      const currentDate = sortedSessions[i].createdAt.toDate?.() || new Date(sortedSessions[i].createdAt);
      const dayDiff = Math.floor((lastDate - currentDate) / (1000 * 60 * 60 * 24));
      
      if (dayDiff === 1) {
        currentStreak++;
        lastDate = currentDate;
      } else if (dayDiff > 1) {
        break;
      }
    }

    setStreak(currentStreak);
  };

  /* CHECK AND AWARD ACHIEVEMENTS */
  const checkAchievements = async (sessions) => {
    if (!user) return;

    const totalMinutes = sessions.reduce((sum, s) => sum + (s.actualTime || 0), 0);
    const totalSessions = sessions.length;

    const newAchievements = [];

    // First Study Session
    if (totalSessions === 1 && achievements.length === 0) {
      newAchievements.push({
        title: "First Step",
        description: "Pehla study session complete kiya!",
        icon: "🎯",
      });
    }

    // 10 Hours Milestone
    if (totalMinutes >= 600 && !achievements.find(a => a.title === "10 Hour Champion")) {
      newAchievements.push({
        title: "10 Hour Champion",
        description: "10 ghante ki padhai complete ki!",
        icon: "⏰",
      });
    }

    // Perfect Accuracy
    const perfectSessions = sessions.filter(s => s.accuracyPercentage === 100);
    if (perfectSessions.length >= 5 && !achievements.find(a => a.title === "Perfectionist")) {
      newAchievements.push({
        title: "Perfectionist",
        description: "5 sessions me 100% accuracy achieve ki!",
        icon: "💯",
      });
    }

    // Add achievements to Firestore
    for (const achievement of newAchievements) {
      try {
        await addDoc(collection(db, "study_achievements"), {
          userId: user.uid,
          ...achievement,
          unlockedAt: serverTimestamp(),
        });
      } catch (e) {
        console.error("Achievement add error:", e);
      }
    }
  };

  /* TRACK LIVE STOPWATCH */
  useEffect(() => {
    if (isStudyMode) {
      activeSessionRef.current = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);

      // Break reminder every 25 minutes (Pomodoro style)
      if (breakReminder) {
        breakReminderRef.current = setInterval(() => {
          if (secondsElapsed > 0 && secondsElapsed % (25 * 60) === 0) {
            if (notificationsEnabled) {
              showNotification("Break Time! 🧘", "25 minutes complete! 5 minute break lein.");
            }
          }
        }, 1000);
      }
    } else {
      clearInterval(activeSessionRef.current);
      clearInterval(breakReminderRef.current);
    }
    return () => {
      clearInterval(activeSessionRef.current);
      clearInterval(breakReminderRef.current);
    };
  }, [isStudyMode, secondsElapsed, breakReminder, notificationsEnabled]);

  /* NOTIFICATION SYSTEM */
  const showNotification = (title, body) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/logo.png" });
    }
  };

  useEffect(() => {
    if (notificationsEnabled && "Notification" in window) {
      Notification.requestPermission();
    }
  }, [notificationsEnabled]);

  /* DARK MODE TOGGLE */
  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("darkMode", "false");
    }
  }, [darkMode]);

  /* CALCULATE COUNTDOWN */
  const calculateCountdown = (targetDate) => {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return "Exam Completed";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    return `${days} Days, ${hours} Hours left`;
  };

  /* ADD TASK */
  const addTask = async () => {
    if (!subject || !startTime || !endTime || !user) return;

    try {
      await addDoc(collection(db, "study_tasks"), {
        userId: user.uid,
        subject,
        startTime,
        endTime,
        taskType,
        day,
        createdAt: serverTimestamp(),
      });

      createProfileLog(user.uid, `Advanced Hub - Timetable Slot Added (${subject})`);

      setSubject("");
      setStartTime("");
      setEndTime("");

      if (notificationsEnabled) {
        showNotification("Slot Added! ✅", `${subject} ka slot ${day} ko add ho gaya.`);
      }
    } catch (e) {
      console.error("Error adding task:", e);
    }
  };

  /* DELETE TASK */
  const deleteTask = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "study_tasks", id));
      createProfileLog(user.uid, "Advanced Hub - Timetable Slot Deleted");
    } catch (e) {
      console.error("Error deleting task:", e);
    }
  };

  /* EDIT TASK */
  const updateTask = async (id, updatedData) => {
    try {
      await updateDoc(doc(db, "study_tasks", id), updatedData);
      setEditingTaskId(null);
      createProfileLog(user.uid, "Advanced Hub - Timetable Slot Updated");
    } catch (e) {
      console.error("Error updating task:", e);
    }
  };

  /* ADD EXAM TARGET */
  const addExamTarget = async () => {
    if (!examName || !examDate || !user) return;

    try {
      await addDoc(collection(db, "study_exams"), {
        userId: user.uid,
        examName,
        examDate,
        createdAt: serverTimestamp(),
      });

      createProfileLog(user.uid, `Advanced Hub - Target Exam Set (${examName})`);

      setExamName("");
      setExamDate("");

      if (notificationsEnabled) {
        showNotification("Exam Target Set! 🎯", `${examName} ka deadline set ho gaya.`);
      }
    } catch (e) {
      console.error("Error adding exam target:", e);
    }
  };

  /* DELETE EXAM */
  const deleteExam = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "study_exams", id));
      createProfileLog(user.uid, "Advanced Hub - Exam Deadline Deleted");
    } catch (e) {
      console.error("Error deleting exam:", e);
    }
  };

  /* STUDY MODE CONTROLLERS */
  const startStudyMode = () => {
    if (!activeSubject) {
      alert("Kripya select karein aap kaun sa subject padh rahe hain!");
      return;
    }
    setSecondsElapsed(0);
    setIsStudyMode(true);

    createProfileLog(user.uid, `Advanced Hub - Study Mode Started (${activeSubject})`);

    if (notificationsEnabled) {
      showNotification("Study Mode Active! 📚", `${activeSubject} ki padhai shuru ho gayi.`);
    }
  };

  const stopStudyMode = async () => {
    if (!user) return;
    setIsStudyMode(false);

    const actualMinutesStudied = Math.round(secondsElapsed / 60);
    const expectedMinutes = parseInt(targetMinutes) || 1;

    let accuracy = Math.round((actualMinutesStudied / expectedMinutes) * 100);
    if (accuracy > 100) accuracy = 100;

    try {
      await addDoc(collection(db, "study_sessions"), {
        userId: user.uid,
        subjectName: activeSubject,
        targetTime: expectedMinutes,
        actualTime: actualMinutesStudied,
        accuracyPercentage: accuracy,
        createdAt: serverTimestamp(),
      });

      createProfileLog(
        user.uid,
        `Advanced Hub - Session Completed (${activeSubject}) with ${accuracy}% Accuracy`
      );

      if (notificationsEnabled) {
        showNotification(
          "Session Complete! 🎉",
          `Focus accuracy: ${accuracy}%. Great work!`
        );
      }

      alert(`Session complete! Focus accuracy: ${accuracy}%`);
    } catch (e) {
      console.error("Error logging study session:", e);
    }

    setSecondsElapsed(0);
  };

  /* EXPORT TIMETABLE AS PDF */
  const exportTimetable = () => {
    const content = tasks.map(t => 
      `${t.day} | ${t.subject} | ${t.taskType} | ${t.startTime} - ${t.endTime}`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-timetable.txt';
    a.click();
    
    createProfileLog(user.uid, "Advanced Hub - Timetable Exported");
  };

  /* SMART RECOMMENDATIONS */
  const getWeakestSubject = () => {
    const subjects = Object.entries(subjectStats)
      .sort((a, b) => a[1].avgAccuracy - b[1].avgAccuracy);
    return subjects[0]?.[0] || "No data yet";
  };

  const getBestSubject = () => {
    const subjects = Object.entries(subjectStats)
      .sort((a, b) => b[1].avgAccuracy - a[1].avgAccuracy);
    return subjects[0]?.[0] || "No data yet";
  };

  /* CALCULATED STATS */
  const totalStudiedMins = studySessions.reduce((acc, curr) => acc + (curr.actualTime || 0), 0);
  const avgAccuracy = studySessions.length
    ? Math.round(
        studySessions.reduce((acc, curr) => acc + (curr.accuracyPercentage || 0), 0) /
          studySessions.length
      )
    : 0;

  const todayStudied = studySessions
    .filter(s => {
      if (!s.createdAt) return false;
      const sessionDate = s.createdAt.toDate?.() || new Date(s.createdAt);
      return sessionDate.toDateString() === new Date().toDateString();
    })
    .reduce((sum, s) => sum + (s.actualTime || 0), 0);

  const goalProgress = Math.min(Math.round((todayStudied / studyGoalMinutes) * 100), 100);

  const formatStopwatch = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, "0");
    const mins = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSeconds % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  };

  const displayedTasks = filterToday
    ? tasks.filter((t) => t.day?.toLowerCase() === currentDayName.toLowerCase())
    : tasks;

  return (
    <div className={`${styles.page} ${darkMode ? styles.darkMode : ""}`}>
      {/* HEADER SECTION */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push("/dashboard")}>
          <ArrowLeft size={17} /> Back
        </button>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>
            <Zap size={28} className={styles.titleIcon} />
            Advanced Exam Hub
          </h1>
          <p className={styles.subtitle}>AI-Powered Study Analytics & Performance Tracker</p>
        </div>
        <div className={styles.headerControls}>
          <button
            className={styles.iconBtn}
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            title={notificationsEnabled ? "Notifications On" : "Notifications Off"}
          >
            {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => setDarkMode(!darkMode)}
            title="Toggle Dark Mode"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* STREAK & DAILY GOAL BANNER */}
      <div className={styles.streakBanner}>
        <div className={styles.streakItem}>
          <Flame size={24} className={styles.flameIcon} />
          <div>
            <span className={styles.streakNumber}>{streak}</span>
            <span className={styles.streakLabel}>Day Streak</span>
          </div>
        </div>
        <div className={styles.streakItem}>
          <Target size={24} />
          <div>
            <span className={styles.streakNumber}>{todayStudied} / {studyGoalMinutes}</span>
            <span className={styles.streakLabel}>Today's Goal (mins)</span>
          </div>
        </div>
        <div className={styles.progressBarContainer}>
          <div className={styles.progressBar} style={{ width: `${goalProgress}%` }}></div>
        </div>
      </div>

      {/* METRICS CARDS */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <Clock3 size={20} />
          <div>
            <span className={styles.statValue}>{Math.floor(totalStudiedMins / 60)}h {totalStudiedMins % 60}m</span>
            <span className={styles.statLabel}>Total Studied</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <Percent size={20} />
          <div>
            <span className={styles.statValue}>{avgAccuracy}%</span>
            <span className={styles.statLabel}>Avg Accuracy</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <BookOpen size={20} />
          <div>
            <span className={styles.statValue}>{studySessions.length}</span>
            <span className={styles.statLabel}>Total Sessions</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <Award size={20} />
          <div>
            <span className={styles.statValue}>{achievements.length}</span>
            <span className={styles.statLabel}>Achievements</span>
          </div>
        </div>
      </div>

      {/* ANALYTICS TOGGLE */}
      <button
        className={styles.analyticsToggle}
        onClick={() => setShowAnalytics(!showAnalytics)}
      >
        <LineChart size={18} />
        {showAnalytics ? "Hide" : "Show"} Advanced Analytics
        {showAnalytics ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {/* ADVANCED ANALYTICS SECTION */}
      {showAnalytics && (
        <div className={styles.analyticsSection}>
          {/* Weekly Progress Chart */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <TrendingUp size={18} />
              <h2>7-Day Progress Chart</h2>
            </div>
            <div className={styles.chartContainer}>
              {weeklyProgress.map((data, idx) => (
                <div key={idx} className={styles.barChartItem}>
                  <div
                    className={styles.bar}
                    style={{
                      height: `${Math.min((data.minutes / 120) * 100, 100)}%`,
                    }}
                  >
                    <span className={styles.barLabel}>{data.minutes}m</span>
                  </div>
                  <span className={styles.barDay}>{data.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Subject-wise Performance */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <PieChart size={18} />
              <h2>Subject-wise Performance</h2>
            </div>
            <div className={styles.subjectStatsContainer}>
              {Object.entries(subjectStats).map(([subject, stats]) => (
                <div key={subject} className={styles.subjectStatItem}>
                  <div className={styles.subjectStatHeader}>
                    <span className={styles.subjectName}>{subject}</span>
                    <span className={styles.subjectAccuracy}>{stats.avgAccuracy}%</span>
                  </div>
                  <div className={styles.subjectStatBar}>
                    <div
                      className={styles.subjectStatFill}
                      style={{ width: `${stats.avgAccuracy}%` }}
                    ></div>
                  </div>
                  <div className={styles.subjectStatMeta}>
                    {stats.totalTime} mins • {stats.sessions} sessions
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Smart Recommendations */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <Brain size={18} />
              <h2>AI-Powered Insights</h2>
            </div>
            <div className={styles.recommendationsContainer}>
              <div className={styles.recommendation}>
                <AlertCircle size={16} className={styles.recIcon} />
                <div>
                  <strong>Focus Area</strong>
                  <p>Aapko <mark>{getWeakestSubject()}</mark> par zyada dhyan dena chahiye</p>
                </div>
              </div>
              <div className={styles.recommendation}>
                <Star size={16} className={styles.recIcon} />
                <div>
                  <strong>Strong Subject</strong>
                  <p><mark>{getBestSubject()}</mark> me aapki performance bohot acchi hai!</p>
                </div>
              </div>
              {avgAccuracy < 70 && (
                <div className={styles.recommendation}>
                  <Activity size={16} className={styles.recIcon} />
                  <div>
                    <strong>Accuracy Improvement</strong>
                    <p>Shorter study sessions (25 mins) try karein for better focus</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Achievements Display */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <Award size={18} />
              <h2>Unlocked Achievements</h2>
            </div>
            <div className={styles.achievementsGrid}>
              {achievements.length === 0 ? (
                <p className={styles.emptyState}>Padhai shuru karein to achievements unlock honge!</p>
              ) : (
                achievements.map((ach) => (
                  <div key={ach.id} className={styles.achievementCard}>
                    <span className={styles.achievementIcon}>{ach.icon}</span>
                    <h4>{ach.title}</h4>
                    <p>{ach.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT GRID */}
      <div className={styles.grid}>
        {/* LEFT COLUMN */}
        <div className={styles.leftCol}>
          {/* STUDY MODE */}
          <div className={`${styles.card} ${isStudyMode ? styles.activeStudyPulse : ""}`}>
            <div className={styles.cardHead}>
              <Timer size={18} />
              <h2>{isStudyMode ? "⚡ LIVE Study Mode ON" : "Study Mode Console"}</h2>
            </div>

            {!isStudyMode ? (
              <div className={styles.studySetupForm}>
                <select
                  value={activeSubject}
                  onChange={(e) => setActiveSubject(e.target.value)}
                >
                  <option value="">-- Choose Target Subject --</option>
                  {subjects.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  placeholder="Target study duration (Minutes)"
                  value={targetMinutes}
                  onChange={(e) => setTargetMinutes(e.target.value)}
                />

                <div className={styles.checkboxGroup}>
                  <label>
                    <input
                      type="checkbox"
                      checked={breakReminder}
                      onChange={(e) => setBreakReminder(e.target.checked)}
                    />
                    <Coffee size={14} />
                    Break reminders (Every 25 mins)
                  </label>
                </div>

                <button onClick={startStudyMode} className={styles.startModeBtn}>
                  <Play size={16} /> Activate Study Mode
                </button>
              </div>
            ) : (
              <div className={styles.liveConsoleArea}>
                <h3>
                  Padhai chal rahi hai: <mark>{activeSubject}</mark>
                </h3>
                <div className={styles.liveClockDisplay}>{formatStopwatch(secondsElapsed)}</div>
                <p>Target Goal Duration: {targetMinutes} Mins</p>
                <div className={styles.liveProgress}>
                  <div
                    className={styles.liveProgressFill}
                    style={{
                      width: `${Math.min((secondsElapsed / (targetMinutes * 60)) * 100, 100)}%`,
                    }}
                  ></div>
                </div>
                <button onClick={stopStudyMode} className={styles.stopModeBtn}>
                  <Square size={16} /> Stop & Calculate Accuracy
                </button>
              </div>
            )}
          </div>

          {/* TIMETABLE MANAGER */}
          <div className={styles.card}>
            <div className={styles.cardHead} style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <CalendarDays size={18} />
                <h2>Smart Timetable</h2>
              </div>

              <div className={styles.timetableControls}>
                <button
                  onClick={() => setFilterToday(!filterToday)}
                  className={`${styles.toggleFilterBtn} ${filterToday ? styles.activeFilter : ""}`}
                >
                  <Eye size={15} />
                  {filterToday ? `Today (${currentDayName})` : "All Week"}
                </button>
                <button onClick={exportTimetable} className={styles.exportBtn}>
                  <Download size={15} /> Export
                </button>
              </div>
            </div>

            <div className={styles.form}>
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                <option>Monday</option>
                <option>Tuesday</option>
                <option>Wednesday</option>
                <option>Thursday</option>
                <option>Friday</option>
                <option>Saturday</option>
                <option>Sunday</option>
              </select>

              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ flex: 1.5 }}
              >
                <option value="">-- Select Subject --</option>
                {subjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>

              <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                <option>Class</option>
                <option>Revision</option>
                <option>Practice</option>
                <option>Mock Test</option>
              </select>

              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />

              <button onClick={addTask}>
                <Plus size={16} /> Add Slot
              </button>
            </div>

            <div className={styles.taskList}>
              {displayedTasks.length === 0 ? (
                <p className={styles.emptyState}>
                  {filterToday
                    ? `Aaj (${currentDayName}) koi class ya revision slot schedule nahi hai.`
                    : "Timetable empty hai. Naya slot add karein!"}
                </p>
              ) : (
                displayedTasks.map((task) => (
                  <div key={task.id} className={styles.taskCard}>
                    {editingTaskId === task.id ? (
                      <div className={styles.editForm}>
                        <input
                          defaultValue={task.subject}
                          onBlur={(e) =>
                            updateTask(task.id, { subject: e.target.value })
                          }
                        />
                        <button onClick={() => setEditingTaskId(null)}>
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className={styles.typeBadge}>{task.taskType}</span>
                          <h3 style={{ marginTop: "6px" }}>{task.subject}</h3>
                          <p>
                            <Clock3 size={13} /> {task.day} • {task.startTime} - {task.endTime}
                          </p>
                        </div>
                        <div className={styles.taskActions}>
                          <button
                            onClick={() => setEditingTaskId(task.id)}
                            className={styles.editBtn}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className={styles.deleteBtnDanger}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className={styles.rightCol}>
          {/* EXAM TARGETS */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <Target size={18} />
              <h2>Target Exam Deadlines</h2>
            </div>

            <div className={styles.examSetupMiniForm}>
              <input
                placeholder="e.g. SSC CGL Tier 1, UPSC Prelims, JEE Mains"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
              />
              <input
                type="datetime-local"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
              <button onClick={addExamTarget} className={styles.addExamBtn}>
                Set Deadline
              </button>
            </div>

            <div className={styles.examDeadlineList}>
              {exams.length === 0 ? (
                <p className={styles.emptyState}>Koi exam target set nahi hai.</p>
              ) : (
                exams.map((ex) => (
                  <div key={ex.id} className={styles.examCountdownCard}>
                    <div>
                      <h4>{ex.examName}</h4>
                      <p className={styles.liveClockCountdownText}>
                        {calculateCountdown(ex.examDate)}
                      </p>
                    </div>
                    <button onClick={() => deleteExam(ex.id)} className={styles.miniDeleteBtn}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SESSION HISTORY */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <BarChart3 size={18} />
              <h2>Session History Logs</h2>
            </div>

            <div className={styles.sessionHistoryContainer}>
              {studySessions.length === 0 ? (
                <p className={styles.emptyState}>Abhi tak koi session complete nahi hua.</p>
              ) : (
                studySessions.slice(-10).reverse().map((session) => (
                  <div key={session.id} className={styles.historyItemLog}>
                    <div className={styles.historyMetaRow}>
                      <strong>{session.subjectName}</strong>
                      <span
                        className={
                          session.accuracyPercentage >= 80
                            ? styles.goodScore
                            : styles.badScore
                        }
                      >
                        {session.accuracyPercentage}% Score
                      </span>
                    </div>
                    <p>
                      Padhai ki: {session.actualTime} Min / Goal tha: {session.targetTime} Min
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
