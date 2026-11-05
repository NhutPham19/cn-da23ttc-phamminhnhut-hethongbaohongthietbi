const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = 'khoa-bi-mat-chi-dung-cho-kiem-thu-0123456789abcdef';

// Thay module thật bằng đối tượng giả TRƯỚC KHI nạp controller
function datDoiTuongGia(duongDanTuongDoi, doiTuongGia) {
  const duongDan = require.resolve(duongDanTuongDoi);
  require.cache[duongDan] = { id: duongDan, filename: duongDan, loaded: true, exports: doiTuongGia };
}

let yeuCauTraVe = null;
let soDongCapNhat = 1;

const yeuCauMau = {
  ma_yeu_cau_bao_hong: 7,
  ma_yeu_cau: '#YC202610281234',
  trang_thai: 'CHO_XU_LY',
  ma_ky_thuat_vien: null,
  ma_nguoi_bao_zalo: null, // null → bỏ qua bước gửi Zalo
  ten_thiet_bi: 'May chieu',
  vi_tri_phong: 'B204',
  ky_thuat_vien: null
};

const prismaGia = {
  yeu_cau_bao_hong: {
    findFirst: async () => yeuCauTraVe,
    updateMany: async () => ({ count: soDongCapNhat }),
    findUnique: async () => ({ ...yeuCauMau, trang_thai: 'DANG_XU_LY', ky_thuat_vien: { ho_ten: 'KTV Mot' } }),
    update: async ({ data }) => ({ ...yeuCauMau, ...data })
  },
  nguoi_dung: {
    findUnique: async () => ({
      ma_nguoi_dung: 2,
      ho_ten: 'KTV Hai',
      vai_tro: 'KTV',
      trang_thai_hoat_dong: true
    })
  },
  lich_su_xu_ly: { create: async () => ({}) },
  phong: { findUnique: async () => ({ ma_phong: 1 }) },
  danh_muc_thiet_bi: { findUnique: async () => ({ ma_danh_muc: 1 }) },
  $transaction: async (hamXuLy) => hamXuLy(prismaGia)
};

datDoiTuongGia('../src/config/coSoDuLieu', prismaGia);
datDoiTuongGia('../src/services/zaloDichVu', { guiTinNhanZalo: async () => {} });

const boDieuKhien = require('../src/controllers/yeuCauDieuKhien');
const { tinhChiSoSla } = require('../src/controllers/thongKeDieuKhien');

function taoResGia() {
  return {
    statusCode: 200,
    body: null,
    status(maTrangThai) { this.statusCode = maTrangThai; return this; },
    json(duLieu) { this.body = duLieu; return this; }
  };
}

const ktvMot = { ma_nguoi_dung: 2, ho_ten: 'KTV Hai', vai_tro: 'KTV' };

test('capNhatTrangThaiYeuCau: trả 409 khi có người khác vừa cập nhật (updateMany không khớp dòng nào)', async () => {
  yeuCauTraVe = { ...yeuCauMau };
  soDongCapNhat = 0;
  const res = taoResGia();
  await boDieuKhien.capNhatTrangThaiYeuCau(
    { params: { id: '7' }, query: {}, body: { trang_thai_moi: 'DANG_XU_LY' }, nguoiDung: ktvMot },
    res
  );
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.thanhCong, false);
});

test('capNhatTrangThaiYeuCau: trả 200 khi cập nhật thành công', async () => {
  yeuCauTraVe = { ...yeuCauMau };
  soDongCapNhat = 1;
  const res = taoResGia();
  await boDieuKhien.capNhatTrangThaiYeuCau(
    { params: { id: '7' }, query: {}, body: { trang_thai_moi: 'DANG_XU_LY' }, nguoiDung: ktvMot },
    res
  );
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.thanhCong, true);
});

test('chuanHoaYeuCau: 400 khi mức ưu tiên sai', async () => {
  yeuCauTraVe = { ...yeuCauMau };
  const res = taoResGia();
  await boDieuKhien.chuanHoaYeuCau(
    { params: { id: '7' }, query: {}, body: { muc_do_uu_tien: 'SIEU_KHAN' }, nguoiDung: ktvMot },
    res
  );
  assert.strictEqual(res.statusCode, 400);
});

test('chuanHoaYeuCau: 400 khi mã phòng không phải số', async () => {
  yeuCauTraVe = { ...yeuCauMau };
  const res = taoResGia();
  await boDieuKhien.chuanHoaYeuCau(
    { params: { id: '7' }, query: {}, body: { ma_phong: 'abc' }, nguoiDung: ktvMot },
    res
  );
  assert.strictEqual(res.statusCode, 400);
});

test('chuanHoaYeuCau: 404 khi không tìm thấy yêu cầu', async () => {
  yeuCauTraVe = null;
  const res = taoResGia();
  await boDieuKhien.chuanHoaYeuCau(
    { params: { id: '999' }, query: {}, body: { muc_do_uu_tien: 'CAO' }, nguoiDung: ktvMot },
    res
  );
  assert.strictEqual(res.statusCode, 404);
});

test('chuanHoaYeuCau: 403 khi KTV khác chuẩn hóa yêu cầu đang giao cho người khác', async () => {
  yeuCauTraVe = { ...yeuCauMau, ma_ky_thuat_vien: 99 };
  const res = taoResGia();
  await boDieuKhien.chuanHoaYeuCau(
    { params: { id: '7' }, query: {}, body: { muc_do_uu_tien: 'CAO' }, nguoiDung: ktvMot },
    res
  );
  assert.strictEqual(res.statusCode, 403);
});

test('taoDieuKienTimKiemYeuCau: xử lý đủ các dạng đầu vào, không ném lỗi', () => {
  const { taoDieuKienTimKiemYeuCau } = boDieuKhien;
  const KHONG_TIM_THAY = { ma_yeu_cau_bao_hong: -1 };

  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau('7'), { ma_yeu_cau_bao_hong: 7 });
  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau('YC202610281234'), { ma_yeu_cau: '#YC202610281234' });
  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau('#YC202610281234'), { ma_yeu_cau: '#YC202610281234' });
  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau('%23YC202610281234'), { ma_yeu_cau: '#YC202610281234' });
  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau('#yc202610281234'), { ma_yeu_cau: '#YC202610281234' });
  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau('1e3'), KHONG_TIM_THAY);          // không được hiểu thành 1
  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau('99999999999'), KHONG_TIM_THAY);  // vượt giới hạn Int
  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau('%E0%A4%A'), KHONG_TIM_THAY);     // % hỏng không ném lỗi
  assert.deepStrictEqual(taoDieuKienTimKiemYeuCau(undefined), KHONG_TIM_THAY);
});

test('chuanHoaYeuCau: trả về 400 khi yêu cầu đã ở trạng thái HOAN_THANH hoặc HUY', async () => {
  // 1. Thử trạng thái HOAN_THANH
  yeuCauTraVe = { ...yeuCauMau, trang_thai: 'HOAN_THANH' };
  const res1 = taoResGia();
  await boDieuKhien.chuanHoaYeuCau(
    { params: { id: '7' }, query: {}, body: { muc_do_uu_tien: 'CAO' }, nguoiDung: ktvMot },
    res1
  );
  assert.strictEqual(res1.statusCode, 400);

  // 2. Thử trạng thái HUY
  yeuCauTraVe = { ...yeuCauMau, trang_thai: 'HUY' };
  const res2 = taoResGia();
  await boDieuKhien.chuanHoaYeuCau(
    { params: { id: '7' }, query: {}, body: { muc_do_uu_tien: 'CAO' }, nguoiDung: ktvMot },
    res2
  );
  assert.strictEqual(res2.statusCode, 400);
});

test('chuanHoaYeuCau: trả về 409 khi xảy ra xung đột cập nhật đồng thời (updateMany count: 0)', async () => {
  yeuCauTraVe = { ...yeuCauMau, trang_thai: 'CHO_XU_LY' };
  soDongCapNhat = 0;
  const res = taoResGia();
  await boDieuKhien.chuanHoaYeuCau(
    { params: { id: '7' }, query: {}, body: { muc_do_uu_tien: 'CAO' }, nguoiDung: ktvMot },
    res
  );
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.thanhCong, false);
});

test('phanCong: trả về 400 khi yêu cầu đã ở trạng thái HOAN_THANH hoặc HUY', async () => {
  const admin = { ma_nguoi_dung: 99, ho_ten: 'Admin', vai_tro: 'ADMIN' };

  // 1. Thử trạng thái HOAN_THANH
  yeuCauTraVe = { ...yeuCauMau, trang_thai: 'HOAN_THANH' };
  const res1 = taoResGia();
  await boDieuKhien.phanCongYeuCau(
    { params: { id: '7' }, query: {}, body: { ma_ky_thuat_vien: 2 }, nguoiDung: admin },
    res1
  );
  assert.strictEqual(res1.statusCode, 400);

  // 2. Thử trạng thái HUY
  yeuCauTraVe = { ...yeuCauMau, trang_thai: 'HUY' };
  const res2 = taoResGia();
  await boDieuKhien.phanCongYeuCau(
    { params: { id: '7' }, query: {}, body: { ma_ky_thuat_vien: 2 }, nguoiDung: admin },
    res2
  );
  assert.strictEqual(res2.statusCode, 400);
});

test('phanCong: trả về 409 khi xảy ra xung đột cập nhật đồng thời (updateMany count: 0)', async () => {
  const admin = { ma_nguoi_dung: 99, ho_ten: 'Admin', vai_tro: 'ADMIN' };
  yeuCauTraVe = { ...yeuCauMau, trang_thai: 'CHO_XU_LY' };
  soDongCapNhat = 0;
  const res = taoResGia();
  await boDieuKhien.phanCongYeuCau(
    { params: { id: '7' }, query: {}, body: { ma_ky_thuat_vien: 2 }, nguoiDung: admin },
    res
  );
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.thanhCong, false);
});

test('tinhChiSoSla: trả về 0 an toàn khi danh sách yêu cầu rỗng và tính đúng cả 2 chỉ số MTTR khi có dữ liệu', () => {
  // 1. Trường hợp danh sách rỗng -> an toàn trả về 0, không có NaN hay Infinity
  const ketQuaRong = tinhChiSoSla([]);
  assert.strictEqual(ketQuaRong.thoiGianPhanHoiTrungBinhPhut, 0);
  assert.strictEqual(ketQuaRong.thoiGianKhacPhucTrungBinhGio, 0);
  assert.strictEqual(ketQuaRong.thoiGianSuaChuaThucTeTrungBinhGio, 0);

  // 2. Trường hợp có dữ liệu:
  // YC1: Tạo 08:00, Tiếp nhận 08:30 (SLA: 30p), Hoàn thành 10:30 (Resolve: 2.5h, Repair: 2.0h)
  // YC2: Tạo 09:00, Tiếp nhận 10:00 (SLA: 60p), Hoàn thành 11:00 (Resolve: 2.0h, Repair: 1.0h)
  // Trung bình SLA phản hồi = (30 + 60) / 2 = 45 phút
  // Trung bình MTTR Resolve = (2.5 + 2.0) / 2 = 2.25 giờ
  // Trung bình MTTR Repair  = (2.0 + 1.0) / 2 = 1.50 giờ
  const danhSachMau = [
    {
      thoi_gian_tao: '2026-10-29T08:00:00.000Z',
      thoi_gian_tiep_nhan: '2026-10-29T08:30:00.000Z',
      thoi_gian_hoan_thanh: '2026-10-29T10:30:00.000Z',
      trang_thai: 'HOAN_THANH'
    },
    {
      thoi_gian_tao: '2026-10-29T09:00:00.000Z',
      thoi_gian_tiep_nhan: '2026-10-29T10:00:00.000Z',
      thoi_gian_hoan_thanh: '2026-10-29T11:00:00.000Z',
      trang_thai: 'HOAN_THANH'
    }
  ];

  const ketQua = tinhChiSoSla(danhSachMau);
  assert.strictEqual(ketQua.thoiGianPhanHoiTrungBinhPhut, 45);
  assert.strictEqual(ketQua.thoiGianKhacPhucTrungBinhGio, 2.25);
  assert.strictEqual(ketQua.thoiGianSuaChuaThucTeTrungBinhGio, 1.5);
  assert.strictEqual(ketQua.thoiGianSuaChuaThucTeGio, 1.5);
});
