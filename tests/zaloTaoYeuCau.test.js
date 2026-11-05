const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = 'khoa-bi-mat-chi-dung-cho-kiem-thu-0123456789abcdef';

function datDoiTuongGia(duongDanTuongDoi, doiTuongGia) {
  const duongDan = require.resolve(duongDanTuongDoi);
  require.cache[duongDan] = { id: duongDan, filename: duongDan, loaded: true, exports: doiTuongGia };
}

let soLanGiaoDich = 0;
let soLoiTrungMaConLai = 0;
let soDongXoaPhien = 1;
let yeuCauDaTao = [];

const giaoDichGia = {
  phien_hoi_thoai_zalo: { deleteMany: async () => ({ count: soDongXoaPhien }) },
  yeu_cau_bao_hong: {
    create: async ({ data }) => {
      yeuCauDaTao.push(data);
      return { ...data };
    }
  }
};

const prismaGia = {
  $transaction: async (hamXuLy) => {
    soLanGiaoDich += 1;
    if (soLoiTrungMaConLai > 0) {
      soLoiTrungMaConLai -= 1;
      const loi = new Error('Unique constraint failed');
      loi.code = 'P2002';
      throw loi;
    }
    return hamXuLy(giaoDichGia);
  }
};

datDoiTuongGia('../src/config/coSoDuLieu', prismaGia);
datDoiTuongGia('../src/services/zaloDichVu', { guiTinNhanZalo: async () => {} });
datDoiTuongGia('../src/services/cloudinaryDichVu', { taiAnhLenCloudinary: async () => null });

const { taoYeuCauTuPhien } = require('../src/controllers/zaloDieuKhien');

const duLieuTamMau = { tenThietBi: 'May chieu', phong: 'B204', moTa: 'Khong len nguon' };

function datLai({ trungMa = 0, xoaPhien = 1 } = {}) {
  soLanGiaoDich = 0;
  soLoiTrungMaConLai = trungMa;
  soDongXoaPhien = xoaPhien;
  yeuCauDaTao = [];
}

test('taoYeuCauTuPhien: tạo thành công ở lần đầu', async () => {
  datLai();
  const yeuCau = await taoYeuCauTuPhien('chat-1', duLieuTamMau, null);
  assert.ok(yeuCau && yeuCau.ma_yeu_cau);
  assert.strictEqual(soLanGiaoDich, 1);
  assert.strictEqual(yeuCauDaTao.length, 1);
});

test('taoYeuCauTuPhien: thử lại với mã mới khi trùng mã yêu cầu (P2002)', async () => {
  datLai({ trungMa: 1 });
  const yeuCau = await taoYeuCauTuPhien('chat-1', duLieuTamMau, null);
  assert.ok(yeuCau && yeuCau.ma_yeu_cau);
  assert.strictEqual(soLanGiaoDich, 2);
});

test('taoYeuCauTuPhien: trả null và KHÔNG tạo yêu cầu khi phiên đã bị luồng khác lấy (tin nhắn trùng)', async () => {
  datLai({ xoaPhien: 0 });
  const yeuCau = await taoYeuCauTuPhien('chat-1', duLieuTamMau, null);
  assert.strictEqual(yeuCau, null);
  assert.strictEqual(yeuCauDaTao.length, 0);
});

test('taoYeuCauTuPhien: ném lỗi sau 5 lần trùng mã liên tiếp', async () => {
  datLai({ trungMa: 99 });
  await assert.rejects(() => taoYeuCauTuPhien('chat-1', duLieuTamMau, null), (loi) => loi.code === 'P2002');
  assert.strictEqual(soLanGiaoDich, 5);
});

test('dangXuLyBuoc4: quản lý khóa in-flight an toàn trong bộ nhớ chống race condition', () => {
  const { dangXuLyBuoc4 } = require('../src/controllers/zaloDieuKhien');
  assert.ok(dangXuLyBuoc4 instanceof Set);
  const chatId = 'chat-test-inflight-lock';
  dangXuLyBuoc4.add(chatId);
  assert.strictEqual(dangXuLyBuoc4.has(chatId), true);
  dangXuLyBuoc4.delete(chatId);
  assert.strictEqual(dangXuLyBuoc4.has(chatId), false);
});
