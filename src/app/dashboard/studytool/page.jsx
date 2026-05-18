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
  Flame,
  Brain,
  LineChart,
  PieChart,
  Activity,
  Star,
  AlertCircle,
  Upload,
  Maximize2,
  Minimize2,
  PlayCircle,
  PauseCircle,
  Calendar,
} from "lucide-react";

export default function UltraAdvancedStudyHub() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  // Timetable Form & Data States
  const [subject, setSubject] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [taskType, setTaskType] = useState("Class");
  const [day, setDay] = useState("Monday");
  const [tasks, setTasks] = useState([]);

  // Dynamic Subject Management
  const [customSubjects, setCustomSubjects] = useState([]);
  const [newSubjectInput, setNewSubjectInput] = useState("");

  // Target Exam Configuration States
  const [exams, setExams] = useState([]);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");

  // Real-time Countdown States
  const [currentTime, setCurrentTime] = useState(new Date());

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

  // Full Screen Timetable View
  const [fullScreenTimetable, setFullScreenTimetable] = useState(false);
  const [timetableViewMode, setTimetableViewMode] = useState("week"); // week or day

  // Auto Study Mode Based on Timetable
  const [autoStudyMode, setAutoStudyMode] = useState(false);
  const [currentActiveClass, setCurrentActiveClass] = useState(null);

  // Performance tracking
  const [weeklyProgress, setWeeklyProgress] = useState([]);
  const [subjectStats, setSubjectStats] = useState({});

  const activeSessionRef = useRef(null);
  const breakReminderRef = useRef(null);
  const fileInputRef = useRef(null);

  const daysMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDayName = daysMap[new Date().getDay()];

  const defaultSubjects = [
    "Mathematics",
    "Reasoning",
    "English Language",
    "General Knowledge (GK)",
    "Science",
    "History",
    "Geography",
    "Computer Science",
  ];

  const allSubjects = [...defaultSubjects, ...customSubjects];

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
      createProfileLog(u.uid, "Ultra Advanced Study Hub - Page Visit");

      // Load dark mode preference
      const savedDarkMode = localStorage.getItem("darkMode") === "true";
      setDarkMode(savedDarkMode);

      // Load custom subjects
      const savedSubjects = localStorage.getItem(`customSubjects_${u.uid}`);
      if (savedSubjects) {
        setCustomSubjects(JSON.parse(savedSubjects));
      }

      // Load auto study mode preference
      const savedAutoStudy = localStorage.getItem(`autoStudyMode_${u.uid}`) === "true";
      setAutoStudyMode(savedAutoStudy);
    });
    return () => unsub();
  }, [router]);

  /* REAL-TIME CLOCK UPDATE */
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  /* AUTO STUDY MODE - CHECK ACTIVE CLASS */
  useEffect(() => {
    if (!autoStudyMode || tasks.length === 0) {
      setCurrentActiveClass(null);
      return;
    }

    const checkActiveClass = () => {
      const now = new Date();
      const currentDay = daysMap[now.getDay()];
      const currentTimeStr = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;

      const activeTask = tasks.find((task) => {
        if (task.day !== currentDay) return false;

        const [startHour, startMin] = task.startTime.split(":").map(Number);
        const [endHour, endMin] = task.endTime.split(":").map(Number);

        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
      });

      setCurrentActiveClass(activeTask || null);

      // Auto start study mode
      if (activeTask && !isStudyMode) {
        const [startHour, startMin] = activeTask.startTime.split(":").map(Number);
        const [endHour, endMin] = activeTask.endTime.split(":").map(Number);
        const durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);

        setActiveSubject(activeTask.subject);
        setTargetMinutes(durationMinutes.toString());
        
        if (notificationsEnabled) {
          showNotification(
            "Auto Study Mode Started! 🎓",
            `${activeTask.subject} class shuru ho gayi hai!`
          );
        }
      }
    };

    checkActiveClass();
    const autoCheckInterval = setInterval(checkActiveClass, 30000); // Check every 30 seconds

    return () => clearInterval(autoCheckInterval);
  }, [autoStudyMode, tasks, isStudyMode, notificationsEnabled]);

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

      const qAchievements = query(
        collection(db, "study_achievements"),
        where("userId", "==", user.uid)
      );
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

  /* ADD CUSTOM SUBJECT */
  const addCustomSubject = () => {
    if (!newSubjectInput.trim() || !user) return;
    
    const trimmedSubject = newSubjectInput.trim();
    if (allSubjects.includes(trimmedSubject)) {
      alert("Yeh subject pehle se exist karta hai!");
      return;
    }

    const updated = [...customSubjects, trimmedSubject];
    setCustomSubjects(updated);
    localStorage.setItem(`customSubjects_${user.uid}`, JSON.stringify(updated));
    setNewSubjectInput("");
    
    createProfileLog(user.uid, `Custom Subject Added - ${trimmedSubject}`);
  };

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
        .filter((s) => {
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
    sessions.forEach((s) => {
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

    Object.keys(subjectMap).forEach((key) => {
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
      .filter((s) => s.createdAt)
      .sort((a, b) => {
        const dateA = a.createdAt.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });

    let currentStreak = 1;
    let lastDate = sortedSessions[0].createdAt.toDate?.() || new Date(sortedSessions[0].createdAt);

    for (let i = 1; i < sortedSessions.length; i++) {
      const currentDate =
        sortedSessions[i].createdAt.toDate?.() || new Date(sortedSessions[i].createdAt);
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
    if (totalMinutes >= 600 && !achievements.find((a) => a.title === "10 Hour Champion")) {
      newAchievements.push({
        title: "10 Hour Champion",
        description: "10 ghante ki padhai complete ki!",
        icon: "⏰",
      });
    }

    // 50 Hours Milestone
    if (totalMinutes >= 3000 && !achievements.find((a) => a.title === "Study Warrior")) {
      newAchievements.push({
        title: "Study Warrior",
        description: "50 ghante ki padhai! Kamaal hai!",
        icon: "⚔️",
      });
    }

    // Perfect Accuracy
    const perfectSessions = sessions.filter((s) => s.accuracyPercentage === 100);
    if (perfectSessions.length >= 5 && !achievements.find((a) => a.title === "Perfectionist")) {
      newAchievements.push({
        title: "Perfectionist",
        description: "5 sessions me 100% accuracy achieve ki!",
        icon: "💯",
      });
    }

    // Week Streak
    if (streak >= 7 && !achievements.find((a) => a.title === "Week Warrior")) {
      newAchievements.push({
        title: "Week Warrior",
        description: "7 din continuous padhai ki!",
        icon: "🔥",
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

  /* REAL-TIME COUNTDOWN WITH SECONDS */
  const calculateDetailedCountdown = (targetDate) => {
    const diff = new Date(targetDate) - currentTime;
    if (diff <= 0) return { text: "Exam Completed", isCompleted: true };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    return {
      days,
      hours,
      minutes,
      seconds,
      text: `${days}d ${hours}h ${minutes}m ${seconds}s`,
      isCompleted: false,
    };
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

      createProfileLog(user.uid, `Timetable Slot Added - ${subject}`);

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
      createProfileLog(user.uid, "Timetable Slot Deleted");
    } catch (e) {
      console.error("Error deleting task:", e);
    }
  };

  /* EDIT TASK */
  const updateTask = async (id, updatedData) => {
    try {
      await updateDoc(doc(db, "study_tasks", id), updatedData);
      setEditingTaskId(null);
      createProfileLog(user.uid, "Timetable Slot Updated");
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

      createProfileLog(user.uid, `Target Exam Set - ${examName}`);

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
      createProfileLog(user.uid, "Exam Deadline Deleted");
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

    createProfileLog(user.uid, `Study Mode Started - ${activeSubject}`);

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

      createProfileLog(user.uid, `Session Completed - ${activeSubject} (${accuracy}% Accuracy)`);

      if (notificationsEnabled) {
        showNotification("Session Complete! 🎉", `Focus accuracy: ${accuracy}%. Great work!`);
      }

      alert(`Session complete! Focus accuracy: ${accuracy}%`);
    } catch (e) {
      console.error("Error logging study session:", e);
    }

    setSecondsElapsed(0);
  };

  /* EXPORT TIMETABLE */
  const exportTimetable = () => {
    const exportData = {
      tasks: tasks,
      customSubjects: customSubjects,
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `study-timetable-${new Date().toISOString().split("T")[0]}.json`;
    a.click();

    createProfileLog(user.uid, "Timetable Exported");
  };

  /* IMPORT TIMETABLE */
  const importTimetable = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);

        if (!importedData.tasks || !Array.isArray(importedData.tasks)) {
          alert("Invalid timetable file!");
          return;
        }

        // Import tasks
        for (const task of importedData.tasks) {
          await addDoc(collection(db, "study_tasks"), {
            userId: user.uid,
            subject: task.subject,
            startTime: task.startTime,
            endTime: task.endTime,
            taskType: task.taskType,
            day: task.day,
            createdAt: serverTimestamp(),
          });
        }

        // Import custom subjects
        if (importedData.customSubjects && Array.isArray(importedData.customSubjects)) {
          const merged = [...new Set([...customSubjects, ...importedData.customSubjects])];
          setCustomSubjects(merged);
          localStorage.setItem(`customSubjects_${user.uid}`, JSON.stringify(merged));
        }

        createProfileLog(user.uid, "Timetable Imported");
        alert("Timetable successfully imported!");
      } catch (error) {
        console.error("Import error:", error);
        alert("Error importing timetable. Please check the file format.");
      }
    };
    reader.readAsText(file);
  };

  /* SMART RECOMMENDATIONS */
  const getWeakestSubject = () => {
    const subjects = Object.entries(subjectStats).sort(
      (a, b) => a[1].avgAccuracy - b[1].avgAccuracy
    );
    return subjects[0]?.[0] || "No data yet";
  };

  const getBestSubject = () => {
    const subjects = Object.entries(subjectStats).sort(
      (a, b) => b[1].avgAccuracy - a[1].avgAccuracy
    );
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
    .filter((s) => {
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

  /* CHECK IF TASK IS CURRENTLY ACTIVE */
  const isTaskActive = (task) => {
    const now = new Date();
    const currentDay = daysMap[now.getDay()];
    
    if (task.day !== currentDay) return false;

    const [startHour, startMin] = task.startTime.split(":").map(Number);
    const [endHour, endMin] = task.endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  };

  /* FULLSCREEN TIMETABLE VIEW */
  const FullScreenTimetableView = () => {
    const groupedByDay = {};
    daysMap.forEach((day) => {
      groupedByDay[day] = tasks.filter((t) => t.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

    return (
      <div className={styles.fullScreenOverlay}>
        <div className={styles.fullScreenContent}>
          <div className={styles.fullScreenHeader}>
            <h1>
              <Calendar size={32} /> Weekly Timetable View
            </h1>
            <div className={styles.fullScreenControls}>
              <button
                onClick={() => setTimetableViewMode(timetableViewMode === "week" ? "day" : "week")}
                className={styles.viewModeBtn}
              >
                {timetableViewMode === "week" ? "Day View" : "Week View"}
              </button>
              <button onClick={() => setFullScreenTimetable(false)} className={styles.closeFullScreen}>
                <Minimize2 size={20} /> Close
              </button>
            </div>
          </div>

          {timetableViewMode === "week" ? (
            <div className={styles.weekViewGrid}>
              {daysMap.map((day) => (
                <div key={day} className={`${styles.dayColumn} ${day === currentDayName ? styles.todayColumn : ""}`}>
                  <h3>{day}</h3>
                  <div className={styles.daySlots}>
                    {groupedByDay[day].length === 0 ? (
                      <p className={styles.noSlots}>No classes</p>
                    ) : (
                      groupedByDay[day].map((task) => (
                        <div
                          key={task.id}
                          className={`${styles.fullScreenSlot} ${isTaskActive(task) ? styles.activeSlot : ""}`}
                        >
                          <span className={styles.slotTime}>
                            {task.startTime} - {task.endTime}
                          </span>
                          <h4>{task.subject}</h4>
                          <span className={styles.slotType}>{task.taskType}</span>
                          {isTaskActive(task) && (
                            <div className={styles.liveIndicator}>
                              <PlayCircle size={16} /> LIVE NOW
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.dayViewContainer}>
              <h2>{currentDayName}'s Schedule</h2>
              <div className={styles.dayViewSlots}>
                {groupedByDay[currentDayName].length === 0 ? (
                  <p className={styles.emptyState}>Aaj koi class schedule nahi hai</p>
                ) : (
                  groupedByDay[currentDayName].map((task) => (
                    <div
                      key={task.id}
                      className={`${styles.dayViewSlot} ${isTaskActive(task) ? styles.activeSlot : ""}`}
                    >
                      <div className={styles.slotTimeBlock}>
                        <Clock3 size={24} />
                        <div>
                          <span className={styles.slotStartTime}>{task.startTime}</span>
                          <span className={styles.slotEndTime}>to {task.endTime}</span>
                        </div>
                      </div>
                      <div className={styles.slotContent}>
                        <h3>{task.subject}</h3>
                        <span className={styles.slotTypeBadge}>{task.taskType}</span>
                      </div>
                      {isTaskActive(task) && (
                        <div className={styles.liveIndicatorLarge}>
                          <PlayCircle size={24} /> LIVE NOW
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (fullScreenTimetable) {
    return <FullScreenTimetableView />;
  }

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
            Ultra Advanced Study Hub
          </h1>
          <p className={styles.subtitle}>Real-Time Analytics & Auto Study Mode</p>
        </div>
        <div className={styles.headerControls}>
          <button
            className={styles.iconBtn}
            onClick={() => {
              const newState = !autoStudyMode;
              setAutoStudyMode(newState);
              localStorage.setItem(`autoStudyMode_${user?.uid}`, newState.toString());
            }}
            title={autoStudyMode ? "Auto Study Mode: ON" : "Auto Study Mode: OFF"}
          >
            {autoStudyMode ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
          </button>
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

      {/* CURRENT ACTIVE CLASS BANNER */}
      {currentActiveClass && (
        <div className={styles.activeClassBanner}>
          <PlayCircle size={24} className={styles.pulseIcon} />
          <div>
            <h3>LIVE NOW: {currentActiveClass.subject}</h3>
            <p>
              {currentActiveClass.startTime} - {currentActiveClass.endTime} • {currentActiveClass.taskType}
            </p>
          </div>
          {autoStudyMode && <span className={styles.autoModeBadge}>AUTO MODE</span>}
        </div>
      )}

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
            <span className={styles.streakNumber}>
              {todayStudied} / {studyGoalMinutes}
            </span>
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
            <span className={styles.statValue}>
              {Math.floor(totalStudiedMins / 60)}h {totalStudiedMins % 60}m
            </span>
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
      <button className={styles.analyticsToggle} onClick={() => setShowAnalytics(!showAnalytics)}>
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
                  <p>
                    Aapko <mark>{getWeakestSubject()}</mark> par zyada dhyan dena chahiye
                  </p>
                </div>
              </div>
              <div className={styles.recommendation}>
                <Star size={16} className={styles.recIcon} />
                <div>
                  <strong>Strong Subject</strong>
                  <p>
                    <mark>{getBestSubject()}</mark> me aapki performance bohot acchi hai!
                  </p>
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
                <p className={styles.emptyState}>
                  Padhai shuru karein to achievements unlock honge!
                </p>
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
                <select value={activeSubject} onChange={(e) => setActiveSubject(e.target.value)}>
                  <option value="">-- Choose Target Subject --</option>
                  {allSubjects.map((sub) => (
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

          {/* CUSTOM SUBJECT MANAGER */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <Plus size={18} />
              <h2>Add Custom Subject</h2>
            </div>
            <div className={styles.customSubjectForm}>
              <input
                type="text"
                placeholder="Enter new subject name..."
                value={newSubjectInput}
                onChange={(e) => setNewSubjectInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addCustomSubject()}
              />
              <button onClick={addCustomSubject}>
                <Plus size={16} /> Add
              </button>
            </div>
            {customSubjects.length > 0 && (
              <div className={styles.customSubjectsList}>
                <h4>Your Custom Subjects:</h4>
                <div className={styles.customSubjectsChips}>
                  {customSubjects.map((sub, idx) => (
                    <span key={idx} className={styles.subjectChip}>
                      {sub}
                    </span>
                  ))}
                </div>
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
                  onClick={() => setFullScreenTimetable(true)}
                  className={styles.fullScreenBtn}
                >
                  <Maximize2 size={15} /> Full View
                </button>
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
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={styles.importBtn}
                >
                  <Upload size={15} /> Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={importTimetable}
                />
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
                {allSubjects.map((sub) => (
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
                  <div
                    key={task.id}
                    className={`${styles.taskCard} ${isTaskActive(task) ? styles.activeTaskCard : ""}`}
                  >
                    {editingTaskId === task.id ? (
                      <div className={styles.editForm}>
                        <input
                          defaultValue={task.subject}
                          onBlur={(e) => updateTask(task.id, { subject: e.target.value })}
                        />
                        <button onClick={() => setEditingTaskId(null)}>
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className={styles.typeBadge}>{task.taskType}</span>
                          {isTaskActive(task) && (
                            <span className={styles.liveTag}>● LIVE</span>
                          )}
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
          {/* EXAM TARGETS WITH LIVE COUNTDOWN */}
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
                exams.map((ex) => {
                  const countdown = calculateDetailedCountdown(ex.examDate);
                  return (
                    <div key={ex.id} className={styles.examCountdownCard}>
                      <div className={styles.examCountdownInfo}>
                        <h4>{ex.examName}</h4>
                        {countdown.isCompleted ? (
                          <p className={styles.examCompletedText}>{countdown.text}</p>
                        ) : (
                          <div className={styles.countdownGrid}>
                            <div className={styles.countdownUnit}>
                              <span className={styles.countdownNumber}>{countdown.days}</span>
                              <span className={styles.countdownLabel}>Days</span>
                            </div>
                            <div className={styles.countdownUnit}>
                              <span className={styles.countdownNumber}>{countdown.hours}</span>
                              <span className={styles.countdownLabel}>Hours</span>
                            </div>
                            <div className={styles.countdownUnit}>
                              <span className={styles.countdownNumber}>{countdown.minutes}</span>
                              <span className={styles.countdownLabel}>Mins</span>
                            </div>
                            <div className={styles.countdownUnit}>
                              <span className={styles.countdownNumber}>{countdown.seconds}</span>
                              <span className={styles.countdownLabel}>Secs</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <button onClick={() => deleteExam(ex.id)} className={styles.miniDeleteBtn}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
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
                studySessions
                  .slice(-10)
                  .reverse()
                  .map((session) => (
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