// tests/kiemTraBaoMat.test.js - Unit tests cho middleware kiểm tra Secret Token
const test = require('node:test');
const assert = require('node:assert/strict');
const { kiemTraSecretToken } = require('../src/middlewares/kiemTraBaoMat');

test('kiemTraBaoMat: Cho phép probe request kiểm tra sống chết từ Zalo', () => {
  let daGoiNext = false;
  let trangThaiGui = null;
  let noiDungGui = null;

  const req = {
    headers: {},
    body: {}
  };
  const res = {
    status(code) {
      trangThaiGui = code;
      return this;
    },
    send(data) {
      noiDungGui = data;
    }
  };
  const next = () => { daGoiNext = true; };

  kiemTraSecretToken(req, res, next);
  assert.equal(daGoiNext, false);
  assert.equal(trangThaiGui, 200);
  assert.equal(noiDungGui, 'OK Probe');
});

test('kiemTraBaoMat: Từ chối nếu thiếu hoặc sai Secret Token', () => {
  process.env.ZALO_SECRET_TOKEN = 'BiMatChuan123';

  let daGoiNext = false;
  let maLoi = null;
  let duLieuLoi = null;

  const req = {
    headers: { 'x-bot-api-secret-token': 'SaiSecretToken' },
    body: { message: { text: 'test' } }
  };
  const res = {
    status(code) {
      maLoi = code;
      return this;
    },
    json(data) {
      duLieuLoi = data;
    }
  };
  const next = () => { daGoiNext = true; };

  kiemTraSecretToken(req, res, next);
  assert.equal(daGoiNext, false);
  assert.equal(maLoi, 401);
  assert.equal(duLieuLoi.thanhCong, false);
});

test('kiemTraBaoMat: Cho qua nếu Secret Token hoàn toàn trùng khớp', () => {
  process.env.ZALO_SECRET_TOKEN = 'BiMatChuan123';

  let daGoiNext = false;
  const req = {
    headers: { 'x-bot-api-secret-token': 'BiMatChuan123' },
    body: { message: { text: 'test' } }
  };
  const res = {};
  const next = () => { daGoiNext = true; };

  kiemTraSecretToken(req, res, next);
  assert.equal(daGoiNext, true);
});
