# PLAN — Sửa đồng bộ Google Sheet ⇄ Supabase (Webapp Ghi Chỉ Số PCVT)

> Tài liệu này dành cho model thực thi (Antigravity). Làm **đúng thứ tự**, không bỏ bước verify.
> Người ra quyết định đã chốt 3 điều:
> 1. **Nguồn nhập liệu hiện tại = Google Sheet 2** (`1TOeLylAh5S3wdLGZRAl_mkK6OemzcVZm9wgywCiOQLI`). Khi ổn định sẽ đổi sang Sheet 1 (`1RZCMXqFZEpoXLh75LrfsVh3GrrlgTpswxgoltr2cAcU`) — phải làm được bằng 1 thao tác config, không sửa code.
> 2. **Supabase là nguồn gốc (source of truth) cho các cột chỉ số.** GAS sync từ Sheet **KHÔNG được đè** các cột mà web app ghi.
> 3. **KHÔNG còn sync realtime.** Google Sheet chỉ dùng để admin **nhập danh sách khách hàng ban đầu** (1 lần / thỉnh thoảng). Sau đó toàn bộ nghiệp vụ (ghi chỉ số, sửa) làm **trên web app**, không đụng Sheet. ⇒ **Phải XÓA mọi time-driven trigger** chạy sync tự động (xem §11 — đây là nguyên nhân bug "1 phút").

---

## 0. Bối cảnh & kiến trúc

- Google Sheet (nhập tay) → Google Apps Script (GAS) upsert lên **Supabase (Postgres)**.
- Web app React đọc/ghi **trực tiếp Supabase** qua `src/lib/api.ts` (KHÔNG ghi ngược về Sheet).
- File GAS: `code_GAS.js` (bản đầy đủ trong repo). Hướng dẫn deploy: `GAS_SETUP.md`.
- Script GAS đang nằm trong container của **Sheet 2**, nhưng đọc dữ liệu bằng `openById(SHEET_ID)` với `SHEET_ID` hardcode = **Sheet 1**.

## 1. Root cause (đã xác minh)

**Lỗi A — sync kéo nhầm Sheet 1.**
`code_GAS.js` dòng 6: `const SHEET_ID = '1RZCMXqFZEpoXLh75LrfsVh3GrrlgTpswxgoltr2cAcU';` (Sheet 1).
Mọi hàm sync gọi `SpreadsheetApp.openById(SHEET_ID)` → luôn đọc Sheet 1, bất kể script nằm ở container nào. Vì vậy bấm "Đồng bộ" lại nạp dữ liệu Sheet 1.

**Lỗi B — sync đè cột chỉ số (nguy cơ mất dữ liệu).**
`syncCustomersToSupabase` / `syncCustomersToSupabaseQuiet_` build mỗi dòng gồm **tất cả** cột (kể cả `USER`, `CHI_SO`, `THOIGIAN_GHI`, `GHI_CHU`) rồi `POST customers?on_conflict=MA_KHANG,BCS` với header `Prefer: resolution=merge-duplicates`. PostgREST sinh `ON CONFLICT ... DO UPDATE SET <mọi cột có trong payload>`. → Khi conflict, các cột chỉ số trong Sheet (thường rỗng) **ghi đè** chỉ số web app vừa nhập.

> Cơ chế khắc phục B dựa trên đặc tính PostgREST: **chỉ những cột XUẤT HIỆN trong JSON mới nằm trong mệnh đề `DO UPDATE SET`.** Bỏ cột ra khỏi payload ⇒ upsert không đụng tới cột đó khi update (với dòng insert mới, cột bị bỏ nhận default của DB). Bước 5 verify lại bằng thực nghiệm.

## 2. Quyết định kỹ thuật áp dụng

- **SHEET_ID** chuyển thành **Script Property** `SHEET_ID` (đọc lúc chạy), có fallback hằng số. Đổi Sheet 2→1 sau này = sửa 1 property, không sửa/redeploy code.
- **Cột web-app-sở-hữu, GAS không bao giờ đè** (`PRESERVE_COLUMNS`): `USER`, `CHI_SO`, `THOIGIAN_GHI`, `GHI_CHU`.
- **Toạ độ** (`LATITUDE`, `LONGITUDE`): có cờ `SYNC_COORDINATES_FROM_SHEET`.
  - `true` (mặc định): vẫn cho Sheet đẩy toạ độ lên (phục vụ nạp toạ độ hàng loạt từ file dữ liệu). Đánh đổi: sync sẽ đè toạ độ chỉnh tay trên web.
  - `false`: coi toạ độ cũng do web sở hữu, sync không đụng. Chọn nếu nhân viên thường chỉnh GPS trên web.
- Web app **không đổi** (đã ghi thẳng Supabase, đúng mô hình "Supabase là gốc").
- `users` / `stations` sync giữ nguyên (DELETE-all + insert; không có cột chỉ số, đã read-only theo RLS).

---

## 3. CÁC THAY ĐỔI CODE (model thực thi)

### 3.1 File `code_GAS.js`

**(a) Thay khối khai báo đầu file** — thay dòng `const SHEET_ID = '1RZ...cAcU';` bằng:

```javascript
// ===== CẤU HÌNH NGUỒN & QUYỀN SỞ HỮU CỘT =====
// SHEET_ID đọc từ Script Properties (key 'SHEET_ID'); nếu chưa set thì dùng default.
// Đổi Sheet test(2) -> production(1): chỉ cần sửa Script Property, KHÔNG sửa code.
const DEFAULT_SHEET_ID = '1TOeLylAh5S3wdLGZRAl_mkK6OemzcVZm9wgywCiOQLI'; // Sheet 2 (test) — nguồn hiện tại
// Sheet 1 (production) khi ổn định: '1RZCMXqFZEpoXLh75LrfsVh3GrrlgTpswxgoltr2cAcU'

function getSheetId_() {
  return PropertiesService.getScriptProperties().getProperty('SHEET_ID') || DEFAULT_SHEET_ID;
}

// Cột do WEB APP sở hữu — GAS sync KHÔNG BAO GIỜ đè (Supabase là gốc cho chỉ số).
const PRESERVE_COLUMNS = ['USER', 'CHI_SO', 'THOIGIAN_GHI', 'GHI_CHU'];

// Toạ độ: true = cho Sheet đẩy LAT/LONG lên (nạp toạ độ hàng loạt); false = web sở hữu, không đè.
const SYNC_COORDINATES_FROM_SHEET = true;

function getCustomerSkipColumns_() {
  var skip = PRESERVE_COLUMNS.slice();
  if (!SYNC_COORDINATES_FROM_SHEET) { skip.push('LATITUDE'); skip.push('LONGITUDE'); }
  return skip;
}
```

**(b) Thay MỌI lần dùng `SHEET_ID`** trong file: đổi `SpreadsheetApp.openById(SHEET_ID)` thành `SpreadsheetApp.openById(getSheetId_())`.
> Có ~12 chỗ (trong `syncCustomers*`, `syncUsers*`, `syncStations*`, `getUsers`, `getCustomers`, `getStations`, `updateReading`, `autoUpdateReadings`, `updateCoordinates`). Dùng find-replace toàn file: `openById(SHEET_ID)` → `openById(getSheetId_())`. Sau đó xoá dòng `const SHEET_ID = ...` cũ (đã thay ở mục a).

**(c) Trong `syncCustomersToSupabase` VÀ `syncCustomersToSupabaseQuiet_`** — bỏ các cột preserve khỏi payload. Trong vòng lặp build `row`, ngay sau khi lấy `header`, thêm chặn:

```javascript
const SKIP = getCustomerSkipColumns_();
// ... trong vòng for j:
const header = String(headers[j]).trim();
if (!header) continue;            // bỏ cột header rỗng
if (SKIP.indexOf(header) !== -1) continue;  // <-- THÊM: bỏ cột web-app-sở-hữu
```

> Đặt `const SKIP = getCustomerSkipColumns_();` ngay trước vòng lặp dòng (ngoài vòng for j) trong cả 2 hàm. Không đụng `syncUsers*`, `syncStations*`.

Kết quả: payload customers chỉ còn cột danh mục (`MA_KHANG`, `BCS`, `TEN_KHANG`, `MA_DDO`, `SO_CTO`, `MA_TRAM`, `MA_GHI_CHU`, `DIA_CHI`, `DTHOAI`, `SLUONG_*`, `CHISO_CU`, `PHONG_DOI`, `ASSIGN`, + `LATITUDE`/`LONGITUDE` nếu cờ bật). Upsert không còn đụng cột chỉ số.

### 3.2 File `GAS_SETUP.md`

Cập nhật link Sheet và hướng dẫn thêm Script Property:
- Đổi mọi URL/ID Sheet 1 (`1RZ...cAcU`) thành Sheet 2 (`1TOe...OQLI`) trong phần hướng dẫn hiện tại.
- Thêm mục: **"Cấu hình Script Properties"** liệt kê 3 key bắt buộc: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SHEET_ID` (đặt `= 1TOe...OQLI` cho giai đoạn test).
- Ghi chú: chuyển sang production = đổi property `SHEET_ID` thành `1RZ...cAcU`, không cần sửa code, chỉ chạy lại sync.

### 3.3 KHÔNG đổi web app
`src/lib/api.ts`, `src/components/*` giữ nguyên. (Mô hình "Supabase là gốc" = web chỉ ghi Supabase — đã đúng.)

---

## 4. BƯỚC DEPLOY (người dùng làm trong giao diện Google — model KHÔNG tự làm được)

1. Mở **Sheet 2** → Extensions → Apps Script.
2. Dán toàn bộ `code_GAS.js` đã sửa, **Save**.
3. **Project Settings → Script Properties**, đảm bảo có đủ:
   - `SUPABASE_URL` = `https://tfgbffnnshwtslmenajv.supabase.co`
   - `SUPABASE_SERVICE_KEY` = *(service_role key của Supabase — KHÔNG phải anon key)*
   - `SHEET_ID` = `1TOeLylAh5S3wdLGZRAl_mkK6OemzcVZm9wgywCiOQLI`
4. Nếu đang dùng nút "Đồng bộ" trên web (qua `VITE_GAS_URL`): **Deploy → Manage deployments → Edit → New version → Deploy** để bản web app GAS cập nhật.
5. Reload Sheet 2 để menu **⚡ Đồng bộ Supabase** xuất hiện (hàm `onOpen`).

---

## 5. VERIFY (bắt buộc — chứng minh không mất dữ liệu)

**5.1 Sync đọc đúng Sheet 2.**
Sửa 1 ô danh mục dễ nhận biết trong Sheet 2 (ví dụ thêm hậu tố " (TEST2)" vào `TEN_KHANG` của 1 MA_KHANG). Chạy menu **Đồng bộ Khách hàng**. Vào Supabase → bảng `customers` lọc MA_KHANG đó → `TEN_KHANG` phải có "(TEST2)". ⇒ đã trỏ Sheet 2.

**5.2 Sync KHÔNG đè chỉ số (test quan trọng nhất).**
1. Trên **web app**, nhập 1 chỉ số cho khách hàng X (ví dụ CHI_SO = 12345), lưu. Kiểm tra Supabase: `CHI_SO=12345`, `USER`, `THOIGIAN_GHI` có giá trị.
2. Đảm bảo dòng X trong Sheet 2 có cột `CHI_SO` **rỗng** (mô phỏng tình huống thực).
3. Chạy lại **Đồng bộ Khách hàng**.
4. Kiểm tra Supabase khách hàng X: `CHI_SO` PHẢI VẪN = `12345` (không bị xoá). ✅ Pass. Nếu bị về rỗng ⇒ fix sai, dừng lại.

**5.3 Toạ độ đúng theo cờ.**
- Nếu `SYNC_COORDINATES_FROM_SHEET=true`: điền LAT/LONG cho 1 KH trong Sheet 2, sync, Supabase phải nhận toạ độ đó.
- Nếu `=false`: sync xong toạ độ Supabase không đổi.

**5.4 Khách hàng mới.**
Thêm 1 dòng MA_KHANG mới trong Sheet 2, sync → xuất hiện trong Supabase với cột chỉ số rỗng (đúng, sẽ nhập sau trên web).

**5.5 Đếm tổng.** `SELECT count(*) FROM customers;` trước/sau sync không giảm bất thường.

---

## 6. RỦI RO & ROLLBACK

- **Rủi ro:** nếu Sheet 2 thiếu tab `Danh sach`/`User`/`TBA` hoặc lệch tên cột header so với schema Supabase → sync lỗi 400. Kiểm tra tên tab + header khớp trước khi chạy thật (xem `supabase-migration.sql` để biết tên cột chuẩn).
- **Rollback nhanh:** đổi Script Property `SHEET_ID` về `1RZ...cAcU` (Sheet 1) và/hoặc dán lại `code_GAS.js` bản git trước. Không có thao tác phá huỷ dữ liệu trong plan này (chỉ upsert, không DELETE customers).
- **Lưu ý service key:** `SUPABASE_SERVICE_KEY` là khoá toàn quyền — chỉ để trong Script Properties, KHÔNG đưa vào code/Sheet/Git.

## 7. CHECKLIST BÀN GIAO

- [ ] `code_GAS.js`: thêm `getSheetId_`, `PRESERVE_COLUMNS`, cờ toạ độ, `getCustomerSkipColumns_`.
- [ ] `code_GAS.js`: thay hết `openById(SHEET_ID)` → `openById(getSheetId_())`, xoá hằng `SHEET_ID` cũ.
- [ ] `code_GAS.js`: thêm `if (SKIP.indexOf(header)!==-1) continue;` trong 2 hàm sync customers.
- [ ] `GAS_SETUP.md`: cập nhật link Sheet 2 + mục Script Properties.
- [ ] Deploy lại GAS (mục 4) — do người dùng.
- [ ] Pass toàn bộ verify mục 5 (đặc biệt 5.2).
- [ ] Commit & push: `git add -A && git commit -m "fix(gas): tro Sheet 2 qua Script Property + khong de cot chi so khi sync" && git push`.

---

## 8. LÀM RÕ PHẠM VI "KHÔNG ĐÈ" (không phải đổi code — chỉ ghi chú thiết kế)

Quy tắc preserve **chỉ áp cho 4 cột chỉ số** (`USER, CHI_SO, THOIGIAN_GHI, GHI_CHU`), **không** áp cho mọi cột.

- PostgREST `merge-duplicates` ⇒ `ON CONFLICT DO UPDATE SET <các cột CÓ trong payload>`.
- Ta chỉ bỏ 4 cột chỉ số khỏi payload. **Mọi cột danh mục vẫn còn trong payload ⇒ vẫn được cập nhật** dù Supabase đã có dữ liệu.

| Hành động | Kết quả khi sync |
|---|---|
| Sửa `TEN_KHANG`/`DIA_CHI`/`ASSIGN`/`SLUONG_*`/`CHISO_CU`… trên Sheet | Supabase **CẬP NHẬT** (Sheet là gốc danh mục) |
| Web app nhập `CHI_SO`/`GHI_CHU` | Sync **KHÔNG đè** (Supabase là gốc chỉ số) |
| Toạ độ `LAT/LONG` | Theo cờ `SYNC_COORDINATES_FROM_SHEET` |

⇒ Không mất khả năng cập nhật cột khác. Đây là chủ đích: "mỗi cột một chủ".

**Verify bổ sung (mục 5):** sửa `DIA_CHI` của 1 KH đã tồn tại trên Sheet → sync → Supabase phải đổi địa chỉ; đồng thời `CHI_SO` của KH đó (đã nhập từ web) phải còn nguyên.

---

## 9. TÍNH NĂNG MỚI — "Ghi tự động" KHÔNG đè chỉ số đã có

**Mục tiêu:** khi chạy ghi tự động hàng loạt, dòng nào đã có chỉ số thật thì **giữ nguyên**, chỉ điền `"Ghi tự động"` vào dòng đang rỗng.

**File:** `src/lib/api.ts`, hàm `autoUpdateReadings`.

**Hiện tại (đè tất cả):**
```ts
const { data, error } = await supabase
  .from('customers')
  .update({ USER: user, CHI_SO: 'Ghi tự động', THOIGIAN_GHI: thoiGian })
  .in('MA_KHANG', batch)
  .select('id');
```

**Sửa thành (chỉ điền dòng rỗng):**
```ts
const { data, error } = await supabase
  .from('customers')
  .update({ USER: user, CHI_SO: 'Ghi tự động', THOIGIAN_GHI: thoiGian })
  .in('MA_KHANG', batch)
  .or('CHI_SO.is.null,CHI_SO.eq.')   // chỉ dòng CHI_SO null HOẶC rỗng
  .select('id');
```

> Điều kiện `.or('CHI_SO.is.null,CHI_SO.eq.')` lọc cả `NULL` lẫn chuỗi rỗng `''`.
> `updatedCount += data?.length ?? 0` vẫn đếm đúng **số dòng thực sự được ghi tự động** (dòng đã có chỉ số bị filter loại ra, không tính).

**Lưu ý dữ liệu (executor kiểm tra trước):** một số dòng có `CHI_SO = ''` (chuỗi rỗng), số khác là `NULL`. Filter trên xử lý cả hai. NẾU verify cho thấy PostgREST không match được chuỗi rỗng qua `eq.`, dùng phương án dự phòng:
> - Cách B (chuẩn hoá): chạy 1 lần `UPDATE customers SET "CHI_SO"=NULL WHERE "CHI_SO"='';` rồi đổi filter thành `.is('CHI_SO', null)`. Nhưng phải đảm bảo các nơi khác coi NULL = "chưa ghi" (kiểm tra `Overview.tsx`, `UpdateReading.tsx` cách nhận biết "đã/chưa ghi").

**Verify tính năng 9:**
1. KH A: `CHI_SO = 5000` (chỉ số thật). KH B: `CHI_SO` rỗng.
2. Chạy ghi tự động cho cả A và B.
3. Kết quả đúng: A vẫn `5000` (giữ nguyên), B = `'Ghi tự động'`. Hàm trả về `updatedCount = 1` (chỉ B).

**Phạm vi:** chỉ sửa đường Supabase (`api.ts`) — đúng mô hình "Supabase là gốc". Bản `autoUpdateReadings` trong `code_GAS.js` (doPost legacy) hiện web app KHÔNG dùng; nếu sau này dùng, áp cùng logic "chỉ ghi dòng rỗng".

**Checklist bổ sung:**
- [x] `api.ts`: thêm filter `.or('CHI_SO.is.null,CHI_SO.eq.')` vào `autoUpdateReadings`.
- [ ] Pass verify mục 9 (A giữ nguyên, B = "Ghi tự động", count đúng).
- [x] `npm run lint && npm run build` xanh trước khi commit.

---

## 10. BÁO CÁO CHI TIẾT KHI "CẬP NHẬT GHI TỰ ĐỘNG" (thay cho mục 9 — bản đầy đủ hơn)

**Mục tiêu:** khi bấm *Cập nhật Ghi tự động* ở tab **Quản lý chỉ số**, hiển thị ngay:
- Bao nhiêu mã được ghi tự động.
- Bao nhiêu mã **đã có chỉ số → giữ nguyên** (kèm DANH SÁCH mã để biết chính xác).
- Bao nhiêu mã không tìm thấy trong DB.

> Mục này **thay thế** code ở mục 9: triển khai trực tiếp bản dưới đây cho `autoUpdateReadings` (đã bao gồm logic "không đè chỉ số" + báo cáo). Lý do dùng select-rồi-phân-loại thay cho filter `.or`: đếm chính xác theo MÃ (không lệch khi 1 mã có nhiều BCS) và lấy được danh sách mã bị giữ nguyên.

### 10.1 `src/lib/api.ts` — đổi kiểu trả về của `autoUpdateReadings`

Thêm interface (đầu file hoặc cạnh hàm) và thay toàn bộ thân hàm:

```ts
export interface AutoUpdateResult {
  filled: number;             // số dòng được ghi "Ghi tự động"
  skippedExisting: string[];  // MÃ đã có chỉ số thật → giữ nguyên
  notFound: string[];         // MÃ không tồn tại trong DB
  filledMaKhang: string[];    // MÃ thực sự được ghi (để cập nhật cache local)
}

export async function autoUpdateReadings(
  maKhangList: string[],
  user: string,
  thoiGian: string
): Promise<AutoUpdateResult> {
  const result: AutoUpdateResult = { filled: 0, skippedExisting: [], notFound: [], filledMaKhang: [] };
  const BATCH_SIZE = 50;

  // "Có chỉ số thật" = khác null/rỗng VÀ khác 'Ghi tự động' (cho phép ghi đè lại nhãn tự động)
  const isRealReading = (v: any) =>
    v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== 'Ghi tự động';

  for (let i = 0; i < maKhangList.length; i += BATCH_SIZE) {
    const batch = maKhangList.slice(i, i + BATCH_SIZE);

    // 1) Đọc trạng thái hiện tại
    const { data: rows, error: selErr } = await supabase
      .from('customers')
      .select('MA_KHANG, CHI_SO')
      .in('MA_KHANG', batch);
    if (selErr) { console.error('autoUpdate select error:', selErr); continue; }

    // 2) Phân loại theo MÃ
    const found = new Set<string>();
    const hasReading = new Set<string>();
    (rows ?? []).forEach((r: any) => {
      found.add(r.MA_KHANG);
      if (isRealReading(r.CHI_SO)) hasReading.add(r.MA_KHANG);
    });

    const toFill: string[] = [];
    for (const ma of batch) {
      if (!found.has(ma)) result.notFound.push(ma);
      else if (hasReading.has(ma)) result.skippedExisting.push(ma);
      else toFill.push(ma);
    }
    if (toFill.length === 0) continue;

    // 3) Chỉ ghi tự động vào MÃ đang rỗng
    const { data: upd, error: updErr } = await supabase
      .from('customers')
      .update({ USER: user, CHI_SO: 'Ghi tự động', THOIGIAN_GHI: thoiGian })
      .in('MA_KHANG', toFill)
      .select('id');
    if (updErr) { console.error('autoUpdate update error:', updErr); continue; }

    result.filled += upd?.length ?? 0;
    result.filledMaKhang.push(...toFill);
  }

  return result;
}
```

### 10.2 `src/components/AdminManagement.tsx` — dùng kết quả chi tiết

**(a)** Mở rộng state `result` để chứa danh sách giữ nguyên (cho UI đẹp):

```ts
const [result, setResult] = useState<{
  success: boolean;
  message: string;
  skippedExisting?: string[];
  notFound?: string[];
} | null>(null);
```

**(b)** Thay khối trong `handleAutoUpdate` (dòng ~99–126) bằng:

```ts
const res = await autoUpdateReadings(maKhangListToUpdate, currentUser.HO_TEN, thoiGian);

let msg = `Đã ghi tự động ${res.filled} mã.`;
if (res.skippedExisting.length > 0)
  msg += ` Giữ nguyên ${res.skippedExisting.length} mã đã có chỉ số (không ghi đè).`;
if (res.notFound.length > 0)
  msg += ` ${res.notFound.length} mã không tìm thấy.`;

setResult({
  success: true,
  message: msg,
  skippedExisting: res.skippedExisting,
  notFound: res.notFound,
});
setInputList('');

// Cập nhật cache local CHỈ cho mã thực sự được ghi
if (onUpdateLocalCustomer) {
  res.filledMaKhang.forEach(maKhang => {
    onUpdateLocalCustomer(maKhang, {
      CHI_SO: 'Ghi tự động',
      USER: currentUser.HO_TEN,
      THOIGIAN_GHI: thoiGian,
    });
  });
} else {
  onRefreshCustomers();
}
```

**(c)** Ở chỗ render `result.message`, thêm block liệt kê mã được giữ nguyên (cuộn được, tránh tràn màn hình khi danh sách dài):

```tsx
{result?.skippedExisting && result.skippedExisting.length > 0 && (
  <div className="mt-2 text-sm">
    <p className="font-medium text-amber-700">
      {result.skippedExisting.length} mã đã có chỉ số — giữ nguyên:
    </p>
    <div className="mt-1 max-h-32 overflow-y-auto rounded bg-amber-50 p-2 font-mono text-xs text-amber-800">
      {result.skippedExisting.join(', ')}
    </div>
  </div>
)}
{result?.notFound && result.notFound.length > 0 && (
  <div className="mt-2 text-sm">
    <p className="font-medium text-red-700">{result.notFound.length} mã không tìm thấy:</p>
    <div className="mt-1 max-h-24 overflow-y-auto rounded bg-red-50 p-2 font-mono text-xs text-red-800">
      {result.notFound.join(', ')}
    </div>
  </div>
)}
```

> Đặt 2 block này ngay dưới phần đang render `result.message` (tìm chỗ hiển thị `result` + icon `CheckCircle`/`AlertCircle`). Giữ nguyên logic màu success/error sẵn có.

### 10.3 Verify mục 10

1. Chuẩn bị danh sách 4 mã: **A** đã có chỉ số thật (vd `5000`), **B** rỗng, **C** đang `'Ghi tự động'`, **D** mã không tồn tại.
2. Dán cả 4 vào ô, bấm **Cập nhật Ghi tự động**.
3. Kết quả đúng:
   - A: giữ `5000`, xuất hiện trong "giữ nguyên".
   - B: thành `'Ghi tự động'` (filled).
   - C: vẫn `'Ghi tự động'`, tính filled (re-stamp, vô hại).
   - D: vào danh sách "không tìm thấy".
   - Thông báo: `Đã ghi tự động 2 mã. Giữ nguyên 1 mã… 1 mã không tìm thấy.` + 2 block danh sách hiển thị đúng mã A và D.
4. `npm run lint && npm run build` xanh.

**Checklist mục 10:**
- [x] `api.ts`: thêm `interface AutoUpdateResult`, thay thân `autoUpdateReadings` (bản 10.1). **Bỏ** bản filter `.or` ở mục 9 (đã được thay thế).
- [x] `AdminManagement.tsx`: mở rộng state `result`, cập nhật `handleAutoUpdate`, thêm 2 block render danh sách.
- [ ] Pass verify 10.3.
- [ ] Commit: `git commit -m "feat(auto): bao cao chi tiet ghi tu dong - giu nguyen ma da co chi so"`.

---

## 11. ROOT CAUSE BUG "1 PHÚT" & XÓA SYNC TỰ ĐỘNG (ưu tiên cao nhất)

### 11.1 Triệu chứng người dùng báo
1. Bấm *Cập nhật Ghi tự động* → báo thành công ngay, **nhưng ~1 phút sau** Supabase mới bị ghi `"Ghi tự động"` đè lên ô đã có chỉ số (sai yêu cầu "có giá trị thì không đè").
2. Đang ở giá trị `"Ghi tự động"`, sửa tay trên web → trạng thái **không đổi ngay**, ~1 phút sau mới đổi (hoặc bị quay về).

### 11.2 Root cause (đã suy luận, cần người dùng xác nhận 1 điểm)
- Trong toàn bộ code (`src/` + `code_GAS.js`) **KHÔNG có** `setInterval` / `setTimeout` / polling. `triggerSync` chỉ chạy khi bấm nút thủ công. ⇒ chu kỳ "1 phút" **không đến từ code**.
- Con số "1 phút" là dấu vết đặc trưng của **GAS time-driven trigger** (chu kỳ tối thiểu = 1 phút), được tạo **thủ công** trong panel Triggers của Apps Script ⇒ không nằm trong file nên grep không thấy.
- Trigger đó chạy `syncCustomersToSupabase` (hoặc `syncAll`) định kỳ. Hàm sync hiện tại **gửi cả cột `CHI_SO`** lên Supabase ⇒ mỗi phút đọc Sheet (CHI_SO rỗng / `"Ghi tự động"`) rồi **upsert đè ngược** lên giá trị web vừa nhập. Đây là gốc của cả 2 triệu chứng:
  - Triệu chứng 1: web ghi đúng tức thì → 1 phút sau trigger đè `"Ghi tự động"` lên.
  - Triệu chứng 2: web sửa tay → Supabase đổi ngay, nhưng (a) cache IndexedDB stale-while-revalidate hiện giá trị cũ trước, (b) 1 phút sau trigger đè lại giá trị Sheet ⇒ cảm giác "phải đợi 1 phút".

> **CẦN XÁC NHẬN (người dùng):** mở Apps Script → icon đồng hồ **Triggers** → kiểm tra có trigger **Time-driven** gọi `syncCustomers*`/`syncAll` chu kỳ ~1 phút không. Nếu có ⇒ chẩn đoán đúng 100%.

### 11.3 Cách khắc phục (theo quyết định "không sync realtime")

**Bước 1 — XÓA trigger tự động (người dùng làm — quyết định chính, fix tức thì):**
- Apps Script → **Triggers** (icon đồng hồ) → tìm mọi trigger **Time-driven** → bấm **⋮ → Delete trigger** cho từng cái.
- Sau khi xóa: không còn tiến trình nào ghi đè Supabase mỗi phút ⇒ cả 2 triệu chứng biến mất ngay.

**Bước 2 — Đưa sync về thủ công, an toàn (model thực thi, đã có trong §3):**
- §3 đã bắt sync **không đụng 4 cột chỉ số** (`PRESERVE_COLUMNS`). Đây là lớp phòng thủ thứ hai: kể cả admin bấm "Đồng bộ Khách hàng" thủ công lúc nhập danh sách KH mới, chỉ số đã ghi trên web **vẫn không bị đè**.
- ⇒ Sau §3, sync trở thành thao tác **vô hại, chạy theo nhu cầu** (chỉ khi cập nhật danh mục KH), không còn là tiến trình nền nguy hiểm.

**Bước 3 — Giảm độ trễ hiển thị khi sửa tay (tùy chọn, cải thiện UX):**
- Triệu chứng 2 sau khi xóa trigger sẽ chỉ còn lại độ trễ **cache** (nếu có). Web app đã có optimistic update (`onUpdateLocalCustomer` trong `UpdateReading.tsx`/`AdminManagement.tsx`) nên UI thường đổi ngay. Nếu vẫn thấy trễ, kiểm tra `src/lib/cache.ts`: sau khi ghi Supabase thành công, gọi `cacheSet('customers', …)` hoặc invalidate để lần đọc kế lấy dữ liệu mới (KHÔNG bắt buộc nếu optimistic update đã đủ).

### 11.4 Verify mục 11
1. **Xác nhận đã hết trigger:** Apps Script → Triggers → danh sách rỗng (hoặc không còn time-driven).
2. **Test triệu chứng 1:** web nhập `CHI_SO=8888` cho KH X → chờ **3 phút** → Supabase vẫn `8888` (không bị `"Ghi tự động"` đè). ✅
3. **Test triệu chứng 2:** KH đang `"Ghi tự động"` → sửa tay thành `9999` trên web → UI đổi ngay; chờ 3 phút → Supabase vẫn `9999`. ✅
4. **Test sync thủ công vô hại:** sau §3, bấm "Đồng bộ Khách hàng" 1 lần → chỉ số các KH đã ghi web **không đổi** (chỉ cột danh mục cập nhật). ✅

**Checklist mục 11:**
- [ ] Người dùng xác nhận có time-driven trigger trong panel Triggers.
- [ ] Người dùng **xóa toàn bộ** time-driven trigger.
- [ ] Đã áp §3 (sync không đụng cột chỉ số) làm lớp phòng thủ.
- [ ] Pass verify 11.4 (đặc biệt test "chờ 3 phút không bị đè").
