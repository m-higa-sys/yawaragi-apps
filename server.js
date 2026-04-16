const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  let filePath = decodeURIComponent(req.url.split('?')[0]);

  if (filePath === '/') {
    filePath = '/index.html';
  }

  const fullPath = path.join(ROOT, filePath);

  // セキュリティ: ROOTの外には出さない
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>ファイルが見つかりません</h1><p><a href="/">トップに戻る</a></p>');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    // HTMLファイル（index.html以外）に「戻る」ボタンを自動追加
    if (ext === '.html' && filePath !== '/index.html') {
      const homeBtn = `
<a href="/" id="yawaragi-home-btn" style="
  position:fixed;bottom:16px;right:16px;z-index:99999;
  background:#2c5f8a;color:#fff;text-decoration:none;
  padding:10px 20px;border-radius:24px;font-size:15px;font-weight:bold;
  box-shadow:0 2px 12px rgba(0,0,0,0.3);
  -webkit-tap-highlight-color:transparent;
">← 一覧に戻る</a>`;
      const html = data.toString('utf8');
      const injected = html.replace('</body>', homeBtn + '\n</body>');
      res.end(injected);
      return;
    }

    res.end(data);
  });
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.clear();
  console.log('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('  !!                                                    !!');
  console.log('  !!        ★★★★★★★★★★★★★★★★★★        !!');
  console.log('  !!                                                    !!');
  console.log('  !!          この画面は絶対に閉じないで！            !!');
  console.log('  !!                                                    !!');
  console.log('  !!        ★★★★★★★★★★★★★★★★★★        !!');
  console.log('  !!                                                    !!');
  console.log('  !!   閉じるとiPad・タブレットが使えなくなります   !!');
  console.log('  !!                                                    !!');
  console.log('  !!         そのまま放置してください                  !!');
  console.log('  !!                                                    !!');
  console.log('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('');
  console.log(`  サーバー起動中： http://${ip}:${PORT}`);
});
