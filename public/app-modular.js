// app-modular.js
// Uses Supabase JS SDK

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ----- Supabase config -----
const supabaseUrl = 'https://ajbpzueanpeukozjhkiv.supabase.co';
const supabaseKey = 'sb_publishable_efac8Xr0Gyfy1J6uFt_X1Q_Z5hB1pe9';
const supabase = createClient(supabaseUrl, supabaseKey);

// ===== In‑memory state =====
let coaches = [];
let timeData = {};
let currentCoach = null;
let currentMonth = "2026-02";
let selectedDay = null;
let editMode = false;
let editingCoachId = null;
let currentUser = null;

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
async function debugSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    console.log('DEBUG Supabase session:', data, error);
  } catch (e) {
    console.error('DEBUG getSession failed:', e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log('DEBUG DOMContentLoaded');
  setupAuthListeners();
  debugSession();
});

// ===== Auth =====
async function isCurrentUserAdminDB() {
  if (!currentUser) return false;
  const { data, error } = await supabase.rpc('is_admin').then(r => console.log('RPC is_admin:', r));
  if (error) {
    console.error('isAdmin RPC error:', error);
    return false;
  }
  return data;
}

function setupAuthListeners() {
  console.log('DEBUG setupAuthListeners called');

  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const registerBtn = document.getElementById("registerBtn");
  const loginBtn = document.getElementById("loginBtn");
  const resetPasswordBtn = document.getElementById("resetPasswordBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const statusSpan = document.getElementById("authStatus");
  const appContainer = document.getElementById("appContainer");

  console.log('DEBUG auth elements:', {
    emailInput,
    passwordInput,
    registerBtn,
    loginBtn,
    resetPasswordBtn,
    logoutBtn,
    statusSpan,
    appContainer
  });

  if (!loginBtn || !logoutBtn) {
    console.error('DEBUG loginBtn or logoutBtn not found in DOM');
  }

  registerBtn.addEventListener("click", async () => {
    console.log('DEBUG register click');
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      alert("Enter email and password");
      return;
    }
    try {
      const { data, error } = await supabase.auth.signUp({ email, password: pass });
      console.log('DEBUG signUp result:', { data, error });
      if (error) throw error;
      statusSpan.textContent = "Account created & logged in.";
    } catch (e) {
      console.error('DEBUG register error:', e);
      alert(e.message);
    }
  });

  loginBtn.addEventListener("click", async () => {
    console.log('DEBUG login click');
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      alert("Enter email and password");
      return;
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      console.log('DEBUG signInWithPassword result:', { data, error });
      if (error) throw error;
    } catch (e) {
      console.error('DEBUG login error:', e);
      alert(e.message);
    }
  });

logoutBtn.addEventListener('click', async () => {
  console.log('DEBUG logout click');
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) console.error('Logout error:', error);
  else {
    currentUser = null;  // Clear global state
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('authRow').style.display = 'block';
    console.log('DEBUG manual UI reset');
  }
});



  // Auth state change
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('DEBUG onAuthStateChange:', event, session);
    const user = session?.user;
    const select = document.getElementById("coachSelect");
    select.innerHTML = '';
    coaches = [];
    timeData = {};
    currentCoach = null;

    if (user) {
      currentUser = user;
      statusSpan.textContent = `Logged in as ${user.email}`;
      document.getElementById("authRow").style.display = "none";
      document.getElementById("registerBtn").style.display = "none";
      document.getElementById("loginBtn").style.display = "none";
      document.getElementById("resetPasswordBtn").style.display = "none";
      logoutBtn.style.display = "inline-block";
      document.getElementById("appContainer").style.display = "block";

      const isAdmin = await isCurrentUserAdminDB();
      if (isAdmin) {
        document.getElementById("addCoachBtn").style.display = "inline-block";
        document.getElementById("editCoachBtn").style.display = "inline-block";
      } else {
        document.getElementById("addCoachBtn").style.display = "none";
        document.getElementById("editCoachBtn").style.display = "none";
      }

      try {
        await loadAllDataFromSupabase();
      } catch (e) {
        console.error("Failed to load data:", e);
      }
      setupEventListeners();
      try {
        updateCalendar();
        updateSummary();
      } catch (e) {
        console.error("Failed to update UI:", e);
      }
    } else {
      currentUser = null;
      statusSpan.textContent = "Not logged in.";
      document.getElementById("authRow").style.display = "block";
      document.getElementById("registerBtn").style.display = "inline-block";
      document.getElementById("loginBtn").style.display = "inline-block";
      document.getElementById("resetPasswordBtn").style.display = "inline-block";
      logoutBtn.style.display = "none";
      document.getElementById("appContainer").style.display = "none";
    }
  });
  

  resetPasswordBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      alert("Enter your email address first.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      alert("Password reset email sent. Check your inbox.");
    } catch (e) {
      alert(e.message);
    }
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('DEBUG onAuthStateChange:', event, session);
    const user = session?.user;
    const select = document.getElementById("coachSelect");
    select.innerHTML = '<option value="">-- Select Coach --</option>';
    coaches = [];
    timeData = {};
    currentCoach = null;

    if (user) {
      currentUser = user;
      statusSpan.textContent = `Logged in as ${user.email}`;
      document.getElementById("authRow").style.display = "none";
      document.getElementById("registerBtn").style.display = "none";
      document.getElementById("loginBtn").style.display = "none";
      document.getElementById("resetPasswordBtn").style.display = "none";
      logoutBtn.style.display = "inline-block";
      document.getElementById("appContainer").style.display = "block";

      // --- VERIFICATION DU ROLE ---
      const isAdmin = await isCurrentUserAdminDB();
      if (isAdmin) {
        document.getElementById("addCoachBtn").style.display = "inline-block";
        document.getElementById("editCoachBtn").style.display = "inline-block";
      } else {
        document.getElementById("addCoachBtn").style.display = "none";
        document.getElementById("editCoachBtn").style.display = "none";
      }

      try {
        await loadAllDataFromSupabase();
      } catch (e) {
        console.error("Failed to load data:", e);
      }
      setupEventListeners();
      try {
        updateCalendar();
        updateSummary();
      } catch (e) {
        console.error("Failed to update UI:", e);
      }
    } else {
      currentUser = null;
      statusSpan.textContent = "Not logged in.";
      document.getElementById("authRow").style.display = "block";
      document.getElementById("registerBtn").style.display = "inline-block";
      document.getElementById("loginBtn").style.display = "inline-block";
      document.getElementById("resetPasswordBtn").style.display = "inline-block";
      logoutBtn.style.display = "none";
      document.getElementById("appContainer").style.display = "none";
    }
  });
}

// ===== Data loading =====
async function loadAllDataFromSupabase() {
  console.log('DEBUG loadAllDataFromSupabase start, isAdmin=', await isCurrentUserAdminDB());
  if (!currentUser) return;
  
  // Coaches
  coaches = [];
  if (await isCurrentUserAdminDB()) {
    const { data, error } = await supabase.from('coaches').select('*');
    if (error) throw error;
    coaches = data.map(d => ({ id: d.id, ...d }));
  } else {
    // For coach, find by email
    const { data, error } = await supabase.from('coaches').select('*').eq('email', currentUser.email);
    if (error) throw error;
    coaches = data.map(d => ({ id: d.id, ...d }));
  }
  loadCoaches();

  // Time data
  timeData = {};
  let timeSnap;

  if (await isCurrentUserAdminDB()) {
    const { data, error } = await supabase.from('time_data').select('*');
    if (error) throw error;
    timeSnap = data;
  } else {
    // For coach, load timeData for their coach
    if (coaches.length > 0) {
      const coachId = coaches[0].id;
      const { data, error } = await supabase.from('time_data').select('*').eq('coach_id', coachId);
      if (error) throw error;
      timeSnap = data;
    } else {
      timeSnap = [];
    }
  }

  timeSnap.forEach((d) => {
    const data = d;
    const key = `${data.coach_id}-${data.date}`;
    timeData[key] = {
      hours: data.hours || 0,
      competition: !!data.competition,
      km: data.km || 0,
      description: data.description || "",
      departurePlace: data.departure_place || "",
      arrivalPlace: data.arrival_place || "",
      peage: data.peage || 0,
      justificationUrl: data.justification_url || "",
      coachId: data.coach_id || null,
      ownerUid: data.owner_uid || null,
      ownerEmail: data.owner_email || null,
      id: d.id
    };
  });

  // Filtre local par coach sélectionné (utile surtout pour l'admin)
  if (currentCoach) {
    Object.keys(timeData).forEach((key) => {
      if (timeData[key].coachId !== currentCoach.id) {
        delete timeData[key];
      }
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
    document.getElementById("coachFirstName").value = currentCoach.first_name || "";
    document.getElementById("coachEmail").value = currentCoach.email || "";
    document.getElementById("coachAddress").value = currentCoach.address || "";
    document.getElementById("coachVehicle").value = currentCoach.vehicle || "";
    document.getElementById("coachFiscalPower").value = currentCoach.fiscal_power || "";
    document.getElementById("coachRate").value = currentCoach.hourly_rate;
    document.getElementById("dailyAllowance").value = currentCoach.daily_allowance;
    document.getElementById("kmRate").value = currentCoach.km_rate;

    document.getElementById("coachModal").classList.add("active");
    document.getElementById("deleteCoach").style.display = "inline-block";
  };

  document.getElementById("saveCoach").onclick = saveCoach;
  document.getElementById("cancelCoach").onclick = () => {
    document.getElementById("coachModal").classList.remove("active");
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
    document.getElementById("deleteCoach").style.display = "none";
  };

  document.getElementById("deleteCoach").onclick = deleteCoach;

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

  document.getElementById("mileageBtn").onclick = exportMileageHTML;
}

// ===== Coach management =====
function clearCoachForm() {
  document.getElementById("coachName").value = "";
  document.getElementById("coachFirstName").value = "";
  document.getElementById("coachEmail").value = "";
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
    option.textContent = `${(coach.first_name ? coach.first_name + ' ' : '') + coach.name}`;
    select.appendChild(option);
  });

  if (!currentCoach && coaches.length === 1) {
    currentCoach = coaches[0];
    select.value = currentCoach.id;
  }

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
  console.log('DEBUG saveCoach start');
  if (!currentUser) {
    console.log('DEBUG saveCoach: no currentUser');
    alert("No logged user");
    return;
  }
  console.log('DEBUG saveCoach currentUser:', currentUser);
  console.log('DEBUG isAdmin:', await isCurrentUserAdminDB());

  if (!await isCurrentUserAdminDB()) {
    console.log('DEBUG saveCoach: not admin');
    alert("Only admin can edit coach profiles.");
    return;
  }
  console.log('DEBUG await isCurrentUserAdminDB():', await isCurrentUserAdminDB());

  const name = document.getElementById("coachName").value.trim();
  const firstName = document.getElementById("coachFirstName").value.trim();
  const email = document.getElementById("coachEmail").value.trim();
  const address = document.getElementById("coachAddress").value.trim();
  const vehicle = document.getElementById("coachVehicle").value.trim();
  const fiscalPower = document.getElementById("coachFiscalPower").value.trim();
  const rate = parseFloat(document.getElementById("coachRate").value);
  const allowance = parseFloat(document.getElementById("dailyAllowance").value);
  const kmRate = parseFloat(document.getElementById("kmRate").value);

  const ownerUidInput = document.getElementById("coachOwnerUid");
  const ownerUid = ownerUidInput ? ownerUidInput.value.trim() : "";

  console.log('DEBUG saveCoach form values:', {
    name,
    firstName,
    email,
    address,
    vehicle,
    fiscalPower,
    rate,
    allowance,
    kmRate,
    ownerUid
  });

  if (!name || isNaN(rate) || isNaN(allowance) || isNaN(kmRate) || !ownerUid) {
    alert("Please fill all required fields with valid numbers AND owner UID");
    return;
  }

  const coachData = {
    name,
    first_name: firstName,
    email,
    address,
    vehicle,
    fiscal_power: fiscalPower,
    hourly_rate: rate,
    daily_allowance: allowance,
    km_rate: kmRate,
    owner_uid: ownerUid
  };

  console.log('DEBUG coachData to send:', coachData, 'editMode:', editMode, 'editingCoachId:', editingCoachId);

  try {
    if (editMode && editingCoachId) {
      const { error } = await supabase
        .from('coaches')
        .update(coachData)
        .eq('id', editingCoachId);
      console.log('DEBUG Supabase UPDATE result error:', error);
      console.log('DEBUG after INSERT before reload');

      if (error) {
        console.error('Supabase UPDATE error:', error);
        alert('Supabase UPDATE error: ' + (error.message || JSON.stringify(error)));
        return;
      }
    } else {
      const { error } = await supabase
        .from('coaches')
        .insert(coachData);
      console.log('DEBUG Supabase INSERT result error:', error);
      if (error) {
        console.error('Supabase INSERT error:', error);
        alert('Supabase INSERT error: ' + (error.message || JSON.stringify(error)));
        return;
      }
    }

    console.log('DEBUG saveCoach: calling loadAllDataFromSupabase');
    await loadAllDataFromSupabase();

    document.getElementById("coachModal").classList.remove("active");
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
    updateSummary();
    console.log('DEBUG saveCoach end OK');
  } catch (e) {
    console.error("Unexpected error saving coach:", e);
    alert("Unexpected error saving coach: " + e.message);
  }
}



async function deleteCoach() {
  if (!currentUser || !await isCurrentUserAdminDB()) {
    alert("Only admin can delete coach profiles.");
    return;
  }
  if (!editingCoachId) return;

  if (!confirm("Are you sure you want to delete this coach? This will also delete all associated time data.")) {
    return;
  }

  try {
    // Delete the coach
    const { error: error1 } = await supabase.from('coaches').delete().eq('id', editingCoachId);
    if (error1) throw error1;

    // Delete all timeData for this coach
    const { error: error2 } = await supabase.from('time_data').delete().eq('coach_id', editingCoachId);
    if (error2) throw error2;

    await loadAllDataFromSupabase();

    currentCoach = null;
    const select = document.getElementById("coachSelect");
    select.value = "";

    document.getElementById("coachModal").classList.remove("active");
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
    updateSummary();
  } catch (e) {
    alert("Error deleting coach: " + e.message);
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
    timeData[key] || {
      hours: 0,
      competition: false,
      km: 0,
      description: "",
      departurePlace: "",
      arrivalPlace: "",
      ownerUid: currentUser ? currentUser.uid : null,
      ownerEmail: currentUser ? currentUser.email : null
    };

  document.getElementById("dayTitle").textContent = `Modifier ${dateStr}`;
  document.getElementById("trainingHours").value = dayData.hours || 0;
  document.getElementById("competitionDay").checked =
    dayData.competition || false;
  document.getElementById("kilometers").value = dayData.km || 0;
  document.getElementById("competitionDescription").value =
    dayData.description || "";
  document.getElementById("departurePlace").value =
    dayData.departurePlace || "";
  document.getElementById("arrivalPlace").value = dayData.arrivalPlace || "";
  document.getElementById("peage").value = dayData.peage || 0;
  document.getElementById("peageJustification").value = "";

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
  const departurePlace = document
    .getElementById("departurePlace")
    .value.trim();
  const arrivalPlace = document.getElementById("arrivalPlace").value.trim();
  const peage = parseFloat(document.getElementById("peage").value) || 0;
  const file = document.getElementById("peageJustification").files[0];

  const key = `${currentCoach.id}-${selectedDay}`;
  const existing = timeData[key];

  let justificationUrl = existing ? existing.justificationUrl || "" : "";

  if (file) {
    try {
      const { data, error } = await supabase.storage.from('justifications').upload(`${currentUser.id}/${selectedDay}_${file.name}`, file);
      if (error) throw error;
      justificationUrl = supabase.storage.from('justifications').getPublicUrl(data.path).data.publicUrl;
    } catch (e) {
      alert("Erreur lors de l'upload du justificatif: " + e.message);
      return; // Don't save if upload fails
    }
  }

  if (hours === 0 && !competition && km === 0 && !description && peage === 0) {
    if (existing && existing.id) {
      const { error } = await supabase.from('time_data').delete().eq('id', existing.id);
      if (error) throw error;
    }
    delete timeData[key];
  } else {
    const data = {
      coach_id: currentCoach.id,
      date: selectedDay,
      hours,
      competition,
      km,
      description,
      departure_place: departurePlace,
      arrival_place: arrivalPlace,
      peage,
      justification_url: justificationUrl,
      owner_uid: currentUser.id,
      owner_email: currentUser.email
    };
    if (existing && existing.id) {
      const { error } = await supabase.from('time_data').update(data).eq('id', existing.id);
      if (error) throw error;
      timeData[key] = {
        hours,
        competition,
        km,
        description,
        departurePlace,
        arrivalPlace,
        peage,
        justificationUrl,
        coachId: currentCoach.id,
        ownerUid: currentUser.id,
        ownerEmail: currentUser.email,
        id: existing.id
      };
    } else {
      const { data: inserted, error } = await supabase.from('time_data').insert(data).select();
      if (error) throw error;
      timeData[key] = {
        hours,
        competition,
        km,
        description,
        departurePlace,
        arrivalPlace,
        peage,
        justificationUrl,
        coachId: currentCoach.id,
        ownerUid: currentUser.id,
        ownerEmail: currentUser.email,
        id: inserted[0].id
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
    const { error } = await supabase.from('time_data').delete().eq('id', existing.id);
    if (error) throw error;
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

  const trainingPayment = totalHours * currentCoach.hourly_rate;
  const compPayment = compDays * currentCoach.daily_allowance;
  const kmPayment = totalKm * currentCoach.km_rate;
  const totalPayment = trainingPayment + compPayment + kmPayment;

  document.getElementById("totalHours").textContent = totalHours.toFixed(1);
  document.getElementById(
    "hourlyRate"
  ).textContent = `€${currentCoach.hourly_rate.toFixed(2)}`;
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
        data.hours * currentCoach.hourly_rate +
        (data.competition ? currentCoach.daily_allowance : 0) +
        data.km * currentCoach.km_rate;
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

function exportMileageHTML() {
  if (!currentCoach || !currentMonth) {
    alert("Please select a coach and month");
    return;
  }
  const [year, month] = currentMonth.split("-");
  const today = new Date().toLocaleDateString("fr-FR");

  const rows = [];
  let total = 0;

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(1).join("-");
      const data = timeData[key];
      if (!data.km || data.km <= 0) return;
      const amount = data.km * currentCoach.km_rate;
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
<title>Note de frais kilométrique - ${currentCoach.name} - ${month}/${year}</title>
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
    </div>
  </div>

  <h2>Note de frais kilométrique</h2>
  
  <div class="info-section">
    <p><strong>Période :</strong> ${month}/${year}</p>
    <p><strong>Date d'édition :</strong> ${today}</p>
    <p><strong>Nom et prénom :</strong> ${currentCoach.name}</p>
    <p><strong>Adresse :</strong> ${currentCoach.address || "Non renseignée"}</p>
    <p><strong>Poste :</strong> Entraîneur</p>
    <p><strong>Véhicule :</strong> ${currentCoach.vehicle || "Non renseigné"}</p>
    <p><strong>Puissance fiscale :</strong> ${currentCoach.fiscal_power || "Non renseignée"} CV</p>
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
        <td style="text-align:right">${currentCoach.km_rate
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
        <td style="text-align:right">${total
          .toFixed(2)
          .replace(".", ",")} €</td>
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
      ${currentCoach.name}
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
  a.download = `note_frais_km_${currentCoach.name}_${currentMonth}.html`;
  a.click();

  const newWindow = window.open();
  newWindow.document.write(html);
  newWindow.document.close();
}

// Expose the function
window.exportMileageHTML = exportMileageHTML;
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

  const inserts = [];

  if (data.heures) {
    Object.entries(data.heures).forEach(([date, hours]) => {
      inserts.push({
        coach_id: currentCoach.id,
        date,
        hours: Number(hours) || 0,
        competition: false,
        km: 0,
        description: "",
        departure_place: "",
        arrival_place: "",
        peage: 0,
        justification_url: "",
        owner_uid: currentUser.id,
        owner_email: currentUser.email
      });
    });
  }

  if (data.manifestations) {
    Object.keys(data.manifestations).forEach((date) => {
      const desc = data.manifestations[date] || "";
      inserts.push({
        coach_id: currentCoach.id,
        date,
        hours: 0,
        competition: true,
        km: 0,
        description: desc,
        departure_place: "",
        arrival_place: "",
        peage: 0,
        justification_url: "",
        owner_uid: currentUser.id,
        owner_email: currentUser.email
      });
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('time_data').insert(inserts);
    if (error) throw error;
  }
  await loadAllDataFromSupabase();
  updateCalendar();
  updateSummary();
  alert("Import completed.");
}

// Optionally expose some functions globally if needed
window.exportToCSV = exportToCSV;
