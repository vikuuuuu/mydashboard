"use client";

import { useState, useEffect } from "react";
import styles from "./studytool.module.css";

import {
  CalendarDays,
  Clock3,
  BookOpen,
  UploadCloud,
  Trash2,
  Plus,
  CheckCircle2,
  BarChart3,
} from "lucide-react";

export default function StudyHubPage() {
  const [subject, setSubject] = useState("");
  const [time, setTime] = useState("");
  const [tasks, setTasks] = useState([]);

  const [studyMinutes, setStudyMinutes] = useState(0);

  const [files, setFiles] = useState([]);

  /* ───────── LOAD ───────── */
  useEffect(() => {
    const savedTasks =
      JSON.parse(localStorage.getItem("study_tasks")) || [];

    const savedMinutes =
      Number(localStorage.getItem("study_minutes")) || 0;

    const savedFiles =
      JSON.parse(localStorage.getItem("study_drive")) || [];

    setTasks(savedTasks);
    setStudyMinutes(savedMinutes);
    setFiles(savedFiles);
  }, []);

  /* ───────── SAVE ───────── */
  useEffect(() => {
    localStorage.setItem(
      "study_tasks",
      JSON.stringify(tasks)
    );
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(
      "study_minutes",
      studyMinutes
    );
  }, [studyMinutes]);

  useEffect(() => {
    localStorage.setItem(
      "study_drive",
      JSON.stringify(files)
    );
  }, [files]);

  /* ───────── ADD TASK ───────── */
  const addTask = () => {
    if (!subject || !time) return;

    const newTask = {
      id: Date.now(),
      subject,
      time,
      completed: false,
    };

    setTasks([newTask, ...tasks]);

    setSubject("");
    setTime("");
  };

  /* ───────── COMPLETE TASK ───────── */
  const toggleTask = (id) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: !t.completed,
            }
          : t
      )
    );
  };

  /* ───────── DELETE ───────── */
  const deleteTask = (id) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  /* ───────── STUDY TIMER ───────── */
  const addStudyTime = () => {
    setStudyMinutes((p) => p + 30);
  };

  /* ───────── FILE UPLOAD ───────── */
  const handleUpload = (e) => {
    const uploaded = Array.from(e.target.files);

    const mapped = uploaded.map((file) => ({
      id: Date.now() + Math.random(),
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2),
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    setFiles((prev) => [...mapped, ...prev]);
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            Study Hub
          </h1>

          <p className={styles.subtitle}>
            Timetable • Study Tracker • Drive
          </p>
        </div>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <BarChart3 size={18} />
            <span>{studyMinutes} min</span>
          </div>

          <div className={styles.statCard}>
            <BookOpen size={18} />
            <span>{tasks.length} Tasks</span>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className={styles.grid}>
        {/* TIMETABLE */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <CalendarDays size={18} />
            <h2>Timetable Planner</h2>
          </div>

          <div className={styles.form}>
            <input
              placeholder="Subject"
              value={subject}
              onChange={(e) =>
                setSubject(e.target.value)
              }
            />

            <input
              type="time"
              value={time}
              onChange={(e) =>
                setTime(e.target.value)
              }
            />

            <button onClick={addTask}>
              <Plus size={16} />
              Add
            </button>
          </div>

          <div className={styles.taskList}>
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`${styles.taskCard} ${
                  task.completed
                    ? styles.completed
                    : ""
                }`}
              >
                <div>
                  <h3>{task.subject}</h3>

                  <p>
                    <Clock3 size={13} />
                    {task.time}
                  </p>
                </div>

                <div className={styles.taskActions}>
                  <button
                    onClick={() =>
                      toggleTask(task.id)
                    }
                  >
                    <CheckCircle2 size={18} />
                  </button>

                  <button
                    onClick={() =>
                      deleteTask(task.id)
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* STUDY TRACKER */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <BarChart3 size={18} />
            <h2>Study Tracker</h2>
          </div>

          <div className={styles.trackerBox}>
            <div className={styles.progressCircle}>
              {studyMinutes}
              <span>Minutes</span>
            </div>

            <button
              className={styles.studyBtn}
              onClick={addStudyTime}
            >
              +30 Min Study
            </button>
          </div>
        </div>

        {/* DRIVE */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <UploadCloud size={18} />
            <h2>Study Drive</h2>
          </div>

          <label className={styles.uploadBox}>
            <input
              type="file"
              multiple
              hidden
              onChange={handleUpload}
            />

            <UploadCloud size={38} />

            <p>Upload Notes / PDF / Images</p>
          </label>

          <div className={styles.fileList}>
            {files.map((file) => (
              <a
                href={file.url}
                target="_blank"
                key={file.id}
                className={styles.fileCard}
              >
                <div>
                  <h4>{file.name}</h4>

                  <span>{file.size} MB</span>
                </div>

                <p>{file.type}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
