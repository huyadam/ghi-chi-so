// ============================================================
// Google Apps Script — Ghi Chỉ Số PCVT
// Hybrid: Google Sheet (nhập liệu) + Supabase (đọc/ghi nhanh)
// ============================================================

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

// Khoá upsert bảng customers: 1 dòng = 1 điểm đo (MA_DDO) x 1 bộ chỉ số (BCS).
// (Không dùng MA_KHANG,BCS vì 1 khách hàng có thể có nhiều điểm đo, vd PB15020064783 có 6 điểm đo.)
// Supabase phải có UNIQUE("MA_DDO","BCS") tương ứng.
const CUSTOMER_CONFLICT_KEY = 'MA_DDO,BCS';

// Kiểm tra trùng khoá trên TOÀN BỘ dữ liệu trước khi đẩy lên, báo rõ dòng nào trùng.
function assertNoDuplicateKeys_(rows) {
  const seen = {};
  const dups = [];
  rows.forEach(function(r) {
    const k = String(r['MA_DDO'] || '').trim() + '|' + String(r['BCS'] || '').trim();
    if (seen[k]) dups.push(k + ' (dòng ' + seen[k] + ' và ' + r._sheetRow + ')');
    else seen[k] = r._sheetRow;
  });
  if (dups.length) {
    throw new Error('Sheet "Danh sach" có ' + dups.length + ' cặp MA_DDO|BCS bị trùng, sửa trước khi đồng bộ:\n' + dups.slice(0, 20).join('\n'));
  }
}

// Đẩy rows lên customers theo lô, trả về số dòng đã upsert.
function upsertCustomers_(rows) {
  assertNoDuplicateKeys_(rows);
  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map(function(r) {
      const o = Object.assign({}, r); delete o._sheetRow; return o;
    });
    supabaseRequest_('POST', 'customers?on_conflict=' + CUSTOMER_CONFLICT_KEY, chunk);
    total += chunk.length;
  }
  return total;
}

function getCustomerSkipColumns_() {
  var skip = PRESERVE_COLUMNS.slice();
  if (!SYNC_COORDINATES_FROM_SHEET) { skip.push('LATITUDE'); skip.push('LONGITUDE'); }
  return skip;
}

// =================== MENU TÙY CHỈNH ===================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ Đồng bộ Supabase')
    .addItem('Đồng bộ Khách hàng', 'syncCustomersToSupabase')
    .addItem('Đồng bộ Người dùng', 'syncUsersToSupabase')
    .addItem('Đồng bộ Trạm', 'syncStationsToSupabase')
    .addSeparator()
    .addItem('🔄 Đồng bộ Tất cả', 'syncAll')
    .addSeparator()
    .addItem('🆕 Cập nhật tháng mới (FULL — ghi đè chỉ số)', 'syncNewMonth')
    .addSeparator()
    .addItem('🧹 Dọn dòng thừa trên Supabase (không còn trong Sheet)', 'cleanupStaleCustomers')
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

  const isRead = (method.toUpperCase() === 'GET');
  const options = {
    method: method,
    headers: {
      'apikey': config.key,
      'Authorization': 'Bearer ' + config.key,
      'Content-Type': 'application/json',
      // Không gửi Prefer header cho GET — chỉ dùng cho mutation (POST/PATCH/DELETE)
      ...(isRead ? {} : { 'Prefer': 'resolution=merge-duplicates,return=minimal' })
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

// =================== DỌN DÒNG THỪA (theo khoá MA_DDO|BCS) ===================

function hasVal_(v) { return v !== '' && v !== null && v !== undefined; }

function customerKey_(maDdo, bcs) {
  return String(maDdo == null ? '' : maDdo).trim() + '|' + String(bcs == null ? '' : bcs).trim();
}

// Đọc tập khoá MA_DDO|BCS hiện có trong Sheet "Danh sach"
function readSheetCustomerKeys_() {
  const sheet = SpreadsheetApp.openById(getSheetId_()).getSheetByName('Danh sach');
  if (!sheet) throw new Error('Không tìm thấy sheet "Danh sach"');
  const data = sheet.getDataRange().getValues();
  const h = data[0].map(function(x) { return String(x).trim(); });
  const iDdo = h.indexOf('MA_DDO'), iBcs = h.indexOf('BCS'), iKh = h.indexOf('MA_KHANG');
  if (iDdo < 0 || iBcs < 0 || iKh < 0) throw new Error('Sheet "Danh sach" thiếu cột MA_DDO / BCS / MA_KHANG');
  const keys = new Set();
  for (let i = 1; i < data.length; i++) {
    if (!data[i][iKh]) continue;
    keys.add(customerKey_(data[i][iDdo], data[i][iBcs]));
  }
  return keys;
}

// Lấy toàn bộ dòng customers trên Supabase (phân trang theo id)
function fetchAllCustomerRows_(select) {
  const PAGE = 1000;
  let out = [], from = 0;
  while (true) {
    const rows = supabaseRequest_('GET', 'customers?select=' + select + '&order=id.asc&limit=' + PAGE + '&offset=' + from, null) || [];
    out = out.concat(rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Phân loại: dòng nào trên Supabase không còn trong Sheet (stale),
// và chỉ số của dòng stale có thể chuyển sang dòng mới tương ứng (cùng MA_KHANG + BCS, đang trống) hay không.
function analyzeStaleCustomers_() {
  const sheetKeys = readSheetCustomerKeys_();
  const MIN_SHEET_ROWS = 500;
  if (sheetKeys.size < MIN_SHEET_ROWS) {
    throw new Error('SAFETY: Sheet chỉ có ' + sheetKeys.size + ' dòng (< ' + MIN_SHEET_ROWS + '). Không dọn để tránh xoá nhầm.');
  }
  const rows = fetchAllCustomerRows_('id,MA_KHANG,MA_DDO,BCS,TEN_KHANG,ASSIGN,CHI_SO,USER,THOIGIAN_GHI,GHI_CHU');
  const stale = [], live = [];
  rows.forEach(function(r) { (sheetKeys.has(customerKey_(r.MA_DDO, r.BCS)) ? live : stale).push(r); });

  const liveByKhBcs = {};
  live.forEach(function(r) {
    const k = String(r.MA_KHANG || '').trim() + '|' + String(r.BCS || '').trim();
    (liveByKhBcs[k] = liveByKhBcs[k] || []).push(r);
  });

  const moves = [], lost = [];
  stale.forEach(function(s) {
    if (!hasVal_(s.CHI_SO)) return;
    const k = String(s.MA_KHANG || '').trim() + '|' + String(s.BCS || '').trim();
    const cands = (liveByKhBcs[k] || []).filter(function(r) { return !hasVal_(r.CHI_SO) && !r._claimed; });
    if (cands.length === 1) { cands[0]._claimed = true; moves.push({ to: cands[0].id, from: s }); }
    else lost.push(s);
  });
  return { total: rows.length, sheetCount: sheetKeys.size, live: live.length, stale: stale, moves: moves, lost: lost };
}

// Sao lưu dòng sắp xoá ra sheet "Backup_dong_thua" (phòng khi cần khôi phục)
function backupStaleRows_(rows) {
  if (!rows.length) return;
  const ss = SpreadsheetApp.openById(getSheetId_());
  const name = 'Backup_dong_thua';
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const cols = ['id', 'MA_KHANG', 'MA_DDO', 'BCS', 'TEN_KHANG', 'ASSIGN', 'CHI_SO', 'USER', 'THOIGIAN_GHI', 'GHI_CHU'];
  if (sh.getLastRow() === 0) sh.appendRow(['Thời điểm xoá'].concat(cols));
  const now = new Date();
  const values = rows.map(function(r) { return [now].concat(cols.map(function(c) { return r[c] == null ? '' : r[c]; })); });
  sh.getRange(sh.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
}

// Gửi nhiều PATCH song song (UrlFetchApp.fetchAll) để không vượt giới hạn 6 phút
function patchCustomersById_(items) {
  const config = getSupabaseConfig_();
  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    const reqs = items.slice(i, i + BATCH).map(function(it) {
      return {
        url: config.url + '/rest/v1/customers?id=eq.' + it.id,
        method: 'patch',
        contentType: 'application/json',
        headers: { apikey: config.key, Authorization: 'Bearer ' + config.key, Prefer: 'return=minimal' },
        payload: JSON.stringify(it.data),
        muteHttpExceptions: true
      };
    });
    UrlFetchApp.fetchAll(reqs).forEach(function(res) {
      if (res.getResponseCode() >= 400) throw new Error('Supabase PATCH lỗi: ' + res.getContentText());
    });
  }
}

function deleteCustomerIds_(ids) {
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    supabaseRequest_('DELETE', 'customers?id=in.(' + ids.slice(i, i + BATCH).join(',') + ')', null);
  }
}

// MENU: Dọn dòng thừa — xem trước, hỏi xác nhận, chuyển chỉ số, sao lưu rồi mới xoá
function cleanupStaleCustomers() {
  const ui = SpreadsheetApp.getUi();
  let a;
  try { a = analyzeStaleCustomers_(); }
  catch (err) { ui.alert('❌ ' + err.message); return; }

  if (!a.stale.length) {
    ui.alert('✅ Không có dòng thừa.\n\nSupabase: ' + a.total + ' dòng — khớp với Sheet (' + a.sheetCount + ' dòng).');
    return;
  }
  const msg =
    'Supabase hiện có: ' + a.total + ' dòng\n' +
    'Sheet "Danh sach": ' + a.sheetCount + ' dòng (MA_DDO|BCS)\n\n' +
    'Dòng thừa (không còn trong Sheet): ' + a.stale.length + '\n' +
    '  • Có chỉ số → chuyển sang dòng mới cùng KH + BCS: ' + a.moves.length + '\n' +
    '  • Có chỉ số nhưng không chuyển được: ' + a.lost.length + '\n\n' +
    'Toàn bộ dòng thừa sẽ được sao lưu sang sheet "Backup_dong_thua" trước khi xoá.\n\nTiếp tục?';
  if (ui.alert('🧹 Dọn dòng thừa', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) { ui.alert('Đã huỷ.'); return; }

  try {
    backupStaleRows_(a.stale);
    patchCustomersById_(a.moves.map(function(m) {
      return { id: m.to, data: { USER: m.from.USER || '', CHI_SO: m.from.CHI_SO, THOIGIAN_GHI: m.from.THOIGIAN_GHI || '', GHI_CHU: m.from.GHI_CHU || '' } };
    }));
    deleteCustomerIds_(a.stale.map(function(r) { return r.id; }));
    ui.alert('✅ Xong!\n\nĐã chuyển ' + a.moves.length + ' chỉ số sang dòng mới.\nĐã xoá ' + a.stale.length + ' dòng thừa.\nSupabase còn: ' + (a.total - a.stale.length) + ' dòng.');
  } catch (err) {
    ui.alert('❌ Lỗi: ' + err.message);
  }
}

// =================== SYNC FUNCTIONS ===================

function syncCustomersToSupabase() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(getSheetId_());
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
  const SKIP = getCustomerSkipColumns_();

  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (!header) continue;
      if (SKIP.indexOf(header) !== -1) continue;
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

    row._sheetRow = i + 1;
    batch.push(row);
  }

  // Kiểm tra trùng khoá trên toàn bộ Sheet rồi mới đẩy lên (tránh lỗi 21000 giữa chừng)
  totalUpserted = upsertCustomers_(batch);

  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.customers', {
    last_synced_at: new Date().toISOString(),
    row_count: totalUpserted,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });

  ui.alert('✅ Đồng bộ Khách hàng thành công!\n\nĐã upsert: ' + totalUpserted + ' dòng');
}

function syncUsersToSupabase() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(getSheetId_());
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
  const ss = SpreadsheetApp.openById(getSheetId_());
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
    ui.alert('Bắt đầu đồng bộ toàn bộ dữ liệu...\nVui lòng đợi, quá trình có thể mất 2-3 phút.');

    syncUsersToSupabaseQuiet_();
    syncStationsToSupabaseQuiet_();
    const customerCount = syncCustomersToSupabaseQuiet_();

    const elapsed = Math.round((new Date() - startTime) / 1000);
    ui.alert('🎉 Đồng bộ Tất cả hoàn tất!\n\nThời gian: ' + elapsed + ' giây\nKhách hàng: ' + customerCount + ' dòng');
  } catch (err) {
    ui.alert('❌ Lỗi đồng bộ: ' + err.message);
  }
}

// =================== CẬP NHẬT THÁNG MỚI (FULL SYNC — ghi đè cả chỉ số) ===================

function syncNewMonth() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ Cập nhật tháng mới',
    'Thao tác này sẽ GHI ĐÈ TOÀN BỘ dữ liệu khách hàng (kể cả CHI_SO, USER, THOIGIAN_GHI, GHI_CHU) bằng dữ liệu từ Sheet.\n\nChỉ thực hiện khi bắt đầu tháng mới và Sheet đã cập nhật đầy đủ.\n\nBạn có chắc chắn muốn tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    ui.alert('Đã hủy.');
    return;
  }

  const reconfirm = ui.alert(
    '⚠️ Xác nhận lần 2',
    'Dữ liệu chỉ số của TẤT CẢ nhân viên sẽ bị xóa và thay thế. Không thể hoàn tác.\n\nTiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (reconfirm !== ui.Button.YES) {
    ui.alert('Đã hủy.');
    return;
  }

  const startTime = new Date();
  try {
    const count = syncCustomersFullQuiet_();
    const elapsed = Math.round((new Date() - startTime) / 1000);
    ui.alert('✅ Cập nhật tháng mới hoàn tất!\n\nĐã đồng bộ: ' + count + ' khách hàng\nThời gian: ' + elapsed + ' giây');
  } catch (err) {
    ui.alert('❌ Lỗi: ' + err.message);
  }
}

function syncCustomersFullQuiet_() {
  // Full sync: ghi đè TẤT CẢ cột, kể cả USER, CHI_SO, THOIGIAN_GHI, GHI_CHU
  const ss = SpreadsheetApp.openById(getSheetId_());
  const sheet = ss.getSheetByName('Danh sach');
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const BATCH_SIZE = 500;
  let total = 0;
  let batch = [];
  const sheetMaKhangs = new Set();

  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (!header) continue;
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
    sheetMaKhangs.add(String(row['MA_KHANG']));
    row._sheetRow = i + 1;
    batch.push(row);
  }

  // Kiểm tra trùng khoá trên toàn bộ Sheet rồi mới đẩy lên (tránh lỗi 21000 giữa chừng)
  total = upsertCustomers_(batch);

  // Xoá dòng trên Supabase không còn trong Sheet — theo khoá MA_DDO|BCS (không theo MA_KHANG),
  // có safety guard + sao lưu sang sheet "Backup_dong_thua" trước khi xoá.
  const a = analyzeStaleCustomers_();
  Logger.log('Full sync cleanup: xoá ' + a.stale.length + ' dòng thừa (Sheet có ' + a.sheetCount + ' dòng)');
  backupStaleRows_(a.stale);
  deleteCustomerIds_(a.stale.map(function(r) { return r.id; }));

  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.customers', {
    last_synced_at: new Date().toISOString(),
    row_count: total,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });

  return total;
}

// =================== QUIET VERSIONS (dùng cho syncAll & triggerSync từ webapp) ===================

function syncUsersToSupabaseQuiet_() {
  const ss = SpreadsheetApp.openById(getSheetId_());
  const sheet = ss.getSheetByName('User');
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (!header) continue;
      let value = data[i][j];
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
  const ss = SpreadsheetApp.openById(getSheetId_());
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
      if (!header) continue;
      let value = data[i][j];

      if (header === 'Năm VH') {
        if (value instanceof Date) {
          value = value.getFullYear();
        } else if (value !== '' && value !== null && value !== undefined) {
          const num = Number(value);
          value = (num > 3000) ? new Date(num).getFullYear() : (isNaN(num) ? null : num);
        } else {
          value = null;
        }
      } else if (NUMERIC_COLS.includes(header)) {
        if (value instanceof Date) {
          value = null;
        } else {
          value = (value !== '' && value !== null && value !== undefined) ? Number(value) || null : null;
        }
      } else if (INTEGER_COLS.includes(header)) {
        if (value instanceof Date) {
          value = null;
        } else {
          value = (value !== '' && value !== null && value !== undefined) ? Number(value) : null;
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
  const ss = SpreadsheetApp.openById(getSheetId_());
  const sheet = ss.getSheetByName('Danh sach');
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const BATCH_SIZE = 500;
  let total = 0;
  let batch = [];
  const SKIP = getCustomerSkipColumns_();
  // Lưu ý: Regular sync (đồng bộ từ Google Sheet) KHÔNG xóa records cũ.
  // Việc xóa chỉ xảy ra khi dùng "Cập nhật tháng mới" (syncCustomersFullQuiet_).
  // Lý do: nếu Sheet tạm thời rỗng/lỗi, cleanup sẽ xóa toàn bộ dữ liệu Supabase.

  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (!header) continue;
      if (SKIP.indexOf(header) !== -1) continue;
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
    row._sheetRow = i + 1;
    batch.push(row);
  }

  // Kiểm tra trùng khoá trên toàn bộ Sheet rồi mới đẩy lên (tránh lỗi 21000 giữa chừng)
  total = upsertCustomers_(batch);

  supabaseRequest_('PATCH', 'sync_metadata?table_name=eq.customers', {
    last_synced_at: new Date().toISOString(),
    row_count: total,
    synced_by: Session.getActiveUser().getEmail() || 'unknown'
  });

  return total;
}

// =================== API ENDPOINTS ===================

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

  // Cập nhật tháng mới từ webapp — full sync, ghi đè cả chỉ số
  if (action === 'triggerFullSync') {
    try {
      const count = syncCustomersFullQuiet_();
      syncUsersToSupabaseQuiet_();
      syncStationsToSupabaseQuiet_();
      return ContentService.createTextOutput(JSON.stringify({ success: true, customerCount: count }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Trigger sync từ webapp — chạy đủ 3 bảng
  if (action === 'triggerSync') {
    try {
      const count = syncCustomersToSupabaseQuiet_(); // customers trước (lâu nhất) — chỉ upsert, không xóa
      syncUsersToSupabaseQuiet_();
      syncStationsToSupabaseQuiet_();
      return ContentService.createTextOutput(JSON.stringify({ success: true, customerCount: count }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Lấy thời gian sync gần nhất
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

  return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid JSON' }))
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

  return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================== READ HELPERS ===================

function getUsers() {
  const ss = SpreadsheetApp.openById(getSheetId_());
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
  const ss = SpreadsheetApp.openById(getSheetId_());
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
  const ss = SpreadsheetApp.openById(getSheetId_());
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

// =================== WRITE HELPERS ===================

function updateReading(payload) {
  const { rowIndex, chiSo, user, thoiGian, ghiChu, updateType, maKhang, bcs } = payload;
  const ss = SpreadsheetApp.openById(getSheetId_());
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
    sheet.getRange(targetRowIndex, userCol).setValue('');
    sheet.getRange(targetRowIndex, chiSoCol).setValue('');
    sheet.getRange(targetRowIndex, thoiGianCol).setValue('');
    sheet.getRange(targetRowIndex, ghiChuCol).setValue(ghiChu || '');
  } else if (type === 'NOTE_ONLY') {
    sheet.getRange(targetRowIndex, ghiChuCol).setValue(ghiChu || '');
  } else {
    sheet.getRange(targetRowIndex, userCol).setValue(user);
    sheet.getRange(targetRowIndex, chiSoCol).setValue(chiSo);
    sheet.getRange(targetRowIndex, thoiGianCol).setValue(thoiGian);
    sheet.getRange(targetRowIndex, ghiChuCol).setValue(ghiChu || '');
  }

  return { success: true };
}

function autoUpdateReadings(payload) {
  const { maKhangList, user, thoiGian } = payload;
  const ss = SpreadsheetApp.openById(getSheetId_());
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
  const ss = SpreadsheetApp.openById(getSheetId_());
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
    if (!(targetRowIndex <= data.length && data[targetRowIndex - 1][maKhangCol] == maKhang)) {
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

  sheet.getRange(targetRowIndex, latCol).setNumberFormat('@');
  sheet.getRange(targetRowIndex, latCol).setValue(latStr);
  sheet.getRange(targetRowIndex, lngCol).setNumberFormat('@');
  sheet.getRange(targetRowIndex, lngCol).setValue(lngStr);

  return { success: true };
}
