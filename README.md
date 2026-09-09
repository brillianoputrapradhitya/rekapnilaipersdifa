# 📊 Dashboard Nilai Harian Mahasiswa (Live Google Sheets)

Web Dashboard modern, interaktif, dan responsif untuk menampilkan rekapitulasi nilai harian mahasiswa (*In-Class Problem*, *Exit Ticket* Week 1–7, dan *UTS*) yang tersinkronisasi secara **live & real-time** dengan Google Spreadsheet.

Aplikasi ini dibuat secara khusus dengan **Zero-Build Architecture** (HTML5 murni, Vanilla CSS3 modern, dan ES6+ JavaScript), sehingga sangat ringan, cepat, dan **dapat di-deploy secara 100% gratis** ke berbagai penyedia hosting cloud.

---

## 🌟 Fitur Utama

1. **Sinkronisasi Live Google Sheets**:
   - Membaca langsung data nilai dari Google Spreadsheet secara *real-time* via *Google Sheet Visualization API*.
   - Tombol manual *Refresh* dan interval pembaruan otomatis setiap 60 detik.
   - Indikator status sync (Live / Offline Snapshot).

2. **Privasi & Fokus Nilai**:
   - Kolom *Email* dan *Status Admin* disembunyikan/dieliminasi dari tampilan publik.
   - Nama Dosen Pengampu otomatis terdeteksi dan disematkan rapi di bagian header (*Dosen: Pak Wijaya*).

3. **Pencarian Instan (Live Search)**:
   - Mahasiswa atau dosen cukup mengetik sebagian **Nama** atau **NIM** (misal: `558108` atau `Nabeel`) untuk langsung menyaring baris nilai.
   - Pintasan keyboard: tekan tombol `/` untuk langsung fokus ke kolom pencarian.

4. **Filter Tampilan Fleksibel**:
   - **Semua Pekan (Matrix Lengkap)**: Menampilkan seluruh tabel Week 1–7 dan UTS secara berdampingan dengan kolom identitas mahasiswa (*No, Nama, NIM*) yang terkunci di sisi kiri (*sticky columns*).
   - **Tab Per-Pekan (Week 1 s/d Week 7 & UTS)**: Memudahkan pengecekan tugas pada pekan tertentu secara mendalam, lengkap dengan status penyelesaiannya.
   - **Filter Status**: Menyaring mahasiswa yang sudah mengumpulkan vs ada tugas yang masih kosong.

5. **Kartu Nilai Individual (Student Score Card Modal)**:
   - Klik pada baris mahasiswa mana saja untuk membuka popup kartu nilai lengkap mahasiswa tersebut.
   - Menampilkan rata-rata nilai, persentase penyelesaian, rincian tiap pekan, dan tombol **Cetak Kartu Nilai (PDF/Print)**.

6. **Statistik & Analitik Kelas**:
   - Total Mahasiswa terdaftar (97 Mahasiswa).
   - Jumlah pekan aktif yang sudah mulai dinilai.
   - Rata-rata nilai keseluruhan kelas.
   - Total tugas terkumpul (*submission rate*).

7. **Navigasi Multi-Kelas & Reproducible**:
   - Berpindah cepat antara **Kelas A** dan **Kelas C** melalui tombol navigasi kelas di bagian atas halaman.
   - **Reproducible**: Sangat mudah menambah kelas baru (misalnya Kelas B, D, dst.) melalui tombol **+ Tambah Kelas** di website atau menambahkan 1 baris konfigurasi pada file `app.js`.
   - **Deep Linking**: Dukungan query URL `?class=C` atau `?class=A` sehingga tautan spesifik kelas dapat langsung dibagikan ke mahasiswa.

8. **Desain & Ekspor**:
   - Toggle **Dark Mode / Light Mode** yang nyaman di mata dengan aksen warna resmi UGM (Navy & Gold).
   - Fitur **Export CSV** untuk mengunduh rekap tabel kelas aktif ke format Excel/CSV.
   - Print stylesheet bawaan untuk mencetak halaman atau kartu nilai mahasiswa secara rapi.

---

## 🎓 Panduan Navigasi & Menambah Kelas Baru (Reproducibility)

Website ini telah mendukung multi-kelas secara otomatis:

### Cara 1: Menambah Kelas Langsung dari Website (Paling Mudah)
1. Klik tombol **+ Tambah Kelas** di bilah navigasi kelas (di bawah header).
2. Masukkan **Nama Kelas** (misal: `Kelas B`).
3. Masukkan **Nama Sheet** di Google Spreadsheet (misal: `PersDif B`).
4. (Opsional) Masukkan **Sheet ID / GID** jika ada.
5. Klik **Simpan & Buka Kelas**.
6. Halaman dan data kelas baru akan langsung tersimpan di browser Anda dan dapat langsung diakses!

### Cara 2: Menambah Kelas Permanen di Kode (`app.js`)
Buka file `app.js`, lalu tambahkan objek kelas pada array `CONFIG.classes`:
```javascript
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
  },
  // Tambah kelas baru di sini:
  {
    id: 'B',
    name: 'Kelas B',
    sheetName: 'PersDif B',
    badge: 'Persamaan Diferensial (Kelas B)',
    title: 'Rekap Nilai Harian Persamaan Diferensial B 2026'
  }
]
```

---

## 💻 Cara Menjalankan di Komputer Lokal

Jika ingin membuka web ini di komputer kamu sendiri:

### Cara 1: Menggunakan Python (Paling Mudah)
Buka terminal / PowerShell di folder ini, lalu jalankan:
```bash
python -m http.server 8080
```
Buka browser di: [http://localhost:8080](http://localhost:8080)

### Cara 2: Menggunakan Node.js / npx
```bash
npx serve .
```

---

## 🚀 Panduan Deploy Gratis (Online & Bisa Diakses Semua Orang)

Berikut adalah 3 opsi gratis terbaik untuk mempublikasikan website ini agar link-nya bisa dibagikan ke dosen dan mahasiswa:

### OPSI 1: Firebase Hosting (Resmi Google - Rekomendasi Dosen ⭐)
Jika dosenmu menginginkan domain gratis resmi dari Google (`https://nama-project.web.app`):

1. Buka [Google Firebase Console](https://console.firebase.google.com/) dan login dengan akun Google.
2. Klik **Add Project** (buat project baru, beri nama misalnya `nilai-dosen-tk`).
3. Di komputer kamu (pada folder ini), install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
4. Login ke akun Google:
   ```bash
   firebase login
   ```
5. Inisialisasi hosting:
   ```bash
   firebase init hosting
   ```
   - Pilih *Use an existing project* -> pilih project yang kamu buat tadi.
   - Saat ditanya *What do you want to use as your public directory?*, ketik: `.` (titik, artinya folder saat ini).
   - Saat ditanya *Configure as a single-page app?*, ketik: `y`.
   - Saat ditanya *Set up automatic builds and deploys with GitHub?*, ketik: `N`.
6. Jalankan perintah deploy:
   ```bash
   firebase deploy
   ```
7. 🎉 Website langsung online di domain gratis dari Google: `https://nilai-dosen-tk.web.app`!

---

### OPSI 2: Vercel (Paling Cepat & Instan - 1 Menit)
1. Buka [vercel.com](https://vercel.com) dan login (bisa via akun GitHub / Google).
2. Install Vercel CLI di terminal:
   ```bash
   npx vercel
   ```
3. Tekan Enter untuk menyetujui opsi default.
4. 🎉 Dalam 30 detik kamu langsung mendapatkan link gratis aktif seperti: `https://dosen-gradebook.vercel.app`.

*(Atau cukup drag & drop folder ini ke dashboard Vercel).*

---

### OPSI 3: GitHub Pages (Gratis Selamanya)
1. Buat repository baru di [GitHub](https://github.com/new) (misal: `rekap-nilai-harian`).
2. Upload file `index.html`, `styles.css`, dan `app.js` ke repository tersebut.
3. Masuk ke tab **Settings** di repo GitHub kamu > menu **Pages**.
4. Pada bagian *Branch*, pilih **main** / **root** lalu klik **Save**.
5. 🎉 Tunggu 1 menit, link web kamu langsung aktif di: `https://username-kamu.github.io/rekap-nilai-harian/`.

---

## 🔐 Panduan Mengaktifkan Fitur Edit Nilai (Two-Way Sync Google Sheets)

Website kini mendukung **Two-Way Sync (Sinkronisasi Dua Arah)** dengan hak akses admin:
- Pengunjung / Mahasiswa hanya bisa melihat nilai (*Read-Only*).
- Dosen & Asisten dengan status `Admin: TRUE` pada Google Spreadsheet dapat mengedit nilai langsung dari website dan menyimpannya ke Google Spreadsheet secara real-time.

### Langkah 1: Pasang Google Apps Script di Spreadsheet Anda (Cuma 2 Menit)
1. Buka Google Spreadsheet nilai Anda di browser.
2. Klik menu: **Extensions > Apps Script** (Ekstensi > Apps Script).
3. Hapus kode default di editor, lalu salin dan tempelkan seluruh isi file `google-apps-script.js` yang ada di folder project ini.
4. Klik ikon **Save (Simpan)**.
5. Klik tombol biru **Deploy (Terapkan)** di pojok kanan atas > pilih **New deployment (Penerapan baru)**.
6. Klik ikon gerigi (Select type) > pilih **Web app (Aplikasi web)**.
7. Konfigurasi:
   - *Description*: `Web API Nilai Persdifa`
   - *Execute as*: `Me` (Akun Google Anda)
   - *Who has access*: `Anyone` (Siapa saja)
8. Klik **Deploy** > Klik **Authorize access (Berikan akses)** > Pilih akun Google Anda > Klik *Advanced* > Klik *Go to Untitled project (unsafe)* > Klik *Allow*.
9. Salin URL yang dihasilkan (**Web app URL**, berakhiran `/exec`).
10. Buka file `app.js` pada project ini, lalu tempelkan URL tersebut ke baris:
    ```javascript
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycby.../exec',
    ```

---

### Langkah 2: Aktifkan Google Sign-In di Firebase Console
1. Buka [Firebase Console](https://console.firebase.google.com/) > pilih project `persdifa2026-d1321`.
2. Di menu samping kiri, klik **Build > Authentication**.
3. Klik tab **Sign-in method** > klik **Add new provider** > pilih **Google**.
4. Geser tombol toggle ke posisi **Enable**, masukkan email support Anda, lalu klik **Save**.
5. Selesai! Tombol *Login Admin* dengan Google sekarang aktif penuh.
*(Catatan: Anda juga dapat menggunakan opsi verifikasi email langsung pada popup login untuk pengujian cepat).*

---

## 📁 Struktur File

```
c:\FileReno\Academic\Dosen\
├── index.html            # Antarmuka web, modal kartu nilai mahasiswa, dan modal login admin
├── styles.css            # Desain tema UGM, Dark/Light mode, dan kontrol edit nilai
├── app.js                # Engine JavaScript: Firebase Auth, parser Google Sheets, live edit & sync
├── google-apps-script.js # Script API untuk dipasang di Google Spreadsheet (Two-Way Sync)
└── README.md             # Panduan lengkap, setup deployment, dan konfigurasi API
```

