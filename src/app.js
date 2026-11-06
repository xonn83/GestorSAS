/**
 * Gestor de Cuadrante y Auditor de Jornada SAS (Gerhonte)
 * Motor de Cálculo, Autenticación y Sincronización en la Nube
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  getDocFromServer 
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Acceso universal a motor de generación PDF (jsPDF + autoTable) sin especificadores huérfanos
function getJsPdfClass() {
  if (typeof window !== "undefined") {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
  }
  return null;
}

function applyAutoTable(doc, options) {
  if (typeof doc.autoTable === 'function') {
    return doc.autoTable(options);
  }
  if (typeof window !== "undefined") {
    if (window.jspdf && typeof window.jspdf.autoTable === 'function') {
      return window.jspdf.autoTable(doc, options);
    }
    if (typeof window.autoTable === 'function') {
      return window.autoTable(doc, options);
    }
  }
  console.warn("Plugin autoTable no disponible");
}

// Configuración de Firebase (Firestore y Auth)
const firebaseConfig = {
  projectId: "project-1467a636-3021-45cc-a8a",
  appId: "1:896430339153:web:764be492dae50307bf7470",
  apiKey: "AIzaSyB1um45SuQ9Xu5uZzf9SYU1a-LLnwvLDCo",
  authDomain: "project-1467a636-3021-45cc-a8a.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-sasguardmanager-cf6bc013-557f-485e-9a30-3bda27053de1",
  storageBucket: "project-1467a636-3021-45cc-a8a.firebasestorage.app",
  messagingSenderId: "896430339153"
};

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.warn("Inicialización de Firebase:", e);
}

// Estado Global Limpio para Usuario Real
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();

export const AppState = {
  currentUser: null,
  isLocalMode: false,
  config: {
    workerName: "",
    category: "",
    center: "",
    service: "Servicio Sanitario SAS",
    dni: "",
    startDate: `${currentYear}-01-01`,
    endDate: `${currentYear}-12-31`,
    regime: "rotatorio",
    baseHours: 1483,
    hoursM: 7.0,
    hoursT: 7.0,
    hoursN: 10.0,
    hoursS: 0.0,
    hoursV: 7.0,
    hoursLD: 7.0,
    hoursDCI: 7.0,
    annualVacationDays: 22.0,
    annualLdDays: 6.0,
    proposedDates: ""
  },
  calendarYear: currentYear,
  calendarMonth: currentMonth,
  activeBrush: null,
  calendarShifts: {},
  monthlyTableData: Array.from({ length: 12 }, (_, i) => ({
    month: i,
    mananas: 0,
    tardes: 0,
    noches: 0,
    vacaciones: 0,
    moscosos: 0,
    dciHoras: 0,
    guardias: 0,
    isManual: false
  })),
  activeTab: "calendar",
  simulatedDciDays: 0
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const SHIFT_TYPES = {
  M: { label: "Mañana", code: "M", hours: 7.0, bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  T: { label: "Tarde", code: "T", hours: 7.0, bg: "bg-orange-100", text: "text-orange-900", border: "border-orange-300" },
  N: { label: "Noche", code: "N", hours: 10.0, bg: "bg-indigo-100", text: "text-indigo-900", border: "border-indigo-300" },
  MN: { label: "Mañana + Noche", code: "MN", hours: 17.0, bg: "bg-fuchsia-100", text: "text-fuchsia-950", border: "border-fuchsia-300" },
  S: { label: "Saliente / Libre", code: "S", hours: 0.0, bg: "bg-slate-200", text: "text-slate-800", border: "border-slate-300" },
  V: { label: "Vacaciones", code: "V", hours: 7.0, bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-300" },
  LD: { label: "Moscoso", code: "LD", hours: 7.0, bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-300" },
  DCI: { label: "Día DCI", code: "DCI", hours: -7.0, bg: "bg-cyan-100", text: "text-cyan-900", border: "border-cyan-400" },
  G: { label: "Guardia", code: "G", hours: 0.0, bg: "bg-fuchsia-100", text: "text-fuchsia-900", border: "border-fuchsia-300" }
};

const BRUSH_CONFIG = {
  M: {
    inactiveClasses: ["bg-amber-50", "text-amber-800", "border-amber-200", "hover:bg-amber-100"],
    activeClasses: ["bg-amber-200", "text-amber-950", "border-amber-500", "ring-2", "ring-amber-500", "font-black", "shadow-xs"]
  },
  T: {
    inactiveClasses: ["bg-orange-50", "text-orange-800", "border-orange-200", "hover:bg-orange-100"],
    activeClasses: ["bg-orange-200", "text-orange-950", "border-orange-500", "ring-2", "ring-orange-500", "font-black", "shadow-xs"]
  },
  N: {
    inactiveClasses: ["bg-indigo-50", "text-indigo-800", "border-indigo-200", "hover:bg-indigo-100"],
    activeClasses: ["bg-indigo-200", "text-indigo-950", "border-indigo-500", "ring-2", "ring-indigo-500", "font-black", "shadow-xs"]
  },
  MN: {
    inactiveClasses: ["bg-fuchsia-50", "text-fuchsia-900", "border-fuchsia-200", "hover:bg-fuchsia-100"],
    activeClasses: ["bg-fuchsia-200", "text-fuchsia-950", "border-fuchsia-500", "ring-2", "ring-fuchsia-500", "font-black", "shadow-xs"]
  },
  V: {
    inactiveClasses: ["bg-emerald-50", "text-emerald-800", "border-emerald-200", "hover:bg-emerald-100"],
    activeClasses: ["bg-emerald-200", "text-emerald-950", "border-emerald-500", "ring-2", "ring-emerald-500", "font-black", "shadow-xs"]
  },
  LD: {
    inactiveClasses: ["bg-purple-50", "text-purple-800", "border-purple-200", "hover:bg-purple-100"],
    activeClasses: ["bg-purple-200", "text-purple-950", "border-purple-500", "ring-2", "ring-purple-500", "font-black", "shadow-xs"]
  },
  DCI: {
    inactiveClasses: ["bg-cyan-50", "text-cyan-800", "border-cyan-200", "hover:bg-cyan-100"],
    activeClasses: ["bg-cyan-200", "text-cyan-950", "border-cyan-500", "ring-2", "ring-cyan-500", "font-black", "shadow-xs"]
  },
  CLEAR: {
    inactiveClasses: ["border-rose-200", "text-rose-700", "hover:bg-rose-50"],
    activeClasses: ["bg-rose-200", "text-rose-950", "border-rose-500", "ring-2", "ring-rose-500", "font-black", "shadow-xs"]
  }
};

export function clearActiveBrush() {
  AppState.activeBrush = null;
  document.querySelectorAll(".brush-btn").forEach(btn => {
    const code = btn.dataset.brush;
    const cfg = BRUSH_CONFIG[code];
    if (cfg) {
      btn.classList.remove(...cfg.activeClasses);
      btn.classList.add(...cfg.inactiveClasses);
    }
  });
}

export function setActiveBrush(brushCode) {
  clearActiveBrush();
  AppState.activeBrush = brushCode;
  const btn = document.querySelector(`.brush-btn[data-brush="${brushCode}"]`);
  const cfg = BRUSH_CONFIG[brushCode];
  if (btn && cfg) {
    btn.classList.remove(...cfg.inactiveClasses);
    btn.classList.add(...cfg.activeClasses);
  }
}

export function getShiftDescription(code) {
  if (!code) return "Sin turno";
  if (code === "CLEAR") return "Borrar turno";
  const st = SHIFT_TYPES[code];
  if (!st) return code;
  let hoursText = "";
  if (st.code === "N") {
    const hN = parseFloat(AppState.config.hoursN) || 10.0;
    hoursText = ` (+${hN}h)`;
  } else if (st.code === "MN") {
    const hM = parseFloat(AppState.config.hoursM) || 7.0;
    const hN = parseFloat(AppState.config.hoursN) || 10.0;
    hoursText = ` (+${(hM + hN).toFixed(0)}h)`;
  } else if (st.code === "DCI") {
    const hDCI = parseFloat(AppState.config.hoursDCI) || 7.0;
    hoursText = ` (-${hDCI.toFixed(0)}h)`;
  } else if (st.hours) {
    hoursText = ` (${st.hours > 0 ? '+' : ''}${st.hours}h)`;
  }
  return `[${st.code}] ${st.label}${hoursText}`;
}

// Utilidades
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}
function getDaysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
export function parseISODate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  if (typeof dateStr === "string") {
    const clean = dateStr.trim();
    if (clean.includes("/")) {
      const parts = clean.split("/").map(Number);
      if (parts[2] > 1000) return new Date(parts[2], parts[1] - 1, parts[0]);
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    if (clean.includes("-")) {
      const parts = clean.split("T")[0].split("-").map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  const fallback = new Date(dateStr);
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}
function formatISODate(year, month, day) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function getContractDaysTotal() {
  const start = parseISODate(AppState.config.startDate);
  const end = AppState.config.endDate ? parseISODate(AppState.config.endDate) : new Date(start.getFullYear(), 11, 31);
  if (end < start) return 0;
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

export function getContractRequiredHoursTotal() {
  const totalDays = getContractDaysTotal();
  const start = parseISODate(AppState.config.startDate);
  const yearDays = getDaysInYear(start.getFullYear());
  const baseHours = parseFloat(AppState.config.baseHours) || 1483;
  return Math.round((totalDays / yearDays) * baseHours);
}

export function getMonthActiveContractDays(year, month) {
  if (!AppState.config.startDate) return 0;
  const start = parseISODate(AppState.config.startDate);
  const end = AppState.config.endDate ? parseISODate(AppState.config.endDate) : new Date(year + 5, 11, 31);
  const daysInMonth = getDaysInMonth(year, month);
  let activeCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const current = new Date(year, month, day);
    if (current >= start && current <= end) {
      activeCount++;
    }
  }
  return activeCount;
}

export function getMonthRequiredHours(year, month) {
  const activeDays = getMonthActiveContractDays(year, month);
  if (activeDays === 0) return 0.0;
  const daysInMonth = getDaysInMonth(year, month);
  const baseHours = parseFloat(AppState.config.baseHours) || 1540;
  const monthlyBase = baseHours / 11;
  const monthRatio = daysInMonth > 0 ? (activeDays / daysInMonth) : 0;
  return parseFloat((monthlyBase * monthRatio).toFixed(1));
}

export function isDateInsideContract(dateStr) {
  if (!AppState.config.startDate) return true;
  const d = parseISODate(dateStr);
  const start = parseISODate(AppState.config.startDate);
  const end = AppState.config.endDate ? parseISODate(AppState.config.endDate) : new Date(start.getFullYear() + 5, 11, 31);
  return d >= start && d <= end;
}

export function syncCalendarMonthToTable(month) {
  const year = AppState.calendarYear;
  const row = AppState.monthlyTableData[month];
  if (!row) return;

  const activeDays = getMonthActiveContractDays(year, month);
  if (activeDays === 0) {
    row.mananas = 0;
    row.tardes = 0;
    row.noches = 0;
    row.vacaciones = 0;
    row.moscosos = 0;
    row.dciHoras = 0;
    row.guardias = 0;
    row.isManual = false;
    return;
  }

  const daysInMonth = getDaysInMonth(year, month);
  let mCount = 0, tCount = 0, nCount = 0, vCount = 0, ldCount = 0, dciCount = 0, gCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatISODate(year, month, day);
    if (!isDateInsideContract(dateStr)) continue;
    const shift = AppState.calendarShifts[dateStr];
    if (!shift) continue;
    if (shift === "M") mCount++;
    else if (shift === "T") tCount++;
    else if (shift === "N") nCount++;
    else if (shift === "MN") { mCount++; nCount++; }
    else if (shift === "V") vCount++;
    else if (shift === "LD") ldCount++;
    else if (shift === "DCI") dciCount++;
    else if (shift === "G") gCount += 17;
  }

  row.mananas = mCount;
  row.tardes = tCount;
  row.noches = nCount;
  row.vacaciones = vCount;
  row.moscosos = ldCount;
  row.dciHoras = dciCount * (parseFloat(AppState.config.hoursDCI) || 7.0);
  row.guardias = gCount;
  row.isManual = false;
}

export function syncTableMonthToCalendar(month) {
  const year = AppState.calendarYear;
  const daysInMonth = getDaysInMonth(year, month);
  const row = AppState.monthlyTableData[month];
  if (!row) return;

  // 1. Limpiar turnos de este mes que estén dentro del periodo de contrato
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatISODate(year, month, d);
    if (isDateInsideContract(dateStr)) {
      delete AppState.calendarShifts[dateStr];
    }
  }

  const dciDays = Math.round((row.dciHoras || 0) / (parseFloat(AppState.config.hoursDCI) || 7.0));
  const totalItems = (row.mananas || 0) + (row.tardes || 0) + (row.noches || 0) + (row.vacaciones || 0) + (row.moscosos || 0) + dciDays;
  if (totalItems === 0) return;

  // 2. Obtener lista de días del mes dentro del contrato
  const activeDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatISODate(year, month, d);
    if (isDateInsideContract(dateStr)) {
      const dt = new Date(year, month, d);
      const isWeekend = (dt.getDay() === 0 || dt.getDay() === 6);
      activeDays.push({ day: d, dateStr, isWeekend });
    }
  }

  // A) Vacaciones (V) - En régimen diurno solo días laborables
  let vAssigned = 0;
  for (let i = 0; i < activeDays.length && vAssigned < row.vacaciones; i++) {
    if (AppState.config.regime === "diurno" && activeDays[i].isWeekend) continue;
    if (!AppState.calendarShifts[activeDays[i].dateStr]) {
      AppState.calendarShifts[activeDays[i].dateStr] = "V";
      vAssigned++;
    }
  }

  // B) Moscosos (LD) - En régimen diurno solo días laborables
  let ldAssigned = 0;
  for (let i = 0; i < activeDays.length && ldAssigned < row.moscosos; i++) {
    if (AppState.config.regime === "diurno" && activeDays[i].isWeekend) continue;
    if (!AppState.calendarShifts[activeDays[i].dateStr]) {
      AppState.calendarShifts[activeDays[i].dateStr] = "LD";
      ldAssigned++;
    }
  }

  // C) Días DCI - En régimen diurno solo días laborables
  let dciAssigned = 0;
  for (let i = 0; i < activeDays.length && dciAssigned < dciDays; i++) {
    if (AppState.config.regime === "diurno" && activeDays[i].isWeekend) continue;
    if (!AppState.calendarShifts[activeDays[i].dateStr]) {
      AppState.calendarShifts[activeDays[i].dateStr] = "DCI";
      dciAssigned++;
    }
  }

  // D) Noches (N)
  let nAssigned = 0;
  for (let i = 0; i < activeDays.length && nAssigned < row.noches; i += 2) {
    const dStr = activeDays[i].dateStr;
    if (!AppState.calendarShifts[dStr]) {
      AppState.calendarShifts[dStr] = "N";
      nAssigned++;
    }
  }

  // E) Tardes (T) en días aún vacíos
  let tAssigned = 0;
  for (let i = 0; i < activeDays.length && tAssigned < row.tardes; i++) {
    const dStr = activeDays[i].dateStr;
    if (!AppState.calendarShifts[dStr]) {
      AppState.calendarShifts[dStr] = "T";
      tAssigned++;
    }
  }

  // F) Mañanas (M) en días aún vacíos
  let mAssigned = 0;
  for (let i = 0; i < activeDays.length && mAssigned < row.mananas; i++) {
    const dStr = activeDays[i].dateStr;
    if (!AppState.calendarShifts[dStr]) {
      AppState.calendarShifts[dStr] = "M";
      mAssigned++;
    }
  }
}

export function ensureTwoWaySync() {
  const year = AppState.calendarYear;
  for (let m = 0; m < 12; m++) {
    const row = AppState.monthlyTableData[m];
    if (!row) continue;
    const activeDays = getMonthActiveContractDays(year, m);
    if (activeDays === 0) {
      row.mananas = 0;
      row.tardes = 0;
      row.noches = 0;
      row.vacaciones = 0;
      row.moscosos = 0;
      row.dciHoras = 0;
      row.guardias = 0;
      row.isManual = false;
      continue;
    }
    const daysInMonth = getDaysInMonth(year, m);
    let mCount = 0, tCount = 0, nCount = 0, vCount = 0, ldCount = 0, dciCount = 0;
    
    for (let d = 1; d <= daysInMonth; d++) {
      const shift = AppState.calendarShifts[formatISODate(year, m, d)];
      if (shift === "M") mCount++;
      else if (shift === "T") tCount++;
      else if (shift === "N") nCount++;
      else if (shift === "MN") { mCount++; nCount++; }
      else if (shift === "V") vCount++;
      else if (shift === "LD") ldCount++;
      else if (shift === "DCI") dciCount++;
    }

    const tableTotal = (row.mananas || 0) + (row.tardes || 0) + (row.noches || 0) + 
                       (row.vacaciones || 0) + (row.moscosos || 0) + Math.round((row.dciHoras || 0) / 7);
    const calTotal = mCount + tCount + nCount + vCount + ldCount + dciCount;

    // Si la tabla tiene datos pero el calendario está vacío o incompleto
    if (tableTotal > 0 && calTotal === 0) {
      syncTableMonthToCalendar(m);
    } else if (tableTotal > 0 && calTotal < tableTotal && (mCount === 0 && row.mananas > 0)) {
      syncTableMonthToCalendar(m);
    } else if (calTotal > 0 && tableTotal === 0) {
      syncCalendarMonthToTable(m);
    }
  }
}

export function getMonthActualHours(month) {
  const activeDays = getMonthActiveContractDays(AppState.calendarYear, month);
  if (activeDays === 0) return 0.0;
  const row = AppState.monthlyTableData[month];
  if (!row) return 0.0;
  const hM = parseFloat(AppState.config.hoursM) || 7.0;
  const hT = parseFloat(AppState.config.hoursT) || 7.0;
  const hN = parseFloat(AppState.config.hoursN) || 10.0;
  const hV = parseFloat(AppState.config.hoursV) || 7.0;
  const hLD = parseFloat(AppState.config.hoursLD) || 7.0;

  const effective = (row.mananas * hM) +
                    (row.tardes * hT) +
                    (row.noches * hN) +
                    (row.vacaciones * hV) +
                    (row.moscosos * hLD) -
                    (row.dciHoras);
  
  return parseFloat(effective.toFixed(1));
}

// -------------------------------------------------------------
// PERSISTENCIA EN NUBE (PLAN SPARK GRATUITO) Y LOCAL
// -------------------------------------------------------------
let debounceSaveTimeout = null;

export function triggerSave() {
  // Siempre guarda en localStorage de forma inmediata
  try {
    const localKey = AppState.currentUser ? `sas_jornada_${AppState.currentUser.uid}` : "sas_jornada_local";
    localStorage.setItem(localKey, JSON.stringify({
      config: AppState.config,
      calendarShifts: AppState.calendarShifts,
      monthlyTableData: AppState.monthlyTableData,
      calendarYear: AppState.calendarYear
    }));
  } catch (e) {
    console.warn("Storage warning:", e);
  }

  // Si hay usuario en la nube, sincroniza en Firestore
  if (AppState.currentUser && db && !AppState.isLocalMode) {
    const statusEl = document.getElementById("cloud-status-text");
    if (statusEl) statusEl.textContent = "Nube: Guardando...";

    if (debounceSaveTimeout) clearTimeout(debounceSaveTimeout);
    debounceSaveTimeout = setTimeout(async () => {
      try {
        const uid = AppState.currentUser.uid;
        await setDoc(doc(db, "users", uid), {
          userId: uid,
          email: AppState.currentUser.email || "",
          workerName: AppState.config.workerName,
          category: AppState.config.category,
          center: AppState.config.center,
          service: AppState.config.service || "",
          dni: AppState.config.dni || "",
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await setDoc(doc(db, "users", uid, "data", "cuadrante"), {
          userId: uid,
          startDate: AppState.config.startDate,
          endDate: AppState.config.endDate,
          regime: AppState.config.regime,
          baseHours: parseFloat(AppState.config.baseHours) || 1483,
          hoursM: parseFloat(AppState.config.hoursM) || 7.0,
          hoursT: parseFloat(AppState.config.hoursT) || 7.0,
          hoursN: parseFloat(AppState.config.hoursN) || 10.0,
          hoursS: 0.0,
          hoursV: parseFloat(AppState.config.hoursV) || 7.0,
          hoursLD: parseFloat(AppState.config.hoursLD) || 7.0,
          hoursDCI: parseFloat(AppState.config.hoursDCI) || 7.0,
          proposedDates: AppState.config.proposedDates || "",
          calendarShifts: AppState.calendarShifts || {},
          monthlyTableData: AppState.monthlyTableData,
          calendarYear: AppState.calendarYear,
          updatedAt: new Date().toISOString()
        });

        if (statusEl) statusEl.textContent = "Nube: Sincronizado";
      } catch (err) {
        console.warn("Firestore save fallback to local:", err);
        if (statusEl) statusEl.textContent = "Modo: Local Activo";
      }
    }, 600);
  }
}

export async function loadUserData(user) {
  const statusEl = document.getElementById("cloud-status-text");
  
  if (!user) {
    return;
  }

  if (statusEl) statusEl.textContent = "Nube: Conectando...";

  try {
    const uid = user.uid;
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const uData = userDocSnap.data();
      if (uData.workerName) AppState.config.workerName = uData.workerName;
      if (uData.category) AppState.config.category = uData.category;
      if (uData.center) AppState.config.center = uData.center;
      if (uData.service) AppState.config.service = uData.service;
      if (uData.dni) AppState.config.dni = uData.dni;
    }

    const cuadranteRef = doc(db, "users", uid, "data", "cuadrante");
    const cuadranteSnap = await getDoc(cuadranteRef);
    if (cuadranteSnap.exists()) {
      const cData = cuadranteSnap.data();
      if (cData.startDate) AppState.config.startDate = cData.startDate;
      if (cData.endDate) AppState.config.endDate = cData.endDate;
      if (cData.regime) AppState.config.regime = cData.regime;
      if (cData.baseHours) AppState.config.baseHours = cData.baseHours;
      if (cData.calendarShifts) AppState.calendarShifts = cData.calendarShifts;
      if (cData.monthlyTableData) AppState.monthlyTableData = cData.monthlyTableData;
      if (cData.calendarYear) AppState.calendarYear = cData.calendarYear;
      if (cData.proposedDates) AppState.config.proposedDates = cData.proposedDates;
    } else {
      // Nuevo usuario registrado: cuadrante limpio listo para su uso
      AppState.calendarShifts = {};
      AppState.monthlyTableData = Array.from({ length: 12 }, (_, i) => ({
        month: i,
        mananas: 0,
        tardes: 0,
        noches: 0,
        vacaciones: 0,
        moscosos: 0,
        dciHoras: 0,
        guardias: 0,
        isManual: false
      }));
      triggerSave();
    }

    syncConfigInputsFromState();
    updateAll();
    if (statusEl) statusEl.textContent = "Nube: Sincronizado";
    showToast(`¡Sesión activa! Bienvenido/a ${AppState.config.workerName || user.email}`, "success");
  } catch (err) {
    console.warn("Firestore load error:", err);
    // Recupera del caché local si está disponible
    const localKey = `sas_jornada_${user.uid}`;
    const raw = localStorage.getItem(localKey);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.config) Object.assign(AppState.config, data.config);
        if (data.calendarShifts) AppState.calendarShifts = data.calendarShifts;
        if (data.monthlyTableData) AppState.monthlyTableData = data.monthlyTableData;
      } catch (e) {
        console.warn(e);
      }
    }
    syncConfigInputsFromState();
    updateAll();
    if (statusEl) statusEl.textContent = "Nube: Conectado (Offline)";
  }
}

export function syncYearDropdown() {
  const yearInput = document.getElementById("header-input-year") || document.getElementById("header-select-year");
  if (yearInput) {
    yearInput.value = AppState.calendarYear;
  }
  const calYearDisp = document.getElementById("cal-year-display");
  if (calYearDisp) calYearDisp.textContent = AppState.calendarYear;

  const tableYearDisp = document.getElementById("table-year-display");
  if (tableYearDisp) tableYearDisp.textContent = AppState.calendarYear;
}

// -------------------------------------------------------------
// RENDERIZADO Y ACTUALIZACIÓN DE LA UI
// -------------------------------------------------------------
export function updateAll(skipTableRebuild = false) {
  syncYearDropdown();
  ensureTwoWaySync();
  renderKpis();
  renderCalendar();
  if (!skipTableRebuild) {
    renderTable();
  } else {
    updateTableComputedCells();
  }
  renderRequestLetter();
  triggerSave();
}

export function getAccumulatedMetrics() {
  const year = AppState.calendarYear;
  const yearDays = getDaysInYear(year);
  const totalContractReq = getContractRequiredHoursTotal();
  const contractDays = getContractDaysTotal();

  const hM = parseFloat(AppState.config.hoursM) || 7.0;
  const hT = parseFloat(AppState.config.hoursT) || 7.0;
  const hN = parseFloat(AppState.config.hoursN) || 10.0;
  const hV = parseFloat(AppState.config.hoursV) || 7.0;
  const hLD = parseFloat(AppState.config.hoursLD) || 7.0;
  const hDCI = parseFloat(AppState.config.hoursDCI) || 7.0;

  // 1. Bolsas Estatutarias de Vacaciones y Asuntos Propios (LD) según Nombramiento
  // Por defecto en SAS: 22 días laborables de vacaciones y 6 días de LD al año.
  // Proporcional a días de contrato con redondeo SAS:
  // - Vacaciones a fracciones de 0,5 al alza (Math.ceil(val * 2) / 2)
  // - LD proporcionales (para 269 días de 365, da 4.42 -> 5 días según criterio 6 * 9/12 = 4.5 -> 5)
  const annualBaseVac = parseFloat(AppState.config.annualVacationDays) || 22.0;
  const annualBaseLd = parseFloat(AppState.config.annualLdDays) || 6.0;

  let totalVacationDays = annualBaseVac;
  let totalLdDays = annualBaseLd;
  if (contractDays < yearDays && yearDays > 0) {
    totalVacationDays = Math.ceil(((annualBaseVac * contractDays) / yearDays) * 2) / 2;
    totalLdDays = Math.ceil((annualBaseLd * contractDays) / yearDays);
  }

  let totalActiveDaysInYear = 0;
  let totalWorkedAllYear = 0;
  let totalPresentialHours = 0;
  let totalPermitHours = 0;
  let totalDciConsumedHours = 0;
  let totalVacationConsumedDays = 0;
  let totalLdConsumedDays = 0;

  let filledMonthsCount = 0;
  let lastFilledMonth = -1;
  let workedInFilledMonths = 0;
  let requiredInFilledMonths = 0;
  let presentialInFilledMonths = 0;
  let permitsInFilledMonths = 0;

  AppState.monthlyTableData.forEach((row, m) => {
    const actDays = getMonthActiveContractDays(year, m);
    totalActiveDaysInYear += actDays;

    const mCount = row.mananas || 0;
    const tCount = row.tardes || 0;
    const nCount = row.noches || 0;
    const vCount = row.vacaciones || 0;
    const ldCount = row.moscosos || 0;
    const dciH = row.dciHoras || 0;

    const presHours = (mCount * hM) + (tCount * hT) + (nCount * hN);
    const permHours = (vCount * hV) + (ldCount * hLD);
    const effHours = presHours + permHours - dciH;

    totalWorkedAllYear += effHours;
    totalPresentialHours += presHours;
    totalPermitHours += permHours;
    totalDciConsumedHours += dciH;
    totalVacationConsumedDays += vCount;
    totalLdConsumedDays += ldCount;

    const hasShifts = (
      mCount > 0 || tCount > 0 || nCount > 0 ||
      vCount > 0 || ldCount > 0 || dciH !== 0
    );

    if (actDays > 0 && hasShifts) {
      filledMonthsCount++;
      lastFilledMonth = m;
      workedInFilledMonths += effHours;
      requiredInFilledMonths += getMonthRequiredHours(year, m);
      presentialInFilledMonths += presHours;
      permitsInFilledMonths += permHours;
    }
  });

  // Saldo General Acumulado en meses auditados:
  // Horas efectivas realizadas menos horas exigibles en los meses con registros.
  const rawAccumulatedBalance = filledMonthsCount > 0
    ? parseFloat((workedInFilledMonths - requiredInFilledMonths).toFixed(1))
    : 0.0;
  const accumulatedBalance = Math.abs(rawAccumulatedBalance) < 0.05 ? 0.0 : rawAccumulatedBalance;

  // Bolsa DCI (Exceso Real):
  // El exceso real consolidado coincide exactamente con el saldo neto acumulado positivo.
  const dciNetHours = accumulatedBalance > 0 ? accumulatedBalance : 0.0;
  const dciDaysAvailable = Math.floor(dciNetHours / hDCI);
  const dciRemainderHours = parseFloat((dciNetHours % hDCI).toFixed(1));
  const dciExactDays = parseFloat((dciNetHours / hDCI).toFixed(1));
  const totalDciConsumedDays = Math.round(totalDciConsumedHours / hDCI);

  // Bolsa Vacaciones
  const remainingVacationDays = Math.max(0, parseFloat((totalVacationDays - totalVacationConsumedDays).toFixed(1)));

  // Bolsa Asuntos Propios (LD)
  const remainingLdDays = Math.max(0, Math.round(totalLdDays - totalLdConsumedDays));

  // Progreso real de horas sobre la jornada anual
  const progressPercent = totalContractReq > 0
    ? Math.min(100, Math.round((totalWorkedAllYear / totalContractReq) * 100))
    : 0;

  const remainingHoursAnnual = Math.max(0, parseFloat((totalContractReq - totalWorkedAllYear).toFixed(1)));
  const remainingShifts = Math.ceil(remainingHoursAnnual / hM);

  return {
    year,
    yearDays,
    contractDays,
    totalContractReq,
    totalActiveDaysInYear,
    totalWorkedAllYear,
    totalPresentialHours,
    totalPermitHours,
    totalDciConsumedHours,
    totalDciConsumedDays,
    filledMonthsCount,
    lastFilledMonth,
    lastFilledMonthName: lastFilledMonth >= 0 ? MONTH_NAMES[lastFilledMonth] : null,
    workedInFilledMonths,
    requiredInFilledMonths,
    presentialInFilledMonths,
    permitsInFilledMonths,
    accumulatedBalance,
    // Bolsa DCI (Exceso Real)
    dciNetHours,
    dciDaysAvailable,
    dciDays: dciDaysAvailable, // Alias para compatibilidad con Tab 3 y Tab 4
    dciRemainderHours,
    dciExactDays,
    // Bolsa Vacaciones
    totalVacationDays,
    totalVacationConsumedDays,
    remainingVacationDays,
    // Bolsa LD
    totalLdDays,
    totalLdConsumedDays,
    remainingLdDays,
    // Progreso
    progressPercent,
    remainingHoursAnnual,
    remainingShifts
  };
}

function renderKpis() {
  const metrics = getAccumulatedMetrics();

  // -------------------------------------------------------------
  // TARJETA 1: Saldo Bolsa (General acumulado a meses rellenados)
  // -------------------------------------------------------------
  const balanceEl = document.getElementById("kpi-balance");
  const balanceLabel = document.getElementById("kpi-balance-label");
  const balanceBadge = document.getElementById("kpi-balance-badge");
  const balanceSub = document.getElementById("kpi-balance-sub");

  if (balanceBadge) {
    balanceBadge.className = "hidden";
  }

  if (balanceEl) {
    const sign = metrics.accumulatedBalance > 0 ? "+" : "";
    balanceEl.textContent = `${sign}${metrics.accumulatedBalance.toLocaleString("es-ES", { minimumFractionDigits: 1 })} h`;

    if (metrics.filledMonthsCount === 0) {
      balanceEl.className = "text-xl sm:text-3xl font-black text-slate-700 tracking-tight font-mono block";
      if (balanceLabel) balanceLabel.textContent = "Sin registros aún";
      if (balanceSub) balanceSub.textContent = `0,0h de ${metrics.totalContractReq.toFixed(0)}h anuales`;
    } else {
      if (metrics.accumulatedBalance > 0) {
        balanceEl.className = "text-xl sm:text-3xl font-black text-emerald-600 tracking-tight font-mono block";
        if (balanceLabel) balanceLabel.textContent = `Exceso hasta ${metrics.lastFilledMonthName}`;
        const dciLabel = metrics.dciDaysAvailable === 1 ? "1 d DCI disponible" : `${metrics.dciDaysAvailable} d DCI disponibles`;
        if (balanceSub) balanceSub.textContent = `+${metrics.accumulatedBalance.toFixed(1)}h acumuladas (${dciLabel})`;
      } else if (metrics.accumulatedBalance < 0) {
        balanceEl.className = "text-xl sm:text-3xl font-black text-rose-600 tracking-tight font-mono block";
        if (balanceLabel) balanceLabel.textContent = `Déficit hasta ${metrics.lastFilledMonthName}`;
        if (balanceSub) balanceSub.textContent = `Faltan ${Math.abs(metrics.accumulatedBalance).toFixed(1)}h para completar la jornada ordinaria`;
      } else {
        balanceEl.className = "text-xl sm:text-3xl font-black text-slate-800 tracking-tight font-mono block";
        if (balanceLabel) balanceLabel.textContent = `Al día hasta ${metrics.lastFilledMonthName}`;
        if (balanceSub) balanceSub.textContent = `${metrics.workedInFilledMonths.toFixed(1)}h realizadas (Jornada ordinaria al día)`;
      }
    }
  }

  // -------------------------------------------------------------
  // TARJETA 2: Bolsa DCI (Exceso Real)
  // -------------------------------------------------------------
  const dciHoursEl = document.getElementById("kpi-dci-hours");
  const dciDaysEl = document.getElementById("kpi-dci-days");
  const dciLabelEl = document.getElementById("kpi-dci-label");
  const dciBadgeEl = document.getElementById("kpi-dci-badge");
  const dciSubEl = document.getElementById("kpi-dci-sub");

  if (dciBadgeEl) {
    dciBadgeEl.className = "hidden";
  }

  if (dciHoursEl) {
    const signDci = metrics.dciDaysAvailable > 0 ? "+" : "";
    const dayWord = metrics.dciDaysAvailable === 1 ? "Día" : "Días";
    dciHoursEl.textContent = `${signDci}${metrics.dciDaysAvailable} ${dayWord}`;
  }
  if (dciDaysEl) {
    const dayWord = metrics.dciDaysAvailable === 1 ? "Día" : "Días";
    dciDaysEl.textContent = `${metrics.dciDaysAvailable} ${dayWord}`;
  }
  if (dciLabelEl) {
    if (metrics.dciNetHours > 0) {
      dciLabelEl.innerHTML = `<span class="font-bold text-cyan-800">+${metrics.dciNetHours.toFixed(1)} h netas</span> (+${metrics.dciRemainderHours}h remanente)`;
    } else {
      dciLabelEl.textContent = metrics.filledMonthsCount > 0 ? "Sin exceso de jornada acumulado" : "0 días libres disponibles (÷ 7h)";
    }
  }
  if (dciSubEl) {
    dciSubEl.textContent = `${metrics.totalDciConsumedDays} d DCI disfrutados en cuadrante (${metrics.totalDciConsumedHours.toFixed(1)}h)`;
  }

  // -------------------------------------------------------------
  // TARJETA 3: Bolsa Vacaciones
  // -------------------------------------------------------------
  const vacValueEl = document.getElementById("kpi-vac-value");
  const vacLabelEl = document.getElementById("kpi-vac-label");
  const vacBadgeEl = document.getElementById("kpi-vac-badge");
  const vacSubEl = document.getElementById("kpi-vac-sub");

  if (vacBadgeEl) {
    vacBadgeEl.className = "hidden";
  }

  if (vacValueEl) {
    vacValueEl.textContent = `${metrics.remainingVacationDays} / ${metrics.totalVacationDays} días`;
  }
  if (vacLabelEl) {
    vacLabelEl.textContent = "";
  }
  if (vacSubEl) {
    vacSubEl.textContent = metrics.lastFilledMonthName ? `(a ${metrics.lastFilledMonthName})` : "(anual)";
  }

  // -------------------------------------------------------------
  // TARJETA 4: Moscosos (Asuntos Propios / LD)
  // -------------------------------------------------------------
  const ldValueEl = document.getElementById("kpi-ld-value");
  const ldLabelEl = document.getElementById("kpi-ld-label");
  const ldBadgeEl = document.getElementById("kpi-ld-badge");
  const ldSubEl = document.getElementById("kpi-ld-sub");

  if (ldBadgeEl) {
    ldBadgeEl.className = "hidden";
  }

  if (ldValueEl) {
    ldValueEl.textContent = `${metrics.remainingLdDays} / ${metrics.totalLdDays} días`;
  }
  if (ldLabelEl) {
    ldLabelEl.textContent = "";
  }
  if (ldSubEl) {
    ldSubEl.textContent = "";
  }
}

function renderCalendar() {
  ensureTwoWaySync();
  const year = AppState.calendarYear;
  const month = AppState.calendarMonth;
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  grid.innerHTML = "";

  document.getElementById("cal-select-month").value = month;
  document.getElementById("cal-year-display").textContent = year;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const startOffset = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
  const daysInCurrentMonth = getDaysInMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month - 1);

  for (let i = startOffset - 1; i >= 0; i--) {
    const prevDay = daysInPrevMonth - i;
    const cell = document.createElement("div");
    cell.className = "min-h-[76px] sm:min-h-[88px] bg-slate-50/70 p-1.5 opacity-40 select-none cursor-not-allowed";
    cell.innerHTML = `<span class="text-xs font-semibold text-slate-400">${prevDay}</span>`;
    grid.appendChild(cell);
  }

  let mCount = 0, tCount = 0, nCount = 0, mnCount = 0, vCount = 0, ldCount = 0, dciCount = 0, gCount = 0;

  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const dateStr = formatISODate(year, month, day);
    const inContract = isDateInsideContract(dateStr);
    const shiftCode = AppState.calendarShifts[dateStr];

    if (shiftCode) {
      if (shiftCode === "M") mCount++;
      else if (shiftCode === "T") tCount++;
      else if (shiftCode === "N") nCount++;
      else if (shiftCode === "MN") { mnCount++; mCount++; nCount++; }
      else if (shiftCode === "V") vCount++;
      else if (shiftCode === "LD") ldCount++;
      else if (shiftCode === "DCI") dciCount++;
      else if (shiftCode === "G") gCount++;
    }

    const cell = document.createElement("div");
    const isWeekend = (new Date(year, month, day).getDay() === 0 || new Date(year, month, day).getDay() === 6);

    let cellClass = "min-h-[50px] sm:min-h-[82px] p-1 sm:p-1.5 flex flex-col justify-between transition-colors relative group select-none rounded-lg border ";
    if (!inContract) {
      cellClass += "bg-slate-100/90 text-slate-400 cursor-not-allowed border-dashed border-slate-200 ";
    } else {
      cellClass += isWeekend ? "bg-amber-50/20 hover:bg-emerald-50/40 cursor-pointer border-amber-200/60 " : "bg-white hover:bg-emerald-50/40 cursor-pointer border-slate-200 ";
    }
    cell.className = cellClass;
    cell.dataset.date = dateStr;

    let topHtml = `<div class="flex items-center justify-between">
      <span class="text-[11px] sm:text-xs font-bold ${isWeekend ? 'text-rose-600' : 'text-slate-700'}">${day}</span>`;
    
    if (!inContract) {
      topHtml += `<span class="text-[8px] sm:text-[9px] font-semibold text-slate-400 bg-slate-200/60 px-1 rounded hidden sm:inline">No contrat.</span>`;
    }
    topHtml += `</div>`;

    let shiftHtml = "";
    if (shiftCode && SHIFT_TYPES[shiftCode]) {
      const st = SHIFT_TYPES[shiftCode];
      let hoursLabel = `${st.hours > 0 ? '+' : ''}${st.hours}h`;
      if (st.code === "N") {
        const hN = parseFloat(AppState.config.hoursN) || 10.0;
        hoursLabel = `+${hN}h`;
      } else if (st.code === "MN") {
        const hM = parseFloat(AppState.config.hoursM) || 7.0;
        const hN = parseFloat(AppState.config.hoursN) || 10.0;
        hoursLabel = `+${(hM + hN).toFixed(0)}h`;
      } else if (st.code === "DCI") {
        const hDCI = parseFloat(AppState.config.hoursDCI) || 7.0;
        hoursLabel = `-${hDCI}h`;
      } else if (st.code === "G") {
        hoursLabel = "Guardia";
      }

      shiftHtml = `
        <div class="mt-0.5 sm:mt-1 py-0.5 sm:py-1 px-1 rounded sm:rounded-md ${st.bg} ${st.text} border ${st.border} flex items-center justify-center sm:justify-between shadow-2xs text-center">
          <span class="font-black text-[11px] sm:text-xs tracking-tight">${st.code}</span>
          <span class="text-[10px] font-mono font-bold hidden sm:inline ml-1">${hoursLabel}</span>
        </div>
      `;
    } else if (inContract) {
      shiftHtml = `
        <div class="mt-0.5 sm:mt-1 h-5 sm:h-6 rounded border border-transparent group-hover:border-slate-300 group-hover:bg-slate-50 flex items-center justify-center text-[9px] sm:text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
          +
        </div>
      `;
    }

    cell.innerHTML = topHtml + shiftHtml;

    if (inContract) {
      cell.addEventListener("click", () => {
        applyBrushToDate(dateStr);
      });
    } else {
      cell.addEventListener("click", () => {
        showToast("Este día cae fuera de las fechas de tu nombramiento", "info");
      });
    }

    grid.appendChild(cell);
  }

  const totalRendered = startOffset + daysInCurrentMonth;
  const remainder = totalRendered % 7;
  if (remainder !== 0) {
    const trailingDays = 7 - remainder;
    for (let i = 1; i <= trailingDays; i++) {
      const cell = document.createElement("div");
      cell.className = "min-h-[76px] sm:min-h-[88px] bg-slate-50/70 p-1.5 opacity-40 select-none cursor-not-allowed";
      cell.innerHTML = `<span class="text-xs font-semibold text-slate-400">${i}</span>`;
      grid.appendChild(cell);
    }
  }

  const monthReq = getMonthRequiredHours(year, month);
  const monthAct = getMonthActualHours(month);
  const monthBal = parseFloat((monthAct - monthReq).toFixed(1));
  const sign = monthBal > 0.05 ? "+" : "";

  document.getElementById("cal-month-worked").textContent = `${monthAct.toFixed(1).replace(".", ",")} h`;
  document.getElementById("cal-month-required").textContent = `${monthReq.toFixed(1).replace(".", ",")} h`;
  const balEl = document.getElementById("cal-month-balance");
  balEl.textContent = `${sign}${monthBal.toFixed(1).replace(".", ",")} h`;
  balEl.className = monthBal > 0.05
    ? "font-black font-mono text-emerald-600"
    : (monthBal < -0.05 ? "font-black font-mono text-rose-600" : "font-black font-mono text-slate-800");

  const breakdownEl = document.getElementById("cal-month-breakdown");
  if (breakdownEl) {
    breakdownEl.innerHTML = "";
    breakdownEl.className = "hidden";
  }
}

function applyBrushToDate(dateStr) {
  if (!isDateInsideContract(dateStr)) return;

  // 1. Si no hay ningún turno seleccionado, evitar cualquier modificación por descuido y avisar al usuario
  if (!AppState.activeBrush) {
    showToast("Selecciona primero un turno o la opción Borrar en la botonera superior", "info");
    return;
  }

  const d = parseISODate(dateStr);
  const dayOfWeek = d.getDay(); // 0 = Domingo, 6 = Sábado
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  const currentShift = AppState.calendarShifts[dateStr];

  // 2. Validación: En régimen diurno (L-V), no se pueden asignar vacaciones ni permisos en días no laborables
  if (AppState.config.regime === "diurno" && isWeekend) {
    if (AppState.activeBrush === "V") {
      showToast("En régimen diurno (L-V), los sábados y domingos no son laborables. Las vacaciones no pueden registrarse en fines de semana.", "warning");
      return;
    }
    if (AppState.activeBrush === "LD") {
      showToast("En régimen diurno (L-V), los días de asuntos propios (LD) deben disfrutarse en días laborables ordinarios.", "warning");
      return;
    }
    if (AppState.activeBrush === "DCI") {
      showToast("En régimen diurno (L-V), los descansos DCI deben aplicarse en jornadas laborales ordinarias.", "warning");
      return;
    }
  }

  const dateFormatted = `${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;

  // 3. Caso: Borrar turno (CLEAR)
  if (AppState.activeBrush === "CLEAR") {
    if (!currentShift) {
      showToast(`El día ${dateFormatted} ya está libre (sin turno asignado)`, "info");
      return;
    }

    const oldDesc = getShiftDescription(currentShift);
    showModal(
      "¿Borrar turno registrado?",
      `El día <strong>${dateFormatted}</strong> tiene asignado un turno de <strong>${oldDesc}</strong>.<br><br>¿Deseas eliminar este turno y dejar el día libre?`,
      () => {
        delete AppState.calendarShifts[dateStr];
        syncCalendarMonthToTable(d.getMonth());
        updateAll();
        showToast(`Turno del ${dateFormatted} borrado correctamente`, "info");
      },
      {
        confirmText: "Borrar turno",
        cancelText: "Cancelar",
        confirmClass: "bg-rose-600 hover:bg-rose-700",
        iconClass: "text-rose-600"
      }
    );
    return;
  }

  // 4. Caso: Mismo turno ya registrado en esa fecha
  if (currentShift === AppState.activeBrush) {
    return;
  }

  // 5. Caso: Sobreescribir una casilla que ya tiene OTRO turno previamente grabado
  if (currentShift && currentShift !== AppState.activeBrush) {
    const oldDesc = getShiftDescription(currentShift);
    const newDesc = getShiftDescription(AppState.activeBrush);

    showModal(
      "¿Cambiar turno del día?",
      `El día <strong>${dateFormatted}</strong> ya tiene asignado un turno de <strong>${oldDesc}</strong>.<br><br>¿Deseas sustituirlo por el turno de <strong>${newDesc}</strong>?`,
      () => {
        AppState.calendarShifts[dateStr] = AppState.activeBrush;
        syncCalendarMonthToTable(d.getMonth());
        updateAll();
        showToast(`Turno del ${dateFormatted} actualizado a [${AppState.activeBrush}]`, "success");
      },
      {
        confirmText: "Cambiar turno",
        cancelText: "Cancelar",
        confirmClass: "bg-amber-600 hover:bg-amber-700",
        iconClass: "text-amber-600"
      }
    );
    return;
  }

  // 6. Caso: Casilla vacía -> asignar directamente sin popup
  AppState.calendarShifts[dateStr] = AppState.activeBrush;
  syncCalendarMonthToTable(d.getMonth());
  updateAll();
}

function renderTable() {
  const tbody = document.getElementById("gerhonte-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const year = AppState.calendarYear;

  AppState.monthlyTableData.forEach((row, m) => {
    const activeDays = getMonthActiveContractDays(year, m);
    const reqHours = getMonthRequiredHours(year, m);

    const tr = document.createElement("tr");
    tr.id = `gerhonte-row-${m}`;

    if (activeDays === 0) {
      tr.className = "bg-slate-50/70 text-slate-400 select-none cursor-not-allowed border-b border-slate-100 hover:bg-slate-100/50 transition-colors";
      tr.innerHTML = `
        <td class="sticky left-0 bg-slate-50/95 z-10 py-2.5 px-3 text-left border-r border-slate-200/80 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
          <div class="flex items-center justify-between text-left w-full">
            <span class="text-xs font-semibold text-slate-400">${MONTH_NAMES[m]}</span>
            <span class="text-[10px] text-slate-400 bg-slate-200/70 border border-slate-300/70 px-1.5 py-0.5 rounded font-mono" title="Mes fuera del nombramiento activo">
              Inactivo
            </span>
          </div>
        </td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400">0 d</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 bg-slate-100/40">0.0</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 bg-amber-50/30">0.0</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 bg-emerald-50/30">0.0</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 bg-slate-100/40 cell-actual">0.0</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 cell-balance">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 cell-accum">-</td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-400 cell-dci-net">-</td>
      `;

      tr.addEventListener("click", () => {
        showToast(`El mes de ${MONTH_NAMES[m]} está inhabilitado porque cae fuera de tu periodo de nombramiento`, "info");
      });
    } else {
      tr.className = "hover:bg-emerald-50/40 transition-colors group cursor-pointer border-b border-slate-100";
      tr.innerHTML = `
        <td class="sticky left-0 bg-white group-hover:bg-emerald-50/60 z-10 py-2.5 px-3 font-bold text-slate-800 text-left border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
          <button type="button" class="btn-jump-cal font-bold text-slate-900 group-hover:text-emerald-700 flex items-center justify-between text-left w-full cursor-pointer" data-month="${m}" title="Toca para abrir y editar en el Calendario">
            <span class="text-xs font-bold">${MONTH_NAMES[m]}</span>
            <span class="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5">
              <span>Editar</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </span>
          </button>
        </td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-600">${activeDays} d</td>
        <td class="py-2.5 px-2 text-center font-mono font-semibold bg-emerald-50/50 text-emerald-900">${reqHours.toFixed(1)}</td>
        <td class="py-2.5 px-2 text-center font-mono font-bold text-amber-900">${row.mananas || 0}</td>
        <td class="py-2.5 px-2 text-center font-mono font-bold text-orange-900">${row.tardes || 0}</td>
        <td class="py-2.5 px-2 text-center font-mono font-bold text-indigo-900">${row.noches || 0}</td>
        <td class="py-2.5 px-2 text-center font-mono font-black text-amber-950 bg-amber-50/60 cell-presencial">-</td>
        <td class="py-2.5 px-2 text-center font-mono font-bold text-emerald-900">${row.vacaciones || 0}</td>
        <td class="py-2.5 px-2 text-center font-mono font-bold text-purple-900">${row.moscosos || 0}</td>
        <td class="py-2.5 px-2 text-center font-mono font-black text-emerald-950 bg-emerald-50/60 cell-permisos">-</td>
        <td class="py-2.5 px-2 text-center font-mono font-bold text-cyan-900">${row.dciHoras ? (row.dciHoras + 'h') : '0h'}</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 cell-actual">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 cell-balance">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 cell-accum">-</td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-400 cell-dci-net font-black">-</td>
      `;

      tr.addEventListener("click", () => {
        clearActiveBrush();
        AppState.calendarMonth = m;
        const calTab = document.querySelector('.tab-btn[data-tab="calendar"]');
        if (calTab) calTab.click();
      });
    }

    tbody.appendChild(tr);
  });

  updateTableComputedCells();
}

function updateTableComputedCells() {
  const year = AppState.calendarYear;
  const hM = parseFloat(AppState.config.hoursM) || 7.0;
  const hT = parseFloat(AppState.config.hoursT) || 7.0;
  const hN = parseFloat(AppState.config.hoursN) || 10.0;
  const hV = parseFloat(AppState.config.hoursV) || 7.0;
  const hLD = parseFloat(AppState.config.hoursLD) || 7.0;
  const hDCI = parseFloat(AppState.config.hoursDCI) || 7.0;

  let totActiveDays = 0;
  let totReqHours = 0;
  let totMananas = 0;
  let totTardes = 0;
  let totNoches = 0;
  let totPresentialHours = 0;
  let totVacaciones = 0;
  let totMoscosos = 0;
  let totPermitHours = 0;
  let totDciHoras = 0;
  let totActualHours = 0;
  let runningAccumBalance = 0;

  AppState.monthlyTableData.forEach((row, m) => {
    const activeDays = getMonthActiveContractDays(year, m);
    const reqHours = getMonthRequiredHours(year, m);

    if (activeDays === 0) {
      row.mananas = 0;
      row.tardes = 0;
      row.noches = 0;
      row.vacaciones = 0;
      row.moscosos = 0;
      row.dciHoras = 0;
      row.guardias = 0;
      row.isManual = false;

      const tr = document.getElementById(`gerhonte-row-${m}`);
      if (tr) {
        const cellPres = tr.querySelector(".cell-presencial");
        if (cellPres) cellPres.textContent = "0.0";
        const cellPerm = tr.querySelector(".cell-permisos");
        if (cellPerm) cellPerm.textContent = "0.0";
        const cellAct = tr.querySelector(".cell-actual");
        if (cellAct) cellAct.textContent = "0.0";
        const cellBal = tr.querySelector(".cell-balance");
        if (cellBal) {
          cellBal.textContent = "-";
          cellBal.className = "py-2.5 px-2 text-center font-mono font-bold cell-balance text-slate-400";
        }
        const cellAcc = tr.querySelector(".cell-accum");
        if (cellAcc) {
          cellAcc.textContent = "-";
          cellAcc.className = "py-2.5 px-2 text-center font-mono font-black cell-accum text-slate-400";
        }
        const cellDciNet = tr.querySelector(".cell-dci-net");
        if (cellDciNet) {
          cellDciNet.textContent = "-";
          cellDciNet.className = "py-2.5 px-3 text-right font-mono cell-dci-net text-slate-400";
        }
      }
      return;
    }

    const hasShifts = (
      (row.mananas || 0) > 0 ||
      (row.tardes || 0) > 0 ||
      (row.noches || 0) > 0 ||
      (row.vacaciones || 0) > 0 ||
      (row.moscosos || 0) > 0 ||
      ((row.dciHoras || 0) !== 0)
    );

    const tr = document.getElementById(`gerhonte-row-${m}`);

    if (!hasShifts) {
      if (tr) {
        const cellPres = tr.querySelector(".cell-presencial");
        if (cellPres) cellPres.textContent = "-";
        const cellPerm = tr.querySelector(".cell-permisos");
        if (cellPerm) cellPerm.textContent = "-";
        const cellAct = tr.querySelector(".cell-actual");
        if (cellAct) {
          cellAct.textContent = "-";
          cellAct.className = "py-2.5 px-2 text-center font-mono text-slate-400 cell-actual";
        }
        const cellBal = tr.querySelector(".cell-balance");
        if (cellBal) {
          cellBal.textContent = "Pendiente";
          cellBal.className = "py-2.5 px-2 text-center font-mono text-[11px] font-semibold text-slate-400 cell-balance";
        }
        const cellAcc = tr.querySelector(".cell-accum");
        if (cellAcc) {
          cellAcc.textContent = "-";
          cellAcc.className = "py-2.5 px-2 text-center font-mono text-slate-400 cell-accum";
        }
        const cellDciNet = tr.querySelector(".cell-dci-net");
        if (cellDciNet) {
          cellDciNet.textContent = "-";
          cellDciNet.className = "py-2.5 px-3 text-right font-mono cell-dci-net text-slate-400";
        }
      }
      return;
    }

    const presHours = ((row.mananas || 0) * hM) + ((row.tardes || 0) * hT) + ((row.noches || 0) * hN);
    const permHours = ((row.vacaciones || 0) * hV) + ((row.moscosos || 0) * hLD);
    const dciH = row.dciHoras || 0;
    const actHours = presHours + permHours - dciH;
    const monthBal = parseFloat((actHours - reqHours).toFixed(1));

    totActiveDays += activeDays;
    totReqHours += reqHours;
    totMananas += row.mananas;
    totTardes += row.tardes;
    totNoches += row.noches;
    totPresentialHours += presHours;
    totVacaciones += row.vacaciones;
    totMoscosos += row.moscosos;
    totPermitHours += permHours;
    totDciHoras += dciH;
    totActualHours += actHours;
    runningAccumBalance += monthBal;

    if (tr) {
      const signMonth = monthBal > 0 ? "+" : "";
      const signAccum = runningAccumBalance > 0 ? "+" : "";

      const cellPres = tr.querySelector(".cell-presencial");
      if (cellPres) {
        cellPres.textContent = presHours.toFixed(1);
        cellPres.className = "py-2.5 px-2 text-center font-mono font-bold text-amber-950 bg-amber-50/70 cell-presencial";
      }

      const cellPerm = tr.querySelector(".cell-permisos");
      if (cellPerm) {
        cellPerm.textContent = permHours.toFixed(1);
        cellPerm.className = "py-2.5 px-2 text-center font-mono font-bold text-emerald-950 bg-emerald-50/70 cell-permisos";
      }

      const cellAct = tr.querySelector(".cell-actual");
      if (cellAct) {
        cellAct.textContent = actHours.toFixed(1);
        cellAct.className = "py-2.5 px-2 text-center font-mono font-black bg-slate-100/70 text-slate-900 cell-actual";
      }

      const cellBal = tr.querySelector(".cell-balance");
      if (cellBal) {
        cellBal.textContent = `${signMonth}${monthBal.toFixed(1)}`;
        const balColor = monthBal > 0.05 ? 'text-emerald-700' : (monthBal < -0.05 ? 'text-rose-600' : 'text-slate-700');
        cellBal.className = `py-2.5 px-2 text-center font-mono font-bold cell-balance ${balColor}`;
      }

      const cellAcc = tr.querySelector(".cell-accum");
      if (cellAcc) {
        cellAcc.textContent = `${signAccum}${runningAccumBalance.toFixed(1)} h`;
        const accColor = runningAccumBalance > 0.05 ? 'text-emerald-700' : (runningAccumBalance < -0.05 ? 'text-rose-600' : 'text-slate-700');
        cellAcc.className = `py-2.5 px-2 text-center font-mono font-black cell-accum ${accColor}`;
      }

      const cellDciNet = tr.querySelector(".cell-dci-net");
      if (cellDciNet) {
        const currentDciNetHours = Math.max(0, parseFloat(runningAccumBalance.toFixed(1)));
        if (currentDciNetHours > 0) {
          const dciDays = Math.floor(currentDciNetHours / hDCI);
          cellDciNet.textContent = `+${currentDciNetHours.toFixed(1)} h (${dciDays} d)`;
          cellDciNet.className = "py-2.5 px-3 text-right font-mono font-black text-cyan-900 bg-cyan-50/60 cell-dci-net";
        } else {
          cellDciNet.textContent = "0.0 h (0 d)";
          cellDciNet.className = "py-2.5 px-3 text-right font-mono font-bold text-slate-400 cell-dci-net";
        }
      }
    }
  });

  const accumSign = runningAccumBalance > 0.05 ? "+" : "";
  const finalDciHours = Math.max(0, parseFloat(runningAccumBalance.toFixed(1)));
  const finalDciDays = Math.floor(finalDciHours / hDCI);

  const tfoot = document.getElementById("gerhonte-table-totals");
  if (tfoot) {
    tfoot.innerHTML = `
      <td class="sticky left-0 bg-slate-100 z-10 py-3 px-3 text-left font-black border-r border-slate-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">TOTAL AUDITADO (${year})</td>
      <td class="py-3 px-2 font-mono text-center">${totActiveDays} d</td>
      <td class="py-3 px-2 font-mono text-center bg-emerald-100/70 text-emerald-950 font-bold" title="Cuota exigible acumulada en meses con registros">${totReqHours.toFixed(1)} h</td>
      <td class="py-3 px-2 font-mono text-center font-bold text-amber-900">${totMananas}</td>
      <td class="py-3 px-2 font-mono text-center font-bold text-orange-900">${totTardes}</td>
      <td class="py-3 px-2 font-mono text-center font-bold text-indigo-900">${totNoches}</td>
      <td class="py-3 px-2 font-mono text-center font-black text-amber-950 bg-amber-100/80">${totPresentialHours.toFixed(1)} h</td>
      <td class="py-3 px-2 font-mono text-center font-bold text-emerald-900">${totVacaciones}</td>
      <td class="py-3 px-2 font-mono text-center font-bold text-purple-900">${totMoscosos}</td>
      <td class="py-3 px-2 font-mono text-center font-black text-emerald-950 bg-emerald-100/80">${totPermitHours.toFixed(1)} h</td>
      <td class="py-3 px-2 font-mono text-center font-bold text-cyan-900">${totDciHoras} h</td>
      <td class="py-3 px-2 font-mono text-center font-black bg-slate-200">${totActualHours.toFixed(1)} h</td>
      <td class="py-3 px-2 font-mono text-center font-black ${ runningAccumBalance > 0.05 ? 'text-emerald-800' : (runningAccumBalance < -0.05 ? 'text-rose-700' : 'text-slate-800')}">
        ${accumSign}${runningAccumBalance.toFixed(1)} h
      </td>
      <td class="py-3 px-2 font-mono text-center font-black ${ runningAccumBalance > 0.05 ? 'text-emerald-800' : (runningAccumBalance < -0.05 ? 'text-rose-700' : 'text-slate-800')}">
        ${accumSign}${runningAccumBalance.toFixed(1)} h
      </td>
      <td class="py-3 px-3 text-right font-mono font-black text-xs ${finalDciHours > 0 ? 'text-cyan-950 bg-cyan-100' : 'text-slate-500 bg-slate-100'}">
        ${finalDciHours > 0 ? `+${finalDciHours.toFixed(1)} h (${finalDciDays} d)` : '0.0 h (0 d)'}
      </td>
    `;
  }
}

function renderRequestLetter() {
  const metrics = getAccumulatedMetrics();
  const accumulatedBalance = metrics.accumulatedBalance;
  const dciHours = parseFloat(AppState.config.hoursDCI) || 7.0;
  const dciDays = metrics.dciDays;
  const remainderHours = metrics.dciRemainderHours;
  const auditedNote = metrics.lastFilledMonthName ? ` (auditado a fecha de ${metrics.lastFilledMonthName})` : "";

  const workerName = AppState.config.workerName;
  const workerDni = AppState.config.dni;
  const proposedDates = AppState.config.proposedDates;
  const category = AppState.config.category;
  const center = AppState.config.center;
  const service = AppState.config.service;
  const startDate = AppState.config.startDate;
  const endDate = AppState.config.endDate;

  const today = new Date();
  const dateOptions = { day: "numeric", month: "long", year: "numeric" };
  const fechaHoy = today.toLocaleDateString("es-ES", dateOptions);

  const letter = `A LA DIRECCIÓN DE PERSONAL / SUPERVISIÓN DE ÁREA
CENTRO HOSPITALARIO / DISTRITO: ${center.toUpperCase()}
UNIDAD / SERVICIO: ${service.toUpperCase()}

ASUNTO: SOLICITUD REGLAMENTARIA DE DESCANSO COMPENSATORIO POR EXCESO DE JORNADA (DCI)

D./Dña. ${workerName}, con D.N.I. nº ${workerDni}, en calidad de personal estatutario con nombramiento en la categoría de ${category}, adscrito/a al Servicio de ${service} de este centro hospitalario, con periodo de nombramiento comprendido entre el ${startDate} y el ${endDate},

EXPONE:

PRIMERO.- Que de conformidad con el Acuerdo de la Mesa Sectorial de Sanidad del Servicio Andaluz de Salud sobre jornada laboral y cuadrantes de turnos (sistema Gerhonte), así como la normativa estatutaria de aplicación, mi jornada neta anual proporcional asciende a la fecha a un cómputo auditado de cumplimiento superior a la cuota exigible.

SEGUNDO.- Que según la auditoría de cuadrante y registro de turnos efectivamente realizados hasta la fecha${auditedNote}, se acredita un SALDO A FAVOR acumulado de ${accumulatedBalance > 0 ? '+' : ''}${accumulatedBalance.toFixed(1)} HORAS netas de trabajo efectivo por encima de la jornada debida.

TERCERO.- Que dicho exceso horario equivale exactamente a ${dciDays} JORNADA(S) COMPLETA(S) de descanso reglamentario (calculado a razón de ${dciHours.toFixed(1)} horas ordinarias por turno), restando un remanente en bolsa de ${remainderHours.toFixed(1)} horas.

CUARTO.- Que dada la condición de nombramiento con fecha prevista de cese y con el fin de evitar discrepancias administrativas o la pérdida irreparable del derecho a la compensación del exceso de jornada laboral prestada,

SOLICITA:

Que teniendo por presentado este escrito en tiempo y forma, se sirva admitirlo y acuerde la concesión y autorización para el disfrute de ${dciDays} DÍA(S) DE DESCANSO COMPENSATORIO POR EXCESO (DCI), proponiendo como fechas para su disfrute:

   >>> ${proposedDates.toUpperCase()} <<<

O subsidiariamente, aquellas fechas alternativas previas a la fecha de finalización del nombramiento que garanticen la adecuada cobertura del servicio asistencial sin menoscabo de mi derecho al descanso compensatorio.


En Andalucía, a ${fechaHoy}.


Fdo.: ${workerName}
Categoría: ${category}
D.N.I.: ${workerDni}`;

  const el = document.getElementById("request-preview-box");
  if (el) el.textContent = letter;
}

export function syncConfigInputsFromState() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal("cfg-start-date", AppState.config.startDate);
  setVal("cfg-end-date", AppState.config.endDate);
  setVal("cfg-regime", AppState.config.regime);
  setVal("cfg-base-hours", AppState.config.baseHours);
  setVal("cfg-category", AppState.config.category);
  setVal("cfg-center", AppState.config.center);
  setVal("cfg-shift-m", AppState.config.hoursM);
  setVal("cfg-shift-t", AppState.config.hoursT);
  setVal("cfg-shift-n", AppState.config.hoursN);
  setVal("cfg-shift-v", AppState.config.hoursV);
  setVal("cfg-shift-ld", AppState.config.hoursLD);
  setVal("cfg-shift-dci", AppState.config.hoursDCI);
  setVal("req-proposed-dates", AppState.config.proposedDates || "Días 14, 15 y 16 de Diciembre");

  // Actualizar datos del resumen de la tarjeta colapsable
  const sumDates = document.getElementById("summary-nom-dates");
  if (sumDates) {
    const s = AppState.config.startDate ? AppState.config.startDate.split("-").reverse().join("/") : "";
    const e = AppState.config.endDate ? AppState.config.endDate.split("-").reverse().join("/") : "";
    sumDates.textContent = `${s} al ${e}`;
  }
  const sumRegime = document.getElementById("summary-nom-regime");
  if (sumRegime) {
    const reg = AppState.config.regime;
    let regLabel = "Rotatorio (1.483h)";
    if (reg === "diurno") regLabel = "Diurno (1.540h)";
    else if (reg === "nocturno") regLabel = "Nocturno (1.450h)";
    else if (reg === "custom") regLabel = `Personalizado (${AppState.config.baseHours}h)`;
    sumRegime.textContent = regLabel;
  }
  const sumCat = document.getElementById("summary-nom-category");
  if (sumCat) {
    sumCat.textContent = AppState.config.category || "Personal Sanitario SAS";
  }

  const brushN = document.getElementById("brush-label-n");
  if (brushN) brushN.textContent = `[N] Noche (${AppState.config.hoursN}h)`;
}

export function syncEditModalInputsFromState() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal("edit-worker-name", AppState.config.workerName);
  setVal("edit-worker-dni", AppState.config.dni);
  setVal("edit-category", AppState.config.category);
  setVal("edit-center", AppState.config.center);
  setVal("edit-service", AppState.config.service);
  setVal("edit-start-date", AppState.config.startDate);
  setVal("edit-end-date", AppState.config.endDate);
  setVal("edit-regime", AppState.config.regime);
  setVal("edit-base-hours", AppState.config.baseHours);
}

export function cargarDatosEjemplo(showNotification = true) {
  AppState.config.startDate = "2026-04-07";
  AppState.config.endDate = "2026-12-31";
  AppState.config.regime = "rotatorio";
  AppState.config.baseHours = 1483;
  AppState.calendarYear = 2026;
  AppState.calendarMonth = 3; // Mostrar Abril inicialmente

  AppState.calendarShifts = {};

  AppState.monthlyTableData = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    mananas: 0,
    tardes: 0,
    noches: 0,
    vacaciones: 0,
    moscosos: 0,
    dciHoras: 0,
    guardias: 0,
    isManual: false
  }));

  const setShift = (m, d, code) => {
    AppState.calendarShifts[formatISODate(2026, m, d)] = code;
  };

  // --- ABRIL 2026 (Mes 3) --- 15 M (105h) + 4 T (28h) = 133h
  [7, 8, 9, 10, 13, 14, 15, 20, 21, 22, 23, 27, 28, 29, 30].forEach(d => setShift(3, d, "M"));
  [16, 17, 24, 25].forEach(d => setShift(3, d, "T"));

  // --- MAYO 2026 (Mes 4) --- 16 M (112h) + 5 T (35h) + 1 N (10h) + 1 S = 157h
  [4, 5, 6, 7, 8, 11, 12, 13, 18, 19, 20, 25, 26, 27, 28, 29].forEach(d => setShift(4, d, "M"));
  [14, 21, 22, 23, 24].forEach(d => setShift(4, d, "T"));
  setShift(4, 15, "N");
  setShift(4, 16, "S");

  // --- JUNIO 2026 (Mes 5) --- 10 M (70h) + 4 T (28h) + 5 N (50h) + 5 S = 148h
  [1, 2, 3, 8, 9, 15, 16, 22, 23, 29].forEach(d => setShift(5, d, "M"));
  [10, 17, 24, 30].forEach(d => setShift(5, d, "T"));
  [4, 11, 18, 25, 27].forEach(d => {
    setShift(5, d, "N");
    setShift(5, d + 1, "S");
  });

  // --- JULIO 2026 (Mes 6) --- 12 M (84h) + 4 T (28h) + 9 V (63h) + 1 DCI (-7h) = 168h
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(d => setShift(6, d, "V"));
  setShift(6, 14, "DCI");
  [13, 15, 16, 17, 20, 21, 22, 27, 28, 29, 30, 31].forEach(d => setShift(6, d, "M"));
  [18, 23, 24, 25].forEach(d => setShift(6, d, "T"));

  // --- AGOSTO 2026 (Mes 7) --- 10 M (70h) + 5 T (35h) + 5 N (50h) + 5 S = 155h
  [3, 4, 10, 11, 17, 18, 24, 25, 28, 31].forEach(d => setShift(7, d, "M"));
  [7, 8, 14, 21, 22].forEach(d => setShift(7, d, "T"));
  [5, 12, 19, 26, 29].forEach(d => {
    setShift(7, d, "N");
    setShift(7, d + 1, "S");
  });

  // --- SEPTIEMBRE 2026 (Mes 8) --- 14 M (98h) + 5 T (35h) + 2 N (20h) + 2 S = 153h
  [1, 2, 3, 4, 7, 8, 9, 14, 15, 16, 21, 22, 23, 28].forEach(d => setShift(8, d, "M"));
  [12, 17, 18, 29, 30].forEach(d => setShift(8, d, "T"));
  setShift(8, 10, "N");
  setShift(8, 11, "S");
  setShift(8, 24, "N");
  setShift(8, 25, "S");

  // --- OCTUBRE 2026 (Mes 9) --- 18 M (126h) + 4 T (28h) + 1 N (10h) + 1 S = 164h
  [1, 2, 5, 6, 7, 8, 13, 14, 15, 16, 19, 20, 23, 26, 27, 28, 29, 30].forEach(d => setShift(9, d, "M"));
  [9, 24, 25, 31].forEach(d => setShift(9, d, "T"));
  setShift(9, 21, "N");
  setShift(9, 22, "S");

  // Sincronizar todos los meses hacia la tabla para garantizar concordancia 100% exacta
  for (let m = 0; m < 12; m++) {
    syncCalendarMonthToTable(m);
  }

  syncConfigInputsFromState();
  updateAll();

  if (showNotification) {
    showToast("¡Ejemplo del Técnico de Rayos cargado con éxito en Calendario y Resumen!", "success");
  }
}

export function exportarPDF() {
  const JsPdfClass = getJsPdfClass();
  if (!JsPdfClass) {
    showToast("Error: No se ha podido cargar el módulo PDF. Comprueba tu conexión a Internet.", "danger");
    return;
  }
  const year = AppState.calendarYear;
  const metrics = getAccumulatedMetrics();
  const cfg = AppState.config || {};

  const doc = new JsPdfClass({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);

  // 1. Cabecera institucional
  doc.setFillColor(6, 95, 70); // emerald-800
  doc.rect(margin, 10, contentWidth, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(6, 95, 70);
  doc.text("SERVICIO ANDALUZ DE SALUD  ·  CONSEJERÍA DE SALUD Y CONSUMO", margin, 17);

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("INFORME DE AUDITORÍA DE JORNADA Y BOLSA DCI", margin, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Control de Cómputo Horario y Ponderación Gerhonte · Ejercicio ${year}`, margin, 29);

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  doc.setFontSize(7.5);
  doc.text(`Fecha de emisión: ${dateStr} ${timeStr}`, pageWidth - margin, 17, { align: "right" });
  doc.text("Documento Informativo GestorSAS", pageWidth - margin, 21, { align: "right" });

  // 2. Ficha de Datos del Profesional y Nombramiento Activo
  const infoY = 32;
  const infoH = 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, infoY, contentWidth, infoH, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("DATOS DEL PROFESIONAL Y NOMBRAMIENTO ACTIVO", margin + 3, infoY + 4.5);

  doc.setFontSize(7.5);
  const workerName = cfg.workerName ? cfg.workerName.trim() : "Personal SAS";
  const dni = cfg.dni ? cfg.dni.trim() : "—";
  const category = cfg.category ? cfg.category.trim() : "Personal Estatutario SAS";
  const center = cfg.center ? cfg.center.trim() : "Centro Sanitario SAS";
  const service = cfg.service ? cfg.service.trim() : "—";
  const regimeText = cfg.regime === "rotatorio" ? "Turno Rotatorio (M/T/N)" : "Turno Diurno (Lunes a Viernes)";
  const periodText = (cfg.startDate || cfg.endDate)
    ? `${cfg.startDate || "Inicio año"} al ${cfg.endDate || "Fin año"}`
    : `Año completo ${year}`;
  const baseHoursText = `${cfg.baseHours || 1540} h anuales · Módulo DCI: ${cfg.hoursDCI || 7} h/día`;

  // Fila 1
  doc.setFont("helvetica", "bold");
  doc.text("Profesional:", margin + 3, infoY + 9.5);
  doc.setFont("helvetica", "normal");
  doc.text(workerName, margin + 20, infoY + 9.5);

  doc.setFont("helvetica", "bold");
  doc.text("DNI / NIE:", margin + 80, infoY + 9.5);
  doc.setFont("helvetica", "normal");
  doc.text(dni, margin + 96, infoY + 9.5);

  doc.setFont("helvetica", "bold");
  doc.text("Categoría:", margin + 124, infoY + 9.5);
  doc.setFont("helvetica", "normal");
  const catTruncated = category.length > 28 ? category.substring(0, 26) + "..." : category;
  doc.text(catTruncated, margin + 140, infoY + 9.5);

  // Fila 2
  doc.setFont("helvetica", "bold");
  doc.text("Centro:", margin + 3, infoY + 14.5);
  doc.setFont("helvetica", "normal");
  const centerTruncated = center.length > 32 ? center.substring(0, 30) + "..." : center;
  doc.text(centerTruncated, margin + 15, infoY + 14.5);

  doc.setFont("helvetica", "bold");
  doc.text("Servicio:", margin + 80, infoY + 14.5);
  doc.setFont("helvetica", "normal");
  const serviceTruncated = service.length > 20 ? service.substring(0, 18) + "..." : service;
  doc.text(serviceTruncated, margin + 94, infoY + 14.5);

  doc.setFont("helvetica", "bold");
  doc.text("Régimen:", margin + 124, infoY + 14.5);
  doc.setFont("helvetica", "normal");
  doc.text(regimeText, margin + 140, infoY + 14.5);

  // Fila 3
  doc.setFont("helvetica", "bold");
  doc.text("Periodo:", margin + 3, infoY + 19.5);
  doc.setFont("helvetica", "normal");
  doc.text(periodText, margin + 16, infoY + 19.5);

  doc.setFont("helvetica", "bold");
  doc.text("Jornada Base:", margin + 80, infoY + 19.5);
  doc.setFont("helvetica", "normal");
  doc.text(baseHoursText, margin + 101, infoY + 19.5);

  // 3. Recuadros Superiores de Resumen (KPIs)
  const kpiY = 57;
  const kpiH = 22;
  const cardGap = 3;
  const cardW = (contentWidth - (cardGap * 3)) / 4;

  const balanceSign = metrics.accumulatedBalance > 0 ? "+" : "";
  const balanceVal = `${balanceSign}${metrics.accumulatedBalance.toFixed(1)} h`;
  const balanceState = metrics.filledMonthsCount === 0
    ? "Sin registros"
    : (metrics.accumulatedBalance > 0
        ? "A FAVOR (Exceso)"
        : (metrics.accumulatedBalance < 0 ? "DÉFICIT" : "AL DÍA"));
  const balanceSub = metrics.filledMonthsCount === 0
    ? `0h de ${metrics.totalContractReq.toFixed(0)}h`
    : `Auditado a ${metrics.lastFilledMonthName || "mes"}`;
  const balanceColor = metrics.accumulatedBalance > 0
    ? [21, 128, 61]
    : (metrics.accumulatedBalance < 0 ? [185, 28, 28] : [51, 65, 85]);
  const balanceBg = metrics.accumulatedBalance > 0
    ? [240, 253, 244]
    : (metrics.accumulatedBalance < 0 ? [254, 242, 242] : [248, 250, 252]);

  const cards = [
    {
      label: "SALDO BOLSA",
      val: balanceVal,
      sub: balanceState,
      sub2: balanceSub,
      color: balanceColor,
      bg: balanceBg
    },
    {
      label: "BOLSA DCI (EXCESO REAL)",
      val: `${metrics.dciDaysAvailable} DÍAS`,
      sub: metrics.dciNetHours > 0 ? `+${metrics.dciNetHours.toFixed(1)} h netas (÷ 7h)` : "Sin exceso acumulado",
      sub2: `${metrics.totalDciConsumedDays} d DCI disfrutados`,
      color: [4, 120, 87],
      bg: [236, 253, 245]
    },
    {
      label: "BOLSA VACACIONES",
      val: `${metrics.remainingVacationDays} / ${metrics.totalVacationDays} d`,
      sub: "Días por disfrutar / Acumulados",
      sub2: metrics.lastFilledMonthName ? `(a ${metrics.lastFilledMonthName})` : "(anual)",
      color: [15, 23, 42],
      bg: [248, 250, 252]
    },
    {
      label: "MOSCOSOS",
      val: `${metrics.remainingLdDays} / ${metrics.totalLdDays} d`,
      sub: "Días por disfrutar / Acumulados",
      sub2: "",
      color: [88, 28, 135],
      bg: [250, 245, 255]
    }
  ];

  cards.forEach((c, idx) => {
    const x = margin + idx * (cardW + cardGap);
    doc.setFillColor(...c.bg);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, cardW, kpiH, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, x + cardW / 2, kpiY + 4.5, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(...c.color);
    doc.text(c.val, x + cardW / 2, kpiY + 11.5, { align: "center" });

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(51, 65, 85);
    doc.text(c.sub, x + cardW / 2, kpiY + 16, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(c.sub2, x + cardW / 2, kpiY + 19.5, { align: "center" });
  });

  // 4. Tabla de Auditoría Mensual Gerhonte (Pestaña 2)
  const hM = parseFloat(AppState.config.hoursM) || 7.0;
  const hT = parseFloat(AppState.config.hoursT) || 7.0;
  const hN = parseFloat(AppState.config.hoursN) || 10.0;
  const hV = parseFloat(AppState.config.hoursV) || 7.0;
  const hLD = parseFloat(AppState.config.hoursLD) || 7.0;
  const hDCI = parseFloat(AppState.config.hoursDCI) || 7.0;

  let totActiveDays = 0;
  let totReqHours = 0;
  let totMananas = 0;
  let totTardes = 0;
  let totNoches = 0;
  let totPresentialHours = 0;
  let totVacaciones = 0;
  let totMoscosos = 0;
  let totPermitHours = 0;
  let totDciHoras = 0;
  let totActualHours = 0;
  let runningAccum = 0;

  const tableBody = AppState.monthlyTableData.map((row, m) => {
    const activeDays = getMonthActiveContractDays(year, m);
    const reqHours = getMonthRequiredHours(year, m);

    if (activeDays === 0) {
      return [MONTH_NAMES[m], "0 d", "0.0 h", "-", "-", "-", "0.0 h", "-", "-", "0.0 h", "-", "0.0 h", "-", "-", "-"];
    }

    const hasShifts = (
      (row.mananas || 0) > 0 ||
      (row.tardes || 0) > 0 ||
      (row.noches || 0) > 0 ||
      (row.vacaciones || 0) > 0 ||
      (row.moscosos || 0) > 0 ||
      ((row.dciHoras || 0) !== 0)
    );

    if (!hasShifts) {
      return [
        MONTH_NAMES[m],
        `${activeDays} d`,
        `${reqHours.toFixed(1)} h`,
        "0", "0", "0", "0.0 h",
        "0", "0", "0.0 h",
        "0 h",
        "0.0 h",
        "Pendiente",
        "-",
        "-"
      ];
    }

    const presHours = ((row.mananas || 0) * hM) + ((row.tardes || 0) * hT) + ((row.noches || 0) * hN);
    const permHours = ((row.vacaciones || 0) * hV) + ((row.moscosos || 0) * hLD);
    const dciH = row.dciHoras || 0;
    const actHours = presHours + permHours - dciH;
    const monthBal = parseFloat((actHours - reqHours).toFixed(1));

    totActiveDays += activeDays;
    totReqHours += reqHours;
    totMananas += (row.mananas || 0);
    totTardes += (row.tardes || 0);
    totNoches += (row.noches || 0);
    totPresentialHours += presHours;
    totVacaciones += (row.vacaciones || 0);
    totMoscosos += (row.moscosos || 0);
    totPermitHours += permHours;
    totDciHoras += dciH;
    totActualHours += actHours;
    runningAccum += monthBal;

    const signMonth = monthBal > 0.05 ? "+" : "";
    const signAccum = runningAccum > 0.05 ? "+" : "";

    const rowDciHours = Math.max(0, parseFloat(runningAccum.toFixed(1)));
    const dciNetText = rowDciHours > 0
      ? `+${rowDciHours.toFixed(1)} h (${Math.floor(rowDciHours / hDCI)} d)`
      : "0.0 h (0 d)";

    return [
      MONTH_NAMES[m],
      `${activeDays} d`,
      `${reqHours.toFixed(1)} h`,
      String(row.mananas || 0),
      String(row.tardes || 0),
      String(row.noches || 0),
      `${presHours.toFixed(1)} h`,
      String(row.vacaciones || 0),
      String(row.moscosos || 0),
      `${permHours.toFixed(1)} h`,
      dciH ? `${dciH} h` : "0 h",
      `${actHours.toFixed(1)} h`,
      `${signMonth}${monthBal.toFixed(1)} h`,
      `${signAccum}${runningAccum.toFixed(1)} h`,
      dciNetText
    ];
  });

  const totalAccumSign = runningAccum > 0.05 ? "+" : "";
  const finalPdfDci = Math.max(0, parseFloat(runningAccum.toFixed(1)));
  const finalPdfDciDays = Math.floor(finalPdfDci / hDCI);
  const tableFoot = [[
    `TOTAL AUDITADO (${year})`,
    `${totActiveDays} d`,
    `${totReqHours.toFixed(1)} h`,
    String(totMananas),
    String(totTardes),
    String(totNoches),
    String(totPresentialHours.toFixed(1)) + " h",
    String(totVacaciones),
    String(totMoscosos),
    String(totPermitHours.toFixed(1)) + " h",
    `${totDciHoras} h`,
    `${totActualHours.toFixed(1)} h`,
    `${totalAccumSign}${runningAccum.toFixed(1)} h`,
    `${totalAccumSign}${runningAccum.toFixed(1)} h`,
    finalPdfDci > 0 ? `+${finalPdfDci.toFixed(1)} h (${finalPdfDciDays} d)` : "0.0 h (0 d)"
  ]];

  applyAutoTable(doc, {
    startY: 82,
    margin: { left: margin, right: margin },
    head: [["Mes", "Días", "Cuota", "M", "T", "N", "Pres.", "Vac", "LD", "Perm.", "DCI", "Efect.", "Saldo", "Acum.", "DCI Pend."]],
    body: tableBody,
    foot: tableFoot,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 6.8,
      cellPadding: 1.2,
      halign: "center",
      valign: "middle",
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.8,
      halign: "center"
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 6.8,
      halign: "center"
    },
    columnStyles: {
      0: { halign: "left", fontStyle: "bold", cellWidth: 19 },
      1: { cellWidth: 10 },
      2: { cellWidth: 13 },
      3: { cellWidth: 8, fontStyle: "bold" },
      4: { cellWidth: 8, fontStyle: "bold" },
      5: { cellWidth: 8, fontStyle: "bold" },
      6: { cellWidth: 13, fontStyle: "bold" },
      7: { cellWidth: 8, fontStyle: "bold" },
      8: { cellWidth: 8, fontStyle: "bold" },
      9: { cellWidth: 13, fontStyle: "bold" },
      10: { cellWidth: 10, fontStyle: "bold" },
      11: { cellWidth: 14, fontStyle: "bold" },
      12: { cellWidth: 14, fontStyle: "bold" },
      13: { cellWidth: 15, fontStyle: "bold" },
      14: { cellWidth: 23, fontStyle: "bold", halign: "right" }
    },
    didParseCell: function(data) {
      if (data.section === "body") {
        const text = data.cell.raw || "";
        if (data.column.index === 12 || data.column.index === 13 || data.column.index === 14) {
          if (typeof text === "string" && text.startsWith("+")) {
            data.cell.styles.textColor = [21, 128, 61];
          } else if (typeof text === "string" && text.startsWith("-") && text !== "-") {
            data.cell.styles.textColor = [185, 28, 28];
          } else if (text === "-" || text === "Pendiente") {
            data.cell.styles.textColor = [148, 163, 184];
          }
        }
      }
    }
  });

  const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 4 : 200;

  // 5. Firma y notas legales
  if (finalY + 30 <= pageHeight - margin) {
    const sigY = finalY + 4;
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin + 15, sigY + 12, margin + 70, sigY + 12);
    doc.line(pageWidth - margin - 70, sigY + 12, pageWidth - margin - 15, sigY + 12);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Firma / Conforme del Profesional", margin + 42.5, sigY + 16, { align: "center" });
    doc.text("Validación Unidad de Personal / Supervisión", pageWidth - margin - 42.5, sigY + 16, { align: "center" });

    const legalY = sigY + 22;
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Nota técnica: Cómputo realizado conforme a la Orden de Jornada y Horarios del SAS y tabla de ponderación horaria Gerhonte.", margin, legalY);
    doc.text("Documento justificativo emitido automáticamente por GestorSAS para el control del saldo horario y días de compensación (DCI).", margin, legalY + 3.5);
    doc.text("Página 1 de 1 · GestorSAS v2.0", pageWidth - margin, legalY + 3.5, { align: "right" });
  }

  // Descarga del PDF
  const safeName = (cfg.workerName || "personal_sas").toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
  doc.save(`auditoria_jornada_sas_${year}_${safeName}.pdf`);
  showToast("Informe de auditoría descargado en PDF correctamente", "success");
}

export function exportarCSV() {
  const year = AppState.calendarYear;
  const hM = parseFloat(AppState.config.hoursM) || 7.0;
  const hT = parseFloat(AppState.config.hoursT) || 7.0;
  const hN = parseFloat(AppState.config.hoursN) || 10.0;
  const hV = parseFloat(AppState.config.hoursV) || 7.0;
  const hLD = parseFloat(AppState.config.hoursLD) || 7.0;
  const hDCI = parseFloat(AppState.config.hoursDCI) || 7.0;

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Mes;Dias Contrato;Cuota Exigible (h);Mananas;Tardes;Noches;Horas Presenciales;Vacaciones;Moscosos (LD);Horas Permisos;DCI Disfrutado (h);Horas Efectivas;Saldo Mes (h);Saldo Acumulado (h);DCI Netos Pendientes (h);Estado\r\n";

  let runningAccum = 0;
  let totVacaciones = 0;

  AppState.monthlyTableData.forEach((row, m) => {
    const activeDays = getMonthActiveContractDays(year, m);
    const reqHours = getMonthRequiredHours(year, m);
    const hasShifts = (
      (row.mananas || 0) > 0 ||
      (row.tardes || 0) > 0 ||
      (row.noches || 0) > 0 ||
      (row.vacaciones || 0) > 0 ||
      (row.moscosos || 0) > 0 ||
      ((row.dciHoras || 0) !== 0)
    );

    if (activeDays === 0) {
      csvContent += `${MONTH_NAMES[m]};0;0.0;0;0;0;0.0;0;0;0.0;0;0.0;0.0;0.0;0.0;Inactivo (Sin Contrato)\r\n`;
    } else if (!hasShifts) {
      csvContent += `${MONTH_NAMES[m]};${activeDays};${reqHours.toFixed(1)};0;0;0;0.0;0;0;0.0;0;0.0;-;-;-;Pendiente de rellenar\r\n`;
    } else {
      const presHours = ((row.mananas || 0) * hM) + ((row.tardes || 0) * hT) + ((row.noches || 0) * hN);
      const permHours = ((row.vacaciones || 0) * hV) + ((row.moscosos || 0) * hLD);
      const dciH = row.dciHoras || 0;
      const actHours = presHours + permHours - dciH;
      const monthBal = parseFloat((actHours - reqHours).toFixed(1));
      runningAccum += monthBal;

      const dciNetHours = Math.max(0, parseFloat(runningAccum.toFixed(1)));
      const dciNet = dciNetHours > 0 ? dciNetHours.toFixed(1) : "0.0";
      csvContent += `${MONTH_NAMES[m]};${activeDays};${reqHours.toFixed(1)};${row.mananas};${row.tardes};${row.noches};${presHours.toFixed(1)};${row.vacaciones};${row.moscosos};${permHours.toFixed(1)};${dciH};${actHours.toFixed(1)};${monthBal.toFixed(1)};${runningAccum.toFixed(1)};${dciNet};Auditado\r\n`;
    }
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `cuadrante_gerhonte_sas_${year}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Cuadrante exportado a CSV con éxito", "success");
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");

  let borderClass = "border-slate-300 bg-white text-slate-800";
  let iconSvg = `<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;

  if (type === "success") {
    borderClass = "border-emerald-500 bg-emerald-50 text-emerald-950";
    iconSvg = `<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
  } else if (type === "warning") {
    borderClass = "border-amber-500 bg-amber-50 text-amber-950";
    iconSvg = `<svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
  }

  toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg text-xs font-semibold ${borderClass} transition-all duration-300 transform translate-y-2 opacity-0`;
  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

export function showModal(title, message, onConfirm, options = {}) {
  const modal = document.getElementById("modal-container");
  const titleEl = document.getElementById("modal-title");
  const msgEl = document.getElementById("modal-message");
  const btnConfirm = document.getElementById("modal-btn-confirm");
  const btnCancel = document.getElementById("modal-btn-cancel");
  const iconWrapper = document.getElementById("modal-icon-wrapper");
  if (!modal || !titleEl || !msgEl || !btnConfirm || !btnCancel) return;

  const {
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    confirmClass = "bg-rose-600 hover:bg-rose-700",
    iconClass = "text-amber-600",
    onCancel = null
  } = options;

  titleEl.textContent = title;
  msgEl.innerHTML = message;
  btnConfirm.textContent = confirmText;
  btnCancel.textContent = cancelText;
  btnConfirm.className = `px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition-colors cursor-pointer ${confirmClass}`;

  if (iconWrapper) {
    iconWrapper.className = `flex items-center gap-3 mb-3 ${iconClass}`;
  }

  modal.classList.remove("hidden");

  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    modal.classList.add("hidden");
    btnConfirm.onclick = null;
    btnCancel.onclick = null;
    modal.onclick = null;
    window.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      cleanup();
      if (onCancel) onCancel();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  modal.onclick = (e) => {
    if (e.target === modal) {
      cleanup();
      if (onCancel) onCancel();
    }
  };

  btnConfirm.onclick = () => {
    cleanup();
    if (onConfirm) onConfirm();
  };

  btnCancel.onclick = () => {
    cleanup();
    if (onCancel) onCancel();
  };
}

// -------------------------------------------------------------
// EVENTOS PRINCIPALES DEL DOM (Inicialización Resiliente)
// -------------------------------------------------------------
let appInitialized = false;
function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  const authPortal = document.getElementById("auth-portal");
  const formLogin = document.getElementById("form-login");
  const formRegister = document.getElementById("form-register");
  const tabLogin = document.getElementById("tab-auth-login");
  const tabRegister = document.getElementById("tab-auth-register");
  const linkToRegister = document.getElementById("link-to-register");
  const linkToLogin = document.getElementById("link-to-login");
  const authErrorBanner = document.getElementById("auth-error-banner");
  const authErrorText = document.getElementById("auth-error-text");

  function getLocalAccounts() {
    try {
      return JSON.parse(localStorage.getItem("sas_registered_accounts") || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveLocalAccount(account) {
    const accounts = getLocalAccounts();
    accounts[account.email.toLowerCase().trim()] = account;
    localStorage.setItem("sas_registered_accounts", JSON.stringify(accounts));
  }

  function getLocalAccount(email) {
    const accounts = getLocalAccounts();
    return accounts[email.toLowerCase().trim()] || null;
  }

  function activateUserSession(userData) {
    AppState.currentUser = { uid: userData.uid, email: userData.email };
    AppState.config.workerName = userData.name || userData.workerName || "";
    AppState.config.dni = userData.dni || "";
    AppState.config.category = userData.category || "";
    AppState.config.center = userData.center || "";
    AppState.config.service = userData.service || "Servicio Sanitario SAS";
    AppState.config.startDate = userData.startDate || `${currentYear}-01-01`;
    AppState.config.endDate = userData.endDate || `${currentYear}-12-31`;
    AppState.config.regime = userData.regime || "rotatorio";
    AppState.config.baseHours = userData.baseHours || 1483;
    AppState.calendarYear = parseISODate(AppState.config.startDate).getFullYear();
    AppState.calendarMonth = parseISODate(AppState.config.startDate).getMonth();

    localStorage.setItem("sas_active_session", JSON.stringify({
      uid: userData.uid,
      email: userData.email
    }));

    const savedCuad = localStorage.getItem(`sas_cuadrante_${userData.uid}`);
    if (savedCuad) {
      try {
        const parsed = JSON.parse(savedCuad);
        if (parsed.calendarShifts) AppState.calendarShifts = parsed.calendarShifts;
        if (parsed.monthlyTableData) AppState.monthlyTableData = parsed.monthlyTableData;
        if (parsed.config) Object.assign(AppState.config, parsed.config);
      } catch(e) {}
    } else {
      AppState.calendarShifts = {};
      AppState.monthlyTableData = Array.from({ length: 12 }, (_, i) => ({
        month: i,
        mananas: 0,
        tardes: 0,
        noches: 0,
        vacaciones: 0,
        moscosos: 0,
        dciHoras: 0,
        guardias: 0,
        isManual: false
      }));
    }

    if (authPortal) authPortal.classList.add("hidden");
    const userDisp = document.getElementById("user-display-email");
    if (userDisp) userDisp.textContent = userData.email;

    syncConfigInputsFromState();
    updateAll();
    triggerSave();
    showToast(`¡Bienvenido/a ${AppState.config.workerName || userData.email}! Cuadrante activado.`, "success");
  }

  // Restaurar sesión activa si ya existía en este navegador
  const activeSess = localStorage.getItem("sas_active_session");
  if (activeSess) {
    try {
      const sess = JSON.parse(activeSess);
      const acc = getLocalAccount(sess.email);
      if (acc) {
        activateUserSession(acc);
      }
    } catch(e) {}
  }

  function showAuthError(msg) {
    authErrorText.textContent = msg;
    authErrorBanner.classList.remove("hidden");
  }

  function showAuthErrorHtml(html) {
    authErrorText.innerHTML = html;
    authErrorBanner.classList.remove("hidden");
  }

  function clearAuthError() {
    authErrorBanner.classList.add("hidden");
  }

  function setAuthTab(tab) {
    clearAuthError();
    if (tab === "login") {
      formLogin.classList.remove("hidden");
      formRegister.classList.add("hidden");
      tabLogin.className = "flex-1 py-2 rounded-lg bg-white text-emerald-800 shadow-xs transition-all cursor-pointer font-bold";
      tabRegister.className = "flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition-all cursor-pointer font-bold";
    } else {
      formLogin.classList.add("hidden");
      formRegister.classList.remove("hidden");
      tabRegister.className = "flex-1 py-2 rounded-lg bg-white text-emerald-800 shadow-xs transition-all cursor-pointer font-bold";
      tabLogin.className = "flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition-all cursor-pointer font-bold";
    }
    if (authPortal) {
      authPortal.scrollTop = 0;
    }
  }

  if (tabLogin) tabLogin.addEventListener("click", () => setAuthTab("login"));
  if (tabRegister) tabRegister.addEventListener("click", () => setAuthTab("register"));
  if (linkToRegister) linkToRegister.addEventListener("click", () => setAuthTab("register"));
  if (linkToLogin) linkToLogin.addEventListener("click", () => setAuthTab("login"));

  // Configuración de visualización de contraseñas (botón del ojo)
  function setupPasswordToggle(btnId, inputId, iconEyeId, iconEyeOffId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    const iconEye = document.getElementById(iconEyeId);
    const iconEyeOff = document.getElementById(iconEyeOffId);

    if (btn && input) {
      btn.addEventListener("click", () => {
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        if (iconEye && iconEyeOff) {
          iconEye.classList.toggle("hidden", isPassword);
          iconEyeOff.classList.toggle("hidden", !isPassword);
        }
      });
    }
  }

  setupPasswordToggle("btn-toggle-login-password", "login-password", "icon-eye-login", "icon-eye-off-login");
  setupPasswordToggle("btn-toggle-reg-password", "reg-password", "icon-eye-reg", "icon-eye-off-reg");

  // Función para bloquear/desbloquear y hacer no editables los campos durante el login
  function setLoginFormLoading(isLoading) {
    const emailInput = document.getElementById("login-email");
    const passInput = document.getElementById("login-password");
    const submitBtn = document.getElementById("btn-submit-login");
    const togglePassBtn = document.getElementById("btn-toggle-login-password");
    const tabLogin = document.getElementById("tab-auth-login");
    const tabRegister = document.getElementById("tab-auth-register");
    const linkToReg = document.getElementById("link-to-register");

    if (emailInput) {
      emailInput.disabled = isLoading;
      emailInput.readOnly = isLoading;
      if (isLoading) {
        emailInput.classList.add("bg-slate-100", "cursor-not-allowed", "opacity-75");
      } else {
        emailInput.classList.remove("bg-slate-100", "cursor-not-allowed", "opacity-75");
      }
    }

    if (passInput) {
      passInput.disabled = isLoading;
      passInput.readOnly = isLoading;
      if (isLoading) {
        passInput.classList.add("bg-slate-100", "cursor-not-allowed", "opacity-75");
      } else {
        passInput.classList.remove("bg-slate-100", "cursor-not-allowed", "opacity-75");
      }
    }

    if (togglePassBtn) {
      togglePassBtn.disabled = isLoading;
      if (isLoading) togglePassBtn.classList.add("opacity-50", "pointer-events-none");
      else togglePassBtn.classList.remove("opacity-50", "pointer-events-none");
    }

    if (tabLogin) tabLogin.disabled = isLoading;
    if (tabRegister) tabRegister.disabled = isLoading;
    if (linkToReg) {
      if (isLoading) linkToReg.classList.add("pointer-events-none", "opacity-50");
      else linkToReg.classList.remove("pointer-events-none", "opacity-50");
    }

    if (submitBtn) {
      submitBtn.disabled = isLoading;
      if (isLoading) {
        submitBtn.classList.add("opacity-80", "cursor-not-allowed");
        submitBtn.innerHTML = `
          <svg class="animate-spin h-4 w-4 text-white shrink-0" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Conectando con el servicio SAS...</span>
        `;
      } else {
        submitBtn.classList.remove("opacity-80", "cursor-not-allowed");
        submitBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
          <span>Acceder a Mi Cuadrante</span>
        `;
      }
    }
  }

  // Login Submit con timeout y protección de campos no editables
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearAuthError();
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;

      setLoginFormLoading(true);

      const LOGIN_TIMEOUT_MS = 12000; // 12 segundos de margen para conexiones móviles/lentas
      let timeoutId = null;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutErr = new Error("Tiempo de espera agotado al conectar con el servidor.");
          timeoutErr.code = "auth/timeout";
          reject(timeoutErr);
        }, LOGIN_TIMEOUT_MS);
      });

      try {
        if (auth) {
          await Promise.race([
            signInWithEmailAndPassword(auth, email, password),
            timeoutPromise
          ]);
          // Éxito: onAuthStateChanged gestionará la sesión y ocultará el portal de login.
        } else {
          throw new Error("No hay conexión con el servicio de autenticación");
        }
      } catch (err) {
        console.warn("Login Error / Offline Fallback Check:", err);

        // Seguridad estricta: asegurar que el formulario de login SIGUE visible en caso de fallo o timeout
        if (authPortal) {
          authPortal.classList.remove("hidden");
        }

        const savedAcc = getLocalAccount(email);

        // Si la cuenta existe en almacenamiento local y la clave coincide exactamente, dar acceso offline:
        if (savedAcc && savedAcc.password && savedAcc.password === password) {
          activateUserSession(savedAcc);
          showToast("¡Sesión iniciada correctamente (modo local)! Cuadrante activado.", "success");
          return;
        }

        let friendly = "Error de acceso: ";
        if (err.code === "auth/timeout") {
          friendly = "Tiempo de espera agotado al conectar con el servicio SAS. Comprueba tu conexión a Internet o inténtalo de nuevo.";
        } else if (savedAcc && savedAcc.password && savedAcc.password !== password) {
          friendly = "Contraseña incorrecta para este usuario. Por favor, revísala e inténtalo de nuevo.";
        } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
          friendly = "Usuario o contraseña no válidos. Si no tienes cuenta aún en este dispositivo, pulsa 'Nuevo Registro'.";
        } else if (err.code === "auth/too-many-requests") {
          friendly = "Demasiados intentos fallidos. Por seguridad, espera unos momentos antes de reintentarlo.";
        } else if (err.code === "auth/unauthorized-domain") {
          friendly = `Dominio '${window.location.hostname}' no autorizado en Firebase. Regístrate en 'Nuevo Registro' para activar el gestor en este dispositivo.`;
        } else if (err.code === "auth/operation-not-allowed") {
          friendly = `El método de acceso por correo no está habilitado en Firebase (${firebaseConfig.projectId}). Regístrate en 'Nuevo Registro'.`;
        } else if (err.code === "auth/network-request-failed") {
          friendly = "Error de red al conectar con el servicio SAS. Comprueba tu conexión a Internet e inténtalo de nuevo.";
        } else {
          friendly += (err.message || "revisa los datos introducidos");
        }
        showAuthError(friendly);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        // Desbloquear siempre los campos para que permanezcan editables tras el intento
        setLoginFormLoading(false);
      }
    });
  }

  // Register Submit con Parámetros del Nombramiento
  if (formRegister) {
    formRegister.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearAuthError();

      const email = document.getElementById("reg-email").value.trim();
      const password = document.getElementById("reg-password").value;
      const name = document.getElementById("reg-name").value.trim();
      const dni = document.getElementById("reg-dni").value.trim();
      const category = document.getElementById("reg-category").value.trim();
      const center = document.getElementById("reg-center").value.trim();
      const startDate = document.getElementById("reg-start-date").value;
      const endDate = document.getElementById("reg-end-date").value;
      const regime = document.getElementById("reg-regime").value;

      let baseHours = 1483;
      if (regime === "diurno") baseHours = 1540;
      else if (regime === "nocturno") baseHours = 1450;

      const submitBtn = document.getElementById("btn-submit-register");

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Registrando profesional...";

        let user = null;
        if (auth) {
          try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            user = userCred.user;
          } catch (authErr) {
            console.warn("Firebase Auth Register warning:", authErr);
            if (authErr.code === "auth/email-already-in-use") {
              showAuthError("Este correo ya está registrado en Firebase. Inicia sesión directamente.");
              return;
            }
            if (authErr.code === "auth/weak-password") {
              showAuthError("La contraseña debe tener al menos 6 caracteres.");
              return;
            }
            // En caso de auth/unauthorized-domain, auth/operation-not-allowed o red offline,
            // continuamos creando y activando la cuenta localmente para que el usuario nunca se quede bloqueado.
          }
        }

        AppState.config.workerName = name;
        AppState.config.dni = dni;
        AppState.config.category = category;
        AppState.config.center = center;
        AppState.config.service = "Servicio Sanitario SAS";
        AppState.config.startDate = startDate;
        AppState.config.endDate = endDate;
        AppState.config.regime = regime;
        AppState.config.baseHours = baseHours;

        const uid = user ? user.uid : ("usr_" + Math.random().toString(36).substring(2, 10));
        const accountData = {
          uid: uid,
          email: email,
          password: password,
          name: name,
          dni: dni,
          category: category,
          center: center,
          service: "Servicio Sanitario SAS",
          startDate: startDate,
          endDate: endDate,
          regime: regime,
          baseHours: baseHours
        };
        saveLocalAccount(accountData);

        if (user && db) {
          try {
            await setDoc(doc(db, "users", user.uid), {
              userId: user.uid,
              email: email,
              workerName: name,
              category: category,
              center: center,
              service: "Servicio Sanitario SAS",
              dni: dni,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            await setDoc(doc(db, "users", user.uid, "data", "cuadrante"), {
              userId: user.uid,
              startDate: startDate,
              endDate: endDate,
              regime: regime,
              baseHours: baseHours,
              hoursM: 7.0,
              hoursT: 7.0,
              hoursN: 10.0,
              hoursS: 0.0,
              hoursV: 7.0,
              hoursLD: 7.0,
              hoursDCI: 7.0,
              proposedDates: "",
              calendarShifts: {},
              monthlyTableData: Array.from({ length: 12 }, (_, i) => ({
                month: i,
                mananas: 0,
                tardes: 0,
                noches: 0,
                vacaciones: 0,
                moscosos: 0,
                dciHoras: 0,
                guardias: 0,
                isManual: false
              })),
              calendarYear: parseISODate(startDate).getFullYear(),
              updatedAt: new Date().toISOString()
            });
          } catch (syncErr) {
            console.warn("Firestore save warning:", syncErr);
          }
        }

        activateUserSession(accountData);
        showToast("¡Registro completado con éxito! Bienvenido/a a tu cuadrante.", "success");
      } catch (err) {
        console.error("Register Error:", err);
        showAuthError("Error de registro: " + (err.message || "revisa los datos"));
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
          <span>Crear Cuenta y Activar Cuadrante</span>
        `;
      }
    });
  }

  // Firebase auth state listener
  if (auth) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        AppState.currentUser = user;
        authPortal.classList.add("hidden");
        document.getElementById("user-display-email").textContent = user.email || "Usuario SAS";
        await loadUserData(user);
      } else {
        const activeSess = localStorage.getItem("sas_active_session");
        if (activeSess) {
          try {
            const sess = JSON.parse(activeSess);
            const acc = getLocalAccount(sess.email);
            if (acc) {
              activateUserSession(acc);
              return;
            }
          } catch(e) {}
        }
        AppState.currentUser = null;
        authPortal.classList.remove("hidden");
        document.getElementById("user-display-email").textContent = "Sin sesión";
      }
    });
  }

  // Logout
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      showModal("Cerrar Sesión", "¿Deseas salir y cerrar tu sesión en este dispositivo?", async () => {
        localStorage.removeItem("sas_active_session");
        AppState.currentUser = null;
        if (auth) {
          try { await signOut(auth); } catch(e) {}
        }
        authPortal.classList.remove("hidden");
        document.getElementById("user-display-email").textContent = "Sin sesión";
        showToast("Sesión cerrada correctamente", "info");
      });
    });
  }

  // Modal modificar parámetros del nombramiento
  const editModal = document.getElementById("edit-params-modal");
  const btnOpenEdit = document.getElementById("btn-open-edit-params");
  const btnCloseEdit = document.getElementById("btn-close-edit-params");
  const btnCancelEdit = document.getElementById("btn-cancel-edit-params");
  const formEditParams = document.getElementById("form-edit-params");

  if (btnOpenEdit) {
    btnOpenEdit.addEventListener("click", () => {
      syncEditModalInputsFromState();
      editModal.classList.remove("hidden");
    });
  }

  if (btnCloseEdit) btnCloseEdit.addEventListener("click", () => editModal.classList.add("hidden"));
  if (btnCancelEdit) btnCancelEdit.addEventListener("click", () => editModal.classList.add("hidden"));

  const editRegime = document.getElementById("edit-regime");
  if (editRegime) {
    editRegime.addEventListener("change", (e) => {
      const reg = e.target.value;
      if (reg === "diurno") document.getElementById("edit-base-hours").value = 1540;
      else if (reg === "rotatorio") document.getElementById("edit-base-hours").value = 1483;
      else if (reg === "nocturno") document.getElementById("edit-base-hours").value = 1450;
    });
  }

  if (formEditParams) {
    formEditParams.addEventListener("submit", (e) => {
      e.preventDefault();
      AppState.config.workerName = document.getElementById("edit-worker-name").value.trim();
      AppState.config.dni = document.getElementById("edit-worker-dni").value.trim();
      AppState.config.category = document.getElementById("edit-category").value.trim();
      AppState.config.center = document.getElementById("edit-center").value.trim();
      AppState.config.service = document.getElementById("edit-service").value.trim();
      AppState.config.startDate = document.getElementById("edit-start-date").value;
      AppState.config.endDate = document.getElementById("edit-end-date").value;
      AppState.config.regime = document.getElementById("edit-regime").value;
      AppState.config.baseHours = parseFloat(document.getElementById("edit-base-hours").value) || 1483;

      const startYear = parseISODate(AppState.config.startDate).getFullYear();
      AppState.calendarYear = startYear;

      syncConfigInputsFromState();
      updateAll();
      editModal.classList.add("hidden");
      showToast("¡Parámetros del nombramiento actualizados con éxito!", "success");
    });
  }

  // Tabs de la aplicación
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      AppState.activeTab = target;

      document.querySelectorAll(".tab-btn").forEach(b => {
        b.className = "tab-btn flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-100";
      });
      btn.className = "tab-btn flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer bg-emerald-700 text-white shadow-xs";

      document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      const activePanel = document.getElementById(`tab-${target}`);
      if (activePanel) activePanel.classList.remove("hidden");

      if (target === "calendar") {
        clearActiveBrush();
        renderCalendar();
      }
      if (target === "table") renderTable();
      if (target === "request") renderRequestLetter();
    });
  });

  // Pinceles de Turno
  document.querySelectorAll(".brush-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const brush = btn.dataset.brush;
      if (AppState.activeBrush === brush) {
        clearActiveBrush();
        showToast("Pincel deseleccionado", "info");
        return;
      }
      setActiveBrush(brush);
      showToast(`Pincel seleccionado: [${brush}]`, "info");
    });
  });

  // Navegación Calendario
  const btnCalPrev = document.getElementById("cal-btn-prev");
  if (btnCalPrev) {
    btnCalPrev.addEventListener("click", () => {
      clearActiveBrush();
      if (AppState.calendarMonth > 0) {
        AppState.calendarMonth--;
      } else {
        AppState.calendarMonth = 11;
        AppState.calendarYear--;
        syncYearDropdown();
      }
      updateAll();
    });
  }

  const btnCalNext = document.getElementById("cal-btn-next");
  if (btnCalNext) {
    btnCalNext.addEventListener("click", () => {
      clearActiveBrush();
      if (AppState.calendarMonth < 11) {
        AppState.calendarMonth++;
      } else {
        AppState.calendarMonth = 0;
        AppState.calendarYear++;
        syncYearDropdown();
      }
      updateAll();
    });
  }

  const selCalMonth = document.getElementById("cal-select-month");
  if (selCalMonth) {
    selCalMonth.addEventListener("change", (e) => {
      clearActiveBrush();
      AppState.calendarMonth = parseInt(e.target.value, 10);
      renderCalendar();
    });
  }

  // Selector de Año Abierto en la Cabecera
  const inputYear = document.getElementById("header-input-year");
  const btnYearPrev = document.getElementById("header-btn-year-prev");
  const btnYearNext = document.getElementById("header-btn-year-next");
  const headerSelYear = document.getElementById("header-select-year");

  if (inputYear) {
    inputYear.value = AppState.calendarYear;
    const applyYearFromInput = () => {
      const val = parseInt(inputYear.value, 10);
      if (!isNaN(val) && val >= 1990 && val <= 2150) {
        if (AppState.calendarYear !== val) {
          clearActiveBrush();
          AppState.calendarYear = val;
          syncYearDropdown();
          updateAll();
          showToast(`Año de trabajo: ${val}`, "info");
        }
      } else {
        inputYear.value = AppState.calendarYear;
      }
    };
    inputYear.addEventListener("change", applyYearFromInput);
    inputYear.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        inputYear.blur();
        applyYearFromInput();
      }
    });
  }

  if (btnYearPrev) {
    btnYearPrev.addEventListener("click", () => {
      clearActiveBrush();
      AppState.calendarYear--;
      syncYearDropdown();
      updateAll();
      showToast(`Año de trabajo: ${AppState.calendarYear}`, "info");
    });
  }

  if (btnYearNext) {
    btnYearNext.addEventListener("click", () => {
      clearActiveBrush();
      AppState.calendarYear++;
      syncYearDropdown();
      updateAll();
      showToast(`Año de trabajo: ${AppState.calendarYear}`, "info");
    });
  }

  if (headerSelYear) {
    headerSelYear.value = String(AppState.calendarYear);
    headerSelYear.addEventListener("change", (e) => {
      const selectedYear = parseInt(e.target.value, 10);
      if (selectedYear && !isNaN(selectedYear)) {
        clearActiveBrush();
        AppState.calendarYear = selectedYear;
        syncYearDropdown();
        updateAll();
        showToast(`Año de trabajo: ${selectedYear}`, "info");
      }
    });
  }
  const btnExportPdf = document.getElementById("btn-export-pdf");
  if (btnExportPdf) {
    btnExportPdf.addEventListener("click", exportarPDF);
  }
  const btnExportCsv = document.getElementById("btn-export-csv");
  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", exportarPDF);
  }

  // Fechas propuestas para DCI
  const reqDatesInput = document.getElementById("req-proposed-dates");
  if (reqDatesInput) {
    reqDatesInput.addEventListener("input", (e) => {
      AppState.config.proposedDates = e.target.value;
      renderRequestLetter();
      triggerSave();
    });
  }

  // Copiar Solicitud
  const btnCopyReq = document.getElementById("btn-copy-request");
  if (btnCopyReq) {
    btnCopyReq.addEventListener("click", () => {
      const text = document.getElementById("request-preview-box").textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast("¡Solicitud copiada al portapapeles!", "success");
        }).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    });
  }

  function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      showToast("¡Solicitud copiada al portapapeles!", "success");
    } catch (err) {
      showToast("Selecciona y copia el texto manualmente", "warning");
    }
    document.body.removeChild(textArea);
  }

  const btnPrintReq = document.getElementById("btn-print-request");
  if (btnPrintReq) btnPrintReq.addEventListener("click", () => window.print());
  const btnPrintTab = document.getElementById("btn-print-table");
  if (btnPrintTab) btnPrintTab.addEventListener("click", () => window.print());

  // Atajos de teclado para turnos (M, T, N, 2/B, V, L, D, X, Esc)
  window.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const key = e.key.toUpperCase();
    if (key === "M") selectBrush("M");
    else if (key === "T") selectBrush("T");
    else if (key === "N") selectBrush("N");
    else if (key === "2" || key === "B") selectBrush("MN");
    else if (key === "V") selectBrush("V");
    else if (key === "L") selectBrush("LD");
    else if (key === "D") selectBrush("DCI");
    else if (key === "X" || key === "DELETE" || key === "BACKSPACE") selectBrush("CLEAR");
    else if (key === "ESCAPE") {
      clearActiveBrush();
      showToast("Pincel deseleccionado", "info");
    }
  });

  function selectBrush(brushCode) {
    const btn = document.querySelector(`.brush-btn[data-brush="${brushCode}"]`);
    if (btn) btn.click();
  }

  // Asegurar que al inicio no haya ningún pincel preseleccionado
  clearActiveBrush();
}

// Inicialización inmediata o al completar la carga del DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
