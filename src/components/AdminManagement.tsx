import React, { useState } from 'react';
import { User, Customer } from '../types';
import { autoUpdateReadings } from '../lib/api';
import { Loader2, CheckCircle, AlertCircle, X, Download, RefreshCw, Cloud } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AdminManagementProps {
  currentUser: User;
  onRefreshCustomers: () => void;
  onUpdateLocalCustomer?: (id: string | number, updates: Partial<Customer>) => void;
  customers: Customer[];
  onSync?: () => Promise<void>;
  syncing?: boolean;
  lastSyncTime?: string | null;
}

export default function AdminManagement({ currentUser, onRefreshCustomers, onUpdateLocalCustomer, customers, onSync, syncing, lastSyncTime }: AdminManagementProps) {
  const [inputList, setInputList] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [maKhangListToUpdate, setMaKhangListToUpdate] = useState<string[]>([]);

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
      const updatedCount = await autoUpdateReadings(maKhangListToUpdate, currentUser.HO_TEN, thoiGian);
      
      setResult({ 
        success: true, 
        message: `Đã cập nhật thành công ${updatedCount} / ${maKhangListToUpdate.length} khách hàng.` 
      });
      setInputList('');

      if (onUpdateLocalCustomer) {
        maKhangListToUpdate.forEach(maKhang => {
          onUpdateLocalCustomer(maKhang, {
            CHI_SO: 'Ghi tự động',
            USER: currentUser.HO_TEN,
            THOIGIAN_GHI: thoiGian
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
          <div className={`mb-4 p-4 rounded-md flex items-start ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-2" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-2" />
            )}
            <p className={`text-sm ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.message}
            </p>
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
