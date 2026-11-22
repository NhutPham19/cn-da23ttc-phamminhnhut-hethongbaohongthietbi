// src/services/phongDichVu.js - Dịch vụ quản lý, phân tích và chuẩn hóa phòng học TVU
const fs = require('fs');
const path = require('path');
const { boDau } = require('../utils/tienIch');
const prisma = require('../config/coSoDuLieu');

// Tải danh mục gốc 180 phòng học TVU
const DUONG_DAN_JSON_PHONG = path.join(__dirname, '../duLieu/danhSachPhongTvu.json');
let danhSachPhongGoc = [];
try {
  danhSachPhongGoc = JSON.parse(fs.readFileSync(DUONG_DAN_JSON_PHONG, 'utf8'));
} catch (e) {
  console.warn('⚠️ Chưa tải được file danhSachPhongTvu.json:', e.message);
}

// In-memory cache danh sách phòng trong CSDL để tối ưu hiệu năng
let cachePhongDb = null;
let thoiGianCache = 0;
const THOI_GIAN_SONG_CACHE_MS = 60 * 1000; // 60 giây

function lamMoiCachePhong() {
  cachePhongDb = null;
  thoiGianCache = 0;
}

/**
 * Lấy danh sách phòng từ DB có caching ngắn hạn
 */
async function layDanhSachPhongDb(dbClient = prisma) {
  const bayGio = Date.now();
  if (cachePhongDb && bayGio - thoiGianCache < THOI_GIAN_SONG_CACHE_MS && dbClient === prisma) {
    return cachePhongDb;
  }
  const danhSach = await dbClient.phong.findMany({
    orderBy: { ten_phong: 'asc' }
  });
  if (dbClient === prisma) {
    cachePhongDb = danhSach;
    thoiGianCache = bayGio;
  }
  return danhSach;
}

/**
 * Tính khoảng cách Levenshtein giữa 2 chuỗi (độ tương đồng)
 */
function khoangCachLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const d = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const chiPhi = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + chiPhi
      );
    }
  }
  return d[m][n];
}

/**
 * Phân tích thông tin chi tiết một phòng từ tên phòng hoặc mã
 * @param {string} tenHoacMa 
 * @returns {object|null}
 */
function phanTichThongTinPhong(tenHoacMa) {
  if (!tenHoacMa) return null;
  const chuoi = String(tenHoacMa).trim();

  // Tìm trong danh mục 180 phòng gốc
  const khopGoc = danhSachPhongGoc.find(p => 
    p.ten_phong.toLowerCase() === chuoi.toLowerCase() ||
    p.ma_phong_chuan.toLowerCase() === chuoi.toLowerCase() ||
    boDau(p.ten_phong).toLowerCase() === boDau(chuoi).toLowerCase() ||
    boDau(p.ma_phong_chuan).toLowerCase() === boDau(chuoi).toLowerCase()
  );
  if (khopGoc) {
    return { ...khopGoc };
  }

  // Tự động phân tích theo cấu trúc mã phòng chuẩn TVU: [Tòa][Khu].[Tầng][Số]
  const maKhop = chuoi.match(/([A-Z]\d{2}\.\d{3}(?:\/\d+)?)/i);
  const maChuan = maKhop ? maKhop[1].toUpperCase() : chuoi.replace(/^(phòng|hội trường)\s+/i, '').trim().toUpperCase();

  const toaNhaMatch = maChuan.match(/^([A-Z]\d)/i);
  const toaNha = toaNhaMatch ? toaNhaMatch[1].toUpperCase() : 'Khác';

  let khuVuc = 'Khu I';
  if (/^E[1-3]/i.test(maChuan)) {
    khuVuc = 'Khu I dãy E';
  } else {
    const kyTuKhu = maChuan.match(/^[A-Z]\d(\d)/i);
    if (kyTuKhu && kyTuKhu[1] === '2') {
      khuVuc = 'Khu II';
    }
  }

  let tang = 1;
  const tangMatch = maChuan.match(/\.(\d)/);
  if (tangMatch) {
    tang = parseInt(tangMatch[1], 10);
  }

  let loaiPhong = 'Phòng lý thuyết';
  if (/^hội trường/i.test(chuoi) || /^ht\b/i.test(chuoi)) {
    loaiPhong = 'Hội trường';
  } else if (/^D71\./i.test(maChuan) || /máy tính/i.test(chuoi)) {
    loaiPhong = 'Phòng máy tính thực hành';
  } else if (/^C11\./i.test(maChuan) || /thí nghiệm|thực hành/i.test(chuoi)) {
    loaiPhong = 'Phòng thực hành - thí nghiệm';
  }

  const tienTo = loaiPhong === 'Hội trường' ? 'Hội trường ' : 'Phòng ';
  const tenPhong = chuoi.startsWith('Phòng ') || chuoi.startsWith('Hội trường ') ? chuoi : `${tienTo}${maChuan}`;
  const viTri = `${loaiPhong} • Tòa nhà ${toaNha}, ${khuVuc}`;

  return {
    ma_phong_chuan: maChuan,
    ten_phong: tenPhong,
    loai_phong: loaiPhong,
    toa_nha: toaNha,
    khu_vuc: khuVuc,
    tang,
    vi_tri: viTri
  };
}

/**
 * Bộ 5 tầng chuẩn hóa phòng động (Dynamic 5-Tier Normalization)
 * @param {string} dauVao 
 * @param {Array} danhSachPhongDb 
 * @returns {object}
 */
function chuanHoaPhong(dauVao, danhSachPhongDb = []) {
  if (!dauVao || typeof dauVao !== 'string') {
    return {
      hopLe: false,
      thongDiep: 'Vui lòng nhập mã phòng học (Ví dụ: D71.103, A42.102, C11.103/1).'
    };
  }

  const chuoiGoc = dauVao.trim();

  // TẦNG 1: Làm sạch chuỗi & chuẩn hóa thành phần
  let s = boDau(chuoiGoc).toLowerCase();
  s = s.replace(/^(phong|hoi truong|ht|p\.|p\s+)/gi, '');
  s = s.replace(/\b(toa nha|nha|khu|tang|lau)\b/gi, '');
  s = s.replace(/[\s\-_,]+/g, ' ').trim();

  // Hỗ trợ đảo ngữ: số trước, tòa sau (VD: '103 d71', '103 nhà d7', 'phòng 103 d7')
  const daoNgu1 = s.match(/^(\d{3}(?:\/\d+)?)\s*([a-z]\d{1,2})$/i);
  if (daoNgu1) {
    s = `${daoNgu1[2]}.${daoNgu1[1]}`;
  } else {
    const daoNgu2 = s.match(/^([a-z]\d{1,2})\s*(\d{3}(?:\/\d+)?)$/i);
    if (daoNgu2) {
      s = `${daoNgu2[1]}.${daoNgu2[2]}`;
    }
  }

  // Dính liền không dấu chấm (VD: 'd71103' -> 'D71.103', 'a42102' -> 'A42.102', 'c11103/1' -> 'C11.103/1')
  const dinhLien = s.match(/^([a-z]\d{2})(\d{3}(?:\/\d+)?)$/i);
  if (dinhLien) {
    s = `${dinhLien[1]}.${dinhLien[2]}`;
  }

  const maSach = s.toUpperCase();

  // Helper tìm kiếm phòng trong danhSachPhongDb
  function timPhongTheoMa(ma) {
    const maUpper = ma.toUpperCase();
    return danhSachPhongDb.find(p => {
      const tenKd = boDau(p.ten_phong).toUpperCase();
      const tenCotLoi = tenKd.replace(/^(PHONG|HOI TRUONG)\s+/i, '').trim();
      return tenCotLoi === maUpper || tenKd === maUpper || p.ten_phong.toUpperCase().includes(maUpper);
    });
  }

  // TẦNG 2: Khớp chính xác 100% trong CSDL
  let phongTimDuoc = timPhongTheoMa(maSach);
  if (phongTimDuoc) {
    const info = phanTichThongTinPhong(phongTimDuoc.ten_phong);
    const laHoiTruong = info?.loai_phong === 'Hội trường' || /^hội trường/i.test(phongTimDuoc.ten_phong);
    return {
      hopLe: true,
      phong: phongTimDuoc,
      phongKhop: phongTimDuoc,
      ma_phong: phongTimDuoc.ma_phong,
      ten_phong: phongTimDuoc.ten_phong,
      maPhongChuan: info ? info.ma_phong_chuan : maSach,
      loai_phong: info ? info.loai_phong : (laHoiTruong ? 'Hội trường' : 'Phòng lý thuyết'),
      laHoiTruong,
      thongTin: info
    };
  }

  // TẦNG 3: Tự động sửa lỗi thiếu "Số khu" (Missing Zone Digit)
  // Ví dụ người dùng gõ: 'A4.102', 'D7.103', 'B3.204', 'C1.103/1', 'D5.101'
  const thieuKhuMatch = maSach.match(/^([A-Z]\d)\.(\d{3}(?:\/\d+)?)$/);
  if (thieuKhuMatch) {
    const toaNhaNgan = thieuKhuMatch[1]; // VD: A4, D7, B3...
    const duoiPhong = thieuKhuMatch[2]; // VD: 102, 103...

    // Tòa A4 thuộc Khu II (số 2); các tòa khác thuộc Khu I (số 1)
    const soKhu = toaNhaNgan === 'A4' ? '2' : '1';
    const maDaSua = `${toaNhaNgan}${soKhu}.${duoiPhong}`;

    const phongSua = timPhongTheoMa(maDaSua);
    if (phongSua) {
      const info = phanTichThongTinPhong(phongSua.ten_phong);
      const laHoiTruong = info?.loai_phong === 'Hội trường' || /^hội trường/i.test(phongSua.ten_phong);
      return {
        hopLe: true,
        tuDongSuaKhu: true,
        phong: phongSua,
        phongKhop: phongSua,
        ma_phong: phongSua.ma_phong,
        ten_phong: phongSua.ten_phong,
        maPhongChuan: info ? info.ma_phong_chuan : maDaSua,
        loai_phong: info ? info.loai_phong : (laHoiTruong ? 'Hội trường' : 'Phòng lý thuyết'),
        laHoiTruong,
        thongTin: info,
        thongDiepXacNhan: `Đã ghi nhận vị trí: ${phongSua.ten_phong} (${info ? `${info.loai_phong} • ${info.vi_tri}` : 'Đại học Trà Vinh'}).`
      };
    }
  }

  // TẦNG 4: Sửa lỗi gõ nhầm số khu hoặc sai nhẹ ký tự (Smart Suggestion - KHÔNG TẠO PHÒNG RÁC)
  const goiYList = [];
  const toaNhaKiemTra = maSach.slice(0, 2);
  const duoiKiemTra = maSach.split('.')[1] || '';

  for (const p of danhSachPhongDb) {
    const infoP = phanTichThongTinPhong(p.ten_phong);
    const maP = infoP ? infoP.ma_phong_chuan : p.ten_phong.replace(/^(phòng|hội trường)\s+/i, '').trim();
    const kc = khoangCachLevenshtein(maSach, maP);
    const cungToa = maP.startsWith(toaNhaKiemTra);
    const cungDuoi = duoiKiemTra && maP.endsWith(duoiKiemTra);

    if (cungToa && cungDuoi) {
      goiYList.push({ ma: maP, kc, uuTien: 1 });
    } else if (cungToa && kc <= 2) {
      goiYList.push({ ma: maP, kc, uuTien: 2 });
    } else if (kc <= 1) {
      goiYList.push({ ma: maP, kc, uuTien: 3 });
    }
  }

  goiYList.sort((a, b) => a.uuTien - b.uuTien || a.kc - b.kc);
  const danhSachGoiY = Array.from(new Set(goiYList.map(g => g.ma))).slice(0, 5);

  let thongDiep = '';
  if (danhSachGoiY.length === 1 || (goiYList.length > 0 && goiYList[0].uuTien === 1)) {
    const goiYChinh = danhSachGoiY[0];
    thongDiep = `Không tìm thấy mã phòng "${chuoiGoc}" trong danh mục phòng học TVU. Có phải bạn muốn nhập: ${goiYChinh}? Vui lòng nhập lại đúng mã phòng (VD: D71.103, A42.102, C11.103/1).`;
  } else if (danhSachGoiY.length > 1) {
    thongDiep = `Không tìm thấy mã phòng "${chuoiGoc}" trong danh mục phòng học TVU. Gợi ý các phòng gần nhất: ${danhSachGoiY.join(', ')}. Vui lòng nhập lại đúng mã phòng (VD: D71.103, A42.102, C11.103/1).`;
  } else {
    thongDiep = `Không tìm thấy phòng "${chuoiGoc}" trong danh mục phòng học TVU. Vui lòng nhập lại đúng mã phòng (VD: D71.103, A42.102, C11.103/1).`;
  }

  return {
    hopLe: false,
    phong: null,
    phongKhop: null,
    goiY: danhSachGoiY,
    thongDiep
  };
}

module.exports = {
  danhSachPhongGoc,
  layDanhSachPhongDb,
  lamMoiCachePhong,
  phanTichThongTinPhong,
  chuanHoaPhong,
  khoangCachLevenshtein
};
