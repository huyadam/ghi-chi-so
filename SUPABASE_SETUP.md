# Hướng dẫn cài đặt Supabase cho Webapp Ghi Chỉ Số

## Bước 1: Tạo tài khoản Supabase (miễn phí)

1. Truy cập [https://supabase.com](https://supabase.com)
2. Nhấn **Start your project** → Đăng nhập bằng GitHub hoặc email
3. Nhấn **New Project**
4. Điền thông tin:
   - **Organization**: Chọn hoặc tạo mới (ví dụ: `PCVT`)
   - **Project name**: `ghi-chi-so-pcvt`
   - **Database Password**: Tạo mật khẩu mạnh (lưu lại!)
   - **Region**: `Southeast Asia (Singapore)` ← chọn gần nhất
5. Nhấn **Create new project** và đợi ~2 phút

## Bước 2: Chạy SQL Migration

1. Trong Dashboard Supabase, vào menu **SQL Editor** (biểu tượng cơ sở dữ liệu bên trái)
2. Nhấn **New query**
3. Copy toàn bộ nội dung file `supabase-migration.sql` và paste vào
4. Nhấn **Run** (Ctrl+Enter)
5. Kiểm tra: Vào menu **Table Editor** → phải thấy 4 bảng: `customers`, `users`, `stations`, `sync_metadata`

## Bước 3: Lấy API Keys

1. Vào **Settings** (biểu tượng bánh răng) → **API**
2. Copy 3 giá trị sau:
   - **Project URL**: `https://xxx.supabase.co` 
   - **anon public key**: `eyJhbGci...` (dài ~200 ký tự)
   - **service_role key**: `eyJhbGci...` (dài ~200 ký tự, **BÍ MẬT**)

## Bước 4: Cấu hình Frontend (Vercel)

1. Vào [Vercel Dashboard](https://vercel.com) → chọn project
2. Vào **Settings** → **Environment Variables**
3. Thêm 2 biến:
   - `VITE_SUPABASE_URL` = `https://xxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `eyJhbGci...` (anon key)
4. Nếu chạy local, thêm vào file `.env`:
   ```
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```

## Bước 5: Cấu hình Google Apps Script (Sync)

1. Mở Google Sheet → **Tiện ích mở rộng** → **Apps Script**
2. Trong Apps Script, vào **Project Settings** (biểu tượng bánh răng)
3. Kéo xuống mục **Script Properties** → nhấn **Add script property**
4. Thêm 2 properties:
   - `SUPABASE_URL` = `https://xxx.supabase.co`
   - `SUPABASE_SERVICE_KEY` = `eyJhbGci...` (**service_role key**, KHÔNG phải anon key)
5. Nhấn **Save**
6. Quay lại tab Code, paste code GAS mới (file `code_GAS.js`)
7. Nhấn **Deploy** → **New deployment** → Deploy lại

## Bước 6: Đồng bộ dữ liệu lần đầu

1. Trong Google Sheet, refresh trang
2. Sẽ thấy menu mới: **⚡ Đồng bộ Supabase**
3. Nhấn **⚡ Đồng bộ Supabase** → **Đồng bộ Tất cả**
4. Cấp quyền nếu được yêu cầu (lần đầu)
5. Đợi ~2-3 phút (25k dòng, batch 500/request)
6. Kiểm tra: Vào Supabase **Table Editor** → bảng `customers` phải có ~25k dòng

## Hoàn tất! 🎉

Webapp giờ sẽ:
- **Đọc/ghi** trực tiếp từ Supabase (< 1 giây)
- **Tự kiểm tra** khi mở app xem cần sync không
- Người nhập liệu vẫn paste dữ liệu vào Google Sheet như cũ
- Sau khi paste xong, nhấn menu **Đồng bộ** hoặc webapp tự phát hiện
