// src/controllers/nguoiDungDieuKhien.js - Quản lý nhân sự KTV và Admin (Phân hệ Quản trị)
const bcrypt = require('bcrypt');
const prisma = require('../config/coSoDuLieu');
const { boDau } = require('../utils/tienIch');

const SO_VONG_BAM = 10;
const VAI_TRO_HOP_LE = ['ADMIN', 'KTV', 'KY_THUAT_VIEN', 'GIANG_VIEN', 'SINH_VIEN', 'NOI_BO', 'TAT_CA', 'NGUOI_BAO_HONG'];

// Trường cần select để ẩn mật khẩu hash an toàn 100%
const SELECT_NGUOI_DUNG_AN_TOAN = {
  ma_nguoi_dung: true,
  tai_khoan: true,
  ho_ten: true,
  email: true,
  so_dien_thoai: true,
  vai_tro: true,
  chat_id_zalo: true,
  trang_thai_hoat_dong: true,
  thoi_gian_tao: true
};

/**
 * 1. Lấy danh sách nhân sự & người dùng (Admin Only) - Hỗ trợ lọc đa trường & tìm kiếm tức thời
 * GET /api/nguoi-dung?tu_khoa=nhut&vai_tro=KTV&trang_thai=HOAT_DONG
 */
async function layDanhSachNguoiDung(req, res) {
  try {
    const { vai_tro, trang_thai_hoat_dong, tu_khoa, tim_kiem, search, trang_thai } = req.query || {};
    const where = {};

    const vaiTroLoc = String(vai_tro || '').toUpperCase().trim();
    if (vaiTroLoc && vaiTroLoc !== 'TAT_CA') {
      if (vaiTroLoc === 'NOI_BO') {
        where.vai_tro = { in: ['ADMIN', 'KTV', 'KY_THUAT_VIEN'] };
      } else if (vaiTroLoc === 'KTV' || vaiTroLoc === 'KY_THUAT_VIEN') {
        where.vai_tro = { in: ['KTV', 'KY_THUAT_VIEN'] };
      } else if (['ADMIN', 'GIANG_VIEN', 'SINH_VIEN'].includes(vaiTroLoc)) {
        where.vai_tro = vaiTroLoc;
      } else if (vaiTroLoc === 'NGUOI_BAO_HONG') {
        where.vai_tro = { in: ['GIANG_VIEN', 'SINH_VIEN'] };
      } else {
        return res.status(400).json({ thanhCong: false, loi: 'Vai trò lọc không hợp lệ' });
      }
    }

    const trangThaiLoc = String(trang_thai || '').toUpperCase().trim();
    if (trangThaiLoc === 'HOAT_DONG' || trang_thai_hoat_dong === 'true' || trang_thai_hoat_dong === true) {
      where.trang_thai_hoat_dong = true;
    } else if (trangThaiLoc === 'DA_KHOA' || trang_thai_hoat_dong === 'false' || trang_thai_hoat_dong === false) {
      where.trang_thai_hoat_dong = false;
    }

    const danhSach = await prisma.nguoi_dung.findMany({
      where,
      orderBy: { ma_nguoi_dung: 'asc' },
      select: SELECT_NGUOI_DUNG_AN_TOAN
    });

    // Tìm kiếm đa trường (Multi-field Search): Họ tên, Tài khoản, Email, SĐT, Zalo ID, Vai trò
    const tuKhoaRaw = String(tu_khoa || tim_kiem || search || '').trim();
    let ketQuaCuoi = danhSach;
    if (tuKhoaRaw) {
      const tuKhoaKd = boDau(tuKhoaRaw).toLowerCase();
      ketQuaCuoi = danhSach.filter((nd) => {
        const hoTenKd = boDau(nd.ho_ten || '').toLowerCase();
        const taiKhoanKd = boDau(nd.tai_khoan || '').toLowerCase();
        const emailKd = boDau(nd.email || '').toLowerCase();
        const sdtKd = boDau(nd.so_dien_thoai || '').toLowerCase();
        const zaloKd = boDau(nd.chat_id_zalo || '').toLowerCase();
        const vaiTroKd = boDau(nd.vai_tro || '').toLowerCase();

        return (
          hoTenKd.includes(tuKhoaKd) ||
          taiKhoanKd.includes(tuKhoaKd) ||
          emailKd.includes(tuKhoaKd) ||
          sdtKd.includes(tuKhoaKd) ||
          zaloKd.includes(tuKhoaKd) ||
          vaiTroKd.includes(tuKhoaKd)
        );
      });
    }

    return res.status(200).json({
      thanhCong: true,
      thanh_cong: true,
      tongSo: ketQuaCuoi.length,
      duLieu: ketQuaCuoi,
      du_lieu: ketQuaCuoi
    });
  } catch (loi) {
    console.error('❌ Lỗi lấy danh sách nhân sự:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi lấy danh sách nhân sự' });
  }
}

/**
 * 2. Tạo nhân sự mới (Admin Only)
 * POST /api/nguoi-dung
 */
async function taoNguoiDung(req, res) {
  try {
    const { tai_khoan, mat_khau, ho_ten, email, so_dien_thoai, vai_tro, chat_id_zalo } = req.body || {};

    const taiKhoanSach = String(tai_khoan || '').trim();
    const hoTenSach = String(ho_ten || '').trim();
    const vaiTroSach = String(vai_tro || '').toUpperCase().trim();
    const matKhauSach = String(mat_khau || '');

    // Kiểm tra các trường bắt buộc
    if (!taiKhoanSach) {
      return res.status(400).json({ thanhCong: false, loi: 'Tài khoản không được để trống' });
    }
    if (taiKhoanSach.length > 50) {
      return res.status(400).json({ thanhCong: false, loi: 'Tài khoản tối đa 50 ký tự' });
    }
    // Mật khẩu mặc định là tvu123 nếu không truyền hoặc để trống
    const matKhauCuoiCung = matKhauSach || 'tvu123';
    if (matKhauCuoiCung.length < 6) {
      return res.status(400).json({ thanhCong: false, loi: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }
    if (!hoTenSach) {
      return res.status(400).json({ thanhCong: false, loi: 'Họ tên không được để trống' });
    }
    if (!VAI_TRO_HOP_LE.includes(vaiTroSach)) {
      return res.status(400).json({ thanhCong: false, loi: 'Vai trò phải là ADMIN hoặc KTV' });
    }

    // Ràng buộc số điện thoại: Bắt buộc, đúng 10 chữ số và bắt đầu bằng số 0
    const sdtSach = String(so_dien_thoai || '').trim();
    if (!sdtSach) {
      return res.status(400).json({ thanhCong: false, loi: 'Số điện thoại không được để trống' });
    }
    if (!/^0[0-9]{9}$/.test(sdtSach)) {
      return res.status(400).json({ thanhCong: false, loi: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0' });
    }

    // Kiểm tra trùng tài khoản
    const nguoiDungCu = await prisma.nguoi_dung.findUnique({
      where: { tai_khoan: taiKhoanSach }
    });
    if (nguoiDungCu) {
      return res.status(409).json({ thanhCong: false, loi: 'Tài khoản đã tồn tại trong hệ thống' });
    }

    // Băm mật khẩu (mặc định tvu123 nếu để trống)
    const matKhauHash = await bcrypt.hash(matKhauCuoiCung, SO_VONG_BAM);

    const nguoiDungMoi = await prisma.nguoi_dung.create({
      data: {
        tai_khoan: taiKhoanSach,
        mat_khau_hash: matKhauHash,
        ho_ten: hoTenSach.slice(0, 100),
        email: email ? String(email).trim().slice(0, 100) : null,
        so_dien_thoai: sdtSach,
        vai_tro: vaiTroSach,
        chat_id_zalo: chat_id_zalo ? String(chat_id_zalo).trim().slice(0, 50) : null,
        trang_thai_hoat_dong: true
      },
      select: SELECT_NGUOI_DUNG_AN_TOAN
    });

    // Đánh dấu bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên
    await prisma.$executeRawUnsafe(
      'UPDATE "public"."nguoi_dung" SET "doi_mat_khau_lan_dau" = true WHERE "ma_nguoi_dung" = $1',
      nguoiDungMoi.ma_nguoi_dung
    ).catch(() => {});

    return res.status(201).json({
      thanhCong: true,
      thanh_cong: true,
      thongBao: 'Tạo tài khoản nhân sự thành công',
      duLieu: nguoiDungMoi,
      du_lieu: nguoiDungMoi
    });
  } catch (loi) {
    console.error('❌ Lỗi tạo nhân sự mới:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi tạo tài khoản nhân sự' });
  }
}

/**
 * 3. Cập nhật thông tin nhân sự & đặt lại mật khẩu (Admin Only)
 * PUT /api/nguoi-dung/:id
 */
async function capNhatNguoiDung(req, res) {
  try {
    const maNguoiDung = parseInt(req.params.id, 10);
    if (!maNguoiDung || Number.isNaN(maNguoiDung)) {
      return res.status(400).json({ thanhCong: false, loi: 'Mã người dùng không hợp lệ' });
    }

    const nguoiDungHienTai = await prisma.nguoi_dung.findUnique({
      where: { ma_nguoi_dung: maNguoiDung }
    });
    if (!nguoiDungHienTai) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy người dùng' });
    }

    const { ho_ten, email, so_dien_thoai, vai_tro, chat_id_zalo, mat_khau_moi } = req.body || {};
    const duLieuCapNhat = {};

    // Chốt chặn: Không cho Admin tự hạ quyền của chính mình
    if (maNguoiDung === req.nguoiDung?.ma_nguoi_dung) {
      if (vai_tro && vai_tro.toUpperCase() !== 'ADMIN') {
        return res.status(400).json({ thanhCong: false, loi: 'Không thể tự hạ quyền của chính mình' });
      }
    }

    if (ho_ten !== undefined) {
      const hoTenSach = String(ho_ten).trim();
      if (!hoTenSach) {
        return res.status(400).json({ thanhCong: false, loi: 'Họ tên không được để trống' });
      }
      duLieuCapNhat.ho_ten = hoTenSach.slice(0, 100);
    }

    if (email !== undefined) {
      duLieuCapNhat.email = email ? String(email).trim().slice(0, 100) : null;
    }

    if (so_dien_thoai !== undefined) {
      const sdtSach = String(so_dien_thoai || '').trim();
      if (!sdtSach) {
        return res.status(400).json({ thanhCong: false, loi: 'Số điện thoại không được để trống' });
      }
      if (!/^0[0-9]{9}$/.test(sdtSach)) {
        return res.status(400).json({ thanhCong: false, loi: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0' });
      }
      duLieuCapNhat.so_dien_thoai = sdtSach;
    }

    if (vai_tro !== undefined) {
      const vaiTroSach = String(vai_tro).toUpperCase().trim();
      if (!VAI_TRO_HOP_LE.includes(vaiTroSach)) {
        return res.status(400).json({ thanhCong: false, loi: 'Vai trò phải là ADMIN hoặc KTV' });
      }
      duLieuCapNhat.vai_tro = vaiTroSach;
    }

    if (chat_id_zalo !== undefined) {
      duLieuCapNhat.chat_id_zalo = chat_id_zalo ? String(chat_id_zalo).trim().slice(0, 50) : null;
    }

    // Đặt lại mật khẩu mới nếu được cung cấp
    if (mat_khau_moi !== undefined && mat_khau_moi !== null && String(mat_khau_moi).trim() !== '') {
      const matKhauMoiStr = String(mat_khau_moi);
      if (matKhauMoiStr.length < 6) {
        return res.status(400).json({ thanhCong: false, loi: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      }
      duLieuCapNhat.mat_khau_hash = await bcrypt.hash(matKhauMoiStr, SO_VONG_BAM);
    }

    const nguoiDungDaSua = await prisma.nguoi_dung.update({
      where: { ma_nguoi_dung: maNguoiDung },
      data: duLieuCapNhat,
      select: SELECT_NGUOI_DUNG_AN_TOAN
    });

    return res.status(200).json({
      thanhCong: true,
      thanh_cong: true,
      thongBao: 'Cập nhật thông tin nhân sự thành công',
      duLieu: nguoiDungDaSua,
      du_lieu: nguoiDungDaSua
    });
  } catch (loi) {
    console.error('❌ Lỗi cập nhật nhân sự:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi cập nhật thông tin nhân sự' });
  }
}

/**
 * 4. Khóa hoặc Mở khóa tài khoản nhân sự (Admin Only)
 * PATCH /api/nguoi-dung/:id/trang-thai
 */
async function doiTrangThaiNguoiDung(req, res) {
  try {
    const maNguoiDung = parseInt(req.params.id, 10);
    if (!maNguoiDung || Number.isNaN(maNguoiDung)) {
      return res.status(400).json({ thanhCong: false, loi: 'Mã người dùng không hợp lệ' });
    }

    // Chốt chặn an toàn tuyệt đối: Không cho Admin tự khóa tài khoản của chính mình
    if (maNguoiDung === req.nguoiDung?.ma_nguoi_dung) {
      return res.status(400).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Không thể tự khóa tài khoản của chính mình',
        thongBao: 'Không thể tự khóa tài khoản của chính mình',
        thong_bao: 'Không thể tự khóa tài khoản của chính mình'
      });
    }

    const { trang_thai_hoat_dong } = req.body || {};
    if (typeof trang_thai_hoat_dong !== 'boolean') {
      return res.status(400).json({ thanhCong: false, loi: 'Trạng thái hoạt động phải là kiểu boolean (true/false)' });
    }

    const nguoiDungHienTai = await prisma.nguoi_dung.findUnique({
      where: { ma_nguoi_dung: maNguoiDung }
    });
    if (!nguoiDungHienTai) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy người dùng' });
    }

    const nguoiDungDaCapNhat = await prisma.nguoi_dung.update({
      where: { ma_nguoi_dung: maNguoiDung },
      data: { trang_thai_hoat_dong },
      select: SELECT_NGUOI_DUNG_AN_TOAN
    });

    const hanhDong = trang_thai_hoat_dong ? 'Mở khóa' : 'Khóa';
    return res.status(200).json({
      thanhCong: true,
      thanh_cong: true,
      thongBao: `${hanhDong} tài khoản thành công`,
      duLieu: nguoiDungDaCapNhat,
      du_lieu: nguoiDungDaCapNhat
    });
  } catch (loi) {
    console.error('❌ Lỗi thay đổi trạng thái nhân sự:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi thay đổi trạng thái nhân sự' });
  }
}

module.exports = {
  layDanhSachNguoiDung,
  taoNguoiDung,
  capNhatNguoiDung,
  doiTrangThaiNguoiDung
};
