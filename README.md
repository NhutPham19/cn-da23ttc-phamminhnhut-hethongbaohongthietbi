# Hệ Thống Tiếp Nhận & Theo Dõi Báo Hỏng Thiết Bị

> **Đồ án chuyên ngành Công nghệ Thông tin**  
> Tác giả: **Phạm Minh Nhựt**  
> Nền tảng: **Node.js, Express, Zalo Bot Platform, Supabase (PostgreSQL), Prisma ORM, Cloudinary, Render**

---

## 📌 Giới thiệu dự án
Hệ thống giải quyết bài toán tiếp nhận và xử lý sự cố thiết bị tại phòng học/cơ quan một cách tự động và minh bạch:
1. **Người báo hỏng:** Sử dụng ứng dụng **Zalo** quét mã QR tại phòng học để tương tác với Bot, tạo yêu cầu báo hỏng trong vòng 30 giây (không cần cài thêm ứng dụng, không cần tài khoản).
2. **Hệ thống tự động:** Tiếp nhận qua Webhook bảo mật, lưu trữ ảnh sự cố lên Cloudinary và ghi nhận phiếu yêu cầu vào CSDL Supabase.
3. **Kỹ thuật viên & Quản lý:** Theo dõi, tiếp nhận việc và cập nhật tiến độ trên Web Dashboard. Khi trạng thái thay đổi, hệ thống tự động gửi tin nhắn Zalo thông báo cho người báo hỏng.
4. **Tra cứu tiến độ:** Người dùng gõ cú pháp `tra cuu [MÃ_YÊU_CẦU]` trực tiếp trên Zalo để kiểm tra lịch sử xử lý.

---

## 🏗️ Công nghệ sử dụng
- **Backend:** Node.js + Express.js
- **Bot Platform:** Zalo Bot Platform (`bot.zapps.me`)
- **Database:** Supabase (PostgreSQL) thông qua Prisma ORM
- **Lưu trữ ảnh:** Cloudinary API
- **Xác thực Dashboard:** JWT + bcrypt
- **Đường hầm kiểm thử Local:** Cloudflare Tunnel (`cloudflared`)
- **Triển khai:** Render (Web Service) + UptimeRobot (Keep-alive)

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy cục bộ (Local)

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env` dựa trên file `.env.example`:
```env
PORT=3000
ZALO_BOT_TOKEN="your_bot_token"
ZALO_SECRET_TOKEN="your_secret_token"
DATABASE_URL="your_database_url"
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
```

### 3. Khởi chạy ứng dụng
Mở 2 cửa sổ Terminal:
* **Terminal 1 (Chạy server):**
  ```bash
  npm start
  ```
* **Terminal 2 (Mở tunnel & tự động đăng ký Webhook với Zalo):**
  ```bash
  npm run tunnel
  ```

---

## 🛡️ Bản quyền & Bảo mật
Toàn bộ thông tin bí mật (Bot Token, Secret Token, Database Password) được quản lý qua biến môi trường `.env` và được loại trừ trong `.gitignore`.
