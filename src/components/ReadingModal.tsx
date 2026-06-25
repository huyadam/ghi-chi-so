import React, { useState, useRef, useEffect } from 'react';
import { Customer, User, Station } from '../types';
import { updateReading, updateCoordinates } from '../lib/api';
import {
  Loader2, Send, ChevronLeft, ChevronRight, X, ChevronDown,
  LayoutDashboard, MapPin, Zap, XCircle, AlertTriangle, Navigation,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { MA_LOI_OPTIONS, buildGhiChu, parseGhiChu } from '../lib/ghiChu';

type ToastType = 'success' | 'error' | 'warning';

interface ReadingModalProps {
  initialCustomer: Customer;
  currentList: Customer[];
  currentUser: User;
  stations: Station[];
  onClose: () => void;
  onUpdateLocalCustomer?: (id: string | number, updates: Partial<Customer>) => void;
  onRefreshCustomers: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}

function getStationName(maTram: string, stations: Station[]): string {
  if (!maTram) return '';
  const s = stations.find(s => s.TBTID === maTram || s['TBTID (cũ)'] === maTram);
  return s ? (s['Tên TBA'] || maTram) : maTram;
}

function initFields(c: Customer) {
  const { maLoi, note } = parseGhiChu(c.GHI_CHU || '');
  return {
    chiSo: c.CHI_SO && c.CHI_SO !== 'Ghi tự động' ? c.CHI_SO : '',
    ghiChu: note,
    maLoi,
  };
}

export default function ReadingModal({
  initialCustomer,
  currentList,
  currentUser,
  stations,
  onClose,
  onUpdateLocalCustomer,
  onRefreshCustomers,
  showToast,
}: ReadingModalProps) {
  // Current customer (can navigate internally)
  const [customer, setCustomer] = useState(initialCustomer);

  // Input fields
  const [chiSoInput, setChiSoInput] = useState('');
  const [ghiChuInput, setGhiChuInput] = useState('');
  const [maLoiInput, setMaLoiInput] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [savingType, setSavingType] = useState<'FULL' | 'NOTE_ONLY' | 'DELETE_READING' | null>(null);

  // Confirm dialogs
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showZeroConfirm, setShowZeroConfirm] = useState(false);

  // Location
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState(false);

  // Mã lỗi dropdown
  const [isMaLoiDropdownOpen, setIsMaLoiDropdownOpen] = useState(false);
  const [maLoiSearch, setMaLoiSearch] = useState('');
  const maLoiDropdownRef = useRef<HTMLDivElement>(null);

  // Init fields when initialCustomer changes (e.g. list re-opens modal)
  useEffect(() => {
    setCustomer(initialCustomer);
    const f = initFields(initialCustomer);
    setChiSoInput(f.chiSo);
    setGhiChuInput(f.ghiChu);
    setMaLoiInput(f.maLoi);
    setMaLoiSearch('');
    setIsMaLoiDropdownOpen(false);
  }, [initialCustomer.id]);

  // Close modal if customer leaves currentList (filter changed)
  useEffect(() => {
    if (!saving && currentList.findIndex(c => c.id === customer.id) === -1) {
      onClose();
    }
  }, [currentList]);

  // Close mã lỗi dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (maLoiDropdownRef.current && !maLoiDropdownRef.current.contains(e.target as Node)) {
        setIsMaLoiDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Navigation
  const currentIndex = currentList.findIndex(c => c.id === customer.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < currentList.length - 1;

  const navigateTo = (c: Customer) => {
    const f = initFields(c);
    setCustomer(c);
    setChiSoInput(f.chiSo);
    setGhiChuInput(f.ghiChu);
    setMaLoiInput(f.maLoi);
    setMaLoiSearch('');
    setIsMaLoiDropdownOpen(false);
  };

  // Warning calculation
  let warningMessage: string | null = null;
  let warningType = 'info';
  if (chiSoInput) {
    const hsNhan = Number(customer.HS_NHAN) || 1;
    const oldReading = Number(customer.CHISO_CU);
    const newReading = Number(chiSoInput);
    if (!isNaN(oldReading) && !isNaN(newReading)) {
      const consumption = (newReading - oldReading) * hsNhan;
      const compareMonth = Number(customer.SLUONG_3);
      if (consumption < 0) {
        warningMessage = `CẢNH BÁO LỖI: Chỉ số mới nhỏ hơn chỉ số cũ! (Sản lượng: ${consumption}). Bắt buộc nhập ghi chú!`;
        warningType = 'error';
      } else if (!isNaN(compareMonth) && compareMonth > 0) {
        if (consumption > compareMonth * 2) {
          warningMessage = `CẢNH BÁO LỖI: Sản lượng (${consumption}) tăng > 100% so với Tháng -3 (${compareMonth})! Bắt buộc nhập ghi chú.`;
          warningType = 'error';
        } else if (consumption > compareMonth * 1.3) {
          warningMessage = `Sản lượng tiêu thụ (${consumption}) tăng > 30% so với Tháng -3 (${compareMonth})!`;
          warningType = 'warning';
        } else if (consumption < compareMonth * 0.7) {
          warningMessage = `Sản lượng tiêu thụ (${consumption}) giảm > 30% so với Tháng -3 (${compareMonth})!`;
          warningType = 'warning';
        } else {
          warningMessage = `Sản lượng: ${consumption} (Bình thường)`;
          warningType = 'success';
        }
      } else {
        warningMessage = `Sản lượng tiêu thụ: ${consumption}`;
        warningType = 'success';
      }
    }
  }

  // Save handler
  const handleSave = async (
    updateType: 'FULL' | 'NOTE_ONLY' | 'DELETE_READING' = 'FULL',
    skipZeroCheck = false,
  ) => {
    if (updateType === 'FULL') {
      if (!chiSoInput.trim()) {
        showToast('Vui lòng nhập chỉ số', 'warning');
        return;
      }
      const hsNhan = Number(customer.HS_NHAN) || 1;
      const oldReading = Number(customer.CHISO_CU);
      const newReading = Number(chiSoInput);
      if (!isNaN(oldReading) && !isNaN(newReading)) {
        const consumption = (newReading - oldReading) * hsNhan;
        const thresh = Number(customer.SLUONG_3);
        const anomalous = consumption < 0 || (!isNaN(thresh) && thresh > 0 && consumption > 2 * thresh);
        if (anomalous && !buildGhiChu(maLoiInput, ghiChuInput)) {
          showToast('Sản lượng bất thường! Bắt buộc phải chọn mã lỗi hoặc nhập ghi chú rõ ràng.', 'error');
          return;
        }
      }
      if (chiSoInput.trim() === '0' && !skipZeroCheck) {
        setShowZeroConfirm(true);
        return;
      }
    }

    setSaving(true);
    setSavingType(updateType);
    try {
      const thoiGian = new Date().toLocaleString('vi-VN');
      const ghiChuSave = buildGhiChu(maLoiInput, ghiChuInput);
      const success = await updateReading(
        customer.MA_KHANG,
        customer.BCS,
        chiSoInput,
        currentUser.HO_TEN,
        thoiGian,
        ghiChuSave,
        updateType,
      );

      if (success) {
        const msg = updateType === 'DELETE_READING' ? 'Đã xóa chỉ số'
          : updateType === 'NOTE_ONLY' ? 'Đã lưu ghi chú'
          : 'Đã lưu chỉ số';
        showToast(msg);

        // Update local state
        if (onUpdateLocalCustomer) {
          if (updateType === 'DELETE_READING') {
            onUpdateLocalCustomer(customer.id, { CHI_SO: '', USER: '', THOIGIAN_GHI: '', GHI_CHU: ghiChuSave });
          } else if (updateType === 'NOTE_ONLY') {
            onUpdateLocalCustomer(customer.id, { GHI_CHU: ghiChuSave });
          } else {
            onUpdateLocalCustomer(customer.id, { CHI_SO: chiSoInput, USER: currentUser.HO_TEN, THOIGIAN_GHI: thoiGian, GHI_CHU: ghiChuSave });
          }
        } else {
          onRefreshCustomers();
        }

        if (updateType === 'DELETE_READING') {
          onClose();
        } else {
          // Navigate to next
          const idx = currentList.findIndex(c => c.id === customer.id);
          if (idx !== -1 && idx < currentList.length - 1) {
            navigateTo(currentList[idx + 1]);
          } else {
            onClose();
          }
        }
      } else {
        showToast('Lưu thất bại', 'error');
      }
    } catch {
      showToast('Có lỗi xảy ra khi lưu', 'error');
    } finally {
      setSaving(false);
      setSavingType(null);
    }
  };

  // Location
  const fetchCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt của bạn không hỗ trợ định vị.');
      return;
    }
    setUpdatingLocation(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUpdatingLocation(false);
      },
      (err) => {
        setLocationError('Không thể lấy được vị trí: ' + err.message);
        setUpdatingLocation(false);
      },
      { enableHighAccuracy: true },
    );
  };

  const openLocationModal = () => {
    setCurrentLocation(null);
    setLocationError(null);
    setShowLocationModal(true);
    fetchCurrentLocation();
  };

  const handleConfirmLocation = async () => {
    if (!currentLocation) return;
    setUpdatingLocation(true);
    try {
      const success = await updateCoordinates(customer.MA_KHANG, currentLocation.lat, currentLocation.lng);
      if (success) {
        showToast('Cập nhật vị trí thành công!');
        if (onUpdateLocalCustomer) {
          onUpdateLocalCustomer(customer.id, { LATITUDE: currentLocation.lat, LONGITUDE: currentLocation.lng });
        }
        setCustomer(prev => ({ ...prev, LATITUDE: currentLocation.lat, LONGITUDE: currentLocation.lng }));
        setShowLocationModal(false);
      } else {
        showToast('Cập nhật vị trí thất bại.', 'error');
      }
    } catch {
      showToast('Có lỗi xảy ra khi cập nhật.', 'error');
    } finally {
      setUpdatingLocation(false);
    }
  };

  const stationName = getStationName(customer.MA_TRAM, stations);

  return (
    <>
      {/* Main Reading Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={() => !saving && onClose()}
        />
        <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
          <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
            {/* Mobile header */}
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 border-b pb-3 mb-4 flex justify-between items-center sm:hidden sticky top-0 bg-white z-10 -mx-4 -mt-4 px-4 pt-4 shadow-sm">
              <span>Chi tiết &amp; Ghi chỉ số</span>
              <div className="flex gap-1">
                <button onClick={() => hasPrev && navigateTo(currentList[currentIndex - 1])} disabled={!hasPrev} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft className="h-5 w-5" /></button>
                <button onClick={() => hasNext && navigateTo(currentList[currentIndex + 1])} disabled={!hasNext} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight className="h-5 w-5" /></button>
                <div className="w-px h-6 bg-gray-300 mx-1" />
                <button onClick={() => !saving && onClose()} disabled={saving} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </h3>
            {/* Desktop header */}
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 border-b pb-3 mb-4 hidden sm:flex justify-between items-center">
              <span>Chi tiết &amp; Ghi chỉ số</span>
              <div className="flex gap-2">
                <button onClick={() => hasPrev && navigateTo(currentList[currentIndex - 1])} disabled={!hasPrev} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent" title="Khách hàng trước"><ChevronLeft className="h-5 w-5" /></button>
                <button onClick={() => hasNext && navigateTo(currentList[currentIndex + 1])} disabled={!hasNext} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent" title="Khách hàng tiếp theo"><ChevronRight className="h-5 w-5" /></button>
              </div>
            </h3>

            <div className="space-y-4 text-sm text-gray-600">
              {/* Customer info */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-1">
                <p className="font-bold text-lg text-blue-900 mb-1">{customer.TEN_KHANG}</p>
                <p className="text-blue-800"><strong>Mã KH:</strong> {customer.MA_KHANG}</p>
                <p className="text-blue-800"><strong>Địa chỉ:</strong> {customer.DIA_CHI}</p>
                <p className="text-blue-800">
                  <strong>Mã trạm:</strong> {customer.MA_TRAM}
                  {customer.MA_TRAM && <span className="ml-1 inline-flex text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">Trạm: {stationName}</span>}
                  {' '}| <strong>Số CT:</strong> {customer.SO_CTO}
                </p>
                <p className="text-blue-800">
                  <strong>Mã GC:</strong> {customer.MA_GHI_CHU || 'N/A'} |{' '}
                  {customer.MA_SOGCS && <span><strong>Sổ GCS:</strong> {customer.MA_SOGCS} | </span>}
                  <strong>BCS:</strong> {customer.BCS || 'N/A'}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {customer.DTHOAI && (
                    <>
                      <strong className="text-blue-800">SĐT:</strong>
                      <a href={`tel:${customer.DTHOAI}`} className="inline-flex bg-green-50 text-green-700 px-2 py-0.5 rounded-sm border border-green-200 hover:bg-green-100 items-center gap-1 transition-colors text-xs font-semibold">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                        {customer.DTHOAI}
                      </a>
                    </>
                  )}
                  {customer.LATITUDE && customer.LONGITUDE ? (
                    <a href={`https://www.google.com/maps?q=${customer.LATITUDE},${customer.LONGITUDE}`} target="_blank" rel="noopener noreferrer" className="inline-flex ml-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-sm border border-blue-200 hover:bg-blue-200 items-center gap-1 transition-colors text-xs font-semibold">
                      <MapPin className="h-3 w-3" /> Vị trí
                    </a>
                  ) : null}
                  <button type="button" onClick={openLocationModal} className="inline-flex ml-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-sm border border-gray-300 hover:bg-gray-200 items-center gap-1 transition-colors text-xs font-semibold" title="Cập nhật vị trí hiện tại">
                    <Navigation className="h-3 w-3" /> Cập nhật toạ độ
                  </button>
                </div>
              </div>

              {/* History */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <LayoutDashboard className="h-4 w-4 mr-2 text-gray-500" /> Lịch sử sản lượng
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {(['SLUONG_1', 'SLUONG_2', 'SLUONG_3'] as const).map((key, i) => (
                    <div key={key} className="bg-white p-2 rounded shadow-sm border border-gray-100">
                      <div className="text-xs text-gray-500 mb-1">Tháng -{i + 1}</div>
                      <div className="font-semibold text-gray-900">{customer[key]}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-600">Chỉ số cũ (kỳ trước)</span>
                    <span className="font-bold text-lg text-gray-900">{customer.CHISO_CU || '---'}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-sm font-medium text-gray-600">Trung bình 3 tháng</span>
                    <span className="font-bold text-lg text-blue-600">
                      {Math.round((Number(customer.SLUONG_1) + Number(customer.SLUONG_2) + Number(customer.SLUONG_3)) / 3)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Input section */}
              <div className="mt-6 space-y-4">
                {/* Chỉ số input */}
                <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 shadow-sm relative">
                  <label htmlFor="chiso" className="block text-base font-bold text-gray-900 mb-3 flex items-center justify-center">
                    <Zap className="h-5 w-5 mr-2 text-yellow-600" /> NHẬP CHỈ SỐ ĐIỆN MỚI
                  </label>
                  <input
                    type="number"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    id="chiso"
                    value={chiSoInput}
                    onChange={(e) => setChiSoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !saving) { e.preventDefault(); handleSave(); }
                    }}
                    className={cn(
                      'block w-full rounded-lg shadow-inner text-4xl p-4 font-bold text-center bg-white transition-colors',
                      warningType === 'error'   ? 'border-2 border-red-500 text-red-600 focus:ring-red-600 focus:border-red-600' :
                      warningType === 'warning' ? 'border-2 border-orange-500 text-orange-600 focus:ring-orange-500 focus:border-orange-500' :
                      'border border-gray-300 text-blue-700 focus:ring-blue-600 focus:border-blue-600',
                    )}
                    placeholder="0"
                    autoFocus
                  />
                  {warningMessage && (
                    <div className={cn(
                      'mt-3 p-2.5 rounded-lg text-sm font-medium text-center border animate-in slide-in-from-top-1',
                      warningType === 'error'   ? 'bg-red-50 text-red-700 border-red-200' :
                      warningType === 'warning' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      'bg-green-50 text-green-700 border-green-200',
                    )}>
                      {warningMessage}
                    </div>
                  )}
                </div>

                {/* Mã lỗi đo xa */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mã lỗi đo xa</label>
                  <div className="relative" ref={maLoiDropdownRef}>
                    <div
                      className="border border-gray-300 rounded-lg shadow-sm px-3 py-2.5 bg-white cursor-pointer flex justify-between items-center"
                      onClick={() => { setIsMaLoiDropdownOpen(v => !v); setMaLoiSearch(''); }}
                    >
                      <span className={cn('text-sm truncate', maLoiInput ? 'text-gray-900 font-medium' : 'text-gray-400')}>
                        {maLoiInput ? MA_LOI_OPTIONS.find(o => o.ma === maLoiInput)?.hienThi : '-- Không có lỗi --'}
                      </span>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        {maLoiInput && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setMaLoiInput(''); setMaLoiSearch(''); setIsMaLoiDropdownOpen(false); }} className="text-gray-400 hover:text-gray-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                    {isMaLoiDropdownOpen && (
                      <div className="absolute left-0 right-0 z-20 mt-1 bg-white shadow-lg rounded-lg py-1 ring-1 ring-black ring-opacity-5 overflow-hidden">
                        <div className="px-2 py-2 sticky top-0 bg-white border-b border-gray-100">
                          <input
                            type="text"
                            autoFocus
                            className="w-full border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Tìm mã lỗi..."
                            value={maLoiSearch}
                            onChange={(e) => setMaLoiSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          <div className="cursor-pointer py-2 px-3 text-sm text-gray-500 hover:bg-gray-50" onClick={() => { setMaLoiInput(''); setIsMaLoiDropdownOpen(false); setMaLoiSearch(''); }}>
                            -- Không có lỗi --
                          </div>
                          {MA_LOI_OPTIONS.filter(o =>
                            !maLoiSearch || o.hienThi.toLowerCase().includes(maLoiSearch.toLowerCase()) || o.ma.toLowerCase().includes(maLoiSearch.toLowerCase())
                          ).map(opt => (
                            <div
                              key={opt.ma}
                              className={cn('cursor-pointer py-2 px-3 text-sm hover:bg-blue-50', maLoiInput === opt.ma ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-900')}
                              onClick={() => { setMaLoiInput(opt.ma); setIsMaLoiDropdownOpen(false); setMaLoiSearch(''); }}
                            >
                              {opt.hienThi}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ghi chú */}
                <div>
                  <label htmlFor="ghichu" className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                  <textarea
                    id="ghichu"
                    value={ghiChuInput}
                    onChange={(e) => setGhiChuInput(e.target.value)}
                    rows={2}
                    className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-3"
                    placeholder="Nhập ghi chú nếu có..."
                  />
                </div>
                <p className="text-center text-xs text-gray-500 mt-3">
                  Nhấn <kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-gray-700 font-mono">Enter</kbd> ở ô chỉ số để lưu nhanh
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 sm:px-6 py-4 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('FULL')}
                className="order-1 sm:order-3 w-full sm:w-auto sm:ml-auto px-6 py-3 sm:py-2.5 bg-blue-600 text-white rounded-lg font-bold sm:font-medium text-lg sm:text-base hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center transition-colors shadow-sm"
              >
                {savingType === 'FULL' || (!savingType && saving) ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Send className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />}
                LƯU CHỈ SỐ
              </button>
              <div className="order-2 sm:order-2 grid grid-cols-2 sm:flex gap-3 w-full sm:w-auto">
                <button type="button" disabled={saving} onClick={() => handleSave('NOTE_ONLY')} className="w-full sm:w-auto px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 disabled:opacity-50 flex items-center justify-center transition-colors">
                  {savingType === 'NOTE_ONLY' && <Loader2 className="animate-spin h-5 w-5 mr-2" />}
                  Lưu ghi chú
                </button>
                <button type="button" disabled={saving} onClick={() => setShowDeleteConfirm(true)} className="w-full sm:w-auto px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50 transition-colors flex justify-center items-center">
                  Xóa chỉ số
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zero Confirm */}
      {showZeroConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => !saving && setShowZeroConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Chỉ số mới là 0</h3>
            <p className="text-gray-600 mb-6 font-medium">
              Bạn đang nhập chỉ số mới là <span className="font-bold text-red-600">0</span> cho khách hàng{' '}
              <span className="text-gray-900 font-bold">{customer.TEN_KHANG}</span>. Bạn có chắc chắn muốn lưu chỉ số này?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowZeroConfirm(false)} disabled={saving} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors">Hủy bỏ</button>
              <button onClick={() => { setShowZeroConfirm(false); handleSave('FULL', true); }} disabled={saving} className="flex-1 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors flex justify-center items-center disabled:opacity-50">
                {saving && savingType === 'FULL' ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : null}
                Chắc chắn lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => !saving && setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Xác nhận xóa chỉ số</h3>
            <p className="text-gray-600 mb-6 font-medium">
              Bạn có chắc chắn muốn xóa chỉ số của khách hàng <br />
              <span className="text-gray-900 font-bold">{customer.TEN_KHANG}</span>? <br />
              <span className="text-sm text-gray-500 font-normal">(Chỉ số và thời gian sẽ bị xoá, nhưng ghi chú vẫn được giữ lại)</span>
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={saving} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors">Hủy bỏ</button>
              <button onClick={() => { setShowDeleteConfirm(false); handleSave('DELETE_READING'); }} disabled={saving} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex justify-center items-center">
                Chắc chắn xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => !updatingLocation && setShowLocationModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Navigation className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Cập nhật toạ độ</h3>
            <p className="text-gray-600 mb-4 font-medium">
              Cập nhật vị trí cho khách hàng <br />
              <span className="text-gray-900 font-bold">{customer.TEN_KHANG}</span>
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left border border-gray-200">
              {updatingLocation && !currentLocation && (
                <div className="flex items-center text-blue-600">
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  <span className="font-medium">Đang lấy vị trí hiện tại...</span>
                </div>
              )}
              {locationError && (
                <div className="text-red-600 text-sm font-medium">
                  {locationError}
                  <button onClick={fetchCurrentLocation} className="ml-2 text-blue-600 underline hover:text-blue-800">Thử lại</button>
                </div>
              )}
              {currentLocation && !updatingLocation && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Vị trí hiện tại:</div>
                  <div className="font-mono text-gray-900 font-medium">{currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</div>
                  <a href={`https://www.google.com/maps?q=${currentLocation.lat},${currentLocation.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium items-center gap-1">
                    <MapPin className="h-4 w-4" /> Xem trên bản đồ
                  </a>
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowLocationModal(false)} disabled={updatingLocation} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors">Hủy bỏ</button>
              <button onClick={handleConfirmLocation} disabled={updatingLocation || !currentLocation} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex justify-center items-center disabled:opacity-50">
                {updatingLocation && currentLocation ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : null}
                Chắc chắn cập nhật
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
