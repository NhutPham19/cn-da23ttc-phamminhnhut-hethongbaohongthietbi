// src/services/otpDichVu.js - Quản lý vòng đời mã OTP In-Memory an toàn mật mã học
const crypto = require('crypto');

const THOI_GIAN_SONG_OTP_MS = 5 * 60 * 1000; // 5 phút (300.000 ms)
const THOI_GIAN_CHO_GUI_LAI_MS = 60 * 1000;  // 60 giây (60.000 ms)
const SO_LAN_SAI_TOI_DA = 5;                 // Tối đa 5 lần nhập sai

// Cấu trúc Map: key = email (viết thường), value = { maOtpHash, thoiGianHetHan, soLanSai, lanGuiCuoi }
const khoLuuTruOtp = new Map();

/**
 * Băm chuỗi OTP 6 số bằng SHA-256 để không lưu plaintext trong RAM
 */
function bamMaOtp(maOtp) {
  return crypto.createHash('sha256').update(String(maOtp)).digest('hex');
}

/**
 * Sinh mã OTP ngẫu nhiên an toàn mật mã học (mặc định 6 chữ số: 100000 -> 999999)
 */
function sinhMaOtp(doDai = 6) {
  const min = Math.pow(10, doDai - 1);
  const max = Math.pow(10, doDai) - 1;
  return String(crypto.randomInt(min, max + 1));
}

/**
 * Kiểm tra xem email có đang trong thời gian chờ 60 giây chống spam hay không
 * @returns {{ duocPhep: boolean, soGiayConLai: number }}
 */
function kiemTraGioiHanGuiOtp(email) {
  const khoa = String(email).trim().toLowerCase();
  const banGhi = khoLuuTruOtp.get(khoa);
  if (!banGhi) return { duocPhep: true, soGiayConLai: 0 };

  const khoangThoiGian = Date.now() - banGhi.lanGuiCuoi;
  if (khoangThoiGian < THOI_GIAN_CHO_GUI_LAI_MS) {
    const soGiayConLai = Math.ceil((THOI_GIAN_CHO_GUI_LAI_MS - khoangThoiGian) / 1000);
    return { duocPhep: false, soGiayConLai };
  }
  return { duocPhep: true, soGiayConLai: 0 };
}

/**
 * Tạo và lưu mã OTP mới vào bộ nhớ tạm
 */
function taoVaLuuOtp(email, doDai = 6) {
  const khoa = String(email).trim().toLowerCase();
  const maOtp = sinhMaOtp(doDai);
  const bayGio = Date.now();

  khoLuuTruOtp.set(khoa, {
    maOtpHash: bamMaOtp(maOtp),
    thoiGianHetHan: bayGio + THOI_GIAN_SONG_OTP_MS,
    soLanSai: 0,
    lanGuiCuoi: bayGio
  });

  return maOtp;
}

/**
 * Xác thực mã OTP do người dùng nhập vào
 * @returns {{ hopLe: boolean, maLoi?: string, thongBao?: string }}
 */
function xacThucMaOtp(email, maOtpNhap) {
  const khoa = String(email).trim().toLowerCase();
  const banGhi = khoLuuTruOtp.get(khoa);

  if (!banGhi) {
    return {
      hopLe: false,
      maLoi: 'KHONG_TON_TAI',
      thongBao: 'Mã OTP không tồn tại hoặc đã hết hạn. Vui lòng yêu cầu mã mới.'
    };
  }

  // Kiểm tra hạn 5 phút
  if (Date.now() > banGhi.thoiGianHetHan) {
    khoLuuTruOtp.delete(khoa);
    return {
      hopLe: false,
      maLoi: 'HET_HAN',
      thongBao: 'Mã OTP đã hết thời hạn 5 phút. Vui lòng yêu cầu gửi lại mã mới.'
    };
  }

  // So sánh an toàn chống Timing Attack
  const bamNhap = Buffer.from(bamMaOtp(String(maOtpNhap).trim()), 'hex');
  const bamGoc = Buffer.from(banGhi.maOtpHash, 'hex');
  const khopMa = bamNhap.length === bamGoc.length && crypto.timingSafeEqual(bamNhap, bamGoc);

  if (!khopMa) {
    banGhi.soLanSai += 1;
    if (banGhi.soLanSai >= SO_LAN_SAI_TOI_DA) {
      khoLuuTruOtp.delete(khoa);
      return {
        hopLe: false,
        maLoi: 'VUOT_SO_LAN_SAI',
        thongBao: 'Bạn đã nhập sai mã OTP quá 5 lần. Mã này đã bị hủy, vui lòng yêu cầu mã mới.'
      };
    }
    const conLai = SO_LAN_SAI_TOI_DA - banGhi.soLanSai;
    return {
      hopLe: false,
      maLoi: 'SAI_MA',
      thongBao: `Mã OTP không chính xác. Bạn còn ${conLai} lần thử.`
    };
  }

  // Xác thực thành công -> Xóa ngay lập tức để chống dùng lại (One-Time Use)
  khoLuuTruOtp.delete(khoa);
  return { hopLe: true };
}

/**
 * Xác thực mã OTP ở Bước 2 và cấp token đặt lại mật khẩu dùng cho Bước 3
 * @returns {{ hopLe: boolean, maLoi?: string, thongBao?: string, tokenDatLai?: string }}
 */
function xacNhanOtpCapToken(email, maOtpNhap) {
  const khoa = String(email).trim().toLowerCase();
  const banGhi = khoLuuTruOtp.get(khoa);

  if (!banGhi) {
    return {
      hopLe: false,
      maLoi: 'KHONG_TON_TAI',
      thongBao: 'Mã OTP không tồn tại hoặc đã hết hạn. Vui lòng yêu cầu mã mới.'
    };
  }

  // Kiểm tra hạn 5 phút
  if (Date.now() > banGhi.thoiGianHetHan) {
    khoLuuTruOtp.delete(khoa);
    return {
      hopLe: false,
      maLoi: 'HET_HAN',
      thongBao: 'Mã OTP đã hết thời hạn 5 phút. Vui lòng yêu cầu gửi lại mã mới.'
    };
  }

  // So sánh an toàn chống Timing Attack
  const bamNhap = Buffer.from(bamMaOtp(String(maOtpNhap).trim()), 'hex');
  const bamGoc = Buffer.from(banGhi.maOtpHash, 'hex');
  const khopMa = bamNhap.length === bamGoc.length && crypto.timingSafeEqual(bamNhap, bamGoc);

  if (!khopMa) {
    banGhi.soLanSai += 1;
    if (banGhi.soLanSai >= SO_LAN_SAI_TOI_DA) {
      khoLuuTruOtp.delete(khoa);
      return {
        hopLe: false,
        maLoi: 'VUOT_SO_LAN_SAI',
        thongBao: 'Bạn đã nhập sai mã OTP quá 5 lần. Mã này đã bị hủy, vui lòng yêu cầu mã mới.'
      };
    }
    const conLai = SO_LAN_SAI_TOI_DA - banGhi.soLanSai;
    return {
      hopLe: false,
      maLoi: 'SAI_MA',
      thongBao: `Mã OTP không chính xác. Bạn còn ${conLai} lần thử.`
    };
  }

  // OTP ĐÚNG -> Sinh token đặt lại mật khẩu an toàn (32 bytes hex)
  const tokenDatLai = crypto.randomBytes(32).toString('hex');
  banGhi.tokenDatLai = tokenDatLai;
  banGhi.daXacThuc = true;

  return { hopLe: true, tokenDatLai };
}

/**
 * Kiểm tra token đặt lại mật khẩu và tiêu hủy ngay sau khi dùng
 */
function xacThucTokenDatLai(email, tokenDatLai) {
  const khoa = String(email).trim().toLowerCase();
  const banGhi = khoLuuTruOtp.get(khoa);

  if (!banGhi || !banGhi.daXacThuc || !banGhi.tokenDatLai) {
    return { hopLe: false, thongBao: 'Phiên xác thực không tồn tại hoặc đã hết hạn. Vui lòng thử lại.' };
  }

  if (Date.now() > banGhi.thoiGianHetHan) {
    khoLuuTruOtp.delete(khoa);
    return { hopLe: false, thongBao: 'Phiên xác thực đã hết hạn 5 phút. Vui lòng thử lại.' };
  }

  const tokenNhapBuf = Buffer.from(String(tokenDatLai));
  const tokenGocBuf = Buffer.from(String(banGhi.tokenDatLai));
  const khopToken = tokenNhapBuf.length === tokenGocBuf.length && crypto.timingSafeEqual(tokenNhapBuf, tokenGocBuf);

  if (!khopToken) {
    return { hopLe: false, thongBao: 'Mã phiên xác thực không hợp lệ.' };
  }

  // Tiêu hủy ngay sau khi dùng xong (One-Time Use)
  khoLuuTruOtp.delete(khoa);
  return { hopLe: true };
}

/**
 * Hàm dọn rác các mã OTP đã quá hạn 5 phút
 */
function donDepOtpHetHan() {
  const bayGio = Date.now();
  for (const [khoa, banGhi] of khoLuuTruOtp.entries()) {
    if (bayGio > banGhi.thoiGianHetHan) {
      khoLuuTruOtp.delete(khoa);
    }
  }
}

// Khởi chạy bộ dọn rác tự động mỗi 60 giây kèm .unref() để không làm treo `npm test`
const boDonRacOtp = setInterval(donDepOtpHetHan, 60 * 1000);
if (typeof boDonRacOtp.unref === 'function') {
  boDonRacOtp.unref();
}

module.exports = {
  sinhMaOtp,
  kiemTraGioiHanGuiOtp,
  taoVaLuuOtp,
  xacThucMaOtp,
  xacNhanOtpCapToken,
  xacThucTokenDatLai,
  donDepOtpHetHan,
  _khoLuuTruOtp: khoLuuTruOtp // Xuất nội bộ phục vụ Unit Tests
};
