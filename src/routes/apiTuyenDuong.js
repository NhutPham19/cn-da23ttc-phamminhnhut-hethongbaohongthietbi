// src/routes/apiTuyenDuong.js - Định tuyến toàn bộ RESTful API của Web Dashboard
const express = require('express');
const router = express.Router();

const { kiemTraDangNhap, kiemTraQuyenAdmin } = require('../middlewares/kiemTraXacThuc');
const {
  dangNhap,
  dangXuat,
  layThongTinCaNhan,
  doiMatKhau,
  quenMatKhau,
  kiemTraOtp,
  datLaiMatKhau
} = require('../controllers/xacThucDieuKhien');
const {
  layDanhSachYeuCau,
  layChiTietYeuCau,
  capNhatTrangThaiYeuCau,
  phanCongYeuCau,
  chuanHoaYeuCau,
  layDanhMuc
} = require('../controllers/yeuCauDieuKhien');
const { layThongKe } = require('../controllers/thongKeDieuKhien');
const {
  layDanhSachNguoiDung,
  taoNguoiDung,
  capNhatNguoiDung,
  doiTrangThaiNguoiDung
} = require('../controllers/nguoiDungDieuKhien');

// ==========================================
// 1. CỤM API XÁC THỰC (AUTHENTICATION)
// ==========================================
router.post('/xac-thuc/dang-nhap', dangNhap);
router.post('/xac-thuc/dang-xuat', kiemTraDangNhap, dangXuat);
router.get('/xac-thuc/thong-tin-ca-nhan', kiemTraDangNhap, layThongTinCaNhan);
router.post('/xac-thuc/doi-mat-khau', kiemTraDangNhap, doiMatKhau);
router.post('/xac-thuc/quen-mat-khau', quenMatKhau);
router.post('/xac-thuc/kiem-tra-otp', kiemTraOtp);
router.post('/xac-thuc/dat-lai-mat-khau', datLaiMatKhau);

// ==========================================
// 2. CỤM API QUẢN LÝ YÊU CẦU BÁO HỎNG
// ==========================================
router.get('/yeu-cau', kiemTraDangNhap, layDanhSachYeuCau);
router.get('/yeu-cau/:id', kiemTraDangNhap, layChiTietYeuCau);
router.put('/yeu-cau/:id/trang-thai', kiemTraDangNhap, capNhatTrangThaiYeuCau);
router.put('/yeu-cau/:id/phan-cong', kiemTraDangNhap, kiemTraQuyenAdmin, phanCongYeuCau);
router.put('/yeu-cau/:id/chuan-hoa', kiemTraDangNhap, chuanHoaYeuCau);

// ==========================================
// 3. CỤM API DANH MỤC THIẾT BỊ & PHÒNG
// ==========================================
router.get('/danh-muc', kiemTraDangNhap, layDanhMuc);

// ==========================================
// 4. CỤM API THỐNG KÊ & BÁO CÁO (ADMIN ONLY)
// ==========================================
router.get('/thong-ke', kiemTraDangNhap, kiemTraQuyenAdmin, layThongKe);

// ==========================================
// 5. CỤM API QUẢN LÝ NHÂN SỰ (ADMIN ONLY)
// ==========================================
router.get('/nguoi-dung', kiemTraDangNhap, kiemTraQuyenAdmin, layDanhSachNguoiDung);
router.post('/nguoi-dung', kiemTraDangNhap, kiemTraQuyenAdmin, taoNguoiDung);
router.put('/nguoi-dung/:id', kiemTraDangNhap, kiemTraQuyenAdmin, capNhatNguoiDung);
router.patch('/nguoi-dung/:id/trang-thai', kiemTraDangNhap, kiemTraQuyenAdmin, doiTrangThaiNguoiDung);

module.exports = router;
