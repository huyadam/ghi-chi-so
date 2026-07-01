import React, { useState, useRef } from 'react';
import { User, Customer } from '../types';
import { autoUpdateReadings, updateReading } from '../lib/api';
import { Loader2, CheckCircle, AlertCircle, X, Download, RefreshCw, Cloud, AlertTriangle, Upload, FileSpreadsheet } from 'lucide-react';
import { buildGhiChu } from '../lib/ghiChu';
import * as XLSX from 'xlsx';

interface ImportRow {
  maKhang: string;
  bcs: string;
  tenKhang: string;
  chiSoMoi: string;
  ghiChu: string;
}

interface ImportPreview {
  toWrite: ImportRow[];
  hasReading: Array<{ maKhang: string; tenKhang: string; chiSo: string }>;
  notFound: string[];
  notFilled: number;
}

interface AdminManagementProps {
  currentUser: User;
  onRefreshCustomers: () => void;
  onUpdateLocalCustomer?: (id: string | number, updates: Partial<Customer>) => void;
  customers: Customer[];
  onSync?: () => Promise<void>;
  syncing?: boolean;
  lastSyncTime?: string | null;
  onFullSync?: () => Promise<void>;
  fullSyncing?: boolean;
}

export default function AdminManagement({ currentUser, onRefreshCustomers, onUpdateLocalCustomer, customers, onSync, syncing, lastSyncTime, onFullSync, fullSyncing }: AdminManagementProps) {
  const [inputList, setInputList] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    skippedExisting?: string[];
    notFound?: string[];
  } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [maKhangListToUpdate, setMaKhangListToUpdate] = useState<string[]>([]);

  // Bulk import state
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);

  const hasReadingVal = (val: any) => val !== '' && val !== null && val !== undefined;

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);
        // Dùng TOÀN BỘ customers (không lọc theo nhân viên)
        const customerMap = new Map(customers.map(c => [String(c.MA_KHANG), c]));
        const toWrite: ImportRow[] = [];
        const hasReadingRows: ImportPreview['hasReading'] = [];
        const notFound: string[] = [];
        let notFilled = 0;
        for (const row of rows) {
          const maKhang = String(row['MA_KHANG'] ?? row['Mã KH'] ?? '').trim();
          if (!maKhang) continue;
          const chiSoMoi = String(row['Chỉ số mới'] ?? row['CHI_SO'] ?? row['Chỉ Số'] ?? '').trim();
          if (!chiSoMoi) { notFilled++; continue; }
          const customer = customerMap.get(maKhang);
          if (!customer) { notFound.push(maKhang); continue; }
          const maLoi = String(row['Mã lỗi'] ?? row['Mã Lỗi'] ?? '').trim();
          const ghiChuNote = String(row['Ghi chú'] ?? row['Ghi Chú'] ?? row['GHI_CHU'] ?? '').trim();
          const ghiChu = maLoi ? buildGhiChu(maLoi, ghiChuNote) : ghiChuNote;
          if (hasReadingVal(customer.CHI_SO)) {
            hasReadingRows.push({ maKhang, tenKhang: customer.TEN_KHANG, chiSo: String(customer.CHI_SO) });
          } else {
            toWrite.push({ maKhang, bcs: customer.BCS || '', tenKhang: customer.TEN_KHANG, chiSoMoi, ghiChu });
          }
        }
        setImportPreview({ toWrite, hasReading: hasReadingRows, notFound, notFilled });
        setImportResult(null);
      } catch {
        alert('Không thể đọc file. Dùng file .xlsx đúng định dạng.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.toWrite.length === 0) return;
    setImporting(true);
    setImportProgress(0);
    const thoiGian = new Date().toLocaleString('vi-VN');
    let success = 0;
    const errors: string[] = [];
    const { toWrite } = importPreview;
    const CHUNK = 8;
    for (let i = 0; i < toWrite.length; i += CHUNK) {
      const chunk = toWrite.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async (row) => {
        try {
          await updateReading(row.maKhang, row.bcs, row.chiSoMoi, currentUser.HO_TEN, thoiGian, row.ghiChu);
          success++;
          if (onUpdateLocalCustomer) {
            onUpdateLocalCustomer(row.maKhang, { CHI_SO: row.chiSoMoi, USER: currentUser.HO_TEN, THOIGIAN_GHI: thoiGian, GHI_CHU: row.ghiChu });
          }
        } catch {
          errors.push(row.maKhang);
        }
      }));
      setImportProgress(Math.min(100, Math.round((i + CHUNK) / toWrite.length * 100)));
    }
    setImporting(false);
    setImportResult({ success, errors });
    setImportPreview(null);
  };

  // Full sync (cập nhật tháng mới)
  const [showFullSyncModal, setShowFullSyncModal] = useState(false);
  const [fullSyncConfirmText, setFullSyncConfirmText] = useState('');

  const handleFullSyncConfirm = async () => {
    setShowFullSyncModal(false);
    setFullSyncConfirmText('');
    if (onFullSync) await onFullSync();
  };

  const handleExportToExcel = () => {
    const hasReading = (val: any) => val !== '' && val !== null && val !== undefined;
    const recordedCustomers = customers.filter(c => hasReading(c.CHI_SO) && c.MA_KHANG);

    if (recordedCustomers.length === 0) {
      alert('Chưa có khách hàng nào được ghi chỉ số để xuất dữ liệu.');
      return;
    }

    const dataToExport = recordedCustomers.map((c, index) => ({
      'STT': index + 1,
      'Mã Trạm': c.MA_TRAM || '',
      'Mã Lộ Trình (BCS)': c.BCS || '',
      'Mã KH': c.MA_KHANG || '',
      'Tên Khách Hàng': c.TEN_KHANG || '',
      'Địa Chỉ': c.DIA_CHI || '',
      'Số Điện Thoại': c.DTHOAI || '',
      'Số Công Tơ': c.SO_CTO || '',
      'Chỉ Số': hasReading(c.CHI_SO) ? c.CHI_SO : '',
      'Ghi Chú': c.GHI_CHU || '',
      'Người Ghi': c.USER || '',
      'Thời Gian Ghi': c.THOIGIAN_GHI || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Chi_So_Da_Ghi');

    worksheet['!cols'] = [
      { wch: 5 },  // STT
      { wch: 15 }, // Mã Trạm
      { wch: 15 }, // BCS
      { wch: 20 }, // Mã KH
      { wch: 25 }, // Tên KH
      { wch: 40 }, // Địa chỉ
      { wch: 15 }, // SĐT
      { wch: 15 }, // Số CT
      { wch: 10 }, // Chỉ Số
      { wch: 25 }, // Ghi Chú
      { wch: 20 }, // Người Ghi
      { wch: 20 }  // Thời Gian
    ];

    const currentDate = new Date();
    const formattedDate = `${currentDate.getFullYear()}${(currentDate.getMonth()+1).toString().padStart(2, '0')}${currentDate.getDate().toString().padStart(2, '0')}_${currentDate.getHours().toString().padStart(2, '0')}${currentDate.getMinutes().toString().padStart(2, '0')}`;
    XLSX.writeFile(workbook, `Danh_Sach_Ghi_Chi_So_${formattedDate}.xlsx`);
  };

  const handlePreSubmit = () => {
    if (!inputList.trim()) {
      setResult({ success: false, message: 'Vui lòng nhập danh sách mã khách hàng' });
      return;
    }

    const maKhangList = inputList
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (maKhangList.length === 0) {
      setResult({ success: false, message: 'Không tìm thấy mã khách hàng hợp lệ' });
      return;
    }

    setMaKhangListToUpdate(maKhangList);
    setShowConfirmModal(true);
  };

  const handleAutoUpdate = async () => {
    setShowConfirmModal(false);
    setLoading(true);
    setResult(null);

    try {
      const thoiGian = new Date().toLocaleString('vi-VN');
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
    } catch (err: any) {
      setResult({ 
        success: false, 
        message: err.message || 'Có lỗi xảy ra khi cập nhật' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Sync Section */}
      {onSync && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-600" />
            Đồng bộ dữ liệu từ Google Sheet
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Sau khi người nhập liệu paste dữ liệu mới vào Google Sheet, nhấn nút bên dưới để đồng bộ lên hệ thống.
            Quá trình mất khoảng 2-3 phút cho ~25.000 dòng.
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={onSync}
              disabled={syncing}
              className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ Google Sheet'}
            </button>
            {lastSyncTime && (
              <span className="text-sm text-gray-500">
                Lần sync gần nhất: <strong>{lastSyncTime}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Full Sync — Cập nhật tháng mới */}
      {onFullSync && (
        <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
          <h2 className="text-xl font-bold text-red-800 mb-1 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Cập nhật tháng mới
          </h2>
          <p className="text-sm text-red-700 mb-4">
            Ghi đè <strong>toàn bộ</strong> dữ liệu khách hàng từ Google Sheet — kể cả chỉ số, người ghi, thời gian, ghi chú.
            Chỉ dùng khi bắt đầu tháng mới, sau khi Sheet đã được cập nhật đầy đủ.
          </p>
          <button
            onClick={() => { setShowFullSyncModal(true); setFullSyncConfirmText(''); }}
            disabled={fullSyncing}
            className="inline-flex items-center px-5 py-2.5 border border-red-400 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${fullSyncing ? 'animate-spin' : ''}`} />
            {fullSyncing ? 'Đang cập nhật...' : 'Cập nhật tháng mới'}
          </button>
        </div>
      )}

      {/* Auto Update Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quản lý chỉ số - Ghi tự động</h2>
        
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Nhập danh sách Mã khách hàng đã ghi được chỉ số tự động. Mỗi mã trên 1 dòng hoặc cách nhau bằng dấu phẩy.
          </p>
          <textarea
            rows={10}
            className="w-full border border-gray-300 rounded-md shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500"
            placeholder={"Ví dụ:\nPB11010012345\nPB11010012346\nPB11010012347"}
            value={inputList}
            onChange={(e) => setInputList(e.target.value)}
          />
        </div>

        {result && (
          <div className={`mb-4 p-4 rounded-md flex flex-col items-start ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-start">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-2" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-2" />
              )}
              <p className={`text-sm ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.message}
              </p>
            </div>
            
            {result?.skippedExisting && result.skippedExisting.length > 0 && (
              <div className="mt-2 text-sm w-full">
                <p className="font-medium text-amber-700">
                  {result.skippedExisting.length} mã đã có chỉ số — giữ nguyên:
                </p>
                <div className="mt-1 max-h-32 overflow-y-auto rounded bg-amber-50 p-2 font-mono text-xs text-amber-800">
                  {result.skippedExisting.join(', ')}
                </div>
              </div>
            )}
            {result?.notFound && result.notFound.length > 0 && (
              <div className="mt-2 text-sm w-full">
                <p className="font-medium text-red-700">{result.notFound.length} mã không tìm thấy:</p>
                <div className="mt-1 max-h-24 overflow-y-auto rounded bg-red-50 p-2 font-mono text-xs text-red-800">
                  {result.notFound.join(', ')}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end border-b pb-6 mb-6">
          <button
            onClick={handlePreSubmit}
            disabled={loading || !inputList.trim()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                Đang xử lý...
              </>
            ) : (
              'Cập nhật Ghi tự động'
            )}
          </button>
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Xuất dữ liệu</h2>
          <div className="flex items-center justify-between pb-4">
            <p className="text-sm text-gray-600">
              Tải xuống danh sách toàn bộ các khách hàng đã được ghi chỉ số dưới dạng file Excel.
            </p>
            <button
              onClick={handleExportToExcel}
              className="inline-flex items-center px-4 py-2 border border-green-600 text-sm font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
            >
              <Download className="mr-2 h-4 w-4" />
              Xuất Excel
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Import Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-green-600" />
          Nhập dữ liệu hàng loạt từ Excel
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload file Excel (đã xuất hoặc đúng định dạng) để ghi chỉ số cho nhiều khách hàng cùng lúc.
          Chỉ ghi vào KH chưa có chỉ số — KH đã có sẽ bỏ qua.
        </p>

        {importResult && (
          <div className={`mb-4 p-4 rounded-lg ${importResult.errors.length === 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            <p className={`font-medium text-sm ${importResult.errors.length === 0 ? 'text-green-800' : 'text-amber-800'}`}>
              ✅ Đã ghi thành công {importResult.success} khách hàng.
              {importResult.errors.length > 0 && ` ❌ ${importResult.errors.length} lỗi.`}
            </p>
            {importResult.errors.length > 0 && (
              <div className="mt-2 font-mono text-xs text-red-700 max-h-24 overflow-y-auto bg-red-50 rounded p-2">
                {importResult.errors.join(', ')}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => importFileRef.current?.click()}
            className="inline-flex items-center px-4 py-2 border border-green-400 text-sm font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
          >
            <Upload className="h-4 w-4 mr-2" />
            Chọn file Excel
          </button>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFileSelect} />
          <span className="text-xs text-gray-400">Hỗ trợ file đã xuất từ hệ thống hoặc file mẫu</span>
        </div>
      </div>

      {/* Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-gray-900">Xác nhận nhập dữ liệu</h3>
              <button onClick={() => setImportPreview(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{importPreview.toWrite.length}</div>
                  <div className="text-xs text-green-600 mt-1">Sẽ được ghi</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-700">{importPreview.hasReading.length}</div>
                  <div className="text-xs text-amber-600 mt-1">Đã có chỉ số (bỏ qua)</div>
                </div>
              </div>
              {importPreview.notFound.length > 0 && (
                <p className="text-xs text-red-600 mb-3">⚠️ {importPreview.notFound.length} mã không tìm thấy trong hệ thống.</p>
              )}
              {importPreview.notFilled > 0 && (
                <p className="text-xs text-gray-500 mb-3">{importPreview.notFilled} dòng không có chỉ số → bỏ qua.</p>
              )}
              {importPreview.toWrite.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Mã KH</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Tên KH</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Chỉ số</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importPreview.toWrite.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-mono text-gray-600">{row.maKhang}</td>
                          <td className="px-3 py-1.5 text-gray-800 truncate max-w-[180px]">{row.tenKhang}</td>
                          <td className="px-3 py-1.5 font-medium text-green-700">{row.chiSoMoi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreview.toWrite.length > 50 && (
                    <p className="text-center text-xs text-gray-400 py-2">... và {importPreview.toWrite.length - 50} dòng khác</p>
                  )}
                </div>
              )}
            </div>
            {importing && (
              <div className="px-6 pb-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${importProgress}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1 text-center">{importProgress}%</p>
              </div>
            )}
            <div className="flex justify-end gap-3 p-6 border-t">
              <button onClick={() => setImportPreview(null)} disabled={importing} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50">
                Hủy
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing || importPreview.toWrite.length === 0}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {importing ? <><Loader2 className="animate-spin h-4 w-4 mr-2" />Đang ghi...</> : `Ghi ${importPreview.toWrite.length} dòng`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Sync Confirm Modal */}
            {showFullSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Xác nhận cập nhật tháng mới
              </h3>
              <button onClick={() => setShowFullSyncModal(false)} className="text-gray-400 hover:text-gray-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-800 space-y-1">
              <p>⚠️ Thao tác này sẽ <strong>xóa và ghi đè toàn bộ</strong> dữ liệu khách hàng trong hệ thống bằng dữ liệu từ Google Sheet.</p>
              <p>Bao gồm: chỉ số đã ghi, người ghi, thời gian ghi, ghi chú của <strong>tất cả nhân viên</strong>.</p>
              <p className="font-semibold">Không thể hoàn tác sau khi xác nhận.</p>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gõ <span className="font-mono font-bold text-red-600">XAC NHAN</span> để tiếp tục:
            </label>
            <input
              type="text"
              value={fullSyncConfirmText}
              onChange={e => setFullSyncConfirmText(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="XAC NHAN"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowFullSyncModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 text-sm"
              >
                Hủy
              </button>
              <button
                onClick={handleFullSyncConfirm}
                disabled={fullSyncConfirmText.trim().toUpperCase() !== 'XAC NHAN'}
                className="px-4 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                Xác nhận cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
                Xác nhận cập nhật
              </h3>
              <button onClick={() => setShowConfirmModal(false)} className="text-gray-400 hover:text-gray-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              Bạn có chắc chắn muốn cập nhật tự động cho <strong className="text-gray-900">{maKhangListToUpdate.length}</strong> khách hàng này?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleAutoUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
