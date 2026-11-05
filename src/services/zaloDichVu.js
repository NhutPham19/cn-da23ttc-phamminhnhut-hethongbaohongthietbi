// src/services/zaloDichVu.js - Module gửi tin nhắn và tương tác với Zalo Bot API
const THOI_GIAN_CHO_ZALO_MS = 10 * 1000; // 10 giây timeout

function layBaseUrl() {
  const token = process.env.ZALO_BOT_TOKEN || '';
  return `https://bot-api.zaloplatforms.com/bot${token}`;
}

/**
 * Gửi tin nhắn văn bản đến người dùng
 */
async function guiTinNhanZalo(chatId, noiDung) {
  try {
    if (!process.env.ZALO_BOT_TOKEN) {
      console.warn('⚠️ ZALO_BOT_TOKEN chưa được cấu hình, bỏ qua gửi tin.');
      return null;
    }

    const vanBanCat = String(noiDung || '').slice(0, 2000); // Giới hạn độ dài tối đa của Zalo

    const phanHoi = await fetch(`${layBaseUrl()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: vanBanCat
      }),
      signal: AbortSignal.timeout(THOI_GIAN_CHO_ZALO_MS)
    });

    const ketQua = await phanHoi.json();
    return ketQua;
  } catch (loi) {
    console.error('❌ Lỗi khi gửi tin nhắn Zalo:', loi.message);
    return null;
  }
}

/**
 * Gửi hình ảnh đến người dùng
 */
async function guiHinhAnhZalo(chatId, urlAnh, chuThich = '') {
  try {
    if (!process.env.ZALO_BOT_TOKEN) {
      console.warn('⚠️ ZALO_BOT_TOKEN chưa được cấu hình, bỏ qua gửi ảnh.');
      return null;
    }

    const chuThichCat = String(chuThich || '').slice(0, 1000);

    const phanHoi = await fetch(`${layBaseUrl()}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        photo: urlAnh,
        caption: chuThichCat
      }),
      signal: AbortSignal.timeout(THOI_GIAN_CHO_ZALO_MS)
    });

    const ketQua = await phanHoi.json();
    return ketQua;
  } catch (loi) {
    console.error('❌ Lỗi khi gửi ảnh Zalo:', loi.message);
    return null;
  }
}

module.exports = {
  guiTinNhanZalo,
  guiHinhAnhZalo
};
