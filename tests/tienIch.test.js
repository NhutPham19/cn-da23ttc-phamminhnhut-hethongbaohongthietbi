// tests/tienIch.test.js - Unit tests cho các hàm tiện ích hệ thống
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  lamSachDuLieu,
  boDau,
  taoMaYeuCau,
  dinhDangTrangThai,
  kiemTraChuyenTrangThai,
  chuanHoaLenhZalo
} = require('../src/utils/tienIch');

test('tienIch: lamSachDuLieu loại bỏ mã HTML độc hại và cắt khoảng trắng', () => {
  const dauVaoDocHai = '  <script>alert("hack")</script> Máy chiếu không lên nguồn  ';
  const ketQua = lamSachDuLieu(dauVaoDocHai);
  assert.equal(ketQua, 'alert("hack") Máy chiếu không lên nguồn');

  // Test xử lý null / undefined
  assert.equal(lamSachDuLieu(null), '');
  assert.equal(lamSachDuLieu(undefined), '');

  // Test cắt tối đa 500 ký tự
  const chuoiDai = 'A'.repeat(600);
  assert.equal(lamSachDuLieu(chuoiDai).length, 500);
});

test('tienIch: boDau chuyển chuỗi tiếng Việt có dấu thành không dấu và chữ thường', () => {
  assert.equal(boDau('Báo Hỏng Thiết Bị'), 'bao hong thiet bi');
  assert.equal(boDau('  ĐÃ HOÀN THÀNH  '), 'da hoan thanh');
  assert.equal(boDau('Phòng Thực Hành D71.103'), 'phong thuc hanh d71.103');
  assert.equal(boDau('HỦY BỎ'), 'huy bo');
  assert.equal(boDau(''), '');
  assert.equal(boDau(null), '');
});

test('tienIch: taoMaYeuCau sinh mã chuẩn #YC + yyyymmdd + 4 số', () => {
  const ma1 = taoMaYeuCau();
  const ma2 = taoMaYeuCau();

  assert.match(ma1, /^#YC\d{8}\d{4}$/);
  assert.match(ma2, /^#YC\d{8}\d{4}$/);
  assert.equal(ma1.length, 15);
  assert.equal(ma2.length, 15);

  const homNay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()).replace(/-/g, '');
  assert.ok(ma1.includes(homNay));
});

test('tienIch: dinhDangTrangThai hiển thị đúng nhãn tiếng Việt', () => {
  assert.equal(dinhDangTrangThai('CHO_XU_LY'), 'Chờ xử lý');
  assert.equal(dinhDangTrangThai('DANG_XU_LY'), 'Đang xử lý');
  assert.equal(dinhDangTrangThai('HOAN_THANH'), 'Đã hoàn thành');
  assert.equal(dinhDangTrangThai('HUY'), 'Đã hủy');
  assert.equal(dinhDangTrangThai('KHONG_RO'), 'KHONG_RO');
});

test('tienIch: kiemTraChuyenTrangThai kiểm soát luồng trạng thái nghiêm ngặt', () => {
  // Luồng hợp lệ
  assert.equal(kiemTraChuyenTrangThai('CHO_XU_LY', 'DANG_XU_LY'), true);
  assert.equal(kiemTraChuyenTrangThai('CHO_XU_LY', 'HUY'), true);
  assert.equal(kiemTraChuyenTrangThai('DANG_XU_LY', 'HOAN_THANH'), true);
  assert.equal(kiemTraChuyenTrangThai('DANG_XU_LY', 'HUY'), true);

  // Luồng bất hợp lệ
  assert.equal(kiemTraChuyenTrangThai('CHO_XU_LY', 'HOAN_THANH'), false); // Không thể nhảy cóc từ chờ sang hoàn thành
  assert.equal(kiemTraChuyenTrangThai('HOAN_THANH', 'CHO_XU_LY'), false); // Đã xong không thể quay lại
  assert.equal(kiemTraChuyenTrangThai('HOAN_THANH', 'DANG_XU_LY'), false);
  assert.equal(kiemTraChuyenTrangThai('HUY', 'CHO_XU_LY'), false);        // Đã hủy không thể sửa tiếp
  assert.equal(kiemTraChuyenTrangThai('HUY', 'HOAN_THANH'), false);
});

test('tienIch: chuanHoaLenhZalo nhận diện linh hoạt bộ lệnh chuẩn baohong, tracuu, huyyeucau, id, trogiup', () => {
  // 1. baohong
  assert.deepEqual(chuanHoaLenhZalo('baohong'), { lenh: 'baohong', doiSo: '', chuoiGoc: 'baohong' });
  assert.deepEqual(chuanHoaLenhZalo('Báo hỏng'), { lenh: 'baohong', doiSo: '', chuoiGoc: 'Báo hỏng' });
  assert.deepEqual(chuanHoaLenhZalo('bao hong'), { lenh: 'baohong', doiSo: '', chuoiGoc: 'bao hong' });
  assert.deepEqual(chuanHoaLenhZalo('start'), { lenh: 'baohong', doiSo: '', chuoiGoc: 'start' });

  // 2. id
  assert.deepEqual(chuanHoaLenhZalo('id'), { lenh: 'id', doiSo: '', chuoiGoc: 'id' });
  assert.deepEqual(chuanHoaLenhZalo(' ID '), { lenh: 'id', doiSo: '', chuoiGoc: 'ID' });
  assert.deepEqual(chuanHoaLenhZalo('/id'), { lenh: 'id', doiSo: '', chuoiGoc: '/id' });

  // 3. trogiup
  assert.deepEqual(chuanHoaLenhZalo('trogiup'), { lenh: 'trogiup', doiSo: '', chuoiGoc: 'trogiup' });
  assert.deepEqual(chuanHoaLenhZalo('Trợ giúp'), { lenh: 'trogiup', doiSo: '', chuoiGoc: 'Trợ giúp' });
  assert.deepEqual(chuanHoaLenhZalo('help'), { lenh: 'trogiup', doiSo: '', chuoiGoc: 'help' });

  // 4. tracuu
  assert.deepEqual(chuanHoaLenhZalo('tracuu #YC202611021234'), { lenh: 'tracuu', doiSo: '#YC202611021234', chuoiGoc: 'tracuu #YC202611021234' });
  assert.deepEqual(chuanHoaLenhZalo('tra cuu YC202611021234'), { lenh: 'tracuu', doiSo: 'YC202611021234', chuoiGoc: 'tra cuu YC202611021234' });
  assert.deepEqual(chuanHoaLenhZalo('Tra cứu #YC202611021234'), { lenh: 'tracuu', doiSo: '#YC202611021234', chuoiGoc: 'Tra cứu #YC202611021234' });

  // 5. huyyeucau
  assert.deepEqual(chuanHoaLenhZalo('huyyeucau'), { lenh: 'huyyeucau', doiSo: '', chuoiGoc: 'huyyeucau' });
  assert.deepEqual(chuanHoaLenhZalo('huy'), { lenh: 'huyyeucau', doiSo: '', chuoiGoc: 'huy' });
  assert.deepEqual(chuanHoaLenhZalo('Hủy yêu cầu'), { lenh: 'huyyeucau', doiSo: '', chuoiGoc: 'Hủy yêu cầu' });
  assert.deepEqual(chuanHoaLenhZalo('huyyeucau #YC202611021234 Nhầm phòng'), {
    lenh: 'huyyeucau',
    doiSo: '#YC202611021234 Nhầm phòng',
    chuoiGoc: 'huyyeucau #YC202611021234 Nhầm phòng'
  });
  assert.deepEqual(chuanHoaLenhZalo('huy #YC202611021234 Bật lại cầu dao'), {
    lenh: 'huyyeucau',
    doiSo: '#YC202611021234 Bật lại cầu dao',
    chuoiGoc: 'huy #YC202611021234 Bật lại cầu dao'
  });

  // Văn bản thường không phải lệnh
  assert.deepEqual(chuanHoaLenhZalo('Máy chiếu Panasonic'), { lenh: '', doiSo: '', chuoiGoc: 'Máy chiếu Panasonic' });
  assert.deepEqual(chuanHoaLenhZalo('Phòng D71.103'), { lenh: '', doiSo: '', chuoiGoc: 'Phòng D71.103' });
});
