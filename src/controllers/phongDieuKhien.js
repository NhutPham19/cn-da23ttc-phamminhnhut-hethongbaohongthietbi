// src/controllers/phongDieuKhien.js - Bộ điều khiển RESTful API Quản lý Phòng học TVU
const prisma = require('../config/coSoDuLieu');
const { boDau } = require('../utils/tienIch');
const {
  phanTichThongTinPhong,
  lamMoiCachePhong,
  danhSachPhongGoc
} = require('../services/phongDichVu');

// Định dạng regex mã phòng chuẩn TVU: [Tòa][Khu].[Tầng][Số](/[Hậu tố])
// Ví dụ: D71.103, A42.205, C11.103/1
const REGEX_MA_PHONG_TVU = /^[A-Z]\d{2}\.\d{3}(\/\d+)?$/;

/**
 * GET /api/phong - Danh sách phòng học kèm bộ lọc, phân trang và thống kê KPI
 */
async function layDanhSachPhong(req, res) {
  try {
    const {
      tuKhoa = '',
      loaiPhong = '',
      toaNha = '',
      trang = 1,
      gioiHan = 20
    } = req.query;

    const soTrang = Math.max(1, parseInt(trang, 10) || 1);
    const soGioiHan = Math.max(1, Math.min(100, parseInt(gioiHan, 10) || 20));

    // Lấy toàn bộ phòng trong DB kèm số lượt báo hỏng
    const tatCaPhong = await prisma.phong.findMany({
      include: {
        _count: {
          select: { danh_sach_yeu_cau: true }
        }
      },
      orderBy: { ten_phong: 'asc' }
    });

    // Bổ sung metadata chi tiết cho từng phòng
    const phongKemThongTin = tatCaPhong.map(p => {
      const info = phanTichThongTinPhong(p.ten_phong);
      return {
        ma_phong: p.ma_phong,
        ten_phong: p.ten_phong,
        ma_phong_chuan: info ? info.ma_phong_chuan : p.ten_phong.replace(/^(phòng|hội trường)\s+/i, '').trim(),
        loai_phong: info ? info.loai_phong : 'Phòng lý thuyết',
        toa_nha: info ? info.toa_nha : 'Khác',
        khu_vuc: info ? info.khu_vuc : 'Khu I',
        tang: info ? info.tang : 1,
        vi_tri: info ? info.vi_tri : p.ten_phong,
        so_luot_bao_hong: p._count?.danh_sach_yeu_cau || 0
      };
    });

    // Thống kê nhanh toàn bộ phòng theo 4 phân loại
    const thongKe = {
      tongSoPhong: phongKemThongTin.length,
      soHoiTruong: phongKemThongTin.filter(p => p.loai_phong === 'Hội trường').length,
      soMayTinh: phongKemThongTin.filter(p => p.loai_phong === 'Phòng máy tính thực hành').length,
      soThiNghiem: phongKemThongTin.filter(p => p.loai_phong === 'Phòng thực hành - thí nghiệm').length,
      soLyThuyet: phongKemThongTin.filter(p => p.loai_phong === 'Phòng lý thuyết').length
    };

    // Lọc theo điều kiện truy vấn
    let danhSachLoc = phongKemThongTin;

    if (tuKhoa) {
      const tuKhoaKd = boDau(tuKhoa.trim()).toLowerCase();
      danhSachLoc = danhSachLoc.filter(p => {
        const tenKd = boDau(p.ten_phong).toLowerCase();
        const maKd = boDau(p.ma_phong_chuan).toLowerCase();
        const toaKd = boDau(p.toa_nha).toLowerCase();
        return tenKd.includes(tuKhoaKd) || maKd.includes(tuKhoaKd) || toaKd.includes(tuKhoaKd);
      });
    }

    if (loaiPhong && loaiPhong !== 'Tất cả') {
      danhSachLoc = danhSachLoc.filter(p => p.loai_phong === loaiPhong);
    }

    if (toaNha && toaNha !== 'Tất cả') {
      danhSachLoc = danhSachLoc.filter(p => p.toa_nha === toaNha);
    }

    const tongSoPhongLoc = danhSachLoc.length;
    const tongSoTrang = Math.ceil(tongSoPhongLoc / soGioiHan) || 1;
    const viTriBatDau = (soTrang - 1) * soGioiHan;
    const duLieuTrang = danhSachLoc.slice(viTriBatDau, viTriBatDau + soGioiHan);

    return res.status(200).json({
      thanhCong: true,
      duLieu: duLieuTrang,
      phanTrang: {
        trangHienTai: soTrang,
        tongSoTrang,
        tongSoPhong: tongSoPhongLoc,
        gioiHan: soGioiHan
      },
      thongKe
    });
  } catch (loi) {
    console.error('❌ Lỗi lấy danh sách phòng:', loi);
    return res.status(500).json({
      thanhCong: false,
      loi: 'Lỗi máy chủ khi lấy danh sách phòng học.'
    });
  }
}

/**
 * POST /api/phong - Thêm phòng học mới (Chỉ ADMIN)
 */
async function taoPhongMoi(req, res) {
  try {
    const { ma_phong_chuan, loai_phong = 'Phòng lý thuyết', ten_phong } = req.body;

    let maChuan = (ma_phong_chuan || '').trim().toUpperCase();

    // Nếu người dùng gửi ten_phong mà không có ma_phong_chuan
    if (!maChuan && ten_phong) {
      maChuan = ten_phong.replace(/^(phòng|hội trường)\s+/i, '').trim().toUpperCase();
    }

    // 1. Kiểm tra định dạng mã phòng chuẩn TVU
    if (!REGEX_MA_PHONG_TVU.test(maChuan)) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Mã phòng không đúng quy chuẩn TVU (Định dạng chuẩn: [Tòa][Khu].[Tầng][Số], ví dụ: D71.103, A42.205, C11.103/1).'
      });
    }

    // 2. Xác định tiền tố theo loại phòng
    const laHoiTruong = loai_phong === 'Hội trường';
    const tienTo = laHoiTruong ? 'Hội trường ' : 'Phòng ';
    const tenPhongChuan = `${tienTo}${maChuan}`;

    // 3. Kiểm tra trùng mã phòng (không phân biệt hoa thường)
    const phongTonTai = await prisma.phong.findFirst({
      where: {
        ten_phong: {
          equals: tenPhongChuan,
          mode: 'insensitive'
        }
      }
    });

    if (phongTonTai) {
      return res.status(409).json({
        thanhCong: false,
        loi: `Phòng học [${tenPhongChuan}] đã tồn tại trong hệ thống.`
      });
    }

    // 4. Lưu vào bảng phong
    const phongMoi = await prisma.phong.create({
      data: { ten_phong: tenPhongChuan }
    });

    // Làm mới cache để Zalo Bot nhận diện ngay
    lamMoiCachePhong();

    const info = phanTichThongTinPhong(phongMoi.ten_phong);

    return res.status(201).json({
      thanhCong: true,
      thongBao: `Đã thêm phòng học [${tenPhongChuan}] thành công.`,
      duLieu: {
        ma_phong: phongMoi.ma_phong,
        ten_phong: phongMoi.ten_phong,
        ma_phong_chuan: maChuan,
        loai_phong: laHoiTruong ? 'Hội trường' : (loai_phong || info?.loai_phong || 'Phòng lý thuyết'),
        toa_nha: info ? info.toa_nha : 'Khác',
        khu_vuc: info ? info.khu_vuc : 'Khu I',
        tang: info ? info.tang : 1,
        vi_tri: info ? info.vi_tri : tenPhongChuan,
        so_luot_bao_hong: 0
      }
    });
  } catch (loi) {
    console.error('❌ Lỗi tạo phòng mới:', loi);
    return res.status(500).json({
      thanhCong: false,
      loi: 'Lỗi máy chủ khi tạo phòng học mới.'
    });
  }
}

/**
 * PUT /api/phong/:id - Cập nhật phòng học & Đồng bộ xuyên suốt toàn hệ thống (Chỉ ADMIN)
 */
async function capNhatPhong(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) {
      return res.status(400).json({ thanhCong: false, loi: 'Mã định danh phòng không hợp lệ.' });
    }

    const { ma_phong_chuan, loai_phong, ten_phong } = req.body;

    // 1. Kiểm tra phòng tồn tại
    const phongCu = await prisma.phong.findUnique({
      where: { ma_phong: id }
    });
    if (!phongCu) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy phòng học yêu cầu.' });
    }

    let maChuan = (ma_phong_chuan || '').trim().toUpperCase();
    if (!maChuan && ten_phong) {
      maChuan = ten_phong.replace(/^(phòng|hội trường)\s+/i, '').trim().toUpperCase();
    }
    if (!maChuan) {
      maChuan = phongCu.ten_phong.replace(/^(phòng|hội trường)\s+/i, '').trim().toUpperCase();
    }

    if (!REGEX_MA_PHONG_TVU.test(maChuan)) {
      return res.status(400).json({
        thanhCong: false,
        loi: 'Mã phòng không đúng quy chuẩn TVU (Ví dụ: D71.103, A42.205, C11.103/1).'
      });
    }

    const laHoiTruong = loai_phong === 'Hội trường' || (loai_phong === undefined && /^hội trường/i.test(phongCu.ten_phong));
    const tienTo = laHoiTruong ? 'Hội trường ' : 'Phòng ';
    const tenPhongChuanMoi = `${tienTo}${maChuan}`;

    // 2. Kiểm tra trùng tên với phòng khác
    const phongTrung = await prisma.phong.findFirst({
      where: {
        ten_phong: { equals: tenPhongChuanMoi, mode: 'insensitive' },
        NOT: { ma_phong: id }
      }
    });
    if (phongTrung) {
      return res.status(409).json({
        thanhCong: false,
        loi: `Phòng học [${tenPhongChuanMoi}] đã tồn tại trong hệ thống.`
      });
    }

    // 3. Thực thi Atomic Transaction đồng bộ tên phòng trong bảng phong và toàn bộ yêu cầu báo hỏng
    const phongCapNhat = await prisma.$transaction(async (tx) => {
      const p = await tx.phong.update({
        where: { ma_phong: id },
        data: { ten_phong: tenPhongChuanMoi }
      });

      // Đồng bộ toàn bộ bảng yêu cầu báo hỏng
      await tx.yeu_cau_bao_hong.updateMany({
        where: { ma_phong: id },
        data: { vi_tri_phong: tenPhongChuanMoi }
      });

      return p;
    });

    lamMoiCachePhong();
    const info = phanTichThongTinPhong(phongCapNhat.ten_phong);

    return res.status(200).json({
      thanhCong: true,
      thongBao: `Đã cập nhật phòng [${tenPhongChuanMoi}] và đồng bộ lịch sử báo hỏng thành công.`,
      duLieu: {
        ma_phong: phongCapNhat.ma_phong,
        ten_phong: phongCapNhat.ten_phong,
        ma_phong_chuan: maChuan,
        loai_phong: laHoiTruong ? 'Hội trường' : (loai_phong || info?.loai_phong || 'Phòng lý thuyết'),
        toa_nha: info ? info.toa_nha : 'Khác',
        khu_vuc: info ? info.khu_vuc : 'Khu I',
        tang: info ? info.tang : 1,
        vi_tri: info ? info.vi_tri : tenPhongChuanMoi
      }
    });
  } catch (loi) {
    console.error('❌ Lỗi cập nhật phòng:', loi);
    return res.status(500).json({
      thanhCong: false,
      loi: 'Lỗi máy chủ khi cập nhật thông tin phòng học.'
    });
  }
}

/**
 * DELETE /api/phong/:id - Xóa phòng học có ràng buộc khóa ngoại an toàn (Chỉ ADMIN)
 */
async function xoaPhong(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) {
      return res.status(400).json({ thanhCong: false, loi: 'Mã định danh phòng không hợp lệ.' });
    }

    // 1. Kiểm tra phòng tồn tại
    const phong = await prisma.phong.findUnique({
      where: { ma_phong: id }
    });
    if (!phong) {
      return res.status(404).json({ thanhCong: false, loi: 'Không tìm thấy phòng học yêu cầu.' });
    }

    // 2. Ràng buộc bảo vệ khóa ngoại (FK Guard): Đếm số yêu cầu gắn với phòng
    const soYeuCau = await prisma.yeu_cau_bao_hong.count({
      where: { ma_phong: id }
    });

    if (soYeuCau > 0) {
      return res.status(409).json({
        thanhCong: false,
        loi: `Không thể xóa phòng này vì đang có ${soYeuCau} yêu cầu báo hỏng gắn liền trong lịch sử. Vui lòng cập nhật thông tin phòng thay vì xóa.`
      });
    }

    // 3. Cho phép xóa khi chưa có yêu cầu nào
    await prisma.phong.delete({
      where: { ma_phong: id }
    });

    lamMoiCachePhong();

    return res.status(200).json({
      thanhCong: true,
      thongBao: `Đã xóa phòng [${phong.ten_phong}] thành công khỏi hệ thống.`
    });
  } catch (loi) {
    console.error('❌ Lỗi xóa phòng:', loi);
    return res.status(500).json({
      thanhCong: false,
      loi: 'Lỗi máy chủ khi xóa phòng học.'
    });
  }
}

module.exports = {
  layDanhSachPhong,
  taoPhongMoi,
  capNhatPhong,
  xoaPhong
};
