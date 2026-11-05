// tests/yeuCauDieuKhien.test.js - Unit tests cho logic tìm kiếm, phân quyền và nghiệp vụ yêu cầu
const test = require('node:test');
const assert = require('node:assert/strict');

function datDoiTuongGia(duongDanTuongDoi, doiTuongGia) {
  const duongDan = require.resolve(duongDanTuongDoi);
  require.cache[duongDan] = { id: duongDan, filename: duongDan, loaded: true, exports: doiTuongGia };
}

let yeuCauHienTaiMock = null;
const prismaGia = {
  yeu_cau_bao_hong: {
    findFirst: async () => yeuCauHienTaiMock,
    updateMany: async () => ({ count: 1 }),
    findUnique: async () => ({ ...yeuCauHienTaiMock, trang_thai: 'DANG_XU_LY' })
  },
  lich_su_xu_ly: { create: async () => ({}) },
  $transaction: async (fn) => fn(prismaGia)
};

datDoiTuongGia('../src/config/coSoDuLieu', prismaGia);
datDoiTuongGia('../src/services/zaloDichVu', { guiTinNhanZalo: async () => {} });

const { taoDieuKienTimKiemYeuCau, capNhatTrangThaiYeuCau } = require('../src/controllers/yeuCauDieuKhien');

function taoResGia() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
}

test('yeuCauDieuKhien: taoDieuKienTimKiemYeuCau xử lý an toàn ID số và mã #YC', () => {
  // 1. Tìm theo ID số nguyên (khóa chính ma_yeu_cau_bao_hong)
  assert.deepEqual(taoDieuKienTimKiemYeuCau(12), { ma_yeu_cau_bao_hong: 12 });
  assert.deepEqual(taoDieuKienTimKiemYeuCau('105'), { ma_yeu_cau_bao_hong: 105 });

  // 2. Tìm theo mã chuỗi đã có dấu #
  assert.deepEqual(taoDieuKienTimKiemYeuCau('#YC202610281234'), { ma_yeu_cau: '#YC202610281234' });

  // 3. Tìm theo mã chuỗi không có dấu # (người dùng gõ YC...)
  assert.deepEqual(taoDieuKienTimKiemYeuCau('YC202610281234'), { ma_yeu_cau: '#YC202610281234' });

  // 4. Tìm theo mã đã bị URL Encode (%23 tương đương #)
  assert.deepEqual(taoDieuKienTimKiemYeuCau('%23YC202610281234'), { ma_yeu_cau: '#YC202610281234' });

  // 5. Chuỗi rỗng hoặc null
  assert.deepEqual(taoDieuKienTimKiemYeuCau(null), { ma_yeu_cau_bao_hong: -1 });
  assert.deepEqual(taoDieuKienTimKiemYeuCau(''), { ma_yeu_cau_bao_hong: -1 });
});

test('yeuCauDieuKhien: Phân quyền KTV khi gọi capNhatTrangThaiYeuCau thật', async () => {
  const ktvAn = { ma_nguoi_dung: 1, vai_tro: 'KTV', ho_ten: 'Nguyễn Văn An' };
  const ktvBinh = { ma_nguoi_dung: 2, vai_tro: 'KTV', ho_ten: 'Trần Thị Bình' };
  const admin = { ma_nguoi_dung: 99, vai_tro: 'ADMIN', ho_ten: 'Quản Trị Viên' };

  // Yêu cầu đang được gán cho KTV An (id: 1)
  yeuCauHienTaiMock = {
    ma_yeu_cau_bao_hong: 7,
    ma_yeu_cau: '#YC202610281234',
    trang_thai: 'CHO_XU_LY',
    ma_ky_thuat_vien: 1,
    ky_thuat_vien: { ma_nguoi_dung: 1, ho_ten: 'Nguyễn Văn An' }
  };

  // 1. KTV Bình đổi vé của KTV An -> 403 Forbidden
  const res1 = taoResGia();
  await capNhatTrangThaiYeuCau(
    { params: { id: '7' }, query: {}, body: { trang_thai_moi: 'DANG_XU_LY' }, nguoiDung: ktvBinh },
    res1
  );
  assert.equal(res1.statusCode, 403);
  assert.equal(res1.body.thanhCong, false);

  // 2. KTV An đổi vé của chính mình -> 200 OK
  const res2 = taoResGia();
  await capNhatTrangThaiYeuCau(
    { params: { id: '7' }, query: {}, body: { trang_thai_moi: 'DANG_XU_LY' }, nguoiDung: ktvAn },
    res2
  );
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.thanhCong, true);

  // 3. Admin đổi vé của KTV An -> 200 OK
  const res3 = taoResGia();
  await capNhatTrangThaiYeuCau(
    { params: { id: '7' }, query: {}, body: { trang_thai_moi: 'DANG_XU_LY' }, nguoiDung: admin },
    res3
  );
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.body.thanhCong, true);
});

test('yeuCauDieuKhien: Bắt buộc có ghi chú kết quả khi HOAN_THANH hoặc HUY trong hàm thật', async () => {
  const ktvAn = { ma_nguoi_dung: 1, vai_tro: 'KTV', ho_ten: 'Nguyễn Văn An' };

  yeuCauHienTaiMock = {
    ma_yeu_cau_bao_hong: 7,
    ma_yeu_cau: '#YC202610281234',
    trang_thai: 'DANG_XU_LY',
    ma_ky_thuat_vien: 1,
    ky_thuat_vien: { ma_nguoi_dung: 1, ho_ten: 'Nguyễn Văn An' }
  };

  // Thiếu ghi chú khi HOAN_THANH -> 400
  const res1 = taoResGia();
  await capNhatTrangThaiYeuCau(
    { params: { id: '7' }, query: {}, body: { trang_thai_moi: 'HOAN_THANH', ghi_chu_ket_qua: '' }, nguoiDung: ktvAn },
    res1
  );
  assert.equal(res1.statusCode, 400);

  // Có ghi chú khi HOAN_THANH -> 200
  const res2 = taoResGia();
  await capNhatTrangThaiYeuCau(
    { params: { id: '7' }, query: {}, body: { trang_thai_moi: 'HOAN_THANH', ghi_chu_ket_qua: 'Đã sửa xong' }, nguoiDung: ktvAn },
    res2
  );
  assert.equal(res2.statusCode, 200);
});
