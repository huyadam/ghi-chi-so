import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Customer, User, Station } from '../types';
import { updateReading, updateCoordinates } from '../lib/api';
import { Search, Loader2, CheckCircle, XCircle, ChevronDown, Download, Send, RefreshCw, Edit3, LayoutDashboard, MapPin, Zap, X, ChevronLeft, ChevronRight, Navigation, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface UpdateReadingProps {
  currentUser: User;
  allUsers: User[];
  customers: Customer[];
  stations: Station[];
  loadingCustomers: boolean;
  onRefreshCustomers: () => void;
  onUpdateLocalCustomer?: (id: string | number, updates: Partial<Customer>) => void;
}

const MA_LOI_OPTIONS = [
  { ma: 'MH', hienThi: 'MH-Lỗi màn hình' },
  { ma: 'TH', hienThi: 'TH-Công tơ lỗi mất tín hiệu' },
  { ma: 'HH', hienThi: 'HH-Công tơ bị hư hỏng' },
  { ma: 'CH', hienThi: 'CH-Công tơ cháy' },
  { ma: 'KD', hienThi: 'KD-Công tơ không sử dụng - Đề nghị thu hồi' },
  { ma: 'AT', hienThi: 'AT-Công tơ treo mất an toàn' },
  { ma: 'SG', hienThi: 'SG-Công tơ sai giờ' },
  { ma: 'VN', hienThi: 'VN-Thường xuyên vắng nhà' },
  { ma: 'KC', hienThi: 'KC-Không tìm thấy công tơ' },
  { ma: 'KT', hienThi: 'KT-Công tơ khác trạm' },
  { ma: 'Khác', hienThi: 'Khác' },
];

export default function UpdateReading({ currentUser, allUsers, customers, stations, loadingCustomers, onRefreshCustomers, onUpdateLocalCustomer }: UpdateReadingProps) {
  const hasReading = (val: any) => val !== '' && val !== null && val !== undefined;
  const isAdmin = currentUser.ROLE.toLowerCase().includes('admin');
  const [selectedEmployee, setSelectedEmployee] = useState<string>(currentUser.HO_TEN);
  const [activeTab, setActiveTab] = useState<'phan_cong' | 'tu_dang_ky'>('phan_cong');
  
  // Phân công state
  const [filterType, setFilterType] = useState<'all' | 'unrecorded' | 'auto' | 'manual'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState<string>('all');
  const [selectedSoGCS, setSelectedSoGCS] = useState<string>('all');
  
  // Helper to get station name
  const getStationName = (maTram: string) => {
    if (!maTram) return '';
    const station = stations.find(s => s.TBTID === maTram || s['TBTID (cũ)'] === maTram);
    return station ? station['Tên TBA'] || maTram : maTram;
  };
  
  // Tự đăng ký state
  const [activeSearchQuery, setActiveSearchQuery] = useState('');

  // Modal state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [chiSoInput, setChiSoInput] = useState('');
  const [ghiChuInput, setGhiChuInput] = useState('');
  const [maLoiInput, setMaLoiInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingType, setSavingType] = useState<'FULL' | 'NOTE_ONLY' | 'DELETE_READING' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showZeroConfirm, setShowZeroConfirm] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Custom Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Mã lỗi dropdown state
  const [isMaLoiDropdownOpen, setIsMaLoiDropdownOpen] = useState(false);
  const [maLoiSearch, setMaLoiSearch] = useState('');
  const maLoiDropdownRef = useRef<HTMLDivElement>(null);

  // Quản lý phân công modal state
  const [showAssignmentManager, setShowAssignmentManager] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState('');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (maLoiDropdownRef.current && !maLoiDropdownRef.current.contains(event.target as Node)) {
        setIsMaLoiDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredUsers = useMemo(() => {
    return allUsers.filter(u => 
      u.HO_TEN.toLowerCase().includes(employeeSearch.toLowerCase()) || 
      u.MSNV.toString().includes(employeeSearch)
    );
  }, [allUsers, employeeSearch]);

  // Stats for pills
  const baseCustomers = customers.filter(c => c.ASSIGN === selectedEmployee);
  
  // Get unique stations for current employee (with name lookup)
  const currentStations = useMemo(() => {
    const defaultAvailable = new Set(baseCustomers.map(c => c.MA_TRAM).filter(Boolean));
    return Array.from(defaultAvailable).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [baseCustomers]);

  // Station options with resolved names (re-compute when stations data loads)
  const stationOptions = useMemo(() => {
    return currentStations.map(maTram => {
      const station = stations.find(s => s.TBTID === maTram || s['TBTID (cũ)'] === maTram);
      const name = station ? (station['Tên TBA'] || maTram) : maTram;
      return { value: maTram, label: `${name} (${maTram})` };
    }).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [currentStations, stations]);

  // Get unique SoGCS for current employee
  const currentSoGCS = useMemo(() => {
    const defaultAvailable = new Set(baseCustomers.map(c => c.MA_SOGCS).filter(Boolean));
    return Array.from(defaultAvailable).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }, [baseCustomers]);

  const totalAssigned = baseCustomers.length;
  const totalManual = baseCustomers.filter(c => hasReading(c.CHI_SO) && c.CHI_SO !== 'Ghi tự động').length;
  const totalAuto = baseCustomers.filter(c => c.CHI_SO === 'Ghi tự động').length;
  const totalUnrecorded = baseCustomers.filter(c => !hasReading(c.CHI_SO)).length;

  // Filtered customers for "Phân công"
  const assignedCustomers = useMemo(() => {
    let list = baseCustomers;
    
    // Station filter
    if (selectedStation !== 'all') {
      list = list.filter(c => c.MA_TRAM === selectedStation);
    }

    // Sổ GCS filter
    if (selectedSoGCS !== 'all') {
      list = list.filter(c => c.MA_SOGCS === selectedSoGCS);
    }
    
    // Status filter
    if (filterType === 'manual') {
      list = list.filter(c => hasReading(c.CHI_SO) && c.CHI_SO !== 'Ghi tự động');
    } else if (filterType === 'auto') {
      list = list.filter(c => c.CHI_SO === 'Ghi tự động');
    } else if (filterType === 'unrecorded') {
      list = list.filter(c => !hasReading(c.CHI_SO));
    }
    
    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => 
        c.MA_KHANG.toLowerCase().includes(q) || 
        c.TEN_KHANG.toLowerCase().includes(q) ||
        c.SO_CTO.toLowerCase().includes(q)
      );
    }
    
    // Sort logic
    return list.sort((a, b) => {
      // 1. Compare by MA_SOGCS
      const gcsCmp = String(a.MA_SOGCS || '').localeCompare(String(b.MA_SOGCS || ''), undefined, { numeric: true });
      if (gcsCmp !== 0) return gcsCmp;

      // 2. Compare by MA_TRAM
      const tramCmp = String(a.MA_TRAM || '').localeCompare(String(b.MA_TRAM || ''), undefined, { numeric: true });
      if (tramCmp !== 0) return tramCmp;

      // 3. Compare by MA_GHI_CHU
      return String(a.MA_GHI_CHU || '').localeCompare(String(b.MA_GHI_CHU || ''), undefined, { numeric: true });
    });
  }, [baseCustomers, filterType, searchQuery, selectedStation, selectedSoGCS]);

  // Filtered customers for "Tự đăng ký"
  const activeCustomers = useMemo(() => {
    if (!activeSearchQuery || activeSearchQuery.length < 3) return [];
    const q = activeSearchQuery.toLowerCase();
    return customers.filter(c => 
      c.MA_KHANG.toLowerCase().includes(q) || 
      c.TEN_KHANG.toLowerCase().includes(q) ||
      c.SO_CTO.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [customers, activeSearchQuery]);

  // Employee stats for Assignment Manager
  const employeeStats = useMemo(() => {
    const stats: Record<string, { total: number; recorded: number }> = {};
    customers.forEach(c => {
      if (!c.ASSIGN) return;
      if (!stats[c.ASSIGN]) {
        stats[c.ASSIGN] = { total: 0, recorded: 0 };
      }
      stats[c.ASSIGN].total += 1;
      if (hasReading(c.CHI_SO)) {
        stats[c.ASSIGN].recorded += 1;
      }
    });

    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .filter(stat => 
        stat.name.toLowerCase().includes(assignmentSearch.toLowerCase())
      )
      .sort((a, b) => b.total - a.total);
  }, [customers, assignmentSearch]);

  const currentList = activeTab === 'phan_cong' ? assignedCustomers : activeCustomers;

  const handleSaveReading = async (updateType: 'FULL' | 'NOTE_ONLY' | 'DELETE_READING' = 'FULL', skipZeroCheck = false) => {
    if (!selectedCustomer) return;
    
    if (updateType === 'FULL') {
      if (!chiSoInput.trim()) {
        alert('Vui lòng nhập chỉ số');
        return;
      }
      
      const hsNhan = Number(selectedCustomer.HS_NHAN) || 1;
      const oldReading = Number(selectedCustomer.CHISO_CU);
      const newReading = Number(chiSoInput);
      
      if (!isNaN(oldReading) && !isNaN(newReading)) {
        const consumption = (newReading - oldReading) * hsNhan;
        const thresh = Number(selectedCustomer.SLUONG_3);
        
        let shouldRequireNote = false;
        if (consumption < 0) {
          shouldRequireNote = true;
        } else if (!isNaN(thresh) && thresh > 0 && consumption > 2 * thresh) {
          shouldRequireNote = true;
        }
        
        if (shouldRequireNote && !ghiChuInput.trim()) {
          alert('Cảnh báo: Sản lượng bất thường (âm hoặc tăng >100% so với SL Tháng -3)! Bạn bắt buộc phải nhập ghi chú rõ ràng.');
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
      const success = await updateReading(
        selectedCustomer.MA_KHANG,
        selectedCustomer.BCS,
        chiSoInput,
        currentUser.HO_TEN,
        thoiGian,
        ghiChuInput,
        updateType
      );
      if (success) {
        const currentIndex = currentList.findIndex((c) => c.id === selectedCustomer.id);
        
        if (onUpdateLocalCustomer) {
          if (updateType === 'DELETE_READING') {
            onUpdateLocalCustomer(selectedCustomer.id, { CHI_SO: "", USER: "", THOIGIAN_GHI: "", GHI_CHU: ghiChuInput });
          } else if (updateType === 'NOTE_ONLY') {
            onUpdateLocalCustomer(selectedCustomer.id, { GHI_CHU: ghiChuInput });
          } else {
            onUpdateLocalCustomer(selectedCustomer.id, { CHI_SO: chiSoInput, USER: currentUser.HO_TEN, THOIGIAN_GHI: thoiGian, GHI_CHU: ghiChuInput });
          }
        } else {
          onRefreshCustomers();
        }
        
        if (updateType === 'FULL' || updateType === 'NOTE_ONLY') {
          if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
             const nextCust = currentList[currentIndex + 1];
             setSelectedCustomer(nextCust);
             setChiSoInput(nextCust.CHI_SO && nextCust.CHI_SO !== 'Ghi tự động' ? nextCust.CHI_SO : '');
             setGhiChuInput(nextCust.GHI_CHU || '');
             setMaLoiInput('');
    setMaLoiSearch('');
    setIsMaLoiDropdownOpen(false);
          } else {
             setSelectedCustomer(null);
             setChiSoInput('');
             setGhiChuInput('');
             setMaLoiInput('');
    setMaLoiSearch('');
    setIsMaLoiDropdownOpen(false);
          }
        } else {
          // If DELETE, close modal immediately
          setSelectedCustomer(null);
          setChiSoInput('');
          setGhiChuInput('');
          setMaLoiInput('');
    setMaLoiSearch('');
    setIsMaLoiDropdownOpen(false);
        }
      } else {
        alert('Lưu thất bại');
      }
    } catch (err) {
      alert('Có lỗi xảy ra khi lưu');
    } finally {
      setSaving(false);
      setSavingType(null);
    }
  };

  const openModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setChiSoInput(customer.CHI_SO && customer.CHI_SO !== 'Ghi tự động' ? customer.CHI_SO : '');
    setGhiChuInput(customer.GHI_CHU || '');
    setMaLoiInput('');
    setMaLoiSearch('');
    setIsMaLoiDropdownOpen(false);
  };

  const currentIndex = selectedCustomer ? currentList.findIndex(c => c.id === selectedCustomer.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < currentList.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      const prevCust = currentList[currentIndex - 1];
      setSelectedCustomer(prevCust);
      setChiSoInput(prevCust.CHI_SO && prevCust.CHI_SO !== 'Ghi tự động' ? prevCust.CHI_SO : '');
      setGhiChuInput(prevCust.GHI_CHU || '');
      setMaLoiInput('');
    setMaLoiSearch('');
    setIsMaLoiDropdownOpen(false);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      const nextCust = currentList[currentIndex + 1];
      setSelectedCustomer(nextCust);
      setChiSoInput(nextCust.CHI_SO && nextCust.CHI_SO !== 'Ghi tự động' ? nextCust.CHI_SO : '');
      setGhiChuInput(nextCust.GHI_CHU || '');
      setMaLoiInput('');
    setMaLoiSearch('');
    setIsMaLoiDropdownOpen(false);
    }
  };

  const openLocationModal = () => {
    setCurrentLocation(null);
    setLocationError(null);
    setShowLocationModal(true);
    fetchCurrentLocation();
  };

  const fetchCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt của bạn không hỗ trợ định vị.');
      return;
    }

    setUpdatingLocation(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setUpdatingLocation(false);
      },
      (error) => {
        setLocationError('Không thể lấy được vị trí: ' + error.message);
        setUpdatingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleConfirmLocation = async () => {
    if (!currentLocation || !selectedCustomer) return;
    setUpdatingLocation(true);
    try {
      const success = await updateCoordinates(selectedCustomer.MA_KHANG, currentLocation.lat, currentLocation.lng);
      if (success) {
        alert('Cập nhật vị trí thành công!');
        if (onUpdateLocalCustomer) {
          onUpdateLocalCustomer(selectedCustomer.id, { LATITUDE: currentLocation.lat, LONGITUDE: currentLocation.lng });
        }
        setSelectedCustomer(prev => prev ? { ...prev, LATITUDE: currentLocation.lat, LONGITUDE: currentLocation.lng } : null);
        setShowLocationModal(false);
      } else {
        alert('Cập nhật vị trí thất bại.');
      }
    } catch (error) {
      alert('Có lỗi xảy ra khi cập nhật.');
    } finally {
      setUpdatingLocation(false);
    }
  };

  // Warning for consumption
  let warningMessage = null;
  let warningType = 'info';
  if (selectedCustomer && chiSoInput) {
    const hsNhan = Number(selectedCustomer.HS_NHAN) || 1;
    const oldReading = Number(selectedCustomer.CHISO_CU);
    const newReading = Number(chiSoInput);
    if (!isNaN(oldReading) && !isNaN(newReading)) {
      const consumption = (newReading - oldReading) * hsNhan;
      const compareMonth = Number(selectedCustomer.SLUONG_3);
      
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-200 px-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('phan_cong')}
              className={cn(
                "py-4 px-1 border-b-2 font-medium text-sm",
                activeTab === 'phan_cong'
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              Phân công
            </button>
            <button
              onClick={() => setActiveTab('tu_dang_ky')}
              className={cn(
                "py-4 px-1 border-b-2 font-medium text-sm",
                activeTab === 'tu_dang_ky'
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              Tự đăng ký
            </button>
          </nav>

          <div className="py-3 flex items-center">
            {isAdmin ? (
              <div className="relative" ref={dropdownRef}>
                <div 
                  className="border border-gray-300 rounded-md shadow-sm px-3 py-1.5 bg-white cursor-pointer flex justify-between items-center min-w-[200px]"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span className="text-sm font-medium text-gray-700 truncate">{selectedEmployee}</span>
                  <ChevronDown className="h-4 w-4 text-gray-400 ml-2" />
                </div>
                
                {isDropdownOpen && (
                  <div className="absolute right-0 z-10 mt-1 w-64 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                    <div className="px-2 pb-2 sticky top-0 bg-white">
                      <input
                        type="text"
                        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm px-3 py-2 border"
                        placeholder="Tìm nhân viên..."
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {filteredUsers.map(u => (
                      <div
                        key={u.MSNV}
                        className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50"
                        onClick={() => {
                          setSelectedEmployee(u.HO_TEN);
                          setIsDropdownOpen(false);
                          setEmployeeSearch('');
                        }}
                      >
                        <span className="block truncate">{u.HO_TEN} ({u.MSNV})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
                <span className="text-sm font-medium text-gray-700">Nhân viên: {currentUser.HO_TEN}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'phan_cong' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <h2 className="text-xl font-semibold text-gray-800">Danh sách Phân công</h2>
                  {isAdmin && (
                    <button
                      onClick={() => setShowAssignmentManager(true)}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <LayoutDashboard className="h-4 w-4 mr-2 text-gray-500" />
                      Quản lý phân công
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col md:flex-row justify-end gap-4 items-center">
                <div className="relative w-full md:w-96">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Tìm nhanh tên, mã KH, SĐT trong danh sách này..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm py-2.5 border"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => setFilterType('all')} 
                    className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex-1 sm:flex-none text-center", filterType === 'all' ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                  >
                    Tổng cộng: {totalAssigned}
                  </button>
                  <button 
                    onClick={() => setFilterType('unrecorded')} 
                    className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex-1 sm:flex-none text-center", filterType === 'unrecorded' ? "bg-yellow-100 text-yellow-800 border border-yellow-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                  >
                    Chưa ghi: {totalUnrecorded}
                  </button>
                  <button 
                    onClick={() => setFilterType('auto')} 
                    className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex-1 sm:flex-none text-center", filterType === 'auto' ? "bg-purple-100 text-purple-800 border border-purple-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                  >
                    Ghi tự động: {totalAuto}
                  </button>
                  <button 
                    onClick={() => setFilterType('manual')} 
                    className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex-1 sm:flex-none text-center", filterType === 'manual' ? "bg-green-100 text-green-800 border border-green-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                  >
                    Ghi thủ công: {totalManual}
                  </button>
                </div>
                
                <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                  <select 
                    value={selectedStation} 
                    onChange={(e) => setSelectedStation(e.target.value)}
                    className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm py-2 px-3 border bg-white"
                  >
                    <option value="all">Tất cả các trạm</option>
                    {stationOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select 
                    value={selectedSoGCS} 
                    onChange={(e) => setSelectedSoGCS(e.target.value)}
                    className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm py-2 px-3 border bg-white"
                  >
                    <option value="all">Tất cả sổ GCS</option>
                    {currentSoGCS.map(sogcs => (
                      <option key={sogcs} value={sogcs}>
                        Sổ GCS: {sogcs}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loadingCustomers ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 table-fixed">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-4 w-16 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Đã ghi</th>
                          <th className="px-4 py-4 w-28 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Mã KH</th>
                          <th className="px-4 py-4 w-48 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tên Khách hàng</th>
                          <th className="px-4 py-4 w-48 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Địa chỉ</th>
                          <th className="px-4 py-4 w-32 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Liên hệ</th>
                          <th className="px-4 py-4 w-32 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Phân công</th>
                          <th className="px-4 py-4 w-32 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Người ghi</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {assignedCustomers.map(c => {
                          const isManualRecorded = hasReading(c.CHI_SO) && c.CHI_SO !== 'Ghi tự động';
                          const isAutoRecorded = c.CHI_SO === 'Ghi tự động';
                          const isRecorded = isManualRecorded || isAutoRecorded;
                          return (
                            <tr key={`${c.MA_DDO}_${c.BCS}`} onClick={() => openModal(c)} className="hover:bg-blue-50 cursor-pointer transition-colors">
                              <td className="px-4 py-4">
                                <div className={cn(
                                  "mx-auto h-5 w-5 rounded border flex items-center justify-center", 
                                  isManualRecorded ? "bg-blue-600 border-blue-600" : 
                                  isAutoRecorded ? "bg-purple-600 border-purple-600" : 
                                  "border-gray-300"
                                )}>
                                  {isRecorded && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                                </div>
                              </td>
                              <td className="px-4 py-4 pb-2">
                                <div className="text-sm text-gray-600 font-medium leading-tight">{c.MA_KHANG}</div>
                                {c.MA_GHI_CHU && <div className="text-xs text-gray-400 mt-1">Mã GC: {c.MA_GHI_CHU}</div>}
                                {c.MA_SOGCS && <div className="text-xs text-indigo-500 font-semibold mt-0.5">Sổ GCS: {c.MA_SOGCS}</div>}
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-900 font-bold whitespace-normal">{c.TEN_KHANG}</td>
                              <td className="px-4 py-4 text-sm text-gray-500 whitespace-normal">{c.DIA_CHI}</td>
                              <td className="px-4 py-4 text-sm whitespace-normal space-y-1">
                                {c.DTHOAI && (
                                  <a href={`tel:${c.DTHOAI}`} className="inline-flex bg-green-50 text-green-700 px-2 py-0.5 rounded-sm border border-green-200 hover:bg-green-100 items-center gap-1 transition-colors text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                    {c.DTHOAI}
                                  </a>
                                )}
                                {c.LATITUDE && c.LONGITUDE && (
                                  <a href={`https://www.google.com/maps?q=${c.LATITUDE},${c.LONGITUDE}`} target="_blank" rel="noopener noreferrer" className="inline-flex ml-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-sm border border-blue-200 hover:bg-blue-100 items-center gap-1 transition-colors text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                                    <MapPin className="h-3 w-3" />
                                    Vị trí
                                  </a>
                                )}
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-900 font-medium">{c.ASSIGN}</td>
                              <td className="px-4 py-4 text-sm text-gray-500 italic">{c.USER || 'Chưa có'}</td>
                            </tr>
                          );
                        })}
                        {assignedCustomers.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">Không có dữ liệu</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {assignedCustomers.map(c => {
                      const isManualRecorded = hasReading(c.CHI_SO) && c.CHI_SO !== 'Ghi tự động';
                      const isAutoRecorded = c.CHI_SO === 'Ghi tự động';
                      const isRecorded = isManualRecorded || isAutoRecorded;
                      return (
                        <div key={`${c.MA_DDO}_${c.BCS}`} onClick={() => openModal(c)} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm active:bg-gray-50 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-bold text-gray-900">{c.TEN_KHANG}</div>
                              <div className="text-sm text-gray-500">{c.MA_KHANG}</div>
                            </div>
                            <div className={cn(
                              "h-6 w-6 rounded-full border flex items-center justify-center flex-shrink-0", 
                              isManualRecorded ? "bg-blue-600 border-blue-600" : 
                              isAutoRecorded ? "bg-purple-600 border-purple-600" : 
                              "border-gray-300"
                            )}>
                              {isRecorded && <CheckCircle className="h-4 w-4 text-white" />}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600 mb-2 line-clamp-2">{c.DIA_CHI}</div>
                          <div className="flex flex-wrap gap-2 text-xs mb-3">
                            {c.MA_TRAM && (
                              <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-sm border border-indigo-200">
                                <span className="font-semibold text-[10px] uppercase">Trạm:</span> {getStationName(c.MA_TRAM)}
                              </span>
                            )}
                            <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-sm border border-gray-200">
                              <span className="font-semibold">Mã GC:</span> {c.MA_GHI_CHU || 'N/A'}
                            </span>
                            {c.MA_SOGCS && (
                              <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-sm border border-indigo-200">
                                <span className="font-semibold">Sổ GCS:</span> {c.MA_SOGCS}
                              </span>
                            )}
                            <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-sm border border-gray-200">
                              <span className="font-semibold">BCS:</span> {c.BCS || 'N/A'}
                            </span>
                            {c.DTHOAI && (
                              <a 
                                href={`tel:${c.DTHOAI}`}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-green-50 text-green-700 px-2.5 py-1 rounded-sm border border-green-200 hover:bg-green-100 flex items-center gap-1 transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                <span className="font-semibold">{c.DTHOAI}</span>
                              </a>
                            )}
                            {c.LATITUDE && c.LONGITUDE ? (
                              <a 
                                href={`https://www.google.com/maps?q=${c.LATITUDE},${c.LONGITUDE}`} 
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-sm border border-blue-200 hover:bg-blue-100 flex items-center gap-1 transition-colors"
                              >
                                <MapPin className="h-3 w-3" />
                                <span className="font-semibold">Vị trí</span>
                              </a>
                            ) : null}
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 bg-gray-50 p-2 rounded">
                            <span><span className="font-medium text-gray-700">PC:</span> {c.ASSIGN}</span>
                            <span><span className="font-medium text-gray-700">Người ghi:</span> {c.USER || 'Chưa có'}</span>
                          </div>
                        </div>
                      );
                    })}
                    {assignedCustomers.length === 0 && (
                      <div className="text-center py-8 text-sm text-gray-500 border border-gray-200 rounded-lg">Không có dữ liệu</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'tu_dang_ky' && (
            <div className="space-y-6">
              <div className="relative max-w-2xl mx-auto">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Nhập mã KH, tên, hoặc số công tơ (ít nhất 3 ký tự)..."
                  value={activeSearchQuery}
                  onChange={(e) => setActiveSearchQuery(e.target.value)}
                  className="pl-12 block w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-base py-4 border"
                />
              </div>

              {activeSearchQuery.length >= 3 && (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto mt-6 border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 table-fixed">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-4 w-24 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Mã Trạm</th>
                          <th className="px-4 py-4 w-48 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Khách hàng</th>
                          <th className="px-4 py-4 w-48 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Địa chỉ</th>
                          <th className="px-4 py-4 w-32 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Liên hệ</th>
                          <th className="px-4 py-4 w-32 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Phân công</th>
                          <th className="px-4 py-4 w-32 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Trạng thái</th>
                          <th className="px-4 py-4 w-28 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {activeCustomers.map(c => (
                          <tr key={`${c.MA_DDO}_${c.BCS}`} className="hover:bg-gray-50">
                            <td className="px-4 py-4 text-sm text-gray-900 pb-2">
                              <div className="font-medium text-gray-600 mb-1">{c.MA_TRAM}</div>
                              {c.MA_TRAM && <div className="inline-flex text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">Trạm: {getStationName(c.MA_TRAM)}</div>}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900 whitespace-normal">
                              <div className="font-bold">{c.TEN_KHANG}</div>
                              <div className="text-gray-500 text-xs">{c.MA_KHANG}</div>
                              {c.MA_GHI_CHU && <div className="text-gray-400 text-xs mt-0.5">Mã GC: {c.MA_GHI_CHU}</div>}
                              {c.MA_SOGCS && <div className="text-indigo-500 font-semibold text-xs mt-0.5">Sổ GCS: {c.MA_SOGCS}</div>}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500 whitespace-normal">{c.DIA_CHI}</td>
                            <td className="px-4 py-4 text-sm whitespace-normal space-y-1">
                                {c.DTHOAI && (
                                  <a href={`tel:${c.DTHOAI}`} className="inline-flex bg-green-50 text-green-700 px-2 py-0.5 rounded-sm border border-green-200 hover:bg-green-100 items-center gap-1 transition-colors text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                    {c.DTHOAI}
                                  </a>
                                )}
                                {c.LATITUDE && c.LONGITUDE && (
                                  <a href={`https://www.google.com/maps?q=${c.LATITUDE},${c.LONGITUDE}`} target="_blank" rel="noopener noreferrer" className="inline-flex ml-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-sm border border-blue-200 hover:bg-blue-100 items-center gap-1 transition-colors text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                                    <MapPin className="h-3 w-3" />
                                    Vị trí
                                  </a>
                                )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{c.ASSIGN}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {hasReading(c.CHI_SO) ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Đã ghi ({c.USER})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    Chưa ghi
                                  </span>
                                )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                              {!hasReading(c.CHI_SO) && (
                                <button onClick={() => openModal(c)} className="text-blue-600 hover:text-blue-800 flex items-center justify-end w-full">
                                  <Edit3 className="h-4 w-4 mr-1" /> Ghi chỉ số
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {activeCustomers.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">Không tìm thấy khách hàng nào</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden mt-6 space-y-3">
                    {activeCustomers.map(c => (
                      <div key={`${c.MA_DDO}_${c.BCS}`} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-bold text-gray-900">{c.TEN_KHANG}</div>
                            <div className="text-sm text-gray-500">{c.MA_KHANG}</div>
                          </div>
                          <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">Trạm: {getStationName(c.MA_TRAM)}</div>
                        </div>
                        {c.DTHOAI && (
                          <div className="mb-2">
                            <a 
                              href={`tel:${c.DTHOAI}`} 
                              className="inline-flex bg-green-50 text-green-700 px-2.5 py-1 rounded-sm border border-green-200 hover:bg-green-100 items-center gap-1 transition-colors text-xs"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                              <span className="font-semibold">{c.DTHOAI}</span>
                            </a>
                            {c.LATITUDE && c.LONGITUDE ? (
                              <a 
                                href={`https://www.google.com/maps?q=${c.LATITUDE},${c.LONGITUDE}`} 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex ml-2 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-sm border border-blue-200 hover:bg-blue-100 items-center gap-1 transition-colors text-xs"
                              >
                                <MapPin className="h-3 w-3" />
                                <span className="font-semibold">Vị trí</span>
                              </a>
                            ) : null}
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-3">
                           <span className="text-xs text-gray-500">PC: {c.ASSIGN}</span>
                           {hasReading(c.CHI_SO) ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Đã ghi ({c.USER})
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                Chưa ghi
                              </span>
                            )}
                        </div>
                        {!hasReading(c.CHI_SO) && (
                          <button onClick={() => openModal(c)} className="w-full py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 flex items-center justify-center text-sm font-medium transition-colors">
                            <Edit3 className="h-4 w-4 mr-2" /> Ghi chỉ số
                          </button>
                        )}
                      </div>
                    ))}
                    {activeCustomers.length === 0 && (
                      <div className="text-center py-8 text-sm text-gray-500 border border-gray-200 rounded-lg">Không tìm thấy khách hàng nào</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assignment Manager Modal */}
      {showAssignmentManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setShowAssignmentManager(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900 flex items-center">
                <LayoutDashboard className="h-5 w-5 mr-2 text-blue-600" />
                Quản lý phân công
              </h3>
              <button onClick={() => setShowAssignmentManager(false)} className="text-gray-400 hover:text-gray-500">
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-4 sm:p-6 flex-1 overflow-hidden flex flex-col">
              <div className="mb-4 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Tìm kiếm nhân viên..."
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  className="pl-10 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm py-2.5 border"
                />
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                {employeeStats.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Không tìm thấy nhân viên nào</div>
                ) : (
                  employeeStats.map(stat => {
                    const progress = stat.total > 0 ? (stat.recorded / stat.total) * 100 : 0;
                    return (
                      <div 
                        key={stat.name}
                        onClick={() => {
                          setSelectedEmployee(stat.name);
                          setShowAssignmentManager(false);
                          setAssignmentSearch('');
                        }}
                        className="bg-gray-50 border border-gray-200 rounded-lg p-4 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-gray-900">{stat.name}</span>
                          <span className="text-sm font-medium text-gray-600">
                            {stat.recorded} / {stat.total} KH
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={cn("h-2 rounded-full", progress === 100 ? "bg-green-500" : "bg-blue-500")} 
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ghi Chỉ Số */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setSelectedCustomer(null)}></div>
          <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 border-b pb-3 mb-4 flex justify-between items-center sm:hidden sticky top-0 bg-white z-10 -mx-4 -mt-4 px-4 pt-4 shadow-sm">
                <span>Chi tiết & Ghi chỉ số</span>
                <div className="flex gap-1">
                   <button onClick={handlePrev} disabled={!hasPrev} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft className="h-5 w-5" /></button>
                   <button onClick={handleNext} disabled={!hasNext} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight className="h-5 w-5" /></button>
                   <div className="w-px h-6 bg-gray-300 mx-1"></div>
                   <button onClick={() => setSelectedCustomer(null)} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                     <X className="h-5 w-5" />
                   </button>
                </div>
              </h3>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 border-b pb-3 mb-4 hidden sm:flex justify-between items-center">
                <span>Chi tiết & Ghi chỉ số</span>
                <div className="flex gap-2">
                   <button onClick={handlePrev} disabled={!hasPrev} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent" title="Khách hàng trước"><ChevronLeft className="h-5 w-5" /></button>
                   <button onClick={handleNext} disabled={!hasNext} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent" title="Khách hàng tiếp theo"><ChevronRight className="h-5 w-5" /></button>
                </div>
              </h3>
              <div className="space-y-4 text-sm text-gray-600">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-1">
                        <p className="font-bold text-lg text-blue-900 mb-1">{selectedCustomer.TEN_KHANG}</p>
                        <p className="text-blue-800"><strong>Mã KH:</strong> {selectedCustomer.MA_KHANG}</p>
                        <p className="text-blue-800"><strong>Địa chỉ:</strong> {selectedCustomer.DIA_CHI}</p>
                        <p className="text-blue-800">
                          <strong>Mã trạm:</strong> {selectedCustomer.MA_TRAM}
                          {selectedCustomer.MA_TRAM && <span className="ml-1 inline-flex text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">Trạm: {getStationName(selectedCustomer.MA_TRAM)}</span>}
                           | <strong>Số CT:</strong> {selectedCustomer.SO_CTO}
                        </p>
                        <p className="text-blue-800">
                          <strong>Mã GC:</strong> {selectedCustomer.MA_GHI_CHU || 'N/A'} | 
                          {selectedCustomer.MA_SOGCS && <span> <strong>Sổ GCS:</strong> {selectedCustomer.MA_SOGCS} | </span>}
                          <strong>BCS:</strong> {selectedCustomer.BCS || 'N/A'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {selectedCustomer.DTHOAI && (
                            <>
                              <strong className="text-blue-800">SĐT:</strong>
                              <a 
                                href={`tel:${selectedCustomer.DTHOAI}`} 
                                className="inline-flex bg-green-50 text-green-700 px-2 py-0.5 rounded-sm border border-green-200 hover:bg-green-100 items-center gap-1 transition-colors text-xs font-semibold"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                {selectedCustomer.DTHOAI}
                              </a>
                            </>
                          )}
                          
                          {selectedCustomer.LATITUDE && selectedCustomer.LONGITUDE ? (
                            <a 
                              href={`https://www.google.com/maps?q=${selectedCustomer.LATITUDE},${selectedCustomer.LONGITUDE}`} 
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex ml-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-sm border border-blue-200 hover:bg-blue-200 items-center gap-1 transition-colors text-xs font-semibold"
                            >
                              <MapPin className="h-3 w-3" />
                              Vị trí
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={openLocationModal}
                            className="inline-flex ml-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-sm border border-gray-300 hover:bg-gray-200 items-center gap-1 transition-colors text-xs font-semibold"
                            title="Cập nhật vị trí hiện tại"
                          >
                            <Navigation className="h-3 w-3" />
                            Cập nhật toạ độ
                          </button>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                          <LayoutDashboard className="h-4 w-4 mr-2 text-gray-500" /> Lịch sử sản lượng
                        </h4>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-white p-2 rounded shadow-sm border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Tháng -1</div>
                            <div className="font-semibold text-gray-900">{selectedCustomer.SLUONG_1}</div>
                          </div>
                          <div className="bg-white p-2 rounded shadow-sm border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Tháng -2</div>
                            <div className="font-semibold text-gray-900">{selectedCustomer.SLUONG_2}</div>
                          </div>
                          <div className="bg-white p-2 rounded shadow-sm border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Tháng -3</div>
                            <div className="font-semibold text-gray-900">{selectedCustomer.SLUONG_3}</div>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-600">Chỉ số cũ (kỳ trước)</span>
                            <span className="font-bold text-lg text-gray-900">{selectedCustomer.CHISO_CU || '---'}</span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-sm font-medium text-gray-600">Trung bình 3 tháng</span>
                            <span className="font-bold text-lg text-blue-600">
                              {Math.round((Number(selectedCustomer.SLUONG_1) + Number(selectedCustomer.SLUONG_2) + Number(selectedCustomer.SLUONG_3)) / 3)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 space-y-4">
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
                              if (e.key === 'Enter' && !saving) {
                                e.preventDefault();
                                handleSaveReading();
                              }
                            }}
                            className={cn(
                              "block w-full rounded-lg shadow-inner text-4xl p-4 font-bold text-center bg-white transition-colors",
                              warningType === 'error' ? "border-2 border-red-500 text-red-600 focus:ring-red-600 focus:border-red-600" :
                              warningType === 'warning' ? "border-2 border-orange-500 text-orange-600 focus:ring-orange-500 focus:border-orange-500" :
                              "border border-gray-300 text-blue-700 focus:ring-blue-600 focus:border-blue-600"
                            )}
                            placeholder="0"
                            autoFocus
                          />
                          {warningMessage && (
                            <div className={cn(
                              "mt-3 p-2.5 rounded-lg text-sm font-medium text-center border animate-in slide-in-from-top-1",
                              warningType === 'error' ? "bg-red-50 text-red-700 border-red-200" :
                              warningType === 'warning' ? "bg-orange-50 text-orange-700 border-orange-200" :
                              "bg-green-50 text-green-700 border-green-200"
                            )}>
                              {warningMessage}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Mã lỗi đo xa
                          </label>
                          <div className="relative" ref={maLoiDropdownRef}>
                            <div
                              className="border border-gray-300 rounded-lg shadow-sm px-3 py-2.5 bg-white cursor-pointer flex justify-between items-center"
                              onClick={() => { setIsMaLoiDropdownOpen(v => !v); setMaLoiSearch(''); }}
                            >
                              <span className={cn("text-sm truncate", maLoiInput ? "text-gray-900 font-medium" : "text-gray-400")}>
                                {maLoiInput ? MA_LOI_OPTIONS.find(o => o.ma === maLoiInput)?.hienThi : '-- Không có lỗi --'}
                              </span>
                              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                {maLoiInput && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMaLoiInput('');
                                      setMaLoiSearch('');
                                      setIsMaLoiDropdownOpen(false);
                                      setGhiChuInput('');
                                    }}
                                    className="text-gray-400 hover:text-gray-600"
                                  >
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
                                  <div
                                    className="cursor-pointer py-2 px-3 text-sm text-gray-500 hover:bg-gray-50"
                                    onClick={() => {
                                      setMaLoiInput('');
                                      setGhiChuInput('');
                                      setIsMaLoiDropdownOpen(false);
                                      setMaLoiSearch('');
                                    }}
                                  >
                                    -- Không có lỗi --
                                  </div>
                                  {MA_LOI_OPTIONS.filter(o =>
                                    !maLoiSearch || o.hienThi.toLowerCase().includes(maLoiSearch.toLowerCase()) || o.ma.toLowerCase().includes(maLoiSearch.toLowerCase())
                                  ).map(opt => (
                                    <div
                                      key={opt.ma}
                                      className={cn("cursor-pointer py-2 px-3 text-sm hover:bg-blue-50", maLoiInput === opt.ma ? "bg-blue-50 font-medium text-blue-700" : "text-gray-900")}
                                      onClick={() => {
                                        setMaLoiInput(opt.ma);
                                        setGhiChuInput(opt.hienThi);
                                        setIsMaLoiDropdownOpen(false);
                                        setMaLoiSearch('');
                                      }}
                                    >
                                      {opt.hienThi}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <label htmlFor="ghichu" className="block text-sm font-medium text-gray-700 mb-1">
                            Ghi chú
                          </label>
                          <textarea
                            id="ghichu"
                            value={ghiChuInput}
                            onChange={(e) => setGhiChuInput(e.target.value)}
                            rows={2}
                            className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-3"
                            placeholder="Nhập ghi chú nếu có..."
                          />
                        </div>
                        <p className="text-center text-xs text-gray-500 mt-3">Nhấn <kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-gray-700 font-mono">Enter</kbd> ở ô chỉ số để lưu nhanh</p>
                      </div>
                    </div>
              </div>
            <div className="bg-gray-50 px-4 sm:px-6 py-4 border-t border-gray-200">
              {/* Mobile Layout (stacked) and Desktop Layout (flex row) */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Primary Action - Full width on mobile, auto on desktop */}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveReading('FULL')}
                  className="order-1 sm:order-3 w-full sm:w-auto sm:ml-auto px-6 py-3 sm:py-2.5 bg-blue-600 text-white rounded-lg font-bold sm:font-medium text-lg sm:text-base hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center transition-colors shadow-sm"
                >
                  {savingType === 'FULL' || (!savingType && saving) ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Send className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />}
                  LƯU CHỈ SỐ
                </button>

                {/* Secondary Actions Row for Mobile */}
                <div className="order-2 sm:order-2 grid grid-cols-2 sm:flex gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveReading('NOTE_ONLY')}
                    className="w-full sm:w-auto px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 disabled:opacity-50 flex items-center justify-center transition-colors"
                  >
                    {savingType === 'NOTE_ONLY' && <Loader2 className="animate-spin h-5 w-5 mr-2" />}
                    Lưu ghi chú
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50 transition-colors flex justify-center items-center"
                  >
                    Xóa chỉ số
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zero Reading Confirm Modal */}
      {showZeroConfirm && selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => !saving && setShowZeroConfirm(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Chỉ số mới là 0</h3>
            <p className="text-gray-600 mb-6 font-medium">
              Bạn đang nhập chỉ số mới là <span className="font-bold text-red-600">0</span> cho khách hàng <span className="text-gray-900 font-bold">{selectedCustomer.TEN_KHANG}</span>. Bạn có chắc chắn muốn lưu chỉ số này?
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowZeroConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                disabled={saving}
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  setShowZeroConfirm(false);
                  handleSaveReading('FULL', true);
                }}
                className="flex-1 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors flex justify-center items-center disabled:opacity-50"
                disabled={saving}
              >
                {saving && savingType === 'FULL' ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : null}
                Chắc chắn lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => !saving && setShowDeleteConfirm(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Xác nhận xóa chỉ số</h3>
            <p className="text-gray-600 mb-6 font-medium">
              Bạn có chắc chắn muốn xóa chỉ số của khách hàng <br/>
              <span className="text-gray-900 font-bold">{selectedCustomer.TEN_KHANG}</span>? <br/>
              <span className="text-sm text-gray-500 font-normal">(Chỉ số và thời gian sẽ bị xoá, nhưng ghi chú vẫn được giữ lại)</span>
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                disabled={saving}
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  handleSaveReading('DELETE_READING');
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex justify-center items-center"
                disabled={saving}
              >
                Chắc chắn xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Update Modal */}
      {showLocationModal && selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => !updatingLocation && setShowLocationModal(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Navigation className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Cập nhật toạ độ</h3>
            <p className="text-gray-600 mb-4 font-medium">
              Cập nhật vị trí cho khách hàng <br/>
              <span className="text-gray-900 font-bold">{selectedCustomer.TEN_KHANG}</span>
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
                  <button 
                    onClick={fetchCurrentLocation}
                    className="ml-2 text-blue-600 underline hover:text-blue-800"
                  >
                    Thử lại
                  </button>
                </div>
              )}
              {currentLocation && !updatingLocation && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Vị trí hiện tại:</div>
                  <div className="font-mono text-gray-900 font-medium">
                    {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
                  </div>
                  <a 
                    href={`https://www.google.com/maps?q=${currentLocation.lat},${currentLocation.lng}`} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium items-center gap-1"
                  >
                    <MapPin className="h-4 w-4" /> Xem trên bản đồ
                  </a>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowLocationModal(false)}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                disabled={updatingLocation}
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmLocation}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex justify-center items-center disabled:opacity-50"
                disabled={updatingLocation || !currentLocation}
              >
                {updatingLocation && currentLocation ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : null}
                Chắc chắn cập nhật
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
