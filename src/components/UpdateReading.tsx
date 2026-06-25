import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Customer, User, Station } from '../types';
import { Search, Loader2, CheckCircle, ChevronDown, Download, RefreshCw, Edit3, LayoutDashboard, MapPin, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { parseGhiChu } from '../lib/ghiChu';
import ReadingModal from './ReadingModal';

type ToastType = 'success' | 'error' | 'warning';
interface Toast { id: number; message: string; type: ToastType; }

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={cn(
          "flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-xs pointer-events-auto animate-in slide-in-from-top-2 duration-200",
          t.type === 'success' && "bg-green-600 text-white",
          t.type === 'error'   && "bg-red-600 text-white",
          t.type === 'warning' && "bg-orange-500 text-white",
        )}>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="opacity-70 hover:opacity-100 flex-shrink-0 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

let _toastId = 0;

interface UpdateReadingProps {
  currentUser: User;
  allUsers: User[];
  customers: Customer[];
  stations: Station[];
  loadingCustomers: boolean;
  onRefreshCustomers: () => void;
  onUpdateLocalCustomer?: (id: string | number, updates: Partial<Customer>) => void;
}


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

  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // Modal state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Employee Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Quản lý phân công modal state
  const [showAssignmentManager, setShowAssignmentManager] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState('');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
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

  const exportCSV = () => {
    const rows = assignedCustomers.map(c => {
      const { maLoi, note } = parseGhiChu(c.GHI_CHU || '');
      return [
        c.MA_KHANG, c.TEN_KHANG, c.DIA_CHI, c.SO_CTO,
        c.MA_TRAM, c.MA_GHI_CHU || '', c.MA_SOGCS || '', c.BCS || '',
        c.CHISO_CU ?? '', c.CHI_SO ?? '',
        c.SLUONG_1 ?? '', c.SLUONG_2 ?? '', c.SLUONG_3 ?? '',
        c.USER || '', c.THOIGIAN_GHI || '',
        maLoi, note,
        c.DTHOAI || '',
      ];
    });
    const header = [
      'Mã KH', 'Tên KH', 'Địa chỉ', 'Số CT',
      'Mã trạm', 'Mã GC', 'Sổ GCS', 'BCS',
      'Chỉ số cũ', 'Chỉ số mới',
      'SL tháng -1', 'SL tháng -2', 'SL tháng -3',
      'Người ghi', 'Thời gian ghi',
      'Mã lỗi', 'Ghi chú',
      'Điện thoại',
    ];
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghi-chi-so_${selectedEmployee.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openModal = (customer: Customer) => setSelectedCustomer(customer);

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
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
                  <button
                    onClick={exportCSV}
                    title="Xuất CSV"
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Download className="h-4 w-4 mr-2 text-gray-500" />
                    Xuất CSV
                  </button>
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
                              <td className="px-4 py-4 text-sm text-gray-500 italic">
                                <div className="flex flex-col gap-1">
                                  <span>{c.USER || 'Chưa có'}</span>
                                  {(() => { const { maLoi } = parseGhiChu(c.GHI_CHU || ''); return maLoi ? (
                                    <span className="inline-flex w-fit items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">{maLoi}</span>
                                  ) : null; })()}
                                </div>
                              </td>
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
                          <div className="flex justify-between text-xs text-gray-500 bg-gray-50 p-2 rounded items-center">
                            <span><span className="font-medium text-gray-700">PC:</span> {c.ASSIGN}</span>
                            <div className="flex items-center gap-1.5">
                              {(() => { const { maLoi } = parseGhiChu(c.GHI_CHU || ''); return maLoi ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">{maLoi}</span>
                              ) : null; })()}
                              <span><span className="font-medium text-gray-700">Người ghi:</span> {c.USER || 'Chưa có'}</span>
                            </div>
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
        <ReadingModal
          initialCustomer={selectedCustomer}
          currentList={currentList}
          currentUser={currentUser}
          stations={stations}
          onClose={() => setSelectedCustomer(null)}
          onUpdateLocalCustomer={onUpdateLocalCustomer}
          onRefreshCustomers={onRefreshCustomers}
          showToast={showToast}
        />
      )}

    </div>
  );
}
