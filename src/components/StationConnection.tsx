import React, { useMemo, useState } from 'react';
import { Customer, Station } from '../types';
import { WifiOff, Search, MapPin, AlertTriangle, ExternalLink } from 'lucide-react';

interface StationConnectionProps {
  customers: Customer[];
  stations: Station[];
}

export default function StationConnection({ customers, stations }: StationConnectionProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const stationStats = useMemo(() => {
    // 1. Group unrecorded customers by MA_TRAM
    const stats: Record<string, { unrecorded: number }> = {};
    customers.forEach(c => {
      if (!c.CHI_SO) {
        stats[c.MA_TRAM] = stats[c.MA_TRAM] || { unrecorded: 0 };
        stats[c.MA_TRAM].unrecorded += 1;
      }
    });

    // 2. Create a map of stations for quick lookup
    const stationMap = new Map<string, Station>();
    stations.forEach(s => {
      if (s['TBTID (cũ)']) {
        stationMap.set(s['TBTID (cũ)'], s);
      }
    });

    // 3. Merge, filter and sort
    return Object.entries(stats)
      .map(([maTram, data]) => {
        const stationInfo = stationMap.get(maTram);
        return {
          maTram,
          unrecorded: data.unrecorded,
          'Tên TBA': stationInfo?.['Tên TBA'] || '',
          'Số trụ': stationInfo?.['Số trụ'] || '',
          X: stationInfo?.X,
          Y: stationInfo?.Y,
        };
      })
      .filter(stat => 
        stat.maTram.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stat['Tên TBA'].toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => b.unrecorded - a.unrecorded);
  }, [customers, stations, searchQuery]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <WifiOff className="h-6 w-6 text-red-500" />
            Quản lý kết nối trạm
          </h1>
          <p className="text-gray-500 mt-1">
            Danh sách các trạm mất kết nối, cần ghi chỉ số thủ công
          </p>
        </div>
        
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Tìm kiếm mã/tên trạm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow"
          />
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Trạm
                </th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Số KH mất kết nối
                </th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Số trụ
                </th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tọa độ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stationStats.length > 0 ? (
                stationStats.map((stat, index) => {
                  const hasCoordinates = stat.X && stat.Y;
                  const mapsUrl = hasCoordinates ? `https://www.google.com/maps?q=${stat.X},${stat.Y}` : '#';

                  return (
                    <tr 
                      key={stat.maTram}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-red-50 rounded-lg flex items-center justify-center">
                            <MapPin className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-bold text-gray-900">{stat['Tên TBA'] || 'Chưa có tên'}</div>
                            <div className="text-xs text-gray-500">{stat.maTram} - Hạng {index + 1}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-700">
                          {stat.unrecorded}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">
                        {stat['Số trụ'] || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {hasCoordinates ? (
                          <a 
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <MapPin className="w-4 h-4" />
                            Xem bản đồ
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </a>
                        ) : (
                          <span className="text-gray-400 italic">Chưa có tọa độ</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <WifiOff className="h-12 w-12 text-gray-300 mb-4" />
                      <p className="text-lg font-medium text-gray-900">Không tìm thấy dữ liệu</p>
                      <p className="text-sm text-gray-500">Tất cả các trạm đều đang hoạt động tốt hoặc không khớp với tìm kiếm.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
