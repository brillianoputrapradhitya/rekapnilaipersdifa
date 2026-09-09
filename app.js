/**
 * Dashboard Nilai Mahasiswa & Tugas Harian
 * Real-time Sync with Google Sheets
 */

// Configuration
const CONFIG = {
  sheetId: '1ALjtCw64npBQmjibmViM9kluwvz4jPrPrM3OVmNhfSM',
  defaultClassId: 'A',
  // Registered classes (reproducible: add new classes here or via the web UI)
  classes: [
    {
      id: 'A',
      name: 'Kelas A',
      sheetName: 'PersDif A',
      gid: '1378678540',
      badge: 'Persamaan Diferensial (Kelas A)',
      title: 'Rekap Nilai Harian Persamaan Diferensial A 2026'
    },
    {
      id: 'C',
      name: 'Kelas C',
      sheetName: 'PersDif C',
      gid: '896165960',
      badge: 'Persamaan Diferensial (Kelas C)',
      title: 'Rekap Nilai Harian Persamaan Diferensial C 2026'
    }
  ],
  // Google Apps Script Web App URL untuk Two-Way Sync (Write/Update Nilai)
  // Tempelkan URL Web App yang didapat dari langkah penerapan di Google Spreadsheet Anda di sini:
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbwuH0JzNZPcxoX7Kdo_unXbb2PS2HCjbxp-WDGXUuUXHue8jbS78EQH3gZcy5Z3Bk0C/exec', 
  autoRefreshIntervalMs: 60000, // Auto refresh every 60s
  passingScore: 70
};

// Application State
let state = {
  classes: [],
  currentClassId: 'A',
  studentCounts: {},
  classDataCache: {},
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
  // Landing Page & Portal State
  currentView: 'portal', // 'portal' (Landing Page) or 'fulldata' (Full Data Table)
  portalSelectedStudent: null,
  chartInstance: null,
  // Admin & Authentication State
  adminList: [
    { email: 'wyatmaja@ugm.ac.id', name: 'Dr. Ir. Wijaya Yudha Atmaja, S. T., M. Eng.', role: 'Dosen' },
    { email: 'brillianoputrapradhitya@mail.ugm.ac.id', name: 'Brilliano Putra Pradhitya', role: 'Admin / Asisten' }
  ],
  adminEmails: new Set([
    'wyatmaja@ugm.ac.id',
    'brillianoputrapradhitya@mail.ugm.ac.id'
  ]),
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
  modalBest80Score: document.getElementById('modalBest80Score'),
  modalCompletedTasks: document.getElementById('modalCompletedTasks'),
  modalCompletionPercent: document.getElementById('modalCompletionPercent'),
  modalWeeksGrid: document.getElementById('modalWeeksGrid'),
  btnModalClose: document.getElementById('btnModalClose'),
  btnCloseModalBtn: document.getElementById('btnCloseModalBtn'),
  btnModalOpenPortal: document.getElementById('btnModalOpenPortal'),
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
  btnCancelEditStudent: document.getElementById('btnCancelEditStudent'),
  // Class Navigation Controls
  classNavBar: document.getElementById('classNavBar'),
  classPills: document.getElementById('classPills'),
  btnAddClass: document.getElementById('btnAddClass'),
  classBadge: document.getElementById('classBadge'),
  headerTitle: document.getElementById('headerTitle'),
  addClassModal: document.getElementById('addClassModal'),
  btnCloseAddClassModal: document.getElementById('btnCloseAddClassModal'),
  btnCancelAddClass: document.getElementById('btnCancelAddClass'),
  formAddClass: document.getElementById('formAddClass'),
  inputClassName: document.getElementById('inputClassName'),
  inputSheetName: document.getElementById('inputSheetName'),
  inputGid: document.getElementById('inputGid'),
  btnSubmitAddClass: document.getElementById('btnSubmitAddClass'),
  // View Switcher Elements
  btnViewPortal: document.getElementById('btnViewPortal'),
  btnViewFullData: document.getElementById('btnViewFullData'),
  portalView: document.getElementById('portalView'),
  fullDataView: document.getElementById('fullDataView'),
  btnHeroFullData: document.getElementById('btnHeroFullData'),
  btnCtaFullData: document.getElementById('btnCtaFullData'),
  btnBackToPortal: document.getElementById('btnBackToPortal'),
  portalClassBadge: document.getElementById('portalClassBadge'),
  portalHeroSyncText: document.getElementById('portalHeroSyncText'),
  portalSeamlessCourse: document.getElementById('portalSeamlessCourse'),
  btnPortalToFullData: document.getElementById('btnPortalToFullData'),
  btnPortalThemeToggle: document.getElementById('btnPortalThemeToggle'),
  // Portal Search & Autocomplete
  portalSearchInput: document.getElementById('portalSearchInput'),
  btnClearPortalSearch: document.getElementById('btnClearPortalSearch'),
  portalSearchDropdown: document.getElementById('portalSearchDropdown'),
  portalClassPills: document.getElementById('portalClassPills'),
  // Portal Welcome & Quick Picks
  portalWelcomeState: document.getElementById('portalWelcomeState'),
  portalQuickPickList: document.getElementById('portalQuickPickList'),
  // Portal Student Result
  portalStudentResult: document.getElementById('portalStudentResult'),
  portalAvatar: document.getElementById('portalAvatar'),
  portalStudentName: document.getElementById('portalStudentName'),
  portalStudentClass: document.getElementById('portalStudentClass'),
  portalStudentNiu: document.getElementById('portalStudentNiu'),
  portalStudentNim: document.getElementById('portalStudentNim'),
  portalStudentEmail: document.getElementById('portalStudentEmail'),
  btnPortalPrint: document.getElementById('btnPortalPrint'),
  btnPortalEdit: document.getElementById('btnPortalEdit'),
  btnPortalCloseStudent: document.getElementById('btnPortalCloseStudent'),
  portalBest80Val: document.getElementById('portalBest80Val'),
  portalBest80Desc: document.getElementById('portalBest80Desc'),
  portalIcp80Val: document.getElementById('portalIcp80Val'),
  portalIcp80Desc: document.getElementById('portalIcp80Desc'),
  portalIcpBar: document.getElementById('portalIcpBar'),
  portalEt80Val: document.getElementById('portalEt80Val'),
  portalEt80Desc: document.getElementById('portalEt80Desc'),
  portalEtBar: document.getElementById('portalEtBar'),
  portalCompletionVal: document.getElementById('portalCompletionVal'),
  portalCompletionDesc: document.getElementById('portalCompletionDesc'),
  portalCompletionBar: document.getElementById('portalCompletionBar'),
  portalProgressChart: document.getElementById('portalProgressChart'),
  portalWeeksGrid: document.getElementById('portalWeeksGrid')
};

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initClasses();
  initEventListeners();
  initFirebaseAuth();
  updateAuthUI();
  discoverSpreadsheetSheets();

  // Muat kelas aktif terlebih dahulu, lalu preload kelas lain setelah selesai
  await loadData();
  preloadAllClasses();

  // Auto refresh periodically
  setInterval(async () => {
    await loadData(true);
    preloadAllClasses();
  }, CONFIG.autoRefreshIntervalMs);
});

function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}

function initEventListeners() {
  // Theme Toggle
  const handleThemeToggle = () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('gradebook_theme_ugm', state.theme);
    showToast(`Beralih ke tema ${state.theme === 'dark' ? 'Gelap' : 'Terang'}`);
    if (state.portalSelectedStudent && typeof renderProgressChart === 'function') {
      renderProgressChart(state.portalSelectedStudent);
    }
  };
  if (elements.btnThemeToggle) {
    elements.btnThemeToggle.addEventListener('click', handleThemeToggle);
  }
  if (elements.btnPortalThemeToggle) {
    elements.btnPortalThemeToggle.addEventListener('click', handleThemeToggle);
  }

  // Manual Refresh
  elements.btnRefresh.addEventListener('click', async () => {
    const spinIcon = elements.btnRefresh.querySelector('.spin-icon');
    spinIcon.classList.add('spinning');
    try {
      await discoverSpreadsheetSheets();
      await loadData(false);
    } finally {
      setTimeout(() => spinIcon.classList.remove('spinning'), 600);
    }
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
      } else if (elements.addClassModal && !elements.addClassModal.classList.contains('hidden')) {
        closeAddClassModal();
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

  // Class Navigation & Multi-Class Events
  if (elements.btnAddClass) {
    elements.btnAddClass.addEventListener('click', openAddClassModal);
  }
  if (elements.btnCloseAddClassModal) {
    elements.btnCloseAddClassModal.addEventListener('click', closeAddClassModal);
  }
  if (elements.btnCancelAddClass) {
    elements.btnCancelAddClass.addEventListener('click', closeAddClassModal);
  }
  if (elements.addClassModal) {
    elements.addClassModal.addEventListener('click', (e) => {
      if (e.target === elements.addClassModal) closeAddClassModal();
    });
  }
  if (elements.formAddClass) {
    elements.formAddClass.addEventListener('submit', handleAddClassSubmit);
  }

  // View Switcher (Landing Page / Portal vs Full Data)
  if (elements.btnViewPortal) {
    elements.btnViewPortal.addEventListener('click', () => switchView('portal'));
  }
  if (elements.btnViewFullData) {
    elements.btnViewFullData.addEventListener('click', () => switchView('fulldata'));
  }
  if (elements.btnHeroFullData) {
    elements.btnHeroFullData.addEventListener('click', () => switchView('fulldata'));
  }
  if (elements.btnCtaFullData) {
    elements.btnCtaFullData.addEventListener('click', () => switchView('fulldata'));
  }
  if (elements.btnBackToPortal) {
    elements.btnBackToPortal.addEventListener('click', () => switchView('portal'));
  }
  if (elements.btnPortalToFullData) {
    elements.btnPortalToFullData.addEventListener('click', () => switchView('fulldata'));
  }

  // Portal Search & Autocomplete
  if (elements.portalSearchInput) {
    elements.portalSearchInput.addEventListener('input', handlePortalSearchInput);
    elements.portalSearchInput.addEventListener('keydown', handlePortalSearchKeydown);
  }
  if (elements.btnClearPortalSearch) {
    elements.btnClearPortalSearch.addEventListener('click', clearPortalSearch);
  }
  document.addEventListener('click', (e) => {
    if (elements.portalSearchDropdown && !elements.portalSearchDropdown.contains(e.target) && e.target !== elements.portalSearchInput) {
      elements.portalSearchDropdown.classList.add('hidden');
    }
  });

  // Portal Student Result Actions
  if (elements.btnPortalCloseStudent) {
    elements.btnPortalCloseStudent.addEventListener('click', closePortalStudent);
  }
  if (elements.btnPortalPrint) {
    elements.btnPortalPrint.addEventListener('click', () => window.print());
  }
  if (elements.btnPortalEdit) {
    elements.btnPortalEdit.addEventListener('click', () => {
      if (state.portalSelectedStudent) {
        openStudentModal(state.portalSelectedStudent.nim);
      }
    });
  }
}

/* ==========================================================================
   Landing Page & Student Portal Management (Best of 80% & Interactive Charts)
   ========================================================================== */

/**
 * Ekstraksi 6-Digit NIU dari format NIM UGM (contoh: 22/494761/TK/54307 -> 494761)
 */
function getStudentNiu(nim) {
  if (!nim) return '-';
  const clean = nim.toString().trim();
  // Cari 6 digit angka berurutan
  const m = clean.match(/\b(\d{6})\b/);
  if (m) return m[1];
  const parts = clean.split('/');
  for (const p of parts) {
    const t = p.trim();
    if (/^\d{6}$/.test(t)) return t;
  }
  return clean;
}

/**
 * Menghitung Best of 80% Average dari In-Class Problem dan Exit Ticket (tanpa UTS)
 * dengan bobot 3:2 (In-Class Problem bobot 3, Exit Ticket bobot 2).
 */
function calculateBest80(student) {
  if (!student || !student.grades) {
    return {
      finalScore: null,
      icp: { avg: null, total: 0, keptCount: 0, dropCount: 0, keptIds: new Set(), droppedIds: new Set() },
      et: { avg: null, total: 0, keptCount: 0, dropCount: 0, keptIds: new Set(), droppedIds: new Set() },
      isTaskKept: () => false,
      isTaskDropped: () => false
    };
  }

  // Tentukan tugas-tugas yang aktif / diadakan di kelas mahasiswa ini
  const clsId = student.classId || state.currentClassId;
  const classActive = (state.classActiveTasks && state.classActiveTasks[clsId]) 
    ? state.classActiveTasks[clsId] 
    : (state.activeTasks || []);

  const icpTasks = ALL_TASKS.filter(t => t.weekId !== 'uts' && t.id.includes('inclass'));
  const etTasks = ALL_TASKS.filter(t => t.weekId !== 'uts' && t.id.includes('exit'));

  // Saring HANYA tugas yang memang diadakan di kelas ini (ada minimal 1 mahasiswa di kelas yang dinilai)
  const activeIcp = icpTasks.filter(t => classActive.includes(t.id));
  const activeEt = etTasks.filter(t => classActive.includes(t.id));

  function evalCategory(tasks) {
    if (!tasks || tasks.length === 0) {
      return { avg: null, total: 0, keptCount: 0, dropCount: 0, keptIds: new Set(), droppedIds: new Set(), items: [] };
    }

    const items = tasks.map(t => {
      const g = student.grades[t.id];
      const hasScore = g && g.score !== null && !isNaN(g.score);
      // Jika tugas diadakan di kelasnya namun mahasiswa tidak ada nilai (kosong / -),
      // maka nilainya dianggap 0 (tidak mengumpulkan)
      const scoreVal = hasScore ? g.score : 0;
      return {
        taskId: t.id,
        label: t.label,
        weekId: t.weekId,
        weekLabel: t.weekLabel,
        score: scoreVal,
        hasScore: hasScore,
        raw: g ? g.raw : ''
      };
    });

    // Ambil 80% tugas terbaik (drop 20% nilai terendah)
    const keptCount = Math.max(1, Math.ceil(items.length * 0.8));
    const dropCount = items.length - keptCount;

    // Urutkan nilai menurun (terbesar ke terkecil)
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const keptList = sorted.slice(0, keptCount);
    const droppedList = sorted.slice(keptCount);

    const keptIds = new Set(keptList.map(x => x.taskId));
    const droppedIds = new Set(droppedList.map(x => x.taskId));

    const sumKept = keptList.reduce((acc, curr) => acc + curr.score, 0);
    const avg = keptCount > 0 ? (sumKept / keptCount) : null;

    return {
      avg,
      total: items.length,
      keptCount,
      dropCount,
      keptIds,
      droppedIds,
      items
    };
  }

  const icpResult = evalCategory(activeIcp);
  const etResult = evalCategory(activeEt);

  let finalScore = null;
  // Bobot 3 (ICP) : 2 (ET) -> (3 * ICP_80% + 2 * ET_80%) / 5
  if (icpResult.avg !== null && etResult.avg !== null) {
    finalScore = (3 * icpResult.avg + 2 * etResult.avg) / 5;
  } else if (icpResult.avg !== null) {
    finalScore = icpResult.avg;
  } else if (etResult.avg !== null) {
    finalScore = etResult.avg;
  }

  return {
    finalScore,
    icp: icpResult,
    et: etResult,
    isTaskKept: (taskId) => icpResult.keptIds.has(taskId) || etResult.keptIds.has(taskId),
    isTaskDropped: (taskId) => icpResult.droppedIds.has(taskId) || etResult.droppedIds.has(taskId)
  };
}

/**
 * Berpindah tampilan antara Landing Page / Portal Mahasiswa ('portal') dan Tabel Lengkap ('fulldata')
 */
function switchView(viewName, updateUrl = true) {
  state.currentView = viewName;

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', viewName);
    window.history.pushState({ view: viewName, classId: state.currentClassId }, '', url);
  }

  if (viewName === 'fulldata') {
    document.body.classList.remove('view-portal-active');
    document.body.classList.add('view-fulldata-active');
    if (elements.portalView) elements.portalView.classList.add('hidden');
    if (elements.fullDataView) elements.fullDataView.classList.remove('hidden');
    if (elements.btnViewPortal) elements.btnViewPortal.classList.remove('active');
    if (elements.btnViewFullData) elements.btnViewFullData.classList.add('active');
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    // portal
    document.body.classList.remove('view-fulldata-active');
    document.body.classList.add('view-portal-active');
    if (elements.fullDataView) elements.fullDataView.classList.add('hidden');
    if (elements.portalView) elements.portalView.classList.remove('hidden');
    if (elements.btnViewFullData) elements.btnViewFullData.classList.remove('active');
    if (elements.btnViewPortal) elements.btnViewPortal.classList.add('active');

    updatePortalClassPills();
    renderPortalQuickPicks();

    if (state.portalSelectedStudent) {
      renderPortalStudent(state.portalSelectedStudent);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * Render pills kelas aktif pada portal pencarian
 */
function updatePortalClassPills() {
  if (!elements.portalClassPills) return;
  elements.portalClassPills.innerHTML = '';

  state.classes.forEach(cls => {
    const btn = document.createElement('button');
    const isActive = cls.id === state.currentClassId;
    btn.className = `portal-class-pill ${isActive ? 'active' : ''}`;
    btn.type = 'button';
    btn.textContent = cls.name;
    btn.title = `Pindah ke data ${cls.name}`;
    btn.addEventListener('click', () => {
      switchClass(cls.id);
    });
    elements.portalClassPills.appendChild(btn);
  });
}

/**
 * Helper untuk mengambil teks CSV kelas secara resilient (mencoba gviz terlebih dahulu tanpa 307 redirect CORS)
 */
async function fetchClassCsv(cls) {
  const gvizUrl = cls.sheetName
    ? `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cls.sheetName)}`
    : (cls.gid 
        ? `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv&gid=${cls.gid}`
        : `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv`);

  const exportUrl = cls.gid 
    ? `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/export?format=csv&gid=${cls.gid}`
    : `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/export?format=csv`;

  try {
    const gvizResp = await fetch(gvizUrl, { cache: 'no-cache' });
    if (gvizResp.ok) return await gvizResp.text();
  } catch (err) {
    // fallback ke export
  }

  const exportResp = await fetch(exportUrl, { cache: 'no-cache' });
  if (!exportResp.ok) throw new Error(`HTTP ${exportResp.status}`);
  return await exportResp.text();
}

/**
 * Mengambil seluruh data mahasiswa dari semua kelas yang telah ter-cache
 * Menjaga urutan kelas secara konsisten (Kelas A, lalu Kelas C, dsb.)
 */
function getAllPortalStudents() {
  const map = new Map();
  // Ambil dari cache seluruh kelas dengan urutan terdefinisi (Kelas A, lalu Kelas C)
  const classOrder = [...state.classes];
  classOrder.forEach(cls => {
    const list = state.classDataCache ? state.classDataCache[cls.id] : null;
    if (Array.isArray(list)) {
      list.forEach(s => {
        // Pastikan classId selalu di-set sesuai kelas cache-nya (bukan default currentClassId)
        if (!s.classId) s.classId = cls.id;
        if (!s.className) s.className = cls.name;
        const key = `${s.classId}_${s.nim}`;
        map.set(key, s);
      });
    }
  });

  // Masukkan juga mahasiswa aktif saat ini jika belum masuk map
  // Gunakan classId yang tersimpan di student object (bukan fallback state.currentClassId)
  if (Array.isArray(state.students)) {
    state.students.forEach(s => {
      // Jika classId belum di-set, gunakan currentClassId saat data ini di-load
      const resolvedClassId = s.classId || state.currentClassId;
      const key = `${resolvedClassId}_${s.nim}`;
      if (!map.has(key)) {
        // Clone agar tidak mutasi state.students secara global
        const clone = { ...s, classId: resolvedClassId };
        if (!clone.className) {
          const cls = state.classes.find(c => c.id === resolvedClassId);
          clone.className = cls ? cls.name : `Kelas ${resolvedClassId}`;
        }
        map.set(key, clone);
      }
    });
  }
  return Array.from(map.values());
}

/**
 * Preload data spreadsheet dari seluruh kelas selain kelas aktif secara silent di background
 * Selalu refresh semua kelas non-aktif agar data cross-class search selalu up-to-date
 */
async function preloadAllClasses() {
  // Load semua kelas NON-AKTIF (kelas aktif sudah diurus oleh loadData)
  const otherClasses = state.classes.filter(c => c.id !== state.currentClassId);
  if (otherClasses.length === 0) return;

  const promises = otherClasses.map(async (cls) => {
    try {
      const csvText = await fetchClassCsv(cls);
      parseCsvData(csvText, cls, true);
    } catch (e) {
      console.warn(`Preload data kelas ${cls.name} gagal:`, e);
    }
  });

  await Promise.all(promises);
  renderPortalQuickPicks();
}

/**
 * Render daftar sampel mahasiswa cepat untuk preview instan pada landing page (dari Kelas A & C)
 * Tidak menampilkan NIU dosen/admin (558108) sebagai contoh
 */
function renderPortalQuickPicks() {
  if (!elements.portalQuickPickList) return;
  elements.portalQuickPickList.innerHTML = '';

  const allStudents = getAllPortalStudents();
  if (allStudents.length === 0) {
    elements.portalQuickPickList.innerHTML = '<span class="quick-pick-empty">Memuat data mahasiswa...</span>';
    return;
  }

  // Ambil sampel berimbang dari masing-masing kelas (Kelas A dan Kelas C), kecualikan admin (NIU 558108)
  const classA = allStudents.filter(s => (s.classId || 'A') === 'A' && !s.isAdmin && s.niu !== '558108').slice(0, 4);
  const classC = allStudents.filter(s => s.classId === 'C' && !s.isAdmin && s.niu !== '558108').slice(0, 4);
  const samples = [...classA, ...classC];

  samples.forEach(s => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quick-pick-chip';
    const niu = s.niu && s.niu !== '-' ? s.niu : (s.nim.split('/')[1] || '');
    const clsTag = s.classId === 'C' ? 'Kelas C' : 'Kelas A';
    chip.innerHTML = `
      <span class="chip-avatar">${getInitials(s.name)}</span>
      <span class="chip-name">${s.name}</span>
      <span class="chip-niu">${niu}</span>
      <span class="chip-class-tag">${clsTag}</span>
    `;
    chip.addEventListener('click', () => {
      selectPortalStudent(s, true);
    });
    elements.portalQuickPickList.appendChild(chip);
  });
}

/**
 * Menghitung skor relevansi pencarian mahasiswa
 */
function computeStudentRelevance(s, q) {
  const name = (s.name || '').toLowerCase();
  const nim = (s.nim || '').toLowerCase();
  const niu = (s.niu || '').toLowerCase();
  const qClean = q.replace(/[\/\s-]/g, '');
  const nimClean = nim.replace(/[\/\s-]/g, '');

  if (!name.includes(q) && !nim.includes(q) && !niu.includes(q) && !nimClean.includes(qClean)) {
    return 0;
  }

  let score = 10;
  // Exact match
  if (niu === q || nim === q || nimClean === qClean) score += 100;
  else if (name === q) score += 95;
  // Prefix match pada NIU atau NIM
  else if (niu.startsWith(q)) score += 85;
  else if (nimClean.startsWith(qClean)) score += 80;
  // Prefix match pada Nama
  else if (name.startsWith(q)) score += 75;
  else if (name.split(/\s+/).some(w => w.startsWith(q))) score += 65;
  // Substring match
  else if (niu.includes(q)) score += 50;
  else if (name.includes(q)) score += 40;
  else if (nim.includes(q)) score += 30;

  return score;
}

/**
 * Render satu item mahasiswa di dalam dropdown
 */
function renderDropdownItemHtml(s, query, isFocused) {
  const initials = getInitials(s.name);
  const niu = s.niu || getStudentNiu(s.nim);
  const clsId = s.classId || 'A';
  const clsName = s.className || (clsId === 'C' ? 'Kelas C' : 'Kelas A');
  const tagClass = clsId === 'C' ? 'tag-class-c' : 'tag-class-a';
  const b80 = (s.best80 && s.best80.finalScore !== null) ? s.best80.finalScore.toFixed(1) : (s.average !== null ? s.average.toFixed(1) : '-');
  const b80Class = s.best80 && s.best80.finalScore !== null ? getAverageClass(s.best80.finalScore) : 'score-empty';

  return `
    <div class="portal-dropdown-item ${isFocused ? 'focused' : ''}" data-nim="${s.nim}" data-class-id="${clsId}">
      <div class="dropdown-item-left">
        <div class="dropdown-avatar">${initials}</div>
        <div class="dropdown-info">
          <div class="dropdown-name">${highlightMatch(s.name, query)}</div>
          <div class="dropdown-meta">
            <span class="dropdown-class-tag ${tagClass}">${clsName}</span>
            <span class="dropdown-niu">NIU: <strong>${highlightMatch(niu, query)}</strong></span>
            <span class="dropdown-nim">${s.nim}</span>
          </div>
        </div>
      </div>
      <div class="dropdown-item-right">
        <span class="dropdown-score-chip ${b80Class}">Best 80%: ${b80}</span>
      </div>
    </div>
  `;
}

/**
 * Handle pencarian live pada dashboard mahasiswa secara global (Nama atau 6 digit NIU atau NIM lintas kelas)
 */
function handlePortalSearchInput(e) {
  const q = (e.target.value || '').trim().toLowerCase();
  if (!q) {
    if (elements.btnClearPortalSearch) elements.btnClearPortalSearch.classList.add('hidden');
    if (elements.portalSearchDropdown) elements.portalSearchDropdown.classList.add('hidden');
    return;
  }

  if (elements.btnClearPortalSearch) elements.btnClearPortalSearch.classList.remove('hidden');

  // Cari di SEMUA kelas (Kelas A & Kelas C)
  const allStudents = getAllPortalStudents();
  const scoredMatches = [];

  allStudents.forEach(s => {
    const score = computeStudentRelevance(s, q);
    if (score > 0) {
      scoredMatches.push({ student: s, score });
    }
  });

  // Urutkan berdasarkan skor relevansi tertinggi
  scoredMatches.sort((a, b) => b.score - a.score);

  renderPortalDropdown(scoredMatches, q);
}

function handlePortalSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!elements.portalSearchDropdown || elements.portalSearchDropdown.classList.contains('hidden')) return;
    const firstItem = elements.portalSearchDropdown.querySelector('.portal-dropdown-item');
    if (firstItem) {
      const nim = firstItem.dataset.nim;
      const classId = firstItem.dataset.classId;
      const allStudents = getAllPortalStudents();
      const s = allStudents.find(x => x.nim === nim && (x.classId || 'A') === classId) || allStudents.find(x => x.nim === nim);
      if (s) selectPortalStudent(s, true);
    }
  } else if (e.key === 'Escape') {
    if (elements.portalSearchDropdown) elements.portalSearchDropdown.classList.add('hidden');
  }
}

function clearPortalSearch() {
  if (elements.portalSearchInput) {
    elements.portalSearchInput.value = '';
    elements.portalSearchInput.focus();
  }
  if (elements.btnClearPortalSearch) elements.btnClearPortalSearch.classList.add('hidden');
  if (elements.portalSearchDropdown) elements.portalSearchDropdown.classList.add('hidden');
}

/**
 * Render dropdown saran autocomplete dengan indikator kelas (Kelas A & C keduanya ditampilkan!)
 */
function renderPortalDropdown(scoredMatches, query) {
  if (!elements.portalSearchDropdown) return;

  if (!scoredMatches || scoredMatches.length === 0) {
    elements.portalSearchDropdown.innerHTML = `
      <div class="portal-dropdown-empty">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>Mahasiswa dengan kata kunci "<strong>${escapeHtml(query)}</strong>" tidak ditemukan.</span>
      </div>
    `;
    elements.portalSearchDropdown.classList.remove('hidden');
    return;
  }

  // Kelompokkan hasil per kelas agar Kelas A dan Kelas C KEDUANYA selalu muncul
  const classGroups = {};
  scoredMatches.forEach(item => {
    const clsId = item.student.classId || 'A';
    if (!classGroups[clsId]) classGroups[clsId] = [];
    classGroups[clsId].push(item.student);
  });

  const classIds = Object.keys(classGroups);
  // Urutkan kelas: A dulu, baru C
  classIds.sort();

  let html = '';
  let globalItemIndex = 0;

  if (classIds.length > 1) {
    // Hasil ditemukan di multi-kelas (misal Kelas A dan Kelas C):
    // Tampilkan bagian untuk setiap kelas sehingga pengguna melihat keduanya!
    classIds.forEach(clsId => {
      const list = classGroups[clsId];
      const clsName = clsId === 'C' ? 'Kelas C' : (clsId === 'A' ? 'Kelas A' : `Kelas ${clsId}`);
      const tagClass = clsId === 'C' ? 'tag-class-c' : 'tag-class-a';

      html += `
        <div class="portal-dropdown-header">
          <span><span class="dropdown-class-tag ${tagClass}">${clsName}</span> &mdash; ${list.length} Mahasiswa Cocok</span>
        </div>
      `;

      // Ambil hingga 5 mahasiswa teratas dari kelas ini
      const displayList = list.slice(0, 5);
      displayList.forEach(s => {
        html += renderDropdownItemHtml(s, query, globalItemIndex === 0);
        globalItemIndex++;
      });
    });
  } else {
    // Hanya ada 1 kelas yang cocok
    const clsId = classIds[0];
    const list = classGroups[clsId];
    const clsName = clsId === 'C' ? 'Kelas C' : (clsId === 'A' ? 'Kelas A' : `Kelas ${clsId}`);
    const tagClass = clsId === 'C' ? 'tag-class-c' : 'tag-class-a';

    html += `
      <div class="portal-dropdown-header">
        <span><span class="dropdown-class-tag ${tagClass}">${clsName}</span> &mdash; ${list.length} Mahasiswa Cocok</span>
      </div>
    `;

    const displayList = list.slice(0, 10);
    displayList.forEach(s => {
      html += renderDropdownItemHtml(s, query, globalItemIndex === 0);
      globalItemIndex++;
    });
  }

  elements.portalSearchDropdown.innerHTML = html;
  elements.portalSearchDropdown.classList.remove('hidden');

  elements.portalSearchDropdown.querySelectorAll('.portal-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const nim = item.dataset.nim;
      const classId = item.dataset.classId;
      const allStudents = getAllPortalStudents();
      const s = allStudents.find(x => x.nim === nim && (x.classId || 'A') === classId) || allStudents.find(x => x.nim === nim);
      if (s) selectPortalStudent(s, true);
    });
  });
}

function highlightMatch(text, query) {
  if (!text || !query) return text || '';
  const str = text.toString();
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(str);
  const before = escapeHtml(str.substring(0, idx));
  const matched = escapeHtml(str.substring(idx, idx + query.length));
  const after = escapeHtml(str.substring(idx + query.length));
  return `${before}<mark class="search-highlight">${matched}</mark>${after}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Memilih mahasiswa untuk ditampilkan pada dashboard interaktif portal
 */
function selectPortalStudent(student, scroll = true) {
  if (!student) return;
  state.portalSelectedStudent = student;

  // Jika mahasiswa berasal dari kelas lain, sinkronkan kelas aktif secara seamless
  if (student.classId && student.classId !== state.currentClassId) {
    state.currentClassId = student.classId;
    if (state.classDataCache && state.classDataCache[student.classId]) {
      state.students = state.classDataCache[student.classId];
    }
    updateClassNavPills();
  }

  if (!student.best80) {
    student.best80 = calculateBest80(student);
  }

  renderPortalStudent(student);

  if (elements.portalWelcomeState) elements.portalWelcomeState.classList.add('hidden');
  if (elements.portalStudentResult) {
    elements.portalStudentResult.classList.remove('hidden');
    elements.portalStudentResult.classList.remove('portal-fade-in');
    void elements.portalStudentResult.offsetWidth;
    elements.portalStudentResult.classList.add('portal-fade-in');
  }

  if (elements.portalSearchDropdown) elements.portalSearchDropdown.classList.add('hidden');
  if (elements.portalSearchInput) {
    elements.portalSearchInput.value = `${student.name} (NIU: ${student.niu || student.nim})`;
    if (elements.btnClearPortalSearch) elements.btnClearPortalSearch.classList.remove('hidden');
  }

  if (scroll && elements.portalStudentResult) {
    elements.portalStudentResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Menutup kartu hasil mahasiswa pada portal dan kembali ke status pencarian awal
 */
function closePortalStudent() {
  state.portalSelectedStudent = null;
  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }
  if (elements.portalStudentResult) elements.portalStudentResult.classList.add('hidden');
  if (elements.portalWelcomeState) elements.portalWelcomeState.classList.remove('hidden');
  if (elements.portalSearchInput) {
    elements.portalSearchInput.value = '';
    if (elements.btnClearPortalSearch) elements.btnClearPortalSearch.classList.add('hidden');
    elements.portalSearchInput.focus();
  }
}

/**
 * Render seluruh metrik, profil, dan komponen mahasiswa terpilih
 */
function renderPortalStudent(student) {
  if (!student) return;

  const currentClass = state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
  const niu = student.niu || getStudentNiu(student.nim);

  if (elements.portalAvatar) elements.portalAvatar.textContent = getInitials(student.name);
  if (elements.portalStudentName) elements.portalStudentName.textContent = student.name;
  if (elements.portalStudentClass && currentClass) elements.portalStudentClass.textContent = currentClass.name;
  if (elements.portalStudentNiu) {
    elements.portalStudentNiu.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      NIU: <strong>${niu}</strong>
    `;
  }
  if (elements.portalStudentNim) elements.portalStudentNim.textContent = `NIM: ${student.nim}`;
  if (elements.portalStudentEmail) {
    if (student.email) {
      elements.portalStudentEmail.textContent = student.email;
      elements.portalStudentEmail.classList.remove('hidden');
    } else {
      elements.portalStudentEmail.classList.add('hidden');
    }
  }

  // Tombol edit nilai untuk Dosen/Admin
  const isAdmin = !!(state.currentUser && state.currentUser.isAdmin);
  if (elements.btnPortalEdit) {
    if (isAdmin) elements.btnPortalEdit.classList.remove('hidden');
    else elements.btnPortalEdit.classList.add('hidden');
  }

  // Hitung ulang Best of 80%
  const b80 = student.best80 || calculateBest80(student);
  student.best80 = b80;

  // Star KPI: Best of 80%
  if (elements.portalBest80Val) {
    elements.portalBest80Val.textContent = b80.finalScore !== null ? b80.finalScore.toFixed(1) : '-';
  }
  if (elements.portalBest80Desc) {
    elements.portalBest80Desc.textContent = `Mengambil 80% nilai terbaik (drop 20% nilai terendah). UTS tidak dihitung.`;
  }

  // ICP 80%
  if (elements.portalIcp80Val) {
    elements.portalIcp80Val.textContent = b80.icp.avg !== null ? b80.icp.avg.toFixed(1) : '-';
  }
  if (elements.portalIcp80Desc) {
    elements.portalIcp80Desc.textContent = `${b80.icp.keptCount} dari ${b80.icp.total} nilai terbaik diambil (${b80.icp.dropCount} di-drop)`;
  }
  if (elements.portalIcpBar) {
    const pct = b80.icp.avg !== null ? Math.min(100, Math.max(0, b80.icp.avg)) : 0;
    elements.portalIcpBar.style.width = `${pct}%`;
  }

  // ET 80%
  if (elements.portalEt80Val) {
    elements.portalEt80Val.textContent = b80.et.avg !== null ? b80.et.avg.toFixed(1) : '-';
  }
  if (elements.portalEt80Desc) {
    elements.portalEt80Desc.textContent = `${b80.et.keptCount} dari ${b80.et.total} nilai terbaik diambil (${b80.et.dropCount} di-drop)`;
  }
  if (elements.portalEtBar) {
    const pct = b80.et.avg !== null ? Math.min(100, Math.max(0, b80.et.avg)) : 0;
    elements.portalEtBar.style.width = `${pct}%`;
  }

  // Kelengkapan Nilai (Dihitung per kelas secara akurat)
  const clsId = student.classId || state.currentClassId;
  const classActive = (state.classActiveTasks && state.classActiveTasks[clsId]) 
    ? state.classActiveTasks[clsId] 
    : (state.activeTasks || []);

  const totalHeldTasks = classActive.length;
  let submittedActiveCount = 0;

  if (totalHeldTasks > 0) {
    classActive.forEach(taskId => {
      const g = student.grades ? student.grades[taskId] : null;
      if (g && g.score !== null && !isNaN(g.score)) {
        submittedActiveCount++;
      }
    });
  } else {
    submittedActiveCount = student.submittedCount || 0;
  }

  const completionPct = totalHeldTasks > 0 
    ? Math.min(100, Math.round((submittedActiveCount / totalHeldTasks) * 100)) 
    : 0;

  if (elements.portalCompletionVal) {
    if (totalHeldTasks > 0) {
      elements.portalCompletionVal.textContent = `${submittedActiveCount} / ${totalHeldTasks}`;
    } else {
      elements.portalCompletionVal.textContent = `-`;
    }
  }

  if (elements.portalCompletionDesc) {
    if (totalHeldTasks > 0) {
      elements.portalCompletionDesc.textContent = `Tingkat pengumpulan: ${completionPct}% (${student.className || 'Kelas'})`;
    } else {
      elements.portalCompletionDesc.textContent = `Belum ada nilai yang diinput di ${student.className || 'kelas ini'}`;
    }
  }

  if (elements.portalCompletionBar) {
    elements.portalCompletionBar.style.width = `${completionPct}%`;
  }

  // Render combo chart & breakdown
  renderProgressChart(student);
  renderPortalWeeksGrid(student);
}

/**
 * Render grid rincian nilai tugas setiap pertemuan
 */
function renderPortalWeeksGrid(student) {
  if (!elements.portalWeeksGrid) return;
  const b80 = student.best80 || calculateBest80(student);
  const clsId = student.classId || state.currentClassId;
  const classActive = (state.classActiveTasks && state.classActiveTasks[clsId]) 
    ? state.classActiveTasks[clsId] 
    : (state.activeTasks || []);
  const classActiveWeeksSet = (state.classActiveWeeks && state.classActiveWeeks[clsId]) 
    ? state.classActiveWeeks[clsId] 
    : (state.activeWeeks || new Set());

  let html = '';
  WEEKS_DEF.forEach(w => {
    const isActiveWeek = classActiveWeeksSet.has(w.weekId);
    let tasksHtml = '';

    w.tasks.forEach(task => {
      const g = student.grades[task.id] || { raw: '', score: null, isSubmitted: false };
      const isUts = task.weekId === 'uts';
      const isHeldInClass = classActive.includes(task.id);
      const isKept = !isUts && isHeldInClass && b80.isTaskKept(task.id);
      const isDropped = !isUts && isHeldInClass && b80.isTaskDropped(task.id);

      let statusBadge = '';
      let scoreBadgeHtml = '';

      if (isUts) {
        statusBadge = '<span class="status-chip chip-uts">UTS</span>';
        scoreBadgeHtml = formatScoreBadge(g);
      } else if (!isHeldInClass) {
        // Tugas tidak diadakan di kelas ini pada pekan ini
        statusBadge = '<span class="status-chip chip-empty" style="opacity:0.6;">Tidak Ada</span>';
        scoreBadgeHtml = '<span class="score-pill score-empty">-</span>';
      } else {
        // Tugas diadakan di kelas ini
        const hasScore = g && g.score !== null && !isNaN(g.score);
        if (hasScore) {
          scoreBadgeHtml = formatScoreBadge(g);
          statusBadge = isKept 
            ? '<span class="status-chip chip-best" title="Nilai masuk dalam perhitungan 80% terbaik">⭐ Top 80%</span>' 
            : '<span class="status-chip chip-drop" title="Nilai di-drop dari perhitungan 80% terbaik">🔻 Di-drop</span>';
        } else {
          // Mahasiswa tidak mengumpulkan / nilai kosong -> dihitung 0
          scoreBadgeHtml = '<span class="score-pill score-low" title="Tidak mengumpulkan / nilai kosong (0)">0</span>';
          statusBadge = '<span class="status-chip chip-drop" title="Tidak mengumpulkan (dihitung 0 & di-drop)">🔻 Kosong (0)</span>';
        }
      }

      tasksHtml += `
        <div class="portal-task-row ${isDropped ? 'task-dropped' : ''}">
          <div class="portal-task-meta">
            <span class="portal-task-title">${task.label}</span>
            ${statusBadge}
          </div>
          <div class="portal-task-badge">
            ${scoreBadgeHtml}
          </div>
        </div>
      `;
    });

    html += `
      <div class="portal-week-card ${isActiveWeek ? 'week-is-active' : ''}">
        <div class="portal-week-header">
          <span class="portal-week-title">${w.label}</span>
          ${isActiveWeek ? '<span class="badge badge-primary">Aktif</span>' : '<span class="badge badge-outline">Pekan Belum Mulai</span>'}
        </div>
        <div class="portal-week-body">
          ${tasksHtml}
        </div>
      </div>
    `;
  });

  elements.portalWeeksGrid.innerHTML = html;
}

/**
 * Render Combo Bar + Line Chart menggunakan Chart.js
 */
function renderProgressChart(student) {
  const canvas = document.getElementById('portalProgressChart');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js belum siap atau tidak tersedia');
    return;
  }

  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }

  const tasksToDisplay = ALL_TASKS;
  const labels = tasksToDisplay.map(t => `${t.weekLabel.replace('Week ', 'W')}: ${t.shortLabel}`);

  const icpData = [];
  const etData = [];
  const utsData = [];
  const trendData = [];
  const classAvgData = [];

  // Hitung rata-rata kelas untuk setiap tugas (sesuai kelas mahasiswa)
  const classAverages = {};
  const clsId = student.classId || state.currentClassId;
  const classStudents = (state.classDataCache && state.classDataCache[clsId]) 
    ? state.classDataCache[clsId] 
    : (state.students || []);

  tasksToDisplay.forEach(t => {
    let sum = 0;
    let count = 0;
    classStudents.forEach(s => {
      const g = s.grades ? s.grades[t.id] : null;
      if (g && g.score !== null) {
        sum += g.score;
        count++;
      }
    });
    classAverages[t.id] = count > 0 ? parseFloat((sum / count).toFixed(1)) : null;
  });

  let runningSum = 0;
  let runningCount = 0;

  tasksToDisplay.forEach(t => {
    const g = student.grades[t.id];
    const score = (g && g.score !== null) ? g.score : null;

    if (t.id.includes('inclass')) {
      icpData.push(score);
      etData.push(null);
      utsData.push(null);
    } else if (t.id.includes('exit')) {
      icpData.push(null);
      etData.push(score);
      utsData.push(null);
    } else {
      icpData.push(null);
      etData.push(null);
      utsData.push(score);
    }

    if (score !== null) {
      runningSum += score;
      runningCount++;
      trendData.push(parseFloat((runningSum / runningCount).toFixed(1)));
    } else {
      trendData.push(null);
    }

    classAvgData.push(classAverages[t.id]);
  });

  const isDark = state.theme === 'dark';
  const textColor = isDark ? '#CBD5E1' : '#1e3a5f';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 65, 107, 0.08)';

  const ctx = canvas.getContext('2d');
  state.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'In-Class Problem',
          data: icpData,
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.85)' : 'rgba(29, 79, 128, 0.85)',
          borderColor: isDark ? '#60A5FA' : '#1d4f80',
          borderWidth: 1.5,
          borderRadius: 6,
          order: 2
        },
        {
          label: 'Exit Ticket',
          data: etData,
          backgroundColor: isDark ? 'rgba(253, 212, 2, 0.85)' : 'rgba(217, 119, 6, 0.85)',
          borderColor: isDark ? '#ffe866' : '#b45309',
          borderWidth: 1.5,
          borderRadius: 6,
          order: 2
        },
        {
          label: 'UTS',
          data: utsData,
          backgroundColor: 'rgba(168, 85, 247, 0.85)',
          borderColor: '#c084fc',
          borderWidth: 1.5,
          borderRadius: 6,
          order: 2
        },
        {
          type: 'line',
          label: 'Tren Nilai Mahasiswa',
          data: trendData,
          borderColor: isDark ? '#38bdf8' : '#0284c7',
          backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)',
          borderWidth: 3,
          tension: 0.35,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: isDark ? '#38bdf8' : '#0284c7',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          order: 1
        },
        {
          type: 'line',
          label: 'Rata-rata Kelas',
          data: classAvgData,
          borderColor: isDark ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
          borderWidth: 2,
          borderDash: [6, 6],
          pointRadius: 0,
          tension: 0.2,
          order: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(7, 27, 51, 0.95)' : 'rgba(255, 255, 255, 0.96)',
          titleColor: isDark ? '#ffffff' : '#002844',
          bodyColor: isDark ? '#CBD5E1' : '#334155',
          borderColor: isDark ? 'rgba(253, 212, 2, 0.35)' : 'rgba(0, 65, 107, 0.2)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              if (val === null || val === undefined) return null;
              return ` ${context.dataset.label}: ${val}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            font: {
              family: "'Plus Jakarta Sans', sans-serif",
              size: 11
            }
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            stepSize: 20,
            font: {
              family: "'Plus Jakarta Sans', sans-serif",
              size: 11
            }
          }
        }
      }
    }
  });
}

/* ==========================================================================
   Multi-Class Navigation & Reproducibility Management
   ========================================================================== */
function initClasses() {
  // 1. Start with classes from CONFIG
  const classList = [...CONFIG.classes];

  // 2. Merge custom classes saved in localStorage
  try {
    const savedCustom = JSON.parse(localStorage.getItem('gradebook_custom_classes') || '[]');
    if (Array.isArray(savedCustom)) {
      savedCustom.forEach(sc => {
        if (!classList.some(c => c.id === sc.id)) {
          classList.push(sc);
        }
      });
    }
  } catch (err) {
    console.warn('Gagal membaca custom classes dari storage:', err);
  }

  state.classes = classList;

  // 3. Determine active class from URL (?class=C atau ?sheet=PersDif%20C) atau localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const classParam = urlParams.get('class') || urlParams.get('kelas');
  const sheetParam = urlParams.get('sheet');

  if (sheetParam) {
    let match = state.classes.find(c => c.sheetName && c.sheetName.toLowerCase() === sheetParam.toLowerCase());
    if (!match) {
      match = {
        id: 'SHEET_' + sheetParam.replace(/\s+/g, '_').toUpperCase(),
        name: sheetParam,
        sheetName: sheetParam,
        gid: urlParams.get('gid') || null,
        badge: `Persamaan Diferensial (${sheetParam})`,
        title: `Rekap Nilai Harian ${sheetParam} 2026`,
        isCustom: true
      };
      state.classes.push(match);
    }
    state.currentClassId = match.id;
  } else if (classParam) {
    const match = state.classes.find(c => c.id.toLowerCase() === classParam.toLowerCase() || c.name.toLowerCase() === classParam.toLowerCase());
    if (match) {
      state.currentClassId = match.id;
    } else {
      state.currentClassId = CONFIG.defaultClassId || state.classes[0].id;
    }
  } else {
    const savedClass = localStorage.getItem('gradebook_current_class');
    if (savedClass && state.classes.some(c => c.id === savedClass)) {
      state.currentClassId = savedClass;
    } else {
      state.currentClassId = CONFIG.defaultClassId || state.classes[0].id;
    }
  }

  // Set initial titles and badges
  const cur = state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
  if (elements.classBadge && cur) elements.classBadge.textContent = cur.badge || `Persamaan Diferensial (${cur.name})`;
  if (elements.headerTitle && cur) elements.headerTitle.textContent = cur.title || `Rekap Nilai Harian ${cur.name} 2026`;
  if (elements.portalClassBadge && cur) elements.portalClassBadge.textContent = cur.badge || `Persamaan Diferensial (${cur.name})`;
  if (elements.portalSeamlessCourse && cur) elements.portalSeamlessCourse.textContent = cur.badge || `Persamaan Diferensial (${cur.name})`;
  if (cur) document.title = `Dashboard Nilai Mahasiswa | ${cur.name}`;

  updateClassNavPills();
  updatePortalClassPills();

  // Determine initial view from URL (?view=fulldata atau default 'portal')
  const viewParam = urlParams.get('view');
  if (viewParam === 'fulldata') {
    state.currentView = 'fulldata';
  } else {
    state.currentView = 'portal';
  }
  switchView(state.currentView, false);

  // Listen to popstate (browser back/forward buttons)
  window.addEventListener('popstate', (e) => {
    const params = new URLSearchParams(window.location.search);
    const cls = params.get('class') || CONFIG.defaultClassId;
    if (cls && cls !== state.currentClassId) {
      switchClass(cls, false);
    }
    const v = params.get('view') || 'portal';
    if (v !== state.currentView) {
      switchView(v, false);
    }
  });
}

function updateClassNavPills() {
  if (!elements.classPills) return;
  elements.classPills.innerHTML = '';

  state.classes.forEach(cls => {
    const btn = document.createElement('button');
    const isActive = cls.id === state.currentClassId;
    btn.className = `class-pill ${isActive ? 'active' : ''}`;
    btn.setAttribute('type', 'button');
    btn.dataset.classId = cls.id;
    btn.setAttribute('title', `Buka rekap nilai ${cls.name} (${cls.sheetName || 'Google Sheet'})`);

    const count = state.studentCounts[cls.id] || (isActive && state.students.length ? state.students.length : null);
    const countBadge = count ? `<span class="class-pill-badge">${count} Mhs</span>` : '';
    const isAdmin = !!(state.currentUser && state.currentUser.isAdmin);
    const deleteBtn = (cls.isCustom && isAdmin) ? `<span class="class-pill-delete" title="Hapus tab kelas ini">&times;</span>` : '';

    btn.innerHTML = `
      <span class="class-pill-dot"></span>
      <span class="class-pill-name">${cls.name}</span>
      ${countBadge}
      ${deleteBtn}
    `;

    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('class-pill-delete')) {
        e.stopPropagation();
        deleteCustomClass(cls.id);
        return;
      }
      switchClass(cls.id);
    });

    elements.classPills.appendChild(btn);
  });
}

async function switchClass(classId, updateUrl = true) {
  if (state.currentClassId === classId && state.students.length > 0) return;

  const targetClass = state.classes.find(c => c.id === classId) || state.classes[0];
  if (!targetClass) return;

  state.currentClassId = targetClass.id;
  localStorage.setItem('gradebook_current_class', targetClass.id);

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('class', targetClass.id);
    window.history.pushState({ classId: targetClass.id, view: state.currentView }, '', url);
  }

  // Update header badges & titles instantly
  if (elements.classBadge) {
    elements.classBadge.textContent = targetClass.badge || `Persamaan Diferensial (${targetClass.name})`;
  }
  if (elements.portalClassBadge) {
    elements.portalClassBadge.textContent = targetClass.badge || `Persamaan Diferensial (${targetClass.name})`;
  }
  if (elements.portalSeamlessCourse) {
    elements.portalSeamlessCourse.textContent = targetClass.badge || `Persamaan Diferensial (${targetClass.name})`;
  }
  if (elements.headerTitle) {
    elements.headerTitle.textContent = targetClass.title || `Rekap Nilai Harian ${targetClass.name} 2026`;
  }
  document.title = `Dashboard Nilai Mahasiswa | ${targetClass.name}`;

  updateClassNavPills();
  updatePortalClassPills();

  // Reset search
  state.searchQuery = '';
  if (elements.searchInput) {
    elements.searchInput.value = '';
    elements.btnClearSearch.classList.add('hidden');
  }
  if (elements.portalSearchInput) {
    elements.portalSearchInput.value = '';
    if (elements.btnClearPortalSearch) elements.btnClearPortalSearch.classList.add('hidden');
    if (elements.portalSearchDropdown) elements.portalSearchDropdown.classList.add('hidden');
  }

  // Animate table transition smoothly
  if (elements.gradeTable) {
    elements.gradeTable.classList.remove('class-fade-in');
    void elements.gradeTable.offsetWidth; // trigger reflow
    elements.gradeTable.classList.add('class-fade-in');
  }

  // Load live data for this class
  await loadData(false, targetClass.id);
}

function deleteCustomClass(classId) {
  const isAdmin = !!(state.currentUser && state.currentUser.isAdmin);
  if (!isAdmin) {
    showToast('Akses ditolak: Hanya Admin yang dapat menghapus kelas.', true);
    return;
  }

  const cls = state.classes.find(c => c.id === classId);
  if (!cls) return;

  if (!confirm(`Hapus tampilan "${cls.name}"? (Data di spreadsheet Anda tidak akan terhapus).`)) {
    return;
  }

  state.classes = state.classes.filter(c => c.id !== classId);
  const customClasses = (JSON.parse(localStorage.getItem('gradebook_custom_classes') || '[]')).filter(c => c.id !== classId);
  localStorage.setItem('gradebook_custom_classes', JSON.stringify(customClasses));

  showToast(`Tampilan ${cls.name} berhasil dihapus.`);

  if (state.currentClassId === classId) {
    switchClass(CONFIG.defaultClassId || state.classes[0].id);
  } else {
    updateClassNavPills();
  }
}

function openAddClassModal() {
  const isAdmin = !!(state.currentUser && state.currentUser.isAdmin);
  if (!isAdmin) {
    showToast('Akses ditolak: Hanya Admin yang dapat menambah kelas baru.', true);
    return;
  }

  if (!elements.addClassModal) return;
  elements.addClassModal.classList.remove('hidden');
  elements.inputClassName.value = '';
  elements.inputSheetName.value = '';
  elements.inputGid.value = '';
  setTimeout(() => elements.inputClassName.focus(), 80);
}

function closeAddClassModal() {
  if (!elements.addClassModal) return;
  elements.addClassModal.classList.add('hidden');
}

async function handleAddClassSubmit(e) {
  e.preventDefault();
  const isAdmin = !!(state.currentUser && state.currentUser.isAdmin);
  if (!isAdmin) {
    showToast('Akses ditolak: Hanya Admin yang dapat menambah kelas baru.', true);
    return;
  }

  const name = elements.inputClassName.value.trim();
  const sheetName = elements.inputSheetName.value.trim();
  let gid = elements.inputGid ? elements.inputGid.value.trim() : '';

  if (!name || !sheetName) {
    showToast('Nama kelas dan nama sheet wajib diisi!', true);
    return;
  }

  const submitBtn = elements.btnSubmitAddClass;
  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Menghubungkan ke Google Sheets...';
  }

  // 1. Hubungi Google Apps Script untuk membuat sheet tab di Google Spreadsheet jika URL aktif
  if (CONFIG.appsScriptUrl) {
    try {
      const resp = await fetch(CONFIG.appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'createSheet',
          sheetName: sheetName,
          className: name,
          userEmail: state.currentUser ? state.currentUser.email : ''
        })
      });
      const resData = await resp.json();
      if (resData.success) {
        if (resData.gid) gid = resData.gid;
        showToast(resData.message || `Sheet "${sheetName}" berhasil dibuat di Google Spreadsheet!`);
      } else {
        console.warn('Apps script createSheet note:', resData.error);
        if (resData.error) {
          showToast(resData.error, true);
        }
      }
    } catch (err) {
      console.warn('Tidak dapat menghubungi Apps Script createSheet:', err);
    }
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }

  let id = name.replace(/kelas\s*/i, '').trim().toUpperCase();
  if (!id || state.classes.some(c => c.id === id)) {
    id = 'CLS_' + Date.now();
  }

  const newClass = {
    id,
    name,
    sheetName,
    gid: gid || null,
    badge: `Persamaan Diferensial (${name})`,
    title: `Rekap Nilai Harian ${name} 2026`,
    isCustom: true
  };

  state.classes.push(newClass);

  // Persist to localStorage for reproducibility across reloads
  const customClasses = JSON.parse(localStorage.getItem('gradebook_custom_classes') || '[]');
  customClasses.push(newClass);
  localStorage.setItem('gradebook_custom_classes', JSON.stringify(customClasses));

  closeAddClassModal();
  showToast(`Halaman ${name} berhasil ditambahkan! Memuat data...`);
  switchClass(newClass.id);
}

function mergeDiscoveredSheets(sheetList) {
  if (!Array.isArray(sheetList)) return;
  let addedAny = false;

  sheetList.forEach(s => {
    const sName = (s.name || '').trim();
    if (!sName) return;

    // Cek apakah sheet ini belum ada di daftar classes
    const exists = state.classes.some(c => 
      (c.sheetName && c.sheetName.toLowerCase() === sName.toLowerCase()) || 
      (c.gid && s.gid && c.gid === s.gid) ||
      (c.gid && s.id && c.gid === s.id)
    );

    if (!exists) {
      const match = sName.match(/(?:persdif|kelas)\s*([A-Za-z0-9]+)/i);
      let className = sName;
      let classId = sName.replace(/\s+/g, '_').toUpperCase();

      if (match) {
        className = `Kelas ${match[1].toUpperCase()}`;
        classId = match[1].toUpperCase();
      }

      state.classes.push({
        id: classId,
        name: className,
        sheetName: sName,
        gid: s.gid || s.id || null,
        badge: `Persamaan Diferensial (${className})`,
        title: `Rekap Nilai Harian ${className} 2026`,
        isAutoDiscovered: true
      });
      addedAny = true;
    }
  });

  if (addedAny) {
    updateClassNavPills();
  }
}

/**
 * Auto-discovery tab sheet dari local proxy server.js & Google Apps Script
 */
async function discoverSpreadsheetSheets() {
  // 1. Coba endpoint local server (/api/sheets)
  try {
    const localResp = await fetch('/api/sheets');
    if (localResp.ok) {
      const localData = await localResp.json();
      if (localData.success && Array.isArray(localData.sheets)) {
        mergeDiscoveredSheets(localData.sheets);
      }
    }
  } catch (e) {
    // Diabaikan jika tidak memakai node server lokal
  }

  // 2. Coba endpoint Google Apps Script jika URL aktif
  if (CONFIG.appsScriptUrl) {
    try {
      const resp = await fetch(`${CONFIG.appsScriptUrl}?action=getSheets`);
      if (resp.ok) {
        const resData = await resp.json();
        if (resData.success && Array.isArray(resData.sheets)) {
          mergeDiscoveredSheets(resData.sheets);
        }
      }
    } catch (e) {
      // Non-fatal
    }
  }
}

/* ==========================================================================
   Data Fetching & Resilient CSV Parser
   ========================================================================== */
async function loadData(isSilent = false, targetClassId = state.currentClassId) {
  const currentClass = state.classes.find(c => c.id === targetClassId) || state.classes[0];
  if (!currentClass) return;

  if (!isSilent) {
    setLoadingState(true);
  }
  updateSyncStatus('loading', `Sinkronisasi ${currentClass.name}...`);

  try {
    const csvText = await fetchClassCsv(currentClass);

    parseCsvData(csvText, currentClass);
    state.lastUpdated = new Date();
    updateSyncStatus('live', `Live Update ${currentClass.name} (${formatTime(state.lastUpdated)})`);
    updateAnalytics();
    renderTable();
    updateClassNavPills();
    preloadAllClasses();
    if (!isSilent) showToast(`Data nilai ${currentClass.name} berhasil diperbarui secara live!`);
  } catch (err) {
    console.error(`Koneksi Google Sheets gagal untuk ${currentClass.name}:`, err);
    updateSyncStatus('error', 'Gagal memuat live');
    showToast(`Gagal memuat data live ${currentClass.name}. Memeriksa data lokal...`, true);
    
    // Fallback: If network fails, check if we already have data loaded
    if (state.students.length === 0) {
      loadFallbackSnapshot(currentClass.id);
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

function parseCsvData(csvText, currentClass = null, isBackground = false) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return;

  // Find header row containing 'Nama' and 'NIM' (resilient to gviz merged first column)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = rows[i].map(c => (c || '').toString().toLowerCase().trim());
    if (r.includes('nama') && r.includes('nim')) {
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
  const adminEmails = new Set(state.adminEmails);
  const adminList = [...state.adminList];
  let lecturer = null;

  // 1. Detect lecturer & admin from rows above the table header (e.g. Header table / Kop)
  for (let i = 0; i < headerRowIndex; i++) {
    const row = rows[i];
    if (!row) continue;

    // Scan for any cell with an email address and check if row/adjacent is TRUE
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] || '').trim().toLowerCase();
      if (cell.includes('@') && cell.includes('.')) {
        const isNextTrue = (row[c + 1] || '').trim().toUpperCase() === 'TRUE' || (row[c + 1] || '').trim() === '1';
        const isRowTrue = row.some(x => (x || '').trim().toUpperCase() === 'TRUE');
        if (isNextTrue || isRowTrue) {
          adminEmails.add(cell);
          const adminName = row[c - 2] || row[1] || 'Dosen';
          if (!adminList.some(a => a.email === cell)) {
            adminList.push({ email: cell, name: adminName, role: 'Dosen' });
          }
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
      if (!adminList.some(a => a.email === email)) {
        adminList.push({ email, name, role: 'Admin / Asisten', nim });
      }
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

  // Per-Class Active Tasks: Deteksi tugas mana saja yang pernah diadakan di kelas ini (ada minimal 1 nilai numerik)
  const activeClass = currentClass || state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
  const clsId = activeClass ? activeClass.id : state.currentClassId;
  const clsName = activeClass ? activeClass.name : 'Kelas';

  const classActiveTasksSet = new Set();
  const classActiveWeeksSet = new Set();

  ALL_TASKS.forEach(task => {
    let hasAnyNumericScore = false;
    studentRows.forEach(row => {
      if (!row || row.length <= task.colIndex) return;
      const rawVal = (row[task.colIndex] || '').trim();
      if (rawVal !== '' && rawVal !== '-') {
        const num = parseFloat(rawVal.replace(',', '.'));
        if (!isNaN(num)) {
          hasAnyNumericScore = true;
        }
      }
    });

    if (hasAnyNumericScore) {
      classActiveTasksSet.add(task.id);
      classActiveWeeksSet.add(task.weekId);
    }
  });

  const activeTaskList = Array.from(classActiveTasksSet);
  state.classActiveTasks = state.classActiveTasks || {};
  state.classActiveTasks[clsId] = activeTaskList;
  state.classActiveWeeks = state.classActiveWeeks || {};
  state.classActiveWeeks[clsId] = classActiveWeeksSet;

  state.activeWeeks = classActiveWeeksSet;
  state.activeTasks = activeTaskList;

  // Pasang NIU, Kelas, dan Best of 80% ke seluruh mahasiswa
  parsedStudents.forEach(s => {
    s.niu = getStudentNiu(s.nim);
    s.classId = clsId;
    s.className = clsName;
    s.best80 = calculateBest80(s);
  });

  // Save to class data cache & update counts
  state.classDataCache[clsId] = parsedStudents;
  state.studentCounts[clsId] = parsedStudents.length;

  if (isBackground) {
    // Preload background mode: update quick picks without disrupting active class view
    renderPortalQuickPicks();
    return;
  }

  state.activeWeeks = activeWeeks;
  state.activeTasks = Array.from(activeTasks);
  state.students = parsedStudents;
  state.adminEmails = adminEmails;
  state.adminList = adminList;

  if (lecturer) {
    state.lecturer = lecturer;
    elements.dosenBadge.textContent = `Dosen: ${lecturer.name}`;
  }

  if (activeClass) {
    if (elements.classBadge) {
      elements.classBadge.textContent = activeClass.badge || `Persamaan Diferensial (${activeClass.name})`;
    }
    if (elements.portalClassBadge) {
      elements.portalClassBadge.textContent = activeClass.badge || `Persamaan Diferensial (${activeClass.name})`;
    }
    if (elements.headerTitle) {
      elements.headerTitle.textContent = activeClass.title || `Rekap Nilai Harian ${activeClass.name} 2026`;
    }
    document.title = `Dashboard Nilai Mahasiswa | ${activeClass.name}`;
  }

  // Update Portal quick picks
  renderPortalQuickPicks();

  // If a student was selected in the portal, re-render with updated live data
  if (state.portalSelectedStudent) {
    const allStudents = getAllPortalStudents();
    const updated = allStudents.find(s => s.nim === state.portalSelectedStudent.nim || (s.niu && s.niu === state.portalSelectedStudent.niu));
    if (updated) {
      selectPortalStudent(updated, false);
    }
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

  // Search filter (Nama / NIM / NIU)
  if (state.searchQuery) {
    const q = state.searchQuery;
    list = list.filter(s => 
      s.name.toLowerCase().includes(q) || 
      s.nim.toLowerCase().includes(q) || 
      (s.niu && s.niu.toLowerCase().includes(q))
    );
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
      case 'best80-desc':
        return ((b.best80 && b.best80.finalScore !== null ? b.best80.finalScore : -1) - 
                (a.best80 && a.best80.finalScore !== null ? a.best80.finalScore : -1));
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
        <th rowspan="2" class="col-center col-summary col-best80" title="Best of 80% Average (Bobot 3 In-Class : 2 Exit Ticket, tanpa UTS)">Best 80% (3:2)</th>
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
      const b80Val = (student.best80 && student.best80.finalScore !== null) ? student.best80.finalScore.toFixed(1) : '-';
      const b80Cls = (student.best80 && student.best80.finalScore !== null) ? getAverageClass(student.best80.finalScore) : 'score-empty';

      rowHtml += `
        <td class="col-center col-summary">
          <span class="score-pill score-best80 ${b80Cls}" title="Best 80% Average (Bobot 3 ICP : 2 ET, drop 20% terendah)">${b80Val}</span>
        </td>
        <td class="col-center col-summary">
          <span class="score-pill ${getAverageClass(student.average)}">${avgDisplay}</span>
        </td>
        <td class="col-center col-summary">
          <div class="progress-inline" title="${student.submittedCount} nilai terisi">
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

  const b80 = student.best80 || calculateBest80(student);
  if (elements.modalBest80Score) {
    elements.modalBest80Score.textContent = b80.finalScore !== null ? b80.finalScore.toFixed(1) : '-';
  }

  const clsId = student.classId || state.currentClassId;
  const classActive = (state.classActiveTasks && state.classActiveTasks[clsId]) 
    ? state.classActiveTasks[clsId] 
    : (state.activeTasks || []);
  const totalHeldTasks = classActive.length;
  let submittedActiveCount = 0;

  if (totalHeldTasks > 0) {
    classActive.forEach(taskId => {
      const g = student.grades ? student.grades[taskId] : null;
      if (g && g.score !== null && !isNaN(g.score)) {
        submittedActiveCount++;
      }
    });
  } else {
    submittedActiveCount = student.submittedCount || 0;
  }

  const completionPct = totalHeldTasks > 0 
    ? Math.min(100, Math.round((submittedActiveCount / totalHeldTasks) * 100)) 
    : 0;

  elements.modalCompletedTasks.textContent = totalHeldTasks > 0 ? `${submittedActiveCount} / ${totalHeldTasks}` : '-';
  elements.modalCompletionPercent.textContent = totalHeldTasks > 0 ? `${completionPct}%` : '-';

  if (elements.btnModalOpenPortal) {
    elements.btnModalOpenPortal.onclick = () => {
      selectPortalStudent(student, true);
      switchView('portal');
      closeStudentModal();
    };
  }

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
      const currentClass = state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
      const payload = {
        action: 'updateStudentScores',
        sheetName: currentClass.sheetName,
        gid: currentClass.gid,
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
    student.best80 = calculateBest80(student);

    state.isEditMode = false;
    renderStudentModalContent(student);
    if (state.portalSelectedStudent && (state.portalSelectedStudent.nim === student.nim || state.portalSelectedStudent.niu === student.niu)) {
      renderPortalStudent(student);
    }
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
        apiKey: "AIzaSyBU2WYQFRv7MNndqmoZ4SFtQcSMcA8egw0",
        authDomain: "persdifa2026-d1321.firebaseapp.com",
        projectId: "persdifa2026-d1321",
        storageBucket: "persdifa2026-d1321.firebasestorage.app",
        messagingSenderId: "18197966872",
        appId: "1:18197966872:web:5f0e2088c639e2efd6536d",
        measurementId: "G-KT6PPW7SXF"
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
    if (elements.btnAddClass) {
      elements.btnAddClass.classList.remove('hidden');
    }
  } else {
    if (elements.btnAdminLogin) elements.btnAdminLogin.classList.remove('hidden');
    if (elements.userProfile) elements.userProfile.classList.add('hidden');
    if (elements.btnToggleEditStudent) elements.btnToggleEditStudent.classList.add('hidden');
    if (elements.btnAddClass) {
      elements.btnAddClass.classList.add('hidden');
    }
  }

  // Update nav pills so custom class delete buttons reflect admin status
  updateClassNavPills();
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
  headers.push('Rata-rata', 'Nilai Terisi');
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
  const currentClass = state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
  const classNameSlug = currentClass ? currentClass.name.replace(/\s+/g, '_') : 'Kelas';
  link.setAttribute('download', `Rekap_Nilai_${classNameSlug}_${state.currentTab}_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`File CSV ${currentClass ? currentClass.name : ''} berhasil diunduh!`);
}

/* ==========================================================================
   Embedded Offline Snapshot (Fallback when offline / local file without server)
   ========================================================================== */
function loadFallbackSnapshot(classId = state.currentClassId) {
  // Snapshot from Google Sheet fetched earlier to guarantee instant demo even without internet
  const fallbackCsv = `,PENILAIAN PERSAMAAN DIFFERENSIAL A,,,,,,,,,,,,,,,,,,
,Dosen,,Email,Admin,,,,,,,,,,,,,,,
,"Dr. Ir. Wijaya Yudha Atmaja, S. T., M. Eng.",-,wyatmaja@ugm.ac.id,TRUE,,,,,,,,,,,,,,,
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
37,Brilliano Putra Pradhitya,25/558108/TK/63033,brillianoputrapradhitya@mail.ugm.ac.id,TRUE,-,100,100,-,-,,,,,,,,,,
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

  const FALLBACK_SNAPSHOT_C = "\"\",\"PENILAIAN PERSAMAAN DIFFERENSIAL A Dosen\",\"NIM\",\"Email\",\"Admin\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"\",\"Dr. Ir. Wijaya Yudha Atmaja, S. T., M. Eng.\",\"-\",\"wyatmaja@ugm.ac.id\",\"TRUE\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"\",\"\",\"\",\"\",\"\",\"Week 1\",\"\",\"Week 2\",\"\",\"Week 3\",\"\",\"Week 4\",\"\",\"Week 5\",\"\",\"Week 6\",\"\",\"Week 7\",\"\",\"\",\"\"\n\"\",\"Nama\",\"NIM\",\"Email\",\"\",\"In-Class Problem\",\"Exit Ticket\",\"In-Class Problem\",\"Exit Ticket\",\"In-Class Problem\",\"Exit Ticket\",\"In-Class Problem\",\"Exit Ticket\",\"In-Class Problem\",\"Exit Ticket\",\"In-Class Problem\",\"Exit Ticket\",\"In-Class Problem\",\"Exit Ticket\",\"UTS\",\"\"\n\"1\",\"Jonathan Alvarado Panjaitan\",\"23/515661/TK/56706\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"2\",\"Rasendrya Akmal Baswara\",\"23/517344/TK/56896\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"3\",\"Muhammad Wildan Wilhamdi\",\"23/518666/TK/57133\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"4\",\"Nafil Nissano Yogma Pratama\",\"23/521136/TK/57475\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"5\",\"Diaz Trisnajati\",\"23/522678/TK/57730\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"6\",\"Moses Saidasdo Purba\",\"23/523274/TK/57854\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"7\",\"Alexandra Tabita Purnomo\",\"24/543651/TK/60420\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"8\",\"Lutfian Rizhi Khairan\",\"24/545581/TK/60703\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"9\",\"Daniel Doohan Kusuma Rahardjo\",\"25/555387/TK/62617\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"10\",\"Fatih Muhammad Razan\",\"25/555453/TK/62627\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"11\",\"Ryogas Alfajr\",\"25/555579/TK/62642\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"12\",\"Fawwaz Salishefa Na'imi Santosa\",\"25/555739/TK/62659\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"13\",\"Muhammad Rozaq Barkah\",\"25/555868/TK/62682\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"14\",\"Raka Al Rizal\",\"25/555883/TK/62684\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"15\",\"Made Aditya Ganendra Gautama\",\"25/555973/TK/62696\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"16\",\"Bening Nadindra Ubhayahita\",\"25/556119/TK/62719\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"17\",\"Muhammad Choirudin Ammar\",\"25/556251/TK/62735\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"18\",\"Raisya Putri Salsabila\",\"25/556586/TK/62781\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"19\",\"Farira Usnika Siwi\",\"25/556613/TK/62787\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"20\",\"Muhammad Abdul Qodir Zainuri\",\"25/556627/TK/62790\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"21\",\"Ahmad Husairi\",\"25/556710/TK/62799\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"22\",\"Ahdania Aurora Rihadatul Aisy\",\"25/556948/TK/62832\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"23\",\"Tsamara Olga Az Zahra\",\"25/557063/TK/62859\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"24\",\"Nadya Madeline Simamora\",\"25/557091/TK/62863\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"25\",\"Rizqya Alika Cahya Kurniawan\",\"25/557216/TK/62887\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"26\",\"Nabilla Kusuma Ramadhani\",\"25/557232/TK/62891\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"27\",\"Kareema Edna Annisa Hanif\",\"25/557280/TK/62901\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"28\",\"Ezekiel Markhesywan Rezon Nathan Christvinno\",\"25/557372/TK/62920\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"29\",\"Daniel Alvaro Rossi\",\"25/557385/TK/62924\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"30\",\"Nada Balqis Nazanda\",\"25/557438/TK/62935\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"31\",\"Nayaka Tsaqif Ramadhan Setiaji\",\"25/557605/TK/62967\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"32\",\"Chelsea Auryn Valda\",\"25/557774/TK/62988\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"33\",\"Vina Nur Azizah\",\"25/557999/TK/63019\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"34\",\"Christian Yudhistira Adhi\",\"25/558081/TK/63029\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"35\",\"Reyhan Fitrian Arifin\",\"25/559437/TK/63139\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"36\",\"Hammam Abdullah\",\"25/559545/TK/63158\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"37\",\"Kevin Kurniawan Cahyadi\",\"25/559640/TK/63176\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"38\",\"Jonafan Dwiyanto Alexander\",\"25/559741/TK/63192\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"39\",\"Muhammad Faiz Eka Pradana\",\"25/559906/TK/63214\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"40\",\"Muhammad Azmi Noor Falah\",\"25/560348/TK/63280\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"41\",\"Ni Putu Rani Budhi Puspitha\",\"25/560350/TK/63281\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"42\",\"Muhammad Izzudin Yusuf\",\"25/560389/TK/63290\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"43\",\"Ahmad Rafi Firdaus\",\"25/560526/TK/63314\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"44\",\"Yosia Raditya Eka Kurniawan\",\"25/560673/TK/63331\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"45\",\"Muhammad Raihan Surya\",\"25/560713/TK/63338\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"46\",\"Nicholas Nathan Kwok\",\"25/560779/TK/63344\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"47\",\"Gracia Anabel Rumondang\",\"25/560828/TK/63352\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"48\",\"Fakhira Azwa Arafahini\",\"25/561034/TK/63378\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"49\",\"Elissa Qotrunnada Nurhasanah\",\"25/561052/TK/63380\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"50\",\"Fikrie Ihsany Nur Cahyatmaja\",\"25/561173/TK/63395\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"51\",\"Qaqa Qushayyi Qatrunnada\",\"25/561242/TK/63401\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"52\",\"Nabila Fikrotus Shofa\",\"25/561368/TK/63415\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"53\",\"Revel Mahdirizqia Putra Pradana\",\"25/561483/TK/63437\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"54\",\"Daneswara Ramadhana Rafif Wicaksono\",\"25/561662/TK/63473\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"55\",\"Bagas Anggareksa Irsyad Dhanisywara\",\"25/561843/TK/63504\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"56\",\"Naufal Arkana Maulana\",\"25/564430/TK/63669\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"57\",\"Luna Suranta\",\"25/564822/TK/63711\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"58\",\"Nailah Tsurayya Putri Juhari\",\"25/564852/TK/63715\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"59\",\"HASNA AZKIYA MUTHMAINNAH\",\"25/564995/TK/63728\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"60\",\"FARIDA\",\"25/565065/TK/63735\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"61\",\"ZULFA ARSYANDHI AZRA\",\"25/565145/TK/63744\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"62\",\"M. RAFI AZKA RABBANI\",\"25/565249/TK/63752\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"63\",\"SITI HAJAR NABILA PUTRI PEMBAYUN\",\"25/565324/TK/63759\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"64\",\"Advendra Krisna Putra\",\"25/565622/TK/63801\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"65\",\"Andhinni Rizqyananda Putri\",\"25/565783/TK/63819\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"66\",\"Almas Yafi'\",\"25/565863/TK/63831\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"67\",\"MUHAMMAD DAFA AL FALAH\",\"25/565919/TK/63837\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"68\",\"Rama Sandyka Putra\",\"25/565932/TK/63839\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"69\",\"MUMTAZ AZMI AS SYAUQI\",\"25/566212/TK/63878\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"70\",\"FERDINAND ELMO DANUARTA\",\"25/566500/TK/63900\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"71\",\"Alwan Kuswandhana\",\"25/566891/TK/63931\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"72\",\"Ata Syifa Salsabila\",\"25/566910/TK/63932\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"73\",\"NAYLA SALMA\",\"25/567065/TK/63953\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"74\",\"Arifa Satya Buana\",\"25/567104/TK/63965\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"75\",\"UTAMININGSIH YULI ASTUTI\",\"25/567251/TK/63990\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"76\",\"Nisrina Qurrata Ayuni\",\"25/567944/TK/64062\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"77\",\"MUHAMMAD RAFAY NAYAKA FEROZ\",\"25/568002/TK/64072\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"78\",\"AISYAH NAURA MAHARANI\",\"25/568007/TK/64073\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"79\",\"Ronaldo Hafizh Aji Dzakwan\",\"25/568034/TK/64076\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"80\",\"RASYA ANANDA ZAELANI\",\"25/568261/TK/64095\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"81\",\"La Jingga Akadewi Wiharja\",\"25/568323/TK/64104\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"82\",\"Yasmin Houri El Karami\",\"25/568336/TK/64107\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"83\",\"CANTIKA BUNGA ANANDA BINEI\",\"25/568371/TK/64111\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"84\",\"Ilmiya Lubna Iffah\",\"25/568788/TK/64146\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n\"85\",\"Alindya Ryonen Bilyarta\",\"25/569330/TK/64163\",\"\",\"FALSE\",\"-\",\"\",\"\",\"-\",\"-\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"";

  const FALLBACK_SNAPSHOTS = {
    'A': fallbackCsv,
    'C': FALLBACK_SNAPSHOT_C
  };

  const currentClass = state.classes.find(c => c.id === classId) || state.classes[0];
  const fallbackCsvData = (currentClass && FALLBACK_SNAPSHOTS[currentClass.id]) 
    ? FALLBACK_SNAPSHOTS[currentClass.id] 
    : fallbackCsv;

  parseCsvData(fallbackCsvData, currentClass);
  updateSyncStatus('offline', `Data Snapshot ${currentClass ? currentClass.name : ''} Tersedia`);
  updateAnalytics();
  updateClassNavPills();
}
