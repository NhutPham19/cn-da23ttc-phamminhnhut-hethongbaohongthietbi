# ==============================================================================
# Dockerfile - Đóng gói ứng dụng Hệ thống Quản trị & Báo hỏng Thiết bị (TVU)
# Sử dụng Node.js 22 (Debian Bookworm Slim - Tương thích tối đa Prisma & Bcrypt)
# ==============================================================================

FROM node:22-bookworm-slim

# 1. Cài đặt OpenSSL và CA certificates (Bắt buộc cho Prisma Query Engine kết nối DB)
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# 2. Thiết lập thư mục làm việc trong container
WORKDIR /app

# 3. Phân quyền thư mục cho người dùng node (không chạy dưới quyền root)
RUN chown -R node:node /app

# 4. Copy các file định nghĩa dependencies trước để tận dụng Docker layer cache
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma/

# 5. Cài đặt các gói thư viện và sinh mã Prisma Client
USER node
RUN npm install && npx prisma generate

# 6. Copy toàn bộ mã nguồn ứng dụng (giao diện public, logic src, server.js)
COPY --chown=node:node . .

# 7. Thiết lập biến môi trường mặc định
ENV NODE_ENV=production
ENV PORT=7000

# 8. Mở cổng kết nối
EXPOSE 7000

# 9. Healthcheck kiểm tra định kỳ trạng thái hoạt động qua endpoint /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:7000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# 10. Lệnh khởi chạy máy chủ Express
CMD ["node", "server.js"]
