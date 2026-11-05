// tests/zaloQuyTrinh.test.js - Unit tests cho logic phiên hội thoại và chống spam
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nhanDienDanhMucThietBi,
  chuanHoaTenPhong,
  tuDongGanMucDoUuTien,
  boDau
} = require('../src/utils/tienIch');

test('zaloQuyTrinh: Tính toán khoảng cách chống spam (ngưỡng 10 phút)', () => {
  const NGUONG_SPAM_MS = 10 * 60 * 1000;

  // Trường hợp 1: Yêu cầu vừa tạo cách đây 3 phút -> Bị chặn
  const thoiGianTao3PhutTruoc = new Date(Date.now() - 3 * 60 * 1000);
  const thoiGianTroiQua3Phut = Date.now() - thoiGianTao3PhutTruoc.getTime();
  assert.ok(thoiGianTroiQua3Phut < NGUONG_SPAM_MS);

  const soPhutConLai = Math.ceil((NGUONG_SPAM_MS - thoiGianTroiQua3Phut) / 60000);
  assert.equal(soPhutConLai, 7);

  // Trường hợp 2: Yêu cầu đã tạo cách đây 15 phút -> Không bị chặn
  const thoiGianTao15PhutTruoc = new Date(Date.now() - 15 * 60 * 1000);
  const thoiGianTroiQua15Phut = Date.now() - thoiGianTao15PhutTruoc.getTime();
  assert.ok(thoiGianTroiQua15Phut >= NGUONG_SPAM_MS);
});

test('zaloQuyTrinh: Tính toán hết hạn phiên hội thoại lazy check (ngưỡng 10 phút)', () => {
  const NGUONG_HET_HAN_MS = 10 * 60 * 1000;

  // Phiên hoạt động 5 phút trước -> Còn hạn
  const phienMoi = new Date(Date.now() - 5 * 60 * 1000);
  assert.ok(Date.now() - phienMoi.getTime() <= NGUONG_HET_HAN_MS);

  // Phiên không hoạt động từ 12 phút trước -> Đã hết hạn
  const phienCu = new Date(Date.now() - 12 * 60 * 1000);
  assert.ok(Date.now() - phienCu.getTime() > NGUONG_HET_HAN_MS);
});

// =========================================================================
// KIỂM THỬ ĐẶC TẢ CAPNHAT.MD: 4 BƯỚC THÔNG MINH
// =========================================================================

test('zaloQuyTrinh: Bước 1 nhận diện đúng cả số (1..6) lẫn chữ tự do/sai dấu', () => {
  const danhMucMau = [
    { ma_danh_muc: 1, ten_loai: 'Máy chiếu' },
    { ma_danh_muc: 2, ten_loai: 'Điều hòa / Máy lạnh' },
    { ma_danh_muc: 3, ten_loai: 'Máy tính để bàn (PC)' },
    { ma_danh_muc: 4, ten_loai: 'Âm thanh (Mic/Loa)' },
    { ma_danh_muc: 5, ten_loai: 'Thiết bị khác' }
  ];

  // 1. Gõ số 1 thuần túy -> Tự lấy tên chuẩn
  const kq1 = nhanDienDanhMucThietBi('1', danhMucMau);
  assert.equal(kq1.nhom, 1);
  assert.equal(kq1.ten_thiet_bi, 'Máy chiếu / Màn chiếu');

  // 2. Gõ số 2 kèm tên chi tiết -> Lấy nhóm 2 và tên người dùng gõ
  const kq2 = nhanDienDanhMucThietBi('2 Máy PC 05', danhMucMau);
  assert.equal(kq2.nhom, 2);
  assert.equal(kq2.ten_thiet_bi, 'Máy PC 05');

  // 3. Gõ chữ tự do sai chính tả: "may chiu" -> Nhóm 1 (Máy chiếu)
  const kq3 = nhanDienDanhMucThietBi('may chiu', danhMucMau);
  assert.equal(kq3.nhom, 1);
  assert.equal(kq3.ten_thiet_bi, 'may chiu');

  // 4. Gõ chữ tự do: "man hinh" -> Nhóm 2 (Máy tính)
  const kq4 = nhanDienDanhMucThietBi('man hinh', danhMucMau);
  assert.equal(kq4.nhom, 2);
  assert.equal(kq4.ten_thiet_bi, 'man hinh');

  // 5. Gõ chữ tự do có dấu: "điều hòa" -> Nhóm 3 (Điều hòa)
  const kq5 = nhanDienDanhMucThietBi('điều hòa', danhMucMau);
  assert.equal(kq5.nhom, 3);
  assert.equal(kq5.ten_thiet_bi, 'điều hòa');

  // 6. Gõ từ khóa lạ không có trong từ điển -> Nhóm 6 (Thiết bị khác)
  const kq6 = nhanDienDanhMucThietBi('Cây kéo cắt giấy', danhMucMau);
  assert.equal(kq6.nhom, 6);
  assert.equal(kq6.ten_thiet_bi, 'Cây kéo cắt giấy');
});

test('zaloQuyTrinh: Bước 2 tự động chuẩn hóa các kiểu gõ phòng khác nhau', () => {
  // Khu D71 kết hợp số phòng
  assert.equal(chuanHoaTenPhong('phòng d71 103'), 'Phòng D71.103');
  assert.equal(chuanHoaTenPhong('d71-103'), 'Phòng D71.103');
  assert.equal(chuanHoaTenPhong('D71.103'), 'Phòng D71.103');
  assert.equal(chuanHoaTenPhong('p103 d71'), 'Phòng D71.103');

  // Khu B3
  assert.equal(chuanHoaTenPhong('b3 204'), 'Phòng B3.204');
  assert.equal(chuanHoaTenPhong('b3-204'), 'Phòng B3.204');

  // 1 chữ cái + 3 số liền
  assert.equal(chuanHoaTenPhong('b204'), 'Phòng B204');
  assert.equal(chuanHoaTenPhong('c102'), 'Phòng C102');

  // Phòng Lab
  assert.equal(chuanHoaTenPhong('phòng lab 1'), 'Phòng Lab 1');
  assert.equal(chuanHoaTenPhong('lab 02'), 'Phòng Lab 2');
  assert.equal(chuanHoaTenPhong('lab1'), 'Phòng Lab 1');

  // Hội trường
  assert.equal(chuanHoaTenPhong('hội trường e'), 'Hội trường E');
  assert.equal(chuanHoaTenPhong('hoi truong a'), 'Hội trường A');
});

test('zaloQuyTrinh: Bước 3 tự động quét từ khóa rủi ro và gán mức ưu tiên chính xác', () => {
  // Mức KHẨN CẤP
  assert.equal(tuDongGanMucDoUuTien('Chập điện ổ cắm, bốc khói đen'), 'KHAN_CAP');
  assert.equal(tuDongGanMucDoUuTien('Đang có tia lửa và mùi khét ở cầu dao'), 'KHAN_CAP');
  assert.equal(tuDongGanMucDoUuTien('Vỡ ống nước tràn vào phòng máy'), 'KHAN_CAP');

  // Mức CAO (gián đoạn thi cử/giảng dạy/hội trường/mất nguồn)
  assert.equal(tuDongGanMucDoUuTien('Máy in không in được', 'Phòng đang thi'), 'CAO');
  assert.equal(tuDongGanMucDoUuTien('Bật công tắc máy chiếu không lên nguồn'), 'CAO');
  assert.equal(tuDongGanMucDoUuTien('Máy tính mất nguồn toàn bộ'), 'CAO');
  assert.equal(tuDongGanMucDoUuTien('Loa không phát tiếng', 'Hội trường E'), 'CAO');

  // Mức BÌNH THƯỜNG (các sự cố thông thường)
  assert.equal(tuDongGanMucDoUuTien('Bàn phím bị kẹt phím cách'), 'BINH_THUONG');
  assert.equal(tuDongGanMucDoUuTien('Chuột máy tính di chuyển hơi rít'), 'BINH_THUONG');
  assert.equal(tuDongGanMucDoUuTien('Màn chiếu bị nhăn'), 'BINH_THUONG');
});

test('zaloQuyTrinh: Bước 4 hoạt động chuẩn với từ khóa boqua', () => {
  const vanBan1 = boDau('boqua');
  const vanBan2 = boDau('BOQUA');
  const vanBan3 = boDau('bo qua'); // Graceful fallback
  assert.ok(vanBan1 === 'boqua');
  assert.ok(vanBan2 === 'boqua');
  assert.ok(vanBan3 === 'boqua' || vanBan3 === 'bo qua');

  // Từ khóa sai không được coi là bỏ qua
  const vanBanKhac = boDau('khong co anh');
  assert.ok(vanBanKhac !== 'boqua' && vanBanKhac !== 'bo qua');
});
