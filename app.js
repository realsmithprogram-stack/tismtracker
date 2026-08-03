import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, updateDoc, getDoc, onSnapshot,
  collection, addDoc, query, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged,
  setPersistence, browserLocalPersistence, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---------- Default schedule (used the very first time, before Settings edits) ----------
const DEFAULT_SCHEDULE = [
  { id: "wake-up", time: "09:00", title: "Wake up", icon: "☀️", subtasks: [], recurring: true, dateKey: null },
  { id: "shower", time: "09:15", title: "Shower", icon: "🚿", subtasks: ["Get towel", "Turn shower on", "Shower", "Dry off", "Get dressed"], recurring: true, dateKey: null },
  { id: "breakfast", time: "10:00", title: "Eat breakfast", icon: "🍽", subtasks: ["Choose food", "Eat", "Drink water"], recurring: true, dateKey: null },
  { id: "brush-teeth", time: "10:30", title: "Brush teeth", icon: "🪥", subtasks: [], recurring: true, dateKey: null }
];

const BAD_DAY_ESSENTIALS = [
  { id: "essential-0", title: "Drink water", icon: "💧" },
  { id: "essential-1", title: "Eat something", icon: "🍽" },
  { id: "essential-2", title: "Shower", icon: "🚿" },
  { id: "essential-3", title: "Brush teeth", icon: "🪥" },
  { id: "essential-4", title: "Get dressed", icon: "👕" },
  { id: "essential-5", title: "Open curtains", icon: "🪟" },
  { id: "essential-6", title: "Rest", icon: "🛋️" }
];

const MOODS = [
  { id: "great", emoji: "😄", label: "Great" },
  { id: "good", emoji: "🙂", label: "Good" },
  { id: "okay", emoji: "😐", label: "Okay" },
  { id: "low", emoji: "🙁", label: "Low" },
  { id: "bad", emoji: "😭", label: "Bad" }
];

const SUGGESTION_PRESETS = [
  "Add a water break?",
  "Add a short rest?",
  "Add a stretch break?",
  "Add a snack break?"
];

// ---------- Continuous day/night color-phase engine ----------
// Anchor stops through a 24h clock; colors are linearly interpolated
// between the two nearest stops so the whole app drifts smoothly
// rather than snapping between fixed "modes".
const PHASE_STOPS = [
  { h: 0,    bgTop: "#14112A", bgMid: "#1E1A3D", bgBottom: "#241F42", text: "#C9BEDD", muted: "#8D82A8",
    card: "rgba(42,36,70,0.55)", shadow: "rgba(8,6,18,0.5)", accentA: "#9B8AD9", accentB: "#6C63A6",
    pinkA: "#9B8AD9", pinkB: "#6C63A6", topbar: "rgba(28,24,52,0.8)", topbarPink: "rgba(28,24,52,0.8)",
    message: "rgba(58,48,84,0.55)", star: 1 },
  { h: 5,    bgTop: "#2A2145", bgMid: "#6B4B5E", bgBottom: "#F0A98B", text: "#5A3B52", muted: "#9B7A92",
    card: "rgba(255,255,255,0.5)", shadow: "rgba(120,70,80,0.18)", accentA: "#FF9A76", accentB: "#E97AA0",
    pinkA: "#FF9AC0", pinkB: "#E97AA0", topbar: "rgba(255,225,210,0.8)", topbarPink: "rgba(255,225,225,0.8)",
    message: "rgba(255,230,235,0.6)", star: 0.6 },
  { h: 6.5,  bgTop: "#FFDCC2", bgMid: "#FFB6A8", bgBottom: "#F6A0B8", text: "#5A3B4A", muted: "#9B7A88",
    card: "rgba(255,255,255,0.68)", shadow: "rgba(120,70,80,0.14)", accentA: "#FF9A76", accentB: "#F4708C",
    pinkA: "#FF9AC0", pinkB: "#F4708C", topbar: "rgba(255,225,210,0.85)", topbarPink: "rgba(255,225,235,0.85)",
    message: "#FDEAF0", star: 0.1 },
  { h: 8,    bgTop: "#FFF6EC", bgMid: "#FFEBD8", bgBottom: "#FFE1C6", text: "#4A3B52", muted: "#8A7A92",
    card: "rgba(255,255,255,0.72)", shadow: "rgba(74,59,82,0.10)", accentA: "#FF8F66", accentB: "#E06B44",
    pinkA: "#F2789F", pinkB: "#E0628C", topbar: "rgba(255,246,236,0.85)", topbarPink: "rgba(255,240,246,0.85)",
    message: "#FDEEF3", star: 0 },
  { h: 17,   bgTop: "#FFF6EC", bgMid: "#FFEBD8", bgBottom: "#FFE1C6", text: "#4A3B52", muted: "#8A7A92",
    card: "rgba(255,255,255,0.72)", shadow: "rgba(74,59,82,0.10)", accentA: "#FF8F66", accentB: "#E06B44",
    pinkA: "#F2789F", pinkB: "#E0628C", topbar: "rgba(255,246,236,0.85)", topbarPink: "rgba(255,240,246,0.85)",
    message: "#FDEEF3", star: 0 },
  { h: 18.5, bgTop: "#FF9E6B", bgMid: "#E77B7E", bgBottom: "#6B4B7E", text: "#442840", muted: "#95728E",
    card: "rgba(255,255,255,0.55)", shadow: "rgba(74,40,60,0.2)", accentA: "#F0806E", accentB: "#8C5E92",
    pinkA: "#F0806E", pinkB: "#8C5E92", topbar: "rgba(255,200,180,0.75)", topbarPink: "rgba(255,200,210,0.75)",
    message: "rgba(255,220,225,0.6)", star: 0.35 },
  { h: 20,   bgTop: "#14112A", bgMid: "#1E1A3D", bgBottom: "#241F42", text: "#C9BEDD", muted: "#8D82A8",
    card: "rgba(42,36,70,0.55)", shadow: "rgba(8,6,18,0.5)", accentA: "#9B8AD9", accentB: "#6C63A6",
    pinkA: "#9B8AD9", pinkB: "#6C63A6", topbar: "rgba(28,24,52,0.8)", topbarPink: "rgba(28,24,52,0.8)",
    message: "rgba(58,48,84,0.55)", star: 0.85 },
  { h: 24,   bgTop: "#14112A", bgMid: "#1E1A3D", bgBottom: "#241F42", text: "#C9BEDD", muted: "#8D82A8",
    card: "rgba(42,36,70,0.55)", shadow: "rgba(8,6,18,0.5)", accentA: "#9B8AD9", accentB: "#6C63A6",
    pinkA: "#9B8AD9", pinkB: "#6C63A6", topbar: "rgba(28,24,52,0.8)", topbarPink: "rgba(28,24,52,0.8)",
    message: "rgba(58,48,84,0.55)", star: 1 }
];

function parseColor(c) {
  c = c.trim();
  if (c[0] === "#") {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map(ch => ch + ch).join("");
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map(s => parseFloat(s));
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  return [0, 0, 0, 1];
}

function lerpColor(c1, c2, t) {
  const a = parseColor(c1), b = parseColor(c2);
  const r = a.map((v, i) => v + (b[i] - v) * t);
  return `rgba(${Math.round(r[0])}, ${Math.round(r[1])}, ${Math.round(r[2])}, ${r[3].toFixed(3)})`;
}

function getPhaseColors(d = new Date()) {
  const hour = d.getHours() + d.getMinutes() / 60;
  let prev = PHASE_STOPS[0], next = PHASE_STOPS[PHASE_STOPS.length - 1];
  for (let i = 0; i < PHASE_STOPS.length - 1; i++) {
    if (hour >= PHASE_STOPS[i].h && hour <= PHASE_STOPS[i + 1].h) {
      prev = PHASE_STOPS[i]; next = PHASE_STOPS[i + 1]; break;
    }
  }
  const span = next.h - prev.h;
  const t = span === 0 ? 0 : (hour - prev.h) / span;
  const keys = ["bgTop", "bgMid", "bgBottom", "text", "muted", "card", "shadow", "accentA", "accentB", "pinkA", "pinkB", "topbar", "topbarPink", "message"];
  const out = {};
  keys.forEach(k => out[k] = lerpColor(prev[k], next[k], t));
  out.star = prev.star + (next.star - prev.star) * t;
  out.isNight = hour >= 20 || hour < 5;
  return out;
}

function applyPhaseColors() {
  const p = getPhaseColors();
  const root = document.documentElement.style;
  root.setProperty("--bg-top", p.bgTop);
  root.setProperty("--bg-mid", p.bgMid);
  root.setProperty("--bg-bottom", p.bgBottom);
  root.setProperty("--plum", p.text);
  root.setProperty("--plum-soft", p.muted);
  root.setProperty("--card-bg", p.card);
  root.setProperty("--shadow", `0 8px 24px ${p.shadow}`);
  root.setProperty("--accent-start", p.accentA);
  root.setProperty("--accent-end", p.accentB);
  root.setProperty("--pink-start", p.pinkA);
  root.setProperty("--pink-end", p.pinkB);
  root.setProperty("--topbar-bg", p.topbar);
  root.setProperty("--topbar-bg-pink", p.topbarPink);
  root.setProperty("--message-bg", p.message);
  root.setProperty("--star-opacity", p.star.toFixed(2));
  document.body.classList.toggle("is-night", p.isNight);
}

function isNightNow() {
  const hour = new Date().getHours();
  return hour >= 20 || hour < 5;
}

// ---------- Haptics ----------
function haptic(pattern = 15) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
}

// ---------- State ----------
const state = {
  profile: null,          // "babylon" | "stink"
  schedule: DEFAULT_SCHEDULE,
  dayKey: todayKey(),
  dayStarted: false,
  badDayMode: false,
  taskStatuses: {},        // { [taskId]: { state, completedSubtasks: [], completedAt } }
  snoozes: {},              // { [taskId]: timestampMs }
  streak: 0,
  streakCountedToday: false,
  moodEntries: [],
  encouragementMessages: [],
  suggestions: [],
  sleepEntries: [],
  unreadMessages: 0,
  cloudStatus: "unknown"   // unknown | checking | available | unavailable
};

let db = null;
let currentView = "Today";
let currentCarerView = "Dashboard";
let activeSheetTask = null;
let editingTaskId = null;
let firstDaySnapshot = true;
let firstMsgSnapshot = true;
let prevTaskStatuses = {};

const VIEW_ORDER = ["Today", "Schedule", "Sleep", "Carer", "Settings"];
const CARER_VIEW_ORDER = ["Dashboard", "Schedule", "Settings"];

// ---------- Helpers ----------
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function activeTasks() {
  if (state.badDayMode) return BAD_DAY_ESSENTIALS.map(t => ({ ...t, time: "", subtasks: [] }));
  const today = todayKey();
  return state.schedule.filter(t => t.recurring !== false || t.dateKey === today);
}

function completedCount() {
  return activeTasks().filter(t => {
    const s = state.taskStatuses[t.id]?.state;
    return s === "completed" || s === "completedLate";
  }).length;
}

function missedCount() {
  return activeTasks().filter(t => state.taskStatuses[t.id]?.state === "missed").length;
}

function completionPct() {
  // Weighted so the bar visibly moves as individual steps of a
  // multi-step task are checked off, not just on full completion.
  const tasks = activeTasks();
  if (!tasks.length) return 0;
  let sum = 0;
  tasks.forEach(t => {
    const s = state.taskStatuses[t.id];
    const st = s?.state || "pending";
    if (st === "completed" || st === "completedLate") {
      sum += 1;
    } else if (t.subtasks && t.subtasks.length) {
      sum += (s?.completedSubtasks || []).length / t.subtasks.length;
    }
  });
  return sum / tasks.length;
}

function scheduledDateFor(task) {
  if (!task.time) return null;
  const [h, m] = task.time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ---------- Local cache (instant load + offline) ----------
function saveLocalCache() {
  localStorage.setItem("tismtracker_state", JSON.stringify({
    profile: state.profile,
    schedule: state.schedule,
    dayKey: state.dayKey,
    dayStarted: state.dayStarted,
    badDayMode: state.badDayMode,
    taskStatuses: state.taskStatuses,
    snoozes: state.snoozes,
    streak: state.streak,
    streakCountedToday: state.streakCountedToday,
    moodEntries: state.moodEntries,
    encouragementMessages: state.encouragementMessages,
    suggestions: state.suggestions,
    sleepEntries: state.sleepEntries,
    unreadMessages: state.unreadMessages
  }));
}

function loadLocalCache() {
  const raw = localStorage.getItem("tismtracker_state");
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
    if (!state.snoozes) state.snoozes = {};
    if (!state.suggestions) state.suggestions = [];
  } catch (e) { /* ignore corrupt cache */ }
}

function checkForNewDay() {
  const key = todayKey();
  if (key !== state.dayKey) {
    // Roll over: anything still pending becomes missed.
    for (const t of state.schedule) {
      const s = state.taskStatuses[t.id];
      if (s && s.state === "pending") s.state = "missed";
    }
    state.dayKey = key;
    state.dayStarted = false;
    state.taskStatuses = {};
    state.snoozes = {};
    state.badDayMode = false;
    state.streakCountedToday = false;
    notifiedToday.clear();
    prevTaskStatuses = {};

    // Purge stale one-off ("today only") tasks from previous days so
    // the shared schedule doesn't accumulate old dentist appointments etc.
    const cleaned = state.schedule.filter(t => t.recurring !== false || t.dateKey === key);
    if (cleaned.length !== state.schedule.length) {
      state.schedule = cleaned;
      pushSchedule(cleaned);
    }

    saveLocalCache();
    pushDayState();
  }
}

// ---------- Firebase ----------
function getSavedFirebaseConfig() {
  const raw = localStorage.getItem("tismtracker_firebase_config");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

let firebaseAuth = null;

async function initFirebase() {
  const config = getSavedFirebaseConfig();
  if (!config) {
    showScreen("setupScreen");
    hideLoadingScreen();
    return;
  }
  setSyncStatus("checking");
  try {
    const app = initializeApp(config);
    db = getFirestore(app);
    firebaseAuth = getAuth(app);
    await setPersistence(firebaseAuth, browserLocalPersistence);
    onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        setSyncStatus("available");
        attachListeners();
        proceedPastLogin();
      } else {
        setSyncStatus("unavailable");
        showScreen("loginScreen");
      }
      hideLoadingScreen();
    });
  } catch (e) {
    console.error("Firebase init failed", e);
    setSyncStatus("unavailable");
    showScreen("loginScreen");
    hideLoadingScreen();
  }
}

function proceedPastLogin() {
  if (!state.profile) {
    showScreen("profileScreen");
  } else if (state.profile === "babylon") {
    showScreen("mainScreen");
    renderToday();
    updateCarerBadge();
    maybeShowMoodPrompt();
  } else {
    showScreen("carerScreen");
    renderCarerDashboard();
    renderCarerHistory();
  }
}

async function handleLoginSubmit() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");
  if (!email || !password) return;
  try {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    // onAuthStateChanged handles moving past this screen.
  } catch (e) {
    errEl.textContent = "Couldn't sign in — check the email and password and try again.";
    errEl.classList.remove("hidden");
  }
}

function setSyncStatus(status) {
  state.cloudStatus = status;
  document.querySelectorAll(".sync-dot").forEach(el => {
    el.className = "sync-dot " + status;
  });
  const settingsEl = document.getElementById("settingsSyncStatus");
  if (settingsEl) {
    settingsEl.textContent = status === "available" ? "Connected"
      : status === "checking" ? "Checking…" : "Not connected";
  }
}

function attachListeners() {
  // Schedule (single doc)
  onSnapshot(doc(db, "config", "schedule"), (snap) => {
    if (snap.exists() && snap.data().tasks) {
      state.schedule = snap.data().tasks;
      saveLocalCache();
      if (currentView === "Today") renderToday();
      if (currentView === "Schedule") renderScheduleBuilder("scheduleList");
      if (currentCarerView === "Schedule") renderScheduleBuilder("carerScheduleList");
    }
  });

  // Today's day state
  onSnapshot(doc(db, "days", state.dayKey), (snap) => {
    if (snap.exists()) {
      const d = snap.data();
      const newStatuses = d.taskStatuses || {};

      if (state.profile === "stink" && !firstDaySnapshot) {
        const taskList = (d.badDayMode ? BAD_DAY_ESSENTIALS : (d.schedule || state.schedule));
        taskList.forEach(t => {
          const wasDone = ["completed", "completedLate"].includes(prevTaskStatuses[t.id]?.state);
          const isDone = ["completed", "completedLate"].includes(newStatuses[t.id]?.state);
          if (isDone && !wasDone) {
            notifyLocal(`✅ ${t.title} done!`, "Babylon just completed a task.");
            showToast(`${t.icon} ${t.title} completed!`);
          }
        });
      }
      firstDaySnapshot = false;
      prevTaskStatuses = newStatuses;

      state.dayStarted = !!d.dayStarted;
      state.badDayMode = !!d.badDayMode;
      state.taskStatuses = newStatuses;
      state.snoozes = d.snoozes || {};
      state.streak = d.streak || 0;
      state.streakCountedToday = !!d.streakCountedToday;
      saveLocalCache();
      if (currentView === "Today") renderToday();
      if (state.profile === "stink") renderCarerDashboard();
    }
  });

  // Moods
  onSnapshot(query(collection(db, "moods"), orderBy("date", "asc")), (snap) => {
    state.moodEntries = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate?.() ?? new Date() }));
    saveLocalCache();
    if (state.profile === "stink") renderCarerHistory();
  });

  // Messages
  onSnapshot(query(collection(db, "messages"), orderBy("date", "asc")), (snap) => {
    state.encouragementMessages = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate?.() ?? new Date() }));

    if (state.profile === "babylon" && !firstMsgSnapshot) {
      snap.docChanges().forEach(change => {
        if (change.type === "added") {
          const m = change.doc.data();
          notifyLocal("❤️ Message from Stink", m.text);
          showToast(`❤️ ${m.text}`, "pink");
          if (currentView !== "Carer") state.unreadMessages = (state.unreadMessages || 0) + 1;
        }
      });
    }
    firstMsgSnapshot = false;

    saveLocalCache();
    updateCarerBadge();
    if (currentView === "Today") renderToday();
    if (currentView === "Carer") { renderCarerMessages(); state.unreadMessages = 0; updateCarerBadge(); saveLocalCache(); }
  });

  // Suggestions (Stink's proposed tweaks)
  onSnapshot(query(collection(db, "suggestions"), orderBy("createdAt", "asc")), (snap) => {
    state.suggestions = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() ?? new Date() }));
    saveLocalCache();
    if (currentView === "Today") renderToday();
  });

  // Sleep entries
  onSnapshot(query(collection(db, "sleep"), orderBy("date", "desc")), (snap) => {
    state.sleepEntries = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate?.() ?? new Date() }));
    saveLocalCache();
    if (currentView === "Sleep") renderSleep();
  });
}

async function pushSchedule(tasks) {
  if (!db) return;
  await setDoc(doc(db, "config", "schedule"), { tasks });
}

async function pushDayState() {
  if (!db) return;
  await setDoc(doc(db, "days", state.dayKey), {
    dayStarted: state.dayStarted,
    badDayMode: state.badDayMode,
    taskStatuses: state.taskStatuses,
    snoozes: state.snoozes,
    streak: state.streak,
    streakCountedToday: state.streakCountedToday,
    schedule: state.badDayMode ? BAD_DAY_ESSENTIALS : state.schedule
  });
}

async function pushMood(entry) {
  if (!db) return;
  await addDoc(collection(db, "moods"), {
    mood: entry.mood, timeOfDay: entry.timeOfDay, date: Timestamp.fromDate(entry.date)
  });
}

async function pushMessage(text) {
  if (!db) return;
  await addDoc(collection(db, "messages"), { text, date: Timestamp.fromDate(new Date()) });
}

async function pushSuggestion(text) {
  if (!db) return;
  await addDoc(collection(db, "suggestions"), { text, status: "pending", createdAt: Timestamp.fromDate(new Date()) });
}

async function updateSuggestionStatus(id, status) {
  if (!db) return;
  await updateDoc(doc(db, "suggestions", id), { status });
}

async function pushSleep(entry) {
  if (!db) return;
  await addDoc(collection(db, "sleep"), {
    bedtime: entry.bedtime, wake: entry.wake, durationMinutes: entry.durationMinutes,
    date: Timestamp.fromDate(new Date())
  });
}

// ---------- Screen switching ----------
function showScreen(id) {
  ["setupScreen", "loginScreen", "profileScreen", "mainScreen", "carerScreen"].forEach(s => {
    document.getElementById(s).classList.toggle("hidden", s !== id);
  });
}

function hideLoadingScreen() {
  const el = document.getElementById("loadingScreen");
  if (!el || el.classList.contains("loading-hide")) return;
  el.classList.add("loading-hide");
  setTimeout(() => el.remove(), 550);
}

function pickProfile(profile) {
  state.profile = profile;
  saveLocalCache();
  if (profile === "babylon") {
    showScreen("mainScreen");
    renderToday();
    updateCarerBadge();
    maybeShowMoodPrompt();
  } else {
    showScreen("carerScreen");
    renderCarerDashboard();
    renderCarerHistory();
  }
}

// ---------- Smooth slide transitions between tabs ----------
function animateViewSwap(oldEl, newEl, dir) {
  if (!oldEl || oldEl === newEl) {
    if (newEl) newEl.classList.remove("hidden");
    return;
  }
  newEl.style.transition = "none";
  newEl.style.transform = `translateX(${dir * 24}px)`;
  newEl.style.opacity = "0";
  newEl.classList.remove("hidden");
  oldEl.style.transition = "transform 0.22s ease, opacity 0.22s ease";
  oldEl.style.transform = `translateX(${-dir * 24}px)`;
  oldEl.style.opacity = "0";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      newEl.style.transition = "transform 0.22s ease, opacity 0.22s ease";
      newEl.style.transform = "translateX(0)";
      newEl.style.opacity = "1";
    });
  });
  setTimeout(() => {
    oldEl.classList.add("hidden");
    oldEl.style.transition = "";
    oldEl.style.transform = "";
    oldEl.style.opacity = "";
    newEl.style.transition = "";
    newEl.style.transform = "";
    newEl.style.opacity = "";
  }, 260);
}

function switchView(view) {
  if (view === currentView) return;
  const oldIdx = VIEW_ORDER.indexOf(currentView);
  const newIdx = VIEW_ORDER.indexOf(view);
  const dir = newIdx > oldIdx ? 1 : -1;
  const oldEl = document.getElementById("view" + currentView);
  currentView = view;

  document.querySelectorAll("#mainScreen .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.getElementById("topbarTitle").textContent = view === "Today" ? "Home" : view;

  if (view === "Today") renderToday();
  if (view === "Schedule") renderScheduleBuilder("scheduleList");
  if (view === "Sleep") renderSleep();
  if (view === "Carer") { renderCarerMessages(); state.unreadMessages = 0; updateCarerBadge(); saveLocalCache(); }
  if (view === "Settings") renderSettings();

  const newEl = document.getElementById("view" + view);
  animateViewSwap(oldEl, newEl, dir);
}

function switchCarerView(view) {
  if (view === currentCarerView) return;
  const oldIdx = CARER_VIEW_ORDER.indexOf(currentCarerView);
  const newIdx = CARER_VIEW_ORDER.indexOf(view);
  const dir = newIdx > oldIdx ? 1 : -1;
  const oldEl = document.getElementById("viewCarer" + currentCarerView);
  currentCarerView = view;

  document.querySelectorAll("#carerScreen .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.cview === view));
  if (view === "Schedule") renderScheduleBuilder("carerScheduleList");

  const newEl = document.getElementById("viewCarer" + view);
  animateViewSwap(oldEl, newEl, dir);
}

// ---------- Rendering: Today / Home ----------
function renderToday() {
  const el = document.getElementById("viewToday");
  const night = isNightNow();

  if (!state.dayStarted) {
    el.innerHTML = `
      <div class="card hero-card">
        <div class="hero-emoji">${night ? "🌙" : "☀️"}</div>
        <div class="hero-title">${night ? "Still up, Babylon?" : "Good morning, Babylon"}</div>
        <div class="hero-sub">${night ? "Take it easy — rest is part of the routine too." : "Ready for today?"}</div>
        <button class="btn btn-primary" id="startDayBtn">START DAY</button>
      </div>
      <button class="badday-entry" id="badDayEntryBtn">🚨 I'm overwhelmed</button>
      ${recentMessagePreviewHtml()}
      ${suggestionCardsHtml()}
    `;
    document.getElementById("startDayBtn").onclick = startDay;
    document.getElementById("badDayEntryBtn").onclick = () => showSheet("badDaySheet");
    wireSuggestionCards();
    return;
  }

  const tasks = activeTasks();
  const pct = Math.round(completionPct() * 100);

  let html = `
    <div class="card">
      <div class="progress-label-row">
        <div class="progress-pct">${pct}%</div>
        <div class="progress-count">${completedCount()}/${tasks.length} done</div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
  `;

  html += recentMessagePreviewHtml();
  html += suggestionCardsHtml();

  if (state.badDayMode) {
    html += `
      <div class="badday-banner">
        <div class="title">Low energy mode activated ❤️</div>
        <div class="muted">Just the essentials today — that's enough.</div>
        <button class="btn btn-secondary" id="exitBadDayBtn">🔄 Turn off low energy mode</button>
      </div>
    `;
  }

  html += `<div class="list">` + tasks.map(taskRowHtml).join("") + `</div>`;
  html += `<button class="btn btn-indigo" id="endDayBtn" style="margin-top:16px;">🌙 End Day</button>`;

  el.innerHTML = html;

  if (state.badDayMode) {
    document.getElementById("exitBadDayBtn").onclick = () => {
      state.badDayMode = false;
      saveLocalCache(); pushDayState(); renderToday();
    };
  }
  document.getElementById("endDayBtn").onclick = openEndDay;
  tasks.forEach(t => {
    const rowEl = document.getElementById("task-" + t.id);
    if (rowEl) rowEl.onclick = () => openTaskSheet(t);
    const undoEl = document.getElementById("undo-" + t.id);
    if (undoEl) undoEl.onclick = (e) => {
      e.stopPropagation();
      undoTaskInternal(t);
      saveLocalCache(); pushDayState();
      renderToday();
      showToast(`↩️ ${t.title} undone`);
    };
  });
  wireSuggestionCards();
}

function recentMessagePreviewHtml() {
  if (!state.encouragementMessages.length) return "";
  const m = state.encouragementMessages[state.encouragementMessages.length - 1];
  return `
    <div class="message-card home-message-preview">
      <div class="message-from">❤️ From Stink</div>
      <div>${escapeHtml(m.text)}</div>
    </div>
  `;
}

function suggestionCardsHtml() {
  const pending = state.suggestions.filter(s => s.status === "pending");
  if (!pending.length) return "";
  return `<div class="list" style="margin-bottom:16px;">` + pending.map(s => `
    <div class="suggestion-card" data-sid="${s.id}">
      <div class="suggestion-text">💡 Stink suggests: ${escapeHtml(s.text)}</div>
      <div class="suggestion-actions">
        <button class="btn-mini btn-mini-accept" data-act="accept" data-sid="${s.id}">Add it</button>
        <button class="btn-mini btn-mini-dismiss" data-act="dismiss" data-sid="${s.id}">Not now</button>
      </div>
    </div>
  `).join("") + `</div>`;
}

function wireSuggestionCards() {
  document.querySelectorAll(".suggestion-card [data-act]").forEach(btn => {
    btn.onclick = () => {
      const sid = btn.dataset.sid;
      const suggestion = state.suggestions.find(s => s.id === sid);
      if (!suggestion) return;
      if (btn.dataset.act === "accept") {
        const title = suggestion.text.replace(/\?\s*$/, "").replace(/^Add\s+/i, "");
        const newTask = {
          id: "sug-" + sid,
          time: "",
          title: title.charAt(0).toUpperCase() + title.slice(1),
          icon: "💡",
          subtasks: [],
          recurring: false,
          dateKey: todayKey()
        };
        state.schedule.push(newTask);
        saveLocalCache();
        pushSchedule(state.schedule);
        showToast("✅ Added to today's schedule");
      } else {
        showToast("Okay, maybe another time");
      }
      suggestion.status = btn.dataset.act === "accept" ? "accepted" : "dismissed";
      updateSuggestionStatus(sid, suggestion.status);
      saveLocalCache();
      renderToday();
    };
  });
}

function taskRowHtml(task) {
  const status = state.taskStatuses[task.id]?.state || "pending";
  const snoozedUntil = state.snoozes?.[task.id];
  const isSnoozed = snoozedUntil && Date.now() < snoozedUntil && status === "pending";
  const classes = ["task-row"];
  if (status === "missed") classes.push("missed");
  if (isSnoozed) classes.push("snoozed");
  if (status === "completed" || status === "completedLate") classes.push("completed");
  const icon = status === "completed" || status === "completedLate" ? "✅"
    : status === "missed" ? "❗️"
    : status === "skipped" ? "↪️"
    : isSnoozed ? "⏰" : "›";
  const canUndo = status !== "pending";
  return `
    <div class="${classes.join(" ")}" role="group">
      <button class="task-row-main" id="task-${task.id}">
        ${task.time ? `<span class="task-time">${task.time}</span>` : ""}
        <span class="task-icon">${task.icon}</span>
        <span class="task-title">${task.title}${status === "missed" ? `<span class="task-missed-label">Missed</span>` : ""}${isSnoozed ? `<span class="task-snoozed-label">Snoozed until ${new Date(snoozedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>` : ""}</span>
        <span class="task-status-icon">${icon}</span>
      </button>
      ${canUndo ? `<button class="task-undo-btn" id="undo-${task.id}" title="Undo">↩️</button>` : ""}
    </div>
  `;
}

function startDay() {
  state.dayStarted = true;
  state.badDayMode = false;
  const wake = state.schedule.find(t => t.title.toLowerCase().includes("wake"));
  if (wake) completeTaskInternal(wake);
  saveLocalCache();
  pushDayState();
  renderToday();
  showCelebration();
}

const CELEBRATION_LINES = [
  "Great job Babylon!", "You did it! ✨", "Nice one!", "Look at you go!",
  "Proud of you!", "One step closer 💪", "Yes! Keep going!"
];
function showCelebration() {
  const el = document.getElementById("celebration");
  const textEl = el.querySelector(".celebration-text");
  if (textEl) textEl.textContent = CELEBRATION_LINES[Math.floor(Math.random() * CELEBRATION_LINES.length)];
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 1300);
}

// ---------- Task detail sheet ----------
function openTaskSheet(task) {
  activeSheetTask = task;
  document.getElementById("sheetEmoji").textContent = task.icon;
  document.getElementById("sheetTitle").textContent = task.title;
  const status = state.taskStatuses[task.id] || { state: "pending", completedSubtasks: [] };
  const subtasksEl = document.getElementById("sheetSubtasks");
  const doneBtn = document.getElementById("sheetMarkDoneBtn");
  const undoBtn = document.getElementById("sheetUndoBtn");
  const snoozeBtn = document.getElementById("sheetSnoozeBtn");

  undoBtn.classList.toggle("hidden", status.state === "pending");
  undoBtn.onclick = () => {
    undoTaskInternal(task);
    saveLocalCache(); pushDayState();
    closeSheet("taskSheet");
    renderToday();
    showToast(`↩️ ${task.title} undone`);
  };

  snoozeBtn.classList.toggle("hidden", status.state !== "pending");
  snoozeBtn.onclick = () => snoozeTask(task);

  if (!task.subtasks || task.subtasks.length === 0) {
    subtasksEl.innerHTML = "";
    doneBtn.classList.remove("hidden");
    doneBtn.onclick = () => {
      completeTaskInternal(task);
      saveLocalCache(); pushDayState();
      closeSheet("taskSheet");
      renderToday();
      haptic();
      showCelebration();
    };
  } else {
    doneBtn.classList.add("hidden");
    subtasksEl.innerHTML = task.subtasks.map(st => {
      const checked = (status.completedSubtasks || []).includes(st);
      return `<button class="subtask-row ${checked ? "checked" : ""}" data-subtask="${encodeURIComponent(st)}">
        <span class="subtask-check">${checked ? "☑️" : "⬜️"}</span><span>${st}</span>
      </button>`;
    }).join("");
    subtasksEl.querySelectorAll(".subtask-row").forEach(btn => {
      btn.onclick = () => {
        const st = decodeURIComponent(btn.dataset.subtask);
        toggleSubtaskInternal(task, st);
        saveLocalCache(); pushDayState();
        const nowDone = state.taskStatuses[task.id]?.state === "completed";
        haptic(10);
        openTaskSheet(task); // re-render sheet
        if (nowDone) {
          haptic();
          setTimeout(() => { closeSheet("taskSheet"); renderToday(); showCelebration(); }, 200);
        }
      };
    });
  }
  showSheet("taskSheet");
}

function snoozeTask(task) {
  state.snoozes = state.snoozes || {};
  state.snoozes[task.id] = Date.now() + 15 * 60 * 1000;
  saveLocalCache(); pushDayState();
  closeSheet("taskSheet");
  renderToday();
  showToast(`⏰ We'll remind you about ${task.title} in 15 min`);
}

function completeTaskInternal(task) {
  const scheduled = scheduledDateFor(task);
  const late = scheduled ? (new Date() - scheduled) > 10 * 60 * 1000 : false;
  state.taskStatuses[task.id] = {
    state: late ? "completedLate" : "completed",
    completedSubtasks: task.subtasks || [],
    completedAt: new Date().toISOString()
  };
  if (state.snoozes) delete state.snoozes[task.id];
  recalcStreak();
}

function toggleSubtaskInternal(task, subtask) {
  const status = state.taskStatuses[task.id] || { state: "pending", completedSubtasks: [] };
  const set = new Set(status.completedSubtasks || []);
  if (set.has(subtask)) set.delete(subtask); else set.add(subtask);
  status.completedSubtasks = Array.from(set);
  if (task.subtasks.length && status.completedSubtasks.length === task.subtasks.length) {
    status.state = "completed";
    status.completedAt = new Date().toISOString();
    if (state.snoozes) delete state.snoozes[task.id];
  } else if (status.state === "completed") {
    status.state = "pending";
  }
  state.taskStatuses[task.id] = status;
  recalcStreak();
}

function undoTaskInternal(task) {
  state.taskStatuses[task.id] = { state: "pending", completedSubtasks: [] };
  recalcStreak();
}

function recalcStreak() {
  const tasks = activeTasks();
  const allDone = tasks.length > 0 && completedCount() === tasks.length;
  if (allDone && !state.streakCountedToday) {
    state.streak += 1;
    state.streakCountedToday = true;
  } else if (!allDone && state.streakCountedToday) {
    state.streak = Math.max(0, state.streak - 1);
    state.streakCountedToday = false;
  }
}

// ---------- End day ----------
function openEndDay() {
  const tasks = activeTasks().filter(t => {
    const s = state.taskStatuses[t.id]?.state || "pending";
    return s === "pending" || s === "missed";
  });
  const listEl = document.getElementById("endDayList");
  document.getElementById("endDayReview").classList.remove("hidden");
  document.getElementById("endDaySendoff").classList.add("hidden");

  if (tasks.length === 0) {
    listEl.innerHTML = `<p class="muted">Everything's done today ✨</p>`;
  } else {
    listEl.innerHTML = tasks.map(t => `
      <div class="task-row-static">
        <span class="task-icon">${t.icon}</span>
        <span class="task-title">${t.title}</span>
        <select class="field-input" style="width:auto;" data-task="${t.id}">
          <option value="skipped">Skipped</option>
          <option value="completedLate">Completed later</option>
        </select>
      </div>
    `).join("");
  }
  showSheet("endDaySheet");

  document.getElementById("confirmEndDayBtn").onclick = () => {
    listEl.querySelectorAll("select").forEach(sel => {
      const taskId = sel.dataset.task;
      const status = state.taskStatuses[taskId] || { state: "pending", completedSubtasks: [] };
      status.state = sel.value;
      state.taskStatuses[taskId] = status;
    });
    state.dayStarted = false;
    saveLocalCache();
    pushDayState();
    document.getElementById("endDayReview").classList.add("hidden");
    document.getElementById("endDaySendoff").classList.remove("hidden");
    setTimeout(() => { closeSheet("endDaySheet"); renderToday(); }, 2200);
  };
}

// ---------- Bad day ----------
function confirmBadDay() {
  state.badDayMode = true;
  state.dayStarted = true;
  saveLocalCache(); pushDayState();
  closeSheet("badDaySheet");
  renderToday();
}

// ---------- Mood ----------
function hasMoodToday(timeOfDay) {
  const today = todayKey();
  return state.moodEntries.some(m => m.timeOfDay === timeOfDay && todayKey(new Date(m.date)) === today);
}

function maybeShowMoodPrompt() {
  const hour = new Date().getHours();
  const timeOfDay = hour < 14 ? "morning" : "evening";
  if (hasMoodToday(timeOfDay)) return;
  document.getElementById("moodPromptTitle").textContent =
    timeOfDay === "morning" ? "How are you feeling this morning?" : "How was your day?";
  const opts = document.getElementById("moodOptions");
  opts.innerHTML = MOODS.map(m => `
    <button class="mood-opt" data-mood="${m.id}">
      <span class="emoji">${m.emoji}</span><span class="label">${m.label}</span>
    </button>
  `).join("");
  opts.querySelectorAll(".mood-opt").forEach(btn => {
    btn.onclick = () => {
      const entry = { mood: btn.dataset.mood, timeOfDay, date: new Date() };
      state.moodEntries.push(entry);
      saveLocalCache();
      pushMood(entry);
      closeSheet("moodSheet");
    };
  });
  showSheet("moodSheet");
}

// ---------- Schedule view (visual builder — shared by Babylon & Stink) ----------
function renderScheduleBuilder(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const sorted = state.schedule.slice().sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  el.innerHTML = sorted.map(t => `
    <div class="task-row-static schedule-edit-row">
      ${t.time ? `<span class="task-time">${t.time}</span>` : `<span class="task-time">—</span>`}
      <span class="task-icon">${t.icon || "📌"}</span>
      <span class="task-title">${escapeHtml(t.title)}${t.recurring === false ? `<br><small class="muted">Today only</small>` : ""}${t.subtasks && t.subtasks.length ? `<br><small class="muted">${t.subtasks.length} steps</small>` : ""}</span>
      <button class="icon-btn" data-edit="${t.id}">✏️</button>
    </div>
  `).join("") + `<button class="btn btn-secondary" id="addTaskBtn-${containerId}" style="margin-top:10px;">+ Add task</button>`;

  el.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => openTaskEditor(state.schedule.find(t => t.id === btn.dataset.edit));
  });
  const addBtn = document.getElementById(`addTaskBtn-${containerId}`);
  if (addBtn) addBtn.onclick = () => openTaskEditor(null);
}

function openTaskEditor(task) {
  editingTaskId = task ? task.id : null;
  document.getElementById("taskEditHeading").textContent = task ? "Edit task" : "New task";
  document.getElementById("teIcon").value = task?.icon || "";
  document.getElementById("teTitle").value = task?.title || "";
  document.getElementById("teTime").value = task?.time || "";
  document.querySelectorAll("#teRepeat .seg-btn").forEach(b => {
    const isOneOff = b.dataset.val === "oneoff";
    b.classList.toggle("active", isOneOff === (task?.recurring === false));
  });
  renderSubtaskEditor(task?.subtasks ? task.subtasks.slice() : []);
  document.getElementById("teDeleteBtn").classList.toggle("hidden", !task);
  showSheet("taskEditSheet");
}

function renderSubtaskEditor(subtasks) {
  const el = document.getElementById("teSubtasks");
  el.innerHTML = subtasks.map((s, i) => `
    <div class="te-subtask-row">
      <input class="field-input te-subtask-input" value="${escapeHtml(s)}" data-idx="${i}">
      <button class="icon-btn" data-remove="${i}">✕</button>
    </div>
  `).join("");
  el.querySelectorAll("[data-remove]").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.remove);
      const current = collectSubtasksFromEditor();
      current.splice(idx, 1);
      renderSubtaskEditor(current);
    };
  });
}

function collectSubtasksFromEditor() {
  return Array.from(document.querySelectorAll("#teSubtasks .te-subtask-input")).map(i => i.value.trim()).filter(Boolean);
}

function saveTaskFromEditor() {
  const icon = document.getElementById("teIcon").value.trim() || "📌";
  const title = document.getElementById("teTitle").value.trim();
  const time = document.getElementById("teTime").value;
  const oneOff = document.querySelector("#teRepeat .seg-btn[data-val='oneoff']").classList.contains("active");
  const subtasks = collectSubtasksFromEditor();
  if (!title) { showToast("Give the task a title first"); return; }
  const id = editingTaskId || ("task-" + Date.now());
  const newTask = { id, time, title, icon, subtasks, recurring: !oneOff, dateKey: oneOff ? todayKey() : null };
  const idx = state.schedule.findIndex(t => t.id === id);
  const isNew = idx < 0;
  if (!isNew) state.schedule[idx] = newTask; else state.schedule.push(newTask);
  saveLocalCache();
  pushSchedule(state.schedule);
  closeSheet("taskEditSheet");
  refreshAllScheduleViews();
  showToast(isNew ? "✅ Task added" : "✅ Task updated");
}

function deleteTaskFromEditor() {
  if (!editingTaskId) return;
  state.schedule = state.schedule.filter(t => t.id !== editingTaskId);
  saveLocalCache();
  pushSchedule(state.schedule);
  closeSheet("taskEditSheet");
  refreshAllScheduleViews();
  showToast("🗑️ Task deleted");
}

function refreshAllScheduleViews() {
  if (currentView === "Schedule") renderScheduleBuilder("scheduleList");
  if (currentView === "Today") renderToday();
  if (currentCarerView === "Schedule") renderScheduleBuilder("carerScheduleList");
}

// ---------- Sleep view (manual entry, no HealthKit on web) ----------
function renderSleep() {
  const historyEl = document.getElementById("sleepHistory");
  if (!state.sleepEntries.length) {
    historyEl.innerHTML = `<p class="muted">No sleep logged yet.</p>`;
    return;
  }
  historyEl.innerHTML = state.sleepEntries.slice(0, 14).map(e => `
    <div class="task-row-static">
      <span class="task-icon">😴</span>
      <span class="task-title">${Math.floor(e.durationMinutes / 60)}h ${e.durationMinutes % 60}m
        <br><small class="muted">Bed ${e.bedtime} · Wake ${e.wake}</small></span>
    </div>
  `).join("");
}

function saveSleepEntry() {
  const bedtime = document.getElementById("bedtimeInput").value;
  const wake = document.getElementById("waketimeInput").value;
  if (!bedtime || !wake) return;
  const [bh, bm] = bedtime.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let bedMinutes = bh * 60 + bm;
  let wakeMinutes = wh * 60 + wm;
  let duration = wakeMinutes - bedMinutes;
  if (duration <= 0) duration += 24 * 60; // crossed midnight
  const entry = { bedtime, wake, durationMinutes: duration, date: new Date() };
  state.sleepEntries.unshift(entry);
  saveLocalCache();
  pushSleep(entry);
  renderSleep();
}

// ---------- Carer messages (Babylon's view of messages received) ----------
function renderCarerMessages() {
  const el = document.getElementById("messagesFeed");
  if (!state.encouragementMessages.length) {
    el.innerHTML = `<p class="muted" style="text-align:center;">❤️<br>No messages yet</p>`;
    return;
  }
  el.innerHTML = state.encouragementMessages.slice().reverse().map(m => `
    <div class="message-card">
      <div class="message-from">❤️ Message from Stink</div>
      <div>${escapeHtml(m.text)}</div>
    </div>
  `).join("");
}

// ---------- Settings ----------
function renderSettings() {
  document.getElementById("scheduleJsonEditor").value = JSON.stringify(state.schedule, null, 2);
  document.getElementById("scheduleJsonError").classList.add("hidden");
  setSyncStatus(state.cloudStatus);
}

function saveScheduleFromEditor() {
  const text = document.getElementById("scheduleJsonEditor").value;
  const errEl = document.getElementById("scheduleJsonError");
  try {
    const tasks = JSON.parse(text);
    if (!Array.isArray(tasks)) throw new Error("Schedule must be a JSON array");
    state.schedule = tasks;
    saveLocalCache();
    pushSchedule(tasks);
    errEl.classList.add("hidden");
    refreshAllScheduleViews();
  } catch (e) {
    errEl.textContent = "That JSON isn't quite right: " + e.message;
    errEl.classList.remove("hidden");
  }
}

// ---------- Carer (Stink) dashboard ----------
function renderCarerDashboard() {
  const statusEl = document.getElementById("carerStatusCard");
  const tasksEl = document.getElementById("carerTasksCard");
  if (!statusEl || !tasksEl) return;

  const quickRow = document.getElementById("suggestQuickRow");
  if (quickRow && !quickRow.dataset.wired) {
    quickRow.innerHTML = SUGGESTION_PRESETS.map(p => `<button class="suggest-quick-btn" data-preset="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join("");
    quickRow.querySelectorAll("[data-preset]").forEach(btn => {
      btn.onclick = () => sendSuggestion(btn.dataset.preset);
    });
    quickRow.dataset.wired = "1";
  }

  if (!state.dayStarted) {
    statusEl.innerHTML = `
      <div class="card center-card waiting-card">
        <div class="waiting-emoji">${isNightNow() ? "🌙" : "☀️"}</div>
        <div class="carer-heart">Waiting for Babylon to wake up</div>
        <div class="muted">You'll see their day appear here as soon as it starts. ${state.streak ? `Currently on a ${state.streak} day streak 🔥` : ""}</div>
      </div>
    `;
    tasksEl.innerHTML = "";
    return;
  }

  const pct = Math.round(completionPct() * 100);
  const todayMood = state.moodEntries.filter(m => todayKey(new Date(m.date)) === todayKey()).slice(-1)[0];
  const moodDef = todayMood ? MOODS.find(m => m.id === todayMood.mood) : null;

  statusEl.innerHTML = `
    <div class="card center-card">
      <div class="carer-heart">❤️ Babylon</div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="stat-row">
        <div class="stat-pill"><span>${completedCount()}</span><small>Completed</small></div>
        <div class="stat-pill"><span>${missedCount()}</span><small>Missed</small></div>
      </div>
      <div class="badday-note ${state.badDayMode ? "" : "hidden"}">Low energy mode is active today</div>
      <div class="mood-row">Mood: <span>${moodDef ? `${moodDef.emoji} ${moodDef.label}` : "Not logged yet"}</span></div>
    </div>
  `;

  const tasks = activeTasks();
  tasksEl.innerHTML = `
    <h2 class="section-title">Today's tasks</h2>
    <div class="list">${tasks.map(taskRowHtml).join("")}</div>
  `;
  // Read-only for Stink — strip the click affordance/undo control.
  tasksEl.querySelectorAll(".task-row-main").forEach(b => { b.style.cursor = "default"; b.disabled = true; });
  tasksEl.querySelectorAll(".task-undo-btn").forEach(b => b.remove());
}

function renderCarerHistory() {
  const el = document.getElementById("carerMoodHistory");
  if (!state.moodEntries.length) {
    el.innerHTML = `<p class="muted">No mood entries yet</p>`;
    return;
  }
  el.innerHTML = state.moodEntries.slice().reverse().slice(0, 20).map(m => {
    const def = MOODS.find(x => x.id === m.mood);
    const d = new Date(m.date);
    return `
      <div class="task-row-static">
        <span class="task-icon">${def ? def.emoji : "•"}</span>
        <span class="task-title">${def ? def.label : m.mood}<br><small class="muted">${m.timeOfDay} · ${d.toLocaleDateString()}</small></span>
      </div>
    `;
  }).join("") + `<div class="card" style="margin-top:12px;">${state.streak} day streak</div>`;
}

function sendEncouragement() {
  const input = document.getElementById("encourageInput");
  const text = input.value.trim();
  if (!text) return;
  const entry = { text, date: new Date(), read: false };
  state.encouragementMessages.push(entry);
  saveLocalCache();
  pushMessage(text);
  notifyLocal("❤️ Message sent", "Babylon will see it in the Carer tab.");
  input.value = "";
}

function sendSuggestion(text) {
  if (!text) return;
  const entry = { id: "local-" + Date.now(), text, status: "pending", createdAt: new Date() };
  state.suggestions.push(entry);
  saveLocalCache();
  pushSuggestion(text);
  showToast("💡 Suggestion sent");
  const input = document.getElementById("suggestInput");
  if (input) input.value = "";
}

// ---------- Notifications ----------
function requestNotificationPermission() {
  if ("Notification" in window) Notification.requestPermission();
}

function notifyLocal(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "icons/icon-192.png" }); } catch (e) { /* ignore */ }
  }
}

// In-app toast — fires even when OS notification permission hasn't
// been granted, so messages/completions are never silently missed
// while the app is open.
function showToast(text, tone) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast" + (tone === "pink" ? " toast-pink" : "");
  el.textContent = text;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3600);
}

function updateCarerBadge() {
  const badge = document.getElementById("carerTabBadge");
  if (!badge) return;
  badge.classList.toggle("hidden", !state.unreadMessages);
}

const notifiedToday = new Set();
function checkTaskReminders() {
  if (state.profile !== "babylon" || !state.dayStarted || state.badDayMode) return;
  const now = new Date();
  activeTasks().forEach(task => {
    const status = state.taskStatuses[task.id]?.state || "pending";
    if (status !== "pending") return;

    const snoozeUntil = state.snoozes?.[task.id];
    if (snoozeUntil) {
      if (now.getTime() < snoozeUntil) return; // still snoozed, don't nag
      const snoozeKey = task.id + "-snoozewake-" + snoozeUntil;
      if (!notifiedToday.has(snoozeKey)) {
        notifyLocal(`⏰ ${task.icon} ${task.title}`, "Your snooze is up — ready when you are.");
        showToast(`⏰ Time for ${task.title}`);
        notifiedToday.add(snoozeKey);
        delete state.snoozes[task.id];
        saveLocalCache();
      }
      return;
    }

    const scheduled = scheduledDateFor(task);
    if (!scheduled) return;
    const diffMin = (now - scheduled) / 60000;
    const dueKey = task.id + "-due";
    const followKey = task.id + "-follow";
    if (diffMin >= 0 && diffMin < 1 && !notifiedToday.has(dueKey)) {
      notifyLocal(`${task.icon} ${task.title} time`, `It's time for ${task.title.toLowerCase()}.`);
      notifiedToday.add(dueKey);
    }
    if (diffMin >= 10 && diffMin < 11 && !notifiedToday.has(followKey)) {
      notifyLocal(`${task.icon} ${task.title}`, "Still there? No rush — whenever you're ready.");
      notifiedToday.add(followKey);
    }
  });
}

// ---------- Sheet helpers ----------
function showSheet(id) { document.getElementById(id).classList.remove("hidden"); }
function closeSheet(id) { document.getElementById(id).classList.add("hidden"); }

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Offline handling ----------
function updateOfflineBanner() {
  const online = navigator.onLine;
  ["offlineBanner", "carerOfflineBanner"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", online);
  });
}

// ---------- Wire up static UI ----------
function wireUI() {
  document.getElementById("saveConfigBtn").onclick = () => {
    const text = document.getElementById("firebaseConfigInput").value;
    try {
      const config = JSON.parse(text);
      localStorage.setItem("tismtracker_firebase_config", JSON.stringify(config));
      showScreen("profileScreen");
      initFirebase();
    } catch (e) {
      alert("That doesn't look like valid JSON. Paste the config object from Firebase console > Project settings.");
    }
  };

  document.getElementById("loginBtn").onclick = handleLoginSubmit;
  document.getElementById("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLoginSubmit();
  });

  document.querySelectorAll(".profile-btn").forEach(btn => {
    btn.onclick = () => pickProfile(btn.dataset.profile);
  });

  document.querySelectorAll("#mainScreen .tab-btn").forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });
  document.querySelectorAll("#carerScreen .tab-btn").forEach(btn => {
    btn.onclick = () => switchCarerView(btn.dataset.cview);
  });

  document.getElementById("sheetBackdrop").onclick = () => closeSheet("taskSheet");
  document.getElementById("sheetCloseBtn").onclick = () => closeSheet("taskSheet");
  document.getElementById("moodSkipBtn").onclick = () => closeSheet("moodSheet");
  document.getElementById("cancelBadDayBtn").onclick = () => closeSheet("badDaySheet");
  document.getElementById("confirmBadDayBtn").onclick = confirmBadDay;
  document.getElementById("cancelEndDayBtn").onclick = () => closeSheet("endDaySheet");

  document.getElementById("taskEditBackdrop").onclick = () => closeSheet("taskEditSheet");
  document.getElementById("teCancelBtn").onclick = () => closeSheet("taskEditSheet");
  document.getElementById("teSaveBtn").onclick = saveTaskFromEditor;
  document.getElementById("teDeleteBtn").onclick = deleteTaskFromEditor;
  document.getElementById("teAddSubtask").onclick = () => renderSubtaskEditor([...collectSubtasksFromEditor(), ""]);
  document.querySelectorAll("#teRepeat .seg-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#teRepeat .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  document.getElementById("saveSleepBtn").onclick = saveSleepEntry;
  document.getElementById("saveScheduleBtn").onclick = saveScheduleFromEditor;
  document.getElementById("notifPermBtn").onclick = requestNotificationPermission;
  document.getElementById("carerNotifPermBtn").onclick = requestNotificationPermission;
  document.getElementById("switchProfileBtn").onclick = () => { state.profile = null; saveLocalCache(); showScreen("profileScreen"); };
  document.getElementById("carerSwitchProfileBtn").onclick = () => { state.profile = null; saveLocalCache(); showScreen("profileScreen"); };
  document.getElementById("resetDayBtn").onclick = () => {
    if (!confirm("Reset today completely? This clears all of today's tasks on both phones.")) return;
    state.taskStatuses = {};
    state.snoozes = {};
    state.dayStarted = false;
    state.badDayMode = false;
    state.streakCountedToday = false;
    notifiedToday.clear();
    prevTaskStatuses = {};
    saveLocalCache();
    pushDayState();
    renderToday();
    showToast("🔄 Today has been reset");
  };
  document.getElementById("sendEncourageBtn").onclick = sendEncouragement;
  document.getElementById("sendSuggestBtn").onclick = () => {
    const input = document.getElementById("suggestInput");
    sendSuggestion(input.value.trim());
  };

  window.addEventListener("online", () => { updateOfflineBanner(); showToast("✅ Back online — syncing…"); });
  window.addEventListener("offline", () => { updateOfflineBanner(); showToast("📡 You're offline — changes will sync later"); });
}

// ---------- Boot ----------
function boot() {
  loadLocalCache();
  checkForNewDay();
  wireUI();
  applyPhaseColors();
  updateOfflineBanner();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  const config = getSavedFirebaseConfig();
  if (!config) {
    showScreen("setupScreen");
    hideLoadingScreen();
  } else {
    showScreen("loginScreen"); // onAuthStateChanged will move past this if already signed in
    initFirebase();
  }

  setInterval(() => {
    checkForNewDay();
    checkTaskReminders();
  }, 30000);

  setInterval(applyPhaseColors, 60000);

  // Safety net: never let the splash screen block the app indefinitely.
  setTimeout(hideLoadingScreen, 4000);
}

document.addEventListener("DOMContentLoaded", boot);
