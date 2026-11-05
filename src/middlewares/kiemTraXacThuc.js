// src/middlewares/kiemTraXacThuc.js - Xác thực JWT Cookie & Phân quyền Admin / KTV
const jwt = require('jsonwebtoken');
const { biMatJwt } = require('../config/jwt');

/**
 * Kiểm tra người dùng đã đăng nhập chưa thông qua HttpOnly Cookie 'token' hoặc header Authorization
 */
function kiemTraDangNhap(req, res, next) {
  let token = req.cookies?.token;

  // Dự phòng: đọc từ header Authorization nếu client gọi API REST
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      thanhCong: false,
      loi: 'Yêu cầu đăng nhập để truy cập tài nguyên này'
    });
  }

  try {
    const duLieuGiaiMa = jwt.verify(token, biMatJwt, { algorithms: ['HS256'] });
    req.nguoiDung = duLieuGiaiMa;
    next();
  } catch (loi) {
    return res.status(401).json({
      thanhCong: false,
      loi: 'Phiên làm việc không hợp lệ hoặc đã hết hạn, vui lòng đăng nhập lại'
    });
  }
}

/**
 * Kiểm tra quyền Quản trị viên (ADMIN)
 */
function kiemTraQuyenAdmin(req, res, next) {
  if (!req.nguoiDung || req.nguoiDung.vai_tro !== 'ADMIN') {
    return res.status(403).json({
      thanhCong: false,
      loi: 'Quyền truy cập bị từ chối: Chức năng này chỉ dành cho Quản trị viên'
    });
  }
  next();
}

module.exports = {
  kiemTraDangNhap,
  kiemTraQuyenAdmin
};
