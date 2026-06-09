import React, { useState, useEffect } from "react";
import { 
  Activity, 
  Calendar, 
  CheckCircle, 
  Clock, 
  CloudLightning, 
  Cpu, 
  Database, 
  LogOut, 
  Plus, 
  RefreshCw, 
  Sliders, 
  Sparkles, 
  TrendingUp, 
  User, 
  Wifi, 
  Trash2,
  Check,
  AlertTriangle,
  Flame,
  Award,
  PlusCircle
} from "lucide-react";
import { 
  auth, 
  db, 
  functions, 
  googleProvider, 
  signInWithPopup, 
  signOut 
} from "./firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  deleteDoc, 
  addDoc 
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// Master List of Trackable Practices
const MASTER_PRACTICES = [
  {
    practice_id: "sadhguru_shambhavi",
    display_name: "Shambhavi Mahamudra Kriya",
    duration_target_mins: 21,
    category: "Kriya Yoga",
    source: "Sadhguru App"
  },
  {
    practice_id: "sadhguru_isha_kriya",
    display_name: "Isha Kriya",
    duration_target_mins: 15,
    category: "Guided Meditation",
    source: "Sadhguru App"
  },
  {
    practice_id: "sadhguru_upayoga",
    display_name: "Upa Yoga",
    duration_target_mins: 30,
    category: "Hatha Yoga",
    source: "Sadhguru App"
  },
  {
    practice_id: "mom_meditation",
    display_name: "Miracle of Mind Meditation",
    duration_target_mins: 12,
    category: "Mental Wellbeing",
    source: "Miracle of Mind App"
  }
];

// Default schedules for a fresh dashboard
const DEFAULT_SCHEDULES = [
  {
    schedule_id: "sched_morning_window",
    title: "Morning Sadhana Window",
    start_time: "03:30",
    end_time: "08:30",
    event_type: "personal",
    status: "scheduled"
  },
  {
    schedule_id: "sched_evening_window",
    title: "Evening Practice Block",
    start_time: "17:00",
    end_time: "19:00",
    event_type: "personal",
    status: "scheduled"
  }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [practices, setPractices] = useState(MASTER_PRACTICES);
  
  // Weekly Scheduler active day (0 = Mon, 1 = Tue, ..., 6 = Sun)
  const [activeDay, setActiveDay] = useState((new Date().getDay() + 6) % 7);
  
  // UI States
  const [isSyncingTrackB, setIsSyncingTrackB] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ title: "", start_time: "06:00", end_time: "07:00", days_of_week: [0, 1, 2, 3, 4, 5, 6] });
  const [showAddCompletionModal, setShowAddCompletionModal] = useState(false);
  const [newManualCompletion, setNewManualCompletion] = useState({ practice_id: "sadhguru_shambhavi", timestamp: "" });
  const [showAddPracticeModal, setShowAddPracticeModal] = useState(false);
  const [newPractice, setNewPractice] = useState({ display_name: "", duration_target_mins: 15, category: "Yoga", source: "Personal Goal" });
  const [localLastSync, setLocalLastSync] = useState(new Date().toISOString());

  // Listen for Firebase Auth changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setIsDemoMode(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync data (either from Firestore or LocalStorage depending on user mode)
  useEffect(() => {
    if (!user && !isDemoMode) {
      setSchedules([]);
      setCompletions([]);
      return;
    }

    if (isDemoMode) {
      // Load schedules, completions, practices from LocalStorage
      const localSchedules = localStorage.getItem("syncsadhana_schedules");
      const localCompletions = localStorage.getItem("syncsadhana_completions");
      const localPractices = localStorage.getItem("syncsadhana_practices");
      
      if (localSchedules) {
        setSchedules(JSON.parse(localSchedules));
      } else {
        setSchedules(DEFAULT_SCHEDULES);
        localStorage.setItem("syncsadhana_schedules", JSON.stringify(DEFAULT_SCHEDULES));
      }

      if (localCompletions) {
        setCompletions(JSON.parse(localCompletions));
      } else {
        const initialCompletions = [
          {
            completion_id: "comp_mock_1",
            user_id: "demo_user",
            practice_id: "mom_meditation",
            timestamp_completed: new Date(new Date().setHours(6, 0, 0, 0)).toISOString(),
            ingest_method: "track_b_api_sync",
            fallback_verification: "track_b_cloud_verified"
          }
        ];
        setCompletions(initialCompletions);
        localStorage.setItem("syncsadhana_completions", JSON.stringify(initialCompletions));
      }

      if (localPractices) {
        setPractices(JSON.parse(localPractices));
      } else {
        setPractices(MASTER_PRACTICES);
        localStorage.setItem("syncsadhana_practices", JSON.stringify(MASTER_PRACTICES));
      }
    } else {
      // Firebase subscriptions
      const schedulesQuery = query(collection(db, "schedules"), where("user_id", "==", user.uid));
      const completionsQuery = query(collection(db, "completions"), where("user_id", "==", user.uid));
      const practicesQuery = query(collection(db, "practices"), where("user_id", "==", user.uid));

      const unsubscribeSchedules = onSnapshot(schedulesQuery, (snapshot) => {
        const loadedSchedules = [];
        snapshot.forEach((doc) => {
          loadedSchedules.push({ schedule_id: doc.id, ...doc.data() });
        });
        if (loadedSchedules.length === 0) {
          DEFAULT_SCHEDULES.forEach(async (sched) => {
            await setDoc(doc(db, "schedules", sched.schedule_id), {
              ...sched,
              user_id: user.uid
            });
          });
        }
        setSchedules(loadedSchedules.length > 0 ? loadedSchedules : DEFAULT_SCHEDULES);
      });

      const unsubscribeCompletions = onSnapshot(completionsQuery, (snapshot) => {
        const loadedCompletions = [];
        snapshot.forEach((doc) => {
          loadedCompletions.push({ completion_id: doc.id, ...doc.data() });
        });
        setCompletions(loadedCompletions);
      });

      const unsubscribePractices = onSnapshot(practicesQuery, (snapshot) => {
        const loadedPractices = [...MASTER_PRACTICES];
        snapshot.forEach((doc) => {
          loadedPractices.push({ practice_id: doc.id, ...doc.data() });
        });
        setPractices(loadedPractices);
      });

      // Update user last active
      const userRef = doc(db, "users", user.uid);
      setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        created_at: user.metadata.creationTime,
        last_sync_timestamp: new Date().toISOString()
      }, { merge: true });

      return () => {
        unsubscribeSchedules();
        unsubscribeCompletions();
        unsubscribePractices();
      };
    }
  }, [user, isDemoMode]);

  // Auth Handlers
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Authentication Error: ", error);
      alert("Failed to authenticate with Google: " + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setIsDemoMode(false);
  };

  const enterDemoMode = () => {
    setIsDemoMode(true);
    setUser({
      uid: "demo_user",
      email: "demo.practice@gmail.com",
      displayName: "Sadhana Yogi",
      photoURL: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80"
    });
  };

  // Schedule management
  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!newSchedule.title) return;

    const newId = `sched_${Date.now()}`;
    const scheduleItem = {
      schedule_id: newId,
      user_id: user.uid,
      title: newSchedule.title,
      start_time: newSchedule.start_time,
      end_time: newSchedule.end_time,
      event_type: "personal",
      status: "scheduled",
      days_of_week: newSchedule.days_of_week
    };

    if (isDemoMode) {
      const updated = [...schedules, scheduleItem];
      setSchedules(updated);
      localStorage.setItem("syncsadhana_schedules", JSON.stringify(updated));
    } else {
      await setDoc(doc(db, "schedules", newId), scheduleItem);
    }

    setNewSchedule({ title: "", start_time: "06:00", end_time: "07:00", days_of_week: [0, 1, 2, 3, 4, 5, 6] });
    setShowAddScheduleModal(false);
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (isDemoMode) {
      const updated = schedules.filter(s => s.schedule_id !== scheduleId);
      setSchedules(updated);
      localStorage.setItem("syncsadhana_schedules", JSON.stringify(updated));
    } else {
      await deleteDoc(doc(db, "schedules", scheduleId));
    }
  };

  // Custom Practice Management
  const handleAddPractice = async (e) => {
    e.preventDefault();
    if (!newPractice.display_name) return;

    const practiceId = `custom_${Date.now()}`;
    const practiceItem = {
      practice_id: practiceId,
      user_id: user.uid,
      display_name: newPractice.display_name,
      duration_target_mins: parseInt(newPractice.duration_target_mins) || 15,
      category: newPractice.category,
      source: newPractice.source
    };

    if (isDemoMode) {
      const updated = [...practices, practiceItem];
      setPractices(updated);
      localStorage.setItem("syncsadhana_practices", JSON.stringify(updated));
    } else {
      await setDoc(doc(db, "practices", practiceId), practiceItem);
    }

    setShowAddPracticeModal(false);
    setNewPractice({ display_name: "", duration_target_mins: 15, category: "Yoga", source: "Personal Goal" });
  };

  const handleDeletePractice = async (practiceId) => {
    if (practiceId.startsWith("sadhguru") || practiceId.startsWith("mom")) {
      alert("System core practices cannot be deleted.");
      return;
    }
    if (isDemoMode) {
      const updated = practices.filter(p => p.practice_id !== practiceId);
      setPractices(updated);
      localStorage.setItem("syncsadhana_practices", JSON.stringify(updated));
    } else {
      await deleteDoc(doc(db, "practices", practiceId));
    }
  };

  // Log completion management (Manual Logging)
  const handleManualCompletion = async (e) => {
    e.preventDefault();
    const timestamp = newManualCompletion.timestamp 
      ? new Date(newManualCompletion.timestamp).toISOString() 
      : new Date().toISOString();

    const compId = `comp_manual_${Date.now()}`;
    const completionItem = {
      completion_id: compId,
      user_id: user.uid,
      practice_id: newManualCompletion.practice_id,
      timestamp_completed: timestamp,
      ingest_method: "manual_log",
      fallback_verification: "manual_user_verified"
    };

    if (isDemoMode) {
      const updated = [...completions, completionItem];
      setCompletions(updated);
      localStorage.setItem("syncsadhana_completions", JSON.stringify(updated));
    } else {
      await setDoc(doc(db, "completions", compId), completionItem);
    }

    setShowAddCompletionModal(false);
    setNewManualCompletion({ practice_id: "sadhguru_shambhavi", timestamp: "" });
  };

  const quickToggleCompletion = async (practiceId) => {
    // Check if completed today. If yes, remove it. If no, add it.
    const today = new Date().toDateString();
    const completedToday = completions.find(c => 
      c.practice_id === practiceId && new Date(c.timestamp_completed).toDateString() === today
    );

    if (completedToday) {
      // Remove completion
      if (isDemoMode) {
        const updated = completions.filter(c => c.completion_id !== completedToday.completion_id);
        setCompletions(updated);
        localStorage.setItem("syncsadhana_completions", JSON.stringify(updated));
      } else {
        await deleteDoc(doc(db, "completions", completedToday.completion_id));
      }
    } else {
      // Add completion
      const compId = `comp_manual_${Date.now()}`;
      const completionItem = {
        completion_id: compId,
        user_id: user.uid,
        practice_id: practiceId,
        timestamp_completed: new Date().toISOString(),
        ingest_method: "manual_log",
        fallback_verification: "manual_user_verified"
      };

      if (isDemoMode) {
        const updated = [...completions, completionItem];
        setCompletions(updated);
        localStorage.setItem("syncsadhana_completions", JSON.stringify(updated));
      } else {
        await setDoc(doc(db, "completions", compId), completionItem);
      }
    }
  };

  // Track B Cloud Function Sync Trigger
  const triggerTrackBSync = async () => {
    setIsSyncingTrackB(true);
    setSyncMessage("Connecting to vendors and fetching authenticated logs...");
    
    if (isDemoMode) {
      setTimeout(() => {
        // Add Shambhavi Kriya and Isha Kriya from Cloud sync
        const today = new Date();
        const sgTime1 = new Date(today);
        sgTime1.setHours(6, 30, 0, 0); // 6:30 AM today

        const sgTime2 = new Date(today);
        sgTime2.setHours(7, 15, 0, 0); // 7:15 AM today

        const newComp1 = {
          completion_id: `comp_mock_cloud_1_${Date.now()}`,
          user_id: "demo_user",
          practice_id: "sadhguru_shambhavi",
          timestamp_completed: sgTime1.toISOString(),
          ingest_method: "track_b_api_sync",
          fallback_verification: "track_b_cloud_verified"
        };

        const newComp2 = {
          completion_id: `comp_mock_cloud_2_${Date.now()}`,
          user_id: "demo_user",
          practice_id: "sadhguru_isha_kriya",
          timestamp_completed: sgTime2.toISOString(),
          ingest_method: "track_b_api_sync",
          fallback_verification: "track_b_cloud_verified"
        };

        const updated = [...completions, newComp1, newComp2];
        setCompletions(updated);
        localStorage.setItem("syncsadhana_completions", JSON.stringify(updated));
        
        setLocalLastSync(new Date().toISOString());
        setIsSyncingTrackB(false);
        setSyncMessage("Sync complete! Consolidated Shambhavi and Isha Kriya.");
      }, 1500);
    } else {
      try {
        const syncSadhanaFunction = httpsCallable(functions, "syncExternalSadhana");
        const response = await syncSadhanaFunction({ 
          googleAccessToken: "mock_demo_google_token",
          useMock: true 
        });

        if (response.data && response.data.success) {
          setSyncMessage(`Sync successful! Consolidated ${response.data.syncCount} completions.`);
          setLocalLastSync(response.data.timestamp);
        } else {
          setSyncMessage("Sync completed with no updates.");
        }
      } catch (error) {
        console.error("Cloud function error: ", error);
        setSyncMessage("Cloud sync error (Upgrade to Blaze plan required for Cloud Functions). Falling back to simulated API sync...");
        
        setTimeout(async () => {
          const today = new Date();
          const sgTime1 = new Date(today);
          sgTime1.setHours(6, 30, 0, 0); // 6:30 AM today

          const sgTime2 = new Date(today);
          sgTime2.setHours(7, 15, 0, 0); // 7:15 AM today

          const newComp1 = {
            completion_id: `comp_mock_cloud_1_${Date.now()}`,
            user_id: user.uid,
            practice_id: "sadhguru_shambhavi",
            timestamp_completed: sgTime1.toISOString(),
            ingest_method: "track_b_api_sync",
            fallback_verification: "track_b_cloud_verified"
          };

          const newComp2 = {
            completion_id: `comp_mock_cloud_2_${Date.now()}`,
            user_id: user.uid,
            practice_id: "sadhguru_isha_kriya",
            timestamp_completed: sgTime2.toISOString(),
            ingest_method: "track_b_api_sync",
            fallback_verification: "track_b_cloud_verified"
          };

          try {
            await setDoc(doc(db, "completions", newComp1.completion_id), newComp1);
            await setDoc(doc(db, "completions", newComp2.completion_id), newComp2);
            setLocalLastSync(new Date().toISOString());
            setSyncMessage("Sync complete! Consolidated Shambhavi and Isha Kriya (simulated).");
          } catch (e) {
            console.error("Firestore write failed:", e);
            setSyncMessage("Write failed: " + e.message);
          } finally {
            setIsSyncingTrackB(false);
          }
        }, 1500);
      }
    }
  };

  // Track A Mac Backup Extractor Mock Trigger
  const triggerTrackAMockLocal = () => {
    setIsSyncingTrackB(true);
    setSyncMessage("Reading Wi-Fi local iOS backup SQLite files...");

    setTimeout(() => {
      const today = new Date();
      const momTime = new Date(today);
      momTime.setHours(7, 30, 0, 0); // 7:30 AM today

      const newComp = {
        completion_id: `comp_mock_local_${Date.now()}`,
        user_id: user.uid,
        practice_id: "mom_meditation",
        timestamp_completed: momTime.toISOString(),
        ingest_method: "track_a_mac_backup",
        fallback_verification: "track_a_mac_backup_verified"
      };

      if (isDemoMode) {
        const updated = [...completions, newComp];
        setCompletions(updated);
        localStorage.setItem("syncsadhana_completions", JSON.stringify(updated));
      } else {
        setDoc(doc(db, "completions", newComp.completion_id), newComp);
      }

      setLocalLastSync(new Date().toISOString());
      setIsSyncingTrackB(false);
      setSyncMessage("Local extraction success! Integrated Miracle of Mind Meditation.");
    }, 1200);
  };

  // Date utilities mapping activeDay tab index to current week calendar date
  const getSelectedDayDate = (dayIndex) => {
    const today = new Date();
    const currentDayIndex = (today.getDay() + 6) % 7; // Mon = 0, Sun = 6
    const diff = dayIndex - currentDayIndex;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diff);
    return targetDate;
  };

  const getMatchingCompletionsForSchedule = (sched, dayIndex) => {
    const targetDate = getSelectedDayDate(dayIndex);
    const targetDateString = targetDate.toDateString();
    
    const [startHour, startMin] = sched.start_time.split(":").map(Number);
    const [endHour, endMin] = sched.end_time.split(":").map(Number);
    
    return completions.filter(c => {
      const compDate = new Date(c.timestamp_completed);
      
      if (compDate.toDateString() !== targetDateString) return false;
      
      const compHour = compDate.getHours();
      const compMin = compDate.getMinutes();
      
      const compTimeMins = compHour * 60 + compMin;
      const startTimeMins = startHour * 60 + startMin;
      const endTimeMins = endHour * 60 + endMin;
      
      return compTimeMins >= startTimeMins && compTimeMins <= endTimeMins;
    });
  };

  // Statistics Calculations
  const todayCompletionsCount = completions.filter(c => 
    new Date(c.timestamp_completed).toDateString() === new Date().toDateString()
  ).length;

  const totalRegisteredPracticesCount = practices.length;
  
  const completionPercentage = totalRegisteredPracticesCount > 0 
    ? Math.min(Math.round((todayCompletionsCount / totalRegisteredPracticesCount) * 100), 100) 
    : 0;

  // Streak calculation
  const calculateStreak = () => {
    if (completions.length === 0) return 0;
    const completedDates = new Set(
      completions.map(c => new Date(c.timestamp_completed).toLocaleDateString())
    );
    let streak = 0;
    let checkDate = new Date();
    
    const todayStr = checkDate.toLocaleDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString();

    if (!completedDates.has(todayStr) && !completedDates.has(yesterdayStr)) {
      return 0;
    }

    if (!completedDates.has(todayStr) && completedDates.has(yesterdayStr)) {
      checkDate = yesterday;
    }

    while (completedDates.has(checkDate.toLocaleDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  };

  const currentStreak = calculateStreak();

  // Total Hours practiced
  const calculateTotalHours = () => {
    let totalMins = 0;
    completions.forEach(c => {
      const practice = practices.find(p => p.practice_id === c.practice_id);
      if (practice) {
        totalMins += practice.duration_target_mins;
      }
    });
    return (totalMins / 60).toFixed(1);
  };

  const totalHoursPracticed = calculateTotalHours();

  // Yogi Levels
  const totalCompletionsCount = completions.length;
  let yogiLevel = "Sadhaka Novice";
  let nextLevel = "Dedicated Sadhaka";
  let levelProgress = 0;
  let completionsRequired = 6;
  
  if (totalCompletionsCount >= 41) {
    yogiLevel = "Siddha Yogi Master";
    nextLevel = "Spiritual Guru";
    levelProgress = 100;
    completionsRequired = 100;
  } else if (totalCompletionsCount >= 16) {
    yogiLevel = "Advanced Yogi";
    nextLevel = "Siddha Yogi Master";
    completionsRequired = 41;
    levelProgress = Math.round(((totalCompletionsCount - 16) / (41 - 16)) * 100);
  } else if (totalCompletionsCount >= 6) {
    yogiLevel = "Dedicated Sadhaka";
    nextLevel = "Advanced Yogi";
    completionsRequired = 16;
    levelProgress = Math.round(((totalCompletionsCount - 6) / (16 - 6)) * 100);
  } else {
    yogiLevel = "Sadhaka Novice";
    nextLevel = "Dedicated Sadhaka";
    completionsRequired = 6;
    levelProgress = Math.round((totalCompletionsCount / 6) * 100);
  }

  // 30 Days Heatmap Grid Calculation
  const getHeatmapData = () => {
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toLocaleDateString();
      const dateLabel = date.toLocaleDateString([], { month: "short", day: "numeric" });
      
      const dayCompletions = completions.filter(c => 
        new Date(c.timestamp_completed).toLocaleDateString() === dateString
      );
      
      const pct = practices.length > 0 ? (dayCompletions.length / practices.length) * 100 : 0;
      let level = 0;
      if (dayCompletions.length > 0) {
        if (pct <= 25) level = 1;
        else if (pct <= 50) level = 2;
        else if (pct <= 75) level = 3;
        else level = 4;
      }
      
      data.push({
        date: dateString,
        dateLabel: dateLabel,
        count: dayCompletions.length,
        level: level
      });
    }
    return data;
  };

  const heatmapCells = getHeatmapData();

  // SVG Progress Ring Parameters
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionPercentage / 100) * circumference;

  // Filter schedules for timeline hour rows
  const getSchedulesForHour = (hour) => {
    return schedules.filter(sched => {
      const days = sched.days_of_week || [0, 1, 2, 3, 4, 5, 6];
      if (!days.includes(activeDay)) return false;
      const [startH] = sched.start_time.split(":").map(Number);
      return startH === hour;
    });
  };

  // Hours to display in timeline (3 AM to 9 PM)
  const timelineHours = Array.from({ length: 19 }, (_, i) => i + 3);

  // Render Login page if not authenticated and not in demo mode
  if (!user) {
    return (
      <div className="login-container" style={{
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        justifyContent: "center", 
        minHeight: "100vh",
        padding: "20px",
        textAlign: "center"
      }}>
        <div className="glass-panel" style={{ maxWidth: "460px", width: "100%", padding: "40px" }}>
          <div style={{ marginBottom: "24px" }}>
            <div style={{
              background: "var(--gradient-brand)",
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: "var(--shadow-glow)"
            }}>
              <Activity size={38} color="#fff" />
            </div>
            <h1 style={{ fontSize: "32px", marginBottom: "8px" }}>SyncSadhana</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "16px" }}>
              Unified Schedule & Practice Tracker for Sadhguru and Miracle of Mind Apps.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "32px" }}>
            <button 
              id="google-signin-btn"
              onClick={handleLogin}
              className="btn btn-primary" 
              style={{ padding: "14px", fontSize: "15px", width: "100%" }}
            >
              Sign In with Google Account
            </button>
            <button 
              id="demo-mode-btn"
              onClick={enterDemoMode}
              className="btn btn-secondary" 
              style={{ padding: "14px", fontSize: "15px", width: "100%" }}
            >
              Enter Sandbox Demo Mode
            </button>
          </div>
          
          <div style={{ marginTop: "40px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px" }}>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Cpu size={14} /> Dual-Path Synchronization Protocol Active (Track A & B)
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Premium Header */}
      <header style={{
        background: "#ffffff",
        borderBottom: "1px solid #eae8e1",
        position: "sticky",
        top: 0,
        zIndex: 100,
        padding: "16px 24px"
      }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          
          {/* Left: SS Circle Logo & Serif Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              background: "var(--accent-primary)",
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: "600",
              fontSize: "13px",
              fontFamily: "var(--font-sans)",
              letterSpacing: "0.5px"
            }}>
              SS
            </div>
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: "500", fontFamily: "var(--font-display)", color: "var(--text-primary)", margin: 0, lineHeight: 1.2 }}>
                SyncSadhana
              </h1>
              <span style={{ 
                fontSize: "10px", 
                color: "var(--text-muted)", 
                display: "flex", 
                alignItems: "center", 
                gap: "4.5px", 
                marginTop: "2px", 
                fontWeight: "500", 
                fontFamily: "var(--font-sans)" 
              }}>
                {isDemoMode ? <Sliders size={10} color="orange" /> : <Database size={10} color="var(--accent-success)" />} 
                {isDemoMode ? "Sandbox Demo Mode" : "Firebase Cloud Engine Connected"}
              </span>
            </div>
          </div>

          {/* Right: Facilitator details & Logout */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-primary)" }}>
                {user.displayName || "Michael Harvey"}
              </div>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#7a6e5a", letterSpacing: "0.8px" }}>
                FACILITATOR
              </div>
            </div>
            <button 
              id="logout-btn"
              onClick={handleLogout} 
              className="btn btn-secondary btn-icon" 
              style={{ width: "32px", height: "32px", border: "none", background: "transparent", color: "var(--text-secondary)" }}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="dashboard-grid">
        
        {/* Left Column: Streaks, Stats & Sync Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Practice Streak Metrics & Progress Ring */}
          <div className="glass-panel animate-slide-up">
            <h2 style={{ fontSize: "18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <TrendingUp size={18} color="var(--accent-primary)" /> Daily Integration
            </h2>
            
            {/* SVG Progress Ring */}
            <div className="progress-ring-container">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--accent-primary)" />
                    <stop offset="100%" stopColor="var(--accent-secondary)" />
                  </linearGradient>
                </defs>
                <circle
                  className="progress-ring-circle-bg"
                  cx="60"
                  cy="60"
                  r={radius}
                />
                <circle
                  className="progress-ring-circle-fill"
                  cx="60"
                  cy="60"
                  r={radius}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="progress-ring-text">{completionPercentage}%</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Practices Completed</span>
              <span style={{ fontSize: "15px", fontWeight: "700" }}>{todayCompletionsCount}/{totalRegisteredPracticesCount}</span>
            </div>

            {/* Streak & Hours Panel */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  <Flame size={12} color="var(--accent-sadhguru)" /> Current Streak
                </span>
                <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--accent-sadhguru)", marginTop: "4px" }}>
                  {currentStreak} {currentStreak === 1 ? "Day" : "Days"}
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  <Clock size={12} color="var(--accent-mom)" /> Sadhana Hours
                </span>
                <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--accent-mom)", marginTop: "4px" }}>
                  {totalHoursPracticed}h
                </div>
              </div>
            </div>

            {/* Yogi Milestones Level */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Award size={12} color="var(--accent-success)" /> Yogi Level
                </span>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-primary)" }}>{yogiLevel}</span>
              </div>
              
              <div className="milestone-bar-bg">
                <div className="milestone-bar-fill" style={{ width: `${levelProgress}%` }}></div>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--text-muted)", marginTop: "4px" }}>
                <span>{totalCompletionsCount} completions</span>
                <span>Next: {nextLevel} ({completionsRequired} req.)</span>
              </div>
            </div>

          </div>

          {/* Sync Engine Monitor Panel */}
          <div className="glass-panel animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <h2 style={{ fontSize: "18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Cpu size={18} color="var(--accent-primary)" /> Integration Sync Engine
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {/* Track B */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "12px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                    <CloudLightning size={14} color="var(--accent-mom)" /> Track B (Primary API)
                  </span>
                  <span style={{
                    fontSize: "10px", 
                    background: "rgba(16, 185, 129, 0.1)", 
                    color: "var(--accent-success)", 
                    padding: "2px 8px", 
                    borderRadius: "20px",
                    fontWeight: "600"
                  }}>
                    Operational
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                  Pulls completed practices dynamically from Sadhguru App and Miracle of Mind servers via Google OAuth.
                </p>
                <button 
                  id="sync-now-btn"
                  onClick={triggerTrackBSync} 
                  disabled={isSyncingTrackB}
                  className="btn btn-primary" 
                  style={{ width: "100%", padding: "8px 16px", fontSize: "13px" }}
                >
                  <RefreshCw size={14} className={isSyncingTrackB ? "spin-loader" : ""} style={{ animation: isSyncingTrackB ? "rotateLoader 1s linear infinite" : "none" }} /> 
                  {isSyncingTrackB ? "Syncing APIs..." : "Sync Cloud Now"}
                </button>
              </div>

              {/* Track A */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "12px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Wifi size={14} color="var(--accent-sadhguru)" /> Track A (Local Backup)
                  </span>
                  <span style={{
                    fontSize: "10px", 
                    background: "rgba(99, 102, 241, 0.1)", 
                    color: "var(--accent-primary)", 
                    padding: "2px 8px", 
                    borderRadius: "20px",
                    fontWeight: "600"
                  }}>
                    WiFi Backup Fallback
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                  macOS LaunchAgent queries decrypted SQLite database caches from physical iOS Wi-Fi backup records.
                </p>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <button 
                    id="mock-backup-sync-btn"
                    onClick={triggerTrackAMockLocal}
                    className="btn btn-secondary"
                    style={{ width: "100%", padding: "8px 16px", fontSize: "13px", gap: "6px" }}
                  >
                    <Sliders size={14} /> Mock local Wi-Fi sync
                  </button>
                  <a 
                    href="#setup-instructions" 
                    onClick={() => alert("To setup Track A, copy local_extractor/com.syncsadhana.extractor.plist to ~/Library/LaunchAgents/ and bootstrap using launchctl.")}
                    style={{ fontSize: "11px", color: "var(--accent-primary)", textAlign: "center", display: "block", marginTop: "4px" }}
                  >
                    Setup LaunchAgent configuration daemon
                  </a>
                </div>
              </div>

            </div>
            
            {syncMessage && (
              <div style={{
                marginTop: "16px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "rgba(99, 102, 241, 0.1)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                fontSize: "12px",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <Check size={14} color="var(--accent-success)" />
                <span>{syncMessage}</span>
              </div>
            )}

            <div style={{ marginTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
              Last updated: {new Date(localLastSync).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Right Column: Weekly Scheduler Timeline, Heatmap & Integration Matrix */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Weekly Scheduler Timeline Grid */}
          <div className="glass-panel animate-slide-up" style={{ animationDelay: "0.15s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Calendar size={20} color="var(--accent-primary)" /> Weekly Sadhana Scheduler
                </h2>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  Select days to schedule spiritual practice blocks. Time window matches completions in real-time.
                </p>
              </div>
              <button 
                id="add-schedule-btn"
                onClick={() => setShowAddScheduleModal(true)} 
                className="btn btn-secondary" 
                style={{ padding: "8px 14px", fontSize: "13px", whiteSpace: "nowrap" }}
              >
                <Plus size={14} /> Add Window
              </button>
            </div>

            {/* Weekly Day Selector Tabs */}
            <div className="weekly-tabs">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName, idx) => {
                const isSelected = activeDay === idx;
                const tabDate = getSelectedDayDate(idx);
                const isToday = tabDate.toDateString() === new Date().toDateString();
                
                return (
                  <div 
                    key={dayName}
                    onClick={() => setActiveDay(idx)}
                    className={`weekly-tab ${isSelected ? "active" : ""}`}
                    style={{ border: isToday && !isSelected ? "1px solid var(--accent-primary)" : "" }}
                  >
                    {dayName}
                    <span className="day-subtitle">
                      {tabDate.toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Calendar Timeline Grid */}
            <div className="timeline-container">
              {timelineHours.map(hour => {
                const hourSchedules = getSchedulesForHour(hour);
                const hourLabel = `${hour.toString().padStart(2, "0")}:00`;
                
                return (
                  <div key={hour} className="timeline-row">
                    <div className="timeline-hour">{hourLabel}</div>
                    <div className="timeline-content-area">
                      {hourSchedules.length > 0 ? (
                        hourSchedules.map(sched => {
                          const matches = getMatchingCompletionsForSchedule(sched, activeDay);
                          const isCompleted = matches.length > 0;
                          
                          return (
                            <div 
                              key={sched.schedule_id} 
                              className={`timeline-slot-card ${isCompleted ? "completed" : ""}`}
                            >
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{ fontWeight: "700" }}>{sched.title}</span>
                                  <span className="timeline-completion-badge" style={{
                                    background: isCompleted ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.1)",
                                    color: isCompleted ? "var(--accent-success)" : "var(--accent-sadhguru)"
                                  }}>
                                    {isCompleted ? "Completed" : "Pending"}
                                  </span>
                                </div>
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  Range: {sched.start_time} - {sched.end_time}
                                </span>
                                
                                {isCompleted && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                                    {matches.map(m => {
                                      const practice = practices.find(p => p.practice_id === m.practice_id);
                                      return (
                                        <span 
                                          key={m.completion_id} 
                                          style={{
                                            fontSize: "10px", 
                                            background: "rgba(16, 185, 129, 0.1)", 
                                            border: "1px solid rgba(16, 185, 129, 0.2)",
                                            borderRadius: "6px",
                                            padding: "2px 6px",
                                            color: "var(--text-primary)"
                                          }}
                                        >
                                          ✓ {practice?.display_name || m.practice_id}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              <button 
                                onClick={() => handleDeleteSchedule(sched.schedule_id)}
                                className="btn btn-secondary" 
                                style={{ padding: "4px", background: "transparent", border: "none", color: "var(--text-muted)" }}
                                title="Delete Schedule Window"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                        })
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Consistency Heatmap Grid */}
          <div className="glass-panel animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <h2 style={{ fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <TrendingUp size={18} color="var(--accent-primary)" /> Consistency Heatmap (30 Days)
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
              Visualizes daily sadhana logs completion density. Hover on cells to inspect logs count.
            </p>
            
            <div className="heatmap-container">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginBottom: "4px" }}>
                <span>30 Days Ago</span>
                <span>Today</span>
              </div>
              <div className="heatmap-grid">
                {heatmapCells.map((cell, idx) => (
                  <div 
                    key={idx}
                    className={`heatmap-cell level-${cell.level}`}
                  >
                    <span className="heatmap-tooltip">
                      {cell.dateLabel}: {cell.count} practice{cell.count === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Grid Integration Matrix (Instant Manual Toggle) */}
          <div className="glass-panel animate-slide-up" style={{ animationDelay: "0.25s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800" }}>Grid Integration Matrix</h2>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  Tap practices to instantly toggle manual logs for today. Add custom practices to track.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button 
                  id="add-practice-btn"
                  onClick={() => setShowAddPracticeModal(true)} 
                  className="btn btn-secondary" 
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  Add Practice
                </button>
                <button 
                  id="log-custom-btn"
                  onClick={() => setShowAddCompletionModal(true)} 
                  className="btn btn-secondary" 
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  Log Custom Time
                </button>
              </div>
            </div>

            <div className="practice-grid">
              {practices.map((practice) => {
                const today = new Date().toDateString();
                const isCompletedToday = completions.some(c => 
                  c.practice_id === practice.practice_id && new Date(c.timestamp_completed).toDateString() === today
                );
                const isCustom = !practice.practice_id.startsWith("sadhguru") && !practice.practice_id.startsWith("mom");
                
                return (
                  <div 
                    key={practice.practice_id}
                    className={`practice-card ${isCompletedToday ? "completed" : ""} ${practice.source.toLowerCase().includes("sadhguru") ? "sadhguru" : practice.source.toLowerCase().includes("miracle") ? "mom" : ""}`}
                    style={{ position: "relative" }}
                  >
                    {/* Trash/delete icon for custom practices */}
                    {isCustom && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Are you sure you want to delete practice "${practice.display_name}"?`)) {
                            handleDeletePractice(practice.practice_id);
                          }
                        }}
                        style={{
                          position: "absolute",
                          top: "10px",
                          right: "40px",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          padding: "2px"
                        }}
                        title="Delete Custom Practice"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}

                    <div onClick={() => quickToggleCompletion(practice.practice_id)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
                          {practice.category}
                        </span>
                        {isCompletedToday ? (
                          <div style={{
                            background: "var(--accent-success)",
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 0 10px rgba(16, 185, 129, 0.4)"
                          }}>
                            <Check size={12} color="#fff" />
                          </div>
                        ) : (
                          <div style={{
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%"
                          }} />
                        )}
                      </div>
                      
                      <h3 style={{ fontSize: "15px", fontWeight: "700", marginBottom: "4px" }}>
                        {practice.display_name}
                      </h3>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        <span>Target: {practice.duration_target_mins} mins</span>
                        <span style={{
                          color: practice.source.includes("Sadhguru") ? "var(--accent-sadhguru)" : practice.source.includes("Miracle") ? "var(--accent-mom)" : "var(--accent-secondary)"
                        }}>
                          {practice.source}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </main>

      {/* Modal: Add Schedule Window */}
      {showAddScheduleModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: "20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Calendar size={20} color="var(--accent-primary)" /> Add Schedule Window
            </h3>
            <form onSubmit={handleAddSchedule}>
              <div className="form-group">
                <label>Sadhana Window Title</label>
                <input 
                  id="sched-title-input"
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Morning Sadhana Window"
                  value={newSchedule.title}
                  onChange={e => setNewSchedule({ ...newSchedule, title: e.target.value })}
                  required 
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label>Start Time</label>
                  <input 
                    id="sched-start-input"
                    type="time" 
                    className="form-input" 
                    value={newSchedule.start_time}
                    onChange={e => setNewSchedule({ ...newSchedule, start_time: e.target.value })}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input 
                    id="sched-end-input"
                    type="time" 
                    className="form-input" 
                    value={newSchedule.end_time}
                    onChange={e => setNewSchedule({ ...newSchedule, end_time: e.target.value })}
                    required 
                  />
                </div>
              </div>

              {/* Repeating days checklist */}
              <div className="form-group">
                <label>Repeat Days</label>
                <div className="days-checkbox-grid">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName, idx) => {
                    const isSelected = newSchedule.days_of_week.includes(idx);
                    return (
                      <label 
                        key={idx} 
                        className={`day-checkbox-label ${isSelected ? "selected" : ""}`}
                      >
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => {
                            const updatedDays = isSelected
                              ? newSchedule.days_of_week.filter(d => d !== idx)
                              : [...newSchedule.days_of_week, idx];
                            setNewSchedule({ ...newSchedule, days_of_week: updatedDays });
                          }}
                        />
                        {dayName}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button 
                  id="cancel-sched-btn"
                  type="button" 
                  onClick={() => setShowAddScheduleModal(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  id="save-sched-btn"
                  type="submit" 
                  className="btn btn-primary"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Custom Practice */}
      {showAddPracticeModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: "20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <PlusCircle size={20} color="var(--accent-secondary)" /> Add Custom Practice
            </h3>
            <form onSubmit={handleAddPractice}>
              <div className="form-group">
                <label>Practice Display Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Surya Kriya, Pranayama"
                  value={newPractice.display_name}
                  onChange={e => setNewPractice({ ...newPractice, display_name: e.target.value })}
                  required 
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label>Target Duration (mins)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="1"
                    value={newPractice.duration_target_mins}
                    onChange={e => setNewPractice({ ...newPractice, duration_target_mins: e.target.value })}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Yoga, Breathing"
                    value={newPractice.category}
                    onChange={e => setNewPractice({ ...newPractice, category: e.target.value })}
                    required 
                  />
                </div>
              </div>
              <div className="form-group">
                <label>App/Source</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Personal Goal, Wim Hof App"
                  value={newPractice.source}
                  onChange={e => setNewPractice({ ...newPractice, source: e.target.value })}
                  required 
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddPracticeModal(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  Add Practice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Custom Completion */}
      {showAddCompletionModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: "20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle size={20} color="var(--accent-success)" /> Log Practice Completion
            </h3>
            <form onSubmit={handleManualCompletion}>
              <div className="form-group">
                <label>Select Practice</label>
                <select 
                  id="practice-select-input"
                  className="form-input"
                  value={newManualCompletion.practice_id}
                  onChange={e => setNewManualCompletion({ ...newManualCompletion, practice_id: e.target.value })}
                >
                  {practices.map(p => (
                    <option key={p.practice_id} value={p.practice_id}>{p.display_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Completion Date & Time (Optional)</label>
                <input 
                  id="completion-time-input"
                  type="datetime-local" 
                  className="form-input" 
                  value={newManualCompletion.timestamp}
                  onChange={e => setNewManualCompletion({ ...newManualCompletion, timestamp: e.target.value })}
                  placeholder="Defaults to current time"
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                  Leave blank to log completion at current timestamp.
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button 
                  id="cancel-log-btn"
                  type="button" 
                  onClick={() => setShowAddCompletionModal(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  id="save-log-btn"
                  type="submit" 
                  className="btn btn-primary"
                >
                  Log Completion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

