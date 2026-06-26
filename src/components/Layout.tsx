import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Customer, Station } from '../types';
import { fetchCustomers, fetchCustomersCached, fetchStations, triggerSync, getSyncStatus } from '../lib/api';
import { LogOut, LayoutDashboard, Edit3, Settings, Menu, X, ChevronLeft, ChevronRight, Zap, WifiOff, RefreshCw, Cloud, CloudOff, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../lib/utils';

// ── Toast ──────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; message: string; type: ToastType; }
let _toastId = 0;

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map(t => (
        <div key={t.id} className={cn(
          'flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-auto animate-in slide-in-from-top-2 duration-200',
          t.type === 'success' && 'bg-green-600 text-white',
          t.type === 'error'   && 'bg-red-600 text-white',
          t.type === 'warning' && 'bg-orange-500 text-white',
          t.type === 'info'    && 'bg-blue-600 text-white',
        )}>
          {t.type === 'success' && <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          {t.type === 'error'   && <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          {t.type === 'warning' && <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          {t.type === 'info'    && <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          <span className="flex-1 whitespace-pre-wrap">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="opacity-70 hover:opacity-100 flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
import UpdateReading from './UpdateReading';
import Overview from './Overview';
import AdminManagement from './AdminManagement';
import StationConnection from './StationConnection';
import { motion, AnimatePresence } from 'motion/react';
import { clearCache } from '../lib/cache';

interface LayoutProps {
  currentUser: User;
  allUsers: User[];
  onLogout: () => void;
}

export default function Layout({ currentUser, allUsers, onLogout }: LayoutProps) {
  const isAdmin = currentUser.ROLE.toLowerCase().includes('admin');
  const [activeTab, setActiveTab] = useState<'update' | 'overview' | 'admin' | 'station'>('update');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [dataFromCache, setDataFromCache] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 5000) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const loadData = async (useCache = true) => {
    setLoadingCustomers(true);
    try {
      // Stale-While-Revalidate: nếu có cache thì hiện ngay
      if (useCache) {
        const cached = await fetchCustomersCached();
        if (cached.fromCache) {
          setCustomers(cached.data);
          setDataFromCache(true);
          setLoadingCustomers(false);
          
          // Fetch mới trong nền
          fetchCustomers().then(freshData => {
            setCustomers(freshData);
            setDataFromCache(false);
          }).catch(err => {
            console.warn('Background refresh failed:', err);
          });
          
          // Fetch stations riêng
          fetchStations().then(s => setStations(s)).catch(() => {});
          
          return;
        }
      }
      
      // Không có cache hoặc force refresh
      const customersData = await fetchCustomers();
      
      let stationsData: Station[] = [];
      try {
        stationsData = await fetchStations();
      } catch (stationErr) {
        console.warn('Failed to fetch stations:', stationErr);
      }
      
      setStations(stationsData);
      setCustomers(customersData);
      setDataFromCache(false);
    } catch (err) {
      console.error('Failed to load data', err);
      showToast('Lỗi khi tải dữ liệu. Vui lòng kiểm tra lại kết nối.', 'error');
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleUpdateLocalCustomer = (id: string | number, updates: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => {
      if (typeof id === 'number') {
        return c.id === id ? { ...c, ...updates } : c;
      }
      return c.MA_KHANG === id ? { ...c, ...updates } : c;
    }));
  };

  const handleSync = async () => {
    setSyncing(true);
    showToast('Đang kết nối Google Sheet để đồng bộ...', 'info', 0); // persistent until done
    try {
      const result = await triggerSync();
      // Dismiss the "đang kết nối" toast
      setToasts([]);
      if (result.success) {
        await clearCache();
        await loadData(false);
        const now = new Date().toLocaleString('vi-VN');
        setLastSyncTime(now);
        showToast(
          `Đồng bộ thành công!\n${result.customerCount ? result.customerCount + ' khách hàng đã cập nhật.' : 'Dữ liệu đã được làm mới.'}`,
          'success',
          6000,
        );
      } else {
        const errMsg = result.error || 'Lỗi không xác định';
        showToast(`Đồng bộ thất bại: ${errMsg}`, 'error', 8000);
        console.error('Sync failed:', result);
      }
    } catch (err: any) {
      setToasts([]);
      const errMsg = err.message || 'Không thể kết nối';
      showToast(`Lỗi đồng bộ: ${errMsg}`, 'error', 8000);
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await getSyncStatus();
      const customerSync = status.find((s: any) => s.table_name === 'customers');
      if (customerSync?.last_synced_at) {
        setLastSyncTime(new Date(customerSync.last_synced_at).toLocaleString('vi-VN'));
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadData(true);
    loadSyncStatus();
  }, [currentUser]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTab]);

  const tabs = [
    { id: 'update', name: 'Ghi chỉ số', icon: Edit3 },
    { id: 'overview', name: 'Tổng quan', icon: LayoutDashboard },
    { id: 'station', name: 'Quản lý kết nối trạm', icon: WifiOff },
    ...(isAdmin ? [{ id: 'admin', name: 'Quản lý chỉ số', icon: Settings }] : []),
  ];

  // Calculate progress
  const totalAssigned = customers.length;
  const totalRecorded = customers.filter(c => c.CHI_SO).length;
  const progressPercent = totalAssigned > 0 ? (totalRecorded / totalAssigned) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "bg-[#1D2E28] text-white shadow-xl flex flex-col fixed h-full z-40 transition-all duration-300",
          isSidebarOpen ? "w-[280px]" : "w-[80px]",
          isMobileMenuOpen ? "translate-x-0 w-[280px]" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-4 flex flex-col border-b border-[#2a5544]">
          <div className="flex items-center justify-between h-12">
            {(isSidebarOpen || isMobileMenuOpen) && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center space-x-3"
              >
                <div className="bg-white p-1 rounded-full overflow-hidden w-9 h-9 flex items-center justify-center">
                  <img 
                    src="https://lh3.googleusercontent.com/d/1TDvQoiUOrMn_31vECaA06uLAf9ny7Qi4" 
                    alt="Logo" 
                    className="w-7 h-auto"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className="text-xl font-bold whitespace-nowrap">
                  PC Vũng Tàu
                </span>
              </motion.div>
            )}
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-md hover:bg-[#2a5544] transition-colors mx-auto hidden md:block"
            >
              {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
            </button>
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 rounded-md hover:bg-[#2a5544] transition-colors md:hidden"
            >
              <X size={20} />
            </button>
          </div>
          
          {(isSidebarOpen || isMobileMenuOpen) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 text-sm text-emerald-100/80"
            >
              <div className="font-medium text-white">Hệ thống ghi chỉ số</div>
            </motion.div>
          )}
        </div>

        <div className="flex-1 py-6 space-y-2 px-3 overflow-y-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center p-3 rounded-lg transition-all duration-200 group",
                  isActive 
                    ? "bg-[#2a5544] text-white shadow-sm" 
                    : "text-emerald-100 hover:bg-[#2a5544]/50 hover:text-white"
                )}
              >
                <Icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-white" : "text-emerald-100 group-hover:text-white")} />
                {(isSidebarOpen || isMobileMenuOpen) && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="ml-3 font-medium whitespace-nowrap"
                  >
                    {tab.name}
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-[#2a5544] flex flex-col gap-4">
          {(isSidebarOpen || isMobileMenuOpen) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-emerald-100">Tiến độ thực hiện</span>
                  <span className="font-bold">{progressPercent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-[#152e24] rounded-full h-2">
                  <div className="bg-yellow-400 h-2 rounded-full" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>

              {/* Sync status */}
              {isAdmin && (
                <div className="space-y-2">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#2a5544] hover:bg-[#3a6554] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                    {syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ Google Sheet'}
                  </button>
                  {lastSyncTime && (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-200/60">
                      <Cloud className="h-3 w-3" />
                      <span>Sync: {lastSyncTime}</span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          <div className={cn("flex items-center mt-2", (isSidebarOpen || isMobileMenuOpen) ? "justify-between" : "justify-center")}>
            {(isSidebarOpen || isMobileMenuOpen) && (
              <div className="flex items-center space-x-3 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {currentUser.HO_TEN.charAt(0)}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-bold truncate">{currentUser.HO_TEN}</span>
                  <span className="text-xs text-emerald-200 truncate">{isAdmin ? 'Quản trị viên' : 'Nhân viên'}</span>
                </div>
              </div>
            )}
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-emerald-100 hover:text-white hover:bg-red-500/80 transition-colors"
              title="Đăng xuất"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main 
        className={cn(
          "flex-1 transition-all duration-300 min-h-screen flex flex-col w-full",
          isSidebarOpen ? "md:ml-[280px]" : "md:ml-[80px]"
        )}
      >
        <header className="bg-white shadow-sm h-16 flex items-center px-4 sm:px-8 sticky top-0 z-10">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="mr-4 md:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-800">
            {tabs.find(t => t.id === activeTab)?.name}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {dataFromCache && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200 flex items-center gap-1">
                <CloudOff className="h-3 w-3" /> Cache
              </span>
            )}
            <button
              onClick={() => loadData(false)}
              disabled={loadingCustomers}
              className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={cn("h-4 w-4", loadingCustomers && "animate-spin")} />
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-8 flex-1 overflow-x-hidden">
          {activeTab === 'update' && (
            <UpdateReading 
              currentUser={currentUser} 
              allUsers={allUsers} 
              customers={customers} 
              loadingCustomers={loadingCustomers}
              onRefreshCustomers={() => loadData(false)}
              onUpdateLocalCustomer={handleUpdateLocalCustomer}
              stations={stations}
            />
          )}
          {activeTab === 'overview' && (
            <Overview customers={customers} users={allUsers} />
          )}
          {activeTab === 'admin' && isAdmin && (
            <AdminManagement 
              currentUser={currentUser} 
              onRefreshCustomers={() => loadData(false)} 
              onUpdateLocalCustomer={handleUpdateLocalCustomer}
              customers={customers}
              onSync={handleSync}
              syncing={syncing}
              lastSyncTime={lastSyncTime}
            />
          )}
          {activeTab === 'station' && (
            <StationConnection customers={customers} stations={stations} />
          )}
        </div>
      </main>
    </div>
  );
}
