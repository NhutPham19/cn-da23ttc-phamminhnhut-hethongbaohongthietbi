// tests/nguoiDungDieuKhien.test.js - Unit tests cho Phân hệ Quản lý Nhân sự & Chặn tài khoản khóa
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

process.env.JWT_SECRET = 'khoa-bi-mat-chi-dung-cho-kiem-thu-0123456789abcdef';

// Helper mock controller response
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
    },
    cookie() { return this; },
    clearCookie() { return this; }
  };
  return { req, res, getStatus: () => maStatus, getJson: () => duLieuJson };
}

// 1. Kiểm tra dangNhap: Từ chối đăng nhập (403 Forbidden) khi tài khoản có trang_thai_hoat_dong === false
test('xacThucDieuKhien: Từ chối đăng nhập (403 Forbidden) khi tài khoản bị vô hiệu hóa', async () => {
  const { dangNhap } = require('../src/controllers/xacThucDieuKhien');
  const prisma = require('../src/config/coSoDuLieu');

  // Mock prisma.nguoi_dung.findUnique trả về user có mật khẩu đúng nhưng trang_thai_hoat_dong: false
  const matKhauHash = await bcrypt.hash('123456', 10);
  const banGocFindUnique = prisma.nguoi_dung.findUnique;

  prisma.nguoi_dung.findUnique = async ({ where }) => {
    if (where.tai_khoan === 'ktv_bi_khoa') {
      return {
        ma_nguoi_dung: 99,
        tai_khoan: 'ktv_bi_khoa',
        mat_khau_hash: matKhauHash,
        ho_ten: 'KTV Bị Khóa',
        vai_tro: 'KTV',
        trang_thai_hoat_dong: false
      };
    }
    return null;
  };

  try {
    const { req, res, getStatus, getJson } = taoReqRes({
      body: { tai_khoan: 'ktv_bi_khoa', mat_khau: '123456' }
    });

    await dangNhap(req, res);
    assert.equal(getStatus(), 403);
    assert.equal(getJson().thanhCong, false);
    assert.match(getJson().loi, /bị khóa/i);
  } finally {
    prisma.nguoi_dung.findUnique = banGocFindUnique;
  }
});

// 2. Kiểm tra phanCongYeuCau: Chặn phân công cho KTV bị vô hiệu hóa
test('yeuCauDieuKhien: Chặn phân công cho KTV đang bị khóa tài khoản (400 Bad Request)', async () => {
  const { phanCongYeuCau } = require('../src/controllers/yeuCauDieuKhien');
  const prisma = require('../src/config/coSoDuLieu');

  const banGocFindUnique = prisma.nguoi_dung.findUnique;
  prisma.nguoi_dung.findUnique = async ({ where }) => {
    if (where.ma_nguoi_dung === 99) {
      return {
        ma_nguoi_dung: 99,
        tai_khoan: 'ktv_bi_khoa',
        ho_ten: 'KTV Khóa',
        vai_tro: 'KTV',
        trang_thai_hoat_dong: false
      };
    }
    return null;
  };

  try {
    const { req, res, getStatus, getJson } = taoReqRes({
      params: { id: '1' },
      body: { ma_ky_thuat_vien: 99 },
      nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
    });

    await phanCongYeuCau(req, res);
    assert.equal(getStatus(), 400);
    assert.equal(getJson().thanhCong, false);
    assert.match(getJson().loi, /bị khóa/i);
  } finally {
    prisma.nguoi_dung.findUnique = banGocFindUnique;
  }
});

// 3. Kiểm tra GET /api/nguoi-dung: Loại bỏ mat_khau_hash an toàn
test('nguoiDungDieuKhien: GET /api/nguoi-dung không làm lộ mat_khau_hash', async () => {
  const { layDanhSachNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');
  const prisma = require('../src/config/coSoDuLieu');

  const banGocFindMany = prisma.nguoi_dung.findMany;
  prisma.nguoi_dung.findMany = async ({ select }) => {
    assert.equal(select.mat_khau_hash, undefined, 'mat_khau_hash không được phép có trong select!');
    assert.equal(select.tai_khoan, true);
    assert.equal(select.ho_ten, true);
    return [
      {
        ma_nguoi_dung: 1,
        tai_khoan: 'admin',
        ho_ten: 'Quản trị viên',
        vai_tro: 'ADMIN',
        trang_thai_hoat_dong: true
      }
    ];
  };

  try {
    const { req, res, getStatus, getJson } = taoReqRes({
      nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
    });

    await layDanhSachNguoiDung(req, res);
    assert.equal(getStatus(), 200);
    assert.equal(getJson().thanhCong, true);
    assert.equal(getJson().duLieu.length, 1);
    assert.equal(getJson().duLieu[0].mat_khau_hash, undefined);
  } finally {
    prisma.nguoi_dung.findMany = banGocFindMany;
  }
});

// 4. Kiểm tra POST /api/nguoi-dung: Trả về 409 khi trùng tài khoản & băm mật khẩu
test('nguoiDungDieuKhien: POST /api/nguoi-dung trả về 409 khi trùng tài khoản', async () => {
  const { taoNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');
  const prisma = require('../src/config/coSoDuLieu');

  const banGocFindUnique = prisma.nguoi_dung.findUnique;
  prisma.nguoi_dung.findUnique = async ({ where }) => {
    if (where.tai_khoan === 'admin') {
      return { ma_nguoi_dung: 1, tai_khoan: 'admin' };
    }
    return null;
  };

  try {
    const { req, res, getStatus, getJson } = taoReqRes({
      body: {
        tai_khoan: 'admin',
        mat_khau: '123456',
        ho_ten: 'Admin trùng',
        vai_tro: 'ADMIN',
        so_dien_thoai: '0912345678'
      },
      nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
    });

    await taoNguoiDung(req, res);
    assert.equal(getStatus(), 409);
    assert.equal(getJson().thanhCong, false);
    assert.match(getJson().loi, /đã tồn tại/i);
  } finally {
    prisma.nguoi_dung.findUnique = banGocFindUnique;
  }
});

// 5. Kiểm tra POST /api/nguoi-dung: Tạo mới thành công (201 Created)
test('nguoiDungDieuKhien: POST /api/nguoi-dung tạo thành công với mật khẩu băm', async () => {
  const { taoNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');
  const prisma = require('../src/config/coSoDuLieu');

  const banGocFindUnique = prisma.nguoi_dung.findUnique;
  const banGocCreate = prisma.nguoi_dung.create;

  prisma.nguoi_dung.findUnique = async () => null;
  prisma.nguoi_dung.create = async ({ data, select }) => {
    assert.ok(data.mat_khau_hash);
    assert.notEqual(data.mat_khau_hash, '123456'); // Phải được băm
    assert.equal(data.tai_khoan, 'ktv_moi');
    return {
      ma_nguoi_dung: 10,
      tai_khoan: data.tai_khoan,
      ho_ten: data.ho_ten,
      vai_tro: data.vai_tro,
      trang_thai_hoat_dong: true
    };
  };

  try {
    const { req, res, getStatus, getJson } = taoReqRes({
      body: {
        tai_khoan: 'ktv_moi',
        mat_khau: '123456',
        ho_ten: 'Kỹ thuật viên mới',
        vai_tro: 'KTV',
        so_dien_thoai: '0912345678',
        chat_id_zalo: '123456789'
      },
      nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
    });

    await taoNguoiDung(req, res);
    assert.equal(getStatus(), 201);
    assert.equal(getJson().thanhCong, true);
    assert.equal(getJson().duLieu.tai_khoan, 'ktv_moi');
  } finally {
    prisma.nguoi_dung.findUnique = banGocFindUnique;
    prisma.nguoi_dung.create = banGocCreate;
  }
});

// 6. Kiểm tra PUT /api/nguoi-dung/:id: Chặn Admin tự hạ quyền của chính mình
test('nguoiDungDieuKhien: PUT /api/nguoi-dung/:id chặn Admin tự hạ quyền của chính mình (400)', async () => {
  const { capNhatNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');
  const prisma = require('../src/config/coSoDuLieu');

  const banGocFindUnique = prisma.nguoi_dung.findUnique;
  prisma.nguoi_dung.findUnique = async () => ({ ma_nguoi_dung: 1, tai_khoan: 'admin', vai_tro: 'ADMIN' });

  try {
    const { req, res, getStatus, getJson } = taoReqRes({
      params: { id: '1' },
      body: { vai_tro: 'KTV' },
      nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
    });

    await capNhatNguoiDung(req, res);
    assert.equal(getStatus(), 400);
    assert.equal(getJson().thanhCong, false);
    assert.match(getJson().loi, /tự hạ quyền/i);
  } finally {
    prisma.nguoi_dung.findUnique = banGocFindUnique;
  }
});

// 7. Kiểm tra PATCH /api/nguoi-dung/:id/trang-thai: Chặn Admin tự khóa tài khoản của chính mình
test('nguoiDungDieuKhien: PATCH /api/nguoi-dung/:id/trang-thai chặn Admin tự khóa tài khoản của mình (400)', async () => {
  const { doiTrangThaiNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');

  const { req, res, getStatus, getJson } = taoReqRes({
    params: { id: '1' },
    body: { trang_thai_hoat_dong: false },
    nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
  });

  await doiTrangThaiNguoiDung(req, res);
  assert.equal(getStatus(), 400);
  assert.equal(getJson().thanhCong, false);
  assert.match(getJson().loi, /tự khóa/i);
});

// 8. Kiểm tra ràng buộc Số điện thoại (10 chữ số, bắt đầu bằng 0, không được để trống)
test('nguoiDungDieuKhien: POST /api/nguoi-dung từ chối khi số điện thoại thiếu hoặc sai định dạng', async () => {
  const { taoNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');
  const prisma = require('../src/config/coSoDuLieu');

  const banGocFindUnique = prisma.nguoi_dung.findUnique;
  prisma.nguoi_dung.findUnique = async () => null;

  try {
    // Trường hợp 1: Bỏ trống SĐT
    const { req: req1, res: res1, getStatus: getStatus1, getJson: getJson1 } = taoReqRes({
      body: {
        tai_khoan: 'ktv_sdt_test',
        ho_ten: 'KTV SDT Test',
        vai_tro: 'KTV',
        so_dien_thoai: ''
      },
      nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
    });
    await taoNguoiDung(req1, res1);
    assert.equal(getStatus1(), 400);
    assert.match(getJson1().loi, /không được để trống/i);

    // Trường hợp 2: Nhập 8 số (như lỗi trong ảnh 1: 09196236)
    const { req: req2, res: res2, getStatus: getStatus2, getJson: getJson2 } = taoReqRes({
      body: {
        tai_khoan: 'ktv_sdt_test',
        ho_ten: 'KTV SDT Test',
        vai_tro: 'KTV',
        so_dien_thoai: '09196236'
      },
      nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
    });
    await taoNguoiDung(req2, res2);
    assert.equal(getStatus2(), 400);
    assert.match(getJson2().loi, /10 chữ số/i);
  } finally {
    prisma.nguoi_dung.findUnique = banGocFindUnique;
  }
});

// 9. Kiểm tra mật khẩu mặc định là tvu123 khi không nhập
test('nguoiDungDieuKhien: POST /api/nguoi-dung mặc định mật khẩu là tvu123 khi để trống', async () => {
  const { taoNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');
  const prisma = require('../src/config/coSoDuLieu');

  const banGocFindUnique = prisma.nguoi_dung.findUnique;
  const banGocCreate = prisma.nguoi_dung.create;

  let matKhauDuocBam = '';
  prisma.nguoi_dung.findUnique = async () => null;
  prisma.nguoi_dung.create = async ({ data }) => {
    matKhauDuocBam = data.mat_khau_hash;
    return {
      ma_nguoi_dung: 11,
      tai_khoan: data.tai_khoan,
      ho_ten: data.ho_ten,
      vai_tro: data.vai_tro,
      trang_thai_hoat_dong: true
    };
  };

  try {
    const { req, res, getStatus, getJson } = taoReqRes({
      body: {
        tai_khoan: 'ktv_mac_dinh',
        ho_ten: 'KTV Mặc Định',
        vai_tro: 'KTV',
        so_dien_thoai: '0987654321'
        // Không truyền mat_khau
      },
      nguoiDung: { ma_nguoi_dung: 1, vai_tro: 'ADMIN' }
    });

    await taoNguoiDung(req, res);
    assert.equal(getStatus(), 201);
    assert.equal(getJson().thanhCong, true);
    // Kiểm tra hash có khớp với 'tvu123'
    const khopTvu123 = await bcrypt.compare('tvu123', matKhauDuocBam);
    assert.equal(khopTvu123, true, 'Mật khẩu băm phải khớp với tvu123');
  } finally {
    prisma.nguoi_dung.findUnique = banGocFindUnique;
    prisma.nguoi_dung.create = banGocCreate;
  }
});
