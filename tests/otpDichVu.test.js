// tests/otpDichVu.test.js - Kiểm thử toàn diện dịch vụ OTP In-Memory & luồng Quên mật khẩu
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
const prisma = require('../src/config/coSoDuLieu');
const {
  sinhMaOtp,
  kiemTraGioiHanGuiOtp,
  taoVaLuuOtp,
  xacThucMaOtp,
  donDepOtpHetHan,
  _khoLuuTruOtp
} = require('../src/services/otpDichVu');
const { quenMatKhau, kiemTraOtp, datLaiMatKhau } = require('../src/controllers/xacThucDieuKhien');

test('otpDichVu: Test 1 - Sinh mã OTP 6 chữ số hợp lệ, lưu băm SHA-256 và xác thực thành công (One-Time Use)', () => {
  const email = 'test1@tvu.edu.vn';
  const maOtp = taoVaLuuOtp(email, 6);

  assert.strictEqual(typeof maOtp, 'string');
  assert.strictEqual(maOtp.length, 6);
  assert.match(maOtp, /^\d{6}$/);

  // Bản ghi lưu trong RAM không được chứa plaintext mã OTP
  const banGhi = _khoLuuTruOtp.get(email);
  assert.ok(banGhi);
  assert.notStrictEqual(banGhi.maOtpHash, maOtp);
  assert.strictEqual(banGhi.soLanSai, 0);

  // Xác thực đúng mã
  const ketQua = xacThucMaOtp(email, maOtp);
  assert.strictEqual(ketQua.hopLe, true);

  // Đảm bảo mã đã bị xóa sau khi dùng thành công (One-Time Use)
  assert.strictEqual(_khoLuuTruOtp.has(email), false);
  const thuLai = xacThucMaOtp(email, maOtp);
  assert.strictEqual(thuLai.hopLe, false);
  assert.strictEqual(thuLai.maLoi, 'KHONG_TON_TAI');
});

test('otpDichVu: Test 2 - Chặn yêu cầu gửi lại OTP khi chưa đủ 60 giây chống spam', () => {
  const email = 'spam@tvu.edu.vn';
  taoVaLuuOtp(email, 6);

  const kiemTra1 = kiemTraGioiHanGuiOtp(email);
  assert.strictEqual(kiemTra1.duocPhep, false);
  assert.ok(kiemTra1.soGiayConLai > 0 && kiemTra1.soGiayConLai <= 60);

  // Giả lập lùi thời gian gửi cuối quá 60 giây
  const banGhi = _khoLuuTruOtp.get(email);
  banGhi.lanGuiCuoi = Date.now() - 61 * 1000;

  const kiemTra2 = kiemTraGioiHanGuiOtp(email);
  assert.strictEqual(kiemTra2.duocPhep, true);
  assert.strictEqual(kiemTra2.soGiayConLai, 0);

  _khoLuuTruOtp.delete(email);
});

test('otpDichVu: Test 3 - Nhập sai OTP 5 lần liên tiếp tự hủy mã chống Brute-force', () => {
  const email = 'bruteforce@tvu.edu.vn';
  const maThat = taoVaLuuOtp(email, 6);

  // Nhập sai 4 lần đầu
  for (let lan = 1; lan <= 4; lan++) {
    const sai = xacThucMaOtp(email, '000000');
    assert.strictEqual(sai.hopLe, false);
    assert.strictEqual(sai.maLoi, 'SAI_MA');
  }

  // Nhập sai lần thứ 5 -> Hủy mã
  const lan5 = xacThucMaOtp(email, '000000');
  assert.strictEqual(lan5.hopLe, false);
  assert.strictEqual(lan5.maLoi, 'VUOT_SO_LAN_SAI');
  assert.strictEqual(_khoLuuTruOtp.has(email), false);

  // Lần thứ 6 dù nhập đúng mã thật vẫn bị từ chối vì mã đã hủy
  const lan6 = xacThucMaOtp(email, maThat);
  assert.strictEqual(lan6.hopLe, false);
  assert.strictEqual(lan6.maLoi, 'KHONG_TON_TAI');
});

test('otpDichVu: Test 4 - Mã OTP hết hạn sau 5 phút bị từ chối và tự động được dọn sạch', () => {
  const email = 'hethan@tvu.edu.vn';
  const maOtp = taoVaLuuOtp(email, 6);

  // Giả lập quá hạn 5 phút
  const banGhi = _khoLuuTruOtp.get(email);
  banGhi.thoiGianHetHan = Date.now() - 1000;

  const ketQua = xacThucMaOtp(email, maOtp);
  assert.strictEqual(ketQua.hopLe, false);
  assert.strictEqual(ketQua.maLoi, 'HET_HAN');
  assert.strictEqual(_khoLuuTruOtp.has(email), false);

  // Test hàm donDepOtpHetHan
  taoVaLuuOtp('rac@tvu.edu.vn', 6);
  _khoLuuTruOtp.get('rac@tvu.edu.vn').thoiGianHetHan = Date.now() - 5000;
  donDepOtpHetHan();
  assert.strictEqual(_khoLuuTruOtp.has('rac@tvu.edu.vn'), false);
});

test('xacThucDieuKhien: Test 5 - Tài khoản bị khóa (trang_thai_hoat_dong = false) bị chặn 403 khi quên mật khẩu', async () => {
  const emailTest = 'ktv_khoa@tvu.edu.vn';
  const banGocFindFirst = prisma.nguoi_dung.findFirst;

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 10,
    tai_khoan: 'ktv_khoa',
    ho_ten: 'KTV Bị Khóa',
    email: emailTest,
    trang_thai_hoat_dong: false
  });

  try {
    let statusCode = 0;
    let responseData = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    await quenMatKhau({ body: { email: emailTest } }, res);
    assert.strictEqual(statusCode, 403);
    assert.strictEqual(responseData.thanhCong, false);
    assert.match(responseData.loi, /bị khóa/i);
  } finally {
    prisma.nguoi_dung.findFirst = banGocFindFirst;
  }
});

test('xacThucDieuKhien: Test 6 - Đặt lại mật khẩu thành công qua OTP tự cập nhật doi_mat_khau_lan_dau = false', async () => {
  const emailTest = 'ktv_test@tvu.edu.vn';
  const maOtp = taoVaLuuOtp(emailTest, 6);

  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocUpdate = prisma.nguoi_dung.update;
  const banGocExecuteRawUnsafe = prisma.$executeRawUnsafe;

  let duLieuCapNhat = null;
  let rawSqlDaGoi = null;

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 2,
    tai_khoan: 'ktv_an',
    ho_ten: 'Nguyễn Văn An',
    email: emailTest,
    trang_thai_hoat_dong: true
  });

  prisma.nguoi_dung.update = async ({ where, data }) => {
    duLieuCapNhat = { where, data };
    return { ma_nguoi_dung: where.ma_nguoi_dung, ...data };
  };

  prisma.$executeRawUnsafe = async (sql, ...params) => {
    rawSqlDaGoi = { sql, params };
    return 1;
  };

  try {
    let statusCode = 0;
    let responseData = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    const matKhauMoi = 'matKhauMoi123';
    await datLaiMatKhau({
      body: {
        email: emailTest,
        otp: maOtp,
        mat_khau_moi: matKhauMoi
      }
    }, res);

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseData.thanhCong, true);
    assert.ok(duLieuCapNhat);
    assert.strictEqual(duLieuCapNhat.where.ma_nguoi_dung, 2);

    // Mật khẩu mới được băm bằng bcrypt
    const dungMk = await bcrypt.compare(matKhauMoi, duLieuCapNhat.data.mat_khau_hash);
    assert.strictEqual(dungMk, true);

    // Cờ doi_mat_khau_lan_dau được cập nhật thành false qua raw query
    assert.ok(rawSqlDaGoi);
    assert.match(rawSqlDaGoi.sql, /doi_mat_khau_lan_dau.*=.*false/i);
    assert.strictEqual(rawSqlDaGoi.params[0], 2);
  } finally {
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.nguoi_dung.update = banGocUpdate;
    prisma.$executeRawUnsafe = banGocExecuteRawUnsafe;
  }
});

test('xacThucDieuKhien: Test 7 - Luồng 3 bước độc lập (Bước 2 kiểm tra OTP cấp token -> Bước 3 dùng token đặt mật khẩu)', async () => {
  const emailTest = 'ktv_buoc3@tvu.edu.vn';
  const maOtp = taoVaLuuOtp(emailTest, 6);

  // BƯỚC 2: Gọi kiemTraOtp chỉ với email và otp
  let statusBuoc2 = 0;
  let duLieuBuoc2 = null;
  const resBuoc2 = {
    status(code) { statusBuoc2 = code; return this; },
    json(data) { duLieuBuoc2 = data; return this; }
  };

  await kiemTraOtp({ body: { email: emailTest, otp: maOtp } }, resBuoc2);
  assert.strictEqual(statusBuoc2, 200);
  assert.strictEqual(duLieuBuoc2.thanhCong, true);
  assert.ok(duLieuBuoc2.token_dat_lai);
  assert.strictEqual(typeof duLieuBuoc2.token_dat_lai, 'string');
  assert.strictEqual(duLieuBuoc2.token_dat_lai.length, 64); // 32 bytes hex = 64 ký tự

  // BƯỚC 3: Gọi datLaiMatKhau với token_dat_lai
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocUpdate = prisma.nguoi_dung.update;
  const banGocExecuteRawUnsafe = prisma.$executeRawUnsafe;

  let duLieuCapNhat = null;
  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 5,
    tai_khoan: 'ktv_buoc3',
    ho_ten: 'KTV Bước 3',
    email: emailTest,
    trang_thai_hoat_dong: true
  });
  prisma.nguoi_dung.update = async ({ where, data }) => {
    duLieuCapNhat = { where, data };
    return { ma_nguoi_dung: where.ma_nguoi_dung, ...data };
  };
  prisma.$executeRawUnsafe = async () => 1;

  try {
    let statusBuoc3 = 0;
    let duLieuBuoc3 = null;
    const resBuoc3 = {
      status(code) { statusBuoc3 = code; return this; },
      json(data) { duLieuBuoc3 = data; return this; }
    };

    const matKhauMoi = 'matKhauMoi678';
    await datLaiMatKhau({
      body: {
        email: emailTest,
        token_dat_lai: duLieuBuoc2.token_dat_lai,
        mat_khau_moi: matKhauMoi
      }
    }, resBuoc3);

    assert.strictEqual(statusBuoc3, 200);
    assert.strictEqual(duLieuBuoc3.thanhCong, true);
    assert.ok(duLieuCapNhat);
    assert.strictEqual(duLieuCapNhat.where.ma_nguoi_dung, 5);

    const dungMk = await bcrypt.compare(matKhauMoi, duLieuCapNhat.data.mat_khau_hash);
    assert.strictEqual(dungMk, true);

    // Thử dùng lại token lần 2 -> phải bị từ chối vì token chỉ dùng 1 lần (đã xóa)
    let statusThuLai = 0;
    let duLieuThuLai = null;
    const resThuLai = {
      status(code) { statusThuLai = code; return this; },
      json(data) { duLieuThuLai = data; return this; }
    };

    await datLaiMatKhau({
      body: {
        email: emailTest,
        token_dat_lai: duLieuBuoc2.token_dat_lai,
        mat_khau_moi: 'thuLaiNua123'
      }
    }, resThuLai);

    assert.strictEqual(statusThuLai, 400);
    assert.strictEqual(duLieuThuLai.thanhCong, false);
  } finally {
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.nguoi_dung.update = banGocUpdate;
    prisma.$executeRawUnsafe = banGocExecuteRawUnsafe;
  }
});
