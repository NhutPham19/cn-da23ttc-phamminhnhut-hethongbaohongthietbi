// tests/phongDieuKhien.test.js - Unit tests Quản lý Phòng học TVU & Chuẩn hóa phòng động 5 tầng
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/coSoDuLieu');

const {
  layDanhSachPhong,
  taoPhongMoi,
  capNhatPhong,
  xoaPhong
} = require('../src/controllers/phongDieuKhien');

const {
  chuanHoaPhong,
  phanTichThongTinPhong,
  lamMoiCachePhong,
  layDanhSachPhongDb
} = require('../src/services/phongDichVu');

// Helper mock request response
function taoReqRes({ body = {}, params = {}, query = {}, headers = {}, cookies = {}, nguoiDung = null } = {}) {
  const req = { body, params, query, headers, cookies, nguoiDung, ip: '127.0.0.1' };
  let maStatus = 200;
  let duLieuJson = null;
  const res = {
    status(code) {
      maStatus = code;
      return this;
    },
    json(data) {
      duLieuJson = data;
      return this;
    }
  };
  return { req, res, getStatus: () => maStatus, getJson: () => duLieuJson };
}

// Danh sách mock 10 phòng tiêu biểu cho các bài test controller
const mockDanhSachPhong = [
  { ma_phong: 1, ten_phong: 'Phòng D71.103', _count: { danh_sach_yeu_cau: 3 } },
  { ma_phong: 2, ten_phong: 'Phòng A42.102', _count: { danh_sach_yeu_cau: 0 } },
  { ma_phong: 3, ten_phong: 'Hội trường D51.101', _count: { danh_sach_yeu_cau: 1 } },
  { ma_phong: 4, ten_phong: 'Phòng C11.103/1', _count: { danh_sach_yeu_cau: 0 } },
  { ma_phong: 5, ten_phong: 'Phòng B11.201', _count: { danh_sach_yeu_cau: 2 } },
  { ma_phong: 6, ten_phong: 'Phòng D71.114', _count: { danh_sach_yeu_cau: 0 } },
  { ma_phong: 7, ten_phong: 'Phòng B91.301', _count: { danh_sach_yeu_cau: 0 } },
  { ma_phong: 8, ten_phong: 'Phòng B91.401', _count: { danh_sach_yeu_cau: 0 } },
  { ma_phong: 9, ten_phong: 'Hội trường A21.101', _count: { danh_sach_yeu_cau: 5 } },
  { ma_phong: 10, ten_phong: 'Phòng D41.107', _count: { danh_sach_yeu_cau: 0 } }
];

// =============================================================================
// PHẦN 1: KIỂM THỬ CONTROLLER RESTful API /api/phong
// =============================================================================

test('phongDieuKhien: layDanhSachPhong trả về phân trang, bộ lọc và thống kê KPI', async () => {
  const banGocFindMany = prisma.phong.findMany;
  prisma.phong.findMany = async () => mockDanhSachPhong;

  try {
    // 1. Lấy tất cả có phân trang
    const { req, res, getStatus, getJson } = taoReqRes({
      query: { trang: 1, gioiHan: 5 }
    });
    await layDanhSachPhong(req, res);

    assert.equal(getStatus(), 200);
    const json = getJson();
    assert.equal(json.thanhCong, true);
    assert.equal(json.duLieu.length, 5);
    assert.equal(json.phanTrang.tongSoPhong, 10);
    assert.equal(json.phanTrang.tongSoTrang, 2);
    assert.equal(json.thongKe.tongSoPhong, 10);
    assert.equal(json.thongKe.soHoiTruong, 2);

    // 2. Lọc theo từ khóa
    const { req: reqTk, res: resTk, getJson: getJsonTk } = taoReqRes({
      query: { tuKhoa: 'D71' }
    });
    await layDanhSachPhong(reqTk, resTk);
    const jsonTk = getJsonTk();
    assert.equal(jsonTk.phanTrang.tongSoPhong, 2);
    assert.ok(jsonTk.duLieu.every(p => p.ten_phong.includes('D71')));

    // 3. Lọc theo loại phòng
    const { req: reqLp, res: resLp, getJson: getJsonLp } = taoReqRes({
      query: { loaiPhong: 'Hội trường' }
    });
    await layDanhSachPhong(reqLp, resLp);
    const jsonLp = getJsonLp();
    assert.equal(jsonLp.phanTrang.tongSoPhong, 2);
    assert.ok(jsonLp.duLieu.every(p => p.loai_phong === 'Hội trường'));

    // 4. Lọc theo tòa nhà
    const { req: reqTn, res: resTn, getJson: getJsonTn } = taoReqRes({
      query: { toaNha: 'B9' }
    });
    await layDanhSachPhong(reqTn, resTn);
    const jsonTn = getJsonTn();
    assert.equal(jsonTn.phanTrang.tongSoPhong, 2);
  } finally {
    prisma.phong.findMany = banGocFindMany;
  }
});

test('phongDieuKhien: taoPhongMoi thêm phòng chuẩn TVU thành công và chặn mã sai/trùng', async () => {
  const banGocFindFirst = prisma.phong.findFirst;
  const banGocCreate = prisma.phong.create;

  try {
    // 1. Chặn mã phòng không theo chuẩn TVU (400)
    const { req: reqSai, res: resSai, getStatus: getStatusSai, getJson: getJsonSai } = taoReqRes({
      body: { ma_phong_chuan: 'PHONG_101', loai_phong: 'Phòng lý thuyết' }
    });
    await taoPhongMoi(reqSai, resSai);
    assert.equal(getStatusSai(), 400);
    assert.equal(getJsonSai().thanhCong, false);
    assert.match(getJsonSai().loi, /quy chuẩn TVU/i);

    // 2. Chặn trùng phòng đã tồn tại (409)
    prisma.phong.findFirst = async ({ where }) => {
      if (where.ten_phong.equals === 'Phòng D71.103') {
        return { ma_phong: 1, ten_phong: 'Phòng D71.103' };
      }
      return null;
    };

    const { req: reqTrung, res: resTrung, getStatus: getStatusTrung, getJson: getJsonTrung } = taoReqRes({
      body: { ma_phong_chuan: 'D71.103', loai_phong: 'Phòng lý thuyết' }
    });
    await taoPhongMoi(reqTrung, resTrung);
    assert.equal(getStatusTrung(), 409);
    assert.equal(getJsonTrung().thanhCong, false);
    assert.match(getJsonTrung().loi, /đã tồn tại/i);

    // 3. Thêm phòng mới đúng chuẩn TVU thành công (201)
    prisma.phong.create = async ({ data }) => {
      return { ma_phong: 999, ten_phong: data.ten_phong };
    };

    const { req: reqOk, res: resOk, getStatus: getStatusOk, getJson: getJsonOk } = taoReqRes({
      body: { ma_phong_chuan: 'D71.201', loai_phong: 'Phòng lý thuyết' }
    });
    await taoPhongMoi(reqOk, resOk);
    assert.equal(getStatusOk(), 201);
    const jsonOk = getJsonOk();
    assert.equal(jsonOk.thanhCong, true);
    assert.equal(jsonOk.duLieu.ten_phong, 'Phòng D71.201');
    assert.equal(jsonOk.duLieu.toa_nha, 'D7');
    assert.equal(jsonOk.duLieu.khu_vuc, 'Khu I');
  } finally {
    prisma.phong.findFirst = banGocFindFirst;
    prisma.phong.create = banGocCreate;
  }
});

test('phongDieuKhien: capNhatPhong đổi tên chuẩn và đồng bộ bảng yêu cầu báo hỏng trong Transaction', async () => {
  const banGocFindUnique = prisma.phong.findUnique;
  const banGocFindFirst = prisma.phong.findFirst;
  const banGocTransaction = prisma.$transaction;

  let daCapNhatYeuCau = false;
  let tenCapNhatDb = '';

  prisma.phong.findUnique = async ({ where }) => {
    if (where.ma_phong === 1) return { ma_phong: 1, ten_phong: 'Phòng D71.103' };
    return null;
  };

  prisma.phong.findFirst = async () => null; // Không trùng

  prisma.$transaction = async (callback) => {
    const tx = {
      phong: {
        update: async ({ where, data }) => {
          tenCapNhatDb = data.ten_phong;
          return { ma_phong: where.ma_phong, ten_phong: data.ten_phong };
        }
      },
      yeu_cau_bao_hong: {
        updateMany: async ({ where, data }) => {
          daCapNhatYeuCau = true;
          assert.equal(data.vi_tri_phong, tenCapNhatDb);
          return { count: 3 };
        }
      }
    };
    return await callback(tx);
  };

  try {
    // 1. Thất bại khi không tìm thấy phòng (404)
    const { req: req404, res: res404, getStatus: getStatus404 } = taoReqRes({
      params: { id: 999 },
      body: { ma_phong_chuan: 'D71.105' }
    });
    await capNhatPhong(req404, res404);
    assert.equal(getStatus404(), 404);

    // 2. Cập nhật thành công và kích hoạt Transaction đồng bộ
    const { req, res, getStatus, getJson } = taoReqRes({
      params: { id: 1 },
      body: { ma_phong_chuan: 'D71.105', loai_phong: 'Phòng máy tính thực hành' }
    });
    await capNhatPhong(req, res);

    assert.equal(getStatus(), 200);
    assert.equal(getJson().thanhCong, true);
    assert.equal(tenCapNhatDb, 'Phòng D71.105');
    assert.equal(daCapNhatYeuCau, true);
  } finally {
    prisma.phong.findUnique = banGocFindUnique;
    prisma.phong.findFirst = banGocFindFirst;
    prisma.$transaction = banGocTransaction;
  }
});

test('phongDieuKhien: xoaPhong chặn xóa phòng có FK yêu cầu (409) và xóa an toàn khi số yêu cầu = 0 (200)', async () => {
  const banGocFindUnique = prisma.phong.findUnique;
  const banGocCount = prisma.yeu_cau_bao_hong.count;
  const banGocDelete = prisma.phong.delete;

  let daGoiDelete = false;

  prisma.phong.findUnique = async ({ where }) => {
    if (where.ma_phong === 1) return { ma_phong: 1, ten_phong: 'Phòng D71.103' };
    if (where.ma_phong === 2) return { ma_phong: 2, ten_phong: 'Phòng A42.102' };
    return null;
  };

  prisma.yeu_cau_bao_hong.count = async ({ where }) => {
    if (where.ma_phong === 1) return 3; // Có 3 yêu cầu
    if (where.ma_phong === 2) return 0; // Chưa có yêu cầu nào
    return 0;
  };

  prisma.phong.delete = async ({ where }) => {
    daGoiDelete = true;
    return { ma_phong: where.ma_phong };
  };

  try {
    // 1. Chặn xóa phòng D71.103 vì có 3 yêu cầu (409)
    const { req: req1, res: res1, getStatus: getStatus1, getJson: getJson1 } = taoReqRes({
      params: { id: 1 }
    });
    await xoaPhong(req1, res1);

    assert.equal(getStatus1(), 409);
    assert.equal(getJson1().thanhCong, false);
    assert.match(getJson1().loi, /3 yêu cầu/i);
    assert.equal(daGoiDelete, false);

    // 2. Cho phép xóa phòng A42.102 vì 0 yêu cầu (200)
    const { req: req2, res: res2, getStatus: getStatus2, getJson: getJson2 } = taoReqRes({
      params: { id: 2 }
    });
    await xoaPhong(req2, res2);

    assert.equal(getStatus2(), 200);
    assert.equal(getJson2().thanhCong, true);
    assert.equal(daGoiDelete, true);
  } finally {
    prisma.phong.findUnique = banGocFindUnique;
    prisma.yeu_cau_bao_hong.count = banGocCount;
    prisma.phong.delete = banGocDelete;
  }
});

// =============================================================================
// PHẦN 2: KIỂM THỬ 5 TẦNG CHUẨN HÓA PHÒNG ĐỘNG (chuanHoaPhong)
// =============================================================================

test('chuanHoaPhong: Tầng 1 & 2 - Khớp 100% mã chuẩn và làm sạch từ thừa / đảo trật tự', () => {
  const dsPhong = [
    { ma_phong: 1, ten_phong: 'Phòng D71.103' },
    { ma_phong: 2, ten_phong: 'Phòng A42.102' },
    { ma_phong: 3, ten_phong: 'Hội trường D51.101' },
    { ma_phong: 4, ten_phong: 'Phòng C11.103/1' },
    { ma_phong: 5, ten_phong: 'Phòng D71.114' }
  ];

  // 1. Nhập chuẩn sẵn
  const kq1 = chuanHoaPhong('D71.103', dsPhong);
  assert.equal(kq1.hopLe, true);
  assert.equal(kq1.phong.ten_phong, 'Phòng D71.103');
  assert.equal(kq1.maPhongChuan, 'D71.103');

  // 2. Viết dính không dấu chấm
  const kq2 = chuanHoaPhong('d71103', dsPhong);
  assert.equal(kq2.hopLe, true);
  assert.equal(kq2.phong.ten_phong, 'Phòng D71.103');

  // 3. Có từ thừa 'phòng', 'nhà', chữ hoa/thường
  const kq3 = chuanHoaPhong('phòng d71 103', dsPhong);
  assert.equal(kq3.hopLe, true);
  assert.equal(kq3.phong.ten_phong, 'Phòng D71.103');

  // 4. Đảo ngược trật tự nói tự nhiên: "103 nhà d71", "103 d71"
  const kq4 = chuanHoaPhong('103 nhà d71', dsPhong);
  assert.equal(kq4.hopLe, true);
  assert.equal(kq4.phong.ten_phong, 'Phòng D71.103');

  // 5. Hậu tố phân nhánh /1
  const kq5 = chuanHoaPhong('c11103/1', dsPhong);
  assert.equal(kq5.hopLe, true);
  assert.equal(kq5.phong.ten_phong, 'Phòng C11.103/1');
});

test('chuanHoaPhong: Tầng 3 - Tự động sửa lỗi thiếu Số khu TVU (Auto-Fix Missing Zone Digit)', () => {
  const dsPhong = [
    { ma_phong: 1, ten_phong: 'Phòng D71.103' },
    { ma_phong: 2, ten_phong: 'Phòng A42.102' },
    { ma_phong: 3, ten_phong: 'Hội trường D51.101' },
    { ma_phong: 4, ten_phong: 'Phòng C11.103/1' }
  ];

  // a4 102 (Khu II) -> A42.102
  const kqA4 = chuanHoaPhong('a4 102', dsPhong);
  assert.equal(kqA4.hopLe, true);
  assert.equal(kqA4.phong.ten_phong, 'Phòng A42.102');
  assert.equal(kqA4.tuDongSuaKhu, true);
  assert.ok(kqA4.thongDiepXacNhan.includes('A42.102'));

  // d7.103 (Khu I) -> D71.103
  const kqD7 = chuanHoaPhong('d7.103', dsPhong);
  assert.equal(kqD7.hopLe, true);
  assert.equal(kqD7.phong.ten_phong, 'Phòng D71.103');
  assert.equal(kqD7.tuDongSuaKhu, true);

  // c1 103/1 -> C11.103/1
  const kqC1 = chuanHoaPhong('c1 103/1', dsPhong);
  assert.equal(kqC1.hopLe, true);
  assert.equal(kqC1.phong.ten_phong, 'Phòng C11.103/1');
  assert.equal(kqC1.tuDongSuaKhu, true);
});

test('chuanHoaPhong: Tầng 4 - Smart Suggestions khi gõ sai/nhầm và KHÔNG tạo phòng rác', () => {
  const dsPhong = [
    { ma_phong: 1, ten_phong: 'Phòng D71.103' },
    { ma_phong: 2, ten_phong: 'Phòng D71.114' },
    { ma_phong: 3, ten_phong: 'Phòng B91.301' },
    { ma_phong: 4, ten_phong: 'Phòng B91.401' }
  ];

  // 1. Nhập nhầm số khu 'D75.114' (thừa/sai số 5 thay vì 1) -> gợi ý 'D71.114'
  const kqD75 = chuanHoaPhong('D75.114', dsPhong);
  assert.equal(kqD75.hopLe, false);
  assert.equal(kqD75.phong, null);
  assert.ok(kqD75.goiY.length > 0);
  assert.ok(kqD75.goiY.includes('D71.114'));
  assert.match(kqD75.thongDiep, /Không tìm thấy mã phòng/i);
  assert.match(kqD75.thongDiep, /D71\.114/i);

  // 2. Nhập phòng không tồn tại 'B91.304' -> gợi ý các phòng cùng tòa 'B91.301', 'B91.401'
  const kqB91 = chuanHoaPhong('B91.304', dsPhong);
  assert.equal(kqB91.hopLe, false);
  assert.equal(kqB91.phong, null);
  assert.ok(kqB91.goiY.includes('B91.301') || kqB91.goiY.includes('B91.401'));
});

test('chuanHoaPhong: Tầng 5 - Tự động nhận diện Hội trường để nâng ưu tiên tối thiểu CAO', () => {
  const dsPhong = [
    { ma_phong: 1, ten_phong: 'Hội trường D51.101' },
    { ma_phong: 2, ten_phong: 'Phòng D71.103' }
  ];

  // Gõ d5 101 -> Hội trường D51.101
  const kqHoiTruong = chuanHoaPhong('d5 101', dsPhong);
  assert.equal(kqHoiTruong.hopLe, true);
  assert.equal(kqHoiTruong.phong.ten_phong, 'Hội trường D51.101');
  assert.equal(kqHoiTruong.laHoiTruong, true);
  assert.equal(kqHoiTruong.thongTin?.loai_phong, 'Hội trường');

  // Gõ phòng học bình thường
  const kqPhongThuong = chuanHoaPhong('D71.103', dsPhong);
  assert.equal(kqPhongThuong.hopLe, true);
  assert.equal(kqPhongThuong.laHoiTruong, false);
});

test('phongDichVu: Phòng mới Admin thêm qua POST /api/phong được nhận diện ngay lập tức', async () => {
  const banGocFindMany = prisma.phong.findMany;

  // Giả lập trạng thái ban đầu: chỉ có 1 phòng
  let mockDb = [{ ma_phong: 1, ten_phong: 'Phòng D71.103' }];
  prisma.phong.findMany = async () => mockDb;

  try {
    lamMoiCachePhong();
    let dsHienTai = await layDanhSachPhongDb();
    let kqBanDau = chuanHoaPhong('D71.201', dsHienTai);
    assert.equal(kqBanDau.hopLe, false);

    // Admin vừa thêm phòng D71.201
    mockDb.push({ ma_phong: 99, ten_phong: 'Phòng D71.201' });
    lamMoiCachePhong(); // Reset in-memory cache

    dsHienTai = await layDanhSachPhongDb();
    let kqSauKhiThem = chuanHoaPhong('D71.201', dsHienTai);
    assert.equal(kqSauKhiThem.hopLe, true);
    assert.equal(kqSauKhiThem.phong.ten_phong, 'Phòng D71.201');
  } finally {
    prisma.phong.findMany = banGocFindMany;
    lamMoiCachePhong();
  }
});

// =============================================================================
// PHẦN 3: KIỂM THỬ PHÂN QUYỀN TUYẾN ĐƯỜNG API /api/phong
// =============================================================================

test('apiTuyenDuong: Tuyến /api/phong chặn KTV ghi dữ liệu (403) và cho phép ADMIN', () => {
  const { kiemTraDangNhap, kiemTraQuyenAdmin } = require('../src/middlewares/kiemTraXacThuc');

  // 1. KTV gọi API có middleware kiemTraQuyenAdmin -> bị chặn 403
  const { req: reqKtv, res: resKtv, getStatus: getStatusKtv, getJson: getJsonKtv } = taoReqRes({
    nguoiDung: { ma_nguoi_dung: 2, tai_khoan: 'ktv01', vai_tro: 'KTV' }
  });
  let nextGoi = false;
  kiemTraQuyenAdmin(reqKtv, resKtv, () => { nextGoi = true; });

  assert.equal(getStatusKtv(), 403);
  assert.equal(getJsonKtv().thanhCong, false);
  assert.equal(nextGoi, false);

  // 2. ADMIN gọi API có middleware kiemTraQuyenAdmin -> được đi tiếp (next)
  const { req: reqAdmin, res: resAdmin } = taoReqRes({
    nguoiDung: { ma_nguoi_dung: 1, tai_khoan: 'admin', vai_tro: 'ADMIN' }
  });
  let nextAdminGoi = false;
  kiemTraQuyenAdmin(reqAdmin, resAdmin, () => { nextAdminGoi = true; });

  assert.equal(nextAdminGoi, true);
});
