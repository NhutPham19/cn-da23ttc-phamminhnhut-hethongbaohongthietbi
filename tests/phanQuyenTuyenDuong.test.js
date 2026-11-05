const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = 'khoa-bi-mat-chi-dung-cho-kiem-thu-0123456789abcdef';

const router = require('../src/routes/apiTuyenDuong');
const { kiemTraDangNhap, kiemTraQuyenAdmin } = require('../src/middlewares/kiemTraXacThuc');

// Gom middleware dùng chung (router.use) đứng trước route + middleware riêng của route.
function layChuoiXuLy(phuongThuc, duongDan) {
  const viTri = router.stack.findIndex(
    (lop) => lop.route && lop.route.path === duongDan && lop.route.methods[phuongThuc]
  );
  assert.ok(viTri >= 0, `Không tìm thấy route ${phuongThuc.toUpperCase()} ${duongDan} — chỉnh duongDan cho khớp cách khai báo thật`);
  const chung = router.stack.slice(0, viTri).filter((lop) => !lop.route).map((lop) => lop.handle);
  const rieng = router.stack[viTri].route.stack.map((lop) => lop.handle);
  return [...chung, ...rieng];
}

const CAN_DANG_NHAP = [
  ['post', '/xac-thuc/dang-xuat'],
  ['get', '/xac-thuc/thong-tin-ca-nhan'],
  ['post', '/xac-thuc/doi-mat-khau'],
  ['get', '/yeu-cau'],
  ['get', '/yeu-cau/:id'],
  ['put', '/yeu-cau/:id/trang-thai'],
  ['put', '/yeu-cau/:id/chuan-hoa'],
  ['get', '/danh-muc']
];

const CAN_QUYEN_ADMIN = [
  ['put', '/yeu-cau/:id/phan-cong'],
  ['get', '/thong-ke'],
  ['get', '/nguoi-dung'],
  ['post', '/nguoi-dung'],
  ['put', '/nguoi-dung/:id'],
  ['patch', '/nguoi-dung/:id/trang-thai']
];

for (const [phuongThuc, duongDan] of CAN_DANG_NHAP) {
  test(`${phuongThuc.toUpperCase()} ${duongDan} phải yêu cầu đăng nhập`, () => {
    assert.ok(layChuoiXuLy(phuongThuc, duongDan).includes(kiemTraDangNhap));
  });
}

for (const [phuongThuc, duongDan] of CAN_QUYEN_ADMIN) {
  test(`${phuongThuc.toUpperCase()} ${duongDan} phải yêu cầu đăng nhập VÀ quyền ADMIN`, () => {
    const chuoi = layChuoiXuLy(phuongThuc, duongDan);
    assert.ok(chuoi.includes(kiemTraDangNhap), 'thiếu kiemTraDangNhap');
    assert.ok(chuoi.includes(kiemTraQuyenAdmin), 'thiếu kiemTraQuyenAdmin');
  });
}

test('POST /xac-thuc/dang-nhap là tuyến công khai (không bắt đăng nhập)', () => {
  assert.ok(!layChuoiXuLy('post', '/xac-thuc/dang-nhap').includes(kiemTraDangNhap));
});

test('POST /xac-thuc/quen-mat-khau là tuyến công khai (không bắt đăng nhập)', () => {
  assert.ok(!layChuoiXuLy('post', '/xac-thuc/quen-mat-khau').includes(kiemTraDangNhap));
});

test('POST /xac-thuc/kiem-tra-otp là tuyến công khai (không bắt đăng nhập)', () => {
  assert.ok(!layChuoiXuLy('post', '/xac-thuc/kiem-tra-otp').includes(kiemTraDangNhap));
});

test('POST /xac-thuc/dat-lai-mat-khau là tuyến công khai (không bắt đăng nhập)', () => {
  assert.ok(!layChuoiXuLy('post', '/xac-thuc/dat-lai-mat-khau').includes(kiemTraDangNhap));
});
