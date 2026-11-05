// prisma/hatGiong.js - Hạt giống dữ liệu ban đầu cho hệ thống (Seed Data)
require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../src/config/coSoDuLieu');

async function khoiTaoDuLieuMau() {
  console.log('🌱 Bắt đầu gieo hạt giống dữ liệu ban đầu...');

  const matKhauMacDinh = process.env.MAT_KHAU_ADMIN_BAN_DAU || '123456';
  const SO_VONG_BAM = 10; // Khớp với SO_VONG_BAM trong xacThucDieuKhien.js
  const matKhauHash = await bcrypt.hash(matKhauMacDinh, SO_VONG_BAM);

  // 1. Khởi tạo tài khoản Quản trị viên (ADMIN)
  const admin = await prisma.nguoi_dung.upsert({
    where: { tai_khoan: 'admin' },
    update: {
      mat_khau_hash: matKhauHash,
      trang_thai_hoat_dong: true
    },
    create: {
      tai_khoan: 'admin',
      mat_khau_hash: matKhauHash,
      ho_ten: 'Quản Trị Viên Hệ Thống',
      email: 'admin@tvu.edu.vn',
      so_dien_thoai: '0987654321',
      vai_tro: 'ADMIN',
      trang_thai_hoat_dong: true
    }
  });
  console.log('✅ Đã tạo/cập nhật tài khoản ADMIN:', admin.tai_khoan);

  // 2. Khởi tạo tài khoản Kỹ thuật viên (KTV)
  const ktv1 = await prisma.nguoi_dung.upsert({
    where: { tai_khoan: 'ktv_an' },
    update: {
      mat_khau_hash: matKhauHash,
      trang_thai_hoat_dong: true
    },
    create: {
      tai_khoan: 'ktv_an',
      mat_khau_hash: matKhauHash,
      ho_ten: 'Nguyễn Văn An',
      email: 'ktv_an@tvu.edu.vn',
      so_dien_thoai: '0912345678',
      vai_tro: 'KTV',
      trang_thai_hoat_dong: true
    }
  });

  const ktv2 = await prisma.nguoi_dung.upsert({
    where: { tai_khoan: 'ktv_binh' },
    update: {
      mat_khau_hash: matKhauHash,
      trang_thai_hoat_dong: true
    },
    create: {
      tai_khoan: 'ktv_binh',
      mat_khau_hash: matKhauHash,
      ho_ten: 'Trần Thị Bình',
      email: 'ktv_binh@tvu.edu.vn',
      so_dien_thoai: '0923456789',
      vai_tro: 'KTV',
      trang_thai_hoat_dong: true
    }
  });
  console.log('✅ Đã tạo/cập nhật 2 tài khoản KTV:', ktv1.tai_khoan, ktv2.tai_khoan);

  // 3. Khởi tạo Danh mục thiết bị
  const danhMucMau = [
    { ten_loai: 'Máy chiếu (Projector)', bieu_tuong: 'projector', mo_ta: 'Máy chiếu lớp học, hội trường' },
    { ten_loai: 'Máy tính để bàn (PC)', bieu_tuong: 'desktop', mo_ta: 'Máy tính phòng thực hành, bàn giáo viên' },
    { ten_loai: 'Điều hòa / Máy lạnh', bieu_tuong: 'air-conditioner', mo_ta: 'Hệ thống làm mát phòng học' },
    { ten_loai: 'Thiết bị mạng (Wifi/Switch)', bieu_tuong: 'wifi', mo_ta: 'Access Point, dây mạng LAN' },
    { ten_loai: 'Âm thanh (Mic/Loa)', bieu_tuong: 'speaker', mo_ta: 'Micro không dây, dàn amply phòng học' },
    { ten_loai: 'Khác', bieu_tuong: 'other', mo_ta: 'Bóng đèn, quạt trần, ổ cắm điện...' }
  ];

  for (const dm of danhMucMau) {
    const daTonTai = await prisma.danh_muc_thiet_bi.findFirst({
      where: { ten_loai: dm.ten_loai }
    });
    if (!daTonTai) {
      await prisma.danh_muc_thiet_bi.create({ data: dm });
    }
  }
  console.log(`✅ Đã nạp ${danhMucMau.length} danh mục thiết bị chuẩn.`);

  // 4. Khởi tạo Danh mục Phòng học / Khu vực
  const phongMau = [
    'Phòng D71.101',
    'Phòng D71.102',
    'Phòng D71.103',
    'Phòng D71.201',
    'Phòng D71.202',
    'Phòng B204',
    'Phòng Lab 1 (Khoa CNTT)',
    'Phòng Lab 2 (Khoa CNTT)',
    'Hội trường E'
  ];

  for (const tenPhong of phongMau) {
    await prisma.phong.upsert({
      where: { ten_phong: tenPhong },
      update: {},
      create: { ten_phong: tenPhong }
    });
  }
  console.log(`✅ Đã nạp ${phongMau.length} phòng học chuẩn.`);

  console.log('🎉 Hoàn thành gieo hạt giống dữ liệu (Seed Data thành công)!');
}

khoiTaoDuLieuMau()
  .catch((loi) => {
    console.error('❌ Lỗi gieo hạt giống:', loi);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
