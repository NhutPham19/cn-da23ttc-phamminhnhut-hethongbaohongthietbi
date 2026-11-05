// src/services/emailDichVu.js - Dịch vụ gửi email thông báo & mã OTP qua Gmail SMTP
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
    }
  });

  return boGuiMail;
}

/**
 * Gửi email chứa mã xác thực OTP 6 số đến người dùng
 * @param {string} emailNhan - Địa chỉ email người nhận
 * @param {string} hoTen - Họ tên người nhận
 * @param {string} maOtp - Mã OTP 6 chữ số
 * @returns {Promise<{ daGui: boolean, cheDoTest?: boolean, idTinNhan?: string }>}
 */
async function guiEmailOtp(emailNhan, hoTen, maOtp) {
  // Môi trường kiểm thử (Automated Tests) hoặc chưa cấu hình App Password: Mock trả về ngay lập tức
  if (process.env.NODE_ENV === 'test' || !process.env.EMAIL_PASS || !process.env.EMAIL_USER) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`📧 [MOCK EMAIL] Gửi OTP [${maOtp}] đến ${emailNhan} (Chưa cấu hình EMAIL_USER / EMAIL_PASS trong .env)`);
    }
    return { daGui: true, cheDoTest: true };
  }

  const transporter = layBoGuiMail();
  if (!transporter) {
    console.warn('⚠️ Chưa cấu hình Gmail SMTP trong tệp .env, bỏ qua gửi email thật');
    return { daGui: false, lyDo: 'CHUA_CAU_HINH' };
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

  try {
    const info = await transporter.sendMail({
      from: `"Hệ thống Báo hỏng Thiết bị" <${process.env.EMAIL_USER}>`,
      to: emailNhan,
      subject: tieuDe,
      html: noiDungHtml
    });

    console.log(`✅ [GMAIL SMTP THẬT] Đã gửi mã OTP [${maOtp}] thành công đến: ${emailNhan} (Message ID: ${info.messageId})`);
    return { daGui: true, idTinNhan: info.messageId };
  } catch (loiGuiMail) {
    console.error('❌ [GMAIL SMTP LỖI]:', loiGuiMail.message);
    throw loiGuiMail;
  }
}

module.exports = {
  guiEmailOtp
};
