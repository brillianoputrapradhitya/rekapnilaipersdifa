const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const SPREADSHEET_ID = '1ALjtCw64npBQmjibmViM9kluwvz4jPrPrM3OVmNhfSM';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function fetchSpreadsheetSheets() {
  return new Promise((resolve) => {
    https.get(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/htmlview`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const sheets = [];
        const regex = /name:\s*"([^"]+)",\s*pageUrl:[^,]+,\s*gid:\s*"([^"]+)"/g;
        let match;
        while ((match = regex.exec(data)) !== null) {
          sheets.push({
            name: match[1],
            id: match[2],
            gid: match[2]
          });
        }
        resolve(sheets);
      });
    }).on('error', () => resolve([]));
  });
}

const server = http.createServer(async (req, res) => {
  const urlClean = req.url.split('?')[0];

  // Suppress TCP stream errors (client disconnect mid-response) - non-fatal
  req.on('error', () => {});
  res.on('error', () => {});

  // API Endpoint: Auto-discover sheet tabs from Google Sheets live
  if (urlClean === '/api/sheets') {
    try {
      const sheets = await fetchSpreadsheetSheets();
      if (res.writableEnded) return;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: true, sheets }));
      return;
    } catch (err) {
      if (res.writableEnded) return;
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
  }

  let filePath = path.join(__dirname, urlClean === '/' ? 'index.html' : urlClean);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/ and http://127.0.0.1:${PORT}/`);
});
