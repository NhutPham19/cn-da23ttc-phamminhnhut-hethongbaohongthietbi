// src/services/emailDichVu.js - Dịch vụ gửi email thông báo & mã OTP qua Gmail SMTP / Brevo API / Resend API
const nodemailer = require('nodemailer');

let boGuiMail = null;

function layBoGuiMail() {
  if (boGuiMail) return boGuiMail;

  const emailUser = (process.env.EMAIL_USER || '').trim();
  const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

  if (!emailUser || !emailPass) {
    return null;
  }

  boGuiMail = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    },
    // Giới hạn timeout 7s để không treo request khi mạng/firewall đám mây (Render Free) chặn cổng SMTP
    connectionTimeout: 7000,
    greetingTimeout: 7000,
    socketTimeout: 7000
  });

  return boGuiMail;
}

/**
 * Gửi email qua Brevo (Sendinblue) HTTP API (Cổng 443 HTTPS - Hoạt động hoàn hảo trên Render Free Tier)
 * Miễn phí 300 email/ngày, không yêu cầu tên miền riêng, dùng được với Gmail cá nhân.
 */
async function guiQuaBrevoApi(emailNhan, tenNguoiNhan, tieuDe, noiDungHtml) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) return null;

  const emailGui = (process.env.EMAIL_USER || 'phamminhnhut50@gmail.com').trim();
  const tenNguoiGui = 'Hệ thống Báo hỏng Thiết bị';

  const phanHoi = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: tenNguoiGui, email: emailGui },
      to: [{ email: emailNhan, name: tenNguoiNhan || 'Quý Thầy/Cô & Cán bộ' }],
      subject: tieuDe,
      htmlContent: noiDungHtml
    })
  });

  const duLieu = await phanHoi.json().catch(() => ({}));
  if (!phanHoi.ok) {
    throw new Error(`Brevo API lỗi (${phanHoi.status}): ${duLieu.message || JSON.stringify(duLieu)}`);
  }

  return { daGui: true, idTinNhan: duLieu.messageId, nhaCungCap: 'BREVO_API' };
}

/**
 * Gửi email qua Resend HTTP API (Cổng 443 HTTPS)
 */
async function guiQuaResendApi(emailNhan, tieuDe, noiDungHtml) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;

  const emailGui = (process.env.RESEND_FROM || 'onboarding@resend.dev').trim();

  const phanHoi = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Hệ thống Báo hỏng <${emailGui}>`,
      to: [emailNhan],
      subject: tieuDe,
      html: noiDungHtml
    })
  });

  const duLieu = await phanHoi.json().catch(() => ({}));
  if (!phanHoi.ok) {
    throw new Error(`Resend API lỗi (${phanHoi.status}): ${duLieu.message || JSON.stringify(duLieu)}`);
  }

  return { daGui: true, idTinNhan: duLieu.id, nhaCungCap: 'RESEND_API' };
}

/**
 * Gửi email chứa mã xác thực OTP 6 số đến người dùng
 * @param {string} emailNhan - Địa chỉ email người nhận
 * @param {string} hoTen - Họ tên người nhận
 * @param {string} maOtp - Mã OTP 6 chữ số
 * @returns {Promise<{ daGui: boolean, cheDoTest?: boolean, cheDoFallback?: boolean, nhaCungCap?: string, idTinNhan?: string, thongBao?: string }>}
 */
async function guiEmailOtp(emailNhan, hoTen, maOtp) {
  // 1. Môi trường kiểm thử (Automated Tests) hoặc chưa cấu hình bất kỳ biến nào: Mock trả về ngay
  const coSmtp = Boolean(process.env.EMAIL_PASS && process.env.EMAIL_USER);
  const coBrevo = Boolean((process.env.BREVO_API_KEY || '').trim());
  const coResend = Boolean((process.env.RESEND_API_KEY || '').trim());

  if (process.env.NODE_ENV === 'test' || (!coSmtp && !coBrevo && !coResend)) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`📧 [MOCK EMAIL] Gửi OTP [${maOtp}] đến ${emailNhan} (Chưa cấu hình dịch vụ gửi email trong .env)`);
    }
    return { daGui: true, cheDoTest: true };
  }

  const tenNguoiNhan = hoTen ? hoTen.trim() : 'Quý Thầy/Cô & Cán bộ';
  const tieuDe = `[Hệ thống Báo hỏng] Mã xác thực đặt lại mật khẩu: ${maOtp}`;

  const noiDungHtml = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #1E293B; }
        .email-container { max-width: 540px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .email-header { background: #1E40AF; padding: 24px; text-align: center; color: #FFFFFF; }
        .email-header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
        .email-body { padding: 32px 24px; line-height: 1.6; }
        .otp-box { background: #F1F5F9; border: 2px dashed #94A3B8; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1E40AF; font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace; }
        .otp-note { font-size: 13px; color: #64748B; margin-top: 8px; }
        .warning-box { background: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #991B1B; margin-top: 20px; }
        .email-footer { background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px; text-align: center; font-size: 12px; color: #94A3B8; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h1>HỆ THỐNG BÁO HỎNG THIẾT BỊ</h1>
        </div>
        <div class="email-body">
          <p>Xin chào <strong>${tenNguoiNhan}</strong>,</p>
          <p>Hệ thống nhận được yêu cầu đặt lại mật khẩu đăng nhập cho tài khoản liên kết với địa chỉ email này. Vui lòng sử dụng mã xác thực bên dưới để hoàn tất:</p>
          
          <div class="otp-box">
            <div class="otp-code">${maOtp}</div>
            <div class="otp-note"> Mã có hiệu lực trong vòng <strong>5 phút</strong></div>
          </div>

          <div class="warning-box">
            🔒 <strong>Lưu ý bảo mật:</strong> Tuyệt đối không chia sẻ mã này cho bất kỳ ai. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc liên hệ Quản trị viên để được hỗ trợ.
          </div>
        </div>
        <div class="email-footer">
          Đây là thư tự động từ Hệ thống Báo hỏng Thiết bị. Vui lòng không trả lời thư này.
        </div>
      </div>
    </body>
    </html>
  `;

  // 2. Ưu tiên Brevo API (Giao thức HTTP Port 443 - hoạt động tốt trên Render Free Tier)
  if (coBrevo) {
    try {
      const kqBrevo = await guiQuaBrevoApi(emailNhan, tenNguoiNhan, tieuDe, noiDungHtml);
      if (kqBrevo && kqBrevo.daGui) {
        console.log(`✅ [BREVO API] Đã gửi mã OTP [${maOtp}] thành công đến: ${emailNhan} (Message ID: ${kqBrevo.idTinNhan})`);
        return kqBrevo;
      }
    } catch (loiBrevo) {
      console.error('❌ [BREVO API LỖI]:', loiBrevo.message);
    }
  }

  // 3. Ưu tiên thứ 2: Resend API (HTTP Port 443)
  if (coResend) {
    try {
      const kqResend = await guiQuaResendApi(emailNhan, tieuDe, noiDungHtml);
      if (kqResend && kqResend.daGui) {
        console.log(`✅ [RESEND API] Đã gửi mã OTP [${maOtp}] thành công đến: ${emailNhan} (ID: ${kqResend.idTinNhan})`);
        return kqResend;
      }
    } catch (loiResend) {
      console.error('❌ [RESEND API LỖI]:', loiResend.message);
    }
  }

  // 4. Nếu không dùng API hoặc API lỗi: Sử dụng Gmail SMTP qua Nodemailer (Thích hợp cho localhost)
  const transporter = layBoGuiMail();
  if (!transporter) {
    console.warn('⚠️ Chưa cấu hình Gmail SMTP hoặc HTTP Email API trong biến môi trường');
    return { daGui: false, lyDo: 'CHUA_CAU_HINH' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"Hệ thống Báo hỏng Thiết bị" <${process.env.EMAIL_USER}>`,
      to: emailNhan,
      subject: tieuDe,
      html: noiDungHtml
    });

    console.log(`✅ [GMAIL SMTP THẬT] Đã gửi mã OTP [${maOtp}] thành công đến: ${emailNhan} (Message ID: ${info.messageId})`);
    return { daGui: true, idTinNhan: info.messageId, nhaCungCap: 'GMAIL_SMTP' };
  } catch (loiGuiMail) {
    console.error('❌ [GMAIL SMTP LỖI]:', loiGuiMail.message);

    // Phát hiện trường hợp chạy trên Render Free Tier (Render chặn các cổng SMTP 25, 465, 587)
    const laRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
    const laLoiTimeoutHoacKetNoi = 
      loiGuiMail.code === 'ETIMEDOUT' || 
      loiGuiMail.code === 'ESOCKETTIMEDOUT' || 
      loiGuiMail.code === 'ECONNREFUSED' || 
      loiGuiMail.code === 'EHOSTUNREACH' ||
      loiGuiMail.command === 'CONN' ||
      /timeout/i.test(loiGuiMail.message);

    if (laRender || laLoiTimeoutHoacKetNoi || process.env.ALLOW_OTP_CONSOLE === 'true') {
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('⚠️ [THÔNG BÁO TỰ ĐỘNG - PHÁT HIỆN RENDER FREE CHẶN CỔNG SMTP]');
      console.warn('📌 Render Free Tier chặn các cổng SMTP (465, 587) để chống spam.');
      console.warn(`🔑 MÃ XÁC THỰC OTP CHO [${emailNhan}] LÀ: [ ${maOtp} ] (Hiệu lực 5 phút)`);
      console.warn('💡 ĐỂ GỬI VỀ HỘP THƯ GMAIL THẬT: Cấu hình BREVO_API_KEY trên Render (miễn phí 300 mail/ngày qua HTTPS cổng 443).');
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        daGui: true,
        cheDoFallback: true,
        maOtp,
        thongBao: 'Mã xác thực OTP đã được tạo! (Lưu ý: Do Render Free chặn cổng SMTP, mã OTP đã được in trong Render Logs của bạn).'
      };
    }

    throw loiGuiMail;
  }
}

module.exports = {
  guiEmailOtp
};
