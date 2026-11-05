// tests/kiemTraXacThuc.test.js - Unit tests cho xác thực JWT và phân quyền RBAC
process.env.JWT_SECRET = 'khoa-bi-mat-chi-dung-cho-kiem-thu-0123456789abcdef';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { kiemTraDangNhap, kiemTraQuyenAdmin } = require('../src/middlewares/kiemTraXacThuc');

test('kiemTraDangNhap: Từ chối khi không có token trong cookie hoặc header', () => {
  let maLoi = null;
  const req = { cookies: {}, headers: {} };
  const res = {
    status(code) {
      maLoi = code;
      return this;
    },
    json(data) {}
  };
  const next = () => {};

  kiemTraDangNhap(req, res, next);
  assert.equal(maLoi, 401);
});

test('kiemTraDangNhap: Từ chối khi token sai hoặc bị giả mạo', () => {
  let maLoi = null;
  const req = { cookies: { token: 'token_gia_mao_khong_hop_le' }, headers: {} };
  const res = {
    status(code) {
      maLoi = code;
      return this;
    },
    json(data) {}
  };
  const next = () => {};

  kiemTraDangNhap(req, res, next);
  assert.equal(maLoi, 401);
});

test('kiemTraDangNhap: Cho phép khi có token hợp lệ trong HttpOnly Cookie', () => {
  const payloadGoc = {
    ma_nguoi_dung: 1,
    tai_khoan: 'ktv_an',
    ho_ten: 'Nguyễn Văn An',
    vai_tro: 'KTV'
  };
  const tokenHopLe = jwt.sign(payloadGoc, process.env.JWT_SECRET, { expiresIn: '1h' });

  let daGoiNext = false;
  const req = { cookies: { token: tokenHopLe }, headers: {} };
  const res = {};
  const next = () => { daGoiNext = true; };

  kiemTraDangNhap(req, res, next);
  assert.equal(daGoiNext, true);
  assert.equal(req.nguoiDung.tai_khoan, 'ktv_an');
  assert.equal(req.nguoiDung.vai_tro, 'KTV');
});

test('kiemTraQuyenAdmin: Chặn người dùng có vai trò KTV', () => {
  let maLoi = null;
  const req = { nguoiDung: { ma_nguoi_dung: 2, tai_khoan: 'ktv_an', vai_tro: 'KTV' } };
  const res = {
    status(code) {
      maLoi = code;
      return this;
    },
    json(data) {}
  };
  const next = () => {};

  kiemTraQuyenAdmin(req, res, next);
  assert.equal(maLoi, 403);
});

test('kiemTraQuyenAdmin: Cho phép người dùng có vai trò ADMIN', () => {
  let daGoiNext = false;
  const req = { nguoiDung: { ma_nguoi_dung: 1, tai_khoan: 'admin', vai_tro: 'ADMIN' } };
  const res = {};
  const next = () => { daGoiNext = true; };

  kiemTraQuyenAdmin(req, res, next);
  assert.equal(daGoiNext, true);
});

test('xacThucDieuKhien: Cơ chế khóa chống brute-force sau 5 lần nhập sai liên tiếp', () => {
  const { danhSachDangNhapLoi, ghiNhanLoiDangNhap, SO_LAN_DANG_NHAP_SAI_TOI_DA } = require('../src/controllers/xacThucDieuKhien');

  const testKey = 'test_ip_127.0.0.1_baduser';
  danhSachDangNhapLoi.delete(testKey);

  // Thử 4 lần sai đầu tiên -> chưa bị khóa
  for (let i = 1; i <= 4; i++) {
    ghiNhanLoiDangNhap(testKey);
    const item = danhSachDangNhapLoi.get(testKey);
    assert.equal(item.soLanLoi, i);
    assert.equal(item.soLanLoi >= SO_LAN_DANG_NHAP_SAI_TOI_DA, false);
  }

  // Lần thứ 5 sai -> chạm ngưỡng khóa
  ghiNhanLoiDangNhap(testKey);
  const itemKhoa = danhSachDangNhapLoi.get(testKey);
  assert.equal(itemKhoa.soLanLoi, 5);
  assert.equal(itemKhoa.soLanLoi >= SO_LAN_DANG_NHAP_SAI_TOI_DA, true);

  danhSachDangNhapLoi.delete(testKey);
});
