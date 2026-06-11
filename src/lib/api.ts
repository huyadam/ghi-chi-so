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
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('MA_SOGCS')
    .order('MA_TRAM')
    .order('MA_GHI_CHU');

  if (error) {
    console.error('Supabase fetchCustomers error:', error);
    // Fallback: trả về cache nếu có
    const cached = await cacheGet<Customer>('customers');
    if (cached) return cached;
    throw new Error('Không thể tải danh sách khách hàng');
  }

  const customers = data as Customer[];
  // Cập nhật cache trong nền
  cacheSet('customers', customers).catch(() => {});
  return customers;
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

export async function autoUpdateReadings(
  maKhangList: string[],
  user: string,
  thoiGian: string
): Promise<number> {
  let updatedCount = 0;

  // Batch update bằng cách gọi từng nhóm nhỏ
  const BATCH_SIZE = 50;
  for (let i = 0; i < maKhangList.length; i += BATCH_SIZE) {
    const batch = maKhangList.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('customers')
      .update({ USER: user, CHI_SO: 'Ghi tự động', THOIGIAN_GHI: thoiGian })
      .in('MA_KHANG', batch)
      .select('id');

    if (error) {
      console.error('Supabase autoUpdate batch error:', error);
    } else {
      // Đếm theo số dòng THỰC SỰ được cập nhật (1 KH có thể có nhiều BCS),
      // tránh cộng nhầm những MA_KHANG không tồn tại trong DB.
      updatedCount += data?.length ?? 0;
    }
  }

  return updatedCount;
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
    return { success: false, error: 'GAS URL chưa được cấu hình' };
  }

  try {
    const res = await fetch(`${GAS_URL}?action=triggerSync`);
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi kết nối' };
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
