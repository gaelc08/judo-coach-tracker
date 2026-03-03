import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Same config
const firebaseConfig = {
  apiKey: "AIzaSyCiPU37HMlJ9B4I-6FeLSYMWnbfEUKgHTI",
  authDomain: "judo-coach-tracker.firebaseapp.com",
  projectId: "judo-coach-tracker",
  storageBucket: "judo-coach-tracker.firebasestorage.app",
  messagingSenderId: "144982546167",
  appId: "1:144982546167:web:7982b6e63bd02b7ffae5f2",
  measurementId: "G-CK6YFEGEW6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Reuse same structures
let coaches = [];
let timeData = {};
let currentCoach = null;
let currentMonth = "2026-02";

document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("adminEmail");
  const passInput = document.getElementById("adminPassword");
  const loginBtn = document.getElementById("adminLoginBtn");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const status = document.getElementById("adminStatus");
  const panel = document.getElementById("adminPanel");
  const loadBtn = document.getElementById("loadCoachBtn");
  const monthInput = document.getElementById("adminMonth");

  loginBtn.onclick = async () => {
    try {
      await signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value.trim());
    } catch (e) {
      alert(e.message);
    }
  };

  logoutBtn.onclick = async () => {
    await signOut(auth);
  };

  onAuthStateChanged(auth, (user) => {
    if (user) {
      status.textContent = `Logged in as ${user.email}`;
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
      panel.style.display = "block";
    } else {
      status.textContent = "Not logged in.";
      loginBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
      panel.style.display = "none";
    }
  });

  monthInput.onchange = () => {
    currentMonth = monthInput.value;
    updateCalendar();
    updateSummary();
  };

  loadBtn.onclick = async () => {
    const targetUid = document.getElementById("targetUid").value.trim();
    if (!targetUid) {
      alert("Enter coach user UID");
      return;
    }
    await loadCoachDataForUser(targetUid);
  };
});

async function loadCoachDataForUser(userId) {
  coaches = [];
  timeData = {};
  currentCoach = null;

  const coachRef = collection(db, "users", userId, "coaches");
  const coachSnap = await getDocs(coachRef);
  coachSnap.forEach((d) => {
    coaches.push({ id: d.id, ...d.data() });
  });

  if (coaches.length === 0) {
    alert("No coaches for this user.");
    clearCalendarSummary();
    return;
  }

  // For now pick the first coach
  currentCoach = coaches[0];
  document.getElementById("adminCoachName").textContent =
    `Coach: ${currentCoach.name}`;

  const timeRef = collection(db, "users", userId, "timeData");
  const timeSnap = await getDocs(timeRef);
  timeSnap.forEach((d) => {
    const data = d.data();
    const key = `${data.coachId}-${data.date}`;
    timeData[key] = {
      hours: data.hours || 0,
      competition: !!data.competition,
      km: data.km || 0,
      description: data.description || "",
      id: d.id
    };
  });

  updateCalendar();
  updateSummary();
}

// Copy the same updateCalendar, createDayElement, updateSummary,
// exportToCSV, exportMileageCSV implementations from app-modular.js.
