const fs = require('fs');
const f = 'src/components/UpdateReading.tsx';
let text = fs.readFileSync(f, 'utf8');

// Bảng thay thế: mojibake → tiếng Việt đúng
const replacements = [
  // Comments & labels
  ['PhÃ¢n cÃ´ng', 'Phân công'],
  ['Tá»± Ä\u0091Äƒng kÃ½', 'Tự đăng ký'],
  ['Quáº£n lÃ½ phÃ¢n cÃ´ng', 'Quản lý phân công'],
  ['Ghi tá»± Ä\u0091á»\u0099ng', 'Ghi tự động'],
  ['Ghi thá»§ cÃ´ng', 'Ghi thủ công'],
  ['ChÆ°a ghi', 'Chưa ghi'],
  ['Tá»•ng cá»\u0099ng', 'Tổng cộng'],
  ['Danh sÃ¡ch PhÃ¢n cÃ´ng', 'Danh sách Phân công'],
  ['TÃ¬m nhanh tÃªn, mÃ£ KH, SÄT trong danh sÃ¡ch nÃ\xa0y...', 'Tìm nhanh tên, mã KH, SĐT trong danh sách này...'],
  ['TÃ¬m nhÃ¢n viÃªn...', 'Tìm nhân viên...'],
  ['NhÃ¢n viÃªn:', 'Nhân viên:'],
  ['Táº¥t cáº£ cÃ¡c tráº¡m', 'Tất cả các trạm'],
  ['Táº¥t cáº£ sá»\u0091 GCS', 'Tất cả số GCS'],
  ['Tráº¡m:', 'Trạm:'],
  ['Sá»\u0091 GCS:', 'Số GCS:'],
  ['MÃ£ GC:', 'Mã GC:'],
  ['MÃ£ KH', 'Mã KH'],
  ['MÃ£ Tráº¡m', 'Mã Trạm'],
  ['TÃªn KhÃ¡ch hÃ\xa0ng', 'Tên Khách hàng'],
  ['KhÃ¡ch hÃ\xa0ng', 'Khách hàng'],
  ['Äá»\u008ba chá»\u0089', 'Địa chỉ'],
  ['LiÃªn há»\u0087', 'Liên hệ'],
  ['NgÆ°á»\u009di ghi', 'Người ghi'],
  ['NgÆ°á»\u009di ghi:', 'Người ghi:'],
  ['ChÆ°a cÃ³', 'Chưa có'],
  ['KhÃ´ng cÃ³ dá»¯ liá»\u0087u', 'Không có dữ liệu'],
  ['Vá»\u008b trÃ­', 'Vị trí'],
  ['Vui lÃ²ng nháº­p chá»\u0089 sá»\u0091', 'Vui lòng nhập chỉ số'],
  ['LÆ°u tháº¥t báº¡i', 'Lưu thất bại'],
  ['CÃ³ lá»\u0097i xáº£y ra khi lÆ°u', 'Có lỗi xảy ra khi lưu'],
  ['Cáº­p nháº­t vá»\u008b trÃ­ thÃ\xa0nh cÃ´ng!', 'Cập nhật vị trí thành công!'],
  ['Cáº­p nháº­t vá»\u008b trÃ­ tháº¥t báº¡i.', 'Cập nhật vị trí thất bại.'],
  ['CÃ³ lá»\u0097i xáº£y ra khi cáº­p nháº­t.', 'Có lỗi xảy ra khi cập nhật.'],
  ['TrÃ¬nh duyá»\u0087t cá»§a báº¡n khÃ´ng há»\u0097 trá»£ Ä\u0091á»\u008bnh vá»\u008b.', 'Trình duyệt của bạn không hỗ trợ định vị.'],
  ['KhÃ´ng thá»\u0083 láº¥y Ä\u0091Æ°á»£c vá»\u008b trÃ­: ', 'Không thể lấy được vị trí: '],
  ['Cáº¢NH BÃO Lá»\u0096I', 'CẢNH BÁO LỖI'],
  ['Chá»\u0089 sá»\u0091 má»\u009bi nhá»\u008f hÆ¡n chá»\u0089 sá»\u0091 cÅ©!', 'Chỉ số mới nhỏ hơn chỉ số cũ!'],
  ['Sáº£n lÆ°á»£ng:', 'Sản lượng:'],
  ['Sáº£n lÆ°á»£ng', 'Sản lượng'],
  ['Báº¯t buá»\u0099c nháº­p ghi chÃº!', 'Bắt buộc nhập ghi chú!'],
  ['Báº¯t buá»\u0099c nháº­p ghi chÃº.', 'Bắt buộc nhập ghi chú.'],
  ['tÄƒng', 'tăng'],
  ['so vá»\u009bi ThÃ¡ng -3', 'so với Tháng -3'],
  ['BÃ¬nh thÆ°á»\u009dng', 'Bình thường'],
  ['tiÃªu thá»¥', 'tiêu thụ'],
  ['giáº£m', 'giảm'],
  ['Nháº­p mÃ£ KH, tÃªn, hoáº·c sá»\u0091 cÃ´ng tÆ¡', 'Nhập mã KH, tên, hoặc số công tơ'],
  ['Ã­t nháº¥t 3 kÃ½ tá»±', 'ít nhất 3 ký tự'],
  ['KhÃ´ng tÃ¬m tháº¥y khÃ¡ch hÃ\xa0ng nÃ\xa0o', 'Không tìm thấy khách hàng nào'],
  ['Tráº¡ng thÃ¡i', 'Trạng thái'],
  ['HÃ\xa0nh Ä\u0091á»\u0099ng', 'Hành động'],
  ['Ghi chá»\u0089 sá»\u0091', 'Ghi chỉ số'],
  ['ÄÃ£ ghi', 'Đã ghi'],
  ['Cáº£nh bÃ¡o', 'Cảnh báo'],
  ['báº¥t thÆ°á»\u009dng', 'bất thường'],
  ['Ã¢m hoáº·c', 'âm hoặc'],
  ['pháº£i nháº­p ghi chÃº rÃµ rÃ\xa0ng', 'phải nhập ghi chú rõ ràng'],
  ['TBTID (cÅ©)', 'TBTID (cũ)'],
  ['TÃªn TBA', 'Tên TBA'],
];

let count = 0;
for (const [from, to] of replacements) {
  const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const matches = text.match(regex);
  if (matches) {
    count += matches.length;
    text = text.replace(regex, to);
  }
}

fs.writeFileSync(f, text, 'utf8');
console.log(`Fixed ${count} replacements in ${f}`);

// Verify
const verify = fs.readFileSync(f, 'utf8');
const remaining = verify.match(/[Ã¡Ã©Ã­Ã³ÃºÃ¢Ãª]/g);
console.log(`Remaining mojibake characters: ${remaining ? remaining.length : 0}`);
