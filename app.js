import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot,
  collection, addDoc, query, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged,
  setPersistence, browserLocalPersistence, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---------- Default schedule (used the very first time, before Settings edits) ----------
const DEFAULT_SCHEDULE = [
  { id: "wake-up", time: "09:00", title: "Wake up", icon: "☀️", subtasks: [] },
  { id: "shower", time: "09:15", title: "Shower", icon: "🚿", subtasks: ["Get towel", "Turn shower on", "Shower", "Dry off", "Get dressed"] },
  { id: "breakfast", time: "10:00", title: "Eat breakfast", icon: "🍽", subtasks: ["Choose food", "Eat", "Drink water"] },
  { id: "brush-teeth", time: "10:30", title: "Brush teeth", icon: "🪥", subtasks: [] }
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

// ---------- State ----------
const state = {
  profile: null,          // "babylon" | "stink"
  schedule: DEFAULT_SCHEDULE,
  dayKey: todayKey(),
  dayStarted: false,
  badDayMode: false,
  taskStatuses: {},        // { [taskId]: { state, completedSubtasks: [], completedAt } }
  streak: 0,
  moodEntries: [],
  encouragementMessages: [],
  sleepEntries: [],
  cloudStatus: "unknown"   // unknown | checking | available | unavailable
};

let db = null;
let currentView = "Today";
let currentCarerView = "Dashboard";
let activeSheetTask = null;

// ---------- Helpers ----------
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function activeTasks() {
  if (state.badDayMode) return BAD_DAY_ESSENTIALS.map(t => ({ ...t, time: "", subtasks: [] }));
  return state.schedule;
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
  const tasks = activeTasks();
  if (!tasks.length) return 0;
  return completedCount() / tasks.length;
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
    streak: state.streak,
    moodEntries: state.moodEntries,
    encouragementMessages: state.encouragementMessages,
    sleepEntries: state.sleepEntries
  }));
}

function loadLocalCache() {
  const raw = localStorage.getItem("tismtracker_state");
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
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
    state.badDayMode = false;
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
    });
  } catch (e) {
    console.error("Firebase init failed", e);
    setSyncStatus("unavailable");
    showScreen("loginScreen");
  }
}

function proceedPastLogin() {
  if (!state.profile) {
    showScreen("profileScreen");
  } else if (state.profile === "babylon") {
    showScreen("mainScreen");
    renderToday();
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
      if (currentView === "Schedule") renderSchedule();
    }
  });

  // Today's day state
  onSnapshot(doc(db, "days", state.dayKey), (snap) => {
    if (snap.exists()) {
      const d = snap.data();
      state.dayStarted = !!d.dayStarted;
      state.badDayMode = !!d.badDayMode;
      state.taskStatuses = d.taskStatuses || {};
      state.streak = d.streak || 0;
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
    saveLocalCache();
    if (currentView === "Carer") renderCarerMessages();
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
    streak: state.streak
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

function pickProfile(profile) {
  state.profile = profile;
  saveLocalCache();
  if (profile === "babylon") {
    showScreen("mainScreen");
    renderToday();
    maybeShowMoodPrompt();
  } else {
    showScreen("carerScreen");
    renderCarerDashboard();
    renderCarerHistory();
  }
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll("#mainScreen .view").forEach(v => v.classList.add("hidden"));
  document.querySelectorAll("#mainScreen .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.getElementById("topbarTitle").textContent = view;
  document.getElementById("view" + view).classList.remove("hidden");
  if (view === "Today") renderToday();
  if (view === "Schedule") renderSchedule();
  if (view === "Sleep") renderSleep();
  if (view === "Carer") renderCarerMessages();
  if (view === "Settings") renderSettings();
}

function switchCarerView(view) {
  currentCarerView = view;
  document.querySelectorAll("#carerScreen .view").forEach(v => v.classList.add("hidden"));
  document.querySelectorAll("#carerScreen .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.cview === view));
  document.getElementById("viewCarer" + view).classList.remove("hidden");
}

// ---------- Rendering: Today ----------
function renderToday() {
  const el = document.getElementById("viewToday");
  if (!state.dayStarted) {
    el.innerHTML = `
      <div class="card hero-card">
        <div class="hero-emoji">☀️</div>
        <div class="hero-title">Good morning, Babylon</div>
        <div class="hero-sub">Ready for today?</div>
        <button class="btn btn-primary" id="startDayBtn">START DAY</button>
      </div>
      <button class="badday-entry" id="badDayEntryBtn">🚨 I'm overwhelmed</button>
    `;
    document.getElementById("startDayBtn").onclick = startDay;
    document.getElementById("badDayEntryBtn").onclick = () => showSheet("badDaySheet");
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

  if (state.badDayMode) {
    html += `
      <div class="badday-banner">
        <div class="title">Low energy mode activated ❤️</div>
        <div class="muted">Just the essentials today — that's enough.</div>
        <button class="link-btn" id="exitBadDayBtn">Back to normal routine</button>
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
  });
}

function taskRowHtml(task) {
  const status = state.taskStatuses[task.id]?.state || "pending";
  const classes = ["task-row"];
  if (status === "missed") classes.push("missed");
  if (status === "completed" || status === "completedLate") classes.push("completed");
  const icon = status === "completed" || status === "completedLate" ? "✅"
    : status === "missed" ? "❗️"
    : status === "skipped" ? "↪️" : "›";
  return `
    <button class="${classes.join(" ")}" id="task-${task.id}">
      ${task.time ? `<span class="task-time">${task.time}</span>` : ""}
      <span class="task-icon">${task.icon}</span>
      <span class="task-title">${task.title}${status === "missed" ? `<span class="task-missed-label">Missed</span>` : ""}</span>
      <span class="task-status-icon">${icon}</span>
    </button>
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

function showCelebration() {
  const el = document.getElementById("celebration");
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

  if (!task.subtasks || task.subtasks.length === 0) {
    subtasksEl.innerHTML = "";
    doneBtn.classList.remove("hidden");
    doneBtn.onclick = () => {
      completeTaskInternal(task);
      saveLocalCache(); pushDayState();
      closeSheet("taskSheet");
      renderToday();
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
        openTaskSheet(task); // re-render sheet
        if (nowDone) {
          setTimeout(() => { closeSheet("taskSheet"); renderToday(); showCelebration(); }, 200);
        }
      };
    });
  }
  showSheet("taskSheet");
}

function completeTaskInternal(task) {
  const scheduled = scheduledDateFor(task);
  const late = scheduled ? (new Date() - scheduled) > 10 * 60 * 1000 : false;
  state.taskStatuses[task.id] = {
    state: late ? "completedLate" : "completed",
    completedSubtasks: task.subtasks || [],
    completedAt: new Date().toISOString()
  };
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
  } else if (status.state === "completed") {
    status.state = "pending";
  }
  state.taskStatuses[task.id] = status;
  recalcStreak();
}

function recalcStreak() {
  const tasks = activeTasks();
  if (tasks.length && completedCount() === tasks.length) {
    state.streak += 1;
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
      <div class="task-row" style="cursor:default;">
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

// ---------- Schedule view ----------
function renderSchedule() {
  const el = document.getElementById("scheduleList");
  el.innerHTML = state.schedule.map(t => `
    <div class="task-row" style="cursor:default;">
      <span class="task-time">${t.time}</span>
      <span class="task-icon">${t.icon}</span>
      <span class="task-title">${t.title}${t.subtasks.length ? `<br><small class="muted">${t.subtasks.length} steps</small>` : ""}</span>
    </div>
  `).join("");
}

// ---------- Sleep view (manual entry, no HealthKit on web) ----------
function renderSleep() {
  const historyEl = document.getElementById("sleepHistory");
  if (!state.sleepEntries.length) {
    historyEl.innerHTML = `<p class="muted">No sleep logged yet.</p>`;
    return;
  }
  historyEl.innerHTML = state.sleepEntries.slice(0, 14).map(e => `
    <div class="task-row" style="cursor:default;">
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
  } catch (e) {
    errEl.textContent = "That JSON isn't quite right: " + e.message;
    errEl.classList.remove("hidden");
  }
}

// ---------- Carer (Stink) dashboard ----------
function renderCarerDashboard() {
  const pct = Math.round(completionPct() * 100);
  document.getElementById("carerProgressFill").style.width = pct + "%";
  document.getElementById("carerCompleted").textContent = completedCount();
  document.getElementById("carerMissed").textContent = missedCount();
  document.getElementById("carerBadDayNote").classList.toggle("hidden", !state.badDayMode);

  const todayMood = state.moodEntries.filter(m => todayKey(new Date(m.date)) === todayKey()).slice(-1)[0];
  const moodDef = todayMood ? MOODS.find(m => m.id === todayMood.mood) : null;
  document.getElementById("carerMoodToday").textContent = moodDef ? `${moodDef.emoji} ${moodDef.label}` : "Not logged yet";
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
      <div class="task-row" style="cursor:default;">
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

// ---------- Notifications ----------
function requestNotificationPermission() {
  if ("Notification" in window) Notification.requestPermission();
}

function notifyLocal(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "icons/icon-192.png" }); } catch (e) { /* ignore */ }
  }
}

const notifiedToday = new Set();
function checkTaskReminders() {
  if (state.profile !== "babylon" || !state.dayStarted || state.badDayMode) return;
  const now = new Date();
  activeTasks().forEach(task => {
    const scheduled = scheduledDateFor(task);
    if (!scheduled) return;
    const status = state.taskStatuses[task.id]?.state || "pending";
    if (status !== "pending") return;
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

  document.getElementById("saveSleepBtn").onclick = saveSleepEntry;
  document.getElementById("saveScheduleBtn").onclick = saveScheduleFromEditor;
  document.getElementById("notifPermBtn").onclick = requestNotificationPermission;
  document.getElementById("carerNotifPermBtn").onclick = requestNotificationPermission;
  document.getElementById("switchProfileBtn").onclick = () => { state.profile = null; saveLocalCache(); showScreen("profileScreen"); };
  document.getElementById("carerSwitchProfileBtn").onclick = () => { state.profile = null; saveLocalCache(); showScreen("profileScreen"); };
  document.getElementById("resetDayBtn").onclick = () => {
    state.taskStatuses = {}; state.dayStarted = false; state.badDayMode = false;
    saveLocalCache(); pushDayState(); renderToday();
  };
  document.getElementById("sendEncourageBtn").onclick = sendEncouragement;
}

// ---------- Boot ----------
function boot() {
  loadLocalCache();
  checkForNewDay();
  wireUI();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  const config = getSavedFirebaseConfig();
  if (!config) {
    showScreen("setupScreen");
  } else {
    showScreen("loginScreen"); // onAuthStateChanged will move past this if already signed in
    initFirebase();
  }

  setInterval(() => {
    checkForNewDay();
    checkTaskReminders();
  }, 30000);
}

document.addEventListener("DOMContentLoaded", boot);
