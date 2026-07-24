export const MA_LOI_SEPARATOR = ' | ';

export const MA_LOI_OPTIONS: {
  ma: string;
  hienThi: string;
  ghiChuHint?: string;   // gợi ý hiển thị khi chọn
  requireNote?: boolean; // bắt buộc phải nhập ghi chú
}[] = [
  { ma: 'H', hienThi: 'H - Công tơ hư hỏng' },
  { ma: 'L', hienThi: 'L - Lố chỉ số' },
  { ma: 'Y', hienThi: 'Y - Chỉ số đúng', ghiChuHint: 'Tăng/giảm >30% so với tháng trước — bắt buộc dùng mã Y' },
  { ma: 'U', hienThi: 'U - Không dùng' },
  { ma: 'V', hienThi: 'V - Nhà khóa cửa' },
  { ma: 'G', hienThi: 'G - Không còn công tơ' },
  { ma: 'D', hienThi: 'D - Đang cắt điện' },
  { ma: 'Q', hienThi: 'Q - Công tơ qua tua' },
  { ma: 'X', hienThi: 'X - Thay, chưa treo CMIS', ghiChuHint: 'Bắt buộc ghi chú số No mới', requireNote: true },
  { ma: 'S', hienThi: 'S - Khác trạm', ghiChuHint: 'Bắt buộc ghi chú vị trí đúng của công tơ', requireNote: true },
  { ma: 'W', hienThi: 'W - Sai khác', ghiChuHint: 'Bắt buộc ghi chú nội dung cần báo', requireNote: true },
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
