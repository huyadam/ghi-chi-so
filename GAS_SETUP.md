# Hướng dẫn cài đặt Google Apps Script

Để ứng dụng web có thể đọc và ghi dữ liệu vào Google Sheet của bạn, bạn cần tạo một Web App bằng Google Apps Script.

## Bước 1: Mở Google Sheet
1. Mở file Google Sheet của bạn: https://docs.google.com/spreadsheets/d/1TOeLylAh5S3wdLGZRAl_mkK6OemzcVZm9wgywCiOQLI/edit
2. Trên thanh menu, chọn **Tiện ích mở rộng** (Extensions) > **Apps Script**.

## Bước 2: Dán mã code
Bạn có thể copy mã code trực tiếp từ file `code_GAS.js` trong thư mục gốc của dự án này để dán vào Apps Script.

Hoặc copy đoạn code dưới đây:

```javascript
const SHEET_ID = '1TOeLylAh5S3wdLGZRAl_mkK6OemzcVZm9wgywCiOQLI';

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'getUsers') {
    return ContentService.createTextOutput(JSON.stringify(getUsers()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getCustomers') {
    return ContentService.createTextOutput(JSON.stringify(getCustomers()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid JSON'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const action = data.action;
  
  if (action === 'updateReading') {
    return ContentService.createTextOutput(JSON.stringify(updateReading(data.payload)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'autoUpdateReadings') {
    return ContentService.createTextOutput(JSON.stringify(autoUpdateReadings(data.payload)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function getUsers() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('User');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const users = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const user = {};
    for (let j = 0; j < headers.length; j++) {
      user[headers[j]] = row[j];
    }
    users.push(user);
  }
  return users;
}

function getCustomers() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Danh sach');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const customers = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const customer = {};
    for (let j = 0; j < headers.length; j++) {
      customer[headers[j]] = row[j];
    }
    customer._rowIndex = i + 1; // Keep track of row index for updates
    customers.push(customer);
  }
  return customers;
}

function updateReading(payload) {
  const { rowIndex, chiSo, user, thoiGian, ghiChu, updateType } = payload;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Danh sach');
  
  // Headers: MA_KHANG(1), TEN_KHANG(2), MA_DDO(3), SO_CTO(4), MA_TRAM(5), MA_GHI_CHU(6), BCS(7), DIA_CHI(8), DTHOAI(9), LONGITUDE(10), LATITUDE(11), SLUONG_3(12), SLUONG_2(13), SLUONG_1(14), CHISO_CU(15), PHONG_DOI(16), ASSIGN(17), USER(18), CHI_SO(19), THOIGIAN_GHI(20), GHI_CHU(21)
  
  const type = updateType || 'FULL';
  
  if (type === 'DELETE_READING') {
    sheet.getRange(rowIndex, 18).setValue(""); // Clear USER
    sheet.getRange(rowIndex, 19).setValue(""); // Clear CHI_SO
    sheet.getRange(rowIndex, 20).setValue(""); // Clear THOIGIAN_GHI
    sheet.getRange(rowIndex, 21).setValue(ghiChu || ""); // Maintain/update GHI_CHU
  } else if (type === 'NOTE_ONLY') {
    sheet.getRange(rowIndex, 21).setValue(ghiChu || ""); // Only update GHI_CHU
  } else {
    // FULL
    sheet.getRange(rowIndex, 18).setValue(user); // USER
    sheet.getRange(rowIndex, 19).setValue(chiSo); // CHI_SO
    sheet.getRange(rowIndex, 20).setValue(thoiGian); // THOIGIAN_GHI
    sheet.getRange(rowIndex, 21).setValue(ghiChu || ""); // GHI_CHU
  }
  
  return { success: true };
}

function autoUpdateReadings(payload) {
  const { maKhangList, user, thoiGian } = payload;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Danh sach');
  const data = sheet.getDataRange().getValues();
  
  let updatedCount = 0;
  for (let i = 1; i < data.length; i++) {
    const maKhang = data[i][0]; // Assuming MA_KHANG is column A (index 0)
    if (maKhangList.includes(maKhang)) {
      sheet.getRange(i + 1, 18).setValue(user); // USER
      sheet.getRange(i + 1, 19).setValue('Ghi tự động'); // CHI_SO
      sheet.getRange(i + 1, 20).setValue(thoiGian); // THOIGIAN_GHI
      updatedCount++;
    }
  }
  
  return { success: true, updatedCount };
}
```

## Bước 3: Cấu hình Script Properties
Trong giao diện Apps Script:
1. Nhấn vào biểu tượng **Project Settings** (bánh răng) ở menu bên trái.
2. Cuộn xuống phần **Script Properties** và nhấn **Add script property**.
3. Thêm 3 thuộc tính (key) bắt buộc sau:
   - `SUPABASE_URL` = (URL Supabase của bạn)
   - `SUPABASE_SERVICE_KEY` = (Khóa service_role của Supabase — KHÔNG phải anon key)
   - `SHEET_ID` = `1TOeLylAh5S3wdLGZRAl_mkK6OemzcVZm9wgywCiOQLI` (cho giai đoạn test)

> **Ghi chú:** Khi chuyển sang production, bạn chỉ cần sửa giá trị property `SHEET_ID` thành `1RZCMXqFZEpoXLh75LrfsVh3GrrlgTpswxgoltr2cAcU`, không cần sửa code hay deploy lại, chỉ cần chạy lại Đồng bộ.

## Bước 4: Triển khai (Deploy)
1. Nhấn nút **Deploy** (Triển khai) ở góc trên bên phải.
2. Chọn **New deployment** (Triển khai mới).
3. Ở mục **Select type** (Chọn loại), nhấn vào biểu tượng bánh răng và chọn **Web app** (Ứng dụng web).
4. Điền thông tin:
   - Description: `API Ghi Chi So`
   - Execute as: `Me` (Tôi)
   - Who has access: `Anyone` (Bất kỳ ai)
5. Nhấn **Deploy** (Triển khai).
6. Cấp quyền truy cập nếu được yêu cầu (Review permissions -> Chọn tài khoản -> Advanced -> Go to ... -> Allow).
7. Copy đường link **Web app URL**.

## Bước 5: Cập nhật biến môi trường
Mở file `.env.example` trong dự án này, copy nội dung sang file `.env` (nếu có) hoặc cập nhật trực tiếp vào biến môi trường của ứng dụng, thêm dòng sau:
```
VITE_GAS_URL="DÁN_URL_WEB_APP_CỦA_BẠN_VÀO_ĐÂY"
```
