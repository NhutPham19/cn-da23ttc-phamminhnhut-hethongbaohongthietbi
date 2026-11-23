// tests/yeuCauDieuKhien.test.js - Unit tests cho logic tìm kiếm, phân quyền và nghiệp vụ yêu cầu
const test = require('node:test');
const assert = require('node:assert/strict');

function datDoiTuongGia(duongDanTuongDoi, doiTuongGia) {
  const duongDan = require.resolve(duongDanTuongDoi);
  require.cache[duongDan] = { id: duongDan, filename: duongDan, loaded: true, exports: doiTuongGia };
}

let yeuCauHienTaiMock = null;
let dieuKienLocCountGia = null;
let dieuKienLocFindManyGia = null;
const prismaGia = {
  yeu_cau_bao_hong: {
    findFirst: async () => yeuCauHienTaiMock,
    updateMany: async () => ({ count: 1 }),
    findUnique: async () => ({ ...yeuCauHienTaiMock, trang_thai: 'DANG_XU_LY' }),
    count: async ({ where } = {}) => {
      dieuKienLocCountGia = where;
      return 1;
    },
    findMany: async ({ where } = {}) => {
      dieuKienLocFindManyGia = where;
      return [
        {
          ma_yeu_cau_bao_hong: 1,
          ma_yeu_cau: '#YC202611150001',
          ten_thiet_bi: 'Máy chiếu',
          muc_do_uu_tien: where?.muc_do_uu_tien || 'BINH_THUONG',
          trang_thai: 'CHO_XU_LY',
          thoi_gian_tao: new Date()
        }
      ];
    }
  },
  lich_su_xu_ly: { create: async () => ({}) },
  nguoi_dung: {
    findMany: async () => [],
    findUnique: async ({ where } = {}) => ({
      ma_nguoi_dung: where?.ma_nguoi_dung || 2,
      ho_ten: where?.ma_nguoi_dung === 1 ? 'Nguyễn Văn An' : 'Trần Thị Bình',
      vai_tro: 'KTV',
      chat_id_zalo: 'chat-ktv-zalo',
      trang_thai_hoat_dong: true
    })
  },
  $transaction: async (fn) => fn(prismaGia)
};

datDoiTuongGia('../src/config/coSoDuLieu', prismaGia);
datDoiTuongGia('../src/services/zaloDichVu', { guiTinNhanZalo: async () => {} });

const { taoDieuKienTimKiemYeuCau, capNhatTrangThaiYeuCau, layDanhSachYeuCau, phanCongYeuCau } = require('../src/controllers/yeuCauDieuKhien');

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

test('yeuCauDieuKhien: layDanhSachYeuCau hỗ trợ lọc theo muc_do_uu_tien chính xác', async () => {
  // 1. Lọc theo mức ưu tiên hợp lệ (KHAN_CAP)
  const res1 = taoResGia();
  await layDanhSachYeuCau({ query: { muc_do_uu_tien: 'KHAN_CAP' } }, res1);
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.thanhCong, true);
  assert.equal(dieuKienLocFindManyGia.muc_do_uu_tien, 'KHAN_CAP');
  assert.equal(dieuKienLocCountGia.muc_do_uu_tien, 'KHAN_CAP');

  // 2. Lọc không phân biệt chữ hoa/thường ('cao' -> 'CAO')
  const res2 = taoResGia();
  await layDanhSachYeuCau({ query: { muc_do_uu_tien: 'cao' } }, res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(dieuKienLocFindManyGia.muc_do_uu_tien, 'CAO');

  // 3. Từ chối mức ưu tiên không hợp lệ -> 400 Bad Request
  const res3 = taoResGia();
  await layDanhSachYeuCau({ query: { muc_do_uu_tien: 'SIEU_CAP_VIP' } }, res3);
  assert.equal(res3.statusCode, 400);
  assert.equal(res3.body.thanhCong, false);
  assert.match(res3.body.loi, /Mức độ ưu tiên lọc không hợp lệ/);

  // 4. Không truyền hoặc truyền rỗng -> không áp điều kiện muc_do_uu_tien
  const res4 = taoResGia();
  await layDanhSachYeuCau({ query: { muc_do_uu_tien: '' } }, res4);
  assert.equal(res4.statusCode, 200);
  assert.equal(dieuKienLocFindManyGia.muc_do_uu_tien, undefined);
});

test('yeuCauDieuKhien: phanCongYeuCau khi đổi người phụ trách ghi nhận thông báo đổi KTV rõ ràng', async () => {
  const admin = { ma_nguoi_dung: 99, vai_tro: 'ADMIN', ho_ten: 'Quản trị viên' };
  yeuCauHienTaiMock = {
    ma_yeu_cau_bao_hong: 7,
    ma_yeu_cau: '#YC202610281234',
    trang_thai: 'CHO_XU_LY',
    ma_ky_thuat_vien: 1,
    ky_thuat_vien: { ma_nguoi_dung: 1, ho_ten: 'Nguyễn Văn An' },
    ma_nguoi_bao_zalo: 'chat-sv-zalo'
  };

  const res = taoResGia();
  await phanCongYeuCau(
    { params: { id: '7' }, query: {}, body: { ma_ky_thuat_vien: 2 }, nguoiDung: admin },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.thanhCong, true);
  assert.ok(res.body.thongBao.includes('Đã đổi người phụ trách'));
});
