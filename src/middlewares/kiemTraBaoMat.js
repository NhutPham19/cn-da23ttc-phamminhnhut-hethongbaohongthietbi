// src/middlewares/kiemTraBaoMat.js - Middleware bảo mật Zalo Bot Webhook
const crypto = require('crypto');

/**
 * Kiểm tra xác thực x-bot-api-secret-token từ Zalo Bot Platform gửi tới
 */
function kiemTraSecretToken(req, res, next) {
  const secretTuZalo = req.headers['x-bot-api-secret-token'];
  const secretChuan = process.env.ZALO_SECRET_TOKEN;

  // Xử lý probe kiểm tra sống chết từ Zalo Bot Platform (không có body)
  if (!secretTuZalo && Object.keys(req.body || {}).length === 0) {
    return res.status(200).send('OK Probe');
  }

  // Nếu biến môi trường bí mật webhook bị thiếu hoặc header không phải chuỗi -> từ chối
  if (!secretChuan || typeof secretTuZalo !== 'string') {
    return res.status(401).json({ thanhCong: false, loi: 'Không có quyền truy cập (Secret Token không hợp lệ)' });
  }

  const bufZalo = Buffer.from(secretTuZalo);
  const bufChuan = Buffer.from(secretChuan);

  if (bufZalo.length !== bufChuan.length || !crypto.timingSafeEqual(bufZalo, bufChuan)) {
    console.warn('⚠️ Cảnh báo bảo mật: Có request gọi vào Webhook nhưng sai hoặc thiếu Secret Token!');
    return res.status(401).json({ thanhCong: false, loi: 'Không có quyền truy cập (Secret Token không hợp lệ)' });
  }

  next();
}

module.exports = {
  kiemTraSecretToken
};
