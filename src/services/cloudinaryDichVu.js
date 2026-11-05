// src/services/cloudinaryDichVu.js - Tải ảnh từ Zalo và đẩy lên Cloudinary
// Quy chuẩn Ponytail: Dùng native fetch + native crypto, không cài package cloudinary ngoài

const crypto = require('crypto');

const DUNG_LUONG_TOI_DA_BYTE = 5 * 1024 * 1024; // 5 MB
const THOI_GIAN_CHO_TAI_ANH_MS = 10 * 1000;     // 10 giây
const THOI_GIAN_CHO_UPLOAD_MS = 15 * 1000;      // 15 giây

/**
 * Tải ảnh hiện trường từ Zalo và đẩy lên Cloudinary lấy link HTTPS vĩnh viễn
 * @param {string} urlAnhZalo - Đường dẫn ảnh từ bản tin Zalo Webhook
 * @returns {Promise<string>} Link HTTPS an toàn (secure_url) từ Cloudinary
 */
async function taiAnhLenCloudinary(urlAnhZalo) {
  if (!urlAnhZalo || typeof urlAnhZalo !== 'string' || !urlAnhZalo.startsWith('https://')) {
    throw new Error('Đường dẫn ảnh không hợp lệ (phải bắt đầu bằng https://)');
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Chưa cấu hình đầy đủ biến môi trường Cloudinary');
  }

  // 1. Tải ảnh từ URL HTTPS an toàn của Zalo với timeout 10s (chống treo/SSRF)
  const phanHoiAnh = await fetch(urlAnhZalo, {
    signal: AbortSignal.timeout(THOI_GIAN_CHO_TAI_ANH_MS)
  });
  if (!phanHoiAnh.ok) {
    throw new Error(`Không thể tải ảnh từ Zalo: HTTP ${phanHoiAnh.status}`);
  }

  const loaiNoiDung = phanHoiAnh.headers.get('content-type') || '';
  if (!loaiNoiDung.startsWith('image/')) {
    throw new Error(`Định dạng tệp không phải là hình ảnh hợp lệ (${loaiNoiDung})`);
  }

  const mangBuffer = await phanHoiAnh.arrayBuffer();
  if (mangBuffer.byteLength > DUNG_LUONG_TOI_DA_BYTE) {
    throw new Error(`Kích thước ảnh vượt quá giới hạn cho phép (tối đa 5MB)`);
  }

  // 2. Tạo chữ ký SHA-1 theo quy chuẩn Cloudinary
  const thoiGian = Math.floor(Date.now() / 1000);
  const thuMuc = 'hethong_baohong';
  const chuoiKy = `folder=${thuMuc}&timestamp=${thoiGian}${apiSecret}`;
  const chuKySha1 = crypto.createHash('sha1').update(chuoiKy).digest('hex');

  // 3. Đóng gói dữ liệu multipart/form-data
  const bieuMau = new FormData();
  const tapTinBlob = new Blob([mangBuffer], { type: loaiNoiDung });
  bieuMau.append('file', tapTinBlob, 'anh_su_co.jpg');
  bieuMau.append('api_key', apiKey);
  bieuMau.append('timestamp', String(thoiGian));
  bieuMau.append('folder', thuMuc);
  bieuMau.append('signature', chuKySha1);

  // 4. Gửi yêu cầu POST lên Cloudinary REST API với timeout 15s
  const ketQuaUpload = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: bieuMau,
    signal: AbortSignal.timeout(THOI_GIAN_CHO_UPLOAD_MS)
  });

  const duLieuPhanHoi = await ketQuaUpload.json();
  if (!ketQuaUpload.ok || !duLieuPhanHoi.secure_url) {
    throw new Error(duLieuPhanHoi.error?.message || 'Lỗi không xác định khi upload lên Cloudinary');
  }

  return duLieuPhanHoi.secure_url;
}

module.exports = {
  taiAnhLenCloudinary
};
