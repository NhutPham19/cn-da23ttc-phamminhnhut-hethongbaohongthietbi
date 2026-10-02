// dangKyWebhook.js - Công cụ quản lý Webhook cho Zalo Bot Platform
require('dotenv').config();

const BOT_TOKEN = process.env.ZALO_BOT_TOKEN;
const SECRET_TOKEN = process.env.ZALO_SECRET_TOKEN;
const BASE_URL = `https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}`;

async function thucHien() {
  if (!BOT_TOKEN) {
    console.error('❌ Lỗi: Chưa tìm thấy ZALO_BOT_TOKEN trong file .env');
    process.exit(1);
  }

  const lenh = process.argv[2]; // Tham số truyền vào: url hoặc 'info' hoặc 'delete'

  // 1. Lệnh kiểm tra thông tin webhook hiện tại
  if (lenh === 'info') {
    console.log('🔍 Đang kiểm tra trạng thái Webhook hiện tại...');
    const phanHoi = await fetch(`${BASE_URL}/getWebhookInfo`, { method: 'POST' });
    const ketQua = await phanHoi.json();
    console.log('Kết quả:', JSON.stringify(ketQua, null, 2));
    return;
  }

  // 2. Lệnh xóa webhook (khi muốn chuyển sang dùng getUpdates)
  if (lenh === 'delete') {
    console.log('🗑️ Đang xóa Webhook...');
    const phanHoi = await fetch(`${BASE_URL}/deleteWebhook`, { method: 'POST' });
    const ketQua = await phanHoi.json();
    console.log('Kết quả:', JSON.stringify(ketQua, null, 2));
    return;
  }

  // 3. Đăng ký Webhook
  let webhookUrl = lenh;
  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    console.log('========================================================');
    console.log('📌 HƯỚNG DẪN SỬ DỤNG:');
    console.log('1. Đăng ký Webhook:');
    console.log('   node dangKyWebhook.js https://dia-chi-cua-ban.com/webhook/zalo');
    console.log('2. Xem trạng thái Webhook hiện tại:');
    console.log('   node dangKyWebhook.js info');
    console.log('3. Xóa Webhook:');
    console.log('   node dangKyWebhook.js delete');
    console.log('========================================================');
    return;
  }

  // Tự động thêm đuôi /webhook/zalo nếu người dùng chỉ dán link gốc
  if (!webhookUrl.includes('/webhook/zalo')) {
    webhookUrl = webhookUrl.replace(/\/+$/, '') + '/webhook/zalo';
  }

  console.log(`🚀 Đang đăng ký Webhook tới: ${webhookUrl}`);
  console.log(`🔐 Secret Token: ${SECRET_TOKEN}`);

  try {
    const phanHoi = await fetch(`${BASE_URL}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: SECRET_TOKEN
      })
    });

    const ketQua = await phanHoi.json();
    if (ketQua.ok) {
      console.log('✅ ĐĂNG KÝ WEBHOOK THÀNH CÔNG!');
      console.log('Chi tiết:', ketQua);
    } else {
      console.error('❌ ĐĂNG KÝ THẤT BẠI:', ketQua);
    }
  } catch (loi) {
    console.error('❌ Lỗi kết nối đến máy chủ Zalo:', loi.message);
  }
}

thucHien();
