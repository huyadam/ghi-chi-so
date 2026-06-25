import React, { useMemo } from 'react';
import { Customer, User } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface OverviewProps {
  customers: Customer[];
  users: User[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function Overview({ customers, users }: OverviewProps) {
  const stats = useMemo(() => {
    const total = customers.length;
    const totalRecorded = customers.filter(c => c.CHI_SO).length;
    const unrecorded = total - totalRecorded;
    const autoRecorded = customers.filter(c => c.CHI_SO === 'Ghi tự động').length;
    const manualRecorded = totalRecorded - autoRecorded;

    // Pre-build user map: HO_TEN → DON_VI (O(n) thay vì O(n×m))
    const userDonViMap = new Map(users.map(u => [u.HO_TEN, u.DON_VI]));

    // By Don Vi
    const byDonViMap = new Map<string, { total: number, auto: number, manual: number }>();

    // By Employee
    const byEmployeeMap = new Map<string, { total: number, auto: number, manual: number }>();

    customers.forEach(c => {
      // Employee stats
      const empName = c.ASSIGN;
      if (!byEmployeeMap.has(empName)) {
        byEmployeeMap.set(empName, { total: 0, auto: 0, manual: 0 });
      }
      const empStat = byEmployeeMap.get(empName)!;
      empStat.total++;
      if (c.CHI_SO) {
        if (c.CHI_SO === 'Ghi tự động') {
            empStat.auto++;
        } else {
            empStat.manual++;
        }
      }

      // Don Vi stats (dùng map đã build sẵn)
      const donVi = userDonViMap.get(empName) ?? 'Khác';

      if (!byDonViMap.has(donVi)) {
        byDonViMap.set(donVi, { total: 0, auto: 0, manual: 0 });
      }
      const dvStat = byDonViMap.get(donVi)!;
      dvStat.total++;
      if (c.CHI_SO) {
        if (c.CHI_SO === 'Ghi tự động') {
            dvStat.auto++;
        } else {
            dvStat.manual++;
        }
      }
    });

    const byDonVi = Array.from(byDonViMap.entries()).map(([name, data]) => {
      const donViRecorded = data.auto + data.manual;
      return {
        name,
        'Ghi thủ công': data.manual,
        'Ghi tự động': data.auto,
        'Chưa ghi': data.total - donViRecorded,
        total: data.total,
        percent: data.total > 0 ? Math.round((donViRecorded / data.total) * 100) : 0
      };
    }).sort((a, b) => b.total - a.total);

    const allEmployees = Array.from(byEmployeeMap.entries()).map(([name, data]) => {
      const empRecorded = data.auto + data.manual;
      return {
        name,
        'Ghi thủ công': data.manual,
        'Ghi tự động': data.auto,
        'Chưa ghi': data.total - empRecorded,
        total: data.total,
        recorded: empRecorded,
        percent: data.total > 0 ? Math.round((empRecorded / data.total) * 100) : 0
      };
    }).sort((a, b) => b.recorded - a.recorded);

    const top10Employees = allEmployees.slice(0, 10);
    const otherEmployees = allEmployees.slice(10);

    return {
      total, recorded: totalRecorded, unrecorded, autoRecorded, manualRecorded, byDonVi, byEmployee: top10Employees, otherEmployees
    };
  }, [customers, users]);

  const pieData = [
    { name: 'Chưa ghi', value: stats.unrecorded },
    { name: 'Ghi thủ công', value: stats.manualRecorded },
    { name: 'Ghi tự động', value: stats.autoRecorded },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Tổng số công tơ</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Đã ghi</h3>
          <p className="mt-2 text-3xl font-bold text-green-600">{stats.recorded}</p>
          <p className="text-sm text-gray-500 mt-1">{stats.total > 0 ? Math.round((stats.recorded / stats.total) * 100) : 0}% hoàn thành</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Ghi thủ công</h3>
          <p className="mt-2 text-3xl font-bold text-blue-600">{stats.manualRecorded}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Ghi tự động</h3>
          <p className="mt-2 text-3xl font-bold text-purple-600">{stats.autoRecorded}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Tỷ lệ thực hiện toàn công ty</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart by Don Vi */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Tiến độ theo Đơn vị</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.byDonVi}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Ghi thủ công" stackId="a" fill="#3B82F6" />
                <Bar dataKey="Ghi tự động" stackId="a" fill="#8B5CF6" />
                <Bar dataKey="Chưa ghi" stackId="a" fill="#E5E7EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart by Employee */}
        <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Top 10 Nhân viên thực hiện nhiều nhất</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.byEmployee}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} />
                <YAxis />
                <Tooltip />
                <Legend verticalAlign="top" />
                <Bar dataKey="Ghi thủ công" stackId="a" fill="#3B82F6" />
                <Bar dataKey="Ghi tự động" stackId="a" fill="#8B5CF6" />
                <Bar dataKey="Chưa ghi" stackId="a" fill="#E5E7EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Other Employees Table */}
        {stats.otherEmployees.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Nhân viên từ Top 11 trở đi</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-t border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Hạng</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nhân viên</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Ghi thủ công</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Ghi tự động</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Chưa ghi</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Tổng số</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Tỷ lệ</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stats.otherEmployees.map((emp, idx) => (
                    <tr key={emp.name} className="hover:bg-gray-50">
                       <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{idx + 11}</td>
                       <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{emp.name}</td>
                       <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-blue-600 font-medium">{emp['Ghi thủ công']}</td>
                       <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-purple-600 font-medium">{emp['Ghi tự động']}</td>
                       <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-500">{emp['Chưa ghi']}</td>
                       <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 font-bold">{emp.total}</td>
                       <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-500">
                         <span className={emp.percent === 100 ? "text-green-600 font-medium" : ""}>{emp.percent}%</span>
                       </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
