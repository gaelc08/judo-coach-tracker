// admin-app.js
// Admin view for Judo Coach Tracker (Firebase v10 modular CDN SDK)

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

// ----- Firebase config (same as main app) -----
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

// ===== In‑memory state (admin) =====
let timeData = {};
let currentMonth = "2026-02";
let selectedDay = null;

let adminCoaches = [];
let adminCurrentCoach = null;
let adminUserId = null;

// ===== Static data (same as main app) =====
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
document.addEventListener("DOMContentLoaded", setupAdminAuth);

// ===== Auth + UI wiring =====
function setupAdminAuth() {
  const emailInput = document.getElementById("adminEmail");
  const passInput = document.getElementById("adminPassword");
  const loginBtn = document.getElementById("adminLoginBtn");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const status = document.getElementById("adminStatus");
  const panel = document.getElementById("adminPanel");
  const loadBtn = document.getElementById("loadCoachBtn");
  const monthInput = document.getElementById("adminMonth");
  const coachSelect = document.getElementById("adminCoachSelect");

  loginBtn.onclick = async () => {
    try {
      await signInWithEmailAndPassword(
        auth,
        emailInput.value.trim(),
        passInput.value.trim()
      );
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
      clearCalendarSummary();
    }
  });

  // month selector -> sync with currentMonth
  currentMonth = monthInput.value || "2026-02";
  monthInput.onchange = () => {
    currentMonth = monthInput.value;
    updateCalendar();
    updateSummary();
  };

  // load button: load data for given user UID
  loadBtn.onclick = async () => {
    const targetUid = document.getElementById("targetUid").value.trim();
    if (!targetUid) {
      alert("Enter coach user UID");
      return;
    }
    adminUserId = targetUid;
    await loadCoachDataForUser(targetUid);
  };

  // coach select change handler (actual binding done after data is loaded too)
  coachSelect.onchange = () => {
    const id = coachSelect.value;
    adminCurrentCoach = adminCoaches.find((c) => c.id === id) || null;
    if (!adminCurrentCoach) {
      clearCalendarSummary();
      return;
    }
    updateCalendar();
    updateSummary();
  };

  // export mileage note (HTML + PDF)
  const adminMileageBtn = document.getElementById("adminMileageBtn");
  if (adminMileageBtn) {
    adminMileageBtn.onclick = exportAdminMileageHTML;
  }
}

// ===== Data loading for admin =====
async function loadCoachDataForUser(userId) {
  adminCoaches = [];
  timeData = {};
  adminCurrentCoach = null;

  // load coaches
  const coachRef = collection(db, "users", userId, "coaches");
  const coachSnap = await getDocs(coachRef);
  coachSnap.forEach((d) => {
    adminCoaches.push({ id: d.id, ...d.data() });
  });

  if (adminCoaches.length === 0) {
    alert("No coaches for this user.");
    clearCalendarSummary();
    return;
  }

  // fill select
  const select = document.getElementById("adminCoachSelect");
  select.innerHTML = '<option value="">-- Sélectionner un coach --</option>';
  adminCoaches.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (€${c.hourlyRate}/h)`;
    select.appendChild(opt);
  });

  // load timeData
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
      departurePlace: data.departurePlace || "",
      arrivalPlace: data.arrivalPlace || "",
      id: d.id
    };
  });

  // reset month (if needed)
  const monthInput = document.getElementById("adminMonth");
  currentMonth = monthInput.value || "2026-02";

  // on attend que l’admin choisisse un coach dans la liste
  clearCalendarSummary();
}

// ===== Calendar rendering (read‑only) =====
function updateCalendar() {
  const calendar = document.getElementById("calendar");
  if (!calendar) return;

  calendar.innerHTML = "";

  if (!currentMonth || !adminCurrentCoach) return;

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

  const key = `${adminCurrentCoach?.id}-${dateStr}`;
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

  // en admin, pas de modal d’édition (lecture seule)
  return dayDiv;
}

// ===== Summary (read‑only) =====
function updateSummary() {
  if (!adminCurrentCoach || !currentMonth) {
    clearSummaryFields();
    return;
  }

  const [year, month] = currentMonth.split("-");
  let totalHours = 0;
  let compDays = 0;
  let totalKm = 0;

  Object.keys(timeData).forEach((key) => {
    if (key.startsWith(`${adminCurrentCoach.id}-${year}-${month}`)) {
      const data = timeData[key];
      totalHours += data.hours || 0;
      if (data.competition) compDays++;
      totalKm += data.km || 0;
    }
  });

  const trainingPayment = totalHours * adminCurrentCoach.hourlyRate;
  const compPayment = compDays * adminCurrentCoach.dailyAllowance;
  const kmPayment = totalKm * adminCurrentCoach.kmRate;
  const totalPayment = trainingPayment + compPayment + kmPayment;

  document.getElementById("totalHours").textContent = totalHours.toFixed(1);
  document.getElementById("hourlyRate").textContent =
    `€${adminCurrentCoach.hourlyRate.toFixed(2)}`;
  document.getElementById("trainingPayment").textContent =
    `€${trainingPayment.toFixed(2)}`;
  document.getElementById("compDays").textContent = compDays;
  document.getElementById("compPayment").textContent =
    `€${compPayment.toFixed(2)}`;
  document.getElementById("totalKm").textContent = totalKm;
  document.getElementById("kmPayment").textContent =
    `€${kmPayment.toFixed(2)}`;
  document.getElementById("totalPayment").textContent =
    `€${totalPayment.toFixed(2)}`;
}

function clearSummaryFields() {
  document.getElementById("totalHours").textContent = "0";
  document.getElementById("hourlyRate").textContent = "€0.00";
  document.getElementById("trainingPayment").textContent = "€0.00";
  document.getElementById("compDays").textContent = "0";
  document.getElementById("compPayment").textContent = "€0.00";
  document.getElementById("totalKm").textContent = "0";
  document.getElementById("kmPayment").textContent = "€0.00";
  document.getElementById("totalPayment").textContent = "€0.00";
}

function clearCalendarSummary() {
  const calendar = document.getElementById("calendar");
  if (calendar) calendar.innerHTML = "";
  clearSummaryFields();
}

// ===== Export mileage note HTML/PDF (admin) =====
function exportAdminMileageHTML() {
  if (!adminCurrentCoach || !currentMonth) {
    alert("Select a coach and month");
    return;
  }

  const [year, month] = currentMonth.split("-");
  const now = new Date();
  const today = now.toLocaleDateString("fr-FR");
  const time = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const rows = [];
  let total = 0;

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${adminCurrentCoach.id}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(1).join("-");
      const data = timeData[key];
      if (!data.km || data.km <= 0) return;
      const amount = data.km * adminCurrentCoach.kmRate;
      total += amount;
      rows.push({ date, ...data, amount });
    });

  if (total === 0) {
    alert("No mileage recorded for this month.");
    return;
  }

  const logoUrl = "https://judo-coach-tracker.web.app/logo-jcc.png";

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Note de frais kilométrique - ${adminCurrentCoach.name} - ${month}/${year}</title>
<style>
  @media print {
    @page { margin: 1.5cm; }
    body { margin: 0; }
    .no-print { display: none; }
  }
  body {
    font-family: Arial, sans-serif;
    margin: 20px;
    color: #333;
  }
  .header {
    display: flex;
    align-items: center;
    border-bottom: 3px solid #004080;
    padding-bottom: 15px;
    margin-bottom: 20px;
  }
  .header-logo {
    margin-right: 20px;
  }
  .header-logo img {
    height: 80px;
  }
  .header-text {
    color: #004080;
  }
  .header-text h1 {
    margin: 0 0 5px 0;
    font-size: 1.5rem;
    color: #004080;
  }
  .header-text p {
    margin: 2px 0;
    font-size: 0.9rem;
  }
  h2 {
    color: #0066cc;
    margin-top: 20px;
  }
  .info-section {
    background: #f4f8ff;
    padding: 15px;
    border-radius: 5px;
    margin: 15px 0;
  }
  .info-section p {
    margin: 5px 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  th, td {
    border: 1px solid #ddd;
    padding: 10px;
    font-size: 0.9rem;
    text-align: left;
  }
  th {
    background: #004080;
    color: #fff;
    font-weight: bold;
  }
  tr:nth-child(even) {
    background: #f9f9f9;
  }
  tr:hover:not(.total-row) {
    background: #f4f8ff;
  }
  .total-row td {
    font-weight: bold;
    background: #e0ecff;
    font-size: 1rem;
  }
  .note {
    margin-top: 30px;
    padding: 15px;
    background: #fffbf0;
    border-left: 4px solid #ffa500;
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .signature {
    margin-top: 60px;
    display: flex;
    justify-content: space-between;
    page-break-inside: avoid;
  }
  .signature > div {
    width: 45%;
    border-top: 1px solid #333;
    padding-top: 10px;
    text-align: center;
  }
  .print-button {
    margin: 20px 0;
    padding: 10px 20px;
    background: #004080;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 1rem;
  }
  .print-button:hover {
    background: #0066cc;
  }
</style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>

  <div class="header">
    <div class="header-logo">
      <img src="${logoUrl}" alt="Judo Club Cattenom-Rodemack" />
    </div>
    <div class="header-text">
      <h1>Judo Club de Cattenom-Rodemack</h1>
      <p>Association RA1026</p>
      <p>Dojo communautaire – 57570 Cattenom</p>
      <p>📧 judoclubcattenom@gmail.com – 📞 06 62 62 53 13</p>
      <p>Édité le ${today} à ${time}</p>
    </div>
  </div>

  <h2>Note de frais kilométrique</h2>

  <div class="info-section">
    <p><strong>Période :</strong> ${month}/${year}</p>
    <p><strong>Nom et prénom :</strong> ${adminCurrentCoach.name}</p>
    <p><strong>Adresse :</strong> ${adminCurrentCoach.address || "Non renseignée"}</p>
    <p><strong>Poste :</strong> Entraîneur</p>
    <p><strong>Véhicule :</strong> ${adminCurrentCoach.vehicle || "Non renseigné"}</p>
    <p><strong>Puissance fiscale :</strong> ${adminCurrentCoach.fiscalPower || "Non renseignée"} CV</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Motif du trajet</th>
        <th>Lieu de départ</th>
        <th>Lieu d'arrivée</th>
        <th>Distance (km)</th>
        <th>Indemnité/km (€)</th>
        <th>Montant (€)</th>
      </tr>
    </thead>
    <tbody>
${rows
  .map(
    (r) => `
      <tr>
        <td>${r.date}</td>
        <td>${r.description || "Déplacement judo"}</td>
        <td>${r.departurePlace || "-"}</td>
        <td>${r.arrivalPlace || "-"}</td>
        <td style="text-align:right">${r.km}</td>
        <td style="text-align:right">${adminCurrentCoach.kmRate
          .toFixed(2)
          .replace(".", ",")}</td>
        <td style="text-align:right">${r.amount
          .toFixed(2)
          .replace(".", ",")} €</td>
      </tr>`
  )
  .join("")}
      <tr class="total-row">
        <td colspan="6" style="text-align:right">TOTAL TTC</td>
        <td style="text-align:right">${total.toFixed(2).replace(".", ",")} €</td>
      </tr>
    </tbody>
  </table>

  <div class="note">
    <strong>ℹ️ Barème des frais kilométriques :</strong><br>
    Le montant de l'indemnité par kilomètre est fixé selon le nombre de kilomètres parcourus
    et la puissance fiscale du véhicule. Pour le connaître, référez-vous au barème des frais 
    kilométriques établi par l'administration fiscale et l'Urssaf.
  </div>

  <div class="signature">
    <div>
      <strong>Signature du salarié</strong><br><br><br>
      ${adminCurrentCoach.name}
    </div>
    <div>
      <strong>Signature de l'employeur</strong><br><br><br>
      Président du Judo Club
    </div>
  </div>
</body>
</html>
`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `note_frais_km_${adminCurrentCoach.name}_${currentMonth}.html`;
  a.click();

  const newWindow = window.open();
  newWindow.document.write(html);
  newWindow.document.close();
}
