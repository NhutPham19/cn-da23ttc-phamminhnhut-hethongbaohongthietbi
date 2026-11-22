// prisma/chuanHoaDuLieuPhongCu.js - Script làm sạch & đồng bộ dữ liệu phòng chuẩn TVU
require('dotenv').config();
const prisma = require('../src/config/coSoDuLieu');
const danhSachPhongTvu = require('../src/duLieu/danhSachPhongTvu.json');
const { chuanHoaPhong } = require('../src/services/phongDichVu');

async function chuanHoaDuLieuPhongCu() {
  console.log('🚀 Bắt đầu quá trình chuẩn hóa & làm sạch dữ liệu phòng học TVU...');

  const set180TenPhong = new Set(danhSachPhongTvu.map(p => p.ten_phong));

  await prisma.$transaction(async (tx) => {
    // 1. Upsert đủ 180 phòng chuẩn TVU
    console.log('📦 1. Upserting 180 phòng chuẩn TVU vào bảng phong...');
    await tx.phong.createMany({
      data: danhSachPhongTvu.map(p => ({ ten_phong: p.ten_phong })),
      skipDuplicates: true
    });
    console.log('✅ Đã nạp đủ 180 phòng học TVU chuẩn.');

    // Lấy danh sách 180 phòng chuẩn đã nạp kèm mã phòng (chỉ lấy phòng chuẩn)
    const dsPhongChuan = await tx.phong.findMany({
      where: { ten_phong: { in: Array.from(set180TenPhong) } }
    });
    const mapTenPhongVoiId = new Map(dsPhongChuan.map(p => [p.ten_phong, p.ma_phong]));

    // 2. Quét toàn bộ yêu cầu báo hỏng để chuẩn hóa FK ma_phong & vi_tri_phong
    console.log('🔍 2. Quét và đồng bộ yêu cầu báo hỏng...');
    const danhSachYc = await tx.yeu_cau_bao_hong.findMany();
    let soYcCapNhat = 0;

    for (const yc of danhSachYc) {
      const chuoiPhong = yc.vi_tri_phong || '';
      
      let tenPhongChuanMoi = null;
      let maPhongMoi = null;

      if (/D75\.114/i.test(chuoiPhong)) {
        tenPhongChuanMoi = 'Phòng D71.114';
        maPhongMoi = mapTenPhongVoiId.get(tenPhongChuanMoi);
      } else {
        const kqChuanHoa = chuanHoaPhong(chuoiPhong, dsPhongChuan);
        if (kqChuanHoa.hopLe && kqChuanHoa.ten_phong && mapTenPhongVoiId.has(kqChuanHoa.ten_phong)) {
          tenPhongChuanMoi = kqChuanHoa.ten_phong;
          maPhongMoi = mapTenPhongVoiId.get(kqChuanHoa.ten_phong);
        } else {
          // Mã không tồn tại trong danh mục chuẩn (VD B91.304, C71.101, B11.304, B204...)
          // Giữ nguyên chuỗi vi_tri_phong lịch sử, giải phóng FK ma_phong = null
          maPhongMoi = null;
        }
      }

      await tx.yeu_cau_bao_hong.update({
        where: { ma_yeu_cau_bao_hong: yc.ma_yeu_cau_bao_hong },
        data: {
          ma_phong: maPhongMoi,
          ...(tenPhongChuanMoi ? { vi_tri_phong: tenPhongChuanMoi } : {})
        }
      });
      soYcCapNhat++;
    }
    console.log(`✅ Đã đồng bộ ${soYcCapNhat} phiếu yêu cầu báo hỏng.`);

    // 3. Xóa các bản ghi phòng rác khỏi bảng phong
    console.log('🧹 3. Dọn dẹp phòng rác khỏi bảng phong...');
    const cacPhongHienCo = await tx.phong.findMany({
      include: { _count: { select: { danh_sach_yeu_cau: true } } }
    });

    let soPhongDaXoa = 0;
    for (const p of cacPhongHienCo) {
      if (!set180TenPhong.has(p.ten_phong)) {
        if (p._count.danh_sach_yeu_cau === 0) {
          await tx.phong.delete({ where: { ma_phong: p.ma_phong } });
          soPhongDaXoa++;
          console.log(`   - Đã xóa phòng rác: [${p.ten_phong}] (ID: ${p.ma_phong})`);
        } else {
          console.warn(`   ⚠️ Không thể xóa [${p.ten_phong}] vì còn ${p._count.danh_sach_yeu_cau} yêu cầu gắn liền.`);
        }
      }
    }
    console.log(`✅ Đã dọn dẹp ${soPhongDaXoa} phòng rác khỏi bảng phong.`);
  }, {
    maxWait: 20000,
    timeout: 60000
  });

  console.log('🎉 Hoàn thành chuẩn hóa & làm sạch dữ liệu phòng học TVU thành công!');
}

if (require.main === module) {
  chuanHoaDuLieuPhongCu()
    .catch((loi) => {
      console.error('❌ Lỗi chuẩn hóa dữ liệu phòng cũ:', loi);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { chuanHoaDuLieuPhongCu };
