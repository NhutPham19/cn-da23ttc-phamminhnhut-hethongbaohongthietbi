// src/routes/zaloTuyenDuong.js - Tuyến đường Webhook tiếp nhận Zalo Bot
const express = require('express');
const router = express.Router();
const { kiemTraSecretToken } = require('../middlewares/kiemTraBaoMat');
const { tiepNhanWebhookZalo } = require('../controllers/zaloDieuKhien');

// Điểm kiểm tra sống chết từ Zalo Bot Platform
router.get('/', (req, res) => {
  res.status(200).send('Webhook Zalo Bot is active!');
});

router.head('/', (req, res) => {
  res.sendStatus(200);
});

// Điểm nhận sự kiện Webhook chính
router.post('/', kiemTraSecretToken, tiepNhanWebhookZalo);

module.exports = router;
