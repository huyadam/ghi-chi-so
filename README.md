# Webapp Ghi Chỉ Số — PC Vũng Tàu (PCVT)

Ứng dụng web hỗ trợ nhân viên ghi chỉ số công tơ điện tại đơn vị: phân công theo nhân viên/sổ GCS/trạm, nhập chỉ số có cảnh báo sản lượng bất thường, cập nhật tọa độ điểm đo, tổng hợp tiến độ và quản trị (ghi tự động hàng loạt, đồng bộ dữ liệu).

## Kiến trúc

- **Frontend:** React 19 + Vite 6 + TypeScript + TailwindCSS 4. Mobile-first.
- **Dữ liệu:** Google Sheet là nguồn nhập liệu gốc → Google Apps Script (GAS) đồng bộ sang **Supabase (Postgres)**. Web app đọc/ghi **trực tiếp Supabase** để có độ trễ thấp.
- **Cache offline:** IndexedDB theo mô hình *stale-while-revalidate* (`src/lib/cache.ts`).
- **Tách lớp:** mọi truy cập dữ liệu đi qua `src/lib/api.ts`; component không gọi thẳng Supabase.

## Cấu trúc

| Thành phần | Vai trò |
|---|---|
| `src/components/Login.tsx` | Đăng nhập bằng MSNV |
| `src/components/Layout.tsx` | Khung app, tải dữ liệu, điều hướng tab |
| `src/components/UpdateReading.tsx` | Nhập chỉ số, tọa độ (màn hình chính) |
| `src/components/Overview.tsx` | Tổng hợp tiến độ |
| `src/components/AdminManagement.tsx` | Ghi tự động hàng loạt, đồng bộ, export |
| `src/components/StationConnection.tsx` | Tra cứu trạm/điểm đo |
| `src/lib/api.ts` | Lớp truy cập Supabase |
| `code_GAS.js` | Apps Script: đồng bộ Sheet ⇄ Supabase |
| `supabase-migration.sql` | Tạo bảng/index/RLS lần đầu |
| `supabase-hardening.sql` | **Siết RLS theo vai trò (khuyến nghị chạy)** |
| `REVIEW.md` | Báo cáo review mã nguồn & lộ trình nâng cấp |

## Chạy local

Yêu cầu: Node.js 18+.

```bash
npm install
cp .env.example .env   # điền VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GAS_URL
npm run dev            # http://localhost:3000
```

## Build & lint

```bash
npm run lint    # tsc --noEmit (type-check)
npm run build   # build production vào dist/
```

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `VITE_SUPABASE_URL` | có | URL project Supabase |
| `VITE_SUPABASE_ANON_KEY` | có | Anon key (public) |
| `VITE_GAS_URL` | tùy chọn | URL Web App của Apps Script (nút đồng bộ) |

> ⚠️ Không commit file `.env`. Xem mục Bảo mật trong `REVIEW.md` trước khi đưa lên production — RLS hiện tại đang mở (`allow_all`) và đăng nhập chỉ bằng MSNV.

---
© 2026 Công ty Điện lực Vũng Tàu (PCVT)
