export const MA_LOI_SEPARATOR = ' | ';

export const MA_LOI_OPTIONS = [
  { ma: 'MH',   hienThi: 'MH-Lỗi màn hình' },
  { ma: 'TH',   hienThi: 'TH-Công tơ lỗi mất tín hiệu' },
  { ma: 'HH',   hienThi: 'HH-Công tơ bị hư hỏng' },
  { ma: 'CH',   hienThi: 'CH-Công tơ cháy' },
  { ma: 'KD',   hienThi: 'KD-Công tơ không sử dụng - Đề nghị thu hồi' },
  { ma: 'AT',   hienThi: 'AT-Công tơ treo mất an toàn' },
  { ma: 'SG',   hienThi: 'SG-Công tơ sai giờ' },
  { ma: 'VN',   hienThi: 'VN-Thường xuyên vắng nhà' },
  { ma: 'KC',   hienThi: 'KC-Không tìm thấy công tơ' },
  { ma: 'KT',   hienThi: 'KT-Công tơ khác trạm' },
  { ma: 'Khác', hienThi: 'Khác' },
];

/** Ghép maLoi + note thành 1 chuỗi lưu DB */
export function buildGhiChu(maLoi: string, note: string): string {
  const hienThi = MA_LOI_OPTIONS.find(o => o.ma === maLoi)?.hienThi ?? '';
  if (hienThi && note.trim()) return `${hienThi}${MA_LOI_SEPARATOR}${note.trim()}`;
  if (hienThi) return hienThi;
  return note.trim();
}

/** Tách chuỗi GHI_CHU từ DB thành { maLoi, note } */
export function parseGhiChu(ghiChu: string): { maLoi: string; note: string } {
  if (!ghiChu) return { maLoi: '', note: '' };
  for (const opt of MA_LOI_OPTIONS) {
    if (ghiChu === opt.hienThi) return { maLoi: opt.ma, note: '' };
    if (ghiChu.startsWith(opt.hienThi + MA_LOI_SEPARATOR)) {
      return { maLoi: opt.ma, note: ghiChu.slice(opt.hienThi.length + MA_LOI_SEPARATOR.length) };
    }
  }
  return { maLoi: '', note: ghiChu };
}
