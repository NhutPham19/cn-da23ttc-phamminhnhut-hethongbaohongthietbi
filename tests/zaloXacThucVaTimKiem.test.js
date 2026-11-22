// tests/zaloXacThucVaTimKiem.test.js - Unit tests cho Quy trình Xác thực định danh Zalo Bot & Tìm kiếm KTV đa trường
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

process.env.JWT_SECRET = 'khoa-bi-mat-chi-dung-cho-kiem-thu-0123456789abcdef';
process.env.CHO_PHEP_EMAIL_DEMO = 'true';

const { phanLoaiVaiTroQuaEmail, kiemTraLaSinhVien, kiemTraDuocPhepBoQuaAnh } = require('../src/utils/tienIch');
const { layDanhSachNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');
const { dangNhap } = require('../src/controllers/xacThucDieuKhien');
const zaloDieuKhien = require('../src/controllers/zaloDieuKhien');
const zaloDichVu = require('../src/services/zaloDichVu');
const cloudinaryDichVu = require('../src/services/cloudinaryDichVu');
const emailDichVu = require('../src/services/emailDichVu');
const otpDichVu = require('../src/services/otpDichVu');
const prisma = require('../src/config/coSoDuLieu');

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
    clearCookie() { return this; },
    sendStatus(code) {
      maStatus = code;
      return this;
    }
  };
  return { req, res, getStatus: () => maStatus, getJson: () => duLieuJson };
}

// =============================================================================
// PHẦN 1: TEST TIỆN ÍCH PHÂN LOẠI EMAIL TRƯỜNG (SV VS GV)
// =============================================================================
test('phanLoaiVaiTroQuaEmail: Nhận diện chính xác Sinh viên qua đuôi st.tvu.edu.vn và MSSV', () => {
  const kqSv1 = phanLoaiVaiTroQuaEmail('110123252@st.tvu.edu.vn');
  assert.equal(kqSv1.hopLe, true);
  assert.equal(kqSv1.vaiTro, 'SINH_VIEN');
  assert.equal(kqSv1.tienTo, '110123252');

  const kqSv2 = phanLoaiVaiTroQuaEmail('110123999@tvu.edu.vn');
  assert.equal(kqSv2.hopLe, true);
  assert.equal(kqSv2.vaiTro, 'SINH_VIEN');

  const kqSvDemo = phanLoaiVaiTroQuaEmail('110123252demo@gmail.com');
  assert.equal(kqSvDemo.hopLe, true);
  assert.equal(kqSvDemo.vaiTro, 'SINH_VIEN');
});

test('phanLoaiVaiTroQuaEmail: Nhận diện Giảng viên qua đuôi tvu.edu.vn và tên cán bộ', () => {
  const kqGv1 = phanLoaiVaiTroQuaEmail('quocnk@tvu.edu.vn');
  assert.equal(kqGv1.hopLe, true);
  assert.equal(kqGv1.vaiTro, 'GIANG_VIEN');
  assert.equal(kqGv1.tienTo, 'quocnk');

  const kqGvDemo = phanLoaiVaiTroQuaEmail('gv.quocnk@gmail.com');
  assert.equal(kqGvDemo.hopLe, true);
  assert.equal(kqGvDemo.vaiTro, 'GIANG_VIEN');
});

test('phanLoaiVaiTroQuaEmail: Từ chối các email ngoài tên miền được phép', () => {
  const kqLoi = phanLoaiVaiTroQuaEmail('sinhvien@yahoo.com');
  assert.equal(kqLoi.hopLe, false);
  assert.ok(kqLoi.lyDoLoi.includes('ĐH Trà Vinh'));
});

test('kiemTraLaSinhVien: Kiểm tra chính xác vai trò Sinh viên', () => {
  // 1. Chưa định danh (null/undefined) -> Mặc định áp dụng quy tắc Sinh viên
  assert.equal(kiemTraLaSinhVien(null), true);
  assert.equal(kiemTraLaSinhVien(undefined), true);

  // 2. Có vai_tro === 'SINH_VIEN'
  assert.equal(kiemTraLaSinhVien({ vai_tro: 'SINH_VIEN', email: 'user@gmail.com' }), true);

  // 3. Email có đuôi @st.tvu.edu.vn (kể cả trong DB gắn vai_tro là KTV)
  assert.equal(kiemTraLaSinhVien({ vai_tro: 'KTV', email: '110123252@st.tvu.edu.vn' }), true);

  // 4. Email có tiền tố bắt đầu bằng MSSV (>= 8 chữ số)
  assert.equal(kiemTraLaSinhVien({ vai_tro: 'KTV', email: '110123252@tvu.edu.vn' }), true);

  // 5. Giảng viên / Cán bộ hợp lệ
  assert.equal(kiemTraLaSinhVien({ vai_tro: 'GIANG_VIEN', email: 'quocnk@tvu.edu.vn' }), false);
  assert.equal(kiemTraLaSinhVien({ vai_tro: 'ADMIN', email: 'admin@tvu.edu.vn' }), false);
  assert.equal(kiemTraLaSinhVien({ vai_tro: 'KTV', email: 'nguyenan@tvu.edu.vn' }), false);
});

test('kiemTraDuocPhepBoQuaAnh: Chỉ Giảng viên và Nhân sự nội bộ được bỏ qua', () => {
  // 1. Chưa định danh hoặc Sinh viên -> TUYỆT ĐỐI KHÔNG ĐƯỢC BỎ QUA
  assert.equal(kiemTraDuocPhepBoQuaAnh(null), false);
  assert.equal(kiemTraDuocPhepBoQuaAnh({ vai_tro: 'SINH_VIEN', email: '110123104@st.tvu.edu.vn' }), false);
  assert.equal(kiemTraDuocPhepBoQuaAnh({ vai_tro: 'KTV', email: '110123252@st.tvu.edu.vn' }), false);

  // 2. Giảng viên và KTV/Admin nội bộ -> ĐƯỢC PHÉP
  assert.equal(kiemTraDuocPhepBoQuaAnh({ vai_tro: 'GIANG_VIEN', email: 'quocnk@tvu.edu.vn' }), true);
  assert.equal(kiemTraDuocPhepBoQuaAnh({ vai_tro: 'KTV', email: 'nguyenan@tvu.edu.vn' }), true);
  assert.equal(kiemTraDuocPhepBoQuaAnh({ vai_tro: 'ADMIN', email: 'admin@tvu.edu.vn' }), true);
});

// =============================================================================
// PHẦN 2: TEST BẢO MẬT ĐĂNG NHẬP WEB DASHBOARD (CHẶN SV / GV)
// =============================================================================
test('xacThucDieuKhien: Chặn tài khoản SINH_VIEN và GIANG_VIEN đăng nhập Web Dashboard (403)', async () => {
  const matKhauHash = await bcrypt.hash('123456', 10);
  const banGocFindUnique = prisma.nguoi_dung.findUnique;

  prisma.nguoi_dung.findUnique = async ({ where }) => {
    if (where.tai_khoan === 'sinhvien_test') {
      return {
        ma_nguoi_dung: 101,
        tai_khoan: 'sinhvien_test',
        mat_khau_hash: matKhauHash,
        ho_ten: 'Sinh viên Test',
        vai_tro: 'SINH_VIEN',
        trang_thai_hoat_dong: true
      };
    }
    if (where.tai_khoan === 'giangvien_test') {
      return {
        ma_nguoi_dung: 102,
        tai_khoan: 'giangvien_test',
        mat_khau_hash: matKhauHash,
        ho_ten: 'Giảng viên Test',
        vai_tro: 'GIANG_VIEN',
        trang_thai_hoat_dong: true
      };
    }
    return null;
  };

  try {
    const { req: reqSv, res: resSv, getStatus: getStatusSv } = taoReqRes({
      body: { tai_khoan: 'sinhvien_test', mat_khau: '123456' }
    });
    await dangNhap(reqSv, resSv);
    assert.equal(getStatusSv(), 403);

    const { req: reqGv, res: resGv, getStatus: getStatusGv } = taoReqRes({
      body: { tai_khoan: 'giangvien_test', mat_khau: '123456' }
    });
    await dangNhap(reqGv, resGv);
    assert.equal(getStatusGv(), 403);
  } finally {
    prisma.nguoi_dung.findUnique = banGocFindUnique;
  }
});

// =============================================================================
// PHẦN 3: TEST TÌM KIẾM NHÂN SỰ ĐA TRƯỜNG & BẢO MẬT KHÔNG LỘ MẬT KHẨU
// =============================================================================
test('nguoiDungDieuKhien: Tìm kiếm đa trường không dấu, SĐT, Email, Zalo Chat ID', async () => {
  const banGocFindMany = prisma.nguoi_dung.findMany;

  const mockUsers = [
    {
      ma_nguoi_dung: 1,
      tai_khoan: 'admin_tvu',
      ho_ten: 'Phạm Minh Nhựt',
      email: 'phamminhnhut50@gmail.com',
      so_dien_thoai: '0912345678',
      vai_tro: 'ADMIN',
      chat_id_zalo: 'zalo_admin_01',
      trang_thai_hoat_dong: true,
      thoi_gian_tao: new Date()
    },
    {
      ma_nguoi_dung: 2,
      tai_khoan: 'ktv_tuan',
      ho_ten: 'Lê Văn Tuấn',
      email: 'tuanlv@tvu.edu.vn',
      so_dien_thoai: '0987654321',
      vai_tro: 'KTV',
      chat_id_zalo: 'zalo_ktv_02',
      trang_thai_hoat_dong: true,
      thoi_gian_tao: new Date()
    },
    {
      ma_nguoi_dung: 3,
      tai_khoan: 'zalo_sv_110123252',
      ho_ten: 'Sinh viên (110123252)',
      email: '110123252@st.tvu.edu.vn',
      so_dien_thoai: null,
      vai_tro: 'SINH_VIEN',
      chat_id_zalo: 'zalo_sv_03',
      trang_thai_hoat_dong: false,
      thoi_gian_tao: new Date()
    }
  ];

  prisma.nguoi_dung.findMany = async () => mockUsers;

  try {
    const { req: r1, res: s1, getJson: j1 } = taoReqRes({ query: { tu_khoa: 'nhut' } });
    await layDanhSachNguoiDung(r1, s1);
    const ketQua1 = j1().duLieu;
    assert.equal(ketQua1.length, 1);
    assert.equal(ketQua1[0].tai_khoan, 'admin_tvu');
    assert.equal(ketQua1[0].mat_khau_hash, undefined);

    const { req: r2, res: s2, getJson: j2 } = taoReqRes({ query: { tu_khoa: '0987' } });
    await layDanhSachNguoiDung(r2, s2);
    assert.equal(j2().duLieu.length, 1);
    assert.equal(j2().duLieu[0].tai_khoan, 'ktv_tuan');

    const { req: r3, res: s3, getJson: j3 } = taoReqRes({ query: { tu_khoa: 'zalo_sv_03' } });
    await layDanhSachNguoiDung(r3, s3);
    assert.equal(j3().duLieu.length, 1);
    assert.equal(j3().duLieu[0].vai_tro, 'SINH_VIEN');
  } finally {
    prisma.nguoi_dung.findMany = banGocFindMany;
  }
});

// =============================================================================
// PHẦN 4: TEST ONBOARDING 2 TIN NHẮN & LUỒNG XÁC THỰC EMAIL TRÊN ZALO BOT
// =============================================================================
test('zaloDieuKhien: Người dùng chưa định danh gửi tin nhắn nhận đúng 2 tin nhắn Onboarding', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocUpsert = prisma.phien_hoi_thoai_zalo.upsert;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };
  prisma.nguoi_dung.findFirst = async () => null;
  prisma.phien_hoi_thoai_zalo.findUnique = async () => null;
  prisma.phien_hoi_thoai_zalo.upsert = async () => ({
    ma_nguoi_bao_zalo: 'chat-onboarding-test',
    buoc_hien_tai: -1,
    du_lieu_tam: {},
    thoi_gian_cap_nhat: new Date()
  });

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-onboarding-test' },
          text: 'Xin chào bot'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanDaGui.length, 2);
    assert.ok(tinNhanDaGui[0].text.includes('Xin chào! Tôi là Trợ lý Zalo Bot'));
    assert.ok(tinNhanDaGui[1].text.includes('CÁCH DÙNG BOT SIÊU ĐƠN GIẢN'));
    assert.ok(tinNhanDaGui[1].text.includes('XÁC THỰC LẦN ĐẦU'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.upsert = banGocUpsert;
  }
});

test('zaloDieuKhien: Chặn ngay lập tức người dùng có trang_thai_hoat_dong = false (Blacklist)', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.nguoi_dung.findFirst = async ({ where }) => {
    if (where.chat_id_zalo === 'chat-bi-khoa') {
      return {
        ma_nguoi_dung: 999,
        tai_khoan: 'zalo_chat-bi-khoa',
        vai_tro: 'SINH_VIEN',
        trang_thai_hoat_dong: false
      };
    }
    return null;
  };

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-bi-khoa' },
          text: 'baohong'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanDaGui.length, 1);
    assert.ok(tinNhanDaGui[0].text.includes('Tài khoản báo hỏng của bạn đã bị tạm khóa'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
  }
});

test('zaloDieuKhien: Luồng xác thực Email Bước -1 gửi OTP và Bước -2 liên kết người dùng thành công', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocCapNhatPhien = zaloDieuKhien.capNhatPhien;
  const banGocGuiEmailOtp = emailDichVu.guiEmailOtp;
  const banGocCreate = prisma.nguoi_dung.create;
  const banGocUpdateMany = prisma.nguoi_dung.updateMany;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };
  emailDichVu.guiEmailOtp = async () => ({ thanhCong: true, fallback: false });

  // 1. Bước -1: Nhập email hợp lệ
  prisma.nguoi_dung.findFirst = async () => null;
  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-xac-thuc-otp',
    buoc_hien_tai: -1,
    du_lieu_tam: {},
    thoi_gian_cap_nhat: new Date()
  });

  let buocMoiCapNhat = null;
  let duLieuCapNhat = null;
  prisma.phien_hoi_thoai_zalo.update = async ({ data }) => {
    buocMoiCapNhat = data.buoc_hien_tai;
    duLieuCapNhat = data.du_lieu_tam;
    return {};
  };

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-xac-thuc-otp' },
          text: '110123252@st.tvu.edu.vn'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(buocMoiCapNhat, -2);
    assert.equal(duLieuCapNhat.emailChoXacThuc, '110123252@st.tvu.edu.vn');
    assert.equal(duLieuCapNhat.vaiTroXacThuc, 'SINH_VIEN');
    assert.ok(tinNhanDaGui.some(t => t.text.includes('Hệ thống đã gửi mã OTP 6 chữ số')));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    emailDichVu.guiEmailOtp = banGocGuiEmailOtp;
  }

  // 2. Bước -2: Nhập đúng OTP 6 số
  tinNhanDaGui.length = 0;
  const maOtpChuan = otpDichVu.taoVaLuuOtp('110123252@st.tvu.edu.vn', 6);

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };
  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-xac-thuc-otp',
    buoc_hien_tai: -2,
    du_lieu_tam: {
      emailChoXacThuc: '110123252@st.tvu.edu.vn',
      vaiTroXacThuc: 'SINH_VIEN',
      tienToEmail: '110123252'
    },
    thoi_gian_cap_nhat: new Date()
  });

  let nguoiDungDaTao = null;
  prisma.nguoi_dung.updateMany = async () => ({ count: 0 });
  prisma.nguoi_dung.create = async ({ data }) => {
    nguoiDungDaTao = data;
    return { ma_nguoi_dung: 888, ...data };
  };

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-xac-thuc-otp' },
          text: maOtpChuan
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(buocMoiCapNhat, 1);
    assert.ok(nguoiDungDaTao);
    assert.equal(nguoiDungDaTao.email, '110123252@st.tvu.edu.vn');
    assert.equal(nguoiDungDaTao.vai_tro, 'SINH_VIEN');
    assert.equal(nguoiDungDaTao.chat_id_zalo, 'chat-xac-thuc-otp');
    assert.ok(tinNhanDaGui.some(t => t.text.includes('XÁC THỰC THÀNH CÔNG')));
    assert.ok(tinNhanDaGui.some(t => t.text.includes('BƯỚC 1/4 - CHỌN THIẾT BỊ BÁO HỎNG')));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
    prisma.nguoi_dung.create = banGocCreate;
    prisma.nguoi_dung.updateMany = banGocUpdateMany;
  }
});

// =============================================================================
// PHẦN 5: TEST PHÂN QUYỀN BƯỚC 3 (ƯU TIÊN GIẢNG VIÊN) & BƯỚC 4 (ẢNH HIỆN TRƯỜNG)
// =============================================================================
test('zaloDieuKhien: Bước 3 tự động nâng độ ưu tiên lên CAO đối với Giảng viên', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 501,
    vai_tro: 'GIANG_VIEN',
    trang_thai_hoat_dong: true,
    email: 'quocnk@tvu.edu.vn'
  });

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-gv-buoc3',
    buoc_hien_tai: 3,
    du_lieu_tam: { tenThietBi: 'Máy chiếu', phong: 'D71.103' },
    thoi_gian_cap_nhat: new Date()
  });

  let duLieuSauBuoc3 = null;
  prisma.phien_hoi_thoai_zalo.update = async ({ data }) => {
    duLieuSauBuoc3 = data.du_lieu_tam;
    return {};
  };

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-gv-buoc3' },
          text: 'Màn hình chiếu bị mờ'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.ok(duLieuSauBuoc3);
    assert.equal(duLieuSauBuoc3.mucDoUuTien, 'CAO'); // Tự động nâng lên CAO vì là Giảng viên
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
  }
});

test('zaloDieuKhien: Bước 4 - SINH_VIEN bị từ chối lệnh boqua và bắt buộc phải gửi ảnh', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-sv-buoc4',
    buoc_hien_tai: 4,
    du_lieu_tam: { tenThietBi: 'Máy chiếu', phong: 'D71.103', moTa: 'Lỗi bóng đèn' },
    thoi_gian_cap_nhat: new Date()
  });

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 301,
    vai_tro: 'SINH_VIEN',
    trang_thai_hoat_dong: true,
    email: '110123252@st.tvu.edu.vn'
  });

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-sv-buoc4' },
          text: 'boqua'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanDaGui.length, 1);
    assert.ok(tinNhanDaGui[0].text.includes('bắt buộc phải gửi 1 tấm ảnh chụp thực tế'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
  }
});

test('zaloDieuKhien: Bước 4 - Tài khoản email SV dù gắn vai_tro KTV (ktvnhut) vẫn bị CHẶN lệnh boqua', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: '3c50740f73439a1dc352',
    buoc_hien_tai: 4,
    du_lieu_tam: { tenThietBi: 'Âm thanh', phong: 'E21.206', moTa: 'Micro mất tiếng' },
    thoi_gian_cap_nhat: new Date()
  });

  // Giả lập tài khoản ktvnhut: vai_tro = KTV nhưng email = 110123252@st.tvu.edu.vn (Sinh viên)
  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 10,
    tai_khoan: 'ktvnhut',
    vai_tro: 'KTV',
    trang_thai_hoat_dong: true,
    email: '110123252@st.tvu.edu.vn'
  });

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: '3c50740f73439a1dc352' },
          text: 'bỏ qua'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanDaGui.length, 1);
    assert.ok(tinNhanDaGui[0].text.includes('bắt buộc phải gửi 1 tấm ảnh chụp thực tế'));
    assert.ok(tinNhanDaGui[0].text.includes('không áp dụng lệnh "boqua"'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
  }
});

test('zaloDieuKhien: Bước 4 - Người dùng chưa định danh (nguoiDung = null) bị CHẶN lệnh boqua', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-an-danh-buoc4',
    buoc_hien_tai: 4,
    du_lieu_tam: { tenThietBi: 'Máy lạnh', phong: 'B31.204', moTa: 'Không mát' },
    thoi_gian_cap_nhat: new Date()
  });

  // Chưa liên kết tài khoản nào
  prisma.nguoi_dung.findFirst = async () => null;

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-an-danh-buoc4' },
          text: 'boqua'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanDaGui.length, 1);
    assert.ok(tinNhanDaGui[0].text.includes('bắt buộc phải gửi 1 tấm ảnh chụp thực tế'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
  }
});

test('zaloDieuKhien: Bước 4 - Sinh viên nhập chữ không hợp lệ nhận thông báo bắt buộc ảnh, không gợi ý boqua', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-sv-invalid-buoc4',
    buoc_hien_tai: 4,
    du_lieu_tam: { tenThietBi: 'Đèn chiếu', phong: 'D71.103', moTa: 'Cháy bóng' },
    thoi_gian_cap_nhat: new Date()
  });

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 301,
    vai_tro: 'SINH_VIEN',
    trang_thai_hoat_dong: true,
    email: '110123252@st.tvu.edu.vn'
  });

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-sv-invalid-buoc4' },
          text: 'khong co may anh o day'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanDaGui.length, 1);
    assert.ok(tinNhanDaGui[0].text.includes('bắt buộc chụp ảnh, không áp dụng "boqua"'));
    assert.ok(!tinNhanDaGui[0].text.includes('hoặc gõ "boqua"'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
  }
});

test('zaloDieuKhien: Bước 3 - Hướng dẫn bước 4 KHÔNG gợi ý "boqua" cho Sinh viên', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocUpdate = prisma.phien_hoi_thoai_zalo.update;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-sv-buoc3',
    buoc_hien_tai: 3,
    du_lieu_tam: { tenThietBi: 'Máy tính', phong: 'D71.103' },
    thoi_gian_cap_nhat: new Date()
  });

  prisma.phien_hoi_thoai_zalo.update = async () => ({});

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 301,
    vai_tro: 'SINH_VIEN',
    trang_thai_hoat_dong: true,
    email: '110123252@st.tvu.edu.vn'
  });

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-sv-buoc3' },
          text: 'Màn hình xanh'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanDaGui.length, 1);
    assert.ok(tinNhanDaGui[0].text.includes('Bước 4/4'));
    assert.ok(!tinNhanDaGui[0].text.includes('hoặc gõ "boqua"'));
    assert.ok(tinNhanDaGui[0].text.includes('bắt buộc đối với Sinh viên'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
    prisma.phien_hoi_thoai_zalo.update = banGocUpdate;
  }
});

test('zaloDieuKhien: Bước 4 - GIANG_VIEN được phép dùng lệnh boqua để tạo yêu cầu nhanh', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocTransaction = prisma.$transaction;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-gv-buoc4',
    buoc_hien_tai: 4,
    du_lieu_tam: { tenThietBi: 'Máy chiếu', phong: 'D71.103', moTa: 'Không lên nguồn' },
    thoi_gian_cap_nhat: new Date()
  });

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 302,
    vai_tro: 'GIANG_VIEN',
    trang_thai_hoat_dong: true,
    email: 'quocnk@tvu.edu.vn'
  });

  prisma.$transaction = async (cb) => {
    return cb({
      phien_hoi_thoai_zalo: { deleteMany: async () => ({ count: 1 }) },
      yeu_cau_bao_hong: {
        create: async ({ data }) => ({
          ...data,
          ma_yeu_cau: '#YC202611100002',
          ten_thiet_bi: data.ten_thiet_bi,
          vi_tri_phong: data.vi_tri_phong
        })
      }
    });
  };

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-gv-buoc4' },
          text: 'boqua'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.ok(tinNhanDaGui.some(t => t.text.includes('ĐÃ TIẾP NHẬN YÊU CẦU THÀNH CÔNG')));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
    prisma.$transaction = banGocTransaction;
  }
});

test('zaloDieuKhien.trichXuatUrlAnh: Trích xuất chính xác URL ảnh từ mọi định dạng Webhook Zalo Bot và Zalo OA', () => {
  const { trichXuatUrlAnh } = zaloDieuKhien;

  // 1. Zalo Bot Platform dạng photo_url trực tiếp
  const payloadBotUrl = { message: { photo_url: 'https://f6.photo.talk.zdn.vn/bot_direct.jpg' } };
  assert.equal(trichXuatUrlAnh(payloadBotUrl, payloadBotUrl.message, payloadBotUrl), 'https://f6.photo.talk.zdn.vn/bot_direct.jpg');

  // 2. Zalo Bot Platform dạng object photo { url, file_id }
  const payloadBotObj = { message: { photo: { file_id: 'img123', url: 'https://f6.photo.talk.zdn.vn/bot_obj.jpg' } } };
  assert.equal(trichXuatUrlAnh(payloadBotObj, payloadBotObj.message, payloadBotObj), 'https://f6.photo.talk.zdn.vn/bot_obj.jpg');

  // 3. Zalo Bot Platform dạng mảng photo (PhotoSize), lấy ảnh nét nhất ở cuối mảng
  const payloadBotArray = {
    message: {
      photo: [
        { file_id: 'thumb', url: 'https://f6.photo.talk.zdn.vn/thumb.jpg' },
        { file_id: 'hd', url: 'https://f6.photo.talk.zdn.vn/hd.jpg' }
      ]
    }
  };
  assert.equal(trichXuatUrlAnh(payloadBotArray, payloadBotArray.message, payloadBotArray), 'https://f6.photo.talk.zdn.vn/hd.jpg');

  // 4. Zalo Bot Platform dạng chuỗi photo
  const payloadBotStr = { message: { photo: 'https://f6.photo.talk.zdn.vn/bot_str.jpg' } };
  assert.equal(trichXuatUrlAnh(payloadBotStr, payloadBotStr.message, payloadBotStr), 'https://f6.photo.talk.zdn.vn/bot_str.jpg');

  // 5. Zalo OA dạng user_send_image với mảng attachments
  const payloadOa = {
    event_name: 'user_send_image',
    sender: { id: 'user_oa_01' },
    message: {
      attachments: [
        {
          type: 'image',
          payload: { url: 'https://f6.photo.talk.zdn.vn/oa_attachment.jpg', thumbnail: 'https://thumb.jpg' }
        }
      ]
    }
  };
  assert.equal(trichXuatUrlAnh(payloadOa, payloadOa.message, payloadOa), 'https://f6.photo.talk.zdn.vn/oa_attachment.jpg');

  // 6. Zalo OA dạng attachment (số ít)
  const payloadOaSingle = {
    message: {
      attachment: {
        payload: { url: 'https://f6.photo.talk.zdn.vn/oa_single.jpg' }
      }
    }
  };
  assert.equal(trichXuatUrlAnh(payloadOaSingle, payloadOaSingle.message, payloadOaSingle), 'https://f6.photo.talk.zdn.vn/oa_single.jpg');

  // 7. Tự động nâng cấp http:// sang https://
  const payloadInsecure = { message: { photo_url: 'http://f6.photo.talk.zdn.vn/insecure.jpg' } };
  assert.equal(trichXuatUrlAnh(payloadInsecure, payloadInsecure.message, payloadInsecure), 'https://f6.photo.talk.zdn.vn/insecure.jpg');

  // 8. Tin nhắn chỉ có text -> Trả về null
  const payloadTextOnly = { message: { text: 'Không có ảnh' } };
  assert.equal(trichXuatUrlAnh(payloadTextOnly, payloadTextOnly.message, payloadTextOnly), null);
});

test('zaloDieuKhien: Bước 4 - Tiếp nhận ảnh thành công từ webhook Zalo Bot (photo_url), upload Cloudinary và tạo phiếu', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocTransaction = prisma.$transaction;
  const banGocTaiAnh = cloudinaryDichVu.taiAnhLenCloudinary;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  let duongDanAnhGuiLenCloudinary = null;
  cloudinaryDichVu.taiAnhLenCloudinary = async (url) => {
    duongDanAnhGuiLenCloudinary = url;
    return 'https://res.cloudinary.com/tvu/image/upload/v1234/anh_cloudinary.jpg';
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-sv-anh-01',
    buoc_hien_tai: 4,
    du_lieu_tam: { tenThietBi: 'Máy tính / Màn hình', phong: 'D71.103', moTa: 'Không lên nguồn' },
    thoi_gian_cap_nhat: new Date()
  });

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 401,
    vai_tro: 'SINH_VIEN',
    trang_thai_hoat_dong: true,
    email: '110123252@st.tvu.edu.vn'
  });

  let yeuCauLuuDb = null;
  prisma.$transaction = async (cb) => {
    return cb({
      phien_hoi_thoai_zalo: { deleteMany: async () => ({ count: 1 }) },
      yeu_cau_bao_hong: {
        create: async ({ data }) => {
          yeuCauLuuDb = data;
          return {
            ...data,
            ma_yeu_cau: '#YC202611200001',
            ten_thiet_bi: data.ten_thiet_bi,
            vi_tri_phong: data.vi_tri_phong
          };
        }
      }
    });
  };

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.image.received',
        message: {
          chat: { id: 'chat-sv-anh-01' },
          photo_url: 'https://f6.photo.talk.zdn.vn/anh_man_hinh_hd.jpg'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(duongDanAnhGuiLenCloudinary, 'https://f6.photo.talk.zdn.vn/anh_man_hinh_hd.jpg');
    assert.ok(yeuCauLuuDb);
    assert.equal(yeuCauLuuDb.duong_dan_anh, 'https://res.cloudinary.com/tvu/image/upload/v1234/anh_cloudinary.jpg');
    assert.ok(tinNhanDaGui.some(t => t.text.includes('ĐÃ TIẾP NHẬN YÊU CẦU THÀNH CÔNG')));
    assert.ok(!tinNhanDaGui.some(t => t.text.includes('chưa tải được ảnh')));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
    prisma.$transaction = banGocTransaction;
    cloudinaryDichVu.taiAnhLenCloudinary = banGocTaiAnh;
  }
});

test('zaloDieuKhien: Bước 4 - Tiếp nhận ảnh thành công từ webhook Zalo OA (user_send_image với attachments)', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocTransaction = prisma.$transaction;
  const banGocTaiAnh = cloudinaryDichVu.taiAnhLenCloudinary;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  let duongDanAnhGuiLen = null;
  cloudinaryDichVu.taiAnhLenCloudinary = async (url) => {
    duongDanAnhGuiLen = url;
    return 'https://res.cloudinary.com/tvu/image/upload/v5678/anh_oa_cloud.jpg';
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-gv-oa-02',
    buoc_hien_tai: 4,
    du_lieu_tam: { tenThietBi: 'Máy chiếu', phong: 'B31.204', moTa: 'Không nhận cáp HDMI' },
    thoi_gian_cap_nhat: new Date()
  });

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 402,
    vai_tro: 'GIANG_VIEN',
    trang_thai_hoat_dong: true,
    email: 'canbogv@tvu.edu.vn'
  });

  let yeuCauLuuDb = null;
  prisma.$transaction = async (cb) => {
    return cb({
      phien_hoi_thoai_zalo: { deleteMany: async () => ({ count: 1 }) },
      yeu_cau_bao_hong: {
        create: async ({ data }) => {
          yeuCauLuuDb = data;
          return {
            ...data,
            ma_yeu_cau: '#YC202611200002',
            ten_thiet_bi: data.ten_thiet_bi,
            vi_tri_phong: data.vi_tri_phong
          };
        }
      }
    });
  };

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'user_send_image',
        sender: { id: 'chat-gv-oa-02' },
        message: {
          attachments: [
            {
              type: 'image',
              payload: { url: 'https://f6.photo.talk.zdn.vn/may_chieu_hdmi.jpg' }
            }
          ]
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(duongDanAnhGuiLen, 'https://f6.photo.talk.zdn.vn/may_chieu_hdmi.jpg');
    assert.ok(yeuCauLuuDb);
    assert.equal(yeuCauLuuDb.duong_dan_anh, 'https://res.cloudinary.com/tvu/image/upload/v5678/anh_oa_cloud.jpg');
    assert.ok(tinNhanDaGui.some(t => t.text.includes('ĐÃ TIẾP NHẬN YÊU CẦU THÀNH CÔNG')));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
    prisma.$transaction = banGocTransaction;
    cloudinaryDichVu.taiAnhLenCloudinary = banGocTaiAnh;
  }
});

test('zaloDieuKhien: Bước 4 - Xử lý an toàn khi Cloudinary gặp sự cố (fallback ghi nhận phiếu và gửi lưu ý)', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocTransaction = prisma.$transaction;
  const banGocTaiAnh = cloudinaryDichVu.taiAnhLenCloudinary;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  cloudinaryDichVu.taiAnhLenCloudinary = async () => {
    throw new Error('Cloudinary server 500 error or timeout');
  };

  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-sv-loi-anh-03',
    buoc_hien_tai: 4,
    du_lieu_tam: { tenThietBi: 'Máy lạnh', phong: 'A42.204', moTa: 'Chảy nước dàn lạnh' },
    thoi_gian_cap_nhat: new Date()
  });

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 403,
    vai_tro: 'SINH_VIEN',
    trang_thai_hoat_dong: true,
    email: '110123252@st.tvu.edu.vn'
  });

  let yeuCauLuuDb = null;
  prisma.$transaction = async (cb) => {
    return cb({
      phien_hoi_thoai_zalo: { deleteMany: async () => ({ count: 1 }) },
      yeu_cau_bao_hong: {
        create: async ({ data }) => {
          yeuCauLuuDb = data;
          return {
            ...data,
            ma_yeu_cau: '#YC202611200003',
            ten_thiet_bi: data.ten_thiet_bi,
            vi_tri_phong: data.vi_tri_phong
          };
        }
      }
    });
  };

  try {
    const { req, res } = taoReqRes({
      body: {
        message: {
          chat: { id: 'chat-sv-loi-anh-03' },
          photo: 'https://f6.photo.talk.zdn.vn/may_lanh.jpg'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.ok(yeuCauLuuDb);
    assert.equal(yeuCauLuuDb.duong_dan_anh, null); // Fallback null an toàn
    assert.ok(tinNhanDaGui.some(t => t.text.includes('ĐÃ TIẾP NHẬN YÊU CẦU THÀNH CÔNG')));
    assert.ok(tinNhanDaGui.some(t => t.text.includes('chưa tải được ảnh của bạn')));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
    prisma.$transaction = banGocTransaction;
    cloudinaryDichVu.taiAnhLenCloudinary = banGocTaiAnh;
  }
});

// =============================================================================
// PHẦN 6: TEST SỰ KIỆN "QUAN TÂM" (FOLLOW) & CHỐNG LẶP TIN NHẮN CHÀO MỪNG
// =============================================================================
test('zaloDieuKhien: Tự động gửi 2 tin nhắn Onboarding ngay khi người dùng ấn Quan tâm (follow event)', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocUpsert = prisma.phien_hoi_thoai_zalo.upsert;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };
  prisma.nguoi_dung.findFirst = async () => null; // Người dùng mới

  let duLieuUpsertPhien = null;
  prisma.phien_hoi_thoai_zalo.upsert = async ({ where, create }) => {
    duLieuUpsertPhien = create;
    return { ma_nguoi_bao_zalo: where.ma_nguoi_bao_zalo, ...create };
  };

  try {
    const { req, res, getStatus } = taoReqRes({
      body: {
        event_name: 'follow',
        follower: { id: 'zalo_new_user_01' }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(getStatus(), 200);
    assert.equal(tinNhanDaGui.length, 2);
    assert.ok(tinNhanDaGui[0].text.includes('Xin chào! Tôi là Trợ lý Zalo Bot'));
    assert.ok(tinNhanDaGui[1].text.includes('CÁCH DÙNG BOT SIÊU ĐƠN GIẢN'));
    assert.ok(tinNhanDaGui[1].text.includes('XÁC THỰC LẦN ĐẦU'));
    assert.ok(duLieuUpsertPhien);
    assert.equal(duLieuUpsertPhien.buoc_hien_tai, -1);
    assert.equal(duLieuUpsertPhien.du_lieu_tam.trang_thai_xac_thuc, 'CHO_NHAP_EMAIL');
    assert.equal(duLieuUpsertPhien.du_lieu_tam.da_gui_chao_mung, true);
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.upsert = banGocUpsert;
  }
});

test('zaloDieuKhien: Người dùng CŨ ấn Quan tâm lại nhận được tin nhắn chào mừng quay trở lại', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.nguoi_dung.findFirst = async () => ({
    ma_nguoi_dung: 88,
    chat_id_zalo: 'zalo_old_user_02',
    tai_khoan: 'old_user',
    vai_tro: 'SINH_VIEN',
    trang_thai_hoat_dong: true
  });

  try {
    const { req, res, getStatus } = taoReqRes({
      body: {
        event_name: 'user_follow',
        user: { id: 'zalo_old_user_02' }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    assert.equal(getStatus(), 200);
    assert.equal(tinNhanDaGui.length, 1);
    assert.ok(tinNhanDaGui[0].text.includes('Chào mừng bạn quay trở lại với Bot Tiếp nhận Báo hỏng'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
  }
});

test('zaloDieuKhien: Chống gửi lặp 2 tin nhắn khi người dùng đã nhận chào mừng mà nhắn câu khởi đầu', async () => {
  const tinNhanDaGui = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  const banGocFindFirst = prisma.nguoi_dung.findFirst;
  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;

  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanDaGui.push({ chatId, text });
  };

  prisma.nguoi_dung.findFirst = async () => null; // Chưa xác thực
  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_nguoi_bao_zalo: 'chat-follow-lap',
    buoc_hien_tai: -1,
    du_lieu_tam: { trang_thai_xac_thuc: 'CHO_NHAP_EMAIL', da_gui_chao_mung: true },
    thoi_gian_cap_nhat: new Date()
  });

  try {
    const { req, res } = taoReqRes({
      body: {
        event_name: 'message.text.received',
        message: {
          chat: { id: 'chat-follow-lap' },
          text: 'Xin chào'
        }
      }
    });

    await zaloDieuKhien.tiepNhanWebhookZalo(req, res);

    // Chỉ gửi 1 tin nhắn nhắc nhở ngắn gọn, không gửi lại 2 tin nhắn dài
    assert.equal(tinNhanDaGui.length, 1);
    assert.ok(tinNhanDaGui[0].text.includes('Để bắt đầu sử dụng, bạn vui lòng nhập địa chỉ Email trường cấp'));
    assert.ok(!tinNhanDaGui[0].text.includes('CÁCH DÙNG BOT SIÊU ĐƠN GIẢN'));
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.nguoi_dung.findFirst = banGocFindFirst;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
  }
});
