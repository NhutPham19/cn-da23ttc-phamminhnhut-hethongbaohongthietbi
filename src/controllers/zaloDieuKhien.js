// src/controllers/zaloDieuKhien.js - Bộ điều khiển tiếp nhận Webhook Zalo Bot & State Machine 4 bước
const prisma = require('../config/coSoDuLieu');
const zaloDichVu = require('../services/zaloDichVu');
const { taiAnhLenCloudinary } = require('../services/cloudinaryDichVu');
const {
  lamSachDuLieu,
  boDau,
  taoMaYeuCau,
  dinhDangTrangThai,
  chuanHoaLenhZalo,
  nhanDienDanhMucThietBi,
  chuanHoaTenPhong,
  tuDongGanMucDoUuTien,
  phanLoaiVaiTroQuaEmail
} = require('../utils/tienIch');
const {
  sinhMaOtp,
  kiemTraGioiHanGuiOtp,
  taoVaLuuOtp,
  xacThucMaOtp
} = require('../services/otpDichVu');
const { guiEmailOtp } = require('../services/emailDichVu');

function guiTinNhanZalo(chatId, text) {
  return zaloDichVu.guiTinNhanZalo(chatId, text);
}

/**
 * Gửi tuần tự 2 tin nhắn Onboarding chào mừng & hướng dẫn khi người dùng mở phiên chat Zalo
 * @param {string} chatId
 * @param {boolean} daXacThuc
 */
async function guiOnboardingTinNhan(chatId, daXacThuc) {
  await guiTinNhanZalo(
    chatId,
    `👋 Xin chào! Tôi là Trợ lý Zalo Bot tiếp nhận báo hỏng thiết bị phòng học của Trường Đại học Trà Vinh (TVU).\nHệ thống giúp Giảng viên và Sinh viên báo sự cố thiết bị nhanh chóng ngay tại giảng đường để Đội Kỹ thuật kịp thời xử lý.`
  );

  if (!daXacThuc) {
    await guiTinNhanZalo(
      chatId,
      `⚡ CÁCH DÙNG BOT SIÊU ĐƠN GIẢN (Chỉ 30 giây):\n` +
      `• Bước 1: Chọn loại thiết bị hỏng (gõ số 1 -> 6)\n` +
      `• Bước 2: Nhập tên phòng học (VD: D71.103)\n` +
      `• Bước 3: Mô tả ngắn tình trạng lỗi\n` +
      `• Bước 4: Gửi 1 tấm ảnh thiết bị\n\n` +
      `🔐 XÁC THỰC LẦN ĐẦU (Chỉ làm 1 lần duy nhất):\n` +
      `Để bắt đầu, bạn hãy nhập địa chỉ Email trường cấp (VD: mssv@st.tvu.edu.vn hoặc ten@tvu.edu.vn) ngay bên dưới để nhận mã OTP xác nhận nhé!`
    );
  } else {
    await guiTinNhanZalo(
      chatId,
      `⚡ CÁCH BÁO HỎNG NHANH (4 bước - 30 giây):\n` +
      `1️⃣ Gõ "baohong" để bắt đầu\n` +
      `2️⃣ Chọn thiết bị -> Nhập phòng -> Mô tả lỗi -> Gửi ảnh\n\n` +
      `📌 Các lệnh tiện ích khác:\n` +
      `• tracuu [Mã YC]: Xem tiến độ sửa chữa\n` +
      `• huyyeucau [Mã YC] [Lý do]: Hủy báo nhầm\n` +
      `• id: Xem mã định danh Zalo của bạn`
    );
  }
}

const THOI_GIAN_HET_HAN_PHIEN_MS = 10 * 60 * 1000; // 10 phút
const THOI_GIAN_CHONG_SPAM_MS = 10 * 60 * 1000;   // 10 phút giữa 2 lần tạo yêu cầu
const SO_LAN_THU_LAI_MA = 5;                      // số lần thử lại khi trùng mã yêu cầu
const dangXuLyBuoc4 = new Set();                  // Khóa In-Flight chống Race Condition bước 4

/**
 * Tự động chuẩn hóa và khớp/upsert mã phòng vào bảng phong
 * @param {string} vanBanPhong 
 * @param {object} dbClient - Instance prisma hoặc transaction
 * @returns {Promise<{ ma_phong: number|null, ten_phong: string }>}
 */
async function chuanHoaVaKhopPhong(vanBanPhong, dbClient = prisma) {
  const tenPhongChuan = chuanHoaTenPhong(vanBanPhong);

  try {
    // 1. Tìm kiếm trong bảng phong (khớp chính xác hoặc loại trừ tiền tố 'Phòng ')
    const danhSachPhong = await dbClient.phong.findMany();
    const tenChuanKhongDau = boDau(tenPhongChuan).toLowerCase();
    const tenChuanCotLoi = tenChuanKhongDau.replace(/^phong\s+/i, '').trim();

    const phongKhop = danhSachPhong.find((p) => {
      const tenPKd = boDau(p.ten_phong).toLowerCase();
      const tenPCotLoi = tenPKd.replace(/^phong\s+/i, '').trim();
      return tenPKd === tenChuanKhongDau || tenPCotLoi === tenChuanCotLoi;
    });

    if (phongKhop) {
      return {
        ma_phong: phongKhop.ma_phong,
        ten_phong: phongKhop.ten_phong
      };
    }

    // 2. Nếu là định dạng phòng chuẩn (Phòng D71..., Phòng B3..., Phòng Lab..., Hội trường...) mà chưa có trong DB -> Tự động Upsert
    const laPhongChuan = /^(Phòng|Hội trường)\s+[A-Za-z0-9.]+/i.test(tenPhongChuan);
    if (laPhongChuan) {
      try {
        const phongMoi = await dbClient.phong.create({
          data: { ten_phong: tenPhongChuan }
        });
        return {
          ma_phong: phongMoi.ma_phong,
          ten_phong: phongMoi.ten_phong
        };
      } catch (loiTao) {
        // Nếu trùng do race condition
        const phongVuaTao = await dbClient.phong.findFirst({
          where: { ten_phong: tenPhongChuan }
        });
        if (phongVuaTao) {
          return {
            ma_phong: phongVuaTao.ma_phong,
            ten_phong: phongVuaTao.ten_phong
          };
        }
      }
    }

    return {
      ma_phong: null,
      ten_phong: tenPhongChuan
    };
  } catch (loi) {
    console.warn('⚠️ Lỗi khớp phòng trong DB, fallback chuỗi chuẩn:', loi.message);
    return {
      ma_phong: null,
      ten_phong: tenPhongChuan
    };
  }
}

async function kiemTraChongSpam(maNguoiBaoZalo) {
  try {
    const yeuCauGanNhat = await prisma.yeu_cau_bao_hong.findFirst({
      where: { ma_nguoi_bao_zalo: maNguoiBaoZalo },
      orderBy: { thoi_gian_tao: 'desc' }
    });

    if (!yeuCauGanNhat) return { biSpam: false };

    const thoiGianTroiQua = Date.now() - new Date(yeuCauGanNhat.thoi_gian_tao).getTime();
    if (thoiGianTroiQua < THOI_GIAN_CHONG_SPAM_MS) {
      const soPhutConLai = Math.ceil((THOI_GIAN_CHONG_SPAM_MS - thoiGianTroiQua) / 60000);
      return {
        biSpam: true,
        maYeuCau: yeuCauGanNhat.ma_yeu_cau,
        soPhutConLai
      };
    }

    return { biSpam: false };
  } catch (loi) {
    console.error('⚠️ Lỗi kiểm tra chống spam:', loi.message);
    return { biSpam: false };
  }
}

async function layPhienHienTai(maNguoiBaoZalo) {
  const phien = await prisma.phien_hoi_thoai_zalo.findUnique({
    where: { ma_nguoi_bao_zalo: maNguoiBaoZalo }
  });

  if (!phien) return null;

  const thoiGianTroiQua = Date.now() - new Date(phien.thoi_gian_cap_nhat).getTime();
  if (thoiGianTroiQua > THOI_GIAN_HET_HAN_PHIEN_MS) {
    // deleteMany không ném lỗi nếu phiên đã bị xóa bởi luồng khác
    await prisma.phien_hoi_thoai_zalo.deleteMany({
      where: { ma_nguoi_bao_zalo: maNguoiBaoZalo }
    });
    return null;
  }

  return phien;
}

async function khoiTaoPhienMoi(maNguoiBaoZalo) {
  return await prisma.phien_hoi_thoai_zalo.upsert({
    where: { ma_nguoi_bao_zalo: maNguoiBaoZalo },
    update: {
      buoc_hien_tai: 1,
      du_lieu_tam: {},
      thoi_gian_cap_nhat: new Date()
    },
    create: {
      ma_nguoi_bao_zalo: maNguoiBaoZalo,
      buoc_hien_tai: 1,
      du_lieu_tam: {}
    }
  });
}

async function capNhatPhien(maNguoiBaoZalo, buocMoi, duLieuMoi) {
  return await prisma.phien_hoi_thoai_zalo.update({
    where: { ma_nguoi_bao_zalo: maNguoiBaoZalo },
    data: {
      buoc_hien_tai: buocMoi,
      du_lieu_tam: duLieuMoi,
      thoi_gian_cap_nhat: new Date()
    }
  });
}

async function xoaPhien(maNguoiBaoZalo) {
  await prisma.phien_hoi_thoai_zalo.deleteMany({
    where: { ma_nguoi_bao_zalo: maNguoiBaoZalo }
  });
}

/**
 * Tạo yêu cầu từ phiên hội thoại đang ở bước 4.
 * - "Giành phiên": chỉ MỘT luồng xóa được phiên bước 4 → tin nhắn trùng không tạo thêm yêu cầu.
 *   Trả null nếu phiên đã bị luồng khác lấy.
 * - Nếu trùng mã yêu cầu (P2002) thì sinh mã mới và thử lại (giao dịch đã hoàn tác nên phiên còn nguyên).
 */
async function taoYeuCauTuPhien(chatId, duLieuTam, hinhAnh, nguoiDungHienTai = null) {
  for (let lan = 1; lan <= SO_LAN_THU_LAI_MA; lan++) {
    const maYeuCau = taoMaYeuCau();
    try {
      return await prisma.$transaction(async (tx) => {
        const daXoa = await tx.phien_hoi_thoai_zalo.deleteMany({
          where: { ma_nguoi_bao_zalo: chatId, buoc_hien_tai: 4 }
        });
        if (daXoa.count === 0) return null;

        const tenNguoiBao = nguoiDungHienTai
          ? `[${nguoiDungHienTai.vai_tro === 'GIANG_VIEN' ? 'GV' : (nguoiDungHienTai.vai_tro === 'SINH_VIEN' ? 'SV' : nguoiDungHienTai.vai_tro)}: ${nguoiDungHienTai.email || nguoiDungHienTai.tai_khoan}]`
          : `Zalo Bot (${chatId})`;

        return tx.yeu_cau_bao_hong.create({
          data: {
            ma_yeu_cau: maYeuCau,
            ten_thiet_bi: duLieuTam.tenThietBi,
            vi_tri_phong: duLieuTam.phong,
            mo_ta_loi: duLieuTam.moTa,
            duong_dan_anh: hinhAnh,
            trang_thai: 'CHO_XU_LY',
            muc_do_uu_tien: duLieuTam.mucDoUuTien || 'BINH_THUONG',
            ma_danh_muc: duLieuTam.maDanhMuc || null,
            ma_phong: duLieuTam.maPhong || null,
            ma_nguoi_bao_zalo: chatId,
            lich_su_xu_ly: {
              create: {
                trang_thai: 'CHO_XU_LY',
                nguoi_thuc_hien: `Người báo: ${tenNguoiBao}`,
                ghi_chu: `Tiếp nhận yêu cầu báo hỏng tự động qua Zalo Bot từ ${tenNguoiBao}`
              }
            }
          }
        });
      });
    } catch (loi) {
      if (loi.code === 'P2002' && lan < SO_LAN_THU_LAI_MA) continue; // trùng mã → thử mã mới
      throw loi;
    }
  }
}

async function tiepNhanWebhookZalo(req, res) {
  res.sendStatus(200);

  let chatId = null; // khai báo ngoài try để khối catch còn dùng được

  try {
    const duLieu = req.body?.result || req.body || {};
    const suKien = duLieu?.event_name || duLieu?.event || req.body?.event_name || req.body?.event || '';

    // Production: chỉ ghi tên sự kiện (tránh lưu nội dung tin nhắn, mã người dùng vào nhật ký máy chủ)
    if (process.env.NODE_ENV === 'production') {
      console.log('📩 Webhook Zalo:', suKien || 'khong-ro-su-kien');
    } else {
      console.log('📩 Nhận bản tin Zalo Webhook:', JSON.stringify(duLieu, null, 2));
    }

    // Trích xuất chatId đa nguồn (Fallback Extraction)
    chatId = String(
      duLieu?.message?.chat?.id ||
      duLieu?.follower?.id ||
      duLieu?.sender?.id ||
      duLieu?.user?.id ||
      duLieu?.chat?.id ||
      duLieu?.user_id_by_app ||
      req.body?.follower?.id ||
      req.body?.sender?.id ||
      req.body?.user?.id ||
      req.body?.chat?.id ||
      req.body?.user_id_by_app ||
      req.body?.message?.chat?.id ||
      ''
    ).trim();

    if (!chatId) return;

    // Nhận diện sự kiện người dùng ấn "Quan tâm" (Follow)
    const tenSuKienNho = String(suKien).toLowerCase();
    const laSuKienQuanTam =
      ['follow', 'user_follow', 'bot_follow', 'oa_follow', 'user_received_welcome'].includes(tenSuKienNho) ||
      Boolean(duLieu?.follower?.id || req.body?.follower?.id);

    // Kiểm tra định danh người dùng Zalo trong bảng nguoi_dung
    let nguoiDungHienTai = null;
    try {
      nguoiDungHienTai = await prisma.nguoi_dung.findFirst({
        where: { chat_id_zalo: chatId }
      });
    } catch (e) {
      console.warn('⚠️ Lỗi kiểm tra người dùng Zalo:', e.message);
    }

    // XỬ LÝ SỰ KIỆN QUAN TÂM (FOLLOW) TỰ ĐỘNG NGAY KHI NGƯỜI DÙNG ẤN NÚT
    if (laSuKienQuanTam) {
      if (!nguoiDungHienTai) {
        // Trường hợp 1: Người dùng MỚI (chưa xác thực Email trường) -> Gửi ngay 2 tin nhắn Onboarding
        await guiOnboardingTinNhan(chatId, false);
        await prisma.phien_hoi_thoai_zalo.upsert({
          where: { ma_nguoi_bao_zalo: chatId },
          update: {
            buoc_hien_tai: -1,
            du_lieu_tam: { trang_thai_xac_thuc: 'CHO_NHAP_EMAIL', da_gui_chao_mung: true },
            thoi_gian_cap_nhat: new Date()
          },
          create: {
            ma_nguoi_bao_zalo: chatId,
            buoc_hien_tai: -1,
            du_lieu_tam: { trang_thai_xac_thuc: 'CHO_NHAP_EMAIL', da_gui_chao_mung: true }
          }
        });
        return;
      }

      // Trường hợp 2: Người dùng CŨ (đã có hồ sơ trong bảng nguoi_dung)
      if (!nguoiDungHienTai.trang_thai_hoat_dong) {
        await guiTinNhanZalo(
          chatId,
          `⛔ Tài khoản báo hỏng của bạn đã bị tạm khóa do vi phạm quy định báo hỏng của nhà trường. Vui lòng liên hệ bộ phận Quản trị thiết bị để được hỗ trợ.`
        );
        return;
      }

      await guiTinNhanZalo(
        chatId,
        '👋 Chào mừng bạn quay trở lại với Bot Tiếp nhận Báo hỏng Thiết bị TVU!\n\n' +
        '• Gõ "baohong" để báo sự cố phòng học mới.\n' +
        '• Gõ "tracuu [Mã]" để kiểm tra tiến độ xử lý.\n' +
        '• Gõ "trogiup" để xem lại hướng dẫn sử dụng.'
      );
      return;
    }

    const tinNhan = duLieu.message || req.body?.message;
    const vanBan = (tinNhan?.text || duLieu.text || req.body?.text || '').trim();
    const tenSuKien = suKien;

    let urlAnhTam = null;
    if (tenSuKien === 'message.image.received' || tinNhan?.photo || duLieu.photo) {
      urlAnhTam = tinNhan?.photo || duLieu.photo || (tinNhan?.attachments && tinNhan.attachments[0]?.payload?.url);
    }

    if (!vanBan && !urlAnhTam) return;

    const chuoiKhongDau = boDau(vanBan);
    const { lenh, doiSo } = chuanHoaLenhZalo(vanBan);

    // Nếu tài khoản bị khóa -> Chặn ngay lập tức
    if (nguoiDungHienTai && !nguoiDungHienTai.trang_thai_hoat_dong) {
      await guiTinNhanZalo(
        chatId,
        `⛔ Tài khoản báo hỏng của bạn đã bị tạm khóa do vi phạm quy định báo hỏng của nhà trường. Vui lòng liên hệ bộ phận Quản trị thiết bị để được hỗ trợ.`
      );
      return;
    }

    // =========================================================================
    // 1. CÁC LỆNH TOÀN CỤC (ƯU TIÊN KIỂM TRA TRƯỚC STATE MACHINE)
    // =========================================================================

    // 1.1. Lệnh id: Lấy mã Chat Zalo của người dùng
    if (lenh === 'id') {
      await guiTinNhanZalo(
        chatId,
        `🆔 Mã Chat Zalo của bạn: ${chatId}\n\n` +
        `Bạn có thể sao chép mã này gửi cho Quản trị viên để gắn vào hồ sơ Kỹ thuật viên trên Web Dashboard.`
      );
      return;
    }

    // 1.2. Lệnh trogiup: Bảng hướng dẫn sử dụng nhanh bộ lệnh chuẩn / Onboarding
    if (lenh === 'trogiup') {
      await guiOnboardingTinNhan(chatId, Boolean(nguoiDungHienTai));
      return;
    }

    // 1.3. Lệnh tracuu: Tra cứu tiến độ yêu cầu
    if (lenh === 'tracuu') {
      const phanTu = doiSo.split(/\s+/).filter(Boolean);
      const maNhap = phanTu[0] || '';
      const maCanTra = maNhap.toUpperCase().replace(/^#/, '');

      if (!/^YC\d{1,17}$/.test(maCanTra)) {
        await guiTinNhanZalo(chatId, '❌ Mã yêu cầu chưa đúng định dạng. Cú pháp chuẩn:\ntracuu #YCyyyymmddxxxx\nVí dụ: tracuu #YC202610281234');
        return;
      }

      // KTV/Admin đã đăng ký chat Zalo được xem mọi yêu cầu; người báo hỏng chỉ xem yêu cầu của chính mình
      const laNhanVien = await prisma.nguoi_dung.findFirst({
        where: { chat_id_zalo: chatId, trang_thai_hoat_dong: true },
        select: { ma_nguoi_dung: true }
      });

      const dieuKienTim = {
        OR: [
          { ma_yeu_cau: `#${maCanTra}` },
          { ma_yeu_cau: maCanTra }
        ]
      };
      if (!laNhanVien) dieuKienTim.ma_nguoi_bao_zalo = chatId;

      const yeuCau = await prisma.yeu_cau_bao_hong.findFirst({
        where: dieuKienTim,
        include: { ky_thuat_vien: true }
      });

      if (!yeuCau) {
        await guiTinNhanZalo(chatId, `❌ Không tìm thấy yêu cầu có mã [#${maCanTra}] của bạn. Bạn vui lòng kiểm tra lại mã chính xác.`);
      } else {
        let tenPhuTrach = yeuCau.ky_thuat_vien ? yeuCau.ky_thuat_vien.ho_ten : 'Đang phân công';
        if (/admin|quản trị/i.test(tenPhuTrach)) {
          tenPhuTrach = 'Quản trị';
        } else if (tenPhuTrach !== 'Đang phân công') {
          tenPhuTrach = tenPhuTrach.replace(/\s*\([^)]*\)/g, '').trim();
        }
        const ghiChu = yeuCau.ghi_chu_ket_qua ? `\n• Ghi chú: ${yeuCau.ghi_chu_ket_qua}` : '';
        const ngayTao = new Date(yeuCau.thoi_gian_tao).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

        await guiTinNhanZalo(
          chatId,
          `📌 THÔNG TIN TIẾN ĐỘ YÊU CẦU\n` +
          `• Mã yêu cầu: ${yeuCau.ma_yeu_cau}\n` +
          `• Thiết bị: ${yeuCau.ten_thiet_bi}\n` +
          `• Vị trí: ${yeuCau.vi_tri_phong}\n` +
          `• Trạng thái: ${dinhDangTrangThai(yeuCau.trang_thai)}\n` +
          `• Người phụ trách: ${tenPhuTrach}\n` +
          `• Ngày tạo: ${ngayTao}${ghiChu}`
        );
      }
      return;
    }

    // 1.4. Lệnh huyyeucau: Hủy phiên nhập dở hoặc Hủy yêu cầu đã gửi
    if (lenh === 'huyyeucau') {
      // Kịch bản A: Có mã yêu cầu (VD: huyyeucau #YC202611021234 Nhầm phòng)
      if (doiSo) {
        const phanTu = doiSo.split(/\s+/).filter(Boolean);
        const maNhap = phanTu[0] || '';
        const maChuan = maNhap.startsWith('#') ? maNhap.toUpperCase() : `#${maNhap.toUpperCase()}`;
        const lyDoHuyTho = phanTu.slice(1).join(' ').trim();
        const lyDoHuy = lamSachDuLieu(lyDoHuyTho) || 'Người báo chủ động hủy yêu cầu qua Zalo';

        if (!/^#YC\d{1,17}$/.test(maChuan)) {
          await guiTinNhanZalo(
            chatId,
            `❌ Mã yêu cầu chưa đúng định dạng. Cú pháp chuẩn:\nhuyyeucau #YCyyyymmddxxxx [Lý do]\nVí dụ: huyyeucau #YC202611021234 Nhầm phòng`
          );
          return;
        }

        const yeuCau = await prisma.yeu_cau_bao_hong.findFirst({
          where: { ma_yeu_cau: maChuan }
        });

        if (!yeuCau || yeuCau.ma_nguoi_bao_zalo !== chatId) {
          await guiTinNhanZalo(chatId, `❌ Không tìm thấy yêu cầu hoặc bạn không phải là người đã tạo yêu cầu [${maChuan}].`);
          return;
        }

        if (yeuCau.trang_thai !== 'CHO_XU_LY') {
          await guiTinNhanZalo(
            chatId,
            `⚠️ Yêu cầu [${yeuCau.ma_yeu_cau}] hiện đang ở trạng thái "${dinhDangTrangThai(yeuCau.trang_thai)}" nên không thể tự hủy. Vui lòng liên hệ Kỹ thuật viên nếu cần hỗ trợ.`
          );
          return;
        }

        // Thực thi Atomic Transaction với Khóa Lạc Quan
        try {
          await prisma.$transaction(async (tx) => {
            const ketQuaCapNhat = await tx.yeu_cau_bao_hong.updateMany({
              where: {
                ma_yeu_cau_bao_hong: yeuCau.ma_yeu_cau_bao_hong,
                ma_nguoi_bao_zalo: chatId,
                trang_thai: 'CHO_XU_LY'
              },
              data: {
                trang_thai: 'HUY',
                thoi_gian_hoan_thanh: new Date(),
                ghi_chu_ket_qua: lyDoHuy
              }
            });

            if (ketQuaCapNhat.count === 0) {
              throw new Error('XUNG_DOT_TRANG_THAI');
            }

            await tx.lich_su_xu_ly.create({
              data: {
                ma_yeu_cau_bao_hong: yeuCau.ma_yeu_cau_bao_hong,
                trang_thai: 'HUY',
                nguoi_thuc_hien: `Người báo Zalo (${chatId})`,
                ghi_chu: `Hủy bởi người báo qua lệnh huyyeucau: ${lyDoHuy}`
              }
            });
          });

          await guiTinNhanZalo(
            chatId,
            `✅ Đã hủy thành công yêu cầu [${yeuCau.ma_yeu_cau}].\n• Lý do hủy: ${lyDoHuy}`
          );
        } catch (loiTx) {
          if (loiTx.message === 'XUNG_DOT_TRANG_THAI') {
            await guiTinNhanZalo(
              chatId,
              `⚠️ Yêu cầu [${yeuCau.ma_yeu_cau}] vừa được Kỹ thuật viên tiếp nhận xử lý hoặc đã thay đổi, không thể tự hủy.`
            );
          } else {
            throw loiTx;
          }
        }
        return;
      }

      // Kịch bản B: Không có mã (Chỉ gõ "huyyeucau" hoặc "huy")
      const phienHienTai = await layPhienHienTai(chatId);
      if (phienHienTai) {
        if (dangXuLyBuoc4.has(chatId)) {
          await guiTinNhanZalo(chatId, '⏳ Hệ thống đang xử lý yêu cầu trước đó của bạn, vui lòng chờ giây lát...');
          return;
        }
        await xoaPhien(chatId);
        await guiTinNhanZalo(chatId, '✅ Đã hủy phiên nhập báo hỏng hiện tại. Khi cần báo sự cố mới, bạn vui lòng gõ "baohong".');
      } else {
        await guiTinNhanZalo(
          chatId,
          `💡 Cú pháp hủy yêu cầu đã gửi:\nhuyyeucau [MÃ_YÊU_CẦU] [Lý do]\n` +
          `Ví dụ: huyyeucau #YC202611021234 Nhầm phòng\n` +
          `(Lưu ý: Chỉ hủy được yêu cầu đang ở trạng thái Chờ xử lý)`
        );
      }
      return;
    }

    // =========================================================================
    // 2. QUẢN LÝ PHIÊN HỘI THOẠI 4 BƯỚC (STATE MACHINE)
    // =========================================================================
    let phien = await layPhienHienTai(chatId);

    if (!phien) {
      // Nếu chưa xác thực danh tính qua email trường TVU
      if (!nguoiDungHienTai) {
        // Kiểm tra xem người dùng có gõ thẳng email không
        const ktEmailTruoc = phanLoaiVaiTroQuaEmail(vanBan);
        if (ktEmailTruoc.hopLe) {
          const ktSpamOtp = kiemTraGioiHanGuiOtp(ktEmailTruoc.email);
          if (ktSpamOtp.biChan) {
            await guiTinNhanZalo(
              chatId,
              `⏳ Bạn vừa yêu cầu gửi OTP. Vui lòng thử lại sau ${ktSpamOtp.soGiayConLai} giây.`
            );
            return;
          }
          const maOtp = taoVaLuuOtp(ktEmailTruoc.email, 6);
          const tenNguoiNhan = ktEmailTruoc.vaiTro === 'GIANG_VIEN'
            ? `Thầy/Cô (${ktEmailTruoc.tienTo})`
            : `Sinh viên (${ktEmailTruoc.tienTo})`;
          const kqGuiEmail = await guiEmailOtp(ktEmailTruoc.email, tenNguoiNhan, maOtp);

          await prisma.phien_hoi_thoai_zalo.upsert({
            where: { ma_nguoi_bao_zalo: chatId },
            update: {
              buoc_hien_tai: -2,
              du_lieu_tam: {
                emailChoXacThuc: ktEmailTruoc.email,
                vaiTroXacThuc: ktEmailTruoc.vaiTro,
                tienToEmail: ktEmailTruoc.tienTo
              },
              thoi_gian_cap_nhat: new Date()
            },
            create: {
              ma_nguoi_bao_zalo: chatId,
              buoc_hien_tai: -2,
              du_lieu_tam: {
                emailChoXacThuc: ktEmailTruoc.email,
                vaiTroXacThuc: ktEmailTruoc.vaiTro,
                tienToEmail: ktEmailTruoc.tienTo
              }
            }
          });

          let thongBao =
            `📧 Hệ thống đã gửi mã OTP 6 chữ số đến email:\n👉 ${ktEmailTruoc.email}\n\n` +
            `Vui lòng kiểm tra Hộp thư đến (hoặc Thư rác/Spam) và nhập mã 6 số vào đây để xác nhận (Mã có hiệu lực trong 5 phút).\n\n` +
            `(💡 Gõ "doi email" nếu nhập nhầm địa chỉ email)`;
          if (kqGuiEmail.fallback) {
            thongBao += `\n\n🔑 Mã OTP thử nghiệm (Fallback Mode): ${maOtp}`;
          }
          await guiTinNhanZalo(chatId, thongBao);
          return;
        }

        // Người dùng nhắn tin khởi đầu / quét QR lần đầu: Gửi tuần tự 2 tin nhắn Onboarding
        await guiOnboardingTinNhan(chatId, false);
        await prisma.phien_hoi_thoai_zalo.upsert({
          where: { ma_nguoi_bao_zalo: chatId },
          update: {
            buoc_hien_tai: -1,
            du_lieu_tam: { trang_thai_xac_thuc: 'CHO_NHAP_EMAIL', da_gui_chao_mung: true },
            thoi_gian_cap_nhat: new Date()
          },
          create: {
            ma_nguoi_bao_zalo: chatId,
            buoc_hien_tai: -1,
            du_lieu_tam: { trang_thai_xac_thuc: 'CHO_NHAP_EMAIL', da_gui_chao_mung: true }
          }
        });
        return;
      }

      // Đã xác thực danh tính
      if (lenh === 'baohong') {
        const ketQuaSpam = await kiemTraChongSpam(chatId);
        if (ketQuaSpam.biSpam) {
          await guiTinNhanZalo(
            chatId,
            `⚠️ Bạn vừa tạo yêu cầu [${ketQuaSpam.maYeuCau}] cách đây ít phút.\n` +
            `Vui lòng chờ Kỹ thuật tiếp nhận xử lý hoặc gõ "tracuu ${ketQuaSpam.maYeuCau}" để xem tiến độ (thử lại sau ${ketQuaSpam.soPhutConLai} phút).`
          );
          return;
        }

        await khoiTaoPhienMoi(chatId);
        await guiTinNhanZalo(
          chatId,
          `BƯỚC 1/4 - CHỌN THIẾT BỊ BÁO HỎNG:\n` +
          `Hãy chọn (từ 1 đến 6) tương ứng với loại thiết bị\n` +
          `1. Máy chiếu\n` +
          `2. Máy tính / Màn hình\n` +
          `3. Máy lạnh\n` +
          `4. Âm thanh (Micro, Loa)\n` +
          `5. Hệ thống Điện / Đèn / Quạt\n` +
          `6. Thiết bị Mạng (Wifi, Switch) / Khác\n` +
          `(💡 Gõ huyyeucau nếu muốn thoát)`
        );
      } else {
        await guiOnboardingTinNhan(chatId, true);
      }
      return;
    }

    const duLieuTam = phien.du_lieu_tam || {};

    // -------------------------------------------------------------------------
    // BƯỚC -1: CHỜ NHẬP EMAIL TRƯỜNG ĐỂ XÁC THỰC DANH TÍNH
    // -------------------------------------------------------------------------
    if (phien.buoc_hien_tai === -1) {
      if (!vanBan) {
        await guiTinNhanZalo(
          chatId,
          '⚠️ Để bắt đầu sử dụng, bạn vui lòng nhập địa chỉ Email trường cấp (VD: mssv@st.tvu.edu.vn hoặc ten@tvu.edu.vn) để nhận mã OTP xác thực lần đầu nhé!'
        );
        return;
      }

      const kqEmail = phanLoaiVaiTroQuaEmail(vanBan);
      if (!kqEmail.hopLe) {
        // Chống gửi lặp 2 tin nhắn chào mừng: Nếu đã gửi chào mừng trước đó hoặc người dùng gõ câu khởi đầu như "Xin chào", "baohong"
        if (phien.du_lieu_tam?.da_gui_chao_mung || ['baohong', 'xin chao', 'chao', 'hi', 'hello', 'batdau', 'start'].includes(chuoiKhongDau)) {
          await guiTinNhanZalo(
            chatId,
            '⚠️ Để bắt đầu sử dụng, bạn vui lòng nhập địa chỉ Email trường cấp (VD: mssv@st.tvu.edu.vn hoặc ten@tvu.edu.vn) để nhận mã OTP xác thực lần đầu nhé!'
          );
        } else {
          await guiTinNhanZalo(
            chatId,
            `❌ ${kqEmail.lyDoLoi || 'Email không hợp lệ.'}\n\n` +
            `Vui lòng nhập chính xác địa chỉ Email trường ĐH Trà Vinh cấp:\n` +
            `• Sinh viên: mssv@st.tvu.edu.vn (VD: 110123252@st.tvu.edu.vn)\n` +
            `• Giảng viên: ten@tvu.edu.vn (VD: quocnk@tvu.edu.vn)\n` +
            `(💡 Gõ "huyyeucau" nếu muốn thoát)`
          );
        }
        return;
      }

      const ktSpamOtp = kiemTraGioiHanGuiOtp(kqEmail.email);
      if (ktSpamOtp.biChan) {
        await guiTinNhanZalo(
          chatId,
          `⏳ Bạn vừa yêu cầu gửi OTP. Vui lòng thử lại sau ${ktSpamOtp.soGiayConLai} giây.`
        );
        return;
      }

      const maOtp = taoVaLuuOtp(kqEmail.email, 6);
      const tenNguoiNhan = kqEmail.vaiTro === 'GIANG_VIEN'
        ? `Thầy/Cô (${kqEmail.tienTo})`
        : `Sinh viên (${kqEmail.tienTo})`;
      const ketQuaGuiEmail = await guiEmailOtp(kqEmail.email, tenNguoiNhan, maOtp);

      duLieuTam.emailChoXacThuc = kqEmail.email;
      duLieuTam.vaiTroXacThuc = kqEmail.vaiTro;
      duLieuTam.tienToEmail = kqEmail.tienTo;
      await capNhatPhien(chatId, -2, duLieuTam);

      let thongBao =
        `📧 Hệ thống đã gửi mã OTP 6 chữ số đến email:\n👉 ${kqEmail.email}\n\n` +
        `Vui lòng kiểm tra Hộp thư đến (hoặc Thư rác/Spam) và nhập mã 6 số vào đây để xác nhận (Mã có hiệu lực trong 5 phút).\n\n` +
        `(💡 Gõ "doi email" nếu nhập nhầm địa chỉ email)`;
      if (ketQuaGuiEmail.fallback) {
        thongBao += `\n\n🔑 Mã OTP thử nghiệm (Fallback Mode): ${maOtp}`;
      }
      await guiTinNhanZalo(chatId, thongBao);
      return;
    }

    // -------------------------------------------------------------------------
    // BƯỚC -2: CHỜ NHẬP MÃ OTP 6 CHỮ SỐ
    // -------------------------------------------------------------------------
    if (phien.buoc_hien_tai === -2) {
      if (chuoiKhongDau === 'doi email' || chuoiKhongDau === 'doi' || chuoiKhongDau === 'sua email') {
        await capNhatPhien(chatId, -1, {});
        await guiTinNhanZalo(chatId, '📝 Vui lòng nhập lại địa chỉ Email trường cấp của bạn:');
        return;
      }

      const maOtpNhap = (vanBan || '').replace(/\s+/g, '');
      if (!/^\d{6}$/.test(maOtpNhap)) {
        await guiTinNhanZalo(
          chatId,
          '❌ Mã OTP phải là dãy 6 chữ số (VD: 123456).\nVui lòng kiểm tra lại email hoặc gõ "doi email" để đổi địa chỉ khác:'
        );
        return;
      }

      const emailDangCho = duLieuTam.emailChoXacThuc;
      const ketQuaXacThuc = xacThucMaOtp(emailDangCho, maOtpNhap);
      if (!ketQuaXacThuc.hopLe) {
        if (ketQuaXacThuc.hetLuot) {
          await capNhatPhien(chatId, -1, {});
          await guiTinNhanZalo(
            chatId,
            '⛔ Bạn đã nhập sai OTP quá 5 lần. Mã OTP đã bị hủy để đảm bảo an toàn. Vui lòng nhập lại email để nhận mã mới:'
          );
          return;
        }
        await guiTinNhanZalo(
          chatId,
          `❌ ${ketQuaXacThuc.lyDo || 'Mã OTP không chính xác hoặc đã hết hạn'}.\n(Còn ${ketQuaXacThuc.soLanConLai || 0} lần thử. Gõ "doi email" nếu muốn đổi email khác):`
        );
        return;
      }

      // Lưu liên kết định danh vào bảng nguoi_dung (giữ nguyên 6 bảng)
      const emailCu = await prisma.nguoi_dung.findFirst({
        where: { email: emailDangCho }
      });

      // Giải phóng chat_id_zalo nếu tài khoản khác đang giữ để không xung đột
      await prisma.nguoi_dung.updateMany({
        where: { chat_id_zalo: chatId, NOT: { email: emailDangCho } },
        data: { chat_id_zalo: null }
      });

      let nguoiDungGan;
      if (emailCu) {
        const vaiTroMoi = ['ADMIN', 'KTV', 'KY_THUAT_VIEN'].includes(emailCu.vai_tro)
          ? emailCu.vai_tro
          : duLieuTam.vaiTroXacThuc;

        nguoiDungGan = await prisma.nguoi_dung.update({
          where: { ma_nguoi_dung: emailCu.ma_nguoi_dung },
          data: {
            chat_id_zalo: chatId,
            vai_tro: vaiTroMoi,
            trang_thai_hoat_dong: true
          }
        });
      } else {
        const taiKhoanMoi = `zalo_${chatId}_${Date.now().toString().slice(-4)}`;
        const hoTenMoi = duLieuTam.vaiTroXacThuc === 'GIANG_VIEN'
          ? `Giảng viên (${duLieuTam.tienToEmail})`
          : `Sinh viên (${duLieuTam.tienToEmail})`;

        nguoiDungGan = await prisma.nguoi_dung.create({
          data: {
            tai_khoan: taiKhoanMoi,
            mat_khau_hash: 'ZALO_USER_NO_WEB_LOGIN',
            ho_ten: hoTenMoi,
            email: emailDangCho,
            vai_tro: duLieuTam.vaiTroXacThuc,
            chat_id_zalo: chatId,
            trang_thai_hoat_dong: true
          }
        });
      }

      const danhXung = nguoiDungGan.vai_tro === 'GIANG_VIEN' ? 'Quý Thầy/Cô' : 'bạn Sinh viên';
      await guiTinNhanZalo(
        chatId,
        `🎉 XÁC THỰC THÀNH CÔNG!\n\n` +
        `Chào mừng ${danhXung} (${emailDangCho}) đến với Hệ thống tiếp nhận Báo hỏng Thiết bị TVU.\n` +
        `Từ bây giờ, bạn có thể báo hỏng nhanh chóng chỉ trong 30 giây mà không cần xác thực lại.`
      );

      // Tự động chuyển buoc_hien_tai = 1 và gửi ngay Menu chọn thiết bị Bước 1/4
      await capNhatPhien(chatId, 1, {});
      await guiTinNhanZalo(
        chatId,
        `BƯỚC 1/4 - CHỌN THIẾT BỊ BÁO HỎNG:\n` +
        `Hãy chọn (từ 1 đến 6) tương ứng với loại thiết bị\n` +
        `1. Máy chiếu\n` +
        `2. Máy tính / Màn hình\n` +
        `3. Máy lạnh\n` +
        `4. Âm thanh (Micro, Loa)\n` +
        `5. Hệ thống Điện / Đèn / Quạt\n` +
        `6. Thiết bị Mạng (Wifi, Switch) / Khác\n` +
        `(💡 Gõ huyyeucau nếu muốn thoát)`
      );
      return;
    }

    if (phien.buoc_hien_tai === 1) {
      if (!vanBan) {
        await guiTinNhanZalo(chatId, 'Vui lòng gõ số (1-6) hoặc nhập tên thiết bị:');
        return;
      }
      let danhSachDanhMuc = [];
      try {
        danhSachDanhMuc = await prisma.danh_muc_thiet_bi.findMany();
      } catch (e) {
        console.warn('⚠️ Lỗi lấy danh mục thiết bị từ DB:', e.message);
      }

      const nhanDien = nhanDienDanhMucThietBi(vanBan, danhSachDanhMuc);
      duLieuTam.tenThietBi = lamSachDuLieu(nhanDien.ten_thiet_bi).slice(0, 100);
      duLieuTam.maDanhMuc = nhanDien.ma_danh_muc;
      await capNhatPhien(chatId, 2, duLieuTam);

      await guiTinNhanZalo(
        chatId,
        `BƯỚC 2/4 - VỊ TRÍ / PHÒNG HỌC:\n` +
        `Thiết bị đang ở phòng nào?\n` +
        `(💡 Vui lòng gõ mã phòng, VD: D71.103, A42.204, B31.204 hoặc Lab 1)`
      );
      return;
    }

    if (phien.buoc_hien_tai === 2) {
      if (!vanBan) {
        await guiTinNhanZalo(chatId, 'Vui lòng nhập vị trí hoặc mã phòng:');
        return;
      }
      const ketQuaPhong = await chuanHoaVaKhopPhong(vanBan, prisma);
      duLieuTam.phong = lamSachDuLieu(ketQuaPhong.ten_phong).slice(0, 100);
      duLieuTam.maPhong = ketQuaPhong.ma_phong;
      await capNhatPhien(chatId, 3, duLieuTam);

      await guiTinNhanZalo(chatId, `👉 Bước 3/4: Hãy mô tả hiện trạng hư hỏng (Ví dụ: Không lên nguồn, nhấp nháy đèn đỏ...)`);
      return;
    }

    if (phien.buoc_hien_tai === 3) {
      if (!vanBan) {
        await guiTinNhanZalo(chatId, 'Vui lòng nhập mô tả sự cố:');
        return;
      }
      duLieuTam.moTa = lamSachDuLieu(vanBan).slice(0, 1000);
      let mucUuTien = tuDongGanMucDoUuTien(duLieuTam.moTa, duLieuTam.phong);
      // Tự động nâng độ ưu tiên lên CAO nếu Giảng viên báo sự cố
      if (nguoiDungHienTai?.vai_tro === 'GIANG_VIEN' && mucUuTien === 'BINH_THUONG') {
        mucUuTien = 'CAO';
      }
      duLieuTam.mucDoUuTien = mucUuTien;
      await capNhatPhien(chatId, 4, duLieuTam);

      const laGiangVienHoacNoiBo = nguoiDungHienTai && ['GIANG_VIEN', 'ADMIN', 'KTV', 'KY_THUAT_VIEN'].includes(nguoiDungHienTai.vai_tro);
      const thongBaoHuongDan = laGiangVienHoacNoiBo
        ? `👉 Bước 4/4: Bạn hãy gửi 1 hình ảnh chụp hiện trạng sự cố (hoặc gõ "boqua" nếu không có ảnh):`
        : (nguoiDungHienTai?.vai_tro === 'SINH_VIEN'
          ? `👉 Bước 4/4: Bạn hãy chụp và gửi 1 hình ảnh hiện trạng thiết bị hỏng tại phòng học:`
          : `👉 Bước 4/4: Bạn hãy gửi 1 hình ảnh chụp hiện trạng sự cố (hoặc gõ "boqua" nếu không có ảnh):`);

      await guiTinNhanZalo(chatId, thongBaoHuongDan);
      return;
    }

    if (phien.buoc_hien_tai === 4) {
      if (dangXuLyBuoc4.has(chatId)) {
        await guiTinNhanZalo(chatId, '⏳ Hệ thống đang xử lý yêu cầu trước đó của bạn, vui lòng chờ giây lát...');
        return;
      }

      dangXuLyBuoc4.add(chatId);
      try {
        let hinhAnh = null;
        let taiAnhLoi = false;

        const laGiangVienHoacNoiBo = nguoiDungHienTai && ['GIANG_VIEN', 'ADMIN', 'KTV', 'KY_THUAT_VIEN'].includes(nguoiDungHienTai.vai_tro);

        if (urlAnhTam) {
          try {
            hinhAnh = await taiAnhLenCloudinary(urlAnhTam);
          } catch (loiUpload) {
            console.warn('⚠️ Lỗi upload Cloudinary, lưu null fallback:', loiUpload.message);
            hinhAnh = null;
            taiAnhLoi = true;
          }
        } else if (chuoiKhongDau === 'boqua' || chuoiKhongDau === 'bo qua') {
          // Bắt buộc Sinh viên phải gửi ảnh, không cho phép boqua
          if (!laGiangVienHoacNoiBo && nguoiDungHienTai?.vai_tro === 'SINH_VIEN') {
            await guiTinNhanZalo(
              chatId,
              `📸 Để đảm bảo tính xác thực đối với Sinh viên, bạn bắt buộc phải gửi 1 tấm ảnh chụp thực tế thiết bị đang hỏng tại phòng học (không áp dụng lệnh "boqua"). Vui lòng chụp và gửi ảnh ngay bên dưới:`
            );
            return;
          }
        } else {
          await guiTinNhanZalo(chatId, 'Vui lòng gửi 1 hình ảnh hoặc gõ "boqua" để hoàn tất báo hỏng:');
          return;
        }

        const yeuCauMoi = await taoYeuCauTuPhien(chatId, duLieuTam, hinhAnh, nguoiDungHienTai);

        // null = tin nhắn trùng, luồng khác đã tạo yêu cầu từ phiên này → không làm gì thêm
        if (!yeuCauMoi) return;

        console.log(`✅ Đã tiếp nhận yêu cầu [${yeuCauMoi.ma_yeu_cau}] cho thiết bị ${yeuCauMoi.ten_thiet_bi}`);

        const luuYAnh = taiAnhLoi
          ? `\n\n⚠️ Hệ thống chưa tải được ảnh của bạn nên yêu cầu được ghi nhận không kèm ảnh. Bạn có thể báo thêm cho KTV khi cần.`
          : '';

        await guiTinNhanZalo(
          chatId,
          `✅ ĐÃ TIẾP NHẬN YÊU CẦU THÀNH CÔNG!\n\n` +
          `• Mã yêu cầu: ${yeuCauMoi.ma_yeu_cau}\n` +
          `• Thiết bị: ${yeuCauMoi.ten_thiet_bi}\n` +
          `• Phòng: ${yeuCauMoi.vi_tri_phong}\n` +
          `• Trạng thái: Chờ xử lý\n\n` +
          `Kỹ thuật viên sẽ tiếp nhận sớm nhất.\n` +
          `💡 Để kiểm tra tiến độ, gõ: tracuu ${yeuCauMoi.ma_yeu_cau}\n` +
          `💡 Để hủy khi báo nhầm, gõ: huyyeucau ${yeuCauMoi.ma_yeu_cau}${luuYAnh}`
        );
      } finally {
        dangXuLyBuoc4.delete(chatId);
      }
    }
  } catch (loi) {
    console.error('❌ Lỗi xử lý Webhook Zalo:', loi);
    if (chatId) {
      // Báo cho người dùng biết thay vì im lặng; nếu gửi cũng lỗi thì bỏ qua
      guiTinNhanZalo(chatId, '⚠️ Hệ thống đang gặp sự cố. Bạn vui lòng thử lại sau ít phút.').catch(() => {});
    }
  }
}

module.exports = {
  tiepNhanWebhookZalo,
  kiemTraChongSpam,
  layPhienHienTai,
  khoiTaoPhienMoi,
  capNhatPhien,
  xoaPhien,
  taoYeuCauTuPhien,
  dangXuLyBuoc4,
  chuanHoaVaKhopPhong
};
