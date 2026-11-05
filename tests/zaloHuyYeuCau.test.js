// tests/zaloHuyYeuCau.test.js - Unit tests cho nghiệp vụ huyyeucau qua Zalo Bot
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'khoa-bi-mat-chi-dung-cho-kiem-thu-0123456789abcdef';

const prisma = require('../src/config/coSoDuLieu');
const zaloDichVu = require('../src/services/zaloDichVu');
const { tiepNhanWebhookZalo } = require('../src/controllers/zaloDieuKhien');

// 1. Gõ huyyeucau khi đang ở Bước 1..4 sẽ xóa phiên ngay lập tức
test('zaloDieuKhien: gõ huyyeucau khi đang có phiên sẽ xóa phiên ngay lập tức', async () => {
  const tinNhanGuiDi = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanGuiDi.push({ chatId, text });
  };

  const banGocFindUnique = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocDeleteMany = prisma.phien_hoi_thoai_zalo.deleteMany;

  let daGoiXoaPhien = false;
  prisma.phien_hoi_thoai_zalo.findUnique = async () => ({
    ma_phien: 1,
    ma_nguoi_bao_zalo: 'chat-test-cancel',
    buoc_hien_tai: 2,
    du_lieu_tam: { tenThietBi: 'Máy chiếu' },
    thoi_gian_cap_nhat: new Date()
  });

  prisma.phien_hoi_thoai_zalo.deleteMany = async ({ where }) => {
    if (where.ma_nguoi_bao_zalo === 'chat-test-cancel') {
      daGoiXoaPhien = true;
      return { count: 1 };
    }
    return { count: 0 };
  };

  try {
    const req = {
      body: {
        message: {
          chat: { id: 'chat-test-cancel' },
          text: 'huyyeucau'
        }
      }
    };
    const res = { sendStatus() {} };

    await tiepNhanWebhookZalo(req, res);

    assert.equal(daGoiXoaPhien, true, 'Bắt buộc phải gọi xóa phiên!');
    assert.equal(tinNhanGuiDi.length, 1);
    assert.match(tinNhanGuiDi[0].text, /Đã hủy phiên nhập/i);
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUnique;
    prisma.phien_hoi_thoai_zalo.deleteMany = banGocDeleteMany;
  }
});

// 2. Gõ huyyeucau #YC... [Lý do] thành công khi đúng chủ sở hữu và trạng thái CHO_XU_LY
test('zaloDieuKhien: gõ huyyeucau #YC... thành công khi đúng chủ sở hữu và CHO_XU_LY', async () => {
  const tinNhanGuiDi = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanGuiDi.push({ chatId, text });
  };

  const banGocFindUniquePhien = prisma.phien_hoi_thoai_zalo.findUnique;
  const banGocFindFirst = prisma.yeu_cau_bao_hong.findFirst;
  const banGocTransaction = prisma.$transaction;

  prisma.phien_hoi_thoai_zalo.findUnique = async () => null;

  prisma.yeu_cau_bao_hong.findFirst = async ({ where }) => {
    if (where.ma_yeu_cau === '#YC202611028888') {
      return {
        ma_yeu_cau_bao_hong: 88,
        ma_yeu_cau: '#YC202611028888',
        ma_nguoi_bao_zalo: 'chat-owner-123',
        trang_thai: 'CHO_XU_LY'
      };
    }
    return null;
  };

  let daCapNhatSangHuy = false;
  let daGhiLichSu = false;

  prisma.$transaction = async (hamTx) => {
    const tx = {
      yeu_cau_bao_hong: {
        updateMany: async ({ where, data }) => {
          if (where.ma_yeu_cau_bao_hong === 88 && data.trang_thai === 'HUY') {
            daCapNhatSangHuy = true;
            return { count: 1 };
          }
          return { count: 0 };
        }
      },
      lich_su_xu_ly: {
        create: async ({ data }) => {
          if (data.ma_yeu_cau_bao_hong === 88 && data.trang_thai === 'HUY') {
            daGhiLichSu = true;
          }
        }
      }
    };
    return hamTx(tx);
  };

  try {
    const req = {
      body: {
        message: {
          chat: { id: 'chat-owner-123' },
          text: 'huyyeucau #YC202611028888 Nhầm phòng học'
        }
      }
    };
    const res = { sendStatus() {} };

    await tiepNhanWebhookZalo(req, res);

    assert.equal(daCapNhatSangHuy, true, 'Bắt buộc cập nhật trạng thái sang HUY!');
    assert.equal(daGhiLichSu, true, 'Bắt buộc ghi Audit Log lịch sử xử lý!');
    assert.equal(tinNhanGuiDi.length, 1);
    assert.match(tinNhanGuiDi[0].text, /Đã hủy thành công yêu cầu/i);
    assert.match(tinNhanGuiDi[0].text, /Nhầm phòng học/);
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.phien_hoi_thoai_zalo.findUnique = banGocFindUniquePhien;
    prisma.yeu_cau_bao_hong.findFirst = banGocFindFirst;
    prisma.$transaction = banGocTransaction;
  }
});

// 3. Từ chối huyyeucau nếu khác chatId (người khác hủy hộ)
test('zaloDieuKhien: từ chối huyyeucau nếu không phải người đã tạo yêu cầu', async () => {
  const tinNhanGuiDi = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanGuiDi.push({ chatId, text });
  };

  const banGocFindFirst = prisma.yeu_cau_bao_hong.findFirst;
  prisma.yeu_cau_bao_hong.findFirst = async () => ({
    ma_yeu_cau_bao_hong: 88,
    ma_yeu_cau: '#YC202611028888',
    ma_nguoi_bao_zalo: 'chat-nguoi-khac',
    trang_thai: 'CHO_XU_LY'
  });

  try {
    const req = {
      body: {
        message: {
          chat: { id: 'chat-ke-xau' },
          text: 'huyyeucau #YC202611028888'
        }
      }
    };
    const res = { sendStatus() {} };

    await tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanGuiDi.length, 1);
    assert.match(tinNhanGuiDi[0].text, /không phải là người đã tạo yêu cầu/i);
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.yeu_cau_bao_hong.findFirst = banGocFindFirst;
  }
});

// 4. Từ chối huyyeucau nếu yêu cầu đã ở trạng thái DANG_XU_LY hoặc HOAN_THANH
test('zaloDieuKhien: từ chối huyyeucau nếu trạng thái đã chuyển sang DANG_XU_LY', async () => {
  const tinNhanGuiDi = [];
  const banGocGuiTin = zaloDichVu.guiTinNhanZalo;
  zaloDichVu.guiTinNhanZalo = async (chatId, text) => {
    tinNhanGuiDi.push({ chatId, text });
  };

  const banGocFindFirst = prisma.yeu_cau_bao_hong.findFirst;
  prisma.yeu_cau_bao_hong.findFirst = async () => ({
    ma_yeu_cau_bao_hong: 88,
    ma_yeu_cau: '#YC202611028888',
    ma_nguoi_bao_zalo: 'chat-owner-123',
    trang_thai: 'DANG_XU_LY'
  });

  try {
    const req = {
      body: {
        message: {
          chat: { id: 'chat-owner-123' },
          text: 'huyyeucau #YC202611028888'
        }
      }
    };
    const res = { sendStatus() {} };

    await tiepNhanWebhookZalo(req, res);

    assert.equal(tinNhanGuiDi.length, 1);
    assert.match(tinNhanGuiDi[0].text, /không thể tự hủy/i);
  } finally {
    zaloDichVu.guiTinNhanZalo = banGocGuiTin;
    prisma.yeu_cau_bao_hong.findFirst = banGocFindFirst;
  }
});
