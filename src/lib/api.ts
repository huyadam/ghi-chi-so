import { Customer, User, Station } from '../types';
import { supabase } from './supabase';
import { cacheGet, cacheSet } from './cache';

// GAS URL giữ lại cho sync trigger
const GAS_URL = import.meta.env.VITE_GAS_URL || '';

// =================== READ — Supabase (< 500ms) ===================

export async function fetchUsers(): Promise<User[]> {
  // Thử cache trước
  const cached = await cacheGet<User>('users');

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('STT');

  if (error) {
    console.error('Supabase fetchUsers error:', error);
    // Fallback: trả về cache nếu có
    if (cached) return cached;
    throw new Error('Không thể tải danh sách người dùng');
  }

  const users = data as User[];
  // Cập nhật cache
  await cacheSet('users', users);
  return users;
}

export async function fetchCustomers(): Promise<Customer[]> {
  // Supabase default limit = 1000 → cần phân trang để lấy hết toàn bộ ~29k records
  const PAGE_SIZE = 1000;
  let allCustomers: Customer[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('MA_SOGCS')
      .order('MA_TRAM')
      .order('MA_GHI_CHU')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Supabase fetchCustomers error:', error);
      // Fallback: trả về cache nếu có
      const cached = await cacheGet<Customer>('customers');
      if (cached) return cached;
      throw new Error('Không thể tải danh sách khách hàng');
    }

    allCustomers = allCustomers.concat(data as Customer[]);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  // Cập nhật cache trong nền
  cacheSet('customers', allCustomers).catch(() => {});
  return allCustomers;
}

export async function fetchCustomersCached(): Promise<{ data: Customer[]; fromCache: boolean }> {
  // Stale-While-Revalidate: trả cache ngay, fetch mới trong nền
  const cached = await cacheGet<Customer>('customers');

  if (cached && cached.length > 0) {
    return { data: cached, fromCache: true };
  }

  // Không có cache → fetch trực tiếp
  const customers = await fetchCustomers();
  return { data: customers, fromCache: false };
}

export async function fetchStations(): Promise<Station[]> {
  const cached = await cacheGet<Station>('stations');

  // Supabase default limit = 1000, cần phân trang để lấy hết ~5000 trạm
  const PAGE_SIZE = 1000;
  let allStations: Station[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('stations')
      .select('*')
      .order('STT')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Supabase fetchStations error:', error);
      if (cached) return cached;
      throw new Error('Không thể tải danh sách trạm');
    }

    allStations = allStations.concat(data as Station[]);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  await cacheSet('stations', allStations);
  return allStations;
}

// =================== WRITE — Supabase (< 200ms) ===================

export async function updateReading(
  maKhang: string,
  bcs: string,
  chiSo: string,
  user: string,
  thoiGian: string,
  ghiChu: string,
  updateType: 'FULL' | 'NOTE_ONLY' | 'DELETE_READING' = 'FULL'
): Promise<boolean> {
  let updates: Partial<Customer> = {};

  if (updateType === 'DELETE_READING') {
    updates = { USER: '', CHI_SO: '', THOIGIAN_GHI: '', GHI_CHU: ghiChu || '' };
  } else if (updateType === 'NOTE_ONLY') {
    updates = { GHI_CHU: ghiChu || '' };
  } else {
    updates = { USER: user, CHI_SO: chiSo, THOIGIAN_GHI: thoiGian, GHI_CHU: ghiChu || '' };
  }

  const { error } = await supabase
    .from('customers')
    .update(updates)
    .eq('MA_KHANG', maKhang)
    .eq('BCS', bcs);

  if (error) {
    console.error('Supabase updateReading error:', error);
    throw new Error('Lưu thất bại: ' + error.message);
  }

  return true;
}

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

export async function updateCoordinates(
  maKhang: string,
  lat: number,
  lng: number
): Promise<boolean> {
  const latStr = String(lat).replace(/,/g, '.');
  const lngStr = String(lng).replace(/,/g, '.');

  const { error } = await supabase
    .from('customers')
    .update({ LATITUDE: latStr, LONGITUDE: lngStr })
    .eq('MA_KHANG', maKhang);

  if (error) {
    console.error('Supabase updateCoordinates error:', error);
    throw new Error('Cập nhật tọa độ thất bại: ' + error.message);
  }

  return true;
}

// =================== SYNC — Trigger GAS sync ===================

export async function triggerSync(): Promise<{ success: boolean; customerCount?: number; error?: string }> {
  if (!GAS_URL) {
    return { success: false, error: 'GAS URL chưa được cấu hình (thiếu VITE_GAS_URL)' };
  }

  try {
    const res = await fetch(`${GAS_URL}?action=triggerSync`, {
      method: 'GET',
      redirect: 'follow',
    });

    if (!res.ok) {
      return { success: false, error: `GAS trả về HTTP ${res.status} ${res.statusText}` };
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      // GAS không trả về JSON — có thể đang chạy và trả về HTML/text
      console.warn('GAS response is not JSON:', text.slice(0, 200));
      // Nếu status 200 nhưng không phải JSON → coi là trigger thành công (async)
      return { success: true, customerCount: undefined };
    }
  } catch (err: any) {
    console.error('triggerSync fetch error:', err);
    // CORS error thường có message "Failed to fetch"
    const isCors = err.message?.includes('fetch') || err.name === 'TypeError';
    return {
      success: false,
      error: isCors
        ? 'Không thể kết nối GAS (CORS hoặc mạng). Kiểm tra console để biết thêm.'
        : (err.message || 'Lỗi không xác định'),
    };
  }
}

export async function getSyncStatus(): Promise<any[]> {
  const { data, error } = await supabase
    .from('sync_metadata')
    .select('*');

  if (error) {
    console.error('Supabase getSyncStatus error:', error);
    return [];
  }

  return data || [];
}
