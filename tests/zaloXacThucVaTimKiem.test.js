// tests/zaloXacThucVaTimKiem.test.js - Unit tests cho Quy trình Xác thực định danh Zalo Bot & Tìm kiếm KTV đa trường
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

process.env.JWT_SECRET = 'khoa-bi-mat-chi-dung-cho-kiem-thu-0123456789abcdef';
process.env.CHO_PHEP_EMAIL_DEMO = 'true';

const { phanLoaiVaiTroQuaEmail } = require('../src/utils/tienIch');
const { layDanhSachNguoiDung } = require('../src/controllers/nguoiDungDieuKhien');
const { dangNhap } = require('../src/controllers/xacThucDieuKhien');
const zaloDieuKhien = require('../src/controllers/zaloDieuKhien');
const zaloDichVu = require('../src/services/zaloDichVu');
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
