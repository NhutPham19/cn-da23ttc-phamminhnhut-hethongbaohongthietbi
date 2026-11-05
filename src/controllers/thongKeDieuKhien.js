// src/controllers/thongKeDieuKhien.js - Thống kê, báo cáo SLA và biểu đồ phân tích (Chỉ dành cho ADMIN)
const prisma = require('../config/coSoDuLieu');

/**
 * Tính toán các chỉ số SLA và MTTR kép (Resolve & Repair)
 * - MTTR Resolve: thoi_gian_hoan_thanh - thoi_gian_tao
 * - MTTR Repair: thoi_gian_hoan_thanh - thoi_gian_tiep_nhan (thời gian sửa chữa thực tế của KTV)
 */
function tinhChiSoSla(tatCaYeuCau = []) {
  let tongPhutPhanHoiSLA = 0;
  let soLuongCoPhanHoi = 0;
  let soLuongTiepNhanDungHan = 0; // Đếm số yêu cầu tiếp nhận <= 30 phút
  let tongPhutKhacPhucMTTR = 0;
  let soLuongHoanThanh = 0;
  let tongPhutSuaChuaMTTR = 0;
  let soLuongSuaChuaThucTe = 0;

  tatCaYeuCau.forEach((yc) => {
    // SLA phản hồi: thoi_gian_tiep_nhan - thoi_gian_tao
    if (yc.thoi_gian_tiep_nhan && yc.thoi_gian_tao) {
      const phutPhanHoi = (new Date(yc.thoi_gian_tiep_nhan) - new Date(yc.thoi_gian_tao)) / (1000 * 60);
      if (phutPhanHoi >= 0) {
        tongPhutPhanHoiSLA += phutPhanHoi;
        soLuongCoPhanHoi++;
        // Tiếp nhận đúng hạn khi thời gian tiếp nhận <= 30 phút
        if (phutPhanHoi <= 30) {
          soLuongTiepNhanDungHan++;
        }
      }
    }

    // MTTR Resolve: thoi_gian_hoan_thanh - thoi_gian_tao
    if (yc.trang_thai === 'HOAN_THANH' && yc.thoi_gian_hoan_thanh && yc.thoi_gian_tao) {
      const phutKhacPhuc = (new Date(yc.thoi_gian_hoan_thanh) - new Date(yc.thoi_gian_tao)) / (1000 * 60);
      if (phutKhacPhuc >= 0) {
        tongPhutKhacPhucMTTR += phutKhacPhuc;
        soLuongHoanThanh++;
      }
    }

    // MTTR Repair: max(0, thoi_gian_hoan_thanh - thoi_gian_tiep_nhan)
    if (yc.trang_thai === 'HOAN_THANH' && yc.thoi_gian_hoan_thanh && yc.thoi_gian_tiep_nhan) {
      const phutSuaChua = (new Date(yc.thoi_gian_hoan_thanh) - new Date(yc.thoi_gian_tiep_nhan)) / (1000 * 60);
      if (phutSuaChua >= 0) {
        tongPhutSuaChuaMTTR += phutSuaChua;
        soLuongSuaChuaThucTe++;
      }
    }
  });

  const thoiGianPhanHoiTBPhut = soLuongCoPhanHoi > 0
    ? Math.round(tongPhutPhanHoiSLA / soLuongCoPhanHoi)
    : 0;

  // Tính tỷ lệ tiếp nhận đúng hạn (< 30 phút) theo phần trăm
  const tiLeDungHan = soLuongCoPhanHoi > 0
    ? Number(((soLuongTiepNhanDungHan / soLuongCoPhanHoi) * 100).toFixed(1))
    : 100;

  // Định dạng thời gian tiếp nhận trung bình về Giờ và Phút
  const gioPhanHoi = Math.floor(thoiGianPhanHoiTBPhut / 60);
  const phutPhanHoiDu = thoiGianPhanHoiTBPhut % 60;
  const thoiGianPhanHoiDinhDang = gioPhanHoi > 0
    ? (phutPhanHoiDu > 0 ? `${gioPhanHoi} giờ ${phutPhanHoiDu} phút` : `${gioPhanHoi} giờ`)
    : `${thoiGianPhanHoiTBPhut} phút`;

  const thoiGianKhacPhucTBGio = soLuongHoanThanh > 0
    ? Number((tongPhutKhacPhucMTTR / soLuongHoanThanh / 60).toFixed(2))
    : 0;

  const thoiGianSuaChuaTBGio = soLuongSuaChuaThucTe > 0
    ? Number((tongPhutSuaChuaMTTR / soLuongSuaChuaThucTe / 60).toFixed(2))
    : 0;

  return {
    thoiGianPhanHoiTrungBinhPhut: thoiGianPhanHoiTBPhut,
    thoiGianPhanHoiGio: gioPhanHoi,
    thoiGianPhanHoiPhutDu: phutPhanHoiDu,
    thoiGianPhanHoiDinhDang,
    tiLeTiepNhanDungHanPhanTram: tiLeDungHan,
    soLuongTiepNhanDungHan,
    soLuongCoPhanHoi,
    thoiGianKhacPhucTrungBinhGio: thoiGianKhacPhucTBGio,
    thoiGianSuaChuaThucTeTrungBinhGio: thoiGianSuaChuaTBGio,
    thoiGianSuaChuaThucTeGio: thoiGianSuaChuaTBGio,
    thoi_gian_sua_chua_thuc_te_gio: thoiGianSuaChuaTBGio
  };
}

/**
 * Lấy số liệu thống kê tổng hợp (GET /api/thong-ke)
 */
async function layThongKe(req, res) {
  try {
    // 1. Thống kê số lượng theo từng trạng thái
    const [tongSo, demChoXuLy, demDangXuLy, demHoanThanh, demHuy] = await Promise.all([
      prisma.yeu_cau_bao_hong.count(),
      prisma.yeu_cau_bao_hong.count({ where: { trang_thai: 'CHO_XU_LY' } }),
      prisma.yeu_cau_bao_hong.count({ where: { trang_thai: 'DANG_XU_LY' } }),
      prisma.yeu_cau_bao_hong.count({ where: { trang_thai: 'HOAN_THANH' } }),
      prisma.yeu_cau_bao_hong.count({ where: { trang_thai: 'HUY' } })
    ]);

    // 2. Thống kê theo loại thiết bị (danh mục)
    const tatCaYeuCau = await prisma.yeu_cau_bao_hong.findMany({
      select: {
        ma_danh_muc: true,
        danh_muc: { select: { ten_loai: true } },
        ma_phong: true,
        phong_hoc: { select: { ten_phong: true } },
        thoi_gian_tao: true,
        thoi_gian_tiep_nhan: true,
        thoi_gian_hoan_thanh: true,
        trang_thai: true
      }
    });

    const gomThietBi = {};
    const gomPhong = {};

    tatCaYeuCau.forEach((yc) => {
      // Phân nhóm thiết bị
      const tenThietBiNhom = yc.danh_muc ? yc.danh_muc.ten_loai : 'Chưa phân loại';
      gomThietBi[tenThietBiNhom] = (gomThietBi[tenThietBiNhom] || 0) + 1;

      // Phân nhóm phòng học
      const tenPhongNhom = yc.phong_hoc ? yc.phong_hoc.ten_phong : 'Chưa phân loại';
      gomPhong[tenPhongNhom] = (gomPhong[tenPhongNhom] || 0) + 1;
    });

    // Sắp xếp top thiết bị hỏng nhiều nhất
    const topThietBi = Object.entries(gomThietBi)
      .map(([ten, soLuong]) => ({ ten, soLuong }))
      .sort((a, b) => b.soLuong - a.soLuong);

    // Sắp xếp top phòng hay gặp sự cố nhất
    const topPhong = Object.entries(gomPhong)
      .map(([ten, soLuong]) => ({ ten, soLuong }))
      .sort((a, b) => b.soLuong - a.soLuong);

    const chiSoSla = tinhChiSoSla(tatCaYeuCau);

    return res.status(200).json({
      thanhCong: true,
      duLieu: {
        tongQuan: {
          tongSo,
          choXuLy: demChoXuLy,
          dangXuLy: demDangXuLy,
          hoanThanh: demHoanThanh,
          huy: demHuy
        },
        sla: chiSoSla,
        topThietBi,
        topPhong
      }
    });
  } catch (loi) {
    console.error('❌ Lỗi tổng hợp thống kê:', loi);
    return res.status(500).json({ thanhCong: false, loi: 'Lỗi máy chủ khi tổng hợp thống kê' });
  }
}

module.exports = {
  layThongKe,
  tinhChiSoSla
};
