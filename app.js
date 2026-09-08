/**
 * Dashboard Nilai Mahasiswa & Tugas Harian
 * Real-time Sync with Google Sheets
 */

// Configuration
const CONFIG = {
  sheetId: '1ALjtCw64npBQmjibmViM9kluwvz4jPrPrM3OVmNhfSM',
  // Export URLs
  exportUrlCsv: 'https://docs.google.com/spreadsheets/d/1ALjtCw64npBQmjibmViM9kluwvz4jPrPrM3OVmNhfSM/export?format=csv',
  gvizUrlCsv: 'https://docs.google.com/spreadsheets/d/1ALjtCw64npBQmjibmViM9kluwvz4jPrPrM3OVmNhfSM/gviz/tq?tqx=out:csv',
  // Google Apps Script Web App URL untuk Two-Way Sync (Write/Update Nilai)
  // Tempelkan URL Web App yang didapat dari langkah penerapan di Google Spreadsheet Anda di sini:
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbwuH0JzNZPcxoX7Kdo_unXbb2PS2HCjbxp-WDGXUuUXHue8jbS78EQH3gZcy5Z3Bk0C/exec', 
  autoRefreshIntervalMs: 60000, // Auto refresh every 60s
  passingScore: 70
};

// Application State
let state = {
  rawRows: [],
  students: [],
  lecturer: null,
  activeWeeks: new Set(),
  activeTasks: [],
  currentTab: 'all', // 'all', '1', '2', ..., '7', 'uts'
  searchQuery: '',
  statusFilter: 'all', // 'all', 'submitted', 'incomplete'
  sortBy: 'no-asc',
  selectedStudent: null,
  lastUpdated: null,
  isLoading: false,
  theme: localStorage.getItem('gradebook_theme_ugm') || 'light',
  // Admin & Authentication State
  adminList: [], // [{ email, name, role }]
  adminEmails: new Set(), // Set of lowercase emails with Admin == TRUE in Google Sheets
  currentUser: JSON.parse(localStorage.getItem('gradebook_admin_user') || 'null'),
  isEditMode: false,
  isSaving: false
};

// Column Schema Definitions (Week 1 - 7 + UTS)
const WEEKS_DEF = [
  {
    weekId: '1',
    label: 'Week 1',
    tasks: [
      { id: 'w1_inclass', label: 'In-Class Problem', shortLabel: 'In-Class', colIndex: 5 },
      { id: 'w1_exit', label: 'Exit Ticket', shortLabel: 'Exit Ticket', colIndex: 6 }
    ]
  },
  {
    weekId: '2',
    label: 'Week 2',
    tasks: [
      { id: 'w2_inclass', label: 'In-Class Problem', shortLabel: 'In-Class', colIndex: 7 },
      { id: 'w2_exit', label: 'Exit Ticket', shortLabel: 'Exit Ticket', colIndex: 8 }
    ]
  },
  {
    weekId: '3',
    label: 'Week 3',
    tasks: [
      { id: 'w3_inclass', label: 'In-Class Problem', shortLabel: 'In-Class', colIndex: 9 },
      { id: 'w3_exit', label: 'Exit Ticket', shortLabel: 'Exit Ticket', colIndex: 10 }
    ]
  },
  {
    weekId: '4',
    label: 'Week 4',
    tasks: [
      { id: 'w4_inclass', label: 'In-Class Problem', shortLabel: 'In-Class', colIndex: 11 },
      { id: 'w4_exit', label: 'Exit Ticket', shortLabel: 'Exit Ticket', colIndex: 12 }
    ]
  },
  {
    weekId: '5',
    label: 'Week 5',
    tasks: [
      { id: 'w5_inclass', label: 'In-Class Problem', shortLabel: 'In-Class', colIndex: 13 },
      { id: 'w5_exit', label: 'Exit Ticket', shortLabel: 'Exit Ticket', colIndex: 14 }
    ]
  },
  {
    weekId: '6',
    label: 'Week 6',
    tasks: [
      { id: 'w6_inclass', label: 'In-Class Problem', shortLabel: 'In-Class', colIndex: 15 },
      { id: 'w6_exit', label: 'Exit Ticket', shortLabel: 'Exit Ticket', colIndex: 16 }
    ]
  },
  {
    weekId: '7',
    label: 'Week 7',
    tasks: [
      { id: 'w7_inclass', label: 'In-Class Problem', shortLabel: 'In-Class', colIndex: 17 },
      { id: 'w7_exit', label: 'Exit Ticket', shortLabel: 'Exit Ticket', colIndex: 18 }
    ]
  },
  {
    weekId: 'uts',
    label: 'UTS',
    tasks: [
      { id: 'uts_exam', label: 'Ujian Tengah Semester', shortLabel: 'UTS', colIndex: 19 }
    ]
  }
];

// Flat list of all 15 tasks
const ALL_TASKS = WEEKS_DEF.flatMap(w => w.tasks.map(t => ({ ...t, weekId: w.weekId, weekLabel: w.label })));

// DOM Elements
const elements = {
  syncStatus: document.getElementById('syncStatus'),
  syncText: document.getElementById('syncText'),
  dosenBadge: document.getElementById('dosenBadge'),
  btnRefresh: document.getElementById('btnRefresh'),
  btnExport: document.getElementById('btnExport'),
  btnThemeToggle: document.getElementById('btnThemeToggle'),
  // Stats
  statTotalStudents: document.getElementById('statTotalStudents'),
  statActiveWeeks: document.getElementById('statActiveWeeks'),
  statActiveWeeksDesc: document.getElementById('statActiveWeeksDesc'),
  statClassAverage: document.getElementById('statClassAverage'),
  statTotalSubmissions: document.getElementById('statTotalSubmissions'),
  statSubmissionRate: document.getElementById('statSubmissionRate'),
  // Controls
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  statusFilter: document.getElementById('statusFilter'),
  sortSelect: document.getElementById('sortSelect'),
  weekTabs: document.getElementById('weekTabs'),
  resultsCount: document.getElementById('resultsCount'),
  // Table
  tableContainer: document.getElementById('tableContainer'),
  loadingState: document.getElementById('loadingState'),
  gradeTable: document.getElementById('gradeTable'),
  tableHead: document.getElementById('tableHead'),
  tableBody: document.getElementById('tableBody'),
  emptyState: document.getElementById('emptyState'),
  emptySearchTerm: document.getElementById('emptySearchTerm'),
  btnResetSearch: document.getElementById('btnResetSearch'),
  // Modal
  studentModal: document.getElementById('studentModal'),
  modalAvatar: document.getElementById('modalAvatar'),
  modalStudentName: document.getElementById('modalStudentName'),
  modalStudentNIM: document.getElementById('modalStudentNIM'),
  modalAvgScore: document.getElementById('modalAvgScore'),
  modalCompletedTasks: document.getElementById('modalCompletedTasks'),
  modalCompletionPercent: document.getElementById('modalCompletionPercent'),
  modalWeeksGrid: document.getElementById('modalWeeksGrid'),
  btnModalClose: document.getElementById('btnModalClose'),
  btnCloseModalBtn: document.getElementById('btnCloseModalBtn'),
  btnPrintStudent: document.getElementById('btnPrintStudent'),
  // Toast
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toastMessage'),
  // Auth Controls
  authSection: document.getElementById('authSection'),
  btnAdminLogin: document.getElementById('btnAdminLogin'),
  userProfile: document.getElementById('userProfile'),
  userAvatarImg: document.getElementById('userAvatarImg'),
  userAvatarPlaceholder: document.getElementById('userAvatarPlaceholder'),
  userEmailText: document.getElementById('userEmailText'),
  btnLogout: document.getElementById('btnLogout'),
  // Login Modal
  loginModal: document.getElementById('loginModal'),
  btnCloseLoginModal: document.getElementById('btnCloseLoginModal'),
  btnGoogleSignIn: document.getElementById('btnGoogleSignIn'),
  googleSignInLabel: document.getElementById('googleSignInLabel'),
  emailLoginForm: document.getElementById('emailLoginForm'),
  adminEmailInput: document.getElementById('adminEmailInput'),
  btnVerifyEmail: document.getElementById('btnVerifyEmail'),
  // Student Edit Controls
  btnToggleEditStudent: document.getElementById('btnToggleEditStudent'),
  editBtnLabel: document.getElementById('editBtnLabel'),
  editModeBanner: document.getElementById('editModeBanner'),
  btnSaveStudentScores: document.getElementById('btnSaveStudentScores'),
  saveBtnLabel: document.getElementById('saveBtnLabel'),
  btnCancelEditStudent: document.getElementById('btnCancelEditStudent')
};

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  initFirebaseAuth();
  updateAuthUI();
  loadData();

  // Auto refresh periodically
  setInterval(() => {
    loadData(true);
  }, CONFIG.autoRefreshIntervalMs);
});

function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}

function initEventListeners() {
  // Theme Toggle
  elements.btnThemeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('gradebook_theme_ugm', state.theme);
    showToast(`Beralih ke tema ${state.theme === 'dark' ? 'Gelap' : 'Terang'}`);
  });

  // Manual Refresh
  elements.btnRefresh.addEventListener('click', () => {
    const spinIcon = elements.btnRefresh.querySelector('.spin-icon');
    spinIcon.classList.add('spinning');
    loadData(false).finally(() => {
      setTimeout(() => spinIcon.classList.remove('spinning'), 600);
    });
  });

  // Export CSV (optional)
  if (elements.btnExport) {
    elements.btnExport.addEventListener('click', exportToCsv);
  }

  // Search input
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    if (state.searchQuery) {
      elements.btnClearSearch.classList.remove('hidden');
    } else {
      elements.btnClearSearch.classList.add('hidden');
    }
    renderTable();
  });

  // Shortcut key '/' to focus search & 'Escape' to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== elements.searchInput && document.activeElement !== elements.adminEmailInput && !document.activeElement.classList.contains('task-score-input')) {
      e.preventDefault();
      elements.searchInput.focus();
    } else if (e.key === 'Escape') {
      if (elements.loginModal && !elements.loginModal.classList.contains('hidden')) {
        closeLoginModal();
      } else if (elements.studentModal && !elements.studentModal.classList.contains('hidden')) {
        closeStudentModal();
      }
    }
  });

  // Clear search
  elements.btnClearSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.btnClearSearch.classList.add('hidden');
    elements.searchInput.focus();
    renderTable();
  });

  elements.btnResetSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.btnClearSearch.classList.add('hidden');
    renderTable();
  });

  // Filter Status
  elements.statusFilter.addEventListener('change', (e) => {
    state.statusFilter = e.target.value;
    renderTable();
  });

  // Sort
  elements.sortSelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderTable();
  });

  // Week Tabs
  elements.weekTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.week-tab');
    if (!tab) return;
    document.querySelectorAll('.week-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.currentTab = tab.dataset.week;
    renderTable();
  });

  // Student Modal events
  elements.btnModalClose.addEventListener('click', closeStudentModal);
  elements.btnCloseModalBtn.addEventListener('click', closeStudentModal);
  elements.studentModal.addEventListener('click', (e) => {
    if (e.target === elements.studentModal) closeStudentModal();
  });

  // Print Student Card
  elements.btnPrintStudent.addEventListener('click', () => {
    window.print();
  });

  // Admin Auth Event Listeners
  if (elements.btnAdminLogin) {
    elements.btnAdminLogin.addEventListener('click', openLoginModal);
  }
  if (elements.btnCloseLoginModal) {
    elements.btnCloseLoginModal.addEventListener('click', closeLoginModal);
  }
  if (elements.loginModal) {
    elements.loginModal.addEventListener('click', (e) => {
      if (e.target === elements.loginModal) closeLoginModal();
    });
  }
  if (elements.btnGoogleSignIn) {
    elements.btnGoogleSignIn.addEventListener('click', signInWithGoogle);
  }
  if (elements.emailLoginForm) {
    elements.emailLoginForm.addEventListener('submit', handleManualEmailLogin);
  }
  if (elements.btnLogout) {
    elements.btnLogout.addEventListener('click', logoutAdmin);
  }

  // Student Score Edit Event Listeners
  if (elements.btnToggleEditStudent) {
    elements.btnToggleEditStudent.addEventListener('click', toggleEditMode);
  }
  if (elements.btnCancelEditStudent) {
    elements.btnCancelEditStudent.addEventListener('click', cancelEditMode);
  }
  if (elements.btnSaveStudentScores) {
    elements.btnSaveStudentScores.addEventListener('click', saveCurrentStudentScores);
  }
}

/* ==========================================================================
   Data Fetching & Resilient CSV Parser
   ========================================================================== */
async function loadData(isSilent = false) {
  if (!isSilent) {
    setLoadingState(true);
  }
  updateSyncStatus('loading', 'Sinkronisasi...');

  try {
    let csvText = '';
    // Try primary export URL
    try {
      const resp = await fetch(CONFIG.exportUrlCsv, { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      csvText = await resp.text();
    } catch (err) {
      console.warn('Gagal fetch export CSV utama, mencoba endpoint gviz...', err);
      const gvizResp = await fetch(CONFIG.gvizUrlCsv, { cache: 'no-cache' });
      if (!gvizResp.ok) throw new Error(`Gviz HTTP ${gvizResp.status}`);
      csvText = await gvizResp.text();
    }

    parseCsvData(csvText);
    state.lastUpdated = new Date();
    updateSyncStatus('live', `Live Update (${formatTime(state.lastUpdated)})`);
    updateAnalytics();
    renderTable();
    if (!isSilent) showToast('Data nilai berhasil diperbarui secara live!');
  } catch (err) {
    console.error('Koneksi Google Sheets gagal:', err);
    updateSyncStatus('error', 'Gagal memuat live');
    showToast('Gagal memuat data live dari Google Sheets. Memeriksa data lokal...', true);
    
    // Fallback: If network fails, check if we already have data loaded
    if (state.students.length === 0) {
      loadFallbackSnapshot();
    }
  } finally {
    setLoadingState(false);
  }
}

/**
 * Robust CSV parser handling quotes, line breaks, and commas
 */
function parseCsvRows(text) {
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(cell.trim());
      if (row.some(c => c !== '')) {
        lines.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    lines.push(row);
  }
  return lines;
}

function parseCsvData(csvText) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return;

  // Find header row containing 'No', 'Nama', 'NIM'
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = rows[i].map(c => c.toLowerCase());
    if (r.includes('no') && r.includes('nama') && r.includes('nim')) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.error('Header tidak ditemukan pada spreadsheet');
    return;
  }

  const studentRows = rows.slice(headerRowIndex + 1);
  const parsedStudents = [];
  const activeWeeks = new Set();
  const activeTasks = new Set();
  const adminEmails = new Set();
  const adminList = [];
  let lecturer = null;

  // 1. Detect lecturer & admin from rows above the table header (e.g. Header table / Kop)
  for (let i = 0; i < headerRowIndex; i++) {
    const row = rows[i];
    if (!row) continue;

    // Scan for any cell with an email address and check if adjacent cell is TRUE
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] || '').trim().toLowerCase();
      if (cell.includes('@') && cell.includes('.')) {
        const nextCell = (row[c + 1] || '').trim().toUpperCase();
        if (nextCell === 'TRUE' || nextCell === '1') {
          adminEmails.add(cell);
          const adminName = row[c - 2] || row[1] || 'Dosen';
          adminList.push({ email: cell, name: adminName, role: 'Dosen' });
        }
      }
    }

    const dosenIdx = row.findIndex(c => c && c.trim().toLowerCase() === 'dosen');
    if (dosenIdx !== -1) {
      // If cell below has the name
      if (rows[i + 1] && rows[i + 1][dosenIdx] && rows[i + 1][dosenIdx].trim()) {
        const dName = rows[i + 1][dosenIdx].trim();
        const dNim = rows[i + 1][dosenIdx + 1] ? rows[i + 1][dosenIdx + 1].trim() : '-';
        lecturer = { name: dName, nim: dNim };
        break;
      }
      // If next column in same row has the name
      if (row[dosenIdx + 1] && row[dosenIdx + 1].trim()) {
        lecturer = { name: row[dosenIdx + 1].trim(), nim: '-' };
        break;
      }
    }

    // Direct check for academic titles (Dr., Prof., Ir., Pak) in rows above header
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] || '').trim();
      if (/^(dr\.|prof\.|ir\.|pak\s)/i.test(cell) && !cell.toLowerCase().includes('penilaian')) {
        lecturer = { name: cell, nim: row[c + 1] ? row[c + 1].trim() : '-' };
        break;
      }
    }
    if (lecturer) break;
  }

  studentRows.forEach(row => {
    if (!row || row.length < 3) return;
    const noRaw = row[0];
    const name = row[1];
    const nim = row[2];
    const email = (row[3] || '').trim().toLowerCase();
    const adminVal = (row[4] || '').trim().toUpperCase();
    const isStudentAdmin = adminVal === 'TRUE' || adminVal === '1';

    if (email && isStudentAdmin) {
      adminEmails.add(email);
      adminList.push({ email, name, role: 'Admin / Asisten', nim });
    }

    if (!name && !nim) return;

    // Detect if this row is the lecturer/admin (e.g. Pak Wijaya) if not found earlier
    if (nim === '-' || (name && name.toLowerCase().includes('pak '))) {
      if (!lecturer) {
        lecturer = { name, nim };
      }
      return; // Skip from student listing
    }

    const no = parseInt(noRaw, 10) || parsedStudents.length + 1;

    // Extract grades for each task
    const grades = {};
    let totalScore = 0;
    let scoredTasksCount = 0;
    let submittedCount = 0;

    ALL_TASKS.forEach(task => {
      const rawVal = (row[task.colIndex] || '').trim();
      let scoreNum = null;
      let isSubmitted = false;

      if (rawVal !== '' && rawVal !== '-') {
        const num = parseFloat(rawVal.replace(',', '.'));
        if (!isNaN(num)) {
          scoreNum = num;
          totalScore += num;
          scoredTasksCount++;
          isSubmitted = true;
          activeWeeks.add(task.weekId);
          activeTasks.add(task.id);
        } else {
          isSubmitted = true;
        }
      } else if (rawVal === '-') {
        // '-' indicates marked as empty/unsubmitted
        isSubmitted = false;
      }

      grades[task.id] = {
        raw: rawVal,
        score: scoreNum,
        isSubmitted: isSubmitted
      };

      if (isSubmitted) submittedCount++;
    });

    const average = scoredTasksCount > 0 ? (totalScore / scoredTasksCount) : null;

    parsedStudents.push({
      no,
      name,
      nim,
      email,
      isAdmin: isStudentAdmin,
      grades,
      totalScore,
      scoredTasksCount,
      submittedCount,
      average
    });
  });

  state.students = parsedStudents;
  state.activeWeeks = activeWeeks;
  state.activeTasks = Array.from(activeTasks);
  state.adminEmails = adminEmails;
  state.adminList = adminList;

  if (lecturer) {
    state.lecturer = lecturer;
    elements.dosenBadge.textContent = `Dosen: ${lecturer.name}`;
  }

  // Re-verify currently logged-in user against sheet admin list
  if (state.currentUser && state.currentUser.email) {
    state.currentUser.isAdmin = adminEmails.has(state.currentUser.email.toLowerCase());
    localStorage.setItem('gradebook_admin_user', JSON.stringify(state.currentUser));
    updateAuthUI();
  }
}

/* ==========================================================================
   Analytics Calculation & UI Update
   ========================================================================== */
function updateAnalytics() {
  const total = state.students.length;
  elements.statTotalStudents.textContent = total.toString();

  // Active weeks
  const activeWeeksCount = Array.from(state.activeWeeks).filter(w => w !== 'uts').length;
  elements.statActiveWeeks.textContent = `${activeWeeksCount} Pekan`;
  elements.statActiveWeeksDesc = `Week ${Array.from(state.activeWeeks).sort().join(', ')} terisi nilai`;

  // Class Average
  let totalClassScore = 0;
  let totalClassScoredTasks = 0;
  let totalClassSubmissions = 0;

  state.students.forEach(s => {
    s.totalScore = 0;
    s.scoredTasksCount = 0;
    ALL_TASKS.forEach(t => {
      const g = s.grades[t.id];
      if (g && g.score !== null) {
        totalClassScore += g.score;
        totalClassScoredTasks++;
      }
      if (g && g.isSubmitted) {
        totalClassSubmissions++;
      }
    });
  });

  const classAvg = totalClassScoredTasks > 0 ? (totalClassScore / totalClassScoredTasks).toFixed(1) : '-';
  elements.statClassAverage.textContent = classAvg;

  // Submissions
  elements.statTotalSubmissions.textContent = totalClassSubmissions.toString();
  const maxPossible = total * (state.activeTasks.length || 1);
  const rate = maxPossible > 0 ? Math.round((totalClassSubmissions / maxPossible) * 100) : 0;
  elements.statSubmissionRate.textContent = `Tingkat pengumpulan: ${rate}%`;
}

/* ==========================================================================
   Table Rendering
   ========================================================================== */
function getFilteredAndSortedStudents() {
  let list = [...state.students];

  // Search filter (Nama / NIM)
  if (state.searchQuery) {
    const q = state.searchQuery;
    list = list.filter(s => s.name.toLowerCase().includes(q) || s.nim.toLowerCase().includes(q));
  }

  // Status Filter
  if (state.statusFilter === 'submitted') {
    list = list.filter(s => s.submittedCount > 0);
  } else if (state.statusFilter === 'incomplete') {
    list = list.filter(s => s.submittedCount < (state.activeTasks.length || 1));
  }

  // Sort
  list.sort((a, b) => {
    switch (state.sortBy) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'nim-asc':
        return a.nim.localeCompare(b.nim);
      case 'avg-desc':
        return (b.average || 0) - (a.average || 0);
      case 'sub-desc':
        return b.submittedCount - a.submittedCount;
      case 'no-asc':
      default:
        return a.no - b.no;
    }
  });

  return list;
}

function getVisibleColumns() {
  if (state.currentTab === 'all') {
    return {
      weeks: WEEKS_DEF,
      tasks: ALL_TASKS
    };
  }

  const selectedWeek = WEEKS_DEF.find(w => w.weekId === state.currentTab);
  if (!selectedWeek) {
    return { weeks: WEEKS_DEF, tasks: ALL_TASKS };
  }

  return {
    weeks: [selectedWeek],
    tasks: selectedWeek.tasks.map(t => ({ ...t, weekId: selectedWeek.weekId, weekLabel: selectedWeek.label }))
  };
}

function renderTable() {
  const filtered = getFilteredAndSortedStudents();
  const { weeks, tasks } = getVisibleColumns();

  // Results count
  elements.resultsCount.textContent = `Menampilkan ${filtered.length} dari ${state.students.length} mahasiswa`;

  // Empty state check
  if (filtered.length === 0) {
    elements.gradeTable.classList.add('hidden');
    elements.emptyState.classList.remove('hidden');
    elements.emptySearchTerm.textContent = state.searchQuery || 'kriteria terpilih';
    return;
  } else {
    elements.gradeTable.classList.remove('hidden');
    elements.emptyState.classList.add('hidden');
  }

  // 1. Build Header
  let theadHtml = '';

  if (state.currentTab === 'all') {
    // Two-row header for 'all'
    let topRow = `
      <tr>
        <th rowspan="2" class="sticky-col-no">No</th>
        <th rowspan="2" class="sticky-col-student">Mahasiswa</th>
    `;
    let subRow = '<tr>';

    weeks.forEach(w => {
      const colspan = w.tasks.length;
      topRow += `<th colspan="${colspan}" class="header-group">${w.label}</th>`;
      w.tasks.forEach(t => {
        subRow += `<th class="header-task" title="${w.label}: ${t.label}">${t.shortLabel}</th>`;
      });
    });

    topRow += `
        <th rowspan="2" class="col-center col-summary">Rata-rata</th>
        <th rowspan="2" class="col-center col-summary">Progres</th>
      </tr>
    `;
    subRow += '</tr>';
    theadHtml = topRow + subRow;
  } else {
    // Single row header for specific week
    const currentWeekObj = weeks[0];
    let topRow = `
      <tr>
        <th class="sticky-col-no">No</th>
        <th class="sticky-col-student">Mahasiswa</th>
    `;
    currentWeekObj.tasks.forEach(t => {
      topRow += `<th class="header-task col-center" title="${t.label}">${currentWeekObj.label}: ${t.label}</th>`;
    });
    topRow += `
        <th class="col-center col-summary">Rata-rata Pekan</th>
        <th class="col-center col-summary">Status</th>
      </tr>
    `;
    theadHtml = topRow;
  }
  elements.tableHead.innerHTML = theadHtml;

  // 2. Build Body Rows
  let tbodyHtml = '';
  filtered.forEach(student => {
    const initials = getInitials(student.name);
    const avgDisplay = student.average !== null ? student.average.toFixed(1) : '-';
    const totalActiveTasks = state.activeTasks.length || 1;
    const progressPercent = Math.min(100, Math.round((student.submittedCount / totalActiveTasks) * 100));

    let rowHtml = `<tr data-nim="${student.nim}" onclick="openStudentModal('${student.nim}')">`;
    rowHtml += `<td class="sticky-col-no col-center">${student.no}</td>`;
    rowHtml += `
      <td class="sticky-col-student">
        <div class="student-cell">
          <div class="student-avatar">${initials}</div>
          <div>
            <div class="student-name-text" title="${student.name}">
              ${student.name}
              ${state.currentUser && state.currentUser.isAdmin ? '<span class="row-editable-badge" title="Klik untuk edit nilai">✏️</span>' : ''}
            </div>
            <div class="student-nim-text">${student.nim}</div>
          </div>
        </div>
      </td>
    `;

    if (state.currentTab === 'all') {
      tasks.forEach(task => {
        const gradeInfo = student.grades[task.id] || { raw: '', score: null, isSubmitted: false };
        rowHtml += `<td class="col-center">${formatScoreBadge(gradeInfo)}</td>`;
      });

      // Overall Summary columns
      rowHtml += `
        <td class="col-center col-summary">
          <span class="score-pill ${getAverageClass(student.average)}">${avgDisplay}</span>
        </td>
        <td class="col-center col-summary">
          <div class="progress-inline" title="${student.submittedCount} tugas terisi">
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <span>${student.submittedCount}/${totalActiveTasks}</span>
          </div>
        </td>
      `;
    } else {
      // Specific week view
      let weekSum = 0;
      let weekScored = 0;
      let weekSubmissions = 0;

      tasks.forEach(task => {
        const gradeInfo = student.grades[task.id] || { raw: '', score: null, isSubmitted: false };
        if (gradeInfo.score !== null) {
          weekSum += gradeInfo.score;
          weekScored++;
        }
        if (gradeInfo.isSubmitted) weekSubmissions++;
        rowHtml += `<td class="col-center">${formatScoreBadge(gradeInfo)}</td>`;
      });

      const weekAvg = weekScored > 0 ? (weekSum / weekScored).toFixed(1) : '-';
      const isComplete = weekSubmissions >= tasks.length;

      rowHtml += `
        <td class="col-center col-summary">
          <span class="score-pill ${getAverageClass(weekAvg !== '-' ? parseFloat(weekAvg) : null)}">${weekAvg}</span>
        </td>
        <td class="col-center col-summary">
          <span class="badge ${isComplete ? 'badge-primary' : 'badge-outline'}">
            ${isComplete ? 'Lengkap' : `${weekSubmissions}/${tasks.length} Selesai`}
          </span>
        </td>
      `;
    }

    rowHtml += '</tr>';
    tbodyHtml += rowHtml;
  });

  elements.tableBody.innerHTML = tbodyHtml;
}

/* ==========================================================================
   Student Detail Modal & Score Editing
   ========================================================================== */
window.openStudentModal = function(nim) {
  const student = state.students.find(s => s.nim === nim);
  if (!student) return;

  state.selectedStudent = student;
  state.isEditMode = false;
  renderStudentModalContent(student);
  elements.studentModal.classList.remove('hidden');
};

function renderStudentModalContent(student) {
  if (!student) return;

  elements.modalAvatar.textContent = getInitials(student.name);
  elements.modalStudentName.textContent = student.name;
  elements.modalStudentNIM.textContent = student.nim;

  const avgVal = student.average !== null ? student.average.toFixed(1) : '-';
  elements.modalAvgScore.textContent = avgVal;

  const totalTasks = ALL_TASKS.length;
  elements.modalCompletedTasks.textContent = `${student.submittedCount} / ${totalTasks}`;

  const completionPct = Math.round((student.submittedCount / totalTasks) * 100);
  elements.modalCompletionPercent.textContent = `${completionPct}%`;

  const isAdmin = !!(state.currentUser && state.currentUser.isAdmin);

  if (isAdmin) {
    elements.btnToggleEditStudent.classList.remove('hidden');
    elements.editBtnLabel.textContent = state.isEditMode ? 'Batal Edit' : 'Edit Nilai';
  } else {
    elements.btnToggleEditStudent.classList.add('hidden');
  }

  if (state.isEditMode) {
    elements.editModeBanner.classList.remove('hidden');
    elements.btnSaveStudentScores.classList.remove('hidden');
    elements.btnCancelEditStudent.classList.remove('hidden');
    elements.btnPrintStudent.classList.add('hidden');
  } else {
    elements.editModeBanner.classList.add('hidden');
    elements.btnSaveStudentScores.classList.add('hidden');
    elements.btnCancelEditStudent.classList.add('hidden');
    elements.btnPrintStudent.classList.remove('hidden');
  }

  // Render weekly breakdown cards
  let gridHtml = '';
  WEEKS_DEF.forEach(week => {
    const isActiveWeek = state.activeWeeks.has(week.weekId);
    let tasksHtml = '';

    week.tasks.forEach(task => {
      const grade = student.grades[task.id] || { raw: '', score: null, isSubmitted: false };
      
      let scoreHtml = '';
      if (state.isEditMode) {
        const currentVal = grade.score !== null ? grade.score : (grade.raw === '-' ? '' : grade.raw);
        scoreHtml = `
          <div class="task-score-edit-box">
            <input type="text" inputmode="decimal" class="task-score-input" data-task-id="${task.id}" value="${currentVal}" placeholder="-">
          </div>
        `;
      } else {
        scoreHtml = `<span>${formatScoreBadge(grade)}</span>`;
      }

      tasksHtml += `
        <div class="task-item-row">
          <span class="task-name-label">${task.label}</span>
          ${scoreHtml}
        </div>
      `;
    });

    gridHtml += `
      <div class="week-card-modal ${isActiveWeek ? 'week-active' : ''}">
        <div class="week-card-header">
          <span>${week.label}</span>
          ${isActiveWeek ? '<span class="badge badge-primary">Aktif</span>' : ''}
        </div>
        <div class="week-tasks-list">
          ${tasksHtml}
        </div>
      </div>
    `;
  });

  elements.modalWeeksGrid.innerHTML = gridHtml;
}

function toggleEditMode() {
  if (!state.selectedStudent) return;
  if (!state.currentUser || !state.currentUser.isAdmin) {
    showToast('Akses ditolak: Anda harus login sebagai Admin.', true);
    return;
  }
  state.isEditMode = !state.isEditMode;
  renderStudentModalContent(state.selectedStudent);
}

function cancelEditMode() {
  state.isEditMode = false;
  if (state.selectedStudent) {
    renderStudentModalContent(state.selectedStudent);
  }
}

async function saveCurrentStudentScores() {
  if (!state.selectedStudent) return;
  if (!state.currentUser || !state.currentUser.isAdmin) {
    showToast('Akses ditolak: Hanya Admin yang dapat menyimpan nilai.', true);
    return;
  }

  const student = state.selectedStudent;
  const inputs = elements.modalWeeksGrid.querySelectorAll('.task-score-input');
  const updatedScores = {};

  inputs.forEach(input => {
    const taskId = input.dataset.taskId;
    const rawVal = input.value.trim();
    updatedScores[taskId] = rawVal === '' ? '-' : rawVal;
  });

  elements.btnSaveStudentScores.disabled = true;
  elements.saveBtnLabel.textContent = 'Menyimpan...';

  try {
    if (CONFIG.appsScriptUrl) {
      const payload = {
        action: 'updateStudentScores',
        userEmail: state.currentUser.email,
        nim: student.nim,
        studentName: student.name,
        scores: updatedScores
      };

      const resp = await fetch(CONFIG.appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const resData = await resp.json();
      if (!resData.success) {
        throw new Error(resData.error || 'Server menolak penyimpanan.');
      }
      showToast(`Nilai ${student.name} berhasil disimpan ke Google Sheets!`);
    } else {
      showToast(`Nilai tersimpan di browser! (Masukkan Web App URL di CONFIG.appsScriptUrl untuk sync ke Sheet)`);
    }

    // Update in-memory state
    let totalScore = 0;
    let scoredTasksCount = 0;
    let submittedCount = 0;

    ALL_TASKS.forEach(task => {
      if (updatedScores.hasOwnProperty(task.id)) {
        const val = updatedScores[task.id];
        let scoreNum = null;
        let isSubmitted = false;

        if (val !== '' && val !== '-') {
          const num = parseFloat(val.toString().replace(',', '.'));
          if (!isNaN(num)) {
            scoreNum = num;
            totalScore += num;
            scoredTasksCount++;
            isSubmitted = true;
            state.activeWeeks.add(task.weekId);
            if (!state.activeTasks.includes(task.id)) {
              state.activeTasks.push(task.id);
            }
          } else {
            isSubmitted = true;
          }
        }

        student.grades[task.id] = {
          raw: val,
          score: scoreNum,
          isSubmitted: isSubmitted
        };

        if (isSubmitted) submittedCount++;
      }
    });

    student.totalScore = totalScore;
    student.scoredTasksCount = scoredTasksCount;
    student.submittedCount = submittedCount;
    student.average = scoredTasksCount > 0 ? (totalScore / scoredTasksCount) : null;

    state.isEditMode = false;
    renderStudentModalContent(student);
    updateAnalytics();
    renderTable();

    // Silently re-sync from Google Sheets after 2.5s if Apps Script URL is set
    if (CONFIG.appsScriptUrl) {
      setTimeout(() => loadData(true), 2500);
    }
  } catch (err) {
    console.error('Error saat menyimpan nilai:', err);
    showToast(`Gagal menyimpan ke Google Sheets: ${err.message}`, true);
  } finally {
    elements.btnSaveStudentScores.disabled = false;
    elements.saveBtnLabel.textContent = 'Simpan ke Google Sheets';
  }
}

function closeStudentModal() {
  elements.studentModal.classList.add('hidden');
  state.selectedStudent = null;
  state.isEditMode = false;
}

/* ==========================================================================
   Admin Authentication System (Google & Manual Verification)
   ========================================================================== */
function initFirebaseAuth() {
  if (typeof firebase === 'undefined') {
    console.log('Firebase SDK tidak dimuat.');
    return;
  }

  try {
    if (firebase.apps.length === 0) {
      firebase.initializeApp({
        projectId: "persdifa2026-d1321",
        authDomain: "persdifa2026-d1321.firebaseapp.com"
      });
    }

    if (firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user && user.email) {
          const normEmail = user.email.toLowerCase();
          if (state.adminEmails.size > 0 && state.adminEmails.has(normEmail)) {
            handleLoginSuccess(user.email, user.displayName, user.photoURL);
          }
        }
      });
    }
  } catch (err) {
    console.log('Firebase init note:', err.message);
  }
}

function openLoginModal() {
  elements.loginModal.classList.remove('hidden');
  elements.adminEmailInput.value = '';
}

function closeLoginModal() {
  elements.loginModal.classList.add('hidden');
}

async function signInWithGoogle() {
  if (typeof firebase === 'undefined' || !firebase.auth) {
    showToast('Firebase Auth SDK belum siap.', true);
    return;
  }

  const btn = elements.btnGoogleSignIn;
  btn.disabled = true;
  elements.googleSignInLabel.textContent = 'Menghubungkan ke Google...';

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await firebase.auth().signInWithPopup(provider);
    const user = result.user;
    handleLoginSuccess(user.email, user.displayName, user.photoURL);
  } catch (err) {
    console.error('Google Sign-In Error:', err);
    if (err.code === 'auth/popup-closed-by-user') {
      showToast('Login dibatalkan.');
    } else if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found') {
      showToast('Provider Google belum diaktifkan di Firebase Console. Gunakan form email di bawah sementara waktu.', true);
    } else {
      showToast('Gagal login: ' + (err.message || err.code), true);
    }
  } finally {
    btn.disabled = false;
    elements.googleSignInLabel.textContent = 'Masuk dengan Akun Google';
  }
}

function handleManualEmailLogin(e) {
  e.preventDefault();
  const inputEmail = elements.adminEmailInput.value.trim().toLowerCase();
  if (!inputEmail) return;

  if (state.adminEmails.size === 0) {
    showToast('Data hak akses spreadsheet sedang dimuat. Coba sebentar lagi...', true);
    return;
  }

  if (state.adminEmails.has(inputEmail)) {
    const adminObj = state.adminList.find(a => a.email === inputEmail);
    const name = adminObj ? adminObj.name : inputEmail.split('@')[0];
    handleLoginSuccess(inputEmail, name, '');
  } else {
    showToast(`Email ${inputEmail} tidak terdaftar sebagai Admin di spreadsheet!`, true);
    alert(`Akses Ditolak!\n\nEmail "${inputEmail}" tidak terdaftar dengan status Admin: TRUE di Google Spreadsheet.\n\nPastikan kolom Admin di spreadsheet bernilai TRUE untuk email ini.`);
  }
}

function handleLoginSuccess(email, displayName, photoUrl) {
  if (!email) return;
  const normEmail = email.trim().toLowerCase();
  const isAdmin = state.adminEmails.has(normEmail);

  if (!isAdmin) {
    if (state.adminEmails.size === 0) {
      showToast('Menunggu data spreadsheet selesai dimuat...', true);
      return;
    }
    showToast(`Akses Ditolak: ${email} bukan Admin di Google Spreadsheet.`, true);
    alert(`Akses Ditolak!\n\nEmail "${email}" tidak memiliki status Admin (Admin: TRUE) di Google Spreadsheet.\n\nAkun Anda hanya memiliki izin baca (View-Only).`);
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) firebase.auth().signOut();
    } catch (e) {}
    return;
  }

  let finalName = displayName;
  if (!finalName) {
    const adminObj = state.adminList.find(a => a.email === normEmail);
    finalName = adminObj ? adminObj.name : normEmail.split('@')[0];
  }

  state.currentUser = {
    email: normEmail,
    name: finalName,
    photoUrl: photoUrl || '',
    isAdmin: true
  };

  localStorage.setItem('gradebook_admin_user', JSON.stringify(state.currentUser));
  updateAuthUI();
  renderTable();
  closeLoginModal();
  showToast(`Selamat datang, ${finalName}! Mode Admin aktif.`);
}

function logoutAdmin() {
  state.currentUser = null;
  state.isEditMode = false;
  localStorage.removeItem('gradebook_admin_user');
  try {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().signOut();
    }
  } catch (e) {}
  updateAuthUI();
  if (state.selectedStudent) {
    renderStudentModalContent(state.selectedStudent);
  }
  renderTable();
  showToast('Berhasil logout. Kembali ke mode Read-Only.');
}

function updateAuthUI() {
  const isAdmin = !!(state.currentUser && state.currentUser.isAdmin);

  if (isAdmin) {
    if (elements.btnAdminLogin) elements.btnAdminLogin.classList.add('hidden');
    if (elements.userProfile) elements.userProfile.classList.remove('hidden');
    if (elements.userEmailText) elements.userEmailText.textContent = state.currentUser.email;

    if (state.currentUser.photoUrl && elements.userAvatarImg) {
      elements.userAvatarImg.src = state.currentUser.photoUrl;
      elements.userAvatarImg.classList.remove('hidden');
      if (elements.userAvatarPlaceholder) elements.userAvatarPlaceholder.classList.add('hidden');
    } else if (elements.userAvatarPlaceholder) {
      elements.userAvatarPlaceholder.textContent = getInitials(state.currentUser.name);
      if (elements.userAvatarImg) elements.userAvatarImg.classList.add('hidden');
      elements.userAvatarPlaceholder.classList.remove('hidden');
    }

    if (elements.btnToggleEditStudent) {
      elements.btnToggleEditStudent.classList.remove('hidden');
    }
  } else {
    if (elements.btnAdminLogin) elements.btnAdminLogin.classList.remove('hidden');
    if (elements.userProfile) elements.userProfile.classList.add('hidden');
    if (elements.btnToggleEditStudent) elements.btnToggleEditStudent.classList.add('hidden');
  }
}

/* ==========================================================================
   Helper Functions
   ========================================================================== */
function formatScoreBadge(gradeInfo) {
  if (!gradeInfo || gradeInfo.raw === '' || gradeInfo.raw === '-') {
    return `<span class="score-pill score-empty">-</span>`;
  }
  if (gradeInfo.score === null) {
    return `<span class="score-pill score-empty">${gradeInfo.raw}</span>`;
  }
  const score = gradeInfo.score;
  let cls = 'score-empty';
  if (score >= 85) cls = 'score-high';
  else if (score >= 70) cls = 'score-medium';
  else if (score >= 50) cls = 'score-ok';
  else cls = 'score-low';

  return `<span class="score-pill ${cls}">${score}</span>`;
}

function getAverageClass(avg) {
  if (avg === null || isNaN(avg)) return 'score-empty';
  if (avg >= 85) return 'score-high';
  if (avg >= 70) return 'score-medium';
  if (avg >= 50) return 'score-ok';
  return 'score-low';
}

function getInitials(name) {
  if (!name) return 'M';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatTime(date) {
  if (!date) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function updateSyncStatus(type, text) {
  const indicator = elements.syncStatus.querySelector('.pulse-indicator');
  indicator.className = 'pulse-indicator ' + (type === 'live' ? '' : type);
  elements.syncText.textContent = text;
}

function setLoadingState(isLoading) {
  state.isLoading = isLoading;
  if (isLoading) {
    elements.loadingState.classList.remove('hidden');
    elements.gradeTable.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
  } else {
    elements.loadingState.classList.add('hidden');
  }
}

function showToast(msg, isError = false) {
  elements.toastMessage.textContent = msg;
  elements.toast.style.borderColor = isError ? '#EF4444' : 'var(--border-focus)';
  elements.toast.classList.remove('hidden');
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3500);
}

/* ==========================================================================
   Export to CSV Feature
   ========================================================================== */
function exportToCsv() {
  const filtered = getFilteredAndSortedStudents();
  if (filtered.length === 0) {
    showToast('Tidak ada data untuk diekspor', true);
    return;
  }

  const { tasks } = getVisibleColumns();
  let csvContent = 'data:text/csv;charset=utf-8,';

  // Headers (ignoring Email & Admin)
  const headers = ['No', 'Nama', 'NIM'];
  tasks.forEach(t => headers.push(`"${t.weekLabel} - ${t.label}"`));
  headers.push('Rata-rata', 'Tugas Terisi');
  csvContent += headers.join(',') + '\r\n';

  // Rows
  filtered.forEach(s => {
    const row = [
      s.no,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.nim}"`
    ];
    tasks.forEach(t => {
      const g = s.grades[t.id];
      row.push(g ? (g.score !== null ? g.score : (g.raw || '-')) : '-');
    });
    row.push(s.average !== null ? s.average.toFixed(1) : '-');
    row.push(s.submittedCount);
    csvContent += row.join(',') + '\r\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Rekap_Nilai_Mahasiswa_${state.currentTab}_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('File CSV berhasil diunduh!');
}

/* ==========================================================================
   Embedded Offline Snapshot (Fallback when offline / local file without server)
   ========================================================================== */
function loadFallbackSnapshot() {
  // Snapshot from Google Sheet fetched earlier to guarantee instant demo even without internet
  const fallbackCsv = `,PENILAIAN PERSAMAAN DIFFERENSIAL A,,,,,,,,,,,,,,,,,,
,Dosen,,Email,Admin,,,,,,,,,,,,,,,
,"Dr. Ir. Wijaya Yudha Atmaja, S. T., M. Eng.",-,,TRUE,,,,,,,,,,,,,,,
,,,,,Week 1,,Week 2,,Week 3,,Week 4,,Week 5,,Week 6,,Week 7,,
No,Nama,NIM,Email,Admin,In-Class Problem,Exit Ticket,In-Class Problem,Exit Ticket,In-Class Problem,Exit Ticket,In-Class Problem,Exit Ticket,In-Class Problem,Exit Ticket,In-Class Problem,Exit Ticket,In-Class Problem,Exit Ticket,UTS
1,Jovan Nathanael Gondomulyono,22/494761/TK/54307,,FALSE,-,,,-,-,,,,,,,,,,
2,Mochamad Zaky Pradana,22/499965/TK/54779,,FALSE,-,,,-,-,,,,,,,,,,
3,Muhammad Zaki Farhan,22/505281/TK/55283,,FALSE,-,,,-,-,,,,,,,,,,
4,Gamma Nasim,23/515518/TK/56679,,FALSE,-,,,-,-,,,,,,,,,,
5,Fahmi Irfan Faiz,23/520563/TK/57396,,FALSE,-,,,-,-,,,,,,,,,,
6,Halomoan Lyon Gregorius Haumahu,23/522182/TK/57614,,FALSE,-,,,-,-,,,,,,,,,,
7,A Bill Haq Adiluhung,23/522324/TK/57646,,FALSE,-,,,-,-,,,,,,,,,,
8,ALVITO RAMADHANY RAFLI,24/538017/TK/59660,,FALSE,-,,,-,-,,,,,,,,,,
9,Adrian Bagas Ananto,25/555366/TK/62614,,FALSE,-,,,-,-,,,,,,,,,,
10,Shidqi Noor Faadhil,25/555418/TK/62623,,FALSE,-,,,-,-,,,,,,,,,,
11,Dhali' Rozan Fadhaillah,25/555492/TK/62630,,FALSE,-,,,-,-,,,,,,,,,,
12,Muhammad Fayyazh Athhar Setiadi,25/555656/TK/62653,,FALSE,-,,,-,-,,,,,,,,,,
13,Mangihut Tua Simbolon,25/556059/TK/62705,,FALSE,-,,,-,-,,,,,,,,,,
14,Shidiq Dzakwan Ghifari,25/556082/TK/62711,,FALSE,-,,,-,-,,,,,,,,,,
15,Zulfina Fauziyah Rahmah,25/556107/TK/62717,,FALSE,-,,,-,-,,,,,,,,,,
16,Yohana Novena Anggraini,25/556156/TK/62723,,FALSE,-,,,-,-,,,,,,,,,,
17,Faiz Izzuddin,25/556179/TK/62726,,FALSE,-,,,-,-,,,,,,,,,,
18,Ihsannabigh Mayka Iskandar,25/556261/TK/62738,,FALSE,-,,,-,-,,,,,,,,,,
19,Ramadani Fadhlurrahman,25/556288/TK/62743,,FALSE,-,,,-,-,,,,,,,,,,
20,Ammar Ameera Ahmad,25/556416/TK/62758,,FALSE,-,,,-,-,,,,,,,,,,
21,Muhammad Althaf Adzaki,25/556435/TK/62763,,FALSE,-,,,-,-,,,,,,,,,,
22,Ibrahim Hanif Roland Saputra,25/556447/TK/62765,,FALSE,-,,,-,-,,,,,,,,,,
23,Fadhel Muhammad Falafi,25/556452/TK/62767,,FALSE,-,,,-,-,,,,,,,,,,
24,Nazma Desyana Putri,25/556501/TK/62771,,FALSE,-,,,-,-,,,,,,,,,,
25,Hikmal Abrar Ozaki,25/556519/TK/62776,,FALSE,-,,,-,-,,,,,,,,,,
26,Enni Ahsanu Nadiyya,25/556648/TK/62794,,FALSE,-,,,-,-,,,,,,,,,,
27,Daniel Panggabean,25/556793/TK/62810,,FALSE,-,,,-,-,,,,,,,,,,
28,Evandel Mendrofa,25/557078/TK/62862,,FALSE,-,,,-,-,,,,,,,,,,
29,Hillary Kayla Dewijana Muskita,25/557196/TK/62884,,FALSE,-,,,-,-,,,,,,,,,,
30,Rosa Cahyanti Dewi,25/557347/TK/62913,,FALSE,-,,,-,-,,,,,,,,,,
31,Mahastya Eijksan Aydin,25/557548/TK/62952,,FALSE,-,,,-,-,,,,,,,,,,
32,Diara Putra Mahenda,25/557577/TK/62961,,FALSE,-,,,-,-,,,,,,,,,,
33,Saif Arrahman,25/557735/TK/62983,,FALSE,-,,,-,-,,,,,,,,,,
34,Gede Narendra Pangayoman,25/557846/TK/62999,,FALSE,-,,,-,-,,,,,,,,,,
35,Muhamad Amri Riza Fadhilah,25/557944/TK/63010,,FALSE,-,,,-,-,,,,,,,,,,
36,Muhammad Nabeel Alhadi,25/558052/TK/63027,,FALSE,-,,,-,-,,,,,,,,,,
37,Brilliano Putra Pradhitya,25/558108/TK/63033,,TRUE,-,100,100,-,-,,,,,,,,,,
38,Kanzia Ammar Rafif Tabarriza,25/559506/TK/63148,,FALSE,-,,,-,-,,,,,,,,,,
39,Raissha Hakim Murestyanti,25/559519/TK/63151,,FALSE,-,,,-,-,,,,,,,,,,
40,Qowiyyul Fahmi,25/559558/TK/63163,,FALSE,-,,,-,-,,,,,,,,,,
41,Imaduddin Qawim Al Hakim,25/559601/TK/63169,,FALSE,-,,,-,-,,,,,,,,,,
42,Wildan Daffy Ramadhan,25/559671/TK/63181,,FALSE,-,,,-,-,,,,,,,,,,
43,Cindy Fatikasari,25/559707/TK/63186,,FALSE,-,,,-,-,,,,,,,,,,
44,Ramos Edward Jonathan Sinaga,25/559742/TK/63193,,FALSE,-,,,-,-,,,,,,,,,,
45,Muhammad Arif Al Farizi,25/559771/TK/63196,,FALSE,-,,,-,-,,,,,,,,,,
46,Afnan Resa Al Fiqri,25/559839/TK/63204,,FALSE,-,,,-,-,,,,,,,,,,
47,Faiza Naufalia Ghaisani,25/559869/TK/63209,,FALSE,-,,,-,-,,,,,,,,,,
48,V. Novendria Ananda Putra,25/559918/TK/63215,,FALSE,-,,,-,-,,,,,,,,,,
49,Farid Nur Ramadhan Abidin,25/559987/TK/63228,,FALSE,-,,,-,-,,,,,,,,,,
50,Muhammad Kevin Setiko,25/560376/TK/63287,,FALSE,-,,,-,-,,,,,,,,,,
51,Muhammad Haykal Faizul Haq,25/560398/TK/63292,,FALSE,-,,,-,-,,,,,,,,,,
52,Yuma Binar Aryaputra,25/560457/TK/63303,,FALSE,-,,,-,-,,,,,,,,,,
53,Jason Nathanael Indra,25/560513/TK/63310,,FALSE,-,,,-,-,,,,,,,,,,
54,Raisah Kirana Candra,25/560843/TK/63354,,FALSE,-,,,-,-,,,,,,,,,,
55,Sulthan Athaullah,25/560921/TK/63362,,FALSE,-,,,-,-,,,,,,,,,,
56,Muhammad Azad Moqtafin,25/560953/TK/63368,,FALSE,-,,,-,-,,,,,,,,,,
57,Ekevu Zende,25/561062/TK/63382,,FALSE,-,,,-,-,,,,,,,,,,
58,Muhammad Khalif Zaidan As-Sakhi,25/561072/TK/63383,,FALSE,-,,,-,-,,,,,,,,,,
59,Alifia Melannisa Az-Zahra,25/561122/TK/63390,,FALSE,-,,,-,-,,,,,,,,,,
60,Faiz Daffa Mahardhika,25/561136/TK/63391,,FALSE,-,,,-,-,,,,,,,,,,
61,Mahraufan Shaka Al Fattah,25/561384/TK/63419,,FALSE,-,,,-,-,,,,,,,,,,
62,Abdillah Kamal Azizy,25/561425/TK/63428,,FALSE,-,,,-,-,,,,,,,,,,
63,Melvin Efendy,25/561797/TK/63495,,FALSE,-,,,-,-,,,,,,,,,,
64,Reskha Dwi Oktaviani,25/561883/TK/63510,,FALSE,-,,,-,-,,,,,,,,,,
65,Muhammad Rafa Ramadhani,25/562068/TK/63534,,FALSE,-,,,-,-,,,,,,,,,,
66,Tsaqif Abdurrahim,25/562157/TK/63543,,FALSE,-,,,-,-,,,,,,,,,,
67,GALIH AGUNG NUGROHO,25/563683/TK/63565,,FALSE,-,,,-,-,,,,,,,,,,
68,Ghiyas Syafiq Rizqian,25/563715/TK/63569,,FALSE,-,,,-,-,,,,,,,,,,
69,ALI RIDWAN,25/563828/TK/63585,,FALSE,-,,,-,-,,,,,,,,,,
70,Daryl Immanuel,25/563840/TK/63587,,FALSE,-,,,-,-,,,,,,,,,,
71,MUHAMAD FAUZAN,25/563862/TK/63590,,FALSE,-,,,-,-,,,,,,,,,,
72,Azman Zidni Fadhilah,25/564023/TK/63612,,FALSE,-,,,-,-,,,,,,,,,,
73,DZAKWAN MUNTASHIR,25/564144/TK/63634,,FALSE,-,,,-,-,,,,,,,,,,
74,Naufal Ramadhan Putra Kurnia,25/564503/TK/63679,,FALSE,-,,,-,-,,,,,,,,,,
75,ANDHIKA FEBRIAN PRATAMA,25/564559/TK/63687,,FALSE,-,,,-,-,,,,,,,,,,
76,Raka Arya Kusuma,25/564834/TK/63713,,FALSE,-,,,-,-,,,,,,,,,,
77,PATRICK STEFANUS MANIK,25/564889/TK/63718,,FALSE,-,,,-,-,,,,,,,,,,
78,Janu Rafi Pramudito,25/564925/TK/63721,,FALSE,-,,,-,-,,,,,,,,,,
79,NAUFAL ALHAFIZH,25/565429/TK/63772,,FALSE,-,,,-,-,,,,,,,,,,
80,Diptya Aditya Dhyaksa,25/565553/TK/63793,,FALSE,-,,,-,-,,,,,,,,,,
81,Muhammad Syafiq Yusuf,25/565855/TK/63829,,FALSE,-,,,-,-,,,,,,,,,,
82,Rizky Emirsanie,25/565895/TK/63835,,FALSE,-,,,-,-,,,,,,,,,,
83,Arsa Putra Randrio,25/565962/TK/63842,,FALSE,-,,,-,-,,,,,,,,,,
84,Yohanes Wisanggeni Cahyo Kumolo,25/566044/TK/63854,,FALSE,-,,,-,-,,,,,,,,,,
85,Muhammad Abid Hakim,25/566226/TK/63879,,FALSE,-,,,-,-,,,,,,,,,,
86,FAJWA NUR AZZAHRA,25/566510/TK/63902,,FALSE,-,,,-,-,,,,,,,,,,
87,Muhammad Azarya Sanjaya,25/566678/TK/63917,,FALSE,-,,,-,-,,,,,,,,,,
88,MUHAMMAD AQIL SYAUQI NUGRAHAPUTRA,25/567268/TK/63994,,FALSE,-,,,-,-,,,,,,,,,,
89,Nehan Parsa Purnomo,25/567290/TK/63998,,FALSE,-,,,-,-,,,,,,,,,,
90,Nafi Hasan Rais,25/567304/TK/63999,,FALSE,-,,,-,-,,,,,,,,,,
91,Faqi Ammar Muhtasyam,25/567489/TK/64026,,FALSE,-,,,-,-,,,,,,,,,,
92,Ravka Maheswara Perdana,25/567497/TK/64027,,FALSE,-,,,-,-,,,,,,,,,,
93,Isnanda Hidayati Nasira,25/567792/TK/64048,,FALSE,-,,,-,-,,,,,,,,,,
94,Aqila Kresna Arrafi,25/568316/TK/64101,,FALSE,-,,,-,-,,,,,,,,,,
95,Florencia Budiasih,25/568523/TK/64128,,FALSE,-,,,-,-,,,,,,,,,,
96,MUHAMMAD ZAHIR ALI,25/568649/TK/64138,,FALSE,-,,,-,-,,,,,,,,,,
97,GHALIB ABID FARREL,25/569025/TK/64161,,FALSE,-,,,-,-,,,,,,,,,,`;

  parseCsvData(fallbackCsv);
  updateSyncStatus('offline', 'Data Snapshot Tersedia');
  updateAnalytics();
  renderTable();
}
