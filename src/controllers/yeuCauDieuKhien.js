// src/controllers/yeuCauDieuKhien.js - Quản lý nghiệp vụ yêu cầu báo hỏng (REST API)
const prisma = require('../config/coSoDuLieu');
const { guiTinNhanZalo } = require('../services/zaloDichVu');
const { dinhDangTrangThai, kiemTraChuyenTrangThai } = require('../utils/tienIch');

const TRANG_THAI_HOP_LE = ['CHO_XU_LY', 'DANG_XU_LY', 'HOAN_THANH', 'HUY'];
const MUC_DO_UU_TIEN_HOP_LE = ['KHAN_CAP', 'CAO', 'BINH_THUONG', 'THAP'];

/**
 * Tạo điều kiện tìm kiếm yêu cầu theo ID số hoặc mã dạng #YC...
 * - Nhận ID số nguyên (1–9 chữ số)
 * - Nhận mã có hoặc không có '#', hoặc dạng đã mã hóa (%23)
 * - Giá trị lạ → trả điều kiện không khớp (-1) để API trả 404, không gây lỗi 500
 */
function taoDieuKienTimKiemYeuCau(idParam) {
  const KHONG_TIM_THAY = { ma_yeu_cau_bao_hong: -1 };
  if (idParam === undefined || idParam === null) return KHONG_TIM_THAY;

  let chuoiId = String(idParam).trim();

  // Express đã giải mã 1 lần; chỉ giải mã thêm nếu còn dạng %XX, và không để ném lỗi
  if (/%[0-9a-fA-F]{2}/.test(chuoiId)) {
    try {
      chuoiId = decodeURIComponent(chuoiId);
    } catch (loi) {
      return KHONG_TIM_THAY;
    }
  }

  if (/^\d{1,9}$/.test(chuoiId)) {
    return { ma_yeu_cau_bao_hong: parseInt(chuoiId, 10) };
  }

  const maChuan = (chuoiId.startsWith('#') ? chuoiId : `#${chuoiId}`).toUpperCase();
  if (!/^#YC\d{1,17}$/.test(maChuan)) return KHONG_TIM_THAY;

  return { ma_yeu_cau: maChuan };
}

/**
 * Đọc khóa ngoại gửi lên: null/'' → null; số nguyên 1–9 chữ số → số; còn lại → không hợp lệ
 */
function docMaKhoaNgoai(giaTri) {
  if (giaTri === null || giaTri === '') return { hopLe: true, giaTri: null };
  if (/^\d{1,9}$/.test(String(giaTri))) return { hopLe: true, giaTri: parseInt(giaTri, 10) };
  return { hopLe: false };
}

/**
 * Đọc ngày dạng YYYY-MM-DD theo giờ Việt Nam (+07:00), không phụ thuộc múi giờ máy chủ.
 * Trả null nếu sai định dạng.
 */
function docNgayVietNam(chuoi, cuoiNgay) {
  const giaTri = String(chuoi).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giaTri)) return null;
  const ngay = new Date(`${giaTri}T${cuoiNgay ? '23:59:59.999' : '00:00:00.000'}+07:00`);
  return Number.isNaN(ngay.getTime()) ? null : ngay;
}

function taoLoiXungDot() {
  const loi = new Error('XUNG_DOT');
  loi.maLoi = 'XUNG_DOT';
  return loi;
}

async function layDanhSachYeuCau(req, res) {
  try {
    const {
      trang = 1,
      so_luong = 20,
      trang_thai,
      phong,
      tu_ngay,
      den_ngay,
      tu_khoa,
      cua_toi
    } = req.query;

    const soLuongTrang = Math.min(Math.max(parseInt(so_luong) || 20, 1), 1000);
    const trangHienTai = Math.max(parseInt(trang) || 1, 1);
    const boQua = (trangHienTai - 1) * soLuongTrang;

    const dieuKienLoc = {};

    if (trang_thai) {
      if (!TRANG_THAI_HOP_LE.includes(trang_thai)) {
        return res.status(400).json({ thanhCong: false, loi: 'Trạng thái lọc không hợp lệ' });
      }
      dieuKienLoc.trang_thai = trang_thai;
    }

    if (phong) {
      if (/^\d{1,9}$/.test(String(phong))) {
        dieuKienLoc.ma_phong = parseInt(phong, 10);
      } else {
        dieuKienLoc.vi_tri_phong = { contains: String(phong).slice(0, 100), mode: 'insensitive' };
      }
    }

    if (tu_ngay || den_ngay) {
      dieuKienLoc.thoi_gian_tao = {};
      if (tu_ngay) {
        const ngayBatDau = docNgayVietNam(tu_ngay, false);
        if (!ngayBatDau) {
          return res.status(400).json({ thanhCong: false, loi: 'Ngày bắt đầu phải có dạng YYYY-MM-DD' });
        }
        dieuKienLoc.thoi_gian_tao.gte = ngayBatDau;
      }
      if (den_ngay) {
        const ngayKetThuc = docNgayVietNam(den_ngay, true);
        if (!ngayKetThuc) {
          return res.status(400).json({ thanhCong: false, loi: 'Ngày kết thúc phải có dạng YYYY-MM-DD' });
        }
        dieuKienLoc.thoi_gian_tao.lte = ngayKetThuc;
      }
    }

    if (tu_khoa) {
      const tuKhoaTimKiem = String(tu_khoa).trim().slice(0, 100);
      dieuKienLoc.OR = [
        { ma_yeu_cau: { contains: tuKhoaTimKiem, mode: 'insensitive' } },
        { ten_thiet_bi: { contains: tuKhoaTimKiem, mode: 'insensitive' } },
        { mo_ta_loi: { contains: tuKhoaTimKiem, mode: 'insensitive' } }
      ];
    }

    if (cua_toi === 'true' && req.nguoiDung) {
      dieuKienLoc.ma_ky_thuat_vien = req.nguoiDung.ma_nguoi_dung;
    }

    const [tongSo, danhSach] = await Promise.all([
      prisma.yeu_cau_bao_hong.count({ where: dieuKienLoc }),
      prisma.yeu_cau_bao_hong.findMany({
        where: dieuKienLoc,
        skip: boQua,
        take: soLuongTrang,
        orderBy: { thoi_gian_tao: 'desc' },
        include: {
          ky_thuat_vien: {
            select: { ma_nguoi_dung: true, ho_ten: true, email: true, so_dien_thoai: true }
          },
          danh_muc: true,
          phong_hoc: true
        }
      })
    ]);

    return res.status(200).json({
      thanhCong: true,
      tongSo,
      trang: trangHienTai,
      soTrang: Math.ceil(tongSo / soLuongTrang) || 1,
      soLuong: soLuongTrang,
      duLieu: danhSach
    });
  } catch (loi) {
    console.error('❌ Lỗi lấy danh sách yêu cầu:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi lấy danh sách yêu cầu' });
  }
}

async function layChiTietYeuCau(req, res) {
  try {
    const whereClause = taoDieuKienTimKiemYeuCau(req.params.id || req.query.ma_yeu_cau);

    const yeuCau = await prisma.yeu_cau_bao_hong.findFirst({
      where: whereClause,
      include: {
        ky_thuat_vien: {
          select: { ma_nguoi_dung: true, ho_ten: true, email: true, so_dien_thoai: true }
        },
        danh_muc: true,
        phong_hoc: true,
        lich_su_xu_ly: {
          orderBy: { thoi_gian_ghi: 'asc' }
        }
      }
    });

    if (!yeuCau) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy yêu cầu báo hỏng' });
    }

    return res.status(200).json({ thanhCong: true, duLieu: yeuCau });
  } catch (loi) {
    console.error('❌ Lỗi lấy chi tiết yêu cầu:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi lấy chi tiết yêu cầu' });
  }
}

async function capNhatTrangThaiYeuCau(req, res) {
  try {
    const { trang_thai_moi, ghi_chu_ket_qua } = req.body;
    const nguoiThaoTac = req.nguoiDung;

    if (!trang_thai_moi) {
      return res.status(400).json({ thanhCong: false, loi: 'Vui lòng cung cấp trạng thái mới' });
    }

    const whereClause = taoDieuKienTimKiemYeuCau(req.params.id || req.query.ma_yeu_cau);

    const yeuCauHienTai = await prisma.yeu_cau_bao_hong.findFirst({
      where: whereClause,
      include: { ky_thuat_vien: true }
    });

    if (!yeuCauHienTai) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy yêu cầu cần cập nhật' });
    }

    const hopLe = kiemTraChuyenTrangThai(yeuCauHienTai.trang_thai, trang_thai_moi);
    if (!hopLe) {
      return res.status(400).json({
        thanhCong: false,
        loi: `Không thể chuyển trạng thái từ [${dinhDangTrangThai(yeuCauHienTai.trang_thai)}] sang [${dinhDangTrangThai(trang_thai_moi)}]`
      });
    }

    if (nguoiThaoTac.vai_tro !== 'ADMIN') {
      if (yeuCauHienTai.ma_ky_thuat_vien && yeuCauHienTai.ma_ky_thuat_vien !== nguoiThaoTac.ma_nguoi_dung) {
        return res.status(403).json({
          thanhCong: false,
          loi: 'Yêu cầu này đang được phân công cho kỹ thuật viên khác xử lý'
        });
      }
    }

    if ((trang_thai_moi === 'HOAN_THANH' || trang_thai_moi === 'HUY') && !ghi_chu_ket_qua) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Vui lòng nhập ghi chú kết quả xử lý trước khi hoàn thành hoặc hủy yêu cầu'
      });
    }

    const duLieuCapNhat = { trang_thai: trang_thai_moi };
    if (ghi_chu_ket_qua) duLieuCapNhat.ghi_chu_ket_qua = String(ghi_chu_ket_qua).trim();

    if (trang_thai_moi === 'DANG_XU_LY') {
      duLieuCapNhat.thoi_gian_tiep_nhan = new Date();
      if (!yeuCauHienTai.ma_ky_thuat_vien) duLieuCapNhat.ma_ky_thuat_vien = nguoiThaoTac.ma_nguoi_dung;
    } else if (trang_thai_moi === 'HOAN_THANH') {
      duLieuCapNhat.thoi_gian_hoan_thanh = new Date();
    }

    const ketQua = await prisma.$transaction(async (tx) => {
      // Cập nhật CÓ ĐIỀU KIỆN: chỉ thành công nếu trạng thái và người phụ trách vẫn như lúc kiểm tra.
      // Nếu có người khác vừa cập nhật xong thì count = 0 → báo xung đột, không ghi đè.
      const ketQuaCapNhat = await tx.yeu_cau_bao_hong.updateMany({
        where: {
          ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong,
          trang_thai: yeuCauHienTai.trang_thai,
          ma_ky_thuat_vien: yeuCauHienTai.ma_ky_thuat_vien
        },
        data: duLieuCapNhat
      });

      if (ketQuaCapNhat.count === 0) throw taoLoiXungDot();

      await tx.lich_su_xu_ly.create({
        data: {
          ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong,
          trang_thai: trang_thai_moi,
          nguoi_thuc_hien: nguoiThaoTac.ho_ten || 'Kỹ thuật viên',
          ghi_chu: ghi_chu_ket_qua || `Chuyển trạng thái sang ${dinhDangTrangThai(trang_thai_moi)}`
        }
      });

      return tx.yeu_cau_bao_hong.findUnique({
        where: { ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong },
        include: { ky_thuat_vien: true }
      });
    });

    if (yeuCauHienTai.ma_nguoi_bao_zalo) {
      let tenNguoiPhuTrach = ketQua.ky_thuat_vien ? ketQua.ky_thuat_vien.ho_ten : nguoiThaoTac.ho_ten;

      if (!ketQua.ky_thuat_vien && (nguoiThaoTac.vai_tro === 'ADMIN' || /admin|quản trị/i.test(tenNguoiPhuTrach))) {
        tenNguoiPhuTrach = 'Quản trị';
      } else if (/admin|quản trị/i.test(tenNguoiPhuTrach)) {
        tenNguoiPhuTrach = 'Quản trị';
      } else {
        tenNguoiPhuTrach = tenNguoiPhuTrach.replace(/\s*\([^)]*\)/g, '').trim();
      }

      const ghiChuZalo = ghi_chu_ket_qua ? `\n• Ghi chú: ${ghi_chu_ket_qua}` : '';

      guiTinNhanZalo(
        yeuCauHienTai.ma_nguoi_bao_zalo,
        `🛎️ CẬP NHẬT TIẾN ĐỘ XỬ LÝ\n\n` +
        `• Mã yêu cầu: ${ketQua.ma_yeu_cau}\n` +
        `• Thiết bị: ${ketQua.ten_thiet_bi}\n` +
        `• Trạng thái mới: ${dinhDangTrangThai(trang_thai_moi)}\n` +
        `• Người phụ trách: ${tenNguoiPhuTrach}${ghiChuZalo}`
      ).catch((loiZalo) => console.error('⚠️ Không thể gửi tin Zalo thông báo:', loiZalo.message));
    }

    return res.status(200).json({
      thanhCong: true,
      thongBao: `Đã cập nhật trạng thái yêu cầu sang: ${dinhDangTrangThai(trang_thai_moi)}`,
      duLieu: ketQua
    });
  } catch (loi) {
    if (loi.maLoi === 'XUNG_DOT') {
      return res.status(409).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Yêu cầu vừa được người khác cập nhật, vui lòng tải lại danh sách rồi thử lại',
        thong_bao: 'Yêu cầu vừa được người khác cập nhật, vui lòng tải lại danh sách rồi thử lại'
      });
    }
    console.error('❌ Lỗi cập nhật trạng thái:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi cập nhật trạng thái' });
  }
}

async function phanCongYeuCau(req, res) {
  try {
    const { ma_ky_thuat_vien } = req.body;

    if (!ma_ky_thuat_vien || !/^\d{1,9}$/.test(String(ma_ky_thuat_vien))) {
      return res.status(400).json({ thanhCong: false, loi: 'Vui lòng chọn kỹ thuật viên được phân công' });
    }

    const ktv = await prisma.nguoi_dung.findUnique({
      where: { ma_nguoi_dung: parseInt(ma_ky_thuat_vien, 10) }
    });

    if (!ktv) {
      return res.status(400).json({ thanhCong: false, loi: 'Kỹ thuật viên không tồn tại' });
    }

    if (!ktv.trang_thai_hoat_dong) {
      return res.status(400).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Không thể phân công cho kỹ thuật viên đang bị khóa tài khoản.',
        thongBao: 'Không thể phân công cho kỹ thuật viên đang bị khóa tài khoản.',
        thong_bao: 'Không thể phân công cho kỹ thuật viên đang bị khóa tài khoản.'
      });
    }

    if (ktv.vai_tro !== 'KTV') {
      return res.status(400).json({ thanhCong: false, loi: 'Kỹ thuật viên không tồn tại hoặc đã ngừng hoạt động' });
    }

    const whereClause = taoDieuKienTimKiemYeuCau(req.params.id || req.query.ma_yeu_cau);

    const yeuCauHienTai = await prisma.yeu_cau_bao_hong.findFirst({ where: whereClause });
    if (!yeuCauHienTai) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy yêu cầu' });
    }

    if (yeuCauHienTai.trang_thai === 'HOAN_THANH' || yeuCauHienTai.trang_thai === 'HUY') {
      return res.status(400).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Không thể phân công yêu cầu đã hoàn thành hoặc đã hủy',
        thong_bao: 'Không thể phân công yêu cầu đã hoàn thành hoặc đã hủy'
      });
    }

    const ketQua = await prisma.$transaction(async (tx) => {
      const ketQuaCapNhat = await tx.yeu_cau_bao_hong.updateMany({
        where: {
          ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong,
          trang_thai: yeuCauHienTai.trang_thai,
          ma_ky_thuat_vien: yeuCauHienTai.ma_ky_thuat_vien
        },
        data: { ma_ky_thuat_vien: ktv.ma_nguoi_dung }
      });

      if (ketQuaCapNhat.count === 0) throw taoLoiXungDot();

      await tx.lich_su_xu_ly.create({
        data: {
          ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong,
          trang_thai: yeuCauHienTai.trang_thai,
          nguoi_thuc_hien: req.nguoiDung.ho_ten || 'Quản trị viên',
          ghi_chu: `Phân công xử lý cho KTV ${ktv.ho_ten}`
        }
      });

      return tx.yeu_cau_bao_hong.findUnique({
        where: { ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong },
        include: { ky_thuat_vien: true }
      });
    });

    if (ktv.chat_id_zalo) {
      guiTinNhanZalo(
        ktv.chat_id_zalo,
        `📋 BẠN CÓ CÔNG VIỆC BÁO HỎNG MỚI ĐƯỢC PHÂN CÔNG\n\n` +
        `• Mã yêu cầu: ${ketQua.ma_yeu_cau}\n` +
        `• Thiết bị: ${ketQua.ten_thiet_bi}\n` +
        `• Vị trí: ${ketQua.vi_tri_phong}\n` +
        `• Mô tả sự cố: ${ketQua.mo_ta_loi}`
      ).catch((loiZalo) => console.error('⚠️ Lỗi gửi thông báo phân công qua Zalo:', loiZalo.message));
    }

    return res.status(200).json({
      thanhCong: true,
      thongBao: `Đã phân công yêu cầu cho kỹ thuật viên: ${ktv.ho_ten}`,
      duLieu: ketQua
    });
  } catch (loi) {
    if (loi.maLoi === 'XUNG_DOT') {
      return res.status(409).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Yêu cầu vừa được người khác cập nhật, vui lòng tải lại danh sách rồi thử lại',
        thong_bao: 'Yêu cầu vừa được người khác cập nhật, vui lòng tải lại danh sách rồi thử lại'
      });
    }
    console.error('❌ Lỗi phân công KTV:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi phân công yêu cầu' });
  }
}

async function chuanHoaYeuCau(req, res) {
  try {
    const { ma_phong, ma_danh_muc, muc_do_uu_tien } = req.body;
    const whereClause = taoDieuKienTimKiemYeuCau(req.params.id || req.query.ma_yeu_cau);

    // 1. Kiểm tra đầu vào (trước khi chạm CSDL)
    const duLieuCapNhat = {};

    if (ma_phong !== undefined) {
      const ketQuaPhong = docMaKhoaNgoai(ma_phong);
      if (!ketQuaPhong.hopLe) {
        return res.status(400).json({ thanhCong: false, loi: 'Mã phòng không hợp lệ' });
      }
      duLieuCapNhat.ma_phong = ketQuaPhong.giaTri;
    }

    if (ma_danh_muc !== undefined) {
      const ketQuaDanhMuc = docMaKhoaNgoai(ma_danh_muc);
      if (!ketQuaDanhMuc.hopLe) {
        return res.status(400).json({ thanhCong: false, loi: 'Mã danh mục không hợp lệ' });
      }
      duLieuCapNhat.ma_danh_muc = ketQuaDanhMuc.giaTri;
    }

    if (muc_do_uu_tien !== undefined) {
      if (!MUC_DO_UU_TIEN_HOP_LE.includes(muc_do_uu_tien)) {
        return res.status(400).json({
          thanhCong: false,
          loi: `Mức độ ưu tiên phải là một trong: ${MUC_DO_UU_TIEN_HOP_LE.join(', ')}`
        });
      }
      duLieuCapNhat.muc_do_uu_tien = muc_do_uu_tien;
    }

    if (Object.keys(duLieuCapNhat).length === 0) {
      return res.status(400).json({ thanhCong: false, loi: 'Không có thông tin nào để chuẩn hóa' });
    }

    // 2. Tìm yêu cầu
    const yeuCauHienTai = await prisma.yeu_cau_bao_hong.findFirst({ where: whereClause });
    if (!yeuCauHienTai) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy yêu cầu cần chuẩn hóa' });
    }

    if (['HOAN_THANH', 'HUY'].includes(yeuCauHienTai.trang_thai)) {
      return res.status(400).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Không thể chuẩn hóa yêu cầu đã hoàn thành hoặc đã hủy',
        thong_bao: 'Không thể chuẩn hóa yêu cầu đã hoàn thành hoặc đã hủy'
      });
    }

    // 3. Phân quyền: KTV không chuẩn hóa yêu cầu đang giao cho KTV khác
    if (req.nguoiDung.vai_tro !== 'ADMIN') {
      if (yeuCauHienTai.ma_ky_thuat_vien && yeuCauHienTai.ma_ky_thuat_vien !== req.nguoiDung.ma_nguoi_dung) {
        return res.status(403).json({
          thanhCong: false,
          loi: 'Yêu cầu này đang được phân công cho kỹ thuật viên khác xử lý'
        });
      }
    }

    // 4. Phòng / danh mục phải tồn tại
    if (duLieuCapNhat.ma_phong) {
      const phong = await prisma.phong.findUnique({ where: { ma_phong: duLieuCapNhat.ma_phong } });
      if (!phong) {
        return res.status(400).json({ thanhCong: false, loi: 'Phòng được chọn không tồn tại' });
      }
    }
    if (duLieuCapNhat.ma_danh_muc) {
      const danhMuc = await prisma.danh_muc_thiet_bi.findUnique({ where: { ma_danh_muc: duLieuCapNhat.ma_danh_muc } });
      if (!danhMuc) {
        return res.status(400).json({ thanhCong: false, loi: 'Danh mục được chọn không tồn tại' });
      }
    }

    // 5. Cập nhật + ghi nhật ký trong một giao dịch
    const yeuCau = await prisma.$transaction(async (tx) => {
      const ketQuaCapNhat = await tx.yeu_cau_bao_hong.updateMany({
        where: {
          ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong,
          trang_thai: yeuCauHienTai.trang_thai,
          ma_ky_thuat_vien: yeuCauHienTai.ma_ky_thuat_vien
        },
        data: duLieuCapNhat
      });

      if (ketQuaCapNhat.count === 0) throw taoLoiXungDot();

      await tx.lich_su_xu_ly.create({
        data: {
          ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong,
          trang_thai: yeuCauHienTai.trang_thai,
          nguoi_thuc_hien: req.nguoiDung.ho_ten || 'Kỹ thuật viên',
          ghi_chu: 'Chuẩn hóa thông tin yêu cầu (phòng, danh mục, mức ưu tiên)'
        }
      });

      return tx.yeu_cau_bao_hong.findUnique({
        where: { ma_yeu_cau_bao_hong: yeuCauHienTai.ma_yeu_cau_bao_hong },
        include: { danh_muc: true, phong_hoc: true }
      });
    });

    return res.status(200).json({
      thanhCong: true,
      thongBao: 'Đã chuẩn hóa thông tin yêu cầu thành công',
      duLieu: yeuCau
    });
  } catch (loi) {
    if (loi.maLoi === 'XUNG_DOT') {
      return res.status(409).json({
        thanhCong: false,
        thanh_cong: false,
        loi: 'Yêu cầu vừa được người khác cập nhật, vui lòng tải lại danh sách rồi thử lại',
        thong_bao: 'Yêu cầu vừa được người khác cập nhật, vui lòng tải lại danh sách rồi thử lại'
      });
    }
    console.error('❌ Lỗi chuẩn hóa yêu cầu:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi chuẩn hóa yêu cầu' });
  }
}

async function layDanhMuc(req, res) {
  try {
    const [danhMucThietBi, danhSachPhong, danhSachKtv] = await Promise.all([
      prisma.danh_muc_thiet_bi.findMany({ orderBy: { ma_danh_muc: 'asc' } }),
      prisma.phong.findMany({ orderBy: { ten_phong: 'asc' } }),
      prisma.nguoi_dung.findMany({
        where: { vai_tro: 'KTV', trang_thai_hoat_dong: true },
        select: { ma_nguoi_dung: true, ho_ten: true, email: true, so_dien_thoai: true },
        orderBy: { ho_ten: 'asc' }
      })
    ]);

    return res.status(200).json({
      thanhCong: true,
      duLieu: { danhMucThietBi, danhSachPhong, danhSachKtv }
    });
  } catch (loi) {
    console.error('❌ Lỗi lấy danh mục:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi lấy danh mục' });
  }
}

module.exports = {
  layDanhSachYeuCau,
  layChiTietYeuCau,
  capNhatTrangThaiYeuCau,
  phanCongYeuCau,
  chuanHoaYeuCau,
  layDanhMuc,
  taoDieuKienTimKiemYeuCau
};
