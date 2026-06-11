-- ============================================================
-- SUPABASE HARDENING — Webapp Ghi Chỉ Số PCVT
-- Mục tiêu: GIẢM rủi ro của mô hình "anon key + allow_all".
-- Chạy 1 lần trong Supabase SQL Editor SAU supabase-migration.sql.
--
-- ⚠️ LƯU Ý QUAN TRỌNG
-- Đây CHỈ là biện pháp giảm thiểu (defense-in-depth), KHÔNG thay thế
-- xác thực thật. Anon key vẫn bị lộ trong bundle JS của frontend, nên
-- bất kỳ ai cũng có thể ĐỌC dữ liệu và GHI vào các cột chỉ số.
-- Giải pháp triệt để: bật Supabase Auth (đăng nhập có mật khẩu) +
-- RLS theo JWT/role. Xem REVIEW.md mục "Bảo mật".
--
-- Script này tương thích với code hiện tại: app chỉ SELECT mọi bảng và
-- UPDATE các cột chỉ số trên 'customers'. GAS đồng bộ bằng SERVICE key
-- (bỏ qua RLS) nên KHÔNG bị ảnh hưởng.
-- ============================================================

-- ============================================================
-- 1. CUSTOMERS — cho phép SELECT + UPDATE, CHẶN INSERT/DELETE
--    và giới hạn UPDATE chỉ ở các cột nghiệp vụ ghi chỉ số.
-- ============================================================
DROP POLICY IF EXISTS "allow_all_customers" ON customers;

CREATE POLICY "anon_select_customers" ON customers
    FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_customers" ON customers
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Thu hồi mọi quyền ghi cấp-bảng, chỉ cấp lại UPDATE trên các cột cho phép.
REVOKE INSERT, UPDATE, DELETE ON customers FROM anon;
GRANT  SELECT ON customers TO anon;
GRANT  UPDATE ("USER", "CHI_SO", "THOIGIAN_GHI", "GHI_CHU", "LATITUDE", "LONGITUDE")
       ON customers TO anon;
-- => Kẻ tấn công có anon key KHÔNG thể: xoá/chèn khách hàng, sửa
--    ASSIGN/SLUONG/MA_KHANG/CHISO_CU... Chỉ ghi được các cột chỉ số.

-- ============================================================
-- 2. USERS — chỉ ĐỌC (phục vụ đăng nhập), CHẶN mọi ghi.
-- ============================================================
DROP POLICY IF EXISTS "allow_all_users" ON users;

CREATE POLICY "anon_select_users" ON users
    FOR SELECT TO anon USING (true);

REVOKE INSERT, UPDATE, DELETE ON users FROM anon;
GRANT  SELECT ON users TO anon;
-- => Không thể tự thêm tài khoản admin hay đổi ROLE qua anon key.

-- ============================================================
-- 3. STATIONS — chỉ ĐỌC.
-- ============================================================
DROP POLICY IF EXISTS "allow_all_stations" ON stations;
-- Giữ lại policy "allow_read_stations" (SELECT) từ migration.

REVOKE INSERT, UPDATE, DELETE ON stations FROM anon;
GRANT  SELECT ON stations TO anon;

-- ============================================================
-- 4. SYNC_METADATA — chỉ ĐỌC.
-- ============================================================
DROP POLICY IF EXISTS "allow_all_sync_metadata" ON sync_metadata;

CREATE POLICY "anon_select_sync_metadata" ON sync_metadata
    FOR SELECT TO anon USING (true);

REVOKE INSERT, UPDATE, DELETE ON sync_metadata FROM anon;
GRANT  SELECT ON sync_metadata TO anon;

-- ============================================================
-- 5. (TUỲ CHỌN) NHẬT KÝ GHI — audit ai ghi chỉ số, khi nào.
--    Bật để truy vết khi nghi ngờ dữ liệu bị can thiệp.
-- ============================================================
CREATE TABLE IF NOT EXISTS reading_audit (
    id           BIGSERIAL PRIMARY KEY,
    ma_khang     TEXT,
    bcs          TEXT,
    old_chi_so   TEXT,
    new_chi_so   TEXT,
    ghi_boi      TEXT,
    tai_ip       INET DEFAULT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reading_audit ENABLE ROW LEVEL SECURITY;
-- anon chỉ được CHÈN log, không đọc/sửa/xoá.
CREATE POLICY "anon_insert_audit" ON reading_audit
    FOR INSERT TO anon WITH CHECK (true);
REVOKE SELECT, UPDATE, DELETE ON reading_audit FROM anon;
GRANT  INSERT ON reading_audit TO anon;

CREATE OR REPLACE FUNCTION trg_reading_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."CHI_SO" IS DISTINCT FROM OLD."CHI_SO" THEN
        INSERT INTO reading_audit(ma_khang, bcs, old_chi_so, new_chi_so, ghi_boi)
        VALUES (NEW."MA_KHANG", NEW."BCS", OLD."CHI_SO", NEW."CHI_SO", NEW."USER");
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS customers_reading_audit ON customers;
CREATE TRIGGER customers_reading_audit
    AFTER UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION trg_reading_audit();

-- ============================================================
-- HOÀN TẤT. Kiểm tra lại quyền:
--   SELECT grantee, privilege_type, table_name
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'anon' ORDER BY table_name, privilege_type;
-- ============================================================
