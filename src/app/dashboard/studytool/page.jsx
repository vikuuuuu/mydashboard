// File: app/dashboard/studytool/page.js
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
} from "firebase/firestore";

import { db, auth } from "@/lib/firebase";
import { logToolUsage } from "@/lib/firestore"; // 🌟 Pehle code se import kiya gaya logToolUsage

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
  Eye
} from "lucide-react";

export default function StudyHubPage() {
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

  // Today Filter Toggle State
  const [filterToday, setFilterToday] = useState(true); 

  // Performance Log State
  const activeSessionRef = useRef(null);

  // Current Day Context
  const daysMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDayName = daysMap[new Date().getDay()];

  /* 🌟 CENTRALIZED LOG MECHANISM FOR USER PROFILE ACTIVITY (logToolUsage ka upyog) */
  const createProfileLog = async (userId, logDescription) => {
    try {
      // Aapke pehle code ke structure ke anusar logToolUsage ko call kiya gaya hai
      await logToolUsage({ 
        userId: userId, 
        tool: logDescription 
      });
    } catch (e) {
      console.error("Profile Log create karne me dikkat hui:", e);
    }
  };

  /* AUTH SYSTEM & PAGE VISIT ACTION LOG */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      
      // 🌟 LOG 1: Jab user page par visit karega
      createProfileLog(u.uid, "Exam Target Hub - Page Visit");
    });
    return () => unsub();
  }, [router]);

  /* READ DATA FROM FIRESTORE */
  useEffect(() => {
    if (!user || !user.uid) return;

    let unsubTasks = () => {};
    let unsubExams = () => {};
    let unsubSessions = () => {};

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
        setStudySessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch (error) {
      console.error("Firestore loading crashed:", error);
    }

    return () => {
      unsubTasks();
      unsubExams();
      unsubSessions();
    };
  }, [user]);

  /* TRACK LIVE STOPWATCH IN STUDY MODE */
  useEffect(() => {
    if (isStudyMode) {
      activeSessionRef.current = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(activeSessionRef.current);
    }
    return () => clearInterval(activeSessionRef.current);
  }, [isStudyMode]);

  /* CALCULATE LIVE DAYS & HOURS LEFT FOR EXAMS */
  const calculateCountdown = (targetDate) => {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return "Exam Completed";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    return `${days} Days, ${hours} Hours left`;
  };

  /* ADD NEW TIMETABLE SLOT */
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
      
      // 🌟 LOG 2: Timetable slot add karne par log create hoga
      createProfileLog(user.uid, `Exam Target Hub - Timetable Slot Added (${subject})`);

      setSubject("");
      setStartTime("");
      setEndTime("");
    } catch (e) {
      console.error("Error adding task:", e);
    }
  };

  const deleteTask = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "study_tasks", id));
      
      // 🌟 LOG 3: Timetable slot delete karne par log create hoga
      createProfileLog(user.uid, "Exam Target Hub - Timetable Slot Deleted");
    } catch (e) {
      console.error("Error deleting task:", e);
    }
  };

  /* CONFIGURE EXAM TARGET DATA */
  const addExamTarget = async () => {
    if (!examName || !examDate || !user) return;

    try {
      await addDoc(collection(db, "study_exams"), {
        userId: user.uid,
        examName,
        examDate,
        createdAt: serverTimestamp(),
      });

      // 🌟 LOG 4: Target Exam set karne par log generate hoga
      createProfileLog(user.uid, `Exam Target Hub - Target Exam Deadline Set (${examName})`);

      setExamName("");
      setExamDate("");
    } catch (e) {
      console.error("Error adding exam target:", e);
    }
  };

  const deleteExam = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "study_exams", id));
      
      // 🌟 LOG 5: Exam deadline delete karne par log create hoga
      createProfileLog(user.uid, "Exam Target Hub - Exam Deadline Deleted");
    } catch (e) {
      console.error("Error deleting exam:", e);
    }
  };

  /* LIVE STUDY MODE CONTROLLERS */
  const startStudyMode = () => {
    if (!activeSubject) {
      alert("Kripya select karein aap kaun sa subject padh rahe hain!");
      return;
    }
    setSecondsElapsed(0);
    setIsStudyMode(true);

    // 🌟 LOG 6: Study Mode active karne par log
    createProfileLog(user.uid, `Exam Target Hub - Study Mode Started (${activeSubject})`);
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

      // 🌟 LOG 7: Study session end accuracy calculate hone par log
      createProfileLog(user.uid, `Exam Target Hub - Session Completed (${activeSubject}) with ${accuracy}% Accuracy`);

      alert(`Session complete! Sahi focus accuracy: ${accuracy}%`);
    } catch (e) {
      console.error("Error logging study session:", e);
    }
    
    setSecondsElapsed(0);
  };

  const totalStudiedMins = studySessions.reduce((acc, curr) => acc + (curr.actualTime || 0), 0);
  const avgAccuracy = studySessions.length 
    ? Math.round(studySessions.reduce((acc, curr) => acc + (curr.accuracyPercentage || 0), 0) / studySessions.length) 
    : 0;

  const formatStopwatch = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const secs = (totalSeconds % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  };

  const displayedTasks = filterToday 
    ? tasks.filter(t => t.day?.toLowerCase() === currentDayName.toLowerCase())
    : tasks;

  return (
    <div className={styles.page}>
      {/* HEADER SECTION */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push("/dashboard")}>
          <ArrowLeft size={17} /> Back
        </button>
        <div>
          <h1 className={styles.title}>Exam Target Hub</h1>
          <p className={styles.subtitle}>Timetable Tracker & Live Session Analytics</p>
        </div>
      </div>

      {/* METRICS / ANALYTICS CARDS */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <BarChart3 size={20} />
          <span>{totalStudiedMins} Min Total Studied</span>
        </div>
        <div className={styles.statCard}>
          <Percent size={20} />
          <span>{avgAccuracy}% Avg Accuracy</span>
        </div>
        <div className={styles.statCard}>
          <Target size={20} />
          <span>{exams.length} Active Targets</span>
        </div>
      </div>

      {/* BODY CONTENT GRID */}
      <div className={styles.grid}>
        
        {/* LEFT COMPONENT COLUMN */}
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
                  <option value="Mathematics">Mathematics</option>
                  <option value="Reasoning">Reasoning</option>
                  <option value="English Language">English Language</option>
                  <option value="General Knowledge (GK)">General Knowledge (GK)</option>
                </select>

                <input
                  type="number"
                  placeholder="Target study duration (Minutes)"
                  value={targetMinutes}
                  onChange={(e) => setTargetMinutes(e.target.value)}
                />

                <button onClick={startStudyMode} className={styles.startModeBtn}>
                  <Play size={16} /> Activate Study Mode
                </button>
              </div>
            ) : (
              <div className={styles.liveConsoleArea}>
                <h3>Padhai chal rahi hai: <mark>{activeSubject}</mark></h3>
                <div className={styles.liveClockDisplay}>{formatStopwatch(secondsElapsed)}</div>
                <p>Target Goal Duration: {targetMinutes} Mins</p>
                <button onClick={stopStudyMode} className={styles.stopModeBtn}>
                  <Square size={16} /> Stop & Calculate Accuracy
                </button>
              </div>
            )}
          </div>

          {/* DYNAMIC TIMETABLE MANAGER */}
          <div className={styles.card}>
            <div className={styles.cardHead} style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <CalendarDays size={18} />
                <h2>Weekly Timetable</h2>
              </div>
              
              <button 
                onClick={() => setFilterToday(!filterToday)} 
                className={`${styles.toggleFilterBtn} ${filterToday ? styles.activeFilter : ""}`}
              >
                <Eye size={15} /> {filterToday ? `Showing Today Only (${currentDayName})` : "Showing Full Week"}
              </button>
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

              <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{flex: 1.5}}>
                <option value="">-- Select Subject --</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Reasoning">Reasoning</option>
                <option value="English Language">English Language</option>
                <option value="General Knowledge (GK)">General Knowledge (GK)</option>
              </select>

              <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                <option>Class</option>
                <option>Revision</option>
              </select>

              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />

              <button onClick={addTask}><Plus size={16} /> Add Slot</button>
            </div>

            {/* Timetable Slots Map */}
            <div className={styles.taskList}>
              {displayedTasks.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text2)", padding: "10px", fontSize: "0.9rem" }}>
                  {filterToday ? `Aaj (${currentDayName}) koi class ya revision slot schedule nahi hai.` : "Timetable empty hai. Naya slot add karein!"}
                </p>
              ) : (
                displayedTasks.map((task) => (
                  <div key={task.id} className={styles.taskCard}>
                    <div>
                      <span className={styles.typeBadge}>{task.taskType}</span>
                      <h3 style={{ marginTop: "6px" }}>{task.subject}</h3>
                      <p><Clock3 size={13} /> {task.day} • {task.startTime} tak {task.endTime}</p>
                    </div>
                    <button 
                      onClick={() => deleteTask(task.id)} 
                      className={styles.deleteBtnDanger}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COMPONENT COLUMN */}
        <div className={styles.rightCol}>
          
          {/* TARGET EXAM LIST & REALTIME COUNTDOWN */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <BookOpen size={18} />
              <h2>Target Exam Deadlines</h2>
            </div>

            <div className={styles.examSetupMiniForm}>
              <input
                placeholder="e.g. SSC CGL Tier 1, UPSC Prelims"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
              />
              <input
                type="datetime-local"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
              <button onClick={addExamTarget} className={styles.addExamBtn}>Set Deadline</button>
            </div>

            <div className={styles.examDeadlineList}>
              {exams.map((ex) => (
                <div key={ex.id} className={styles.examCountdownCard}>
                  <div>
                    <h4>{ex.examName}</h4>
                    <p className={styles.liveClockCountdownText}>{calculateCountdown(ex.examDate)}</p>
                  </div>
                  <button onClick={() => deleteExam(ex.id)} className={styles.miniDeleteBtn}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ACCURACY & TIME STUDIED LOGGER */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <BarChart3 size={18} />
              <h2>Session History Logs</h2>
            </div>

            <div className={styles.sessionHistoryContainer}>
              {studySessions.map((session) => (
                <div key={session.id} className={styles.historyItemLog}>
                  <div className={styles.historyMetaRow}>
                    <strong>{session.subjectName}</strong>
                    <span className={session.accuracyPercentage >= 80 ? styles.goodScore : styles.badScore}>
                      {session.accuracyPercentage}% Score
                    </span>
                  </div>
                  <p>Padhai ki: {session.actualTime} Min / Goal tha: {session.targetTime} Min</p>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}