// server.js - Điểm khởi động máy chủ Express (Kiến trúc Ponytail Modular)
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const zaloTuyenDuong = require('./src/routes/zaloTuyenDuong');
const apiTuyenDuong = require('./src/routes/apiTuyenDuong');

const app = express();

// Thiết lập bảo mật và proxy
app.set('trust proxy', 1); // Render đứng sau 1 lớp proxy: req.ip mới là IP thật của người dùng
app.disable('x-powered-by');

// Các Middleware cơ bản
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// Phục vụ tệp tĩnh Web Dashboard (Giao diện)
app.use(express.static(path.join(__dirname, 'public')));

// Tuyến đường kiểm tra sức khỏe máy chủ
app.get('/', (req, res) => {
  res.send('✅ Hệ thống Tiếp nhận Báo hỏng Thiết bị (TVU) đang hoạt động bình thường!');
});

// Endpoint siêu nhẹ dành cho UptimeRobot ping chống ngủ đông (không truy vấn DB)
app.get('/health', (req, res) => {
  res.status(200).json({ thanh_cong: true, trang_thai: 'OK' });
});

// Tuyến đường tiếp nhận Webhook Zalo Bot
app.use('/webhook/zalo', zaloTuyenDuong);

// Tuyến đường RESTful API cho Web Dashboard
app.use('/api', apiTuyenDuong);

// Middleware bắt lỗi 404
app.use((req, res) => {
  res.status(404).json({ thanhCong: false, loi: 'Đường dẫn không tồn tại trên máy chủ' });
});

// Khởi chạy máy chủ lắng nghe
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`==================================================================`);
  console.log(`🚀 Máy chủ Backend đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 Zalo Webhook Gateway:        http://localhost:${PORT}/webhook/zalo`);
  console.log(`💻 RESTful API Dashboard:       http://localhost:${PORT}/api`);
  console.log(`==================================================================`);
});

module.exports = app;
