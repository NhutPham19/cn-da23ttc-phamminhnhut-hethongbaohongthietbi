// src/utils/tienIch.js - Các hàm tiện ích hỗ trợ toàn hệ thống
// Quy chuẩn Ponytail: Thực dụng, không dùng thư viện ngoài nếu Node.js có sẵn

/**
 * Làm sạch dữ liệu chữ đầu vào để chống tấn công XSS / ký tự lạ
 * @param {string} chuoi - Chuỗi ký tự cần làm sạch
 * @returns {string} Chuỗi an toàn tối đa 500 ký tự
 */
function lamSachDuLieu(chuoi) {
  if (!chuoi) return '';
  return String(chuoi).replace(/<[^>]*>?/gm, '').trim().substring(0, 500);
}

/**
 * Chuyển chuỗi tiếng Việt có dấu thành không dấu, chuyển chữ thường và cắt khoảng trắng thừa
 * Giúp nhận diện lệnh từ Zalo Bot mềm dẻo (Báo hỏng, BAOHONG, bao hong...)
 * @param {string} chuoi 
 * @returns {string}
 */
function boDau(chuoi) {
  if (!chuoi) return '';
  return String(chuoi)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Sinh mã yêu cầu tự động: #YC + NămThángNgày (Asia/Ho_Chi_Minh) + 4 số ngẫu nhiên
 * Ví dụ: #YC202610298492 (Tổng 15 ký tự, phù hợp VarChar(20))
 * @returns {string}
 */
function taoMaYeuCau() {
  const bayGio = new Date();
  const formatNgay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(bayGio);
  const ngay = formatNgay.replace(/-/g, '');
  const soNgauNhien = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `#YC${ngay}${soNgauNhien}`;
}

/**
 * Chuyển mã trạng thái CSDL sang tiếng Việt thân thiện
 * @param {string} trangThai 
 * @returns {string}
 */
function dinhDangTrangThai(trangThai) {
  switch (trangThai) {
    case 'CHO_XU_LY': return 'Chờ xử lý';
    case 'DANG_XU_LY': return 'Đang xử lý';
    case 'HOAN_THANH': return 'Đã hoàn thành';
    case 'HUY': return 'Đã hủy';
    default: return trangThai || 'Không xác định';
  }
}

/**
 * Kiểm tra tính hợp lệ của việc chuyển đổi trạng thái
 * Quy tắc:
 * - CHO_XU_LY -> DANG_XU_LY hoặc HUY
 * - DANG_XU_LY -> HOAN_THANH hoặc HUY
 * - HOAN_THANH, HUY: Trạng thái cuối, không thể đổi sang bất kỳ trạng thái nào khác
 * @param {string} trangThaiHienTai 
 * @param {string} trangThaiMoi 
 * @returns {boolean}
 */
function kiemTraChuyenTrangThai(trangThaiHienTai, trangThaiMoi) {
  const cacChuyenDoiHopLe = {
    'CHO_XU_LY': ['DANG_XU_LY', 'HUY'],
    'DANG_XU_LY': ['HOAN_THANH', 'HUY'],
    'HOAN_THANH': [],
    'HUY': []
  };

  const danhSachHopLe = cacChuyenDoiHopLe[trangThaiHienTai] || [];
  return danhSachHopLe.includes(trangThaiMoi);
}

/**
 * Chuẩn hóa lệnh Zalo Bot: nhận diện linh hoạt các biến thể và quy về bộ lệnh chuẩn
 * Bộ lệnh chuẩn: 'baohong', 'tracuu', 'huyyeucau', 'id', 'trogiup'
 * @param {string} vanBan - Chuỗi tin nhắn người dùng nhập
 * @returns {{ lenh: string, doiSo: string, chuoiGoc: string }}
 */
function chuanHoaLenhZalo(vanBan) {
  if (!vanBan) return { lenh: '', doiSo: '', chuoiGoc: '' };
  const chuoiGoc = String(vanBan).trim();
  const khongDau = boDau(chuoiGoc);

  // 1. Lệnh baohong (báo hỏng, bao hong, start)
  if (khongDau === 'baohong' || khongDau === 'bao hong' || khongDau === 'start' || khongDau === '/start' || khongDau === '/baohong') {
    return { lenh: 'baohong', doiSo: '', chuoiGoc };
  }

  // 2. Lệnh id
  if (khongDau === 'id' || khongDau === '/id') {
    return { lenh: 'id', doiSo: '', chuoiGoc };
  }

  // 3. Lệnh trogiup (trợ giúp, tro giup, help)
  if (khongDau === 'trogiup' || khongDau === 'tro giup' || khongDau === 'help' || khongDau === '/help' || khongDau === '/trogiup') {
    return { lenh: 'trogiup', doiSo: '', chuoiGoc };
  }

  // 4. Lệnh tracuu: "tracuu [MÃ]", "tra cuu [MÃ]"
  if (/^(tracuu|tra\s+cuu)(\s+|$)/i.test(khongDau)) {
    const doiSo = chuoiGoc.replace(/^(tracuu|tra\s+c[uứ]u)\s*/i, '').trim();
    return { lenh: 'tracuu', doiSo, chuoiGoc };
  }

  // 5. Lệnh huyyeucau: "huyyeucau [MÃ] [Lý do]", "huy yeu cau...", "huy..."
  if (/^(huyyeucau|huy\s+yeu\s+cau|huy)(\s+|$)/i.test(khongDau)) {
    const doiSo = chuoiGoc.replace(/^(huyyeucau|h[uủ]y\s+y[eê]u\s+c[aầ]u|h[uủ]y)\s*/i, '').trim();
    return { lenh: 'huyyeucau', doiSo, chuoiGoc };
  }

  return { lenh: '', doiSo: '', chuoiGoc };
}

// =========================================================================
// 6. PHÂN LOẠI & CHUẨN HÓA DỮ LIỆU TỰ ĐỘNG CHO ZALO BOT (4 BƯỚC THÔNG MINH)
// =========================================================================

const TEN_DANH_MUC_CHUAN = {
  1: 'Máy chiếu / Màn chiếu',
  2: 'Máy tính để bàn (PC) / Màn hình',
  3: 'Điều hòa / Máy lạnh',
  4: 'Âm thanh (Micro, Loa, Amply)',
  5: 'Hệ thống Điện / Đèn / Quạt',
  6: 'Thiết bị Mạng (Wifi, Switch) / Khác'
};

const TU_DIEN_DANH_MUC = [
  {
    nhom: 1, // Máy chiếu
    tuKhoa: [
      'man hinh chieu', 'may chieu', 'man chieu', 'chieu', 'projector',
      'bong chieu', 'remote chieu', 'day hdmi', 'day vga', 'cap chieu', 'may chiu'
    ]
  },
  {
    nhom: 2, // Máy tính / PC
    tuKhoa: [
      'may vi tinh', 'may tinh ban', 'may tram', 'may tinh', 'thung may',
      'ban phim', 'keyboard', 'chuot', 'mouse', 'pc', 'man hinh', 'lcd',
      'monitor', 'cpu', 'case'
    ]
  },
  {
    nhom: 3, // Điều hòa / Máy lạnh
    tuKhoa: [
      'remote dieu hoa', 'remote lanh', 'chay nuoc may lanh', 'dieu hoa nhiet do',
      'dieu hoa', 'may lanh', 'lanh', 'ac', 'aircon', 'cuc lanh', 'cuc nong'
    ]
  },
  {
    nhom: 4, // Âm thanh
    tuKhoa: [
      'mic khong day', 'khong keu', 'hu mic', 'am thanh', 'micro', 'mic',
      'loa', 'amply', 'ampli', 'mixer'
    ]
  },
  {
    nhom: 5, // Điện / Đèn / Quạt
    tuKhoa: [
      'bong den', 'den tuyp', 'den led', 'quat tran', 'quat treo', 'o cam',
      'cong tac', 'cau dao', 'aptomat', 'mat dien', 'chap dien', 'dien', 'den', 'quat', 'cb'
    ]
  },
  {
    nhom: 6, // Mạng / Khác
    tuKhoa: [
      'day mang', 'cap mang', 'mat mang', 'rot mang', 'khoa cua', 'ban ghe',
      'mang', 'wifi', 'internet', 'switch', 'router', 'modem', 'rj45', 'cua', 'bang'
    ]
  }
];

/**
 * Tìm ma_danh_muc trong CSDL tương ứng với nhóm (1..6)
 */
function layMaDanhMucTheoNhom(soNhom, danhSachDanhMucDB = []) {
  if (!Array.isArray(danhSachDanhMucDB) || danhSachDanhMucDB.length === 0) {
    const BAN_DO_MAC_DINH = { 1: 1, 2: 3, 3: 2, 4: 4, 5: 8, 6: 6 };
    return BAN_DO_MAC_DINH[soNhom] || 8;
  }

  const timTheoTuKhoa = (tuKhoas) => {
    return danhSachDanhMucDB.find((dm) => {
      const tenKhongDau = boDau(dm.ten_loai);
      return tuKhoas.some((tk) => tenKhongDau.includes(tk));
    });
  };

  let dm = null;
  switch (soNhom) {
    case 1:
      dm = timTheoTuKhoa(['chieu', 'projector']);
      break;
    case 2:
      dm = timTheoTuKhoa(['may tinh', 'pc', 'desktop']);
      break;
    case 3:
      dm = timTheoTuKhoa(['dieu hoa', 'may lanh', 'air-conditioner']);
      break;
    case 4:
      dm = timTheoTuKhoa(['am thanh', 'loa', 'micro', 'speaker']);
      break;
    case 5:
      dm = timTheoTuKhoa(['dien', 'den', 'quat']) || timTheoTuKhoa(['khac', 'other']);
      break;
    case 6:
      dm = timTheoTuKhoa(['mang', 'wifi', 'switch']) || timTheoTuKhoa(['khac', 'other']);
      break;
  }

  if (dm) return dm.ma_danh_muc;
  const dmKhac = timTheoTuKhoa(['khac', 'other']) || danhSachDanhMucDB[danhSachDanhMucDB.length - 1];
  return dmKhac ? dmKhac.ma_danh_muc : 1;
}

/**
 * Nhận diện danh mục thiết bị kép (Số 1..6 hoặc Chữ tự do với từ điển mở rộng)
 * @param {string} vanBanNhap 
 * @param {Array} danhSachDanhMucDB 
 * @returns {{ ma_danh_muc: number, ten_thiet_bi: string, nhom: number }}
 */
function nhanDienDanhMucThietBi(vanBanNhap, danhSachDanhMucDB = []) {
  if (!vanBanNhap) {
    return {
      ma_danh_muc: layMaDanhMucTheoNhom(6, danhSachDanhMucDB),
      ten_thiet_bi: 'Thiết bị chưa đặt tên',
      nhom: 6
    };
  }

  const str = String(vanBanNhap).trim();
  const khongDau = boDau(str).toLowerCase();

  // TH1: Nhập số ở đầu câu (1-6) kèm hoặc không kèm tên chi tiết
  const khopSo = str.match(/^\s*([1-6])(?:\s*[-.:)]?\s*(.*))?$/);
  if (khopSo) {
    const soNhom = parseInt(khopSo[1], 10);
    const chiTiet = khopSo[2] ? khopSo[2].trim() : '';
    const tenThietBi = chiTiet || TEN_DANH_MUC_CHUAN[soNhom];
    return {
      ma_danh_muc: layMaDanhMucTheoNhom(soNhom, danhSachDanhMucDB),
      ten_thiet_bi: tenThietBi,
      nhom: soNhom
    };
  }

  // TH2: Nhập chữ tự do -> quét qua bộ từ điển mở rộng
  for (const item of TU_DIEN_DANH_MUC) {
    for (const tk of item.tuKhoa) {
      if (tk.length <= 3) {
        const regex = new RegExp('(?:^|\\s|[-.,/])' + tk + '(?:$|\\s|[-.,/])', 'i');
        if (regex.test(khongDau)) {
          return {
            ma_danh_muc: layMaDanhMucTheoNhom(item.nhom, danhSachDanhMucDB),
            ten_thiet_bi: str,
            nhom: item.nhom
          };
        }
      } else {
        if (khongDau.includes(tk)) {
          return {
            ma_danh_muc: layMaDanhMucTheoNhom(item.nhom, danhSachDanhMucDB),
            ten_thiet_bi: str,
            nhom: item.nhom
          };
        }
      }
    }
  }

  // Không khớp bất kỳ từ khóa nào -> xếp vào nhóm 6 (Khác)
  return {
    ma_danh_muc: layMaDanhMucTheoNhom(6, danhSachDanhMucDB),
    ten_thiet_bi: str,
    nhom: 6
  };
}

/**
 * Tự động chuẩn hóa tên phòng học theo Regex
 * Hỗ trợ D71.103, B3.204, B204, Lab 1, Hội trường E...
 * @param {string} vanBanPhong 
 * @returns {string} Tên phòng đã chuẩn hóa (VD: "Phòng D71.103", "Phòng Lab 1", "Hội trường E")
 */
function chuanHoaTenPhong(vanBanPhong) {
  if (!vanBanPhong) return 'Chưa rõ phòng';
  const str = String(vanBanPhong).trim();

  // Bỏ chữ 'phòng', 'phong', 'p.' hoặc 'p' đứng trước số (VD: p103 -> 103, p.103 -> 103)
  const sach = boDau(str).toLowerCase()
    .replace(/\bphong\b/g, '')
    .replace(/\bp\.?\s*(\d{3})\b/g, (m, p1) => p1)
    .trim();

  // Quy tắc 2.1: Hội trường (hội trường e, hoi truong a...)
  const khopHoiTruong = sach.match(/hoi\s*truong\s*([a-z0-9]+)/i);
  if (khopHoiTruong) {
    return 'Hội trường ' + khopHoiTruong[1].toUpperCase();
  }

  // Quy tắc 2.2: Phòng Lab (phòng lab 1, lab 02, lab1...)
  const khopLab = sach.match(/lab\s*(\d+)/i);
  if (khopLab) {
    const soLab = parseInt(khopLab[1], 10);
    return 'Phòng Lab ' + soLab;
  }

  // Quy tắc 1.1: Tòa nhà có chữ + số (d71, b3) và số phòng 3 chữ số (103, 204)
  const khopToa = sach.match(/\b([a-mo-z]\d{1,2})\b/i);
  const khopSoPhong = sach.match(/\b(\d{3})\b/);

  if (khopToa && khopSoPhong) {
    const maToa = khopToa[1].toUpperCase();
    const soPhong = khopSoPhong[1];
    return 'Phòng ' + maToa + '.' + soPhong;
  }

  // Quy tắc 1.2: Tòa 1 chữ cái + 3 số liền nhau (b204, c102, a101...)
  const khopLien = sach.match(/\b([a-mo-z])(\d{3})\b/i);
  if (khopLien) {
    const chuCai = khopLien[1].toUpperCase();
    const soPhong = khopLien[2];
    return 'Phòng ' + chuCai + soPhong;
  }

  // Quy tắc 1.3: Tòa 1 chữ cái và 3 số tách rời (b 204, c 102...)
  const khopTach = sach.match(/\b([a-mo-z])\s+(\d{3})\b/i);
  if (khopTach) {
    return 'Phòng ' + khopTach[1].toUpperCase() + khopTach[2];
  }

  // Fallback: Nếu không khớp regex nào, giữ nguyên chuỗi người dùng và thêm tiền tố Phòng nếu cần
  if (/^phòng\s+/i.test(str) || /^phong\s+/i.test(str)) {
    return 'Phòng ' + str.replace(/^phòng\s+/i, '').replace(/^phong\s+/i, '').trim();
  }

  return str;
}

const TU_KHOA_KHAN_CAP = [
  'chap dien', 'chay', 'no', 'boc khoi', 'khoi', 'mui khet', 'khet',
  'ro dien', 'giat dien', 'tia lua', 'ngap nuoc', 'vo ong nuoc', 'roi', 'sap'
];

const TU_KHOA_CAO = [
  'dang thi', 'coi thi', 'hoi truong', 'mat dien ca phong', 'mat nguon',
  'khong len nguon', 'khong len hinh', 'sap dien', 'khan cap', 'gap'
];

/**
 * Tự động nhận diện mức độ rủi ro & gán mức ưu tiên (KHAN_CAP, CAO, BINH_THUONG)
 * @param {string} moTaLoi 
 * @param {string} viTriPhong 
 * @returns {'KHAN_CAP' | 'CAO' | 'BINH_THUONG'}
 */
function tuDongGanMucDoUuTien(moTaLoi = '', viTriPhong = '') {
  const chuoiQuet = boDau(String(moTaLoi) + ' ' + String(viTriPhong)).toLowerCase();

  for (const tk of TU_KHOA_KHAN_CAP) {
    if (tk.length <= 4) {
      const regex = new RegExp('(?:^|\\s|[-.,/])' + tk + '(?:$|\\s|[-.,/])', 'i');
      if (regex.test(chuoiQuet)) return 'KHAN_CAP';
    } else {
      if (chuoiQuet.includes(tk)) return 'KHAN_CAP';
    }
  }

  for (const tk of TU_KHOA_CAO) {
    if (tk.length <= 4) {
      const regex = new RegExp('(?:^|\\s|[-.,/])' + tk + '(?:$|\\s|[-.,/])', 'i');
      if (regex.test(chuoiQuet)) return 'CAO';
    } else {
      if (chuoiQuet.includes(tk)) return 'CAO';
    }
  }

  return 'BINH_THUONG';
}

module.exports = {
  lamSachDuLieu,
  boDau,
  taoMaYeuCau,
  dinhDangTrangThai,
  kiemTraChuyenTrangThai,
  chuanHoaLenhZalo,
  TEN_DANH_MUC_CHUAN,
  TU_DIEN_DANH_MUC,
  nhanDienDanhMucThietBi,
  chuanHoaTenPhong,
  tuDongGanMucDoUuTien
};
