/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: SINKRONISASI DUA ARAH (WEBSITE ↔ GOOGLE SPREADSHEET)
 * Rekap Nilai Harian Persamaan Diferensial A 2026
 * ==============================================================================
 * 
 * CARA MEMASANG DI GOOGLE SPREADSHEET ANDA:
 * 1. Buka Google Spreadsheet nilai Anda di browser.
 * 2. Klik menu: Extensions > Apps Script (Ekstensi > Apps Script).
 * 3. Hapus semua kode default di editor, lalu PASTE SELURUH KODE DI BAWAH INI.
 * 4. Klik icon Disket (Save).
 * 5. Klik tombol biru "Deploy" (Terapkan) di pojok kanan atas > "New deployment" (Penerapan baru).
 * 6. Klik ikon gerigi (Select type) > pilih "Web app" (Aplikasi web).
 * 7. Konfigurasi:
 *    - Description: Web API Nilai Persdifa
 *    - Execute as: Me (email akun Anda)
 *    - Who has access: Anyone (Siapa saja)
 * 8. Klik "Deploy" > Berikan Izin Akses (Authorize Access > Advanced > Go to Untitled project (unsafe) > Allow).
 * 9. Salin "Web app URL" (bentuknya: https://script.google.com/macros/s/.../exec).
 * 10. Buka file `app.js` di project website Anda, lalu tempel URL tersebut pada variabel `CONFIG.appsScriptUrl`.
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
 * GET Endpoint: Untuk tes koneksi & cek status API
 */
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || 'ping';

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (action === 'checkAdmin') {
    var emailToCheck = (params.email || '').trim().toLowerCase();
    var isAdmin = isAuthorizedAdmin(sheet, emailToCheck);
    return createJsonResponse({
      success: true,
      email: emailToCheck,
      isAdmin: isAdmin
    });
  }

  return createJsonResponse({
    status: 'ok',
    message: 'Google Apps Script API Persdifa A 2026 Aktif & Siap Menerima Data!',
    timestamp: new Date().toISOString()
  });
}

/**
 * POST Endpoint: Menerima perubahan nilai dari Website dan menyimpannya ke Spreadsheet
 */
function doPost(e) {
  // Kunci eksekusi untuk mencegah konflik saat dua admin mengedit bersamaan
  var lock = LockService.getScriptLock();
  var lockAcquired = lock.tryLock(10000); // Tunggu maksimal 10 detik

  if (!lockAcquired) {
    return createJsonResponse({
      success: false,
      error: 'Server sedang sibuk memproses permintaan lain. Coba beberapa detik lagi.'
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
    var userEmail = (payload.userEmail || '').trim().toLowerCase();
    var nim = (payload.nim || '').trim();
    var scores = payload.scores || {}; // Objek berisi pasangan { 'w1_inclass': 95, 'w1_exit': 100 }

    if (!nim) {
      return createJsonResponse({
        success: false,
        error: 'NIM mahasiswa tidak ditemukan dalam permintaan.'
      });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();

    // 1. Verifikasi Keamanan: Pastikan email pengirim berstatus Admin: TRUE
    if (!isAuthorizedAdmin(sheet, userEmail)) {
      return createJsonResponse({
        success: false,
        error: 'Akses ditolak: Email ' + (userEmail || '(anonim)') + ' bukan Admin di Google Spreadsheet ini.'
      });
    }

    // 2. Cari Baris Mahasiswa berdasarkan NIM (Pencarian di Kolom C / Kolom 3)
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    var targetRowIndex = -1; // 1-indexed

    // Baris data mahasiswa dimulai setelah header tabel (sekitar baris 8 ke bawah)
    for (var i = 0; i < values.length; i++) {
      var rowNim = (values[i][2] || '').toString().trim(); // Kolom C = index 2
      if (rowNim === nim) {
        targetRowIndex = i + 1; // Konversi ke 1-indexed baris spreadsheet
        break;
      }
    }

    if (targetRowIndex === -1) {
      return createJsonResponse({
        success: false,
        error: 'Mahasiswa dengan NIM ' + nim + ' tidak ditemukan di spreadsheet.'
      });
    }

    // 3. Tulis Nilai Baru ke Kolom yang Sesuai
    var updatedTasks = [];
    for (var taskId in scores) {
      if (scores.hasOwnProperty(taskId) && TASK_COLUMNS[taskId]) {
        var colIndex = TASK_COLUMNS[taskId];
        var rawVal = scores[taskId];

        // Format nilai: jika null/kosong/' - ' beri '-', jika angka simpan sebagai number
        var cellVal;
        if (rawVal === null || rawVal === undefined || rawVal === '' || rawVal === '-') {
          cellVal = '-';
        } else {
          var num = parseFloat(rawVal);
          cellVal = isNaN(num) ? rawVal : num;
        }

        sheet.getRange(targetRowIndex, colIndex).setValue(cellVal);
        updatedTasks.push({ taskId: taskId, value: cellVal, col: colIndex });
      }
    }

    // Paksa flush agar perubahan langsung tersimpan ke cloud
    SpreadsheetApp.flush();

    return createJsonResponse({
      success: true,
      message: 'Nilai berhasil disimpan ke Google Sheets!',
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
