// tuDongTunnel.js - Tự động bật Cloudflare Tunnel và tự động đăng ký Webhook với Zalo (Không cần copy/paste)
require('dotenv').config();
const { spawn } = require('child_process');

const CLOUDFLARED_PATH = 'C:\\PROGRA~2\\cloudflared\\cloudflared.exe';
const BOT_TOKEN = process.env.ZALO_BOT_TOKEN;
const SECRET_TOKEN = process.env.ZALO_SECRET_TOKEN;

console.log('=============================================================');
console.log('🚀 Đang khởi động Cloudflare Tunnel và tự động đăng ký Zalo...');
console.log('=============================================================');

const tunnel = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', 'http://localhost:3000']);

let daDangKy = false;

function xuLyLog(data) {
  const chuoi = data.toString();
  // In log ra màn hình để người dùng theo dõi
  process.stderr.write(chuoi);

  // Dùng biểu thức chính quy (Regex) tự động bắt đường link https://xxx.trycloudflare.com
  const timThay = chuoi.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (timThay && !daDangKy) {
    daDangKy = true;
    const linkTunnel = timThay[0];
    const webhookUrl = `${linkTunnel}/webhook/zalo`;

    console.log('\n=============================================================');
    console.log(`🎯 ĐÃ BẮT ĐƯỢC LINK TUNNEL: ${linkTunnel}`);
    console.log(`📡 ĐANG TỰ ĐỘNG ĐĂNG KÝ VỚI ZALO BOT API...`);

    fetch(`https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: SECRET_TOKEN
      })
    })
      .then((res) => res.json())
      .then((ketQua) => {
        if (ketQua.ok && ketQua.result?.verification?.ok) {
          console.log(`✅ TỰ ĐỘNG ĐĂNG KÝ THÀNH CÔNG 100%!`);
          console.log(`🎉 Zalo Bot đã sẵn sàng nhận tin nhắn. Cầm điện thoại test ngay!`);
        } else {
          console.log(`⚠️ Kết quả đăng ký:`, JSON.stringify(ketQua, null, 2));
        }
        console.log('=============================================================\n');
      })
      .catch((loi) => {
        console.error(`❌ Lỗi kết nối đăng ký Zalo:`, loi.message);
      });
  }
}

tunnel.stderr.on('data', xuLyLog);
tunnel.stdout.on('data', xuLyLog);

tunnel.on('close', (code) => {
  console.log(`Đường hầm Cloudflare đã đóng (mã thoát: ${code})`);
});
