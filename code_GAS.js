// ============================================================
// Google Apps Script — Ghi Chỉ Số PCVT
// Hybrid: Google Sheet (nhập liệu) + Supabase (đọc/ghi nhanh)
// ============================================================

const SHEET_ID = '1RZCMXqFZEpoXLh75LrfsVh3GrrlgTpswxgoltr2cAcU';

// =================== MENU TÙY CHỈNH ===================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ Đồng bộ Supabase')
    .addItem('Đồng bộ Khách hàng', 'syncCustomersToSupabase')
    .addItem('Đồng bộ Người dùng', 'syncUsersToSupabase')
    .addItem('Đồng bộ Trạm', 'syncStationsToSupabase')
    .addSeparator()
    .addItem('🔄 Đồng bộ Tất cả', 'syncAll')
    .addToUi();
}

// =================== SUPABASE HELPERS ===================

function getSupabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    url: props.getProperty('SUPABASE_URL'),
    key: props.getProperty('SUPABASE_SERVICE_KEY')
  };
}

function supabaseRequest_(method, path, payload) {
  const config = getSupabaseConfig_();
  if (!config.url || !config.key) {
    throw new Error('Chưa cấu hình SUPABASE_URL và SUPABASE_SERVICE_KEY trong Script Properties!');
  }
  
  const options = {
    method: method,
    headers: {
      'apikey': config.key,
      'Authorization': 'Bearer ' + config.key,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    muteHttpExceptions: true
  };
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }
  
  const response = UrlFetchApp.fetch(config.url + '/rest/v1/' + path, options);
  const code = response.getResponseCode();
  
  if (code >= 400) {
    throw new Error('Supabase error (' + code + '): ' + response.getContentText());
  }
  
  const text = response.getContentText();
  return text ? JSON.parse(text) : null;
}

// =================== SYNC FUNCTIONS ===================

function syncCustomersToSupabase() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Danh sach');
  if (!sheet) {
    ui.alert('Không tìm thấy sheet "Danh sach"!');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const BATCH_SIZE = 500;
  let totalUpserted = 0;
  let batch = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      let value = data[i][j];
      
      // Chuyển số thành chuỗi cho các trường text
      if (header === 'LONGITUDE' || header === 'LATITUDE' || header === 'CHISO_CU') {
        value = value !== '' && value !== null && value !== undefined ? String(value) : '';
      }
      // Chuyển thành số cho các trường numeric
      if (header === 'SLUONG_3' || header === 'SLUONG_2' || header === 'SLUONG_1' || header === 'HS_NHAN') {
        value = Number(value) || 0;
      }
      
      row[header] = value;
    }
    
    // Bỏ qua dòng trống
    if (!row['MA_KHANG']) continue;
    
    batch.push(row);
    
    if (batch.length >= BATCH_SIZE) {
      supabaseRequest_('POST', 'customers?on_conflict=MA_KHANG,BCS', batch);
      totalUpserted += batch.length;
      batch = [];
    }
  }
  
  // Batch cuối
  if (batch.length > 0) {
    supabaseRequest_('POST', 'customers?on_conflict=MA_KHANG,BCS', batch);
    totalUpserted += batch.length;
  }
  
  // Cập nhật metadata
  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.customers', {
    last_synced_at: new Date().toISOString(),
    row_count: totalUpserted,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });
  
  ui.alert('✅ Đồng bộ Khách hàng thành công!\n\nĐã upsert: ' + totalUpserted + ' dòng');
}

function syncUsersToSupabase() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('User');
  if (!sheet) {
    ui.alert('Không tìm thấy sheet "User"!');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    if (!row['MSNV']) continue;
    row['MSNV'] = String(row['MSNV']);
    rows.push(row);
  }
  
  // Xóa tất cả users cũ và insert mới (bảng nhỏ)
  supabaseRequest_('DELETE', 'users?id=gt.0', null);
  
  if (rows.length > 0) {
    supabaseRequest_('POST', 'users', rows);
  }
  
  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.users', {
    last_synced_at: new Date().toISOString(),
    row_count: rows.length,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });
  
  ui.alert('✅ Đồng bộ Người dùng thành công!\n\nĐã cập nhật: ' + rows.length + ' người');
}

function syncStationsToSupabase() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('TBA');
  if (!sheet) {
    ui.alert('Không tìm thấy sheet "TBA"!');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const BATCH_SIZE = 500;
  let totalInserted = 0;
  let batch = [];
  
  // Xóa tất cả stations cũ
  supabaseRequest_('DELETE', 'stations?id=gt.0', null);
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    batch.push(row);
    
    if (batch.length >= BATCH_SIZE) {
      supabaseRequest_('POST', 'stations', batch);
      totalInserted += batch.length;
      batch = [];
    }
  }
  
  if (batch.length > 0) {
    supabaseRequest_('POST', 'stations', batch);
    totalInserted += batch.length;
  }
  
  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.stations', {
    last_synced_at: new Date().toISOString(),
    row_count: totalInserted,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });
  
  ui.alert('✅ Đồng bộ Trạm thành công!\n\nĐã cập nhật: ' + totalInserted + ' trạm');
}

function syncAll() {
  const ui = SpreadsheetApp.getUi();
  const startTime = new Date();
  
  try {
    // Sync tuần tự
    ui.alert('Bắt đầu đồng bộ toàn bộ dữ liệu...\nVui lòng đợi, quá trình có thể mất 2-3 phút.');
    
    // Users (nhỏ nhất, nhanh nhất)
    syncUsersToSupabaseQuiet_();
    
    // Stations
    syncStationsToSupabaseQuiet_();
    
    // Customers (lớn nhất, lâu nhất)
    const customerCount = syncCustomersToSupabaseQuiet_();
    
    const elapsed = Math.round((new Date() - startTime) / 1000);
    ui.alert('🎉 Đồng bộ Tất cả hoàn tất!\n\nThời gian: ' + elapsed + ' giây\nKhách hàng: ' + customerCount + ' dòng');
  } catch (err) {
    ui.alert('❌ Lỗi đồng bộ: ' + err.message);
  }
}

// Quiet versions (không hiện alert riêng)
function syncUsersToSupabaseQuiet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('User');
  if (!sheet) return 0;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (!header) continue; // Bỏ qua cột header rỗng
      let value = data[i][j];
      // STT là INTEGER — chuyển rỗng thành null
      if (header === 'STT') {
        value = (value !== '' && value !== null && value !== undefined) ? Number(value) : null;
      }
      row[header] = value;
    }
    if (!row['MSNV']) continue;
    row['MSNV'] = String(row['MSNV']);
    rows.push(row);
  }
  
  supabaseRequest_('DELETE', 'users?id=gt.0', null);
  if (rows.length > 0) supabaseRequest_('POST', 'users', rows);
  
  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.users', {
    last_synced_at: new Date().toISOString(),
    row_count: rows.length,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });
  
  return rows.length;
}

function syncStationsToSupabaseQuiet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('TBA');
  if (!sheet) return 0;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const BATCH_SIZE = 500;
  let total = 0;
  let batch = [];
  
  supabaseRequest_('DELETE', 'stations?id=gt.0', null);
  
  const NUMERIC_COLS = ['Công suất', 'X', 'Y', 'Imax', 'Idm'];
  const INTEGER_COLS = ['STT', 'Pha', 'Số MBA', 'Năm VH'];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (!header) continue; // Bỏ qua cột header rỗng
      let value = data[i][j];
      
      // Xử lý cột "Năm VH": Sheet có thể lưu dạng Date → lấy năm
      if (header === 'Năm VH') {
        if (value instanceof Date) {
          value = value.getFullYear();
        } else if (value !== '' && value !== null && value !== undefined) {
          const num = Number(value);
          // Nếu > 3000 thì có thể là timestamp → chuyển về năm
          value = (num > 3000) ? new Date(num).getFullYear() : (isNaN(num) ? null : num);
        } else {
          value = null;
        }
      }
      // Cột NUMERIC — chuyển rỗng/Date thành null
      else if (NUMERIC_COLS.includes(header)) {
        if (value instanceof Date) {
          value = null;
        } else {
          value = (value !== '' && value !== null && value !== undefined) ? Number(value) || null : null;
        }
      }
      // Cột INTEGER — chuyển rỗng/Date thành null
      else if (INTEGER_COLS.includes(header)) {
        if (value instanceof Date) {
          value = null;
        } else {
          value = (value !== '' && value !== null && value !== undefined) ? Number(value) : null;
          // Kiểm tra giới hạn INTEGER (-2^31 ~ 2^31-1)
          if (value !== null && (value > 2147483647 || value < -2147483648)) value = null;
        }
      }
      
      row[header] = value;
    }
    batch.push(row);
    
    if (batch.length >= BATCH_SIZE) {
      supabaseRequest_('POST', 'stations', batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    supabaseRequest_('POST', 'stations', batch);
    total += batch.length;
  }
  
  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.stations', {
    last_synced_at: new Date().toISOString(),
    row_count: total,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });
  
  return total;
}

function syncCustomersToSupabaseQuiet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Danh sach');
  if (!sheet) return 0;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const BATCH_SIZE = 500;
  let total = 0;
  let batch = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (!header) continue; // Bỏ qua cột header rỗng
      let value = data[i][j];
      
      if (header === 'LONGITUDE' || header === 'LATITUDE' || header === 'CHISO_CU') {
        value = value !== '' && value !== null && value !== undefined ? String(value) : '';
      }
      if (header === 'SLUONG_3' || header === 'SLUONG_2' || header === 'SLUONG_1' || header === 'HS_NHAN') {
        value = Number(value) || 0;
      }
      
      row[header] = value;
    }
    
    if (!row['MA_KHANG']) continue;
    batch.push(row);
    
    if (batch.length >= BATCH_SIZE) {
      supabaseRequest_('POST', 'customers?on_conflict=MA_KHANG,BCS', batch);
      total += batch.length;
      batch = [];
    }
  }
  
  if (batch.length > 0) {
    supabaseRequest_('POST', 'customers?on_conflict=MA_KHANG,BCS', batch);
    total += batch.length;
  }
  
  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.customers', {
    last_synced_at: new Date().toISOString(),
    row_count: total,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });
  
  return total;
}

// =================== API ENDPOINTS (GIỮ NGUYÊN CHO BACKWARD COMPAT) ===================

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
  
  if (action === 'getStations') {
    return ContentService.createTextOutput(JSON.stringify(getStations()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Endpoint mới: trigger sync từ webapp
  if (action === 'triggerSync') {
    try {
      const count = syncCustomersToSupabaseQuiet_();
      syncUsersToSupabaseQuiet_();
      syncStationsToSupabaseQuiet_();
      return ContentService.createTextOutput(JSON.stringify({ success: true, customerCount: count }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Endpoint mới: lấy thời gian sync gần nhất
  if (action === 'getSyncStatus') {
    try {
      const config = getSupabaseConfig_();
      const response = UrlFetchApp.fetch(config.url + '/rest/v1/sync_metadata?select=*', {
        headers: {
          'apikey': config.key,
          'Authorization': 'Bearer ' + config.key
        }
      });
      return ContentService.createTextOutput(response.getContentText())
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
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
  
  if (action === 'updateCoordinates') {
    return ContentService.createTextOutput(JSON.stringify(updateCoordinates(data.payload)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================== GIỮ NGUYÊN CÁC HÀM CŨ ===================

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
    customer._rowIndex = i + 1;
    customers.push(customer);
  }
  return customers;
}

function getStations() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('TBA');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const stations = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const station = {};
    for (let j = 0; j < headers.length; j++) {
      station[headers[j]] = row[j];
    }
    stations.push(station);
  }
  return stations;
}

function updateReading(payload) {
  const { rowIndex, chiSo, user, thoiGian, ghiChu, updateType, maKhang, bcs } = payload;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Danh sach');
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  let userCol = headers.indexOf('USER') + 1;
  let chiSoCol = headers.indexOf('CHI_SO') + 1;
  let thoiGianCol = headers.indexOf('THOIGIAN_GHI') + 1;
  let ghiChuCol = headers.indexOf('GHI_CHU') + 1;
  let maKhangCol = headers.indexOf('MA_KHANG');
  let bcsCol = headers.indexOf('BCS');
  
  if (userCol === 0) userCol = 18;
  if (chiSoCol === 0) chiSoCol = 19;
  if (thoiGianCol === 0) thoiGianCol = 20;
  if (ghiChuCol === 0) ghiChuCol = 21;
  
  let targetRowIndex = rowIndex;
  
  if (maKhang !== undefined && maKhangCol >= 0) {
    let found = false;
    if (targetRowIndex <= data.length && data[targetRowIndex - 1][maKhangCol] == maKhang) {
      found = true;
    } else {
      for (let i = 1; i < data.length; i++) {
        if (data[i][maKhangCol] == maKhang && (bcsCol < 0 || bcs === undefined || data[i][bcsCol] == bcs)) {
          targetRowIndex = i + 1;
          found = true;
          break;
        }
      }
    }
  }

  const type = updateType || 'FULL';
  
  if (type === 'DELETE_READING') {
    sheet.getRange(targetRowIndex, userCol).setValue("");
    sheet.getRange(targetRowIndex, chiSoCol).setValue("");
    sheet.getRange(targetRowIndex, thoiGianCol).setValue("");
    sheet.getRange(targetRowIndex, ghiChuCol).setValue(ghiChu || "");
  } else if (type === 'NOTE_ONLY') {
    sheet.getRange(targetRowIndex, ghiChuCol).setValue(ghiChu || "");
  } else {
    sheet.getRange(targetRowIndex, userCol).setValue(user);
    sheet.getRange(targetRowIndex, chiSoCol).setValue(chiSo);
    sheet.getRange(targetRowIndex, thoiGianCol).setValue(thoiGian);
    sheet.getRange(targetRowIndex, ghiChuCol).setValue(ghiChu || "");
  }
  
  return { success: true };
}

function autoUpdateReadings(payload) {
  const { maKhangList, user, thoiGian } = payload;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Danh sach');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  let userCol = headers.indexOf('USER') + 1;
  let chiSoCol = headers.indexOf('CHI_SO') + 1;
  let thoiGianCol = headers.indexOf('THOIGIAN_GHI') + 1;
  let maKhangCol = headers.indexOf('MA_KHANG');
  
  if (userCol === 0) userCol = 18;
  if (chiSoCol === 0) chiSoCol = 19;
  if (thoiGianCol === 0) thoiGianCol = 20;
  if (maKhangCol === -1) maKhangCol = 0;
  
  let updatedCount = 0;
  for (let i = 1; i < data.length; i++) {
    const maKhang = data[i][maKhangCol];
    if (maKhangList.includes(maKhang)) {
      sheet.getRange(i + 1, userCol).setValue(user);
      sheet.getRange(i + 1, chiSoCol).setValue('Ghi tự động');
      sheet.getRange(i + 1, thoiGianCol).setValue(thoiGian);
      updatedCount++;
    }
  }
  
  return { success: true, updatedCount };
}

function updateCoordinates(payload) {
  const { rowIndex, lat, lng, maKhang } = payload;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Danh sach');
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let latCol = headers.indexOf('LATITUDE') + 1;
  let lngCol = headers.indexOf('LONGITUDE') + 1;
  let maKhangCol = headers.indexOf('MA_KHANG');
  
  if (latCol === 0) latCol = headers.indexOf('Y') + 1;
  if (lngCol === 0) lngCol = headers.indexOf('X') + 1;
  
  if (latCol === 0) latCol = 11;
  if (lngCol === 0) lngCol = 10;
  if (maKhangCol === -1) maKhangCol = 0;
  
  let targetRowIndex = rowIndex;
  
  if (maKhang !== undefined && maKhangCol >= 0) {
    if (targetRowIndex <= data.length && data[targetRowIndex - 1][maKhangCol] == maKhang) {
      // Still valid
    } else {
      for (let i = 1; i < data.length; i++) {
        if (data[i][maKhangCol] == maKhang) {
          targetRowIndex = i + 1;
          break;
        }
      }
    }
  }
  
  const latStr = String(lat).replace(/,/g, '.');
  const lngStr = String(lng).replace(/,/g, '.');
  
  sheet.getRange(targetRowIndex, latCol).setNumberFormat("@");
  sheet.getRange(targetRowIndex, latCol).setValue(latStr);
  
  sheet.getRange(targetRowIndex, lngCol).setNumberFormat("@");
  sheet.getRange(targetRowIndex, lngCol).setValue(lngStr);
  
  return { success: true };
}
