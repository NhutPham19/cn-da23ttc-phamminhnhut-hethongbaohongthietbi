// src/controllers/xacThucDieuKhien.js - Xử lý Đăng nhập, Đăng xuất, Lấy thông tin tài khoản
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/coSoDuLieu');
const { biMatJwt } = require('../config/jwt');
const {
  kiemTraGioiHanGuiOtp,
  taoVaLuuOtp,
  xacThucMaOtp,
  xacNhanOtpCapToken,
  xacThucTokenDatLai
} = require('../services/otpDichVu');
const { guiEmailOtp } = require('../services/emailDichVu');

const THOI_HAN_TOKEN_GIAY = 8 * 60 * 60; // 8 giờ

// Chống dò mật khẩu: sai quá 5 lần thì khóa 15 phút (tính từ lần sai thứ 5)
const SO_LAN_DANG_NHAP_SAI_TOI_DA = 5;
const THOI_GIAN_KHOA_TAM_MS = 15 * 60 * 1000;
const DO_DAI_TAI_KHOAN_TOI_DA = 50; // bằng VarChar(50) của cột tai_khoan
const danhSachDangNhapLoi = new Map();
let lanDonDepCuoi = 0;

// Mã băm giả: khi không tìm thấy tài khoản vẫn chạy bcrypt.compare để thời gian phản hồi như nhau.
const SO_VONG_BAM = 10; // PHẢI bằng số vòng bcrypt đang dùng trong prisma/hatGiong.js
const MA_BAM_GIA = bcrypt.hashSync('mat-khau-gia-khong-ai-biet', SO_VONG_BAM);

const THONG_BAO_LOI_DANG_NHAP = 'Sai tài khoản hoặc mật khẩu';

const TUY_CHON_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/'
};

/**
 * Số mili-giây còn bị khóa của một khóa đăng nhập (0 nếu không bị khóa).
 * Tương thích dữ liệu cũ: nếu chưa có khoaDen thì tính từ thoiDiemDauTien.
 */
function thoiGianKhoaConLaiMs(lichSuLoi, bayGio = Date.now()) {
  if (!lichSuLoi || lichSuLoi.soLanLoi < SO_LAN_DANG_NHAP_SAI_TOI_DA) return 0;
  const thoiDiemMoKhoa = lichSuLoi.khoaDen || (lichSuLoi.thoiDiemDauTien + THOI_GIAN_KHOA_TAM_MS);
  return Math.max(thoiDiemMoKhoa - bayGio, 0);
}

function donDepDanhSachLoi() {
  const bayGio = Date.now();
  for (const [khoa, lichSuLoi] of danhSachDangNhapLoi.entries()) {
    const dangDuocKhoa = lichSuLoi.soLanLoi >= SO_LAN_DANG_NHAP_SAI_TOI_DA;
    const hetHan = dangDuocKhoa
      ? thoiGianKhoaConLaiMs(lichSuLoi, bayGio) === 0
      : bayGio - lichSuLoi.thoiDiemDauTien > THOI_GIAN_KHOA_TAM_MS;
    if (hetHan) danhSachDangNhapLoi.delete(khoa);
  }
}

// Chỉ dọn tối đa 1 lần/phút để tránh duyệt cả danh sách ở mỗi lần đăng nhập
function donDepNeuCan() {
  const bayGio = Date.now();
  if (bayGio - lanDonDepCuoi < 60 * 1000) return;
  lanDonDepCuoi = bayGio;
  donDepDanhSachLoi();
}

function ghiNhanLoiDangNhap(khoa) {
  const bayGio = Date.now();
  let lichSuLoi = danhSachDangNhapLoi.get(khoa);

  // Bắt đầu đếm lại nếu chưa có, hoặc bản ghi cũ đã hết hạn
  if (
    !lichSuLoi ||
    (thoiGianKhoaConLaiMs(lichSuLoi, bayGio) === 0 && bayGio - lichSuLoi.thoiDiemDauTien > THOI_GIAN_KHOA_TAM_MS)
  ) {
    lichSuLoi = { soLanLoi: 0, thoiDiemDauTien: bayGio, khoaDen: 0 };
  }

  lichSuLoi.soLanLoi += 1;
  if (lichSuLoi.soLanLoi >= SO_LAN_DANG_NHAP_SAI_TOI_DA) {
    lichSuLoi.khoaDen = bayGio + THOI_GIAN_KHOA_TAM_MS;
  }
  danhSachDangNhapLoi.set(khoa, lichSuLoi);
}

async function dangNhap(req, res) {
  try {
    const { tai_khoan, mat_khau } = req.body || {};
    const taiKhoanSach = String(tai_khoan ?? '').trim();
    const ipNguoiDung = req.ip || req.socket?.remoteAddress || 'khong-ro';
    const khoaKhoa = `${ipNguoiDung}_${taiKhoanSach.slice(0, DO_DAI_TAI_KHOAN_TOI_DA)}`;

    // Kiểm tra đang bị khóa
    donDepNeuCan();
    const msConKhoa = thoiGianKhoaConLaiMs(danhSachDangNhapLoi.get(khoaKhoa));
    if (msConKhoa > 0) {
      const phutConLai = Math.ceil(msConKhoa / 60000);
      return res.status(429).json({
        thanhCong: false,
        loi: `Bạn đã đăng nhập sai quá ${SO_LAN_DANG_NHAP_SAI_TOI_DA} lần liên tiếp. Vui lòng thử lại sau ${phutConLai} phút để bảo đảm an toàn.`
      });
    }

    if (!taiKhoanSach || !mat_khau) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Vui lòng cung cấp đầy đủ tài khoản và mật khẩu'
      });
    }

    if (taiKhoanSach.length > DO_DAI_TAI_KHOAN_TOI_DA) {
      ghiNhanLoiDangNhap(khoaKhoa);
      return res.status(401).json({ thanhCong: false, loi: THONG_BAO_LOI_DANG_NHAP });
    }

    const nguoiDung = await prisma.nguoi_dung.findUnique({
      where: { tai_khoan: taiKhoanSach }
    });

    // Luôn chạy bcrypt.compare (kể cả khi không có tài khoản) để thời gian phản hồi như nhau
    const maBamDeSoSanh = nguoiDung ? nguoiDung.mat_khau_hash : MA_BAM_GIA;
    const matKhauDung = await bcrypt.compare(String(mat_khau), maBamDeSoSanh);

    if (!nguoiDung || !matKhauDung) {
      ghiNhanLoiDangNhap(khoaKhoa);
      return res.status(401).json({ thanhCong: false, loi: THONG_BAO_LOI_DANG_NHAP });
    }

    if (!nguoiDung.trang_thai_hoat_dong) {
      return res.status(403).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.',
        thongBao: 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.',
        thong_bao: 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.'
      });
    }

    // Tài khoản định danh Sinh viên / Giảng viên trên Zalo không được đăng nhập Web Dashboard
    if (['SINH_VIEN', 'GIANG_VIEN'].includes(nguoiDung.vai_tro)) {
      return res.status(403).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Tài khoản này chỉ dùng để định danh báo hỏng trên Zalo Bot, không có quyền truy cập Web Dashboard.',
        thongBao: 'Tài khoản này chỉ dùng để định danh báo hỏng trên Zalo Bot, không có quyền truy cập Web Dashboard.',
        thong_bao: 'Tài khoản này chỉ dùng để định danh báo hỏng trên Zalo Bot, không có quyền truy cập Web Dashboard.'
      });
    }

    danhSachDangNhapLoi.delete(khoaKhoa);

    const payload = {
      ma_nguoi_dung: nguoiDung.ma_nguoi_dung,
      tai_khoan: nguoiDung.tai_khoan,
      ho_ten: nguoiDung.ho_ten,
      vai_tro: nguoiDung.vai_tro
    };

    const token = jwt.sign(payload, biMatJwt, { algorithm: 'HS256', expiresIn: THOI_HAN_TOKEN_GIAY });

    res.cookie('token', token, { ...TUY_CHON_COOKIE, maxAge: THOI_HAN_TOKEN_GIAY * 1000 });

    // Kiểm tra cờ bắt buộc đổi mật khẩu lần đầu
    const [banGhiDoiMk] = await prisma.$queryRawUnsafe(
      'SELECT "doi_mat_khau_lan_dau" FROM "public"."nguoi_dung" WHERE "ma_nguoi_dung" = $1',
      nguoiDung.ma_nguoi_dung
    ).catch(() => [{ doi_mat_khau_lan_dau: false }]);
    const doiMatKhauLanDau = Boolean(banGhiDoiMk?.doi_mat_khau_lan_dau);

    // KHÔNG trả token trong JSON: token chỉ nằm trong cookie HttpOnly
    return res.status(200).json({
      thanhCong: true,
      thongBao: 'Đăng nhập thành công',
      duLieu: {
        ma_nguoi_dung: nguoiDung.ma_nguoi_dung,
        tai_khoan: nguoiDung.tai_khoan,
        ho_ten: nguoiDung.ho_ten,
        email: nguoiDung.email,
        vai_tro: nguoiDung.vai_tro,
        doi_mat_khau_lan_dau: doiMatKhauLanDau
      }
    });
  } catch (loi) {
    console.error('❌ Lỗi đăng nhập:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ nội bộ' });
  }
}

async function dangXuat(req, res) {
  res.clearCookie('token', TUY_CHON_COOKIE);
  return res.status(200).json({
    thanhCong: true,
    thongBao: 'Đã đăng xuất tài khoản thành công'
  });
}

async function layThongTinCaNhan(req, res) {
  try {
    const maNguoiDung = req.nguoiDung.ma_nguoi_dung;
    const nguoiDung = await prisma.nguoi_dung.findUnique({
      where: { ma_nguoi_dung: maNguoiDung },
      select: {
        ma_nguoi_dung: true,
        tai_khoan: true,
        ho_ten: true,
        email: true,
        so_dien_thoai: true,
        vai_tro: true,
        chat_id_zalo: true,
        trang_thai_hoat_dong: true,
        thoi_gian_tao: true
      }
    });

    if (!nguoiDung) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy người dùng' });
    }

    // Tài khoản đã bị khóa sau khi cấp token: thu hồi cookie, buộc đăng nhập lại
    const { trang_thai_hoat_dong, ...thongTin } = nguoiDung;
    if (!trang_thai_hoat_dong) {
      res.clearCookie('token', TUY_CHON_COOKIE);
      return res.status(401).json({ thanhCong: false, loi: 'Tài khoản đã ngừng hoạt động' });
    }

    const [banGhiDoiMk] = await prisma.$queryRawUnsafe(
      'SELECT "doi_mat_khau_lan_dau" FROM "public"."nguoi_dung" WHERE "ma_nguoi_dung" = $1',
      maNguoiDung
    ).catch(() => [{ doi_mat_khau_lan_dau: false }]);
    thongTin.doi_mat_khau_lan_dau = Boolean(banGhiDoiMk?.doi_mat_khau_lan_dau);

    return res.status(200).json({ thanhCong: true, duLieu: thongTin });
  } catch (loi) {
    console.error('❌ Lỗi lấy thông tin cá nhân:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ nội bộ' });
  }
}

/**
 * 4. Tự đổi mật khẩu tài khoản cá nhân (Yêu cầu đăng nhập)
 * POST /api/xac-thuc/doi-mat-khau
 */
async function doiMatKhau(req, res) {
  try {
    const maNguoiDung = req.nguoiDung?.ma_nguoi_dung;
    if (!maNguoiDung) {
      return res.status(401).json({ thanhCong: false, loi: 'Chưa xác thực người dùng' });
    }

    const { mat_khau_hien_tai, mat_khau_moi, xac_nhan_mat_khau } = req.body || {};
    const mkHienTaiStr = String(mat_khau_hien_tai || '');
    const mkMoiStr = String(mat_khau_moi || '');
    const xacNhanStr = String(xac_nhan_mat_khau || '');

    if (!mkHienTaiStr || !mkMoiStr) {
      return res.status(400).json({ thanhCong: false, loi: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới' });
    }

    if (mkMoiStr.length < 6) {
      return res.status(400).json({ thanhCong: false, loi: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
    }

    if (xacNhanStr && mkMoiStr !== xacNhanStr) {
      return res.status(400).json({ thanhCong: false, loi: 'Mật khẩu xác nhận không khớp với mật khẩu mới' });
    }

    if (mkHienTaiStr === mkMoiStr) {
      return res.status(400).json({ thanhCong: false, loi: 'Mật khẩu mới không được trùng với mật khẩu hiện tại' });
    }

    const nguoiDung = await prisma.nguoi_dung.findUnique({
      where: { ma_nguoi_dung: maNguoiDung }
    });

    if (!nguoiDung) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy người dùng' });
    }

    const dungMatKhau = await bcrypt.compare(mkHienTaiStr, nguoiDung.mat_khau_hash);
    if (!dungMatKhau) {
      return res.status(400).json({ thanhCong: false, loi: 'Mật khẩu hiện tại không chính xác' });
    }

    const matKhauMoiHash = await bcrypt.hash(mkMoiStr, SO_VONG_BAM);
    await prisma.nguoi_dung.update({
      where: { ma_nguoi_dung: maNguoiDung },
      data: { mat_khau_hash: matKhauMoiHash }
    });

    // Cập nhật tắt cờ bắt buộc đổi mật khẩu lần đầu
    await prisma.$executeRawUnsafe(
      'UPDATE "public"."nguoi_dung" SET "doi_mat_khau_lan_dau" = false WHERE "ma_nguoi_dung" = $1',
      maNguoiDung
    ).catch(() => {});

    return res.status(200).json({
      thanhCong: true,
      thongBao: 'Đổi mật khẩu thành công'
    });
  } catch (loi) {
    console.error('❌ Lỗi đổi mật khẩu:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ nội bộ khi đổi mật khẩu' });
  }
}

/**
 * 5. Quên mật khẩu - Gửi mã xác thực OTP qua Gmail (Không bắt buộc đăng nhập)
 * POST /api/xac-thuc/quen-mat-khau
 */
async function quenMatKhau(req, res) {
  try {
    const { email } = req.body || {};
    const emailSach = String(email || '').trim().toLowerCase();

    if (!emailSach || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSach)) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Vui lòng cung cấp địa chỉ email hợp lệ'
      });
    }

    const nguoiDung = await prisma.nguoi_dung.findFirst({
      where: {
        email: {
          equals: emailSach,
          mode: 'insensitive'
        }
      }
    });

    if (!nguoiDung) {
      return res.status(404).json({
        thanhCong: false,
        loi: 'Email này chưa được liên kết với bất kỳ tài khoản nhân sự nào trong hệ thống'
      });
    }

    if (!nguoiDung.trang_thai_hoat_dong) {
      return res.status(403).json({
        thanhCong: false,
        loi: 'Tài khoản của bạn đã bị khóa, không thể khôi phục mật khẩu. Vui lòng liên hệ Quản trị viên'
      });
    }

    // Kiểm tra giới hạn 60 giây chống spam
    const gioiHan = kiemTraGioiHanGuiOtp(emailSach);
    if (!gioiHan.duocPhep) {
      return res.status(429).json({
        thanhCong: false,
        loi: `Vui lòng đợi ${gioiHan.soGiayConLai} giây trước khi yêu cầu gửi lại mã OTP mới.`
      });
    }

    const maOtp = taoVaLuuOtp(emailSach, 6);
    const ketQuaGuiMail = await guiEmailOtp(emailSach, nguoiDung.ho_ten, maOtp);

    let thongBao = 'Mã xác thực OTP gồm 6 chữ số đã được gửi đến hộp thư của bạn (hiệu lực 5 phút)';
    if (ketQuaGuiMail?.cheDoFallback) {
      thongBao = ketQuaGuiMail.thongBao || 'Mã xác thực OTP đã được tạo! (Lưu ý: Do Render chặn cổng SMTP, mã OTP đã được ghi vào Render Logs).';
    }

    const ketQuaPhanHoi = {
      thanhCong: true,
      thongBao,
      cheDoFallback: Boolean(ketQuaGuiMail?.cheDoFallback)
    };

    // Nếu cấu hình ALLOW_OTP_DEV_DISPLAY=true hoặc chạy chế độ fallback trên Render (khi chưa cấu hình Brevo)
    if (process.env.ALLOW_OTP_DEV_DISPLAY === 'true' || (ketQuaGuiMail?.cheDoFallback && process.env.ALLOW_OTP_DEV_DISPLAY !== 'false')) {
      ketQuaPhanHoi.maOtpThuNghiem = maOtp;
    }

    return res.status(200).json(ketQuaPhanHoi);
  } catch (loi) {
    console.error('❌ Lỗi xử lý quên mật khẩu:', loi);
    return res.status(500).json({
      thanhCong: false,
      loi: loi.message || 'Lỗi máy chủ nội bộ khi xử lý gửi mã OTP'
    });
  }
}

/**
 * 5.1. Xác thực mã OTP ở Bước 2 (Chỉ nhập mã OTP, xác thực thành công mới sang Bước 3 đặt mật khẩu)
 * POST /api/xac-thuc/kiem-tra-otp
 */
async function kiemTraOtp(req, res) {
  try {
    const { email, otp } = req.body || {};
    const emailSach = String(email || '').trim().toLowerCase();
    const otpSach = String(otp || '').trim();

    if (!emailSach || !otpSach) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Vui lòng cung cấp email và mã OTP'
      });
    }

    if (!/^\d{6}$/.test(otpSach)) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Mã OTP phải gồm đúng 6 chữ số'
      });
    }

    const ketQua = xacNhanOtpCapToken(emailSach, otpSach);
    if (!ketQua.hopLe) {
      return res.status(400).json({
        thanhCong: false,
        loi: ketQua.thongBao || 'Mã OTP không hợp lệ'
      });
    }

    return res.status(200).json({
      thanhCong: true,
      thongBao: 'Xác thực mã OTP thành công!',
      token_dat_lai: ketQua.tokenDatLai
    });
  } catch (loi) {
    console.error('❌ Lỗi kiểm tra OTP:', loi);
    return res.status(500).json({
      thanhCong: false,
      loi: 'Lỗi máy chủ nội bộ khi kiểm tra mã OTP'
    });
  }
}

/**
 * 6. Đặt lại mật khẩu mới ở Bước 3 (Hỗ trợ token_dat_lai từ bước 2 hoặc otp trực tiếp)
 * POST /api/xac-thuc/dat-lai-mat-khau
 */
async function datLaiMatKhau(req, res) {
  try {
    const { email, otp, token_dat_lai, mat_khau_moi } = req.body || {};
    const emailSach = String(email || '').trim().toLowerCase();
    const otpSach = String(otp || '').trim();
    const tokenDatLaiSach = String(token_dat_lai || '').trim();
    const mkMoiSach = String(mat_khau_moi || '');

    if (!emailSach || (!otpSach && !tokenDatLaiSach) || !mkMoiSach) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Vui lòng điền đầy đủ thông tin xác thực và mật khẩu mới'
      });
    }

    if (mkMoiSach.length < 6) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Mật khẩu mới phải có tối thiểu 6 ký tự'
      });
    }

    // 1. Nếu có token_dat_lai từ Bước 2: Xác thực token
    if (tokenDatLaiSach) {
      const kqToken = xacThucTokenDatLai(emailSach, tokenDatLaiSach);
      if (!kqToken.hopLe) {
        return res.status(400).json({
          thanhCong: false,
          loi: kqToken.thongBao || 'Phiên xác thực không hợp lệ hoặc đã hết hạn'
        });
      }
    } else {
      // 2. Nếu gửi trực tiếp OTP: Xác thực mã OTP 6 số
      if (!/^\d{6}$/.test(otpSach)) {
        return res.status(400).json({
          thanhCong: false,
          loi: 'Mã OTP phải gồm đúng 6 chữ số'
        });
      }

      const ketQuaOtp = xacThucMaOtp(emailSach, otpSach);
      if (!ketQuaOtp.hopLe) {
        return res.status(400).json({
          thanhCong: false,
          loi: ketQuaOtp.thongBao || 'Mã OTP không hợp lệ hoặc đã hết hạn'
        });
      }
    }

    const nguoiDung = await prisma.nguoi_dung.findFirst({
      where: {
        email: {
          equals: emailSach,
          mode: 'insensitive'
        }
      }
    });

    if (!nguoiDung) {
      return res.status(404).json({
        thanhCong: false,
        loi: 'Không tìm thấy tài khoản người dùng'
      });
    }

    if (!nguoiDung.trang_thai_hoat_dong) {
      return res.status(403).json({
        thanhCong: false,
        loi: 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động'
      });
    }

    const matKhauHashMoi = await bcrypt.hash(mkMoiSach, SO_VONG_BAM);
    await prisma.nguoi_dung.update({
      where: { ma_nguoi_dung: nguoiDung.ma_nguoi_dung },
      data: {
        mat_khau_hash: matKhauHashMoi
      }
    });

    // Cập nhật tắt cờ bắt buộc đổi mật khẩu lần đầu (để không bị bắt đổi lại lần nữa)
    await prisma.$executeRawUnsafe(
      'UPDATE "public"."nguoi_dung" SET "doi_mat_khau_lan_dau" = false WHERE "ma_nguoi_dung" = $1',
      nguoiDung.ma_nguoi_dung
    ).catch(() => {});

    return res.status(200).json({
      thanhCong: true,
      thongBao: 'Đặt lại mật khẩu mới thành công! Vui lòng đăng nhập lại.'
    });
  } catch (loi) {
    console.error('❌ Lỗi đặt lại mật khẩu bằng OTP:', loi);
    return res.status(500).json({
      thanhCong: false,
      loi: 'Lỗi máy chủ nội bộ khi đặt lại mật khẩu'
    });
  }
}

module.exports = {
  dangNhap,
  dangXuat,
  layThongTinCaNhan,
  doiMatKhau,
  quenMatKhau,
  kiemTraOtp,
  datLaiMatKhau,
  danhSachDangNhapLoi,
  ghiNhanLoiDangNhap,
  SO_LAN_DANG_NHAP_SAI_TOI_DA
};
