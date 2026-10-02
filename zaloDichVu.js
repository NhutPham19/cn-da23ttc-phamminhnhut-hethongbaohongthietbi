// zaloDichVu.js - Module gửi tin nhắn và tương tác với Zalo Bot API
const BASE_URL = `https://bot-api.zaloplatforms.com/bot${process.env.ZALO_BOT_TOKEN}`;

/**
 * Gửi tin nhắn văn bản đến người dùng
 */
async function guiTinNhanZalo(chatId, noiDung) {
  try {
    const phanHoi = await fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: noiDung
      })
    });
    const ketQua = await phanHoi.json();
    return ketQua;
  } catch (loi) {
    console.error('❌ Lỗi khi gửi tin nhắn Zalo:', loi.message);
  }
}

/**
 * Gửi hình ảnh đến người dùng
 */
async function guiHinhAnhZalo(chatId, urlAnh, chuThich = '') {
  try {
    const phanHoi = await fetch(`${BASE_URL}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        photo: urlAnh,
        caption: chuThich
      })
    });
    const ketQua = await phanHoi.json();
    return ketQua;
  } catch (loi) {
    console.error('❌ Lỗi khi gửi ảnh Zalo:', loi.message);
  }
}

module.exports = {
  guiTinNhanZalo,
  guiHinhAnhZalo
};
