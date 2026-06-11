-- ============================================================
-- SUPABASE MIGRATION — Webapp Ghi Chỉ Số PCVT
-- Chạy script này trong Supabase SQL Editor (1 lần duy nhất)
-- ============================================================

-- 1. Bảng KHÁCH HÀNG (~25k dòng)
CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    "MA_KHANG" TEXT NOT NULL,
    "TEN_KHANG" TEXT,
    "MA_DDO" TEXT,
    "SO_CTO" TEXT,
    "MA_TRAM" TEXT,
    "MA_GHI_CHU" TEXT,
    "BCS" TEXT,
    "DIA_CHI" TEXT,
    "DTHOAI" TEXT,
    "LONGITUDE" TEXT,
    "LATITUDE" TEXT,
    "SLUONG_3" NUMERIC DEFAULT 0,
    "SLUONG_2" NUMERIC DEFAULT 0,
    "SLUONG_1" NUMERIC DEFAULT 0,
    "CHISO_CU" TEXT DEFAULT '',
    "PHONG_DOI" TEXT,
    "ASSIGN" TEXT,
    "USER" TEXT DEFAULT '',
    "CHI_SO" TEXT DEFAULT '',
    "THOIGIAN_GHI" TEXT DEFAULT '',
    "GHI_CHU" TEXT DEFAULT '',
    "MA_SOGCS" TEXT,
    "HS_NHAN" NUMERIC DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE("MA_KHANG", "BCS")
);

-- Indexes cho truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_customers_assign ON customers("ASSIGN");
CREATE INDEX IF NOT EXISTS idx_customers_ma_tram ON customers("MA_TRAM");
CREATE INDEX IF NOT EXISTS idx_customers_ma_sogcs ON customers("MA_SOGCS");
CREATE INDEX IF NOT EXISTS idx_customers_ma_khang ON customers("MA_KHANG");
CREATE INDEX IF NOT EXISTS idx_customers_phong_doi ON customers("PHONG_DOI");

-- 2. Bảng NGƯỜI DÙNG (~50 dòng)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    "STT" INTEGER,
    "MSNV" TEXT UNIQUE NOT NULL,
    "HO_TEN" TEXT NOT NULL,
    "ROLE" TEXT DEFAULT 'user',
    "DON_VI" TEXT
);

-- 3. Bảng TRẠM BIẾN ÁP (~500 dòng)
CREATE TABLE IF NOT EXISTS stations (
    id BIGSERIAL PRIMARY KEY,
    "STT" INTEGER,
    "Mã TTG" TEXT,
    "Tên TTG" TEXT,
    "Mã TD" TEXT,
    "Tên TD" TEXT,
    "TBTID" TEXT,
    "TBTID (cũ)" TEXT,
    "Danh số trạm" TEXT,
    "Tên TBA" TEXT,
    "Tên TBA (cũ)" TEXT,
    "Loại trạm" TEXT,
    "Số trụ" TEXT,
    "Công suất" NUMERIC,
    "Pha" INTEGER,
    "Số MBA" INTEGER,
    "Kiểu trạm" TEXT,
    "Hiệu máy" TEXT,
    "Năm VH" INTEGER,
    "X" NUMERIC,
    "Y" NUMERIC,
    "Imax" NUMERIC,
    "Idm" NUMERIC,
    "Thời điểm Imax" TEXT
);

-- 4. Bảng METADATA (theo dõi lần sync gần nhất)
CREATE TABLE IF NOT EXISTS sync_metadata (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL UNIQUE,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    row_count INTEGER DEFAULT 0,
    synced_by TEXT
);

INSERT INTO sync_metadata (table_name) VALUES ('customers'), ('users'), ('stations')
ON CONFLICT (table_name) DO NOTHING;

-- 5. Row Level Security — cho phép public access qua anon key
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_customers" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_read_stations" ON stations FOR SELECT USING (true);
CREATE POLICY "allow_all_stations" ON stations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_sync_metadata" ON sync_metadata FOR ALL USING (true) WITH CHECK (true);

-- 6. Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 7. RPC function: Lấy hash của bảng customers để kiểm tra thay đổi
CREATE OR REPLACE FUNCTION get_customers_hash()
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    SELECT md5(string_agg(
        COALESCE("MA_KHANG", '') || COALESCE("CHI_SO", '') || COALESCE("USER", '') || COALESCE("THOIGIAN_GHI", ''),
        '|' ORDER BY "MA_KHANG"
    )) INTO result
    FROM customers;
    RETURN COALESCE(result, '');
END;
$$ LANGUAGE plpgsql;
