// public/js/dashboard.js - Logic điều phối Dashboard (Chống XSS 100%, Polling 20s, Khóa Lạc Quan 409)

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. BIẾN TRẠNG THÁI TOÀN CỤC (APPLICATION STATE)
  // =========================================================================
  let nguoiDungHienTai = null;
  let danhMucThietBiCache = [];
  let danhSachPhongCache = [];
  let danhSachKtvCache = [];
  let yeuCauDangXem = null;
  let thoiGianPollingInterval = null;

  const boLoc = {
    trang: 1,
    so_luong: 10,
    tu_khoa: '',
    trang_thai: '',
    muc_do_uu_tien: '',
    cua_toi: false
  };

  // Khởi tạo các Modal Bootstrap
  const modalChiTietEl = document.getElementById('modalChiTietYeuCau');
  const modalCapNhatEl = document.getElementById('modalCapNhatTrangThai');
  const modalPhanCongEl = document.getElementById('modalPhanCong');
  const modalNguoiDungEl = document.getElementById('modalNguoiDung');
  const modalDoiMatKhauEl = document.getElementById('modalDoiMatKhau');
  const modalXemAnhLonEl = document.getElementById('modalXemAnhLon');
  const modalPhongEl = document.getElementById('modalPhong');
  const toastThongBaoEl = document.getElementById('toastThongBao');

  const bsModalChiTiet = modalChiTietEl ? new bootstrap.Modal(modalChiTietEl) : null;
  const bsModalCapNhat = modalCapNhatEl ? new bootstrap.Modal(modalCapNhatEl) : null;
  const bsModalPhanCong = modalPhanCongEl ? new bootstrap.Modal(modalPhanCongEl) : null;
  const bsModalNguoiDung = modalNguoiDungEl ? new bootstrap.Modal(modalNguoiDungEl) : null;
  let bsModalDoiMatKhau = modalDoiMatKhauEl ? new bootstrap.Modal(modalDoiMatKhauEl) : null;
  const bsModalXemAnhLon = modalXemAnhLonEl ? new bootstrap.Modal(modalXemAnhLonEl) : null;
  const bsModalPhong = modalPhongEl ? new bootstrap.Modal(modalPhongEl) : null;
  const bsToast = toastThongBaoEl ? new bootstrap.Toast(toastThongBaoEl, { delay: 6000 }) : null;

  // DOM Elements
  const tabYeuCau = document.getElementById('tabYeuCau');
  const tabBaoCao = document.getElementById('tabBaoCao');
  const tabNhanSu = document.getElementById('tabNhanSu');
  const tabPhong = document.getElementById('tabPhong');
  const khuVucTabYeuCau = document.getElementById('khuVucTabYeuCau');
  const khuVucTabBaoCao = document.getElementById('khuVucTabBaoCao');
  const khuVucTabNhanSu = document.getElementById('khuVucTabNhanSu');
  const khuVucTabPhong = document.getElementById('khuVucTabPhong');
  const thanBangNhanSu = document.getElementById('thanBangNhanSu');
  const nutThemNhanSu = document.getElementById('nutThemNhanSu');
  const bieuMauNguoiDung = document.getElementById('bieuMauNguoiDung');
  const nutMoModalDoiMatKhau = document.getElementById('nutMoModalDoiMatKhau');
  const bieuMauDoiMatKhau = document.getElementById('bieuMauDoiMatKhau');
  const nutXuatCsv = document.getElementById('nutXuatCsv');

  // DOM Elements Tab 4 Quản lý Phòng học
  const thanBangPhong = document.getElementById('thanBangPhong');
  const timKiemPhong = document.getElementById('timKiemPhong');
  const locLoaiPhong = document.getElementById('locLoaiPhong');
  const locToaNha = document.getElementById('locToaNha');
  const nutThemPhong = document.getElementById('nutThemPhong');
  const nutXoaLocPhong = document.getElementById('nutXoaLocPhong');
  const demKetQuaPhong = document.getElementById('demKetQuaPhong');
  const thongTinPhanTrangPhong = document.getElementById('thongTinPhanTrangPhong');
  const nutTrangTruocPhong = document.getElementById('nutTrangTruocPhong');
  const soTrangHienTaiPhong = document.getElementById('soTrangHienTaiPhong');
  const nutTrangSauPhong = document.getElementById('nutTrangSauPhong');
  const tieuDeModalPhong = document.getElementById('tieuDeModalPhong');
  const bieuMauPhong = document.getElementById('bieuMauPhong');
  const phongHienTaiId = document.getElementById('phongHienTaiId');
  const nhapMaPhongChuan = document.getElementById('nhapMaPhongChuan');
  const nhapLoaiPhong = document.getElementById('nhapLoaiPhong');
  const xemTruocTenPhong = document.getElementById('xemTruocTenPhong');
  const xemTruocToaNha = document.getElementById('xemTruocToaNha');
  const xemTruocKhuVuc = document.getElementById('xemTruocKhuVuc');
  const xemTruocToaTang = document.getElementById('xemTruocToaTang');
  const hopLoiPhong = document.getElementById('hopLoiPhong');
  const nutLuuPhong = document.getElementById('nutLuuPhong');

  // Thẻ KPI Tab 4
  const kpiTongPhong = document.getElementById('kpiTongPhong');
  const kpiLyThuyet = document.getElementById('kpiLyThuyet');
  const kpiHoiTruong = document.getElementById('kpiHoiTruong');
  const kpiMayTinh = document.getElementById('kpiMayTinh');
  const kpiThiNghiem = document.getElementById('kpiThiNghiem');

  // Công cụ tìm kiếm & lọc đa trường cho Quản lý Nhân sự & Phân công
  const oTimKiemNhanSu = document.getElementById('oTimKiemNhanSu');
  const locVaiTroNhanSu = document.getElementById('locVaiTroNhanSu');
  const locTrangThaiNhanSu = document.getElementById('locTrangThaiNhanSu');
  const demKetQuaNhanSu = document.getElementById('demKetQuaNhanSu');
  const nutXoaLocNhanSu = document.getElementById('nutXoaLocNhanSu');
  const oTimKiemKtvPhanCong = document.getElementById('oTimKiemKtvPhanCong');

  function boDauTiengViet(chuoi) {
    if (!chuoi) return '';
    return chuoi
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  // =========================================================================
  // THƯ VIỆN THÔNG BÁO SWEETALERT2 (TOAST & MODAL XÁC NHẬN CHUYÊN NGHIỆP)
  // =========================================================================
  const Toast = (typeof Swal !== 'undefined') ? Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.onmouseenter = Swal.stopTimer;
      toast.onmouseleave = Swal.resumeTimer;
    }
  }) : null;

  function thongBaoThanhCong(tieuDe) {
    if (Toast) Toast.fire({ icon: 'success', title: tieuDe });
    else alert(tieuDe);
  }

  function thongBaoLoi(tieuDe) {
    if (Toast) Toast.fire({ icon: 'error', title: tieuDe });
    else alert(tieuDe);
  }

  function thongBaoCanhBao(tieuDe) {
    if (Toast) Toast.fire({ icon: 'warning', title: tieuDe });
    else alert(tieuDe);
  }

  async function xacNhanHanhDong({ tieuDe, noiDung = '', nutDongY = 'Xác nhận', nutHuy = 'Hủy', loai = 'question' }) {
    if (typeof Swal !== 'undefined') {
      const ketQua = await Swal.fire({
        title: tieuDe,
        text: noiDung,
        icon: loai,
        showCancelButton: true,
        confirmButtonColor: '#2563EB',
        cancelButtonColor: '#6B7280',
        confirmButtonText: nutDongY,
        cancelButtonText: nutHuy,
        reverseButtons: true,
        customClass: {
          popup: 'rounded-4 shadow-lg'
        }
      });
      return ketQua.isConfirmed;
    }
    return confirm(noiDung ? `${tieuDe}\n${noiDung}` : tieuDe);
  }

  const tenNguoiDungEl = document.getElementById('tenNguoiDung');
  const nhanVaiTroEl = document.getElementById('nhanVaiTro');
  const avatarChuCaiEl = document.getElementById('avatarChuCai');
  const nutDangXuat = document.getElementById('nutDangXuat');
  const nutLamMoi = document.getElementById('nutLamMoi');

  const locTuKhoa = document.getElementById('locTuKhoa');
  const locTrangThai = document.getElementById('locTrangThai');
  const locMucUuTien = document.getElementById('locMucUuTien');
  const locCuaToi = document.getElementById('locCuaToi');
  const nutDatLaiLoc = document.getElementById('nutDatLaiLoc');

  const thanBangYeuCau = document.getElementById('thanBangYeuCau');
  const vungDuLieuRong = document.getElementById('vungDuLieuRong');
  const thongTinTrang = document.getElementById('thongTinTrang');
  const danhSachSoTrang = document.getElementById('danhSachSoTrang');

  // Đếm nhanh
  const demTongSo = document.getElementById('demTongSo');
  const demChoXuLy = document.getElementById('demChoXuLy');
  const demDangXuLy = document.getElementById('demDangXuLy');
  const demHoanThanh = document.getElementById('demHoanThanh');

  // Templates
  const mauDongYeuCau = document.getElementById('mauDongYeuCau');
  const mauMucLichSu = document.getElementById('mauMucLichSu');
  const mauThanhThongKe = document.getElementById('mauThanhThongKe');

  // =========================================================================
  // 2. HÀM TIỆN ÍCH ĐỊNH DẠNG (FORMATTERS)
  // =========================================================================
  function dinhDangNgayGio(chuoiNgay) {
    if (!chuoiNgay) return '-';
    try {
      const d = new Date(chuoiNgay);
      if (Number.isNaN(d.getTime())) return '-';
      const ngay = String(d.getDate()).padStart(2, '0');
      const thang = String(d.getMonth() + 1).padStart(2, '0');
      const nam = d.getFullYear();
      const gio = String(d.getHours()).padStart(2, '0');
      const phut = String(d.getMinutes()).padStart(2, '0');
      return `${ngay}/${thang}/${nam} ${gio}:${phut}`;
    } catch {
      return '-';
    }
  }

  function dinhDangNgayGioNgan(chuoiNgay) {
    if (!chuoiNgay) return '-';
    try {
      const d = new Date(chuoiNgay);
      if (Number.isNaN(d.getTime())) return '-';
      const ngay = String(d.getDate()).padStart(2, '0');
      const thang = String(d.getMonth() + 1).padStart(2, '0');
      const gio = String(d.getHours()).padStart(2, '0');
      const phut = String(d.getMinutes()).padStart(2, '0');
      return `${ngay}/${thang} ${gio}:${phut}`;
    } catch {
      return '-';
    }
  }

  function taoSoftRoleBadge(nguoiBao, maZalo, laModal = false) {
    const wrap = document.createElement('div');
    wrap.className = 'd-inline-flex align-items-center gap-1';

    if (nguoiBao) {
      const email = (nguoiBao.email || '').toLowerCase();
      const hoTen = nguoiBao.ho_ten || 'Người dùng';
      const laGv = nguoiBao.vai_tro === 'GIANG_VIEN' || (email.endsWith('@tvu.edu.vn') && !email.endsWith('@st.tvu.edu.vn'));
      const laSv = nguoiBao.vai_tro === 'SINH_VIEN' || email.endsWith('@st.tvu.edu.vn') || /^\d{8,}@/.test(email);

      const badge = document.createElement('span');
      if (laGv) {
        badge.className = 'badge-role-gv';
        badge.textContent = laModal ? 'Giảng viên' : 'GV';
      } else if (laSv) {
        badge.className = 'badge-role-sv';
        badge.textContent = laModal ? 'Sinh viên' : 'SV';
      } else {
        badge.className = 'badge-role-zalo';
        badge.textContent = nguoiBao.vai_tro || 'Người báo';
      }

      wrap.appendChild(badge);

      if (laModal) {
        const spanTen = document.createElement('strong');
        spanTen.className = 'text-dark ms-1';
        spanTen.textContent = hoTen;
        wrap.appendChild(spanTen);

        if (nguoiBao.email) {
          const spanEmail = document.createElement('span');
          spanEmail.className = 'small text-muted ms-1';
          spanEmail.textContent = `(${nguoiBao.email})`;
          wrap.appendChild(spanEmail);
        }
      } else {
        const spanDinhDanh = document.createElement('span');
        spanDinhDanh.className = 'text-truncate font-mono small text-secondary';
        spanDinhDanh.style.maxWidth = '170px';
        const phanTruocAt = nguoiBao.email ? nguoiBao.email.split('@')[0] : (nguoiBao.tai_khoan || hoTen);
        spanDinhDanh.textContent = phanTruocAt;
        spanDinhDanh.title = `${hoTen} (${nguoiBao.email || nguoiBao.tai_khoan || ''})`;
        wrap.appendChild(spanDinhDanh);
      }
      return wrap;
    }

    if (maZalo) {
      const badge = document.createElement('span');
      badge.className = 'badge-role-zalo';
      const rutGon = maZalo.length > 8 ? `${maZalo.slice(0, 6)}...` : maZalo;
      badge.textContent = `Zalo • ${rutGon}`;
      badge.title = `Zalo Chat ID: ${maZalo}`;
      wrap.appendChild(badge);
      return wrap;
    }

    const badge = document.createElement('span');
    badge.className = 'badge-role-zalo';
    badge.textContent = 'Hệ thống';
    wrap.appendChild(badge);
    return wrap;
  }

  function taoPlaceholderAnh() {
    const box = document.createElement('div');
    box.className = 'anh-placeholder-bang';
    box.title = 'Không có ảnh đính kèm';
    box.innerHTML = `
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
    `;
    return box;
  }

  function moLightbox(urlAnh, thongTin = {}) {
    if (!urlAnh || typeof urlAnh !== 'string' || !urlAnh.startsWith('https://')) return;
    const img = document.getElementById('anhLonLightbox');
    const chuThich = document.getElementById('chuThichLightbox');
    const linkTabMoi = document.getElementById('linkLightboxTabMoi');

    if (img) img.src = urlAnh;
    if (linkTabMoi) linkTabMoi.href = urlAnh;
    if (chuThich) {
      chuThich.replaceChildren();
      if (thongTin.maYeuCau) {
        const spanMa = document.createElement('strong');
        spanMa.className = 'font-mono text-warning me-2';
        spanMa.textContent = thongTin.maYeuCau;
        chuThich.appendChild(spanMa);
      }
      const spanMoTa = document.createElement('span');
      const phanThietBi = thongTin.tenThietBi ? `${thongTin.tenThietBi}` : '';
      const phanPhong = thongTin.phong ? ` — ${thongTin.phong}` : '';
      spanMoTa.textContent = `${phanThietBi}${phanPhong}`;
      chuThich.appendChild(spanMoTa);
    }

    if (bsModalXemAnhLon) {
      bsModalXemAnhLon.show();
    }
  }

  function layNhanTrangThai(trangThai) {
    switch (trangThai) {
      case 'CHO_XU_LY':
        return { chu: 'Chờ tiếp nhận', lop: 'cho-xu-ly' };
      case 'DANG_XU_LY':
        return { chu: 'Đang xử lý', lop: 'dang-xu-ly' };
      case 'HOAN_THANH':
        return { chu: 'Đã hoàn thành', lop: 'hoan-thanh' };
      case 'HUY':
        return { chu: 'Đã hủy', lop: 'da-huy' };
      default:
        return { chu: trangThai || 'Không rõ', lop: 'cho-xu-ly' };
    }
  }

  function layNhanMucUuTien(mucUuTien) {
    switch (mucUuTien) {
      case 'KHAN_CAP':
        return { chu: 'Khẩn cấp', style: 'color: var(--ut-khan-cap); background: #FEE2E2; border: 1px solid #FECACA;' };
      case 'CAO':
        return { chu: 'Cao', style: 'color: var(--ut-cao); background: #FEF3C7; border: 1px solid #FDE68A;' };
      case 'BINH_THUONG':
        return { chu: 'Bình thường', style: 'color: var(--ut-binh-thuong); background: #F1F5F9; border: 1px solid #E2E8F0;' };
      case 'THAP':
        return { chu: 'Thấp', style: 'color: var(--ut-thap); background: #F8FAFC; border: 1px solid #CBD5E1;' };
      default:
        return { chu: 'Bình thường', style: 'color: var(--ut-binh-thuong); background: #F1F5F9; border: 1px solid #E2E8F0;' };
    }
  }

  function layHaiChuCaiDau(hoTen) {
    if (!hoTen) return 'NV';
    const tu = hoTen.trim().split(/\s+/);
    if (tu.length === 1) return tu[0].slice(0, 2).toUpperCase();
    return (tu[0][0] + tu[tu.length - 1][0]).toUpperCase();
  }

  // =========================================================================
  // 3. TOAST THÔNG BÁO XUNG ĐỘT KHÓA LẠC QUAN (HTTP 409 CONFLICT)
  // =========================================================================
  function hienThiToastXungDot(thongBao) {
    // Đóng toàn bộ Modal đang mở để tránh ghi đè dữ liệu cũ
    if (bsModalChiTiet) bsModalChiTiet.hide();
    if (bsModalCapNhat) bsModalCapNhat.hide();
    if (bsModalPhanCong) bsModalPhanCong.hide();

    const toastNoiDung = document.getElementById('toastNoiDung');
    if (toastNoiDung) {
      toastNoiDung.textContent = thongBao || 'Dữ liệu vừa được cập nhật bởi cán bộ khác. Hệ thống đã tự động làm mới danh sách.';
    }

    if (bsToast) bsToast.show();

    // Tự động tải lại danh sách mới nhất
    taiDanhSachYeuCau();
  }

  const nutToastTaiLai = document.getElementById('nutToastTaiLai');
  if (nutToastTaiLai) {
    nutToastTaiLai.addEventListener('click', () => {
      taiDanhSachYeuCau();
      if (bsToast) bsToast.hide();
    });
  }

  // =========================================================================
  // 4. LẤY THÔNG TIN TÀI KHOẢN & PHÂN QUYỀN GIAO DIỆN
  // =========================================================================
  async function taiThongTinNguoiDung() {
    try {
      const phanHoi = await fetch('/api/xac-thuc/thong-tin-ca-nhan', {
        headers: { 'Accept': 'application/json' }
      });

      if (!phanHoi.ok) {
        window.location.replace('/index.html');
        return;
      }

      const ketQua = await phanHoi.json();
      nguoiDungHienTai = ketQua.duLieu;

      if (tenNguoiDungEl) tenNguoiDungEl.textContent = nguoiDungHienTai.ho_ten || nguoiDungHienTai.tai_khoan;
      if (avatarChuCaiEl) avatarChuCaiEl.textContent = layHaiChuCaiDau(nguoiDungHienTai.ho_ten || 'NV');

      const laAdmin = nguoiDungHienTai.vai_tro === 'ADMIN';
      if (nhanVaiTroEl) {
        nhanVaiTroEl.textContent = laAdmin ? 'Quản trị viên' : 'Kỹ thuật viên';
        nhanVaiTroEl.className = laAdmin ? 'badge bg-primary-subtle text-primary border border-primary-subtle' : 'badge bg-light text-secondary border';
      }

      // Phân quyền Tab Báo cáo & Tab Nhân sự
      if (tabBaoCao) {
        if (laAdmin) {
          tabBaoCao.classList.remove('d-none');
        } else {
          tabBaoCao.classList.add('d-none');
        }
      }

      if (tabNhanSu) {
        if (laAdmin) {
          tabNhanSu.classList.remove('d-none');
        } else {
          tabNhanSu.classList.add('d-none');
        }
      }

      if (tabPhong) {
        if (laAdmin) {
          tabPhong.classList.remove('d-none');
        } else {
          tabPhong.classList.add('d-none');
        }
      }

      // Quyền phân công trong Modal được điều khiển động theo từng yêu cầu tại moModalChiTiet

      // Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên
      if (nguoiDungHienTai.doi_mat_khau_lan_dau) {
        moModalDoiMatKhau(true);
      }
    } catch (loi) {
      console.error('Lỗi lấy thông tin người dùng:', loi);
      window.location.replace('/index.html');
    }
  }

  // =========================================================================
  // 5. LẤY DANH MỤC THIẾT BỊ, PHÒNG & KỸ THUẬT VIÊN
  // =========================================================================
  async function taiDanhMucHeThong() {
    try {
      const phanHoi = await fetch('/api/danh-muc', {
        headers: { 'Accept': 'application/json' }
      });
      if (!phanHoi.ok) return;

      const ketQua = await phanHoi.json();
      danhMucThietBiCache = ketQua.duLieu?.danhMucThietBi || [];
      danhSachPhongCache = ketQua.duLieu?.danhSachPhong || [];
      danhSachKtvCache = ketQua.duLieu?.danhSachKtv || [];

      // Cập nhật ô chọn KTV phân công
      const phanCongMaKtv = document.getElementById('phanCongMaKtv');
      if (phanCongMaKtv) {
        // Nếu là Admin, ưu tiên lấy danh sách KTV hoạt động từ API người dùng
        if (nguoiDungHienTai?.vai_tro === 'ADMIN') {
          try {
            const resKtv = await fetch('/api/nguoi-dung?vai_tro=KTV&trang_thai_hoat_dong=true');
            if (resKtv.ok) {
              const dataKtv = await resKtv.json();
              if (Array.isArray(dataKtv.duLieu)) {
                danhSachKtvCache = dataKtv.duLieu;
              }
            }
          } catch (_) {}
        }

        renderDanhSachKtvPhanCong();
      }
    } catch (loi) {
      console.warn('Lỗi lấy danh mục hệ thống:', loi);
    }
  }

  function renderDanhSachKtvPhanCong(tuKhoaLoc = '', maKtvDaChon = null) {
    const phanCongMaKtv = document.getElementById('phanCongMaKtv');
    if (!phanCongMaKtv) return;
    const giaTriHienTai = maKtvDaChon !== null && maKtvDaChon !== '' ? String(maKtvDaChon) : phanCongMaKtv.value;
    const tuKhoaKd = boDauTiengViet(String(tuKhoaLoc || '').trim()).toLowerCase();

    phanCongMaKtv.innerHTML = '<option value="">-- Chọn kỹ thuật viên --</option>';
    const ktvLoc = danhSachKtvCache.filter((ktv) => {
      if (!tuKhoaKd) return true;
      const hoTen = boDauTiengViet(ktv.ho_ten || '').toLowerCase();
      const email = boDauTiengViet(ktv.email || '').toLowerCase();
      const sdt = boDauTiengViet(ktv.so_dien_thoai || '').toLowerCase();
      const taiKhoan = boDauTiengViet(ktv.tai_khoan || '').toLowerCase();
      return hoTen.includes(tuKhoaKd) || email.includes(tuKhoaKd) || sdt.includes(tuKhoaKd) || taiKhoan.includes(tuKhoaKd);
    });

    ktvLoc.forEach((ktv) => {
      const opt = document.createElement('option');
      opt.value = ktv.ma_nguoi_dung;
      const sdtHienThi = ktv.so_dien_thoai ? ` - SĐT: ${ktv.so_dien_thoai}` : '';
      opt.textContent = `${ktv.ho_ten} (${ktv.email || ktv.tai_khoan || 'KTV'}${sdtHienThi})`;
      if (String(ktv.ma_nguoi_dung) === giaTriHienTai) {
        opt.selected = true;
      }
      phanCongMaKtv.appendChild(opt);
    });
  }

  // =========================================================================
  // 6. LẤY & HIỂN THỊ DANH SÁCH YÊU CẦU BÁO HỎNG (CHỐNG XSS 100%)
  // =========================================================================
  async function taiDanhSachYeuCau() {
    try {
      const thamSo = new URLSearchParams();
      thamSo.append('trang', boLoc.trang);
      thamSo.append('so_luong', boLoc.so_luong);
      if (boLoc.tu_khoa) thamSo.append('tu_khoa', boLoc.tu_khoa);
      if (boLoc.trang_thai) thamSo.append('trang_thai', boLoc.trang_thai);
      if (boLoc.muc_do_uu_tien) thamSo.append('muc_do_uu_tien', boLoc.muc_do_uu_tien);
      if (boLoc.cua_toi) thamSo.append('cua_toi', 'true');

      const phanHoi = await fetch(`/api/yeu-cau?${thamSo.toString()}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (phanHoi.status === 401) {
        window.location.replace('/index.html');
        return;
      }

      if (!phanHoi.ok) return;

      const ketQua = await phanHoi.json();
      const danhSach = ketQua.duLieu || [];
      const tongSo = ketQua.tongSo || 0;
      const soTrang = Math.max(1, ketQua.soTrang || Math.ceil(tongSo / boLoc.so_luong) || 1);

      // Nếu trang hiện tại vượt quá tổng số trang hợp lệ do vừa lọc bớt dữ liệu, tự động quay lại trang cuối
      if (boLoc.trang > soTrang && tongSo > 0) {
        boLoc.trang = soTrang;
        taiDanhSachYeuCau();
        return;
      }

      // Cập nhật thẻ tổng số
      if (demTongSo) demTongSo.textContent = tongSo;

      // Render các dòng trên bảng bằng template
      hienThiBangYeuCau(danhSach);

      // Cập nhật phân trang
      hienThiPhanTrang(tongSo, soTrang);

      // Tải kèm thống kê tóm tắt 4 thẻ số lượng (nếu là Admin thì gọi nhẹ)
      taiThongKeSoLuongNhanh();
    } catch (loi) {
      console.error('Lỗi nạp danh sách yêu cầu:', loi);
    }
  }

  function hienThiBangYeuCau(danhSach) {
    if (!thanBangYeuCau) return;
    thanBangYeuCau.innerHTML = '';

    if (!danhSach || danhSach.length === 0) {
      if (vungDuLieuRong) vungDuLieuRong.classList.remove('d-none');
      return;
    }

    if (vungDuLieuRong) vungDuLieuRong.classList.add('d-none');

    danhSach.forEach((yc) => {
      const clone = mauDongYeuCau.content.cloneNode(true);
      const tr = clone.querySelector('tr');

      // 1. Mã YC & Người báo
      const dongMaYc = clone.querySelector('.dong-ma-yc');
      const dongThoiGian = clone.querySelector('.dong-thoi-gian-tao');
      dongMaYc.textContent = yc.ma_yeu_cau || `#${yc.ma_yeu_cau_bao_hong}`;
      dongThoiGian.textContent = dinhDangNgayGioNgan(yc.thoi_gian_tao);

      const dongNguoiBao = clone.querySelector('.dong-nguoi-bao');
      if (dongNguoiBao) {
        dongNguoiBao.replaceChildren(taoSoftRoleBadge(yc.nguoi_bao, yc.ma_nguoi_bao_zalo, false));
      }

      // 2. Thiết bị & Ảnh (Bố cục flex ngang, chống lặp danh mục)
      const dongHopAnh = clone.querySelector('.dong-hop-anh');
      if (dongHopAnh) {
        if (yc.duong_dan_anh && typeof yc.duong_dan_anh === 'string' && yc.duong_dan_anh.startsWith('https://')) {
          const img = document.createElement('img');
          img.className = 'anh-thumbnail-bang';
          img.src = yc.duong_dan_anh;
          img.alt = yc.ten_thiet_bi || 'Ảnh hiện trường';
          img.loading = 'lazy';
          img.title = 'Bấm để xem ảnh hiện trường';
          img.onclick = (e) => {
            e.stopPropagation();
            moLightbox(yc.duong_dan_anh, {
              maYeuCau: yc.ma_yeu_cau || `#${yc.ma_yeu_cau_bao_hong}`,
              tenThietBi: yc.ten_thiet_bi,
              phong: (yc.phong_hoc ? yc.phong_hoc.ten_phong : yc.vi_tri_phong) || ''
            });
          };
          img.onerror = () => {
            img.replaceWith(taoPlaceholderAnh());
          };
          dongHopAnh.appendChild(img);
        } else {
          dongHopAnh.appendChild(taoPlaceholderAnh());
        }
      }

      const dongTenThietBi = clone.querySelector('.dong-ten-thiet-bi');
      const dongTenDanhMuc = clone.querySelector('.dong-ten-danh-muc');
      const tenTb = (yc.ten_thiet_bi || 'Thiết bị chưa đặt tên').trim();
      dongTenThietBi.textContent = tenTb;

      const tenDm = (yc.danh_muc ? yc.danh_muc.ten_loai : '').trim();
      if (tenDm && !tenTb.toLowerCase().includes(tenDm.toLowerCase())) {
        dongTenDanhMuc.textContent = tenDm;
        dongTenDanhMuc.classList.remove('d-none');
      } else {
        dongTenDanhMuc.textContent = '';
        dongTenDanhMuc.classList.add('d-none');
      }

      // 3. Vị trí / Phòng & Mức ưu tiên
      const dongViTriPhong = clone.querySelector('.dong-vi-tri-phong');
      dongViTriPhong.textContent = (yc.phong_hoc ? yc.phong_hoc.ten_phong : yc.vi_tri_phong) || 'Chưa rõ vị trí';

      const dongMucUuTien = clone.querySelector('.dong-muc-uu-tien');
      const utInfo = layNhanMucUuTien(yc.muc_do_uu_tien);
      dongMucUuTien.textContent = utInfo.chu;
      if (yc.muc_do_uu_tien === 'BINH_THUONG') {
        dongMucUuTien.className = 'dong-muc-uu-tien badge bg-light text-secondary border';
        dongMucUuTien.style = 'font-size: 11px; font-weight: 500;';
      } else {
        dongMucUuTien.className = 'dong-muc-uu-tien badge';
        dongMucUuTien.style = utInfo.style;
      }

      // 4. Trạng thái (Pastel Badge)
      const dongTrangThai = clone.querySelector('.dong-trang-thai');
      const chuTrangThai = clone.querySelector('.chu-trang-thai');
      const ttInfo = layNhanTrangThai(yc.trang_thai);
      dongTrangThai.className = `dong-trang-thai huy-hieu-tt ${ttInfo.lop}`;
      chuTrangThai.textContent = ttInfo.chu;

      // 5. KTV phụ trách
      const dongKtv = clone.querySelector('.dong-ktv-phu-trach');
      if (yc.ky_thuat_vien) {
        dongKtv.textContent = yc.ky_thuat_vien.ho_ten;
        dongKtv.className = 'dong-ktv-phu-trach fw-semibold text-dark';
      } else {
        dongKtv.textContent = 'Chưa phân công';
        dongKtv.className = 'dong-ktv-phu-trach text-muted fst-italic';
      }

      // 6. Thao tác (Tối đa 2 nút)
      const nutThaoTacChinh = clone.querySelector('.nut-thao-tac-chinh');
      const nutXemChiTiet = clone.querySelector('.nut-xem-chi-tiet');

      // Nút 1: Hành động chính theo ngữ cảnh
      if (yc.trang_thai === 'CHO_XU_LY') {
        nutThaoTacChinh.textContent = 'Tiếp nhận';
        nutThaoTacChinh.className = 'nut-thao-tac-chinh btn-chinh';
        nutThaoTacChinh.onclick = () => xuLyTiepNhanNhanh(yc);
      } else if (yc.trang_thai === 'DANG_XU_LY') {
        const laAdmin = nguoiDungHienTai?.vai_tro === 'ADMIN';
        const laNguoiPhuTrach = yc.ma_ky_thuat_vien === nguoiDungHienTai?.ma_nguoi_dung;
        if (laAdmin || laNguoiPhuTrach) {
          nutThaoTacChinh.textContent = 'Hoàn thành';
          nutThaoTacChinh.className = 'nut-thao-tac-chinh btn btn-sm btn-success d-inline-flex align-items-center gap-1';
          nutThaoTacChinh.onclick = () => moModalCapNhat(yc, 'HOAN_THANH');
        } else {
          nutThaoTacChinh.classList.add('d-none');
        }
      } else {
        nutThaoTacChinh.classList.add('d-none');
      }

      // Nút 2: Xem chi tiết (Mở Modal 2 cột)
      nutXemChiTiet.onclick = () => moModalChiTiet(yc.ma_yeu_cau_bao_hong);

      thanBangYeuCau.appendChild(tr);
    });
  }

  // Hiển thị phân trang 10 lượt / trang chuẩn Bootstrap 5 Pure Light Mode
  function hienThiPhanTrang(tongSo, soTrang) {
    if (!danhSachSoTrang || !thongTinTrang) return;

    if (tongSo === 0) {
      thongTinTrang.textContent = 'Không có yêu cầu báo hỏng nào phù hợp.';
      danhSachSoTrang.replaceChildren();
      return;
    }

    const batDau = (boLoc.trang - 1) * boLoc.so_luong + 1;
    const ketThuc = Math.min(boLoc.trang * boLoc.so_luong, tongSo);
    thongTinTrang.replaceChildren();
    const span1 = document.createTextNode('Hiển thị từ ');
    const sBatDau = document.createElement('strong');
    sBatDau.textContent = batDau;
    const span2 = document.createTextNode(' đến ');
    const sKetThuc = document.createElement('strong');
    sKetThuc.textContent = ketThuc;
    const span3 = document.createTextNode(' trên tổng số ');
    const sTongSo = document.createElement('strong');
    sTongSo.textContent = tongSo;
    const span4 = document.createTextNode(' lượt yêu cầu (Trang ');
    const sTrang = document.createElement('strong');
    sTrang.textContent = `${boLoc.trang}/${soTrang}`;
    const span5 = document.createTextNode(')');
    thongTinTrang.append(span1, sBatDau, span2, sKetThuc, span3, sTongSo, span4, sTrang, span5);

    danhSachSoTrang.replaceChildren();

    const taoNutTrang = (nhan, trangDich, biKhoa = false, dangChon = false) => {
      const li = document.createElement('li');
      li.className = `page-item ${biKhoa ? 'disabled' : ''} ${dangChon ? 'active' : ''}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'page-link';
      btn.textContent = nhan;
      if (!biKhoa && !dangChon) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          boLoc.trang = trangDich;
          taiDanhSachYeuCau();
        });
      }
      li.appendChild(btn);
      return li;
    };

    // Nút « Trước
    danhSachSoTrang.appendChild(taoNutTrang('« Trước', boLoc.trang - 1, boLoc.trang <= 1));

    // Hiển thị tối đa 5 nút số trang quanh trang hiện tại
    const trangDau = Math.max(1, boLoc.trang - 2);
    const trangCuoi = Math.min(soTrang, trangDau + 4);
    const trangDauThucTe = Math.max(1, trangCuoi - 4);

    for (let i = trangDauThucTe; i <= trangCuoi; i++) {
      danhSachSoTrang.appendChild(taoNutTrang(String(i), i, false, i === boLoc.trang));
    }

    // Nút Sau »
    danhSachSoTrang.appendChild(taoNutTrang('Sau »', boLoc.trang + 1, boLoc.trang >= soTrang));
  }

  // Tải số lượng 4 thẻ đếm nhanh
  async function taiThongKeSoLuongNhanh() {
    if (nguoiDungHienTai?.vai_tro !== 'ADMIN') return;
    try {
      const phanHoi = await fetch('/api/thong-ke');
      if (phanHoi.ok) {
        const kq = await phanHoi.json();
        const tq = kq.duLieu?.tongQuan;
        if (tq) {
          if (demTongSo) demTongSo.textContent = tq.tongSo;
          if (demChoXuLy) demChoXuLy.textContent = tq.choXuLy;
          if (demDangXuLy) demDangXuLy.textContent = tq.dangXuLy;
          if (demHoanThanh) demHoanThanh.textContent = tq.hoanThanh;
        }
      }
    } catch {}
  }
  const taiThongKeDashboard = taiThongKeSoLuongNhanh;

  // =========================================================================
  // 7. XỬ LÝ TIẾP NHẬN & HOÀN THÀNH (BẢO VỆ KHÓA LẠC QUAN HTTP 409)
  // =========================================================================
  async function xuLyTiepNhanNhanh(yc) {
    const dongY = await xacNhanHanhDong({
      tieuDe: 'Tiếp nhận sự cố?',
      noiDung: `Mã yêu cầu: ${yc.ma_yeu_cau}`,
      nutDongY: 'Tiếp nhận',
      loai: 'question'
    });
    if (!dongY) return;

    let phanHoi;
    try {
      phanHoi = await fetch(`/api/yeu-cau/${yc.ma_yeu_cau_bao_hong}/trang-thai`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          trang_thai_moi: 'DANG_XU_LY',
          ghi_chu_ket_qua: 'Kỹ thuật viên tiếp nhận xử lý sự cố'
        })
      });
    } catch (loiMang) {
      console.error('Lỗi kết nối khi tiếp nhận:', loiMang);
      thongBaoLoi('Lỗi kết nối máy chủ');
      return;
    }

    if (phanHoi.status === 409) {
      const kq = await phanHoi.json().catch(() => ({}));
      hienThiToastXungDot(kq.loi);
      return;
    }

    if (!phanHoi.ok) {
      const kq = await phanHoi.json().catch(() => ({}));
      thongBaoLoi(kq.loi || 'Không thể tiếp nhận');
      return;
    }

    // Thành công -> Thông báo ngắn gọn và làm mới danh sách
    thongBaoThanhCong('Đã tiếp nhận yêu cầu');
    try {
      await taiDanhSachYeuCau();
      await taiThongKeSoLuongNhanh();
    } catch (e) {
      console.warn('Lỗi làm mới sau tiếp nhận:', e);
    }
  }

  // =========================================================================
  // 8. MODAL CHI TIẾT YÊU CẦU (BỐ CỤC 2 CỘT TINH GỌN, KHÔNG CUỘN THỪA)
  // =========================================================================
  async function moModalChiTiet(maYcBaoHong) {
    try {
      const phanHoi = await fetch(`/api/yeu-cau/${maYcBaoHong}`);
      if (!phanHoi.ok) return;

      const ketQua = await phanHoi.json();
      yeuCauDangXem = ketQua.duLieu;
      if (!yeuCauDangXem) return;

      // 1. Header Modal: Gộp Mã YC + Trạng thái + Mức ưu tiên
      document.getElementById('chiTietMaYc').textContent = yeuCauDangXem.ma_yeu_cau || `#${yeuCauDangXem.ma_yeu_cau_bao_hong}`;
      
      const badgeTrangThai = document.getElementById('chiTietTrangThaiBadge');
      const ttInfo = layNhanTrangThai(yeuCauDangXem.trang_thai);
      badgeTrangThai.className = `huy-hieu-tt ${ttInfo.lop}`;
      badgeTrangThai.textContent = ttInfo.chu;

      const badgeMucUt = document.getElementById('chiTietMucUuTienBadge');
      if (badgeMucUt) {
        const utInfo = layNhanMucUuTien(yeuCauDangXem.muc_do_uu_tien);
        badgeMucUt.textContent = utInfo.chu;
        if (yeuCauDangXem.muc_do_uu_tien === 'BINH_THUONG') {
          badgeMucUt.className = 'badge bg-light text-secondary border';
          badgeMucUt.style = 'font-size: 11px; font-weight: 500;';
        } else {
          badgeMucUt.className = 'badge';
          badgeMucUt.style = utInfo.style;
        }
      }

      const ktvTen = yeuCauDangXem.ky_thuat_vien ? yeuCauDangXem.ky_thuat_vien.ho_ten : 'Chưa phân công';
      const thongTinPhuEl = document.getElementById('chiTietThongTinPhu');
      if (thongTinPhuEl) {
        thongTinPhuEl.textContent = `Tạo lúc: ${dinhDangNgayGio(yeuCauDangXem.thoi_gian_tao)} • KTV phụ trách: ${ktvTen}`;
      }

      // 2. Cột trái: Khối thông tin nhanh 2 cột (Chống XSS 100%)
      const chiTietNguoiBaoEl = document.getElementById('chiTietNguoiBao');
      if (chiTietNguoiBaoEl) {
        chiTietNguoiBaoEl.replaceChildren(taoSoftRoleBadge(yeuCauDangXem.nguoi_bao, yeuCauDangXem.ma_nguoi_bao_zalo, true));
      }

      document.getElementById('chiTietViTriPhong').textContent = (yeuCauDangXem.phong_hoc ? yeuCauDangXem.phong_hoc.ten_phong : yeuCauDangXem.vi_tri_phong) || '-';

      const tenTbModal = (yeuCauDangXem.ten_thiet_bi || '-').trim();
      document.getElementById('chiTietTenThietBi').textContent = tenTbModal;
      const badgeDanhMuc = document.getElementById('chiTietDanhMucBadge');
      if (badgeDanhMuc) {
        const tenDmModal = (yeuCauDangXem.danh_muc ? yeuCauDangXem.danh_muc.ten_loai : '').trim();
        if (tenDmModal && !tenTbModal.toLowerCase().includes(tenDmModal.toLowerCase())) {
          badgeDanhMuc.textContent = tenDmModal;
          badgeDanhMuc.classList.remove('d-none');
        } else {
          badgeDanhMuc.textContent = '';
          badgeDanhMuc.classList.add('d-none');
        }
      }

      const ktvEl = document.getElementById('chiTietKtvPhuTrach');
      if (ktvEl) {
        ktvEl.textContent = ktvTen;
        if (yeuCauDangXem.ky_thuat_vien) {
          ktvEl.className = 'fw-bold text-dark mt-1';
        } else {
          ktvEl.className = 'text-muted fst-italic mt-1';
        }
      }

      // Mô tả sự cố (Tự co giãn, không min-height thừa)
      document.getElementById('chiTietMoTaLoi').textContent = yeuCauDangXem.moTaLoi || yeuCauDangXem.mo_ta_loi || 'Không có mô tả chi tiết';

      // Ghi chú kết quả KTV / Lý do hủy (Chỉ hiện khi có dữ liệu)
      const khungGhiChu = document.getElementById('khungGhiChuKetQua');
      const tieuDeGhiChu = document.getElementById('tieuDeGhiChuKetQua');
      const chiTietGhiChu = document.getElementById('chiTietGhiChuKetQua');
      if (yeuCauDangXem.ghi_chu_ket_qua && yeuCauDangXem.ghi_chu_ket_qua.trim() !== '') {
        chiTietGhiChu.textContent = yeuCauDangXem.ghi_chu_ket_qua;
        if (yeuCauDangXem.trang_thai === 'HOAN_THANH') {
          if (tieuDeGhiChu) tieuDeGhiChu.textContent = 'Ghi chú kết quả của KTV:';
          chiTietGhiChu.className = 'khung-ket-qua-hoanthanh';
        } else if (yeuCauDangXem.trang_thai === 'HUY') {
          if (tieuDeGhiChu) tieuDeGhiChu.textContent = 'Lý do hủy yêu cầu:';
          chiTietGhiChu.className = 'khung-ket-qua-huy';
        } else {
          if (tieuDeGhiChu) tieuDeGhiChu.textContent = 'Ghi chú xử lý:';
          chiTietGhiChu.className = 'p-2 rounded bg-light border small text-secondary';
        }
        khungGhiChu.classList.remove('d-none');
      } else {
        khungGhiChu.classList.add('d-none');
      }

      // Hình ảnh hiện trường (Bấm mở Lightbox, xử lý URL Cloudinary hợp lệ)
      const khungCoAnh = document.getElementById('khungCoAnh');
      const khungKhongAnh = document.getElementById('khungKhongAnh');
      const chiTietHinhAnh = document.getElementById('chiTietHinhAnh');
      const linkAnhGoc = document.getElementById('linkAnhGoc');

      if (yeuCauDangXem.duong_dan_anh && typeof yeuCauDangXem.duong_dan_anh === 'string' && yeuCauDangXem.duong_dan_anh.startsWith('https://')) {
        chiTietHinhAnh.src = yeuCauDangXem.duong_dan_anh;
        chiTietHinhAnh.onclick = () => {
          moLightbox(yeuCauDangXem.duong_dan_anh, {
            maYeuCau: yeuCauDangXem.ma_yeu_cau || `#${yeuCauDangXem.ma_yeu_cau_bao_hong}`,
            tenThietBi: yeuCauDangXem.ten_thiet_bi,
            phong: (yeuCauDangXem.phong_hoc ? yeuCauDangXem.phong_hoc.ten_phong : yeuCauDangXem.vi_tri_phong) || ''
          });
        };
        if (linkAnhGoc) linkAnhGoc.href = yeuCauDangXem.duong_dan_anh;
        khungCoAnh.classList.remove('d-none');
        khungKhongAnh.classList.add('d-none');
      } else {
        chiTietHinhAnh.src = '';
        chiTietHinhAnh.onclick = null;
        khungCoAnh.classList.add('d-none');
        khungKhongAnh.classList.remove('d-none');
      }

      // 3. Cột phải: Dòng thời gian Nhật ký xử lý (Compact Timeline)
      const danhSachLichSu = document.getElementById('danhSachLichSuXuLy');
      danhSachLichSu.replaceChildren();

      const nhatKy = yeuCauDangXem.lich_su_xu_ly || [];
      if (nhatKy.length === 0) {
        const divTrong = document.createElement('div');
        divTrong.className = 'small text-muted fst-italic';
        divTrong.textContent = 'Chưa có nhật ký ghi nhận';
        danhSachLichSu.appendChild(divTrong);
      } else {
        nhatKy.forEach(item => {
          const cloneItem = mauMucLichSu.content.cloneNode(true);
          const tieuDe = cloneItem.querySelector('.lich-su-tieu-de');
          const thoiGian = cloneItem.querySelector('.lich-su-thoi-gian');
          const ghiChu = cloneItem.querySelector('.lich-su-ghi-chu');

          const tt = layNhanTrangThai(item.trang_thai);
          let nguoiThucHien = item.nguoi_thuc_hien || 'Hệ thống';
          // Tự động sửa nhãn nếu bản ghi cũ bị nhầm [KTV: ...@st.tvu.edu.vn]
          if (nguoiThucHien.includes('[KTV:') && (nguoiThucHien.includes('@st.tvu.edu.vn') || /\[KTV:\s*\d{8,}@/.test(nguoiThucHien))) {
            nguoiThucHien = nguoiThucHien.replace('[KTV:', '[SV:');
          }

          tieuDe.textContent = tt.chu;
          thoiGian.textContent = dinhDangNgayGioNgan(item.thoi_gian_ghi || item.thoi_gian_tao);

          let noiDungDong2 = nguoiThucHien;
          if (item.ghi_chu) {
            noiDungDong2 += ` — ${item.ghi_chu}`;
          }
          ghiChu.textContent = noiDungDong2;

          danhSachLichSu.appendChild(cloneItem);
        });
      }

      // 4. Footer Modal: Gom toàn bộ nút thao tác nghiệp vụ, ẩn hoàn toàn khi đã đóng
      const laAdmin = nguoiDungHienTai?.vai_tro === 'ADMIN';
      const laPhuTrach = yeuCauDangXem.ma_ky_thuat_vien === nguoiDungHienTai?.ma_nguoi_dung;
      const trangThai = yeuCauDangXem.trang_thai;

      const nutTiepNhan = document.getElementById('nutModalTiepNhan');
      const nutPhanCong = document.getElementById('nutModalPhanCong');
      const nutDoiKtv = document.getElementById('nutModalDoiKtv');
      const nutHoanThanh = document.getElementById('nutModalHoanThanh');
      const nutHuy = document.getElementById('nutModalHuy');
      const nhanDaDong = document.getElementById('nhanYeuCauDaDong');

      // Ẩn tất cả nút trước khi bật theo điều kiện
      if (nutTiepNhan) nutTiepNhan.classList.add('d-none');
      if (nutPhanCong) nutPhanCong.classList.add('d-none');
      if (nutDoiKtv) nutDoiKtv.classList.add('d-none');
      if (nutHoanThanh) nutHoanThanh.classList.add('d-none');
      if (nutHuy) nutHuy.classList.add('d-none');
      if (nhanDaDong) nhanDaDong.classList.add('d-none');

      if (trangThai === 'CHO_XU_LY') {
        if (nutTiepNhan) {
          nutTiepNhan.classList.remove('d-none');
        }
        if (nutPhanCong && laAdmin) {
          nutPhanCong.classList.remove('d-none');
        }
        if (nutHuy) {
          nutHuy.classList.remove('d-none');
        }
      } else if (trangThai === 'DANG_XU_LY') {
        if (nutHoanThanh && (laAdmin || laPhuTrach)) {
          nutHoanThanh.classList.remove('d-none');
        }
        if (nutDoiKtv && laAdmin) {
          nutDoiKtv.classList.remove('d-none');
        }
        if (nutHuy && laAdmin) {
          nutHuy.classList.remove('d-none');
        }
      } else if (trangThai === 'HOAN_THANH' || trangThai === 'HUY') {
        // Yêu cầu đã đóng (BẮT BUỘC FIX): Ẩn hoàn toàn tất cả nút nghiệp vụ!
        if (nhanDaDong) {
          nhanDaDong.classList.remove('d-none');
        }
      }

      if (bsModalChiTiet) bsModalChiTiet.show();
    } catch (loi) {
      console.error('Lỗi mở chi tiết yêu cầu:', loi);
    }
  }

  // Gắn sự kiện cho các nút nghiệp vụ trong Footer Modal Chi tiết
  const nutModalTiepNhan = document.getElementById('nutModalTiepNhan');
  if (nutModalTiepNhan) {
    nutModalTiepNhan.addEventListener('click', () => {
      if (!yeuCauDangXem) return;
      if (bsModalChiTiet) bsModalChiTiet.hide();
      xuLyTiepNhanNhanh(yeuCauDangXem);
    });
  }

  const nutModalPhanCong = document.getElementById('nutModalPhanCong');
  if (nutModalPhanCong) {
    nutModalPhanCong.addEventListener('click', () => {
      if (!yeuCauDangXem) return;
      if (bsModalChiTiet) bsModalChiTiet.hide();
      moModalPhanCong(yeuCauDangXem);
    });
  }

  const nutModalDoiKtv = document.getElementById('nutModalDoiKtv');
  if (nutModalDoiKtv) {
    nutModalDoiKtv.addEventListener('click', () => {
      if (!yeuCauDangXem) return;
      if (bsModalChiTiet) bsModalChiTiet.hide();
      moModalPhanCong(yeuCauDangXem);
    });
  }

  const nutModalHoanThanh = document.getElementById('nutModalHoanThanh');
  if (nutModalHoanThanh) {
    nutModalHoanThanh.addEventListener('click', () => {
      if (!yeuCauDangXem) return;
      if (bsModalChiTiet) bsModalChiTiet.hide();
      moModalCapNhat(yeuCauDangXem, 'HOAN_THANH');
    });
  }

  const nutModalHuy = document.getElementById('nutModalHuy');
  if (nutModalHuy) {
    nutModalHuy.addEventListener('click', () => {
      if (!yeuCauDangXem) return;
      if (bsModalChiTiet) bsModalChiTiet.hide();
      moModalCapNhat(yeuCauDangXem, 'HUY');
    });
  }

  // =========================================================================
  // 9. MODAL CẬP NHẬT TRẠNG THÁI (TIẾP NHẬN / HOÀN THÀNH / HỦY)
  // =========================================================================
  function moModalCapNhat(yc, trangThaiGoiY) {
    const capNhatId = document.getElementById('capNhatIdYeuCau');
    const capNhatTt = document.getElementById('capNhatTrangThaiMoi');
    const capNhatGc = document.getElementById('capNhatGhiChuKetQua');
    const dauSao = document.getElementById('dauSaoBatBuoc');

    if (capNhatId) capNhatId.value = yc.ma_yeu_cau_bao_hong;
    if (capNhatTt && trangThaiGoiY) capNhatTt.value = trangThaiGoiY;
    if (capNhatGc) capNhatGc.value = '';

    if (dauSao) {
      if (trangThaiGoiY === 'HOAN_THANH' || trangThaiGoiY === 'HUY') {
        dauSao.classList.remove('d-none');
      } else {
        dauSao.classList.add('d-none');
      }
    }

    if (bsModalCapNhat) bsModalCapNhat.show();
  }

  const bieuMauCapNhat = document.getElementById('bieuMauCapNhatTrangThai');
  if (bieuMauCapNhat) {
    bieuMauCapNhat.addEventListener('submit', async (e) => {
      e.preventDefault();
      const maYcBaoHong = document.getElementById('capNhatIdYeuCau').value;
      const trangThaiMoi = document.getElementById('capNhatTrangThaiMoi').value;
      const ghiChu = document.getElementById('capNhatGhiChuKetQua').value.trim();

      if ((trangThaiMoi === 'HOAN_THANH' || trangThaiMoi === 'HUY') && !ghiChu) {
        thongBaoCanhBao('Vui lòng nhập ghi chú kết quả');
        return;
      }

      const nutXacNhan = document.getElementById('nutXacNhanCapNhat');
      if (nutXacNhan) nutXacNhan.disabled = true;

      let phanHoi;
      try {
        phanHoi = await fetch(`/api/yeu-cau/${maYcBaoHong}/trang-thai`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            trang_thai_moi: trangThaiMoi,
            ghi_chu_ket_qua: ghiChu
          })
        });
      } catch (loiMang) {
        console.error('Lỗi kết nối khi cập nhật:', loiMang);
        thongBaoLoi('Lỗi kết nối máy chủ');
        if (nutXacNhan) nutXacNhan.disabled = false;
        return;
      }

      if (nutXacNhan) nutXacNhan.disabled = false;

      // Bắt Khóa Lạc Quan 409
      if (phanHoi.status === 409) {
        const kq = await phanHoi.json().catch(() => ({}));
        hienThiToastXungDot(kq.loi);
        return;
      }

      if (!phanHoi.ok) {
        const kq = await phanHoi.json().catch(() => ({}));
        thongBaoLoi(kq.loi || 'Cập nhật không thành công');
        return;
      }

      thongBaoThanhCong('Cập nhật trạng thái thành công');
      if (bsModalCapNhat) bsModalCapNhat.hide();
      try {
        await taiDanhSachYeuCau();
        await taiThongKeSoLuongNhanh();
      } catch (e) {
        console.warn('Lỗi làm mới sau cập nhật:', e);
      }
    });
  }


  // =========================================================================
  // 11. MODAL PHÂN CÔNG KỸ THUẬT VIÊN (ADMIN ONLY)
  // =========================================================================
  function moModalPhanCong(yc) {
    document.getElementById('phanCongIdYeuCau').value = yc.ma_yeu_cau_bao_hong;
    const oTimKtv = document.getElementById('oTimKiemKtvPhanCong');
    if (oTimKtv) oTimKtv.value = '';
    renderDanhSachKtvPhanCong('', yc.ma_ky_thuat_vien || '');

    if (bsModalPhanCong) bsModalPhanCong.show();
  }

  if (oTimKiemKtvPhanCong) {
    oTimKiemKtvPhanCong.addEventListener('input', (e) => {
      renderDanhSachKtvPhanCong(e.target.value);
    });
  }

  const bieuMauPhanCong = document.getElementById('bieuMauPhanCong');
  if (bieuMauPhanCong) {
    bieuMauPhanCong.addEventListener('submit', async (e) => {
      e.preventDefault();
      const maYcBaoHong = document.getElementById('phanCongIdYeuCau').value;
      const maKtv = document.getElementById('phanCongMaKtv').value;

      if (!maKtv) {
        thongBaoCanhBao('Vui lòng chọn kỹ thuật viên');
        return;
      }

      const nutLuu = document.getElementById('nutXacNhanPhanCong');
      if (nutLuu) nutLuu.disabled = true;

      let phanHoi;
      try {
        phanHoi = await fetch(`/api/yeu-cau/${maYcBaoHong}/phan-cong`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ ma_ky_thuat_vien: parseInt(maKtv, 10) })
        });
      } catch (loiMang) {
        console.error('Lỗi kết nối khi phân công:', loiMang);
        thongBaoLoi('Lỗi kết nối máy chủ');
        if (nutLuu) nutLuu.disabled = false;
        return;
      }

      if (nutLuu) nutLuu.disabled = false;

      // Bắt Khóa Lạc Quan 409
      if (phanHoi.status === 409) {
        const kq = await phanHoi.json().catch(() => ({}));
        hienThiToastXungDot(kq.loi);
        return;
      }

      if (!phanHoi.ok) {
        const kq = await phanHoi.json().catch(() => ({}));
        thongBaoLoi(kq.loi || 'Phân công không thành công');
        return;
      }

      thongBaoThanhCong('Phân công kỹ thuật viên thành công');
      if (bsModalPhanCong) bsModalPhanCong.hide();
      try {
        await taiDanhSachYeuCau();
        await taiThongKeSoLuongNhanh();
      } catch (e) {
        console.warn('Lỗi làm mới sau phân công:', e);
      }
    });
  }

  // =========================================================================
  // 12. TAB 2: BÁO CÁO & HIỆU SUẤT XỬ LÝ (VIỆT HÓA 100%)
  // =========================================================================
  async function taiBaoCaoHieuSuat() {
    try {
      const phanHoi = await fetch('/api/thong-ke', {
        headers: { 'Accept': 'application/json' }
      });
      if (!phanHoi.ok) return;

      const ketQua = await phanHoi.json();
      const duLieu = ketQua.duLieu;
      if (!duLieu) return;

      const tq = duLieu.tongQuan || {};
      const sla = duLieu.sla || {};

      // 1. Tỷ lệ hoàn thành sự cố (%)
      const tiLeHoanThanh = tq.tongSo > 0 ? ((tq.hoanThanh / tq.tongSo) * 100).toFixed(1) : '0.0';
      document.getElementById('chiSoTiLeHoanThanh').textContent = `${tiLeHoanThanh}%`;

      // 2. Tỷ lệ tiếp nhận đúng hạn (< 30 phút)
      const tiLeDungHan = sla.tiLeTiepNhanDungHanPhanTram !== undefined
        ? `${Number(sla.tiLeTiepNhanDungHanPhanTram).toFixed(1)}%`
        : '100%';
      document.getElementById('chiSoTiLeDungHan').textContent = tiLeDungHan;

      // 3. Thời gian tiếp nhận trung bình (Format về Giờ và Phút)
      const phutTb = sla.thoiGianPhanHoiTrungBinhPhut || 0;
      if (phutTb === 0) {
        document.getElementById('chiSoThoiGianPhanHoi').innerHTML = `0 <span style="font-size: 16px;">phút</span>`;
      } else if (phutTb < 60) {
        document.getElementById('chiSoThoiGianPhanHoi').innerHTML = `${phutTb} <span style="font-size: 16px;">phút</span>`;
      } else {
        const gioTb = Math.floor(phutTb / 60);
        const phutDu = phutTb % 60;
        if (phutDu === 0) {
          document.getElementById('chiSoThoiGianPhanHoi').innerHTML = `${gioTb} <span style="font-size: 16px;">giờ</span>`;
        } else {
          document.getElementById('chiSoThoiGianPhanHoi').innerHTML = `${gioTb} <span style="font-size: 16px;">giờ</span> ${phutDu} <span style="font-size: 16px;">phút</span>`;
        }
      }

      // 4. MTTR Kép: Resolve & Repair (Việt hóa 100%)
      const mttrResolve = sla.thoiGianKhacPhucTrungBinhGio !== undefined ? sla.thoiGianKhacPhucTrungBinhGio : 0;
      const mttrRepair = (sla.thoiGianSuaChuaThucTeTrungBinhGio || sla.thoi_gian_sua_chua_thuc_te_gio || 0);
      document.getElementById('chiSoMttrResolve').textContent = Number(mttrResolve).toFixed(1);
      document.getElementById('chiSoMttrRepair').textContent = Number(mttrRepair).toFixed(1);

      // Render Top Phòng học phát sinh sự cố
      const topPhongEl = document.getElementById('danhSachTopPhong');
      if (topPhongEl) {
        topPhongEl.innerHTML = '';
        const topPhong = duLieu.topPhong || [];
        const maxPhong = topPhong[0]?.soLuong || 1;

        if (topPhong.length === 0) {
          topPhongEl.innerHTML = '<div class="small text-muted fst-italic">Chưa có dữ liệu thống kê phòng</div>';
        } else {
          topPhong.slice(0, 5).forEach((p, idx) => {
            const clone = mauThanhThongKe.content.cloneNode(true);
            clone.querySelector('.thong-ke-ten').textContent = p.ten;
            clone.querySelector('.thong-ke-so-luong').textContent = `${p.soLuong} sự cố`;

            const fill = clone.querySelector('.thanh-thong-ke-fill');
            const pt = Math.min(Math.round((p.soLuong / maxPhong) * 100), 100);
            fill.style.width = `${pt}%`;
            if (idx === 0) fill.style.background = 'var(--ut-khan-cap)';
            topPhongEl.appendChild(clone);
          });
        }
      }

      // Render Sự cố theo Danh mục thiết bị
      const topDmEl = document.getElementById('danhSachTopDanhMuc');
      if (topDmEl) {
        topDmEl.innerHTML = '';
        const topThietBi = duLieu.topThietBi || [];
        const maxTb = topThietBi[0]?.soLuong || 1;

        if (topThietBi.length === 0) {
          topDmEl.innerHTML = '<div class="small text-muted fst-italic">Chưa có dữ liệu danh mục thiết bị</div>';
        } else {
          topThietBi.slice(0, 5).forEach((tb, idx) => {
            const clone = mauThanhThongKe.content.cloneNode(true);
            clone.querySelector('.thong-ke-ten').textContent = tb.ten;
            clone.querySelector('.thong-ke-so-luong').textContent = `${tb.soLuong} sự cố`;

            const fill = clone.querySelector('.thanh-thong-ke-fill');
            const pt = Math.min(Math.round((tb.soLuong / maxTb) * 100), 100);
            fill.style.width = `${pt}%`;
            if (idx === 1) fill.style.background = '#0284C7';
            else if (idx === 2) fill.style.background = '#D97706';
            topDmEl.appendChild(clone);
          });
        }
      }
    } catch (loi) {
      console.warn('Lỗi nạp báo cáo thống kê:', loi);
    }
  }

  // =========================================================================
  // 13. SỰ KIỆN TƯƠNG TÁC BỘ LỌC & TAB CHUYỂN ĐỔI
  // =========================================================================
  if (tabYeuCau) {
    tabYeuCau.addEventListener('click', () => {
      tabYeuCau.classList.add('active');
      if (tabBaoCao) tabBaoCao.classList.remove('active');
      if (tabNhanSu) tabNhanSu.classList.remove('active');
      if (tabPhong) tabPhong.classList.remove('active');
      khuVucTabYeuCau.classList.remove('d-none');
      if (khuVucTabBaoCao) khuVucTabBaoCao.classList.add('d-none');
      if (khuVucTabNhanSu) khuVucTabNhanSu.classList.add('d-none');
      if (khuVucTabPhong) khuVucTabPhong.classList.add('d-none');
    });
  }

  if (tabBaoCao) {
    tabBaoCao.addEventListener('click', () => {
      tabBaoCao.classList.add('active');
      tabYeuCau.classList.remove('active');
      if (tabNhanSu) tabNhanSu.classList.remove('active');
      if (tabPhong) tabPhong.classList.remove('active');
      khuVucTabBaoCao.classList.remove('d-none');
      khuVucTabYeuCau.classList.add('d-none');
      if (khuVucTabNhanSu) khuVucTabNhanSu.classList.add('d-none');
      if (khuVucTabPhong) khuVucTabPhong.classList.add('d-none');
      taiBaoCaoHieuSuat();
    });
  }

  if (tabNhanSu) {
    tabNhanSu.addEventListener('click', () => {
      tabNhanSu.classList.add('active');
      tabYeuCau.classList.remove('active');
      if (tabBaoCao) tabBaoCao.classList.remove('active');
      if (tabPhong) tabPhong.classList.remove('active');
      if (khuVucTabNhanSu) khuVucTabNhanSu.classList.remove('d-none');
      khuVucTabYeuCau.classList.add('d-none');
      if (khuVucTabBaoCao) khuVucTabBaoCao.classList.add('d-none');
      if (khuVucTabPhong) khuVucTabPhong.classList.add('d-none');
      taiDanhSachNhanSu();
    });
  }

  if (tabPhong) {
    tabPhong.addEventListener('click', () => {
      tabPhong.classList.add('active');
      tabYeuCau.classList.remove('active');
      if (tabBaoCao) tabBaoCao.classList.remove('active');
      if (tabNhanSu) tabNhanSu.classList.remove('active');
      if (khuVucTabPhong) khuVucTabPhong.classList.remove('d-none');
      khuVucTabYeuCau.classList.add('d-none');
      if (khuVucTabBaoCao) khuVucTabBaoCao.classList.add('d-none');
      if (khuVucTabNhanSu) khuVucTabNhanSu.classList.add('d-none');
      taiDanhSachPhong();
    });
  }

  // Bộ lọc từ khóa (debounce 300ms)
  let timerTimKiem = null;
  if (locTuKhoa) {
    locTuKhoa.addEventListener('input', () => {
      clearTimeout(timerTimKiem);
      timerTimKiem = setTimeout(() => {
        boLoc.tu_khoa = locTuKhoa.value.trim();
        boLoc.trang = 1;
        taiDanhSachYeuCau();
      }, 300);
    });
  }

  // Bộ lọc trạng thái
  if (locTrangThai) {
    locTrangThai.addEventListener('change', () => {
      boLoc.trang_thai = locTrangThai.value;
      boLoc.trang = 1;
      taiDanhSachYeuCau();
    });
  }

  // Bộ lọc mức ưu tiên
  if (locMucUuTien) {
    locMucUuTien.addEventListener('change', () => {
      boLoc.muc_do_uu_tien = locMucUuTien.value;
      boLoc.trang = 1;
      taiDanhSachYeuCau();
    });
  }

  // Bộ lọc "Của tôi"
  if (locCuaToi) {
    locCuaToi.addEventListener('change', () => {
      boLoc.cua_toi = locCuaToi.checked;
      boLoc.trang = 1;
      taiDanhSachYeuCau();
    });
  }

  // Nút Đặt lại bộ lọc
  if (nutDatLaiLoc) {
    nutDatLaiLoc.addEventListener('click', () => {
      boLoc.trang = 1;
      boLoc.tu_khoa = '';
      boLoc.trang_thai = '';
      boLoc.muc_do_uu_tien = '';
      boLoc.cua_toi = false;

      if (locTuKhoa) locTuKhoa.value = '';
      if (locTrangThai) locTrangThai.value = '';
      if (locMucUuTien) locMucUuTien.value = '';
      if (locCuaToi) locCuaToi.checked = false;

      taiDanhSachYeuCau();
    });
  }

  // Nút Làm mới thủ công
  if (nutLamMoi) {
    nutLamMoi.addEventListener('click', () => {
      taiDanhSachYeuCau();
      if (!khuVucTabBaoCao.classList.contains('d-none')) {
        taiBaoCaoHieuSuat();
      }
      if (khuVucTabNhanSu && !khuVucTabNhanSu.classList.contains('d-none')) {
        taiDanhSachNhanSu();
      }
    });
  }

  // =========================================================================
  // 13.1. QUẢN LÝ NHÂN SỰ & KỸ THUẬT VIÊN (ADMIN ONLY)
  // =========================================================================
  async function taiDanhSachNhanSu() {
    if (!thanBangNhanSu) return;
    try {
      const tuKhoa = oTimKiemNhanSu ? oTimKiemNhanSu.value.trim() : '';
      const vaiTro = locVaiTroNhanSu ? locVaiTroNhanSu.value : 'NOI_BO';
      const trangThai = locTrangThaiNhanSu ? locTrangThaiNhanSu.value : 'TAT_CA';

      const params = new URLSearchParams();
      if (tuKhoa) params.append('tu_khoa', tuKhoa);
      if (vaiTro) params.append('vai_tro', vaiTro);
      if (trangThai && trangThai !== 'TAT_CA') params.append('trang_thai', trangThai);

      const url = `/api/nguoi-dung?${params.toString()}`;
      const phanHoi = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      if (!phanHoi.ok) return;

      const ketQua = await phanHoi.json();
      const danhSach = ketQua.duLieu || [];

      if (demKetQuaNhanSu) {
        demKetQuaNhanSu.textContent = `Hiển thị ${danhSach.length} tài khoản`;
      }

      thanBangNhanSu.innerHTML = '';
      if (danhSach.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.className = 'text-center text-muted py-4 fst-italic';
        td.textContent = tuKhoa ? 'Không tìm thấy tài khoản nào khớp với từ khóa' : 'Chưa có dữ liệu nhân sự';
        tr.appendChild(td);
        thanBangNhanSu.appendChild(tr);
        return;
      }

      danhSach.forEach((u) => {
        const tr = document.createElement('tr');

        // 1. Mã NV
        const tdMa = document.createElement('td');
        tdMa.className = 'font-mono fw-bold text-dark';
        tdMa.textContent = `#${u.ma_nguoi_dung}`;
        tr.appendChild(tdMa);

        // 2. Tài khoản
        const tdTk = document.createElement('td');
        tdTk.className = 'fw-semibold text-primary font-mono';
        tdTk.textContent = u.tai_khoan;
        tr.appendChild(tdTk);

        // 3. Họ và tên
        const tdTen = document.createElement('td');
        tdTen.className = 'fw-medium text-dark';
        tdTen.textContent = u.ho_ten;
        tr.appendChild(tdTen);

        // 4. Vai trò
        const tdVaiTro = document.createElement('td');
        const badgeVaiTro = document.createElement('span');
        if (u.vai_tro === 'ADMIN') {
          badgeVaiTro.className = 'badge bg-primary text-white border border-primary';
          badgeVaiTro.textContent = 'ADMIN';
        } else if (u.vai_tro === 'GIANG_VIEN') {
          badgeVaiTro.className = 'badge bg-primary-subtle text-primary border border-primary-subtle font-mono';
          badgeVaiTro.textContent = '[GV] Giảng viên';
        } else if (u.vai_tro === 'SINH_VIEN') {
          badgeVaiTro.className = 'badge bg-secondary-subtle text-secondary border font-mono';
          badgeVaiTro.textContent = '[SV] Sinh viên';
        } else {
          badgeVaiTro.className = 'badge bg-info-subtle text-info-emphasis border border-info-subtle';
          badgeVaiTro.textContent = 'KTV';
        }
        tdVaiTro.appendChild(badgeVaiTro);
        tr.appendChild(tdVaiTro);

        // 5. Email / SĐT
        const tdLienHe = document.createElement('td');
        const divEmail = document.createElement('div');
        divEmail.className = 'small';
        divEmail.textContent = u.email || '-';
        const divSdt = document.createElement('div');
        divSdt.className = 'small text-muted font-mono';
        divSdt.textContent = u.so_dien_thoai || '';
        tdLienHe.appendChild(divEmail);
        if (u.so_dien_thoai) tdLienHe.appendChild(divSdt);
        tr.appendChild(tdLienHe);

        // 6. Zalo Chat ID
        const tdZalo = document.createElement('td');
        if (u.chat_id_zalo) {
          const badgeZalo = document.createElement('span');
          badgeZalo.className = 'badge bg-info-subtle text-info-emphasis border border-info-subtle font-mono';
          badgeZalo.textContent = u.chat_id_zalo;
          tdZalo.appendChild(badgeZalo);
        } else {
          const spanChua = document.createElement('span');
          spanChua.className = 'small text-muted fst-italic';
          spanChua.textContent = 'Chưa gắn';
          tdZalo.appendChild(spanChua);
        }
        tr.appendChild(tdZalo);

        // 7. Trạng thái
        const tdTt = document.createElement('td');
        const badgeTt = document.createElement('span');
        badgeTt.className = u.trang_thai_hoat_dong
          ? 'badge bg-success-subtle text-success border border-success-subtle'
          : 'badge bg-danger-subtle text-danger border border-danger-subtle';
        badgeTt.textContent = u.trang_thai_hoat_dong ? 'Đang hoạt động' : 'Đã khóa';
        tdTt.appendChild(badgeTt);
        tr.appendChild(tdTt);

        // 8. Thao tác
        const tdThaoTac = document.createElement('td');
        tdThaoTac.className = 'text-end';
        const divNut = document.createElement('div');
        divNut.className = 'd-inline-flex gap-1';

        // Chỉ hiển thị nút Sửa cho Admin / KTV
        if (['ADMIN', 'KTV', 'KY_THUAT_VIEN'].includes(u.vai_tro)) {
          const nutSua = document.createElement('button');
          nutSua.type = 'button';
          nutSua.className = 'btn btn-sm btn-phu';
          nutSua.textContent = 'Sửa';
          nutSua.addEventListener('click', () => moModalSuaNhanSu(u));
          divNut.appendChild(nutSua);
        }

        // Nút Khóa / Mở khóa cho tất cả người dùng
        const nutKhoa = document.createElement('button');
        nutKhoa.type = 'button';
        nutKhoa.className = u.trang_thai_hoat_dong ? 'btn btn-sm btn-outline-danger' : 'btn btn-sm btn-outline-success';
        nutKhoa.textContent = u.trang_thai_hoat_dong ? 'Khóa' : 'Mở';
        if (nguoiDungHienTai && u.ma_nguoi_dung === nguoiDungHienTai.ma_nguoi_dung) {
          nutKhoa.disabled = true;
          nutKhoa.title = 'Không thể tự khóa tài khoản của chính mình';
        } else {
          nutKhoa.addEventListener('click', () => doiTrangThaiNhanSu(u));
        }
        divNut.appendChild(nutKhoa);

        tdThaoTac.appendChild(divNut);
        tr.appendChild(tdThaoTac);

        thanBangNhanSu.appendChild(tr);
      });
    } catch (loi) {
      console.error('Lỗi nạp danh sách nhân sự:', loi);
    }
  }

  function moModalThemNhanSu() {
    if (!bsModalNguoiDung) return;
    document.getElementById('tieuDeModalNguoiDung').textContent = 'Thêm nhân sự mới';
    document.getElementById('nguoiDungId').value = '';
    const tkEl = document.getElementById('nguoiDungTaiKhoan');
    tkEl.value = '';
    tkEl.disabled = false;
    document.getElementById('nguoiDungHoTen').value = '';
    document.getElementById('nguoiDungVaiTro').value = 'KTV';
    document.getElementById('nguoiDungSdt').value = '';
    document.getElementById('nguoiDungEmail').value = '';
    document.getElementById('nguoiDungChatIdZalo').value = '';
    const mkEl = document.getElementById('nguoiDungMatKhau');
    mkEl.value = '';
    mkEl.required = false;
    document.getElementById('nhanMatKhau').innerHTML = 'Mật khẩu <span class="text-muted fw-normal small">(Mặc định: tvu123)</span>';
    document.getElementById('goiYMatKhau').textContent = 'Để trống sẽ tự động đặt mật khẩu mặc định là tvu123.';
    bsModalNguoiDung.show();
  }

  function moModalSuaNhanSu(u) {
    if (!bsModalNguoiDung) return;
    document.getElementById('tieuDeModalNguoiDung').textContent = `Cập nhật nhân sự (${u.tai_khoan})`;
    document.getElementById('nguoiDungId').value = u.ma_nguoi_dung;
    const tkEl = document.getElementById('nguoiDungTaiKhoan');
    tkEl.value = u.tai_khoan;
    tkEl.disabled = true;
    document.getElementById('nguoiDungHoTen').value = u.ho_ten || '';
    document.getElementById('nguoiDungVaiTro').value = u.vai_tro || 'KTV';
    document.getElementById('nguoiDungSdt').value = u.so_dien_thoai || '';
    document.getElementById('nguoiDungEmail').value = u.email || '';
    document.getElementById('nguoiDungChatIdZalo').value = u.chat_id_zalo || '';
    const mkEl = document.getElementById('nguoiDungMatKhau');
    mkEl.value = '';
    mkEl.required = false;
    document.getElementById('nhanMatKhau').innerHTML = 'Mật khẩu mới (Tùy chọn)';
    document.getElementById('goiYMatKhau').textContent = 'Để trống nếu không muốn đổi mật khẩu. Nếu đổi, nhập tối thiểu 6 ký tự.';
    bsModalNguoiDung.show();
  }

  async function doiTrangThaiNhanSu(u) {
    const hanhDong = u.trang_thai_hoat_dong ? 'Khóa' : 'Mở khóa';
    const dongY = await xacNhanHanhDong({
      tieuDe: `${hanhDong} tài khoản?`,
      noiDung: `Tài khoản: ${u.tai_khoan}`,
      nutDongY: hanhDong,
      loai: 'warning'
    });
    if (!dongY) return;

    let phanHoi;
    try {
      phanHoi = await fetch(`/api/nguoi-dung/${u.ma_nguoi_dung}/trang-thai`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ trang_thai_hoat_dong: !u.trang_thai_hoat_dong })
      });
    } catch (loiMang) {
      console.error('Lỗi kết nối khi đổi trạng thái nhân sự:', loiMang);
      thongBaoLoi('Lỗi kết nối máy chủ');
      return;
    }

    const ketQua = await phanHoi.json().catch(() => ({}));
    if (!phanHoi.ok) {
      thongBaoLoi(ketQua.loi || ketQua.thongBao || 'Lỗi cập nhật');
      return;
    }

    thongBaoThanhCong(`${hanhDong} tài khoản thành công`);
    try {
      await taiDanhSachNhanSu();
      await taiDanhMucHeThong();
    } catch (e) {
      console.warn('Lỗi làm mới sau cập nhật nhân sự:', e);
    }
  }

  if (nutThemNhanSu) {
    nutThemNhanSu.addEventListener('click', moModalThemNhanSu);
  }

  if (oTimKiemNhanSu) {
    let henGioTim = null;
    oTimKiemNhanSu.addEventListener('input', () => {
      clearTimeout(henGioTim);
      henGioTim = setTimeout(taiDanhSachNhanSu, 250);
    });
  }

  if (locVaiTroNhanSu) {
    locVaiTroNhanSu.addEventListener('change', taiDanhSachNhanSu);
  }

  if (locTrangThaiNhanSu) {
    locTrangThaiNhanSu.addEventListener('change', taiDanhSachNhanSu);
  }

  if (nutXoaLocNhanSu) {
    nutXoaLocNhanSu.addEventListener('click', () => {
      if (oTimKiemNhanSu) oTimKiemNhanSu.value = '';
      if (locVaiTroNhanSu) locVaiTroNhanSu.value = 'NOI_BO';
      if (locTrangThaiNhanSu) locTrangThaiNhanSu.value = 'TAT_CA';
      taiDanhSachNhanSu();
    });
  }

  if (bieuMauNguoiDung) {
    bieuMauNguoiDung.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('nguoiDungId').value;
      const taiKhoan = document.getElementById('nguoiDungTaiKhoan').value.trim();
      const hoTen = document.getElementById('nguoiDungHoTen').value.trim();
      const vaiTro = document.getElementById('nguoiDungVaiTro').value;
      const sdt = document.getElementById('nguoiDungSdt').value.trim();
      const email = document.getElementById('nguoiDungEmail').value.trim();
      const chatIdZalo = document.getElementById('nguoiDungChatIdZalo').value.trim();
      const matKhau = document.getElementById('nguoiDungMatKhau').value;

      // Ràng buộc số điện thoại: Bắt buộc, đúng 10 chữ số, bắt đầu bằng số 0
      if (!sdt) {
        thongBaoCanhBao('Số điện thoại không được để trống');
        document.getElementById('nguoiDungSdt').focus();
        return;
      }
      if (!/^0[0-9]{9}$/.test(sdt)) {
        thongBaoCanhBao('SĐT phải gồm đúng 10 số (bắt đầu bằng 0)');
        document.getElementById('nguoiDungSdt').focus();
        return;
      }

      const laThemMoi = !id;
      const url = laThemMoi ? '/api/nguoi-dung' : `/api/nguoi-dung/${id}`;
      const method = laThemMoi ? 'POST' : 'PUT';

      const duLieu = {
        ho_ten: hoTen,
        email: email || null,
        so_dien_thoai: sdt,
        vai_tro: vaiTro,
        chat_id_zalo: chatIdZalo || null
      };

      if (laThemMoi) {
        duLieu.tai_khoan = taiKhoan;
        duLieu.mat_khau = matKhau || 'tvu123';
      } else {
        if (matKhau) duLieu.mat_khau_moi = matKhau;
      }

      let phanHoi;
      try {
        phanHoi = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(duLieu)
        });
      } catch (loiMang) {
        console.error('Lỗi kết nối khi lưu nhân sự:', loiMang);
        thongBaoLoi('Lỗi kết nối máy chủ');
        return;
      }

      const ketQua = await phanHoi.json().catch(() => ({}));
      if (!phanHoi.ok) {
        thongBaoLoi(ketQua.loi || ketQua.thongBao || 'Lỗi lưu thông tin');
        return;
      }

      thongBaoThanhCong(laThemMoi ? 'Thêm nhân sự thành công' : 'Cập nhật nhân sự thành công');
      if (bsModalNguoiDung) bsModalNguoiDung.hide();
      try {
        await taiDanhSachNhanSu();
        await taiDanhMucHeThong();
      } catch (e) {
        console.warn('Lỗi làm mới sau lưu nhân sự:', e);
      }
    });
  }

  // =========================================================================
  // 13.2. ĐỔI MẬT KHẨU TÀI KHOẢN (TỰ ĐỔI & BẮT BUỘC ĐỔI LẦN ĐẦU)
  // =========================================================================
  let laDoiMkBatBuoc = false;

  function moModalDoiMatKhau(laBatBuoc = false) {
    if (!modalDoiMatKhauEl) return;
    laDoiMkBatBuoc = laBatBuoc;

    const canhBaoEl = document.getElementById('canhBaoDoiMkLanDau');
    const nutDongModal = document.getElementById('nutDongModalDoiMk');
    const nutHuyModal = document.getElementById('nutHuyDoiMk');
    const hopLoi = document.getElementById('hopLoiDoiMk');

    if (hopLoi) hopLoi.classList.add('d-none');
    document.getElementById('doiMkMoi').value = '';
    document.getElementById('doiMkXacNhan').value = '';

    if (laBatBuoc) {
      if (canhBaoEl) canhBaoEl.classList.remove('d-none');
      if (nutDongModal) nutDongModal.classList.add('d-none');
      if (nutHuyModal) nutHuyModal.classList.add('d-none');
      document.getElementById('doiMkHienTai').value = 'tvu123';
      document.getElementById('doiMkHienTai').readOnly = true;

      if (bsModalDoiMatKhau) {
        try { bsModalDoiMatKhau.dispose(); } catch (e) {}
      }
      bsModalDoiMatKhau = new bootstrap.Modal(modalDoiMatKhauEl, {
        backdrop: 'static',
        keyboard: false
      });
    } else {
      if (canhBaoEl) canhBaoEl.classList.add('d-none');
      if (nutDongModal) nutDongModal.classList.remove('d-none');
      if (nutHuyModal) nutHuyModal.classList.remove('d-none');
      document.getElementById('doiMkHienTai').value = '';
      document.getElementById('doiMkHienTai').readOnly = false;

      if (bsModalDoiMatKhau) {
        try { bsModalDoiMatKhau.dispose(); } catch (e) {}
      }
      bsModalDoiMatKhau = new bootstrap.Modal(modalDoiMatKhauEl);
    }

    bsModalDoiMatKhau.show();
  }

  if (nutMoModalDoiMatKhau) {
    nutMoModalDoiMatKhau.addEventListener('click', () => moModalDoiMatKhau(false));
  }

  if (bieuMauDoiMatKhau) {
    bieuMauDoiMatKhau.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hopLoi = document.getElementById('hopLoiDoiMk');
      const mkHienTai = document.getElementById('doiMkHienTai').value;
      const mkMoi = document.getElementById('doiMkMoi').value;
      const mkXacNhan = document.getElementById('doiMkXacNhan').value;

      if (!mkHienTai || !mkMoi || !mkXacNhan) {
        if (hopLoi) {
          hopLoi.textContent = 'Vui lòng điền đầy đủ tất cả các trường.';
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

      if (mkMoi === mkHienTai) {
        if (hopLoi) {
          hopLoi.textContent = 'Mật khẩu mới không được trùng với mật khẩu cũ.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      let phanHoi;
      try {
        phanHoi = await fetch('/api/xac-thuc/doi-mat-khau', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            mat_khau_hien_tai: mkHienTai,
            mat_khau_moi: mkMoi,
            xac_nhan_mat_khau: mkXacNhan
          })
        });
      } catch (loiMang) {
        if (hopLoi) {
          hopLoi.textContent = 'Lỗi kết nối máy chủ khi đổi mật khẩu.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      const ketQua = await phanHoi.json().catch(() => ({}));
      if (!phanHoi.ok || !ketQua.thanhCong) {
        if (hopLoi) {
          hopLoi.textContent = ketQua.loi || ketQua.thongBao || 'Lỗi khi đổi mật khẩu.';
          hopLoi.classList.remove('d-none');
        }
        return;
      }

      thongBaoThanhCong('Đổi mật khẩu thành công');
      if (nguoiDungHienTai) {
        nguoiDungHienTai.doi_mat_khau_lan_dau = false;
      }
      if (bsModalDoiMatKhau) bsModalDoiMatKhau.hide();
    });
  }

  // =========================================================================
  // 13.2. XUẤT BÁO CÁO CSV (UTF-8 BOM CHUẨN MICROSOFT EXCEL)
  // =========================================================================
  if (nutXuatCsv) {
    nutXuatCsv.addEventListener('click', async () => {
      try {
        const params = new URLSearchParams({
          trang: '1',
          so_luong: '1000'
        });
        if (boLoc.trang_thai) params.append('trang_thai', boLoc.trang_thai);
        if (boLoc.muc_do_uu_tien) params.append('muc_do_uu_tien', boLoc.muc_do_uu_tien);
        if (boLoc.tu_khoa) params.append('tu_khoa', boLoc.tu_khoa);
        if (boLoc.cua_toi) params.append('cua_toi', 'true');

        const phanHoi = await fetch(`/api/yeu-cau?${params.toString()}`);
        if (!phanHoi.ok) {
          thongBaoLoi('Không thể tải dữ liệu để xuất');
          return;
        }

        const ketQua = await phanHoi.json();
        const danhSach = Array.isArray(ketQua.duLieu) ? ketQua.duLieu : (ketQua.duLieu?.danhSach || []);

        if (danhSach.length === 0) {
          thongBaoCanhBao('Không có dữ liệu yêu cầu để xuất');
          return;
        }

        const tieuDe = ['Mã yêu cầu', 'Tên thiết bị', 'Phòng', 'Mức ưu tiên', 'Trạng thái', 'KTV phụ trách', 'Ngày tạo', 'Mô tả sự cố', 'Ghi chú KTV'];
        const hangCsv = [tieuDe.join(',')];

        danhSach.forEach(yc => {
          const tenKtv = yc.ky_thuat_vien ? yc.ky_thuat_vien.ho_ten : 'Chưa phân công';
          const dong = [
            `"${yc.ma_yeu_cau || ''}"`,
            `"${(yc.ten_thiet_bi || '').replace(/"/g, '""')}"`,
            `"${(yc.vi_tri_phong || '').replace(/"/g, '""')}"`,
            `"${layNhanMucUuTien(yc.muc_do_uu_tien).chu}"`,
            `"${layNhanTrangThai(yc.trang_thai).chu}"`,
            `"${tenKtv.replace(/"/g, '""')}"`,
            `"${dinhDangNgayGio(yc.thoi_gian_tao)}"`,
            `"${(yc.mo_ta_loi || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
            `"${(yc.ghi_chu_ket_qua || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
          ];
          hangCsv.push(dong.join(','));
        });

        const noiDungCsv = hangCsv.join('\r\n');
        // Thêm UTF-8 BOM (\uFEFF) để Excel hiển thị đúng dấu tiếng Việt không bị lỗi font
        const blob = new Blob(['\uFEFF' + noiDungCsv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const homNay = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        link.setAttribute('href', url);
        link.setAttribute('download', `BaoCao_SuCo_TVU_${homNay}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        thongBaoThanhCong('Đã xuất file CSV thành công');
      } catch (loi) {
        console.error('Lỗi xuất CSV:', loi);
        thongBaoLoi('Lỗi khi xuất file CSV');
      }
    });
  }

  // Nút Đăng xuất
  if (nutDangXuat) {
    nutDangXuat.addEventListener('click', async () => {
      const dongY = await xacNhanHanhDong({
        tieuDe: 'Đăng xuất khỏi hệ thống?',
        nutDongY: 'Đăng xuất',
        loai: 'question'
      });
      if (!dongY) return;

      try {
        await fetch('/api/xac-thuc/dang-xuat', { method: 'POST' });
      } finally {
        window.location.replace('/index.html');
      }
    });
  }

  // =========================================================================
  // TAB 4: QUẢN LÝ PHÒNG HỌC & ĐỒNG BỘ ĐỘNG TVU (ADMIN ONLY)
  // =========================================================================
  const boLocPhong = {
    tuKhoa: '',
    loaiPhong: '',
    toaNha: '',
    trang: 1,
    gioiHan: 20
  };

  function docThongTinPhongNhanh(maPhongNhap, loaiPhongChon) {
    if (!maPhongNhap) return null;
    const match = maPhongNhap.trim().toUpperCase().match(/^([A-Z]\d)(\d)\.(\d)(\d{2})(\/\d+)?$/);
    if (!match) return null;

    const toaNha = match[1];
    const khuDigit = match[2];
    const tang = match[3];
    const khuVuc = khuDigit === '2' ? 'Khu II' : 'Khu I';
    const tienTo = loaiPhongChon === 'Hội trường' ? 'Hội trường ' : 'Phòng ';
    const tenChuan = `${tienTo}${match[0]}`;

    return {
      tenChuan,
      toaNha,
      khuVuc,
      toaTang: `Tòa nhà ${toaNha} • Tầng ${tang}`
    };
  }

  function capNhatGoiYPhong() {
    if (!nhapMaPhongChuan || !xemTruocTenPhong) return;
    const ma = nhapMaPhongChuan.value.trim().toUpperCase();
    const loai = nhapLoaiPhong ? nhapLoaiPhong.value : 'Phòng lý thuyết';
    const info = docThongTinPhongNhanh(ma, loai);

    if (info) {
      xemTruocTenPhong.textContent = info.tenChuan;
      if (xemTruocToaNha) xemTruocToaNha.textContent = info.toaNha;
      if (xemTruocKhuVuc) xemTruocKhuVuc.textContent = info.khuVuc;
      if (xemTruocToaTang) xemTruocToaTang.textContent = info.toaTang;
    } else {
      xemTruocTenPhong.textContent = ma ? `${loai === 'Hội trường' ? 'Hội trường ' : 'Phòng '}${ma}` : '--';
      if (xemTruocToaNha) xemTruocToaNha.textContent = '--';
      if (xemTruocKhuVuc) xemTruocKhuVuc.textContent = '--';
      if (xemTruocToaTang) xemTruocToaTang.textContent = '--';
    }
  }

  if (nhapMaPhongChuan) {
    nhapMaPhongChuan.addEventListener('input', () => {
      nhapMaPhongChuan.value = nhapMaPhongChuan.value.toUpperCase();
      capNhatGoiYPhong();
    });
  }

  if (nhapLoaiPhong) {
    nhapLoaiPhong.addEventListener('change', capNhatGoiYPhong);
  }

  async function taiDanhSachPhong() {
    if (!thanBangPhong) return;

    try {
      const thamSo = new URLSearchParams({
        tuKhoa: boLocPhong.tuKhoa,
        loaiPhong: boLocPhong.loaiPhong,
        toaNha: boLocPhong.toaNha,
        trang: boLocPhong.trang,
        gioiHan: boLocPhong.gioiHan
      });

      const res = await fetch(`/api/phong?${thamSo.toString()}`);
      if (!res.ok) {
        throw new Error('Lỗi tải danh sách phòng');
      }

      const ketQua = await res.json();
      if (!ketQua.thanhCong) return;

      const { duLieu, phanTrang, thongKe } = ketQua;

      // Cập nhật 5 thẻ KPI
      if (thongKe) {
        if (kpiTongPhong) kpiTongPhong.textContent = thongKe.tongSoPhong || 0;
        if (kpiLyThuyet) kpiLyThuyet.textContent = thongKe.soLyThuyet || 0;
        if (kpiHoiTruong) kpiHoiTruong.textContent = thongKe.soHoiTruong || 0;
        if (kpiMayTinh) kpiMayTinh.textContent = thongKe.soMayTinh || 0;
        if (kpiThiNghiem) kpiThiNghiem.textContent = thongKe.soThiNghiem || 0;
      }

      if (demKetQuaPhong && phanTrang) {
        demKetQuaPhong.textContent = `${phanTrang.tongSoPhong} phòng`;
      }

      // Nạp danh sách tòa nhà vào select #locToaNha nếu chưa có
      if (locToaNha && locToaNha.options.length <= 1) {
        const danhSachToa = [
          'A2', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9',
          'C1', 'D1', 'D3', 'D4', 'D5', 'D6', 'D7', 'E', 'E1', 'E2', 'E3', 'E4', 'E5', 'I1'
        ];
        danhSachToa.forEach(toa => {
          const opt = document.createElement('option');
          opt.value = toa;
          opt.textContent = `Tòa ${toa}`;
          locToaNha.appendChild(opt);
        });
      }

      // Xóa dữ liệu cũ trong bảng
      thanBangPhong.replaceChildren();

      if (!duLieu || duLieu.length === 0) {
        const trTrong = document.createElement('tr');
        const tdTrong = document.createElement('td');
        tdTrong.colSpan = 5;
        tdTrong.className = 'text-center py-4 text-muted small';
        tdTrong.textContent = 'Không tìm thấy phòng học nào phù hợp với bộ lọc.';
        trTrong.appendChild(tdTrong);
        thanBangPhong.appendChild(trTrong);
      } else {
        const mauHang = document.getElementById('mauHangPhong');
        duLieu.forEach(p => {
          let hang;
          if (mauHang && 'content' in mauHang) {
            hang = mauHang.content.cloneNode(true);
          } else {
            return;
          }

          const oMa = hang.querySelector('.cot-ma-phong');
          const oTen = hang.querySelector('.cot-ten-phong');
          const oLoai = hang.querySelector('.cot-loai-phong');
          const oViTri = hang.querySelector('.cot-vi-tri');
          const oSoLuot = hang.querySelector('.cot-so-luot');
          const nutSua = hang.querySelector('.nut-sua-phong');
          const nutXoa = hang.querySelector('.nut-xoa-phong');

          if (oMa) oMa.textContent = p.ma_phong_chuan || p.ten_phong;
          if (oTen) oTen.textContent = p.ten_phong;
          if (oLoai) {
            oLoai.textContent = p.loai_phong;
            if (p.loai_phong === 'Hội trường') {
              oLoai.className = 'cot-loai-phong badge-phong-hoi-truong';
            } else if (p.loai_phong === 'Phòng máy tính thực hành') {
              oLoai.className = 'cot-loai-phong badge-phong-may-tinh';
            } else if (p.loai_phong === 'Phòng thực hành - thí nghiệm') {
              oLoai.className = 'cot-loai-phong badge-phong-thi-nghiem';
            } else {
              oLoai.className = 'cot-loai-phong badge-phong-ly-thuyet';
            }
          }
          if (oViTri) oViTri.textContent = p.vi_tri || `${p.toa_nha || ''} (${p.khu_vuc || ''})`;
          if (oSoLuot) {
            oSoLuot.textContent = p.so_luot_bao_hong || 0;
            if (p.so_luot_bao_hong > 0) {
              oSoLuot.className = 'cot-so-luot badge bg-primary text-white font-mono';
            }
          }

          if (nutSua) {
            nutSua.addEventListener('click', () => moModalSuaPhong(p));
          }

          if (nutXoa) {
            if (p.so_luot_bao_hong > 0) {
              nutXoa.title = `Không thể xóa vì có ${p.so_luot_bao_hong} yêu cầu báo hỏng trong lịch sử`;
            }
            nutXoa.addEventListener('click', () => xuLyXoaPhong(p));
          }

          thanBangPhong.appendChild(hang);
        });
      }

      // Cập nhật phân trang
      if (thongTinPhanTrangPhong && phanTrang) {
        const tuHang = phanTrang.tongSoPhong === 0 ? 0 : (phanTrang.trangHienTai - 1) * phanTrang.gioiHan + 1;
        const denHang = Math.min(phanTrang.trangHienTai * phanTrang.gioiHan, phanTrang.tongSoPhong);
        thongTinPhanTrangPhong.textContent = `Hiển thị ${tuHang} - ${denHang} trên tổng số ${phanTrang.tongSoPhong} phòng`;
      }

      if (soTrangHienTaiPhong && phanTrang) {
        soTrangHienTaiPhong.textContent = `Trang ${phanTrang.trangHienTai} / ${phanTrang.tongSoTrang}`;
      }

      if (nutTrangTruocPhong && phanTrang) {
        nutTrangTruocPhong.disabled = phanTrang.trangHienTai <= 1;
      }
      if (nutTrangSauPhong && phanTrang) {
        nutTrangSauPhong.disabled = phanTrang.trangHienTai >= phanTrang.tongSoTrang;
      }

    } catch (loi) {
      console.error('Lỗi nạp danh sách phòng:', loi);
    }
  }

  function moModalThemPhong() {
    if (!bsModalPhong) return;
    if (bieuMauPhong) bieuMauPhong.reset();
    if (phongHienTaiId) phongHienTaiId.value = '';
    if (tieuDeModalPhong) tieuDeModalPhong.textContent = 'Thêm phòng học mới';
    if (hopLoiPhong) {
      hopLoiPhong.classList.add('d-none');
      hopLoiPhong.textContent = '';
    }
    capNhatGoiYPhong();
    bsModalPhong.show();
  }

  function moModalSuaPhong(phong) {
    if (!bsModalPhong) return;
    if (bieuMauPhong) bieuMauPhong.reset();
    if (phongHienTaiId) phongHienTaiId.value = phong.ma_phong;
    if (nhapMaPhongChuan) nhapMaPhongChuan.value = phong.ma_phong_chuan || phong.ten_phong.replace(/^(phòng|hội trường)\s+/i, '');
    if (nhapLoaiPhong) nhapLoaiPhong.value = phong.loai_phong || 'Phòng lý thuyết';
    if (tieuDeModalPhong) tieuDeModalPhong.textContent = `Cập nhật phòng học [${phong.ten_phong}]`;
    if (hopLoiPhong) {
      hopLoiPhong.classList.add('d-none');
      hopLoiPhong.textContent = '';
    }
    capNhatGoiYPhong();
    bsModalPhong.show();
  }

  if (bieuMauPhong) {
    bieuMauPhong.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (hopLoiPhong) {
        hopLoiPhong.classList.add('d-none');
        hopLoiPhong.textContent = '';
      }

      const id = phongHienTaiId ? phongHienTaiId.value : '';
      const maChuan = nhapMaPhongChuan ? nhapMaPhongChuan.value.trim().toUpperCase() : '';
      const loai = nhapLoaiPhong ? nhapLoaiPhong.value : 'Phòng lý thuyết';

      if (!maChuan) {
        if (hopLoiPhong) {
          hopLoiPhong.textContent = 'Vui lòng nhập mã phòng chuẩn TVU.';
          hopLoiPhong.classList.remove('d-none');
        }
        return;
      }

      const laThem = !id;
      const url = laThem ? '/api/phong' : `/api/phong/${id}`;
      const method = laThem ? 'POST' : 'PUT';

      try {
        if (nutLuuPhong) {
          nutLuuPhong.disabled = true;
          nutLuuPhong.textContent = 'Đang lưu...';
        }

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ma_phong_chuan: maChuan,
            loai_phong: loai
          })
        });

        const ketQua = await res.json();
        if (!res.ok || !ketQua.thanhCong) {
          if (hopLoiPhong) {
            hopLoiPhong.textContent = ketQua.loi || 'Không thể lưu thông tin phòng.';
            hopLoiPhong.classList.remove('d-none');
          }
          return;
        }

        if (bsModalPhong) bsModalPhong.hide();
        thongBaoThanhCong(ketQua.thongBao || (laThem ? 'Thêm phòng thành công' : 'Cập nhật phòng thành công'));
        await taiDanhSachPhong();
        await taiDanhMucHeThong();
      } catch (err) {
        console.error('Lỗi lưu phòng:', err);
        if (hopLoiPhong) {
          hopLoiPhong.textContent = 'Lỗi kết nối máy chủ.';
          hopLoiPhong.classList.remove('d-none');
        }
      } finally {
        if (nutLuuPhong) {
          nutLuuPhong.disabled = false;
          nutLuuPhong.textContent = 'Lưu thông tin';
        }
      }
    });
  }

  async function xuLyXoaPhong(phong) {
    if (phong.so_luot_bao_hong > 0) {
      await Swal.fire({
        title: 'Không thể xóa phòng này',
        text: `Phòng [${phong.ten_phong}] đang có ${phong.so_luot_bao_hong} yêu cầu báo hỏng gắn liền trong lịch sử. Hệ thống ngăn chặn việc xóa để đảm bảo toàn vẹn dữ liệu.`,
        icon: 'warning',
        confirmButtonColor: '#2563EB',
        confirmButtonText: 'Đã hiểu'
      });
      return;
    }

    const dongY = await xacNhanHanhDong({
      tieuDe: `Xóa phòng [${phong.ten_phong}]?`,
      noiDung: 'Thao tác này sẽ xóa vĩnh viễn phòng học khỏi danh mục hệ thống.',
      nutDongY: 'Xóa phòng',
      nutHuy: 'Hủy bỏ',
      loai: 'warning'
    });

    if (!dongY) return;

    try {
      const res = await fetch(`/api/phong/${phong.ma_phong}`, {
        method: 'DELETE'
      });
      const ketQua = await res.json();

      if (!res.ok || !ketQua.thanhCong) {
        thongBaoCanhBao(ketQua.loi || 'Không thể xóa phòng học.');
        return;
      }

      thongBaoThanhCong(ketQua.thongBao || 'Đã xóa phòng thành công.');
      await taiDanhSachPhong();
      await taiDanhMucHeThong();
    } catch (err) {
      console.error('Lỗi xóa phòng:', err);
      thongBaoLoi('Lỗi kết nối khi xóa phòng.');
    }
  }

  // Sự kiện bộ lọc Tab 4
  let timerTimKiemPhong = null;
  if (timKiemPhong) {
    timKiemPhong.addEventListener('input', () => {
      clearTimeout(timerTimKiemPhong);
      timerTimKiemPhong = setTimeout(() => {
        boLocPhong.tuKhoa = timKiemPhong.value.trim();
        boLocPhong.trang = 1;
        taiDanhSachPhong();
      }, 300);
    });
  }

  if (locLoaiPhong) {
    locLoaiPhong.addEventListener('change', () => {
      boLocPhong.loaiPhong = locLoaiPhong.value;
      boLocPhong.trang = 1;
      taiDanhSachPhong();
    });
  }

  if (locToaNha) {
    locToaNha.addEventListener('change', () => {
      boLocPhong.toaNha = locToaNha.value;
      boLocPhong.trang = 1;
      taiDanhSachPhong();
    });
  }

  if (nutXoaLocPhong) {
    nutXoaLocPhong.addEventListener('click', () => {
      if (timKiemPhong) timKiemPhong.value = '';
      if (locLoaiPhong) locLoaiPhong.value = '';
      if (locToaNha) locToaNha.value = '';
      boLocPhong.tuKhoa = '';
      boLocPhong.loaiPhong = '';
      boLocPhong.toaNha = '';
      boLocPhong.trang = 1;
      taiDanhSachPhong();
    });
  }

  if (nutThemPhong) {
    nutThemPhong.addEventListener('click', moModalThemPhong);
  }

  if (nutTrangTruocPhong) {
    nutTrangTruocPhong.addEventListener('click', () => {
      if (boLocPhong.trang > 1) {
        boLocPhong.trang--;
        taiDanhSachPhong();
      }
    });
  }

  if (nutTrangSauPhong) {
    nutTrangSauPhong.addEventListener('click', () => {
      boLocPhong.trang++;
      taiDanhSachPhong();
    });
  }

  // =========================================================================
  // 14. ĐỒNG BỘ TỰ ĐỘNG THÔNG MINH (POLLING 20S)
  // =========================================================================
  function batDauDongBoTuDong() {
    thoiGianPollingInterval = setInterval(() => {
      // Chỉ đồng bộ khi tab trình duyệt đang mở và không có Modal nào đang hiển thị
      const tabDangXem = document.visibilityState === 'visible';
      const coModalDangMo = document.querySelector('.modal.show') !== null;

      if (tabDangXem && !coModalDangMo) {
        if (!khuVucTabYeuCau.classList.contains('d-none')) {
          taiDanhSachYeuCau();
        } else if (khuVucTabBaoCao && !khuVucTabBaoCao.classList.contains('d-none')) {
          taiBaoCaoHieuSuat();
        } else if (khuVucTabNhanSu && !khuVucTabNhanSu.classList.contains('d-none')) {
          taiDanhSachNhanSu();
        } else if (khuVucTabPhong && !khuVucTabPhong.classList.contains('d-none')) {
          taiDanhSachPhong();
        }
      }
    }, 20000); // 20 giây
  }

  // =========================================================================
  // 15. KHỞI CHẠY LẦN ĐẦU
  // =========================================================================
  async function khoiTao() {
    await taiThongTinNguoiDung();
    await taiDanhMucHeThong();
    await taiDanhSachYeuCau();
    batDauDongBoTuDong();
  }

  khoiTao();
});
