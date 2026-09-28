import { Customer } from '../types';

/**
 * Đếm theo KHÁCH HÀNG (MA_KHANG), không theo dòng BCS.
 * 1 KH có nhiều BCS chỉ tính 1.
 *
 * Trạng thái 1 KH:
 *  - 'unrecorded': còn ít nhất 1 BCS chưa ghi
 *  - 'auto'      : tất cả BCS đều "Ghi tự động"
 *  - 'manual'    : đã ghi đủ, có ít nhất 1 BCS ghi thủ công
 */
export type KHStatus = 'unrecorded' | 'auto' | 'manual';

const hasVal = (v: any) => v !== '' && v !== null && v !== undefined;

export function khStatus(rows: Customer[]): KHStatus {
  if (rows.some(r => !hasVal(r.CHI_SO))) return 'unrecorded';
  if (rows.every(r => r.CHI_SO === 'Ghi tự động')) return 'auto';
  return 'manual';
}

/** Gom các dòng theo MA_KHANG */
export function groupByKH(rows: Customer[]): Map<string, Customer[]> {
  const map = new Map<string, Customer[]>();
  for (const r of rows) {
    const key = String(r.MA_KHANG ?? '');
    if (!key) continue;
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return map;
}

export interface KHCount {
  total: number;
  recorded: number;
  unrecorded: number;
  auto: number;
  manual: number;
}

/** Đếm số KH theo trạng thái */
export function countKH(rows: Customer[]): KHCount {
  const res: KHCount = { total: 0, recorded: 0, unrecorded: 0, auto: 0, manual: 0 };
  for (const group of groupByKH(rows).values()) {
    res.total++;
    const s = khStatus(group);
    res[s]++;
    if (s !== 'unrecorded') res.recorded++;
  }
  return res;
}

/** Đếm số KH theo 1 khóa nhóm (nhân viên, trạm, đơn vị...) */
export function countKHBy(rows: Customer[], keyFn: (c: Customer) => string): Map<string, KHCount> {
  const buckets = new Map<string, Customer[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  const out = new Map<string, KHCount>();
  for (const [k, list] of buckets) out.set(k, countKH(list));
  return out;
}
