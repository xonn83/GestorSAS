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
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    proposedDates: ""
  },
  calendarYear: currentYear,
  calendarMonth: currentMonth,
  activeBrush: "M",
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
  const yearDays = getDaysInYear(year);
  const baseHours = parseFloat(AppState.config.baseHours) || 1483;
  return parseFloat(((activeDays / yearDays) * baseHours).toFixed(1));
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
  renderProjection();
  renderRequestLetter();
  triggerSave();
}

export function getAccumulatedMetrics() {
  const year = AppState.calendarYear;
  const yearDays = getDaysInYear(year);
  const totalContractReq = getContractRequiredHoursTotal();

  let totalActiveDaysInYear = 0;
  let totalWorkedAllYear = 0;

  let filledMonthsCount = 0;
  let lastFilledMonth = -1;
  let workedInFilledMonths = 0;
  let requiredInFilledMonths = 0;

  AppState.monthlyTableData.forEach((row, m) => {
    const actDays = getMonthActiveContractDays(year, m);
    totalActiveDaysInYear += actDays;

    const actHours = getMonthActualHours(m);
    totalWorkedAllYear += actHours;

    const hasShifts = (
      (row.mananas || 0) > 0 ||
      (row.tardes || 0) > 0 ||
      (row.noches || 0) > 0 ||
      (row.vacaciones || 0) > 0 ||
      (row.moscosos || 0) > 0 ||
      ((row.dciHoras || 0) !== 0)
    );

    if (actDays > 0 && hasShifts) {
      filledMonthsCount++;
      lastFilledMonth = m;
      workedInFilledMonths += actHours;
      requiredInFilledMonths += getMonthRequiredHours(year, m);
    }
  });

  let accumulatedBalance = 0.0;
  if (filledMonthsCount > 0) {
    accumulatedBalance = parseFloat((workedInFilledMonths - requiredInFilledMonths).toFixed(1));
  }

  const dciHoursPerDay = parseFloat(AppState.config.hoursDCI) || 7.0;
  const dciDays = accumulatedBalance > 0 ? Math.floor(accumulatedBalance / dciHoursPerDay) : 0;
  const dciRemainderHours = accumulatedBalance > 0 ? parseFloat((accumulatedBalance % dciHoursPerDay).toFixed(1)) : 0.0;

  // Progreso real de horas sobre la jornada anual
  const progressPercent = totalContractReq > 0
    ? Math.min(100, Math.round((totalWorkedAllYear / totalContractReq) * 100))
    : 0;

  const remainingHoursAnnual = Math.max(0, parseFloat((totalContractReq - totalWorkedAllYear).toFixed(1)));
  const shiftM = parseFloat(AppState.config.hoursM) || 7.0;
  const remainingShifts = Math.ceil(remainingHoursAnnual / shiftM);

  return {
    year,
    yearDays,
    totalContractReq,
    totalActiveDaysInYear,
    totalWorkedAllYear,
    filledMonthsCount,
    lastFilledMonth,
    lastFilledMonthName: lastFilledMonth >= 0 ? MONTH_NAMES[lastFilledMonth] : null,
    workedInFilledMonths,
    requiredInFilledMonths,
    accumulatedBalance,
    dciDays,
    dciRemainderHours,
    progressPercent,
    remainingHoursAnnual,
    remainingShifts
  };
}

function renderKpis() {
  const metrics = getAccumulatedMetrics();

  const balanceEl = document.getElementById("kpi-balance");
  const balanceLabel = document.getElementById("kpi-balance-label");
  const balanceBadge = document.getElementById("kpi-balance-badge");
  const balanceSub = document.getElementById("kpi-balance-sub");
  const balanceBar = document.getElementById("kpi-balance-bar");

  const sign = metrics.accumulatedBalance > 0 ? "+" : "";
  balanceEl.textContent = `${sign}${metrics.accumulatedBalance.toLocaleString("es-ES", { minimumFractionDigits: 1 })} h`;

  if (metrics.filledMonthsCount === 0) {
    balanceEl.className = "text-xl sm:text-3xl font-black text-slate-700 tracking-tight font-mono block";
    balanceLabel.textContent = "Sin registros aún";
    balanceBadge.className = "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-slate-100 text-slate-600 shrink-0";
    balanceBadge.textContent = "Sin datos";
    balanceSub.textContent = `0,0h de ${metrics.totalContractReq.toFixed(0)}h anuales`;
  } else {
    balanceSub.textContent = `${metrics.workedInFilledMonths.toFixed(1)}h / ${metrics.requiredInFilledMonths.toFixed(1)}h exig. (a ${metrics.lastFilledMonthName})`;

    if (metrics.accumulatedBalance > 0) {
      balanceEl.className = "text-xl sm:text-3xl font-black text-emerald-600 tracking-tight font-mono block";
      balanceLabel.textContent = `Exceso hasta ${metrics.lastFilledMonthName}`;
      balanceBadge.className = "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-100 text-emerald-800 shrink-0";
      balanceBadge.textContent = "A Favor";
    } else if (metrics.accumulatedBalance < 0) {
      balanceEl.className = "text-xl sm:text-3xl font-black text-rose-600 tracking-tight font-mono block";
      balanceLabel.textContent = `Déficit hasta ${metrics.lastFilledMonthName}`;
      balanceBadge.className = "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-rose-100 text-rose-800 shrink-0";
      balanceBadge.textContent = "Déficit";
    } else {
      balanceEl.className = "text-xl sm:text-3xl font-black text-slate-800 tracking-tight font-mono block";
      balanceLabel.textContent = `Al día hasta ${metrics.lastFilledMonthName}`;
      balanceBadge.className = "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-slate-100 text-slate-800 shrink-0";
      balanceBadge.textContent = "Al día";
    }
  }

  // KPI 2: Días DCI (a mes rellenado)
  const dciDaysEl = document.getElementById("kpi-dci-days");
  const dciSubEl = document.getElementById("kpi-dci-sub");

  if (metrics.accumulatedBalance > 0) {
    dciDaysEl.textContent = `${metrics.dciDays} Días`;
    dciSubEl.textContent = `+${metrics.dciRemainderHours}h bolsa (a ${metrics.lastFilledMonthName})`;
  } else {
    dciDaysEl.textContent = "0 Días";
    dciSubEl.textContent = metrics.filledMonthsCount > 0 ? `Sin exceso a ${metrics.lastFilledMonthName}` : "Sin registros";
  }

  // KPI 3: Cuota Anual y Barra de Progreso de Horas Cumplidas
  document.getElementById("kpi-required-hours").textContent = `${metrics.totalContractReq.toFixed(1)} h`;
  document.getElementById("kpi-contract-days").textContent = `${metrics.totalActiveDaysInYear} d (${metrics.year})`;
  document.getElementById("kpi-required-percent").textContent = `${metrics.progressPercent}%`;

  if (balanceBar) {
    balanceBar.style.width = `${metrics.progressPercent}%`;
    balanceBar.className = metrics.progressPercent >= 100
      ? "bg-emerald-500 h-full rounded-full transition-all duration-500"
      : "bg-emerald-600 h-full rounded-full transition-all duration-500";
  }

  // KPI 4: Turnos Restantes para Fin de Contrato
  document.getElementById("kpi-remaining-shifts").textContent = `${metrics.remainingShifts} turnos`;
  document.getElementById("kpi-remaining-hours").textContent = `${metrics.remainingHoursAnnual.toFixed(1)} h pend.`;
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
  const sign = monthBal > 0 ? "+" : "";

  document.getElementById("cal-month-worked").textContent = `${monthAct.toFixed(1)}h`;
  document.getElementById("cal-month-required").textContent = `${monthReq.toFixed(1)}h`;
  const balEl = document.getElementById("cal-month-balance");
  balEl.textContent = `${sign}${monthBal.toFixed(1)}h`;
  balEl.className = monthBal >= 0 ? "font-black font-mono text-emerald-600" : "font-black font-mono text-rose-600";

  document.getElementById("cal-month-breakdown").innerHTML = `
    <span>Desglose de ${MONTH_NAMES[month]}:</span>
    <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 font-mono">${mCount} M</span>
    <span class="px-2 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-200 font-mono">${tCount} T</span>
    <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-200 font-mono">${nCount} N</span>
    ${mnCount > 0 ? `<span class="px-2 py-0.5 rounded bg-fuchsia-100 text-fuchsia-950 border border-fuchsia-300 font-mono font-bold">${mnCount} MN (Doble)</span>` : ''}
    <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200 font-mono">${vCount} V</span>
    <span class="px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200 font-mono">${ldCount} LD</span>
    <span class="px-2 py-0.5 rounded bg-cyan-100 text-cyan-900 border border-cyan-200 font-mono">${dciCount} DCI</span>
  `;
}

function applyBrushToDate(dateStr) {
  if (!isDateInsideContract(dateStr)) return;

  const d = parseISODate(dateStr);
  const dayOfWeek = d.getDay(); // 0 = Domingo, 6 = Sábado
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

  // Validación: En régimen diurno (L-V), no se pueden asignar vacaciones ni permisos en días no laborables
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

  if (AppState.activeBrush === "CLEAR") {
    delete AppState.calendarShifts[dateStr];
  } else {
    AppState.calendarShifts[dateStr] = AppState.activeBrush;
  }

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
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-300">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 bg-slate-100/40 cell-actual">0.0</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 cell-balance">-</td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-400 cell-accum">-</td>
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
        <td class="py-2.5 px-2 text-center font-mono font-bold text-emerald-900">${row.vacaciones || 0}</td>
        <td class="py-2.5 px-2 text-center font-mono font-bold text-purple-900">${row.moscosos || 0}</td>
        <td class="py-2.5 px-2 text-center font-mono font-bold text-cyan-900">${row.dciHoras ? (row.dciHoras + 'h') : '0h'}</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 cell-actual">-</td>
        <td class="py-2.5 px-2 text-center font-mono text-slate-400 cell-balance">-</td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-400 cell-accum">-</td>
      `;

      tr.addEventListener("click", () => {
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
  let totActiveDays = 0;
  let totReqHours = 0;
  let totMananas = 0;
  let totTardes = 0;
  let totNoches = 0;
  let totVacaciones = 0;
  let totMoscosos = 0;
  let totDciHoras = 0;
  let totGuardias = 0;
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
          cellAcc.className = "py-2.5 px-3 text-right font-mono font-black cell-accum text-slate-400";
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
          cellAcc.className = "py-2.5 px-3 text-right font-mono text-slate-400 cell-accum";
        }
      }
      return;
    }

    const actHours = getMonthActualHours(m);
    const monthBal = parseFloat((actHours - reqHours).toFixed(1));

    totActiveDays += activeDays;
    totReqHours += reqHours;
    totMananas += row.mananas;
    totTardes += row.tardes;
    totNoches += row.noches;
    totVacaciones += row.vacaciones;
    totMoscosos += row.moscosos;
    totDciHoras += row.dciHoras;
    totActualHours += actHours;
    runningAccumBalance += monthBal;

    if (tr) {
      const signMonth = monthBal > 0 ? "+" : "";
      const signAccum = runningAccumBalance > 0 ? "+" : "";

      const cellAct = tr.querySelector(".cell-actual");
      if (cellAct) {
        cellAct.textContent = actHours.toFixed(1);
        cellAct.className = "py-2.5 px-2 text-center font-mono font-bold bg-slate-100/70 text-slate-900 cell-actual";
      }

      const cellBal = tr.querySelector(".cell-balance");
      if (cellBal) {
        cellBal.textContent = `${signMonth}${monthBal.toFixed(1)}`;
        cellBal.className = `py-2.5 px-2 text-center font-mono font-bold cell-balance ${monthBal >= 0 ? 'text-emerald-700' : 'text-rose-600'}`;
      }

      const cellAcc = tr.querySelector(".cell-accum");
      if (cellAcc) {
        cellAcc.textContent = `${signAccum}${runningAccumBalance.toFixed(1)} h`;
        cellAcc.className = `py-2.5 px-3 text-right font-mono font-black cell-accum ${runningAccumBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`;
      }
    }
  });

  const accumSign = runningAccumBalance > 0 ? "+" : "";
  const tfoot = document.getElementById("gerhonte-table-totals");
  if (tfoot) {
    tfoot.innerHTML = `
      <td class="sticky left-0 bg-slate-100 z-10 py-3 px-3 text-left font-black border-r border-slate-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">TOTAL AUDITADO (${year})</td>
      <td class="py-3 px-2 font-mono">${totActiveDays} d</td>
      <td class="py-3 px-2 font-mono bg-emerald-100/70 text-emerald-950" title="Cuota exigible acumulada en meses con registros">${totReqHours.toFixed(1)} h</td>
      <td class="py-3 px-2 font-mono font-bold text-amber-900">${totMananas}</td>
      <td class="py-3 px-2 font-mono font-bold text-orange-900">${totTardes}</td>
      <td class="py-3 px-2 font-mono font-bold text-indigo-900">${totNoches}</td>
      <td class="py-3 px-2 font-mono font-bold text-emerald-900">${totVacaciones}</td>
      <td class="py-3 px-2 font-mono font-bold text-purple-900">${totMoscosos}</td>
      <td class="py-3 px-2 font-mono font-bold text-cyan-900">${totDciHoras} h</td>
      <td class="py-3 px-2 font-mono font-black bg-slate-200">${totActualHours.toFixed(1)} h</td>
      <td class="py-3 px-2 font-mono font-black ${ runningAccumBalance >= 0 ? 'text-emerald-800' : 'text-rose-700'}">
        ${accumSign}${runningAccumBalance.toFixed(1)} h
      </td>
      <td class="py-3 px-3 text-right font-mono font-black text-sm ${runningAccumBalance >= 0 ? 'text-emerald-800' : 'text-rose-700'}">
        ${accumSign}${runningAccumBalance.toFixed(1)} h
      </td>
    `;
  }
}

function renderProjection() {
  const metrics = getAccumulatedMetrics();
  const year = metrics.year;
  const currentBalance = metrics.accumulatedBalance;
  const remainingHoursTotal = metrics.remainingHoursAnnual;
  const shiftDuration = parseFloat(AppState.config.hoursM) || 7.0;

  const tag = document.getElementById("proj-status-tag");
  const headline = document.getElementById("proj-headline");
  const desc = document.getElementById("proj-description");
  const dciAvail = document.getElementById("proj-dci-available");
  const dciHours = parseFloat(AppState.config.hoursDCI) || 7.0;

  const maxDciPossible = metrics.dciDays;
  dciAvail.textContent = `${maxDciPossible} DCI`;

  if (metrics.filledMonthsCount === 0) {
    tag.className = "px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-slate-600 text-white";
    tag.textContent = "Sin Registros";
    headline.textContent = "Aún no hay turnos registrados en este año";
    desc.textContent = "Rellena los turnos trabajados en el Calendario o en el Resumen para calcular tu bolsa y proyección.";
  } else if (currentBalance >= 7) {
    tag.className = "px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-emerald-600 text-white";
    tag.textContent = "Superávit Acumulado";
    headline.textContent = `Tienes ${currentBalance} horas a favor hasta ${metrics.lastFilledMonthName} (equivalente a ${maxDciPossible} días DCI)`;
    desc.textContent = "¡Atención! Solicita formalmente librar estos descansos antes de tu cese para no perderlos.";
  } else if (currentBalance < -7) {
    tag.className = "px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-rose-600 text-white";
    tag.textContent = "Déficit Horario";
    headline.textContent = `Llevas un desfase de ${Math.abs(currentBalance)} horas respecto a la cuota exigible a ${metrics.lastFilledMonthName}`;
    desc.textContent = "Planifica turnos complementarios en los meses restantes para evitar deducciones.";
  } else {
    tag.className = "px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-slate-700 text-white";
    tag.textContent = "Jornada Equilibrada";
    headline.textContent = `Tu saldo de horas está prácticamente a cero a ${metrics.lastFilledMonthName}`;
    desc.textContent = "Mantén la asignación ordinaria de turnos mes a mes para concluir el año al 100%.";
  }

  const endMonth = parseISODate(AppState.config.endDate).getMonth();
  const pendingContainer = document.getElementById("proj-pending-months-list");
  pendingContainer.innerHTML = "";

  let pendingMonthsCount = 0;
  let pendingRequiredSum = 0;

  for (let m = 0; m <= endMonth; m++) {
    const act = getMonthActualHours(m);
    const req = getMonthRequiredHours(year, m);
    const row = AppState.monthlyTableData[m];
    const hasShifts = row && (
      (row.mananas || 0) > 0 ||
      (row.tardes || 0) > 0 ||
      (row.noches || 0) > 0 ||
      (row.vacaciones || 0) > 0 ||
      (row.moscosos || 0) > 0 ||
      ((row.dciHoras || 0) !== 0)
    );

    if (!hasShifts && req > 0) {
      pendingMonthsCount++;
      pendingRequiredSum += req;
      const recShifts = Math.ceil(req / shiftDuration);
      const div = document.createElement("div");
      div.className = "p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between";
      div.innerHTML = `
        <span class="font-bold text-slate-800">${MONTH_NAMES[m]}</span>
        <div class="flex items-center gap-3">
          <span class="text-slate-500 font-mono">Cuota: ${req.toFixed(1)}h</span>
          <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-semibold font-mono text-[11px]">${recShifts} turnos rec.</span>
        </div>
      `;
      pendingContainer.appendChild(div);
    }
  }

  if (pendingMonthsCount === 0) {
    pendingContainer.innerHTML = `<div class="p-3 text-slate-400 text-center italic bg-white rounded-lg">Todos los meses activos tienen ya turnos registrados.</div>`;
  }

  const slider = document.getElementById("slider-dci");
  slider.max = Math.max(10, maxDciPossible + 5);
  slider.value = AppState.simulatedDciDays;
  const simDays = parseInt(slider.value, 10);
  const simHours = simDays * dciHours;
  document.getElementById("slider-dci-val").textContent = `${simDays} días (${simHours}h)`;

  const simulatedBalance = parseFloat((currentBalance - simHours).toFixed(1));
  const simSign = simulatedBalance > 0 ? "+" : "";
  const simBalEl = document.getElementById("proj-simulated-balance");
  simBalEl.textContent = `${simSign}${simulatedBalance.toFixed(1)} h`;
  simBalEl.className = simulatedBalance >= 0 ? "font-bold font-mono text-emerald-700" : "font-bold font-mono text-rose-700";

  const simRemainingShifts = pendingMonthsCount > 0 ? (remainingHoursTotal / pendingMonthsCount / shiftDuration).toFixed(1) : "0";
  document.getElementById("proj-simulated-monthly-shifts").textContent = `${simRemainingShifts} turnos/mes`;
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
  const year = AppState.calendarYear;
  const metrics = getAccumulatedMetrics();
  const cfg = AppState.config || {};

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
      label: "SALDO BOLSA ACUMULADO",
      val: balanceVal,
      sub: balanceState,
      sub2: balanceSub,
      color: balanceColor,
      bg: balanceBg
    },
    {
      label: "DÍAS DCI DISPONIBLES",
      val: `${metrics.dciDays} DÍAS`,
      sub: metrics.accumulatedBalance > 0 ? `+${metrics.dciRemainderHours.toFixed(1)} h en bolsa` : "Sin exceso de jornada",
      sub2: `Módulo: ${cfg.hoursDCI || 7} h/día`,
      color: [4, 120, 87],
      bg: [236, 253, 245]
    },
    {
      label: `JORNADA EXIGIBLE (${year})`,
      val: `${metrics.totalContractReq.toFixed(1)} h`,
      sub: `Progreso: ${metrics.progressPercent}% (${metrics.totalWorkedAllYear.toFixed(1)} h)`,
      sub2: `${metrics.totalActiveDaysInYear} días de contrato`,
      color: [15, 23, 42],
      bg: [248, 250, 252]
    },
    {
      label: "TURNOS PENDIENTES",
      val: `${metrics.remainingShifts} turnos`,
      sub: `${metrics.remainingHoursAnnual.toFixed(1)} h restantes`,
      sub2: "Para completar nombramiento",
      color: [71, 85, 105],
      bg: [248, 250, 252]
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
  let totActiveDays = 0;
  let totReqHours = 0;
  let totMananas = 0;
  let totTardes = 0;
  let totNoches = 0;
  let totVacaciones = 0;
  let totMoscosos = 0;
  let totDciHoras = 0;
  let totActualHours = 0;
  let runningAccum = 0;

  const tableBody = AppState.monthlyTableData.map((row, m) => {
    const activeDays = getMonthActiveContractDays(year, m);
    const reqHours = getMonthRequiredHours(year, m);

    if (activeDays === 0) {
      return [MONTH_NAMES[m], "0 d", "0.0 h", "-", "-", "-", "-", "-", "0 h", "0.0 h", "-", "-"];
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
        "0", "0", "0", "0", "0",
        "0 h",
        "0.0 h",
        "Pendiente",
        "-"
      ];
    }

    const actHours = getMonthActualHours(m);
    const monthBal = parseFloat((actHours - reqHours).toFixed(1));

    totActiveDays += activeDays;
    totReqHours += reqHours;
    totMananas += (row.mananas || 0);
    totTardes += (row.tardes || 0);
    totNoches += (row.noches || 0);
    totVacaciones += (row.vacaciones || 0);
    totMoscosos += (row.moscosos || 0);
    totDciHoras += (row.dciHoras || 0);
    totActualHours += actHours;
    runningAccum += monthBal;

    const signMonth = monthBal > 0 ? "+" : "";
    const signAccum = runningAccum > 0 ? "+" : "";

    return [
      MONTH_NAMES[m],
      `${activeDays} d`,
      `${reqHours.toFixed(1)} h`,
      String(row.mananas || 0),
      String(row.tardes || 0),
      String(row.noches || 0),
      String(row.vacaciones || 0),
      String(row.moscosos || 0),
      row.dciHoras ? `${row.dciHoras} h` : "0 h",
      `${actHours.toFixed(1)} h`,
      `${signMonth}${monthBal.toFixed(1)} h`,
      `${signAccum}${runningAccum.toFixed(1)} h`
    ];
  });

  const totalAccumSign = runningAccum > 0 ? "+" : "";
  const tableFoot = [[
    `TOTAL AUDITADO (${year})`,
    `${totActiveDays} d`,
    `${totReqHours.toFixed(1)} h`,
    String(totMananas),
    String(totTardes),
    String(totNoches),
    String(totVacaciones),
    String(totMoscosos),
    `${totDciHoras} h`,
    `${totActualHours.toFixed(1)} h`,
    `${totalAccumSign}${runningAccum.toFixed(1)} h`,
    `${totalAccumSign}${runningAccum.toFixed(1)} h`
  ]];

  autoTable(doc, {
    startY: 82,
    margin: { left: margin, right: margin },
    head: [["Mes", "Días", "Cuota (h)", "M", "T", "N", "V", "LD", "DCI", "Efectivas", "Saldo Mes", "Saldo Acum."]],
    body: tableBody,
    foot: tableFoot,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.6,
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
      fontSize: 7.5,
      halign: "center"
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center"
    },
    columnStyles: {
      0: { halign: "left", fontStyle: "bold", cellWidth: 26 },
      1: { cellWidth: 14 },
      2: { cellWidth: 17 },
      3: { cellWidth: 11, fontStyle: "bold" },
      4: { cellWidth: 11, fontStyle: "bold" },
      5: { cellWidth: 11, fontStyle: "bold" },
      6: { cellWidth: 11, fontStyle: "bold" },
      7: { cellWidth: 11, fontStyle: "bold" },
      8: { cellWidth: 13, fontStyle: "bold" },
      9: { cellWidth: 18, fontStyle: "bold" },
      10: { cellWidth: 18, fontStyle: "bold" },
      11: { cellWidth: 25, fontStyle: "bold", halign: "right" }
    },
    didParseCell: function(data) {
      if (data.section === "body") {
        const text = data.cell.raw || "";
        if (data.column.index === 10 || data.column.index === 11) {
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

  const finalY = doc.lastAutoTable.finalY + 4;

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
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Mes;Dias Contrato;Cuota Exigible (h);Mananas;Tardes;Noches;Vacaciones;Moscosos (LD);DCI (h);Horas Efectivas;Saldo Mes (h);Estado\r\n";

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
      csvContent += `${MONTH_NAMES[m]};0;0.0;0;0;0;0;0;0;0.0;0.0;Inactivo (Sin Contrato)\r\n`;
    } else if (!hasShifts) {
      csvContent += `${MONTH_NAMES[m]};${activeDays};${reqHours.toFixed(1)};0;0;0;0;0;0;0.0;-;Pendiente de rellenar\r\n`;
    } else {
      const actHours = getMonthActualHours(m);
      const monthBal = (actHours - reqHours).toFixed(1);
      csvContent += `${MONTH_NAMES[m]};${activeDays};${reqHours.toFixed(1)};${row.mananas};${row.tardes};${row.noches};${row.vacaciones};${row.moscosos};${row.dciHoras};${actHours.toFixed(1)};${monthBal};Auditado\r\n`;
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

export function showModal(title, message, onConfirm) {
  const modal = document.getElementById("modal-container");
  const titleEl = document.getElementById("modal-title");
  const msgEl = document.getElementById("modal-message");
  const btnConfirm = document.getElementById("modal-btn-confirm");
  const btnCancel = document.getElementById("modal-btn-cancel");

  titleEl.textContent = title;
  msgEl.textContent = message;
  modal.classList.remove("hidden");

  const cleanup = () => {
    modal.classList.add("hidden");
    btnConfirm.onclick = null;
    btnCancel.onclick = null;
  };

  btnConfirm.onclick = () => {
    cleanup();
    if (onConfirm) onConfirm();
  };

  btnCancel.onclick = () => {
    cleanup();
  };
}

// -------------------------------------------------------------
// EVENTOS PRINCIPALES DEL DOM
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
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

  // Login Submit
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearAuthError();
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;
      const submitBtn = document.getElementById("btn-submit-login");

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Verificando acceso...";
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        console.error("Login Error:", err);
        let friendly = "Error de acceso: ";
        const savedAcc = getLocalAccount(email);

        if (err.code === "auth/operation-not-allowed" || err.code === "auth/unauthorized-domain") {
          if (savedAcc && savedAcc.password === password) {
            activateUserSession(savedAcc);
            showToast("¡Sesión iniciada correctamente!", "success");
            return;
          }
          if (err.code === "auth/unauthorized-domain") {
            friendly = `Dominio '${window.location.hostname}' no autorizado en Firebase. Añádelo en Firebase Console > Authentication > Settings > Authorized Domains, o regístrate abajo.`;
          } else {
            friendly = `Para acceder con Firebase, habilita 'Correo/Contraseña' en la consola del proyecto ${firebaseConfig.projectId}. O regístrate de nuevo abajo.`;
          }
        } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
          if (savedAcc && savedAcc.password === password) {
            activateUserSession(savedAcc);
            showToast("¡Sesión iniciada correctamente!", "success");
            return;
          }
          friendly = "Usuario o contraseña incorrectos.";
        } else if (err.code === "auth/too-many-requests") {
          friendly = "Demasiados intentos. Espera unos momentos.";
        } else {
          friendly += (err.message || "revisa los datos introducidos");
        }
        showAuthError(friendly);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
          <span>Acceder a Mi Cuadrante</span>
        `;
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

        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        AppState.config.workerName = name;
        AppState.config.dni = dni;
        AppState.config.category = category;
        AppState.config.center = center;
        AppState.config.service = "Servicio Sanitario SAS";
        AppState.config.startDate = startDate;
        AppState.config.endDate = endDate;
        AppState.config.regime = regime;
        AppState.config.baseHours = baseHours;

        if (db) {
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
        }

        showToast("¡Registro completado con éxito! Bienvenido/a a tu cuadrante.", "success");
      } catch (err) {
        console.error("Register Error:", err);
        let friendly = "Error de registro: ";

        if (err.code === "auth/operation-not-allowed" || err.code === "auth/unauthorized-domain") {
          const localUid = "usr_" + Math.random().toString(36).substring(2, 10);
          const accountData = {
            uid: localUid,
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

          const isUnauth = err.code === "auth/unauthorized-domain";
          const title = isUnauth 
            ? `Dominio '${window.location.hostname}' pendiente de autorizar en Firebase`
            : "Método 'Correo/Contraseña' pendiente en Firebase";
          const desc = isUnauth
            ? `Para sincronizar en la nube desde este dominio (${window.location.hostname}), agrégalo en Firebase Console > Authentication > Settings > Authorized Domains. Puedes acceder y usar la app inmediatamente en este dispositivo.`
            : `El proyecto de Firebase <strong>${firebaseConfig.projectId}</strong> requiere activar por única vez el método de inicio de sesión en su consola.`;
          const actionLink = isUnauth
            ? `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`
            : `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

          const bannerHtml = `
            <div class="space-y-2.5 text-left py-1">
              <div class="font-bold flex items-center gap-1.5 text-amber-900 text-xs">
                <svg class="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <span>${title}</span>
              </div>
              <p class="text-slate-600 text-[11px] leading-relaxed">
                ${desc}
              </p>
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <a href="${actionLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] transition-colors shadow-xs">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  <span>Abrir Consola Firebase</span>
                </a>
                <button type="button" id="btn-activate-account-now" class="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-bold text-[11px] transition-colors cursor-pointer shadow-2xs">
                  <span>Acceder con mi usuario ahora</span>
                </button>
              </div>
            </div>
          `;
          showAuthErrorHtml(bannerHtml);

          const btnAct = document.getElementById("btn-activate-account-now");
          if (btnAct) {
            btnAct.onclick = () => {
              activateUserSession(accountData);
            };
          }
          return;
        } else if (err.code === "auth/email-already-in-use") {
          friendly = "Este correo ya está registrado. Inicia sesión.";
        } else if (err.code === "auth/weak-password") {
          friendly = "La contraseña debe tener al menos 6 caracteres.";
        } else {
          friendly += (err.message || "revisa los datos");
        }
        showAuthError(friendly);
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

      if (target === "calendar") renderCalendar();
      if (target === "table") renderTable();
      if (target === "projection") renderProjection();
      if (target === "request") renderRequestLetter();
    });
  });

  // Pinceles de Turno
  document.querySelectorAll(".brush-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const brush = btn.dataset.brush;
      AppState.activeBrush = brush;

      document.querySelectorAll(".brush-btn").forEach(b => {
        b.classList.remove("ring-2", "ring-amber-400/50", "ring-emerald-500/50", "ring-indigo-500/50", "ring-cyan-500/50", "ring-rose-500/50", "active", "border-2");
      });

      btn.classList.add("active", "ring-2", "border-2");
      showToast(`Pincel seleccionado: [${brush}]`, "info");
    });
  });

  // Navegación Calendario
  const btnCalPrev = document.getElementById("cal-btn-prev");
  if (btnCalPrev) {
    btnCalPrev.addEventListener("click", () => {
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
      AppState.calendarYear--;
      syncYearDropdown();
      updateAll();
      showToast(`Año de trabajo: ${AppState.calendarYear}`, "info");
    });
  }

  if (btnYearNext) {
    btnYearNext.addEventListener("click", () => {
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

  // Slider DCI
  const slider = document.getElementById("slider-dci");
  if (slider) {
    slider.addEventListener("input", (e) => {
      AppState.simulatedDciDays = parseInt(e.target.value, 10);
      renderProjection();
    });
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

  // Atajos de teclado para turnos (M, T, N, 2/B, V, L, D, X)
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
  });

  function selectBrush(brushCode) {
    const btn = document.querySelector(`.brush-btn[data-brush="${brushCode}"]`);
    if (btn) btn.click();
  }
});
