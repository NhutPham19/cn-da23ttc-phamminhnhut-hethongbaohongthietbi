// scripts/kiemTraKetNoi.js - Kiểm tra kết nối CSDL Supabase
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function kiemTra() {
  console.log('🔄 Đang thử kết nối tới Supabase với DATABASE_URL hiện tại...');
  const prisma = new PrismaClient();
  try {
    const danhSach = await prisma.danh_muc_thiet_bi.findMany();
    console.log('✅ KẾT NỐI SUPABASE THÀNH CÔNG!');
    console.log(`Đã đọc được ${danhSach.length} danh mục thiết bị từ CSDL thật:`);
    console.log(danhSach);
  } catch (loi) {
    console.error('❌ Lỗi kết nối:', loi.message);
  } finally {
    await prisma.$disconnect();
  }
}

kiemTra();
