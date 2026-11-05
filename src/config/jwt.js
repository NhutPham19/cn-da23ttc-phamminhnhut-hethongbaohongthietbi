// src/config/jwt.js - Nguồn duy nhất của bí mật JWT. Thiếu là dừng server, không dùng giá trị mặc định.
const biMatJwt = process.env.JWT_SECRET;

if (!biMatJwt || biMatJwt.length < 32) {
  throw new Error('Thiếu hoặc quá ngắn biến môi trường JWT_SECRET (tối thiểu 32 ký tự).');
}

module.exports = { biMatJwt };
