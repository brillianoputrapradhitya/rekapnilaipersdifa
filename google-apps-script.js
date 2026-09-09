/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: SINKRONISASI DUA ARAH (WEBSITE ↔ GOOGLE SPREADSHEET)
 * Rekap Nilai Harian Persamaan Diferensial (Multi-Kelas: Kelas A, C, dst.) 2026
 * ==============================================================================
 * 
 * ⚠️ PENTING: SETIAP KALI KODE INI DIPERBARUI, ANDA HARUS:
 * 1. Buka Google Spreadsheet nilai Anda di browser.
 * 2. Klik menu: Extensions > Apps Script (Ekstensi > Apps Script).
 * 3. Hapus semua kode lama di editor, lalu PASTE SELURUH KODE DI BAWAH INI.
 * 4. Klik icon Disket (Save).
 * 5. Klik tombol biru "Deploy" (Terapkan) di pojok kanan atas > pilih "Manage deployments" (Kelola penerapan).
 * 6. Klik ikon Pensil (Edit) di samping deployment aktif Anda.
 * 7. Pada dropdown "Version", PILIH: "New version" (Versi baru).
 * 8. Klik tombol "Deploy".
 * ==============================================================================
 */

// Konfigurasi Kolom Tugas di Google Spreadsheet (1-indexed untuk Apps Script)
// Kolom A=1, B=2, C=3, D=4, E=5, F=6, G=7, dst.
var TASK_COLUMNS = {
  // Week 1
  'w1_inclass': 6, // Kolom F
  'w1_exit': 7,    // Kolom G
  // Week 2
  'w2_inclass': 8, // Kolom H
  'w2_exit': 9,    // Kolom I
  // Week 3
  'w3_inclass': 10, // Kolom J
  'w3_exit': 11,    // Kolom K
  // Week 4
  'w4_inclass': 12, // Kolom L
  'w4_exit': 13,    // Kolom M
  // Week 5
  'w5_inclass': 14, // Kolom N
  'w5_exit': 15,    // Kolom O
  // Week 6
  'w6_inclass': 16, // Kolom P
  'w6_exit': 17,    // Kolom Q
  // Week 7
  'w7_inclass': 18, // Kolom R
  'w7_exit': 19,    // Kolom S
  // UTS
  'uts_exam': 20    // Kolom T
};

/**
 * GET Endpoint: Untuk tes koneksi, daftar tab sheet secara dinamis, & cek status API
 */
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || 'ping';

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  // Kembalikan seluruh tab sheet yang ada di spreadsheet untuk auto-discovery web
  if (action === 'getSheets' || action === 'getClasses') {
    var allSheets = ss.getSheets().map(function(s) {
      return {
        id: s.getSheetId().toString(),
        gid: s.getSheetId().toString(),
        name: s.getName()
      };
    });
    return createJsonResponse({
      success: true,
      sheets: allSheets
    });
  }

  if (action === 'checkAdmin') {
    var emailToCheck = (params.email || '').trim().toLowerCase();
    var primarySheet = ss.getSheets()[0];
    var isAdmin = isAuthorizedAdmin(sheet, emailToCheck) || isAuthorizedAdmin(primarySheet, emailToCheck);
    return createJsonResponse({
      success: true,
      email: emailToCheck,
      isAdmin: isAdmin
    });
  }

  return createJsonResponse({
    status: 'ok',
    message: 'Google Apps Script API Persdifa (Multi-Kelas) 2026 Aktif & Siap Menerima Data!',
    sheetsCount: ss.getSheets().length,
    timestamp: new Date().toISOString()
  });
}

/**
 * POST Endpoint: Menerima perubahan nilai dan pembuatan sheet kelas baru dari Website
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var lockAcquired = lock.tryLock(15000); // Tunggu maksimal 15 detik

  if (!lockAcquired) {
    return createJsonResponse({
      success: false,
      error: 'Server Google Apps Script sedang sibuk. Silakan coba beberapa detik lagi.'
    });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        success: false,
        error: 'Payload kosong atau tidak valid.'
      });
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'updateStudentScores';
    var userEmail = (payload.userEmail || '').trim().toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var primarySheet = ss.getSheets()[0];

    // =========================================================================
    // AKSI 1: TAMBAH SHEET KELAS BARU DARI WEB (REPRODUCIBLE CLASS CREATOR)
    // =========================================================================
    if (action === 'createSheet' || action === 'addClass') {
      var newSheetName = (payload.sheetName || payload.className || '').trim();
      if (!newSheetName) {
        return createJsonResponse({
          success: false,
          error: 'Nama sheet tidak boleh kosong.'
        });
      }

      // Verifikasi Keamanan: HANYA ADMIN yang memiliki izin membuat sheet kelas baru
      if (!userEmail) {
        return createJsonResponse({
          success: false,
          error: 'Akses ditolak: Anda harus login sebagai Admin untuk membuat sheet kelas baru di Google Spreadsheet.'
        });
      }

      var isAuth = isAuthorizedAdmin(primarySheet, userEmail);
      if (!isAuth) {
        var allSheets = ss.getSheets();
        for (var s = 0; s < allSheets.length; s++) {
          if (isAuthorizedAdmin(allSheets[s], userEmail)) {
            isAuth = true;
            break;
          }
        }
      }

      if (!isAuth) {
        return createJsonResponse({
          success: false,
          error: 'Akses ditolak: Email "' + userEmail + '" tidak memiliki status Admin (Admin: TRUE) di Google Spreadsheet.'
        });
      }

      // Jika sheet sudah ada, kembalikan GID-nya
      var existingSheet = ss.getSheetByName(newSheetName);
      if (existingSheet) {
        return createJsonResponse({
          success: true,
          sheetName: newSheetName,
          gid: existingSheet.getSheetId().toString(),
          message: 'Sheet "' + newSheetName + '" sudah ada di Google Spreadsheet.'
        });
      }

      // Buat sheet baru dan salin format header dari sheet template (PersDif A)
      var templateSheet = ss.getSheetByName('PersDif A') || primarySheet;
      var newSheet = ss.insertSheet(newSheetName);

      // Salin 4 baris header (Kop Dosen, Pekan 1-7, In-Class, Exit Ticket, UTS)
      var templateRange = templateSheet.getRange(1, 1, 4, 21);
      var targetRange = newSheet.getRange(1, 1, 4, 21);
      templateRange.copyTo(targetRange);

      SpreadsheetApp.flush();

      return createJsonResponse({
        success: true,
        sheetName: newSheetName,
        gid: newSheet.getSheetId().toString(),
        message: 'Sheet "' + newSheetName + '" berhasil dibuat di Google Spreadsheet!'
      });
    }

    // =========================================================================
    // AKSI 2: UPDATE NILAI MAHASISWA (MULTI-SHEET & ALL-SHEET FALLBACK SEARCH)
    // =========================================================================
    var nim = (payload.nim || '').trim();
    var scores = payload.scores || {};
    var targetSheetName = payload.sheetName || payload.className || '';
    var targetGid = payload.gid ? payload.gid.toString() : '';

    if (!nim) {
      return createJsonResponse({
        success: false,
        error: 'NIM mahasiswa tidak disertakan dalam permintaan.'
      });
    }

    // 1. Cari sheet target berdasarkan Nama atau GID
    var targetSheet = null;
    if (targetSheetName) {
      targetSheet = ss.getSheetByName(targetSheetName);
    }
    if (!targetSheet && targetGid) {
      var sheets = ss.getSheets();
      for (var s = 0; s < sheets.length; s++) {
        if (sheets[s].getSheetId().toString() === targetGid) {
          targetSheet = sheets[s];
          break;
        }
      }
    }

    // 2. Verifikasi Keamanan Admin
    var isAuth = isAuthorizedAdmin(targetSheet, userEmail) || isAuthorizedAdmin(primarySheet, userEmail);
    if (!isAuth) {
      return createJsonResponse({
        success: false,
        error: 'Akses ditolak: Email ' + (userEmail || '(anonim)') + ' bukan Admin di Google Spreadsheet ini.'
      });
    }

    // 3. Cari baris mahasiswa di sheet target
    var targetRowIndex = -1;
    if (targetSheet) {
      var values = targetSheet.getDataRange().getValues();
      for (var i = 0; i < values.length; i++) {
        var rowNim = (values[i][2] || '').toString().trim(); // Kolom C = NIM
        if (rowNim === nim) {
          targetRowIndex = i + 1;
          break;
        }
      }
    }

    // 4. FALLBACK GLOBAL: Jika belum ketemu di sheet target, cari di SELURUH sheet di spreadsheet ini!
    if (targetRowIndex === -1) {
      var allSheets = ss.getSheets();
      for (var s = 0; s < allSheets.length; s++) {
        var candidateSheet = allSheets[s];
        var cValues = candidateSheet.getDataRange().getValues();
        for (var i = 0; i < cValues.length; i++) {
          var cNim = (cValues[i][2] || '').toString().trim();
          if (cNim === nim) {
            targetSheet = candidateSheet;
            targetSheetName = candidateSheet.getName();
            targetRowIndex = i + 1;
            break;
          }
        }
        if (targetRowIndex !== -1) break;
      }
    }

    if (targetRowIndex === -1 || !targetSheet) {
      return createJsonResponse({
        success: false,
        error: 'Mahasiswa dengan NIM ' + nim + ' tidak ditemukan di sheet "' + (targetSheetName || 'aktif') + '" maupun sheet lainnya di Google Spreadsheet.'
      });
    }

    // 5. Simpan Nilai ke Kolom yang Sesuai
    var updatedTasks = [];
    for (var taskId in scores) {
      if (scores.hasOwnProperty(taskId) && TASK_COLUMNS[taskId]) {
        var colIndex = TASK_COLUMNS[taskId];
        var rawVal = scores[taskId];

        var cellVal;
        if (rawVal === null || rawVal === undefined || rawVal === '' || rawVal === '-') {
          cellVal = '-';
        } else {
          var num = parseFloat(rawVal);
          cellVal = isNaN(num) ? rawVal : num;
        }

        targetSheet.getRange(targetRowIndex, colIndex).setValue(cellVal);
        updatedTasks.push({ taskId: taskId, value: cellVal, col: colIndex });
      }
    }

    SpreadsheetApp.flush();

    return createJsonResponse({
      success: true,
      message: 'Nilai berhasil disimpan ke sheet ' + targetSheet.getName() + ' di Google Spreadsheet!',
      sheetName: targetSheet.getName(),
      nim: nim,
      updatedRow: targetRowIndex,
      updatedCount: updatedTasks.length,
      updatedTasks: updatedTasks,
      savedBy: userEmail,
      updatedAt: new Date().toISOString()
    });

  } catch (err) {
    return createJsonResponse({
      success: false,
      error: 'Terjadi kesalahan di server Apps Script: ' + err.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fungsi Pembantu: Memeriksa apakah suatu email memiliki Admin == TRUE di spreadsheet
 */
function isAuthorizedAdmin(sheet, emailToCheck) {
  if (!emailToCheck) return false;
  emailToCheck = emailToCheck.trim().toLowerCase();

  // Default super-admin emails
  if (emailToCheck === 'wyatmaja@ugm.ac.id' || emailToCheck === 'brillianoputrapradhitya@mail.ugm.ac.id') {
    return true;
  }

  if (!sheet) return false;

  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rowEmail = (row[3] || '').toString().trim().toLowerCase(); // Kolom D = Email
    var rowAdmin = (row[4] || '').toString().trim().toUpperCase();  // Kolom E = Admin

    if (rowEmail === emailToCheck && (rowAdmin === 'TRUE' || rowAdmin === '1')) {
      return true;
    }
  }

  return false;
}

/**
 * Format Response JSON dengan Header CORS Lengkap
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
