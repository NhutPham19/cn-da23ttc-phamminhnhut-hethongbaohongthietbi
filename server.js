// server.js - Máy chủ Express tiếp nhận Webhook Zalo Bot
require('dotenv').config();
const express = require('express');
const { guiTinNhanZalo } = require('./src/services/zaloDichVu');

const app = express();
app.use(express.json());

// Quản lý phiên hội thoại trong RAM (theo chatId)
const phienHoiThoai = new Map();
// Danh sách yêu cầu tạm thời (khi chưa kết nối Supabase)
const danhSachYeuCauTam = new Map();

/**
 * Làm sạch dữ liệu chữ đầu vào
 */
function lamSachDuLieu(chuoi) {
  if (!chuoi) return '';
  return String(chuoi).replace(/<[^>]*>?/gm, '').trim().substring(0, 500);
}

/**
 * Sinh mã yêu cầu tự động: YC + NămThángNgày + 4 số ngẫu nhiên
 */
function taoMaYeuCau() {
  const ngay = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const soNgauNhien = Math.floor(1000 + Math.random() * 9000);
  return `YC${ngay}${soNgauNhien}`;
}

// Trang kiểm tra trạng thái máy chủ
app.get('/', (req, res) => {
  res.send('✅ Máy chủ tiếp nhận Báo hỏng thiết bị đang hoạt động bình thường!');
});

// Cho phép Zalo kiểm tra (probe) qua GET hoặc HEAD khi xác minh Webhook
app.get('/webhook/zalo', (req, res) => {
  res.status(200).send('Webhook Zalo Bot is active!');
});
app.head('/webhook/zalo', (req, res) => {
  res.sendStatus(200);
});

// Middleware xác thực bảo mật Secret Token
function kiemTraSecretToken(req, res, next) {
  const secretTuZalo = req.headers['x-bot-api-secret-token'];
  const secretChuan = process.env.ZALO_SECRET_TOKEN;

  // Nếu là request kiểm tra kết nối từ Zalo không kèm body hoặc header kiểm thử
  if (!secretTuZalo && Object.keys(req.body || {}).length === 0) {
    return res.status(200).send('OK Probe');
  }

  if (secretTuZalo && secretTuZalo !== secretChuan) {
    console.warn('⚠️ Cảnh báo: Có request gọi vào Webhook nhưng không khớp Secret Token!');
    return res.status(403).json({ loi: 'Khong co quyen truy cap' });
  }
  next();
}

// -------------------------------------------------------------
// ĐIỂM TIẾP NHẬN WEBHOOK TỪ ZALO BOT PLATFORM
// -------------------------------------------------------------
app.post('/webhook/zalo', kiemTraSecretToken, async (req, res) => {
  // 1. Luôn trả về 200 ngay lập tức để Zalo biết máy chủ đã nhận bản tin
  res.sendStatus(200);

  try {
    const duLieu = req.body.result || req.body;
    console.log('📩 Nhận bản tin từ Zalo:', JSON.stringify(duLieu, null, 2));

    const tinNhan = duLieu.message;
    if (!tinNhan || !tinNhan.chat) return;

    const chatId = tinNhan.chat.id;
    const vanBan = tinNhan.text ? tinNhan.text.trim() : '';
    const tenSuKien = duLieu.event_name;

    // Lấy link ảnh nếu người dùng gửi ảnh
    let urlAnhTam = null;
    if (tenSuKien === 'message.image.received' || tinNhan.photo) {
      urlAnhTam = tinNhan.photo || (tinNhan.attachments && tinNhan.attachments[0]?.payload?.url);
    }

    const chuoiThuong = vanBan.toLowerCase();

    // 2. Tra cứu tiến độ yêu cầu
    if (chuoiThuong.startsWith('tra cuu') || chuoiThuong.startsWith('tra cứu')) {
      const phanTu = vanBan.split(/\s+/);
      const maCanTra = phanTu[phanTu.length - 1].toUpperCase();

      const yeuCau = danhSachYeuCauTam.get(maCanTra);
      if (!yeuCau) {
        await guiTinNhanZalo(chatId, `❌ Không tìm thấy yêu cầu có mã [${maCanTra}]. Bạn vui lòng kiểm tra lại.`);
      } else {
        await guiTinNhanZalo(
          chatId,
          `📌 THÔNG TIN TIẾN ĐỘ YÊU CẦU\n` +
          `• Mã yêu cầu: ${yeuCau.maYeuCau}\n` +
          `• Thiết bị: ${yeuCau.tenThietBi}\n` +
          `• Phòng: ${yeuCau.phong}\n` +
          `• Trạng thái: ${yeuCau.trangThai}\n` +
          `• Ngày tạo: ${yeuCau.ngayTao}`
        );
      }
      return;
    }

    // 3. Lệnh hủy phiên
    if (chuoiThuong === 'huy' || chuoiThuong === 'hủy') {
      phienHoiThoai.delete(chatId);
      await guiTinNhanZalo(chatId, 'Đã hủy thao tác. Gõ "baohong" bất cứ lúc nào để báo sự cố mới.');
      return;
    }

    // 4. Quản lý các bước hội thoại
    let phien = phienHoiThoai.get(chatId);

    // Bắt đầu báo hỏng mới
    if (!phien) {
      if (chuoiThuong.includes('baohong') || chuoiThuong.includes('báo hỏng') || chuoiThuong.includes('start')) {
        phienHoiThoai.set(chatId, {
          buoc: 1,
          duLieu: {},
          thoiGian: Date.now()
        });
        await guiTinNhanZalo(
          chatId,
          `👋 Chào bạn, hệ thống bắt đầu tiếp nhận báo hỏng thiết bị.\n(Gõ "huy" bất cứ lúc nào để hủy bỏ)\n\n` +
          `👉 Bước 1/4: Tên thiết bị bị hỏng là gì? (Ví dụ: Máy chiếu, Điều hòa, Máy tính...)`
        );
      } else {
        await guiTinNhanZalo(
          chatId,
          `🤖 Chào bạn! Đây là Bot Tiếp nhận Báo hỏng Thiết bị.\n\n` +
          `• Gõ "baohong" để báo sự cố thiết bị.\n` +
          `• Gõ "tra cuu [MÃ]" để kiểm tra tiến độ xử lý.`
        );
      }
      return;
    }

    // Bước 1: Lưu tên thiết bị -> hỏi phòng
    if (phien.buoc === 1) {
      if (!vanBan) {
        await guiTinNhanZalo(chatId, 'Vui lòng nhập tên thiết bị bằng chữ:');
        return;
      }
      phien.duLieu.tenThietBi = lamSachDuLieu(vanBan);
      phien.buoc = 2;
      await guiTinNhanZalo(chatId, `👉 Bước 2/4: Thiết bị ở phòng hoặc khu vực nào? (Ví dụ: Phòng A102, Hội trường B...)`);
      return;
    }

    // Bước 2: Lưu phòng -> hỏi mô tả
    if (phien.buoc === 2) {
      if (!vanBan) {
        await guiTinNhanZalo(chatId, 'Vui lòng nhập tên phòng:');
        return;
      }
      phien.duLieu.phong = lamSachDuLieu(vanBan);
      phien.buoc = 3;
      await guiTinNhanZalo(chatId, `👉 Bước 3/4: Hãy mô tả hiện trạng hư hỏng (Ví dụ: Không lên nguồn, nhấp nháy đèn đỏ...)`);
      return;
    }

    // Bước 3: Lưu mô tả -> hỏi ảnh
    if (phien.buoc === 3) {
      if (!vanBan) {
        await guiTinNhanZalo(chatId, 'Vui lòng nhập mô tả sự cố:');
        return;
      }
      phien.duLieu.moTa = lamSachDuLieu(vanBan);
      phien.buoc = 4;
      await guiTinNhanZalo(chatId, `👉 Bước 4/4: Bạn hãy gửi 1 hình ảnh chụp hiện trạng sự cố (hoặc gõ "bo qua" nếu không có ảnh):`);
      return;
    }

    // Bước 4: Nhận ảnh (hoặc bỏ qua) -> Hoàn tất yêu cầu
    if (phien.buoc === 4) {
      let hinhAnh = null;
      if (urlAnhTam) {
        hinhAnh = urlAnhTam; // Sau này sẽ tải và đẩy lên Cloudinary
      } else if (chuoiThuong !== 'bo qua' && chuoiThuong !== 'bỏ qua') {
        await guiTinNhanZalo(chatId, 'Vui lòng gửi 1 hình ảnh hoặc gõ "bo qua" để hoàn tất:');
        return;
      }

      const maYeuCau = taoMaYeuCau();
      const banGhiMoi = {
        maYeuCau: maYeuCau,
        tenThietBi: phien.duLieu.tenThietBi,
        phong: phien.duLieu.phong,
        moTa: phien.duLieu.moTa,
        hinhAnhUrl: hinhAnh,
        trangThai: 'Chờ xử lý',
        chatId: chatId,
        ngayTao: new Date().toLocaleString('vi-VN')
      };

      // Lưu tạm vào bộ nhớ
      danhSachYeuCauTam.set(maYeuCau, banGhiMoi);
      phienHoiThoai.delete(chatId);

      await guiTinNhanZalo(
        chatId,
        `✅ ĐÃ TIẾP NHẬN YÊU CẦU THÀNH CÔNG!\n\n` +
        `• Mã yêu cầu: ${maYeuCau}\n` +
        `• Thiết bị: ${banGhiMoi.tenThietBi}\n` +
        `• Phòng: ${banGhiMoi.phong}\n` +
        `• Trạng thái: Chờ xử lý\n\n` +
        `Kỹ thuật viên sẽ tiếp nhận sớm nhất. Bạn có thể gõ "tra cuu ${maYeuCau}" để xem tiến độ bất kỳ lúc nào.`
      );
    }
  } catch (loi) {
    console.error('❌ Lỗi xử lý webhook:', loi);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 Endpoint Webhook: http://localhost:${PORT}/webhook/zalo`);
  console.log(`=================================================`);
});
