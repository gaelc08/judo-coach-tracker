// app-modular.js
// Uses Firebase v10 modular CDN SDK

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ----- Firebase config -----
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

// ===== In‑memory state =====
let coaches = [];
let timeData = {};
let currentCoach = null;
let currentMonth = "2026-02";
let selectedDay = null;
let editMode = false;
let editingCoachId = null;
let currentUser = null;

// ===== Firestore helpers (modular) =====
function userDocRef() {
  if (!currentUser) return null;
  return doc(db, "users", currentUser.uid);
}

function coachesCol() {
  if (!currentUser) return null;
  return collection(db, "users", currentUser.uid, "coaches");
}

function timeDataCol() {
  if (!currentUser) return null;
  return collection(db, "users", currentUser.uid, "timeData");
}

// ===== Static data =====
const holidays2026 = {
  "2026-01-01": "New Year",
  "2026-04-06": "Easter Monday",
  "2026-05-01": "Labour Day",
  "2026-05-08": "Victory Day",
  "2026-05-14": "Ascension Day",
  "2026-05-25": "Whit Monday",
  "2026-07-14": "Bastille Day",
  "2026-08-15": "Assumption",
  "2026-11-01": "All Saints",
  "2026-11-11": "Armistice",
  "2026-12-25": "Christmas"
};

const schoolHolidays = [
  { start: "2026-02-14", end: "2026-03-02", name: "Winter" },
  { start: "2026-04-11", end: "2026-04-27", name: "Spring" },
  { start: "2026-07-04", end: "2026-08-31", name: "Summer" },
  { start: "2026-10-17", end: "2026-11-02", name: "All Saints" },
  { start: "2026-12-19", end: "2027-01-04", name: "Christmas" }
];

// ===== Init =====
document.addEventListener("DOMContentLoaded", setupAuthListeners);

// ===== Auth =====
function setupAuthListeners() {
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const registerBtn = document.getElementById("registerBtn");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const statusSpan = document.getElementById("authStatus");
  const appContainer = document.getElementById("appContainer");

  registerBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      alert("Enter email and password");
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      statusSpan.textContent = "Account created & logged in.";
    } catch (e) {
      alert(e.message);
    }
  });

  loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      alert("Enter email and password");
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      alert(e.message);
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  onAuthStateChanged(auth, async (user) => {
    const select = document.getElementById("coachSelect");
    select.innerHTML = '<option value="">-- Select Coach --</option>';
    coaches = [];
    timeData = {};
    currentCoach = null;

    if (user) {
      currentUser = user;
      statusSpan.textContent = `Logged in as ${user.email}`;
      logoutBtn.style.display = "inline-block";
      appContainer.style.display = "block";

      await loadAllDataFromFirestore();
      setupEventListeners();
      updateCalendar();
      updateSummary();
    } else {
      currentUser = null;
      statusSpan.textContent = "Not logged in.";
      logoutBtn.style.display = "none";
      appContainer.style.display = "none";
    }
  });
}

// ===== Data loading =====
async function loadAllDataFromFirestore() {
  if (!currentUser) return;

  coaches = [];
  const coachRef = coachesCol();
  if (coachRef) {
    const coachSnap = await getDocs(coachRef);
    coachSnap.forEach((d) => {
      coaches.push({ id: d.id, ...d.data() });
    });
  }
  loadCoaches();

  timeData = {};
  const timeRef = timeDataCol();
  if (timeRef) {
    const timeSnap = await getDocs(timeRef);
    timeSnap.forEach((d) => {
      const data = d.data();
      const key = `${data.coachId}-${data.date}`;
      timeData[key] = {
        hours: data.hours || 0,
        competition: !!data.competition,
        km: data.km || 0,
        description: data.description || "",
        departurePlace: data.departurePlace || "",
        arrivalPlace: data.arrivalPlace || "",
        id: d.id
      };
    });
  }
}

// ===== Event listeners =====
function setupEventListeners() {
  document.getElementById("addCoachBtn").onclick = () => {
    editMode = false;
    editingCoachId = null;
    clearCoachForm();
    document.getElementById("coachModal").classList.add("active");
  };

  document.getElementById("editCoachBtn").onclick = () => {
    if (!currentCoach) {
      alert("Select a coach first.");
      return;
    }
    editMode = true;
    editingCoachId = currentCoach.id;

    document.getElementById("coachName").value = currentCoach.name;
    document.getElementById("coachAddress").value = currentCoach.address || "";
    document.getElementById("coachVehicle").value = currentCoach.vehicle || "";
    document.getElementById("coachFiscalPower").value = currentCoach.fiscalPower || "";
    document.getElementById("coachRate").value = currentCoach.hourlyRate;
    document.getElementById("dailyAllowance").value = currentCoach.dailyAllowance;
    document.getElementById("kmRate").value = currentCoach.kmRate;

    document.getElementById("coachModal").classList.add("active");
  };

  document.getElementById("saveCoach").onclick = saveCoach;
  document.getElementById("cancelCoach").onclick = () => {
    document.getElementById("coachModal").classList.remove("active");
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
  };

  document.getElementById("coachModal").onclick = (e) => {
    if (e.target.id === "coachModal") {
      document.getElementById("coachModal").classList.remove("active");
      clearCoachForm();
      editMode = false;
      editingCoachId = null;
    }
  };

  document.getElementById("dayModal").onclick = (e) => {
    if (e.target.id === "dayModal") {
      document.getElementById("dayModal").classList.remove("active");
    }
  };

  document.getElementById("coachSelect").onchange = (e) => {
    currentCoach = coaches.find((c) => c.id === e.target.value) || null;
    updateCalendar();
    updateSummary();
  };

  document.getElementById("monthSelect").onchange = (e) => {
    currentMonth = e.target.value;
    updateCalendar();
    updateSummary();
  };

  document.getElementById("competitionDay").onchange = (e) => {
    document.getElementById("travelGroup").style.display = e.target.checked
      ? "block"
      : "none";
  };

  document.getElementById("saveDay").onclick = saveDay;
  document.getElementById("deleteDay").onclick = deleteDay;
  document.getElementById("cancelDay").onclick = () => {
    document.getElementById("dayModal").classList.remove("active");
  };

  document.getElementById("exportBtn").onclick = exportToCSV;

  document.getElementById("importBtn").onclick = () => {
    const fileInput = document.getElementById("importFile");
    const file = fileInput.files[0];
    if (!file) {
      alert("Please choose a JSON file first.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        await importCoachData(data);
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };

  document.getElementById("mileageBtn").onclick = exportMileageCSV;
}

// ===== Coach management =====
function clearCoachForm() {
  document.getElementById("coachName").value = "";
  document.getElementById("coachAddress").value = "";
  document.getElementById("coachVehicle").value = "";
  document.getElementById("coachFiscalPower").value = "";
  document.getElementById("coachRate").value = "";
  document.getElementById("dailyAllowance").value = "";
  document.getElementById("kmRate").value = "0.35";
}


function loadCoaches() {
  const select = document.getElementById("coachSelect");
  select.innerHTML = '<option value="">-- Select Coach --</option>';

  coaches.forEach((coach) => {
    const option = document.createElement("option");
    option.value = coach.id;
    option.textContent = `${coach.name} (€${coach.hourlyRate}/h)`;
    select.appendChild(option);
  });

  if (currentCoach) {
    const found = coaches.find((c) => c.id === currentCoach.id);
    if (found) {
      currentCoach = found;
      select.value = currentCoach.id;
    } else {
      currentCoach = null;
    }
  }
}

async function saveCoach() {
  if (!currentUser) return;

  const name = document.getElementById("coachName").value.trim();
  const address = document.getElementById("coachAddress").value.trim();
  const vehicle = document.getElementById("coachVehicle").value.trim();
  const fiscalPower = document.getElementById("coachFiscalPower").value.trim();
  const rate = parseFloat(document.getElementById("coachRate").value);
  const allowance = parseFloat(document.getElementById("dailyAllowance").value);
  const kmRate = parseFloat(document.getElementById("kmRate").value);

  if (!name || isNaN(rate) || isNaN(allowance) || isNaN(kmRate)) {
    alert("Please fill all required fields with valid numbers");
    return;
  }

  const coachData = { name, address, vehicle, fiscalPower, hourlyRate: rate, dailyAllowance: allowance, kmRate };

  try {
    if (editMode && editingCoachId) {
      const coachRef = doc(
        db,
        "users",
        currentUser.uid,
        "coaches",
        editingCoachId
      );
      await updateDoc(coachRef, coachData);

    } else {
      const colRef = coachesCol();
      const docRef = await addDoc(colRef, coachData);

      editingCoachId = docRef.id;
    }

    await loadAllDataFromFirestore();

    currentCoach = coaches.find((c) => c.id === editingCoachId) || null;
    const select = document.getElementById("coachSelect");
    if (currentCoach) select.value = currentCoach.id;

    document.getElementById("coachModal").classList.remove("active");
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
    updateSummary();
  } catch (e) {
    alert("Error saving coach: " + e.message);
  }
}

// ===== Calendar rendering =====
function updateCalendar() {
  const calendar = document.getElementById("calendar");
  calendar.innerHTML = "";

  if (!currentMonth) return;

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  dayNames.forEach((dayName) => {
    const headerDiv = document.createElement("div");
    headerDiv.className = "calendar-header";
    headerDiv.textContent = dayName;
    calendar.appendChild(headerDiv);
  });

  const [year, month] = currentMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  for (let i = 0; i < startDay; i++) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day disabled";
    calendar.appendChild(emptyDay);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const dayDiv = createDayElement(day, dateStr);
    calendar.appendChild(dayDiv);
  }
}

function createDayElement(day, dateStr) {
  const dayDiv = document.createElement("div");
  dayDiv.className = "calendar-day";

  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    dayDiv.classList.add("weekend");
  }

  if (holidays2026[dateStr]) {
    dayDiv.classList.add("holiday");
  }

  const isSchoolHoliday = schoolHolidays.some(
    (holiday) => dateStr >= holiday.start && dateStr <= holiday.end
  );
  if (isSchoolHoliday && !holidays2026[dateStr]) {
    dayDiv.classList.add("school-holiday");
  }

  const key = `${currentCoach?.id}-${dateStr}`;
  const dayData = timeData[key];

  if (dayData) {
    if (dayData.competition) {
      dayDiv.classList.add("has-competition");
    } else if (dayData.hours > 0) {
      dayDiv.classList.add("has-data");
    }
  }

  const dayNumber = document.createElement("div");
  dayNumber.className = "day-number";
  dayNumber.textContent = day;
  dayDiv.appendChild(dayNumber);

  if (holidays2026[dateStr]) {
    const info = document.createElement("div");
    info.className = "day-info";
    info.textContent = holidays2026[dateStr];
    dayDiv.appendChild(info);
  }

  if (dayData && dayData.hours > 0) {
    const hours = document.createElement("div");
    hours.className = "day-hours";
    hours.textContent = `${dayData.hours}h`;
    if (dayData.competition) hours.textContent += " 🏆";
    dayDiv.appendChild(hours);
  }

  dayDiv.addEventListener("click", () => openDayModal(dateStr));

  return dayDiv;
}

// ===== Day modal =====
function openDayModal(dateStr) {
  if (!currentCoach) {
    alert("Please select a coach first");
    return;
  }

  selectedDay = dateStr;
  const key = `${currentCoach.id}-${dateStr}`;
  const dayData =
    timeData[key] || { hours: 0, competition: false, km: 0, description: "" };

  document.getElementById("dayTitle").textContent = `Edit ${dateStr}`;
  document.getElementById("trainingHours").value = dayData.hours || 0;
  document.getElementById("competitionDay").checked =
    dayData.competition || false;
  document.getElementById("kilometers").value = dayData.km || 0;
  document.getElementById("competitionDescription").value =
    dayData.description || "";
  document.getElementById("departurePlace").value = dayData.departurePlace || "";
  document.getElementById("arrivalPlace").value = dayData.arrivalPlace || "";

  document.getElementById("travelGroup").style.display = dayData.competition
    ? "block"
    : "none";

  document.getElementById("dayModal").classList.add("active");
}

async function saveDay() {
  if (!currentCoach || !currentUser) return;

  const hours =
    parseFloat(document.getElementById("trainingHours").value) || 0;
  const competition = document.getElementById("competitionDay").checked;
  const km = parseFloat(document.getElementById("kilometers").value) || 0;
  const description =
    document.getElementById("competitionDescription").value.trim();
  const departurePlace = document.getElementById("departurePlace").value.trim();
  const arrivalPlace = document.getElementById("arrivalPlace").value.trim();

  const key = `${currentCoach.id}-${selectedDay}`;
  const existing = timeData[key];

  if (hours === 0 && !competition && km === 0 && !description) {
    if (existing && existing.id) {
      await deleteDoc(
        doc(db, "users", currentUser.uid, "timeData", existing.id)
      );
    }
    delete timeData[key];
  } else {
    if (existing && existing.id) {
      await updateDoc(
        doc(db, "users", currentUser.uid, "timeData", existing.id),
        {
          coachId: currentCoach.id,
          date: selectedDay,
          hours,
          competition,
          km,
          description,
          departurePlace,
          arrivalPlace
        }
      );
      timeData[key] = {
        hours,
        competition,
        km,
        description,
        id: existing.id
      };
    } else {
      const colRef = timeDataCol();
      const docRef = await addDoc(colRef, {
        coachId: currentCoach.id,
        date: selectedDay,
        hours,
        competition,
        km,
        description,
        departurePlace,
        arrivalPlace
      });
      timeData[key] = {
        hours,
        competition,
        km,
        description,
        id: docRef.id
      };
    }
  }

  document.getElementById("dayModal").classList.remove("active");
  updateCalendar();
  updateSummary();
}

async function deleteDay() {
  if (!currentCoach || !currentUser) return;
  const key = `${currentCoach.id}-${selectedDay}`;
  const existing = timeData[key];
  if (existing && existing.id) {
    await deleteDoc(
      doc(db, "users", currentUser.uid, "timeData", existing.id)
    );
  }
  delete timeData[key];

  document.getElementById("dayModal").classList.remove("active");
  updateCalendar();
  updateSummary();
}

// ===== Summary & exports =====
function updateSummary() {
  if (!currentCoach || !currentMonth) {
    document.getElementById("totalHours").textContent = "0";
    document.getElementById("hourlyRate").textContent = "€0.00";
    document.getElementById("trainingPayment").textContent = "€0.00";
    document.getElementById("compDays").textContent = "0";
    document.getElementById("compPayment").textContent = "€0.00";
    document.getElementById("totalKm").textContent = "0";
    document.getElementById("kmPayment").textContent = "€0.00";
    document.getElementById("totalPayment").textContent = "€0.00";
    return;
  }

  const [year, month] = currentMonth.split("-");
  let totalHours = 0;
  let compDays = 0;
  let totalKm = 0;

  Object.keys(timeData).forEach((key) => {
    if (key.startsWith(`${currentCoach.id}-${year}-${month}`)) {
      const data = timeData[key];
      totalHours += data.hours || 0;
      if (data.competition) compDays++;
      totalKm += data.km || 0;
    }
  });

  const trainingPayment = totalHours * currentCoach.hourlyRate;
  const compPayment = compDays * currentCoach.dailyAllowance;
  const kmPayment = totalKm * currentCoach.kmRate;
  const totalPayment = trainingPayment + compPayment + kmPayment;

  document.getElementById("totalHours").textContent = totalHours.toFixed(1);
  document.getElementById(
    "hourlyRate"
  ).textContent = `€${currentCoach.hourlyRate.toFixed(2)}`;
  document.getElementById(
    "trainingPayment"
  ).textContent = `€${trainingPayment.toFixed(2)}`;
  document.getElementById("compDays").textContent = compDays;
  document.getElementById(
    "compPayment"
  ).textContent = `€${compPayment.toFixed(2)}`;
  document.getElementById("totalKm").textContent = totalKm;
  document.getElementById(
    "kmPayment"
  ).textContent = `€${kmPayment.toFixed(2)}`;
  document.getElementById(
    "totalPayment"
  ).textContent = `€${totalPayment.toFixed(2)}`;
}

function exportToCSV() {
  if (!currentCoach || !currentMonth) {
    alert("Please select a coach and month");
    return;
  }

  const [year, month] = currentMonth.split("-");
  let csv =
    "Date,Training Hours,Competition,Competition Description,Kilometers,Payment\n";

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(1).join("-");
      const data = timeData[key];
      const payment =
        data.hours * currentCoach.hourlyRate +
        (data.competition ? currentCoach.dailyAllowance : 0) +
        data.km * currentCoach.kmRate;
      csv +=
        `${date},${data.hours},${data.competition ? "Yes" : "No"},` +
        `"${data.description || ""}",${data.km},€${payment.toFixed(2)}\n`;
    });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentCoach.name}_${currentMonth}_coaching.csv`;
  a.click();
}

function exportMileageCSV() {
  if (!currentCoach || !currentMonth) { alert("Please select a coach and month"); return; }
  const [year, month] = currentMonth.split("-");
  const today = new Date().toLocaleDateString("fr-FR").split("/").join("");

  const rows = [];
  rows.push(["Judo Club de Cattenom-Rodemack", "RA1026", "Dojo communautaire", "57570 Cattenom", "judoclubcattenom@gmail.com", "06 62 62 53 13"]);
  rows.push(["Note de frais kilométrique"]);
  rows.push(["Date :", today, "Nom et prénom :", currentCoach.name, "Adresse :", currentCoach.address || ""]);
  rows.push(["Modèle et marque du véhicule :", currentCoach.vehicle || "", "Poste occupé :", "Entraîneur", "Puissance fiscale du véhicule :", (currentCoach.fiscalPower || "") + "CV"]);
  rows.push([]);
  rows.push(["Date", "Motif du trajet", "Lieu de départ", "Lieu d'arrivée", "Distance km", "Indemnité kilométrique", "Page", "Parking / Justificatif", "Montant indemnisé"]);

  let total = 0;
  Object.keys(timeData)
    .filter(key => key.startsWith(`${currentCoach.id}-${year}-${month}`))
    .sort()
    .forEach(key => {
      const date = key.split("-").slice(1).join("-");
      const data = timeData[key];
      if (!data.km || data.km <= 0) return;
      const amount = data.km * currentCoach.kmRate;
      total += amount;
      rows.push([date, data.description || "Déplacement judo", data.departurePlace || "", data.arrivalPlace || "", String(data.km), currentCoach.kmRate.toFixed(2).replace(".", ","), "", "", amount.toFixed(2).replace(".", ",")]);
    });

  if (total === 0) { alert("No mileage recorded for this month."); return; }

  rows.push([]);
  rows.push(["TOTAL TTC", total.toFixed(2).replace(".", ",") + " €"]);
  rows.push([]);
  rows.push(["Le montant de l'indemnité par kilomètre est fixé selon le nombre de kilomètres parcouru et la puissance fiscale de votre véhicule. Pour le connaître référez-vous au barème des frais kilométriques établi par l'administration fiscale et l'Ursaf."]);
  rows.push([]);
  rows.push(["Signature du salarié", "", "", "Signature de l'employeur"]);

  const csv = rows.map(r => r.map(v => `"${v}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `note_frais_km_${currentCoach.name}_${currentMonth}.csv`;
  a.click();
}


// ===== Import JSON =====
async function importCoachData(data) {
  if (!currentCoach || !currentUser) {
    alert("Select a coach and log in before importing.");
    return;
  }

  if (data.entraineur && data.entraineur !== currentCoach.name) {
    const ok = confirm(
      `JSON coach is "${data.entraineur}", selected coach is "${currentCoach.name}". Continue?`
    );
    if (!ok) return;
  }

  const batch = writeBatch(db);
  const colRef = timeDataCol();

  if (data.heures) {
    Object.entries(data.heures).forEach(([date, hours]) => {
      const ref = doc(colRef);
      batch.set(ref, {
        coachId: currentCoach.id,
        date,
        hours: Number(hours) || 0,
        competition: false,
        km: 0,
        description: ""
      });
    });
  }

  if (data.manifestations) {
    Object.keys(data.manifestations).forEach((date) => {
      const desc = data.manifestations[date] || "";
      const ref = doc(colRef);
      batch.set(ref, {
        coachId: currentCoach.id,
        date,
        hours: 0,
        competition: true,
        km: 0,
        description: desc
      });
    });
  }

  await batch.commit();
  await loadAllDataFromFirestore();
  updateCalendar();
  updateSummary();
  alert("Import completed.");
}

// Optionally expose some functions globally if needed
window.exportToCSV = exportToCSV;
window.exportMileageCSV = exportMileageCSV;
