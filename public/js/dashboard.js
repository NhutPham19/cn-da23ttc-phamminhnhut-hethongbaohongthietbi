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
  const toastThongBaoEl = document.getElementById('toastThongBao');

  const bsModalChiTiet = modalChiTietEl ? new bootstrap.Modal(modalChiTietEl) : null;
  const bsModalCapNhat = modalCapNhatEl ? new bootstrap.Modal(modalCapNhatEl) : null;
  const bsModalPhanCong = modalPhanCongEl ? new bootstrap.Modal(modalPhanCongEl) : null;
  const bsModalNguoiDung = modalNguoiDungEl ? new bootstrap.Modal(modalNguoiDungEl) : null;
  let bsModalDoiMatKhau = modalDoiMatKhauEl ? new bootstrap.Modal(modalDoiMatKhauEl) : null;
  const bsToast = toastThongBaoEl ? new bootstrap.Toast(toastThongBaoEl, { delay: 6000 }) : null;

  // DOM Elements
  const tabYeuCau = document.getElementById('tabYeuCau');
  const tabBaoCao = document.getElementById('tabBaoCao');
  const tabNhanSu = document.getElementById('tabNhanSu');
  const khuVucTabYeuCau = document.getElementById('khuVucTabYeuCau');
  const khuVucTabBaoCao = document.getElementById('khuVucTabBaoCao');
  const khuVucTabNhanSu = document.getElementById('khuVucTabNhanSu');
  const thanBangNhanSu = document.getElementById('thanBangNhanSu');
  const nutThemNhanSu = document.getElementById('nutThemNhanSu');
  const bieuMauNguoiDung = document.getElementById('bieuMauNguoiDung');
  const nutMoModalDoiMatKhau = document.getElementById('nutMoModalDoiMatKhau');
  const bieuMauDoiMatKhau = document.getElementById('bieuMauDoiMatKhau');
  const nutXuatCsv = document.getElementById('nutXuatCsv');

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

      // Nút phân công KTV trong Modal
      const nutMoModalPhanCong = document.getElementById('nutMoModalPhanCong');
      if (nutMoModalPhanCong) {
        if (laAdmin) nutMoModalPhanCong.classList.remove('d-none');
        else nutMoModalPhanCong.classList.add('d-none');
      }

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

        phanCongMaKtv.innerHTML = '<option value="">-- Chọn kỹ thuật viên --</option>';
        danhSachKtvCache.forEach(ktv => {
          const opt = document.createElement('option');
          opt.value = ktv.ma_nguoi_dung;
          opt.textContent = `${ktv.ho_ten} (${ktv.email || 'KTV'})`;
          phanCongMaKtv.appendChild(opt);
        });
      }
    } catch (loi) {
      console.warn('Lỗi lấy danh mục hệ thống:', loi);
    }
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

      // 1. Mã YC & Thời gian tạo
      const dongMaYc = clone.querySelector('.dong-ma-yc');
      const dongThoiGian = clone.querySelector('.dong-thoi-gian-tao');
      dongMaYc.textContent = yc.ma_yeu_cau || `#${yc.ma_yeu_cau_bao_hong}`;
      dongThoiGian.textContent = dinhDangNgayGio(yc.thoi_gian_tao);

      // 2. Thiết bị & Loại
      const dongTenThietBi = clone.querySelector('.dong-ten-thiet-bi');
      const dongTenDanhMuc = clone.querySelector('.dong-ten-danh-muc');
      dongTenThietBi.textContent = yc.ten_thiet_bi || 'Thiết bị chưa đặt tên';
      dongTenDanhMuc.textContent = yc.danh_muc ? yc.danh_muc.ten_loai : 'Chưa phân loại';

      // 3. Vị trí / Phòng
      const dongViTriPhong = clone.querySelector('.dong-vi-tri-phong');
      dongViTriPhong.textContent = (yc.phong_hoc ? yc.phong_hoc.ten_phong : yc.vi_tri_phong) || 'Chưa rõ vị trí';

      // 4. Mức ưu tiên
      const dongMucUuTien = clone.querySelector('.dong-muc-uu-tien');
      const utInfo = layNhanMucUuTien(yc.muc_do_uu_tien);
      dongMucUuTien.textContent = utInfo.chu;
      dongMucUuTien.style = utInfo.style;

      // 5. Trạng thái (Pastel Badge)
      const dongTrangThai = clone.querySelector('.dong-trang-thai');
      const chuTrangThai = clone.querySelector('.chu-trang-thai');
      const ttInfo = layNhanTrangThai(yc.trang_thai);
      dongTrangThai.className = `dong-trang-thai huy-hieu-tt ${ttInfo.lop}`;
      chuTrangThai.textContent = ttInfo.chu;

      // 6. KTV phụ trách
      const dongKtv = clone.querySelector('.dong-ktv-phu-trach');
      if (yc.ky_thuat_vien) {
        dongKtv.textContent = yc.ky_thuat_vien.ho_ten;
        dongKtv.className = 'dong-ktv-phu-trach fw-semibold text-dark';
      } else {
        dongKtv.textContent = 'Chưa phân công';
        dongKtv.className = 'dong-ktv-phu-trach text-muted fst-italic';
      }

      // 7. Thao tác (Tối đa 2 nút)
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
    thongTinTrang.innerHTML = `Hiển thị từ <strong>${batDau}</strong> đến <strong>${ketThuc}</strong> trên tổng số <strong>${tongSo}</strong> lượt yêu cầu (Trang <strong>${boLoc.trang}/${soTrang}</strong>)`;

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
  // 8. MODAL CHI TIẾT YÊU CẦU (BỐ CỤC 2 CỘT KÈM AUDIT LOG)
  // =========================================================================
  async function moModalChiTiet(maYcBaoHong) {
    try {
      const phanHoi = await fetch(`/api/yeu-cau/${maYcBaoHong}`);
      if (!phanHoi.ok) return;

      const ketQua = await phanHoi.json();
      yeuCauDangXem = ketQua.duLieu;
      if (!yeuCauDangXem) return;

      // Cột trái: Thông tin sự cố
      document.getElementById('chiTietMaYc').textContent = yeuCauDangXem.ma_yeu_cau || `#${yeuCauDangXem.ma_yeu_cau_bao_hong}`;
      document.getElementById('chiTietThoiGianTao').textContent = `Thời gian tạo: ${dinhDangNgayGio(yeuCauDangXem.thoi_gian_tao)}`;
      
      const badgeTrangThai = document.getElementById('chiTietTrangThaiBadge');
      const ttInfo = layNhanTrangThai(yeuCauDangXem.trang_thai);
      badgeTrangThai.className = `huy-hieu-tt ${ttInfo.lop}`;
      badgeTrangThai.textContent = ttInfo.chu;

      document.getElementById('chiTietTenThietBi').textContent = yeuCauDangXem.ten_thiet_bi || '-';
      const badgeDanhMuc = document.getElementById('chiTietDanhMucBadge');
      if (badgeDanhMuc) {
        badgeDanhMuc.textContent = yeuCauDangXem.danh_muc ? yeuCauDangXem.danh_muc.ten_loai : 'Chưa phân loại';
      }
      document.getElementById('chiTietViTriPhong').textContent = (yeuCauDangXem.phong_hoc ? yeuCauDangXem.phong_hoc.ten_phong : yeuCauDangXem.vi_tri_phong) || '-';

      const mucUtEl = document.getElementById('chiTietMucUuTien');
      const utInfo = layNhanMucUuTien(yeuCauDangXem.muc_do_uu_tien);
      mucUtEl.textContent = utInfo.chu;
      mucUtEl.style = utInfo.style;
      mucUtEl.className = 'badge';

      document.getElementById('chiTietMoTaLoi').textContent = yeuCauDangXem.moTaLoi || yeuCauDangXem.mo_ta_loi || 'Không có mô tả chi tiết';

      // Ghi chú kết quả
      const khungGhiChu = document.getElementById('khungGhiChuKetQua');
      const chiTietGhiChu = document.getElementById('chiTietGhiChuKetQua');
      if (yeuCauDangXem.ghi_chu_ket_qua) {
        chiTietGhiChu.textContent = yeuCauDangXem.ghi_chu_ket_qua;
        khungGhiChu.classList.remove('d-none');
      } else {
        khungGhiChu.classList.add('d-none');
      }

      // Hình ảnh hiện trường
      const khungCoAnh = document.getElementById('khungCoAnh');
      const khungKhongAnh = document.getElementById('khungKhongAnh');
      const chiTietHinhAnh = document.getElementById('chiTietHinhAnh');
      const linkAnhGoc = document.getElementById('linkAnhGoc');

      if (yeuCauDangXem.duong_dan_anh) {
        chiTietHinhAnh.src = yeuCauDangXem.duong_dan_anh;
        linkAnhGoc.href = yeuCauDangXem.duong_dan_anh;
        khungCoAnh.classList.remove('d-none');
        khungKhongAnh.classList.add('d-none');
      } else {
        khungCoAnh.classList.add('d-none');
        khungKhongAnh.classList.remove('d-none');
      }

      // Cột phải: Dòng thời gian Nhật ký xử lý (Audit Log)
      const danhSachLichSu = document.getElementById('danhSachLichSuXuLy');
      danhSachLichSu.innerHTML = '';

      const nhatKy = yeuCauDangXem.lich_su_xu_ly || [];
      if (nhatKy.length === 0) {
        danhSachLichSu.innerHTML = '<div class="small text-muted fst-italic">Chưa có nhật ký ghi nhận</div>';
      } else {
        nhatKy.forEach(item => {
          const cloneItem = mauMucLichSu.content.cloneNode(true);
          const tieuDe = cloneItem.querySelector('.lich-su-tieu-de');
          const thoiGian = cloneItem.querySelector('.lich-su-thoi-gian');
          const ghiChu = cloneItem.querySelector('.lich-su-ghi-chu');

          const tt = layNhanTrangThai(item.trang_thai);
          tieuDe.textContent = `${tt.chu} (${item.nguoi_thuc_hien || 'Hệ thống'})`;
          thoiGian.textContent = dinhDangNgayGio(item.thoi_gian_ghi || item.thoi_gian_tao);
          ghiChu.textContent = item.ghi_chu || '';

          danhSachLichSu.appendChild(cloneItem);
        });
      }

      // KTV Phụ trách ở Footer Modal
      document.getElementById('chiTietKtvPhuTrach').textContent = yeuCauDangXem.ky_thuat_vien ? yeuCauDangXem.ky_thuat_vien.ho_ten : 'Chưa phân công';

      // Nút hành động chính ở Footer Modal
      const nutChinhModal = document.getElementById('nutHanhDongChinhModal');
      if (yeuCauDangXem.trang_thai === 'CHO_XU_LY') {
        nutChinhModal.classList.remove('d-none');
        nutChinhModal.textContent = 'Tiếp nhận yêu cầu này';
        nutChinhModal.onclick = () => {
          if (bsModalChiTiet) bsModalChiTiet.hide();
          xuLyTiepNhanNhanh(yeuCauDangXem);
        };
      } else if (yeuCauDangXem.trang_thai === 'DANG_XU_LY') {
        const laAdmin = nguoiDungHienTai?.vai_tro === 'ADMIN';
        const laNguoiPhuTrach = yeuCauDangXem.ma_ky_thuat_vien === nguoiDungHienTai?.ma_nguoi_dung;
        if (laAdmin || laNguoiPhuTrach) {
          nutChinhModal.classList.remove('d-none');
          nutChinhModal.textContent = 'Hoàn thành yêu cầu';
          nutChinhModal.onclick = () => {
            if (bsModalChiTiet) bsModalChiTiet.hide();
            moModalCapNhat(yeuCauDangXem, 'HOAN_THANH');
          };
        } else {
          nutChinhModal.classList.add('d-none');
        }
      } else {
        nutChinhModal.classList.add('d-none');
      }

      if (bsModalChiTiet) bsModalChiTiet.show();
    } catch (loi) {
      console.error('Lỗi mở chi tiết yêu cầu:', loi);
    }
  }

  // Nút mở Modal Phân công từ Modal Chi tiết
  const nutMoModalPhanCong = document.getElementById('nutMoModalPhanCong');
  if (nutMoModalPhanCong) {
    nutMoModalPhanCong.addEventListener('click', () => {
      if (!yeuCauDangXem) return;
      if (bsModalChiTiet) bsModalChiTiet.hide();
      moModalPhanCong(yeuCauDangXem);
    });
  }

  // Nút Hủy yêu cầu từ Modal Chi tiết
  const nutYeuCauHuy = document.getElementById('nutYeuCauHuy');
  if (nutYeuCauHuy) {
    nutYeuCauHuy.addEventListener('click', () => {
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
    document.getElementById('phanCongMaKtv').value = yc.ma_ky_thuat_vien || '';

    if (bsModalPhanCong) bsModalPhanCong.show();
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
      khuVucTabYeuCau.classList.remove('d-none');
      if (khuVucTabBaoCao) khuVucTabBaoCao.classList.add('d-none');
      if (khuVucTabNhanSu) khuVucTabNhanSu.classList.add('d-none');
    });
  }

  if (tabBaoCao) {
    tabBaoCao.addEventListener('click', () => {
      tabBaoCao.classList.add('active');
      tabYeuCau.classList.remove('active');
      if (tabNhanSu) tabNhanSu.classList.remove('active');
      khuVucTabBaoCao.classList.remove('d-none');
      khuVucTabYeuCau.classList.add('d-none');
      if (khuVucTabNhanSu) khuVucTabNhanSu.classList.add('d-none');
      taiBaoCaoHieuSuat();
    });
  }

  if (tabNhanSu) {
    tabNhanSu.addEventListener('click', () => {
      tabNhanSu.classList.add('active');
      tabYeuCau.classList.remove('active');
      if (tabBaoCao) tabBaoCao.classList.remove('active');
      if (khuVucTabNhanSu) khuVucTabNhanSu.classList.remove('d-none');
      khuVucTabYeuCau.classList.add('d-none');
      if (khuVucTabBaoCao) khuVucTabBaoCao.classList.add('d-none');
      taiDanhSachNhanSu();
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
      const phanHoi = await fetch('/api/nguoi-dung', {
        headers: { 'Accept': 'application/json' }
      });
      if (!phanHoi.ok) return;

      const ketQua = await phanHoi.json();
      const danhSach = ketQua.duLieu || [];

      thanBangNhanSu.innerHTML = '';
      if (danhSach.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.className = 'text-center text-muted py-4 fst-italic';
        td.textContent = 'Chưa có dữ liệu nhân sự';
        tr.appendChild(td);
        thanBangNhanSu.appendChild(tr);
        return;
      }

      danhSach.forEach((u) => {
        const tr = document.createElement('tr');

        // 1. Mã NV
        const tdMa = document.createElement('td');
        tdMa.className = 'font-mono fw-bold text-dark';
        tdMa.textContent = `#NV${u.ma_nguoi_dung}`;
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
        badgeVaiTro.className = u.vai_tro === 'ADMIN'
          ? 'badge bg-primary-subtle text-primary border border-primary-subtle'
          : 'badge bg-light text-secondary border';
        badgeVaiTro.textContent = u.vai_tro === 'ADMIN' ? 'ADMIN' : 'KTV';
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

        // Nút Sửa
        const nutSua = document.createElement('button');
        nutSua.type = 'button';
        nutSua.className = 'btn btn-sm btn-phu';
        nutSua.textContent = 'Sửa';
        nutSua.addEventListener('click', () => moModalSuaNhanSu(u));
        divNut.appendChild(nutSua);

        // Nút Khóa / Mở khóa
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
