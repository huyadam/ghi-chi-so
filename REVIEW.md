# Báo cáo Review — Webapp Ghi Chỉ Số PCVT

_Ngày review: 11/06/2026._

## 1. Tổng quan kiến trúc

React 19 + Vite 6 + TypeScript + TailwindCSS 4 (mobile-first). Mô hình dữ liệu **hybrid**: Google Sheet là nguồn nhập liệu gốc → Google Apps Script (GAS) đồng bộ sang **Supabase (Postgres)** → web app đọc/ghi **trực tiếp Supabase**. Có lớp **IndexedDB cache** theo *stale-while-revalidate* cho trải nghiệm offline/tức thời.

**Điểm mạnh:** tách lớp `api.ts` gọn (component không gọi thẳng Supabase); cache + fallback khi mất mạng; phân trang khi tải trạm; UX nhập liệu tốt (điều hướng next/prev, cảnh báo sản lượng bất thường, lấy GPS).

## 2. Lỗi nghiêm trọng — chặn build (ĐÃ SỬA trong lần commit này)

Source đang ở trạng thái **migrate dở dang**: `api.ts` đã chuyển sang Supabase với chữ ký mới, nhưng `UpdateReading.tsx` vẫn gọi theo kiểu GAS cũ.

| Vấn đề | Trước | Sau khi sửa |
|---|---|---|
| `updateReading()` sai thứ tự tham số | `updateReading(_rowIndex, chiSo, user, thoiGian, ghiChu, type, MA_KHANG, BCS)` | `updateReading(MA_KHANG, BCS, chiSo, user, thoiGian, ghiChu, type)` |
| `updateCoordinates()` thừa tham số | `updateCoordinates(_rowIndex, lat, lng, MA_KHANG)` | `updateCoordinates(MA_KHANG, lat, lng)` |
| `_rowIndex` không tồn tại trong type `Customer` | dùng `_rowIndex` định danh | dùng `id` (khóa chính, duy nhất theo MA_KHANG+BCS) |
| 68 byte NUL rác ở cuối `UpdateReading.tsx` | có | đã strip |

Hệ quả nếu không sửa: `npm run build` / `tsc` fail; tính năng **lưu chỉ số** và **cập nhật tọa độ** ghi sai dữ liệu. Lưu ý: bản `dist/` đang deploy được build từ một phiên bản khác (đã đúng) — tức **source ≠ artifact đang chạy**. Sau khi sửa cần **build lại** `dist/`.

## 3. Bảo mật (ưu tiên cao)

### 3.1 RLS mở toang + anon key công khai
`supabase-migration.sql` đặt policy `USING(true) WITH CHECK(true)` `FOR ALL` cho mọi bảng, dùng **anon key** — key này nằm sẵn trong bundle JS frontend. Bất kỳ ai lấy key đều **đọc/sửa/xóa** toàn bộ ~25k khách hàng và bảng `users`.

- **Giảm thiểu ngay:** chạy `supabase-hardening.sql` (kèm trong repo) — siết anon chỉ còn SELECT + UPDATE đúng các cột chỉ số trên `customers`, chặn INSERT/DELETE và mọi ghi lên `users`/`stations`. GAS sync dùng service key nên không ảnh hưởng.
- **Triệt để:** chuyển sang **Supabase Auth** (đăng nhập có mật khẩu), RLS theo `auth.uid()`/role; đẩy thao tác ghi qua **RPC/Edge Function** thay vì cho client `update` bảng trực tiếp.

### 3.2 Đăng nhập chỉ bằng MSNV, không mật khẩu
`Login.tsx` chỉ tra MSNV trong bảng `users`; ai biết/đoán MSNV là vào được. Quyền admin chỉ kiểm ở client (`ROLE.toLowerCase().includes('admin')`) — DB **không** enforce, nên kẻ tấn công gọi thẳng API vẫn ghi được dù không "đăng nhập admin".

- **Đề xuất:** thêm mật khẩu (Supabase Auth email/password hoặc magic link nội bộ); ánh xạ MSNV ↔ tài khoản auth; lưu `ROLE` trong JWT claims và kiểm ở RLS.

### 3.3 Secret trong `.env` bị đóng gói
File `.env` chứa Supabase URL + anon key + GAS URL thật nằm trong zip nguồn (dù `.gitignore` đã loại `.env*`). Anon key vốn là public nên rủi ro chính vẫn là RLS (mục 3.1). **Không commit `.env`** lên Git; nếu repo public, cân nhắc rotate anon key sau khi siết RLS.

## 4. Vấn đề mức trung bình

| # | Vấn đề | Đề xuất |
|---|---|---|
| 4.1 | `autoUpdateReadings` đếm `+= batch.length` kể cả khi MA_KHANG không tồn tại → báo cáo "đã cập nhật N" sai | **ĐÃ SỬA:** đếm theo số dòng thực `.select('id')` trả về |
| 4.2 | `autoUpdateReadings` update theo `MA_KHANG` (không kèm BCS) → KH nhiều BCS bị ghi đè nhiều dòng | Cân nhắc thêm điều kiện BCS nếu chỉ muốn 1 chỉ số/công tơ (hiện coi là chủ ý "ghi tự động toàn bộ công tơ của KH") |
| 4.3 | Tải toàn bộ ~25k khách về client + IndexedDB + `allUsers` vào localStorage | Lọc theo `ASSIGN`/đơn vị **từ server** (`.eq('ASSIGN', ...)`) để nhẹ RAM máy yếu |
| 4.4 | `THOIGIAN_GHI` lưu chuỗi `vi-VN` (string) | Đổi cột sang `timestamptz`, format khi hiển thị → query/sort/báo cáo chuẩn |
| 4.5 | Dùng `alert()` khắp nơi, không có Error Boundary | Thay bằng toast + React Error Boundary |
| 4.6 | README là template AI Studio (GEMINI_API_KEY) | **ĐÃ SỬA:** viết lại đúng dự án |

## 5. Vấn đề nhỏ / chất lượng

- Chưa có CI chạy `npm run lint` (tsc) → lỗi type như mục 2 lọt qua. Nên thêm GitHub Actions: `npm ci && npm run lint && npm run build`.
- Bundle ~1.3 MB (1 file). Cân nhắc code-split `xlsx`/`recharts` (dynamic import) để tải nhanh hơn trên 3G.
- `code_GAS.js` có cả `doGet/doPost` (đường ghi cũ) lẫn sync — nếu không còn dùng đường GAS trực tiếp thì gỡ để giảm bề mặt tấn công.
- Logo dùng link Google Drive (`lh3.googleusercontent.com/d/...`) — dễ chết link; nên đưa ảnh vào `public/`.

## 6. Lộ trình nâng cấp đề xuất

**P0 — Khôi phục build (ĐÃ LÀM):** sửa chữ ký `updateReading`/`updateCoordinates`, bỏ `_rowIndex`, strip NUL, build lại `dist/`.

**P1 — Bảo mật (làm tiếp):**
1. Chạy `supabase-hardening.sql` ngay (giảm thiểu).
2. Triển khai Supabase Auth + RLS theo role; chuyển ghi qua RPC/Edge Function; rotate anon key.

**P2 — Dữ liệu & hiệu năng:** lọc khách theo nhân viên từ server; đổi `THOIGIAN_GHI` sang `timestamptz`; bật bảng `reading_audit`.

**P3 — Chất lượng:** toast + Error Boundary; CI lint/build; code-split; dọn `code_GAS.js`; đưa asset vào `public/`.

---
_Các mục ghi "ĐÃ SỬA"/"ĐÃ LÀM" nằm trong commit kèm báo cáo này._
