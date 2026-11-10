// public/js/dangNhap.js - Logic kiểm tra phiên & xử lý Đăng nhập hệ thống (Chống XSS 100%)

document.addEventListener('DOMContentLoaded', () => {
  const bieuMauDangNhap = document.getElementById('bieuMauDangNhap');
  const oTaiKhoan = document.getElementById('taiKhoan');
  const oMatKhau = document.getElementById('matKhau');
  const nutDangNhap = document.getElementById('nutDangNhap');
  const chuNut = document.getElementById('chuNut');
  const spinnerNut = document.getElementById('spinnerNut');
  const hopBaoLoi = document.getElementById('hopBaoLoi');
  const noiDungLoi = document.getElementById('noiDungLoi');
  const nutAnHienMatKhau = document.getElementById('nutAnHienMatKhau');

  // 1. Kiểm tra nếu đã có phiên đăng nhập hợp lệ thì chuyển thẳng vào Dashboard
  async function kiemTraPhienHienTai() {
    try {
      const phanHoi = await fetch('/api/xac-thuc/thong-tin-ca-nhan', {
        headers: { 'Accept': 'application/json' }
      });
      if (phanHoi.ok) {
        window.location.replace('/dashboard.html');
      }
    } catch (loi) {
      // Chưa đăng nhập hoặc mạng gián đoạn -> Ở lại trang đăng nhập
    }
  }

  kiemTraPhienHienTai();

  // 2. Nút Ẩn / Hiện mật khẩu
  if (nutAnHienMatKhau && oMatKhau) {
    nutAnHienMatKhau.addEventListener('click', () => {
      const dangAn = oMatKhau.type === 'password';
      oMatKhau.type = dangAn ? 'text' : 'password';
      nutAnHienMatKhau.setAttribute('aria-label', dangAn ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    });
  }

  // 2.1. Nút & Modal Quên mật khẩu (Xác thực OTP qua Gmail)
  const linkQuenMatKhau = document.getElementById('linkQuenMatKhau');
  const modalQuenMkEl = document.getElementById('modalQuenMatKhau');
  let bsModalQuenMk = null;
  let boDemNguocInterval = null;
  let emailHienTaiOtp = '';
  let tokenDatLaiOtp = '';

  const Toast = typeof Swal !== 'undefined' ? Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
  }) : null;

  function datDemNguocGuiLai(soGiay = 60) {
    const nutGuiLai = document.getElementById('nutGuiLaiOtp');
    const demEl = document.getElementById('demNguocOtp');
    if (!nutGuiLai || !demEl) return;

    if (boDemNguocInterval) clearInterval(boDemNguocInterval);

    nutGuiLai.disabled = true;
    nutGuiLai.classList.add('text-muted');
    demEl.textContent = soGiay;

    let dem = soGiay;
    boDemNguocInterval = setInterval(() => {
      dem -= 1;
      if (dem <= 0) {
        clearInterval(boDemNguocInterval);
        nutGuiLai.disabled = false;
        nutGuiLai.classList.remove('text-muted');
        nutGuiLai.textContent = 'Gửi lại mã OTP';
      } else {
        demEl.textContent = dem;
      }
    }, 1000);
  }

  function chuyenSangBuoc1() {
    const buoc1 = document.getElementById('khoiQuenMkBuoc1');
    const buoc2 = document.getElementById('khoiQuenMkBuoc2');
    const buoc3 = document.getElementById('khoiQuenMkBuoc3');
    const hopLoi1 = document.getElementById('hopLoiQuenMk1');
    const hopLoi2 = document.getElementById('hopLoiQuenMk2');
    const hopLoi3 = document.getElementById('hopLoiQuenMk3');

    if (buoc1) buoc1.classList.remove('d-none');
    if (buoc2) buoc2.classList.add('d-none');
    if (buoc3) buoc3.classList.add('d-none');
    if (hopLoi1) hopLoi1.classList.add('d-none');
    if (hopLoi2) hopLoi2.classList.add('d-none');
    if (hopLoi3) hopLoi3.classList.add('d-none');

    tokenDatLaiOtp = '';
    if (boDemNguocInterval) clearInterval(boDemNguocInterval);
    const emailEl = document.getElementById('emailQuenMk');
    if (emailEl) setTimeout(() => emailEl.focus(), 200);
  }

  function chuyenSangBuoc2(email, thongTinPhu = {}) {
    emailHienTaiOtp = email;
    tokenDatLaiOtp = '';
    const buoc1 = document.getElementById('khoiQuenMkBuoc1');
    const buoc2 = document.getElementById('khoiQuenMkBuoc2');
    const buoc3 = document.getElementById('khoiQuenMkBuoc3');
    const emailHienThi = document.getElementById('emailHienThiNhanOtp');
    const hopLoi2 = document.getElementById('hopLoiQuenMk2');
    const maOtpInput = document.getElementById('maOtpNhap');
    const thongBaoBox = buoc2 ? buoc2.querySelector('.alert-info, .alert-warning') : null;

    if (buoc1) buoc1.classList.add('d-none');
    if (buoc2) buoc2.classList.remove('d-none');
    if (buoc3) buoc3.classList.add('d-none');
    if (emailHienThi) emailHienThi.textContent = email;
    if (hopLoi2) hopLoi2.classList.add('d-none');

    if (thongBaoBox) {
      if (thongTinPhu?.maOtpThuNghiem) {
        thongBaoBox.className = 'alert alert-warning py-2 px-3 small mb-3';
        thongBaoBox.innerHTML = `Mã xác thực đã được tạo cho <strong>${email}</strong>.<br><div class="mt-1">🔑 Mã OTP kiểm thử: <span class="badge bg-dark fs-6 px-2 py-1">${thongTinPhu.maOtpThuNghiem}</span> <span class="text-muted">(Do Render Free chặn cổng SMTP)</span></div>`;
      } else if (thongTinPhu?.cheDoFallback) {
        thongBaoBox.className = 'alert alert-warning py-2 px-3 small mb-3';
        thongBaoBox.innerHTML = `Mã xác thực đã được tạo cho <strong>${email}</strong>.<br><small class="text-dark">⚠️ Lưu ý: Máy chủ đám mây chặn cổng SMTP. Vui lòng kiểm tra mã OTP tại mục <strong>Logs</strong> trên Render Dashboard (hoặc cấu hình Brevo API Key).</small>`;
      } else {
        thongBaoBox.className = 'alert alert-info py-2 px-3 small mb-3';
        thongBaoBox.innerHTML = `Mã xác thực gồm 6 chữ số đã được gửi đến email <strong>${email}</strong>. Vui lòng kiểm tra hộp thư đến (hoặc hòm thư rác/Spam).`;
      }
    }

    // Reset các trường bước 2
    if (maOtpInput) {
      maOtpInput.value = '';
      setTimeout(() => maOtpInput.focus(), 200);
    }

    datDemNguocGuiLai(60);
  }

  function chuyenSangBuoc3(token) {
    tokenDatLaiOtp = token;
    const buoc1 = document.getElementById('khoiQuenMkBuoc1');
    const buoc2 = document.getElementById('khoiQuenMkBuoc2');
    const buoc3 = document.getElementById('khoiQuenMkBuoc3');
    const hopLoi3 = document.getElementById('hopLoiQuenMk3');
    const mkMoi = document.getElementById('matKhauMoiOtp');
    const mkXacNhan = document.getElementById('xacNhanMatKhauOtp');

    if (buoc1) buoc1.classList.add('d-none');
    if (buoc2) buoc2.classList.add('d-none');
    if (buoc3) buoc3.classList.remove('d-none');
    if (hopLoi3) hopLoi3.classList.add('d-none');

    if (mkMoi) mkMoi.value = '';
    if (mkXacNhan) mkXacNhan.value = '';
    if (mkMoi) setTimeout(() => mkMoi.focus(), 200);
  }

  if (linkQuenMatKhau && modalQuenMkEl) {
    linkQuenMatKhau.addEventListener('click', (e) => {
      e.preventDefault();
      chuyenSangBuoc1();
      if (!bsModalQuenMk) {
        bsModalQuenMk = new bootstrap.Modal(modalQuenMkEl);
      }
      bsModalQuenMk.show();
    });

    modalQuenMkEl.addEventListener('hidden.bs.modal', () => {
      chuyenSangBuoc1();
    });
  }

  // Nút quay lại bước 1
  const nutQuayLaiBuoc1 = document.getElementById('nutQuayLaiBuoc1');
  if (nutQuayLaiBuoc1) {
    nutQuayLaiBuoc1.addEventListener('click', () => {
      chuyenSangBuoc1();
    });
  }

  // Submit Bước 1: Gửi OTP
  const bieuMauGuiOtp = document.getElementById('bieuMauGuiOtp');
  if (bieuMauGuiOtp) {
    bieuMauGuiOtp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailEl = document.getElementById('emailQuenMk');
      const hopLoi = document.getElementById('hopLoiQuenMk1');
      const nutGui = document.getElementById('nutGuiOtp');
      const chuNut = document.getElementById('chuNutGuiOtp');
      const spinner = document.getElementById('spinnerNutGuiOtp');

      const email = (emailEl?.value || '').trim();
      if (!email) {
        if (hopLoi) {
          hopLoi.textContent = 'Vui lòng nhập địa chỉ email.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      if (nutGui) nutGui.disabled = true;
      if (chuNut) chuNut.textContent = 'Đang gửi mã...';
      if (spinner) spinner.classList.remove('d-none');
      if (hopLoi) hopLoi.classList.add('d-none');

      try {
        const phanHoi = await fetch('/api/xac-thuc/quen-mat-khau', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ email })
        });

        const ketQua = await phanHoi.json().catch(() => ({}));
        if (!phanHoi.ok || !ketQua.thanhCong) {
          if (hopLoi) {
            hopLoi.textContent = ketQua.loi || 'Không thể gửi mã xác thực. Vui lòng thử lại.';
            hopLoi.classList.remove('d-none');
          }
          return;
        }

        if (Toast) {
          Toast.fire({
            icon: ketQua.cheDoFallback ? 'info' : 'success',
            title: ketQua.thongBao || 'Mã OTP đã được gửi đến email của bạn!'
          });
        }
        chuyenSangBuoc2(email, ketQua);
      } catch (loi) {
        if (hopLoi) {
          hopLoi.textContent = 'Lỗi kết nối máy chủ khi gửi mã xác thực.';
          hopLoi.classList.remove('d-none');
        }
      } finally {
        if (nutGui) nutGui.disabled = false;
        if (chuNut) chuNut.textContent = 'Gửi mã xác thực OTP';
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }

  // Nút gửi lại OTP ở Bước 2
  const nutGuiLaiOtp = document.getElementById('nutGuiLaiOtp');
  if (nutGuiLaiOtp) {
    nutGuiLaiOtp.addEventListener('click', async () => {
      if (!emailHienTaiOtp) return;
      nutGuiLaiOtp.disabled = true;

      try {
        const phanHoi = await fetch('/api/xac-thuc/quen-mat-khau', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ email: emailHienTaiOtp })
        });

        const ketQua = await phanHoi.json().catch(() => ({}));
        if (!phanHoi.ok || !ketQua.thanhCong) {
          const hopLoi = document.getElementById('hopLoiQuenMk2');
          if (hopLoi) {
            hopLoi.textContent = ketQua.loi || 'Chưa thể gửi lại mã.';
            hopLoi.classList.remove('d-none');
          }
          nutGuiLaiOtp.disabled = false;
          return;
        }

        if (Toast) {
          Toast.fire({
            icon: ketQua.cheDoFallback ? 'info' : 'success',
            title: ketQua.thongBao || 'Đã gửi lại mã OTP mới vào hộp thư!'
          });
        }
        chuyenSangBuoc2(emailHienTaiOtp, ketQua);
      } catch {
        nutGuiLaiOtp.disabled = false;
      }
    });
  }

  // Submit Bước 2: Chỉ nhập mã xác thực OTP (Xác thực OTP trước)
  const bieuMauXacThucOtp = document.getElementById('bieuMauXacThucOtp');
  if (bieuMauXacThucOtp) {
    bieuMauXacThucOtp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hopLoi = document.getElementById('hopLoiQuenMk2');
      const maOtpEl = document.getElementById('maOtpNhap');
      const nutXacThuc = document.getElementById('nutXacThucOtp');
      const chuNut = document.getElementById('chuNutXacThucOtp');
      const spinner = document.getElementById('spinnerNutXacThucOtp');

      const otp = (maOtpEl?.value || '').trim();

      if (!otp) {
        if (hopLoi) {
          hopLoi.textContent = 'Vui lòng nhập mã xác thực OTP.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      if (!/^\d{6}$/.test(otp)) {
        if (hopLoi) {
          hopLoi.textContent = 'Mã OTP phải gồm đúng 6 chữ số.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      if (nutXacThuc) nutXacThuc.disabled = true;
      if (chuNut) chuNut.textContent = 'Đang xác thực...';
      if (spinner) spinner.classList.remove('d-none');
      if (hopLoi) hopLoi.classList.add('d-none');

      try {
        const phanHoi = await fetch('/api/xac-thuc/kiem-tra-otp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            email: emailHienTaiOtp,
            otp
          })
        });

        const ketQua = await phanHoi.json().catch(() => ({}));
        if (!phanHoi.ok || !ketQua.thanhCong) {
          if (hopLoi) {
            hopLoi.textContent = ketQua.loi || 'Mã OTP không hợp lệ hoặc đã hết hạn.';
            hopLoi.classList.remove('d-none');
          }
          return;
        }

        if (Toast) {
          Toast.fire({ icon: 'success', title: 'Xác thực OTP thành công!' });
        }
        chuyenSangBuoc3(ketQua.token_dat_lai);
      } catch (loi) {
        if (hopLoi) {
          hopLoi.textContent = 'Lỗi kết nối máy chủ khi kiểm tra mã OTP.';
          hopLoi.classList.remove('d-none');
        }
      } finally {
        if (nutXacThuc) nutXacThuc.disabled = false;
        if (chuNut) chuNut.textContent = 'Xác thực mã OTP';
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }

  // Submit Bước 3: Đặt lại mật khẩu mới sau khi đã xác thực OTP
  const bieuMauDatLaiMk = document.getElementById('bieuMauDatLaiMk');
  if (bieuMauDatLaiMk) {
    bieuMauDatLaiMk.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hopLoi = document.getElementById('hopLoiQuenMk3');
      const mkMoiEl = document.getElementById('matKhauMoiOtp');
      const mkXacNhanEl = document.getElementById('xacNhanMatKhauOtp');
      const nutXacNhan = document.getElementById('nutXacNhanDoiMk');
      const chuNut = document.getElementById('chuNutXacNhanDoiMk');
      const spinner = document.getElementById('spinnerNutXacNhanDoiMk');

      const mkMoi = mkMoiEl?.value || '';
      const mkXacNhan = mkXacNhanEl?.value || '';

      if (!mkMoi || !mkXacNhan) {
        if (hopLoi) {
          hopLoi.textContent = 'Vui lòng nhập đầy đủ mật khẩu mới và xác nhận mật khẩu.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      if (mkMoi.length < 6) {
        if (hopLoi) {
          hopLoi.textContent = 'Mật khẩu mới phải có tối thiểu 6 ký tự.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      if (mkMoi !== mkXacNhan) {
        if (hopLoi) {
          hopLoi.textContent = 'Mật khẩu xác nhận không trùng khớp.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      if (nutXacNhan) nutXacNhan.disabled = true;
      if (chuNut) chuNut.textContent = 'Đang lưu mật khẩu...';
      if (spinner) spinner.classList.remove('d-none');
      if (hopLoi) hopLoi.classList.add('d-none');

      try {
        const phanHoi = await fetch('/api/xac-thuc/dat-lai-mat-khau', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            email: emailHienTaiOtp,
            token_dat_lai: tokenDatLaiOtp,
            mat_khau_moi: mkMoi
          })
        });

        const ketQua = await phanHoi.json().catch(() => ({}));
        if (!phanHoi.ok || !ketQua.thanhCong) {
          if (hopLoi) {
            hopLoi.textContent = ketQua.loi || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.';
            hopLoi.classList.remove('d-none');
          }
          return;
        }

        if (bsModalQuenMk) bsModalQuenMk.hide();

        if (Toast) {
          Toast.fire({ icon: 'success', title: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập.' });
        }

        // Tự động điền email vào ô đăng nhập & focus ô mật khẩu
        if (oTaiKhoan) oTaiKhoan.value = emailHienTaiOtp;
        if (oMatKhau) {
          oMatKhau.value = '';
          oMatKhau.focus();
        }
      } catch (loi) {
        if (hopLoi) {
          hopLoi.textContent = 'Lỗi kết nối máy chủ khi đặt lại mật khẩu.';
          hopLoi.classList.remove('d-none');
        }
      } finally {
        if (nutXacNhan) nutXacNhan.disabled = false;
        if (chuNut) chuNut.textContent = 'Lưu mật khẩu mới';
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }

  function hienThiLoi(thongBao) {
    if (hopBaoLoi && noiDungLoi) {
      noiDungLoi.textContent = thongBao; // Gán qua textContent chống XSS tuyệt đối
      hopBaoLoi.classList.remove('d-none');
      hopBaoLoi.classList.add('d-flex');
    }
  }

  function anLoi() {
    if (hopBaoLoi) {
      hopBaoLoi.classList.add('d-none');
      hopBaoLoi.classList.remove('d-flex');
    }
  }

  function datTrangThaiDangXuLy(dangChay) {
    if (!nutDangNhap) return;
    nutDangNhap.disabled = dangChay;
    if (dangChay) {
      chuNut.textContent = 'Đang xác thực...';
      spinnerNut.classList.remove('d-none');
    } else {
      chuNut.textContent = 'Đăng nhập hệ thống';
      spinnerNut.classList.add('d-none');
    }
  }

  // 3. Xử lý gửi Form Đăng nhập
  if (bieuMauDangNhap) {
    bieuMauDangNhap.addEventListener('submit', async (suKien) => {
      suKien.preventDefault();
      anLoi();

      const taiKhoan = (oTaiKhoan.value || '').trim();
      const matKhau = oMatKhau.value || '';

      if (!taiKhoan || !matKhau) {
        hienThiLoi('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
        return;
      }

      datTrangThaiDangXuLy(true);

      try {
        const phanHoi = await fetch('/api/xac-thuc/dang-nhap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ tai_khoan: taiKhoan, mat_khau: matKhau })
        });

        const ketQua = await phanHoi.json().catch(() => ({}));

        if (phanHoi.ok && ketQua.thanhCong) {
          window.location.replace('/dashboard.html');
          return;
        }

        // Bắt các mã lỗi cụ thể từ Backend
        if (phanHoi.status === 429) {
          hienThiLoi(ketQua.loi || 'Tài khoản tạm thời bị khóa do nhập sai nhiều lần. Vui lòng thử lại sau.');
        } else if (phanHoi.status === 401) {
          hienThiLoi(ketQua.loi || 'Sai tên đăng nhập hoặc mật khẩu.');
        } else {
          hienThiLoi(ketQua.loi || 'Đăng nhập không thành công. Vui lòng kiểm tra lại.');
        }
      } catch (loiMang) {
        hienThiLoi('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.');
      } finally {
        datTrangThaiDangXuLy(false);
      }
    });
  }
});
