import React, { useState } from 'react';
import { User } from '../types';
import { fetchUsers } from '../lib/api';
import { Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User, allUsers: User[]) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [msnv, setMsnv] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msnv.trim()) {
      setError('Vui lòng nhập mã nhân viên');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const users = await fetchUsers();
      const user = users.find(u => u.MSNV.toString() === msnv.trim());
      
      if (user) {
        onLogin(user, users);
      } else {
        setError('Mã nhân viên không tồn tại');
      }
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi kết nối đến máy chủ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center p-6">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img 
              src="https://lh3.googleusercontent.com/d/1TDvQoiUOrMn_31vECaA06uLAf9ny7Qi4" 
              alt="PC Vũng Tàu Logo" 
              className="w-24 h-auto drop-shadow-md"
              referrerPolicy="no-referrer"
            />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            PC Vũng Tàu
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Hệ thống ghi chỉ số điện
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-[2rem] border border-gray-100">
          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label htmlFor="msnv" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 ml-1">
                Mã nhân viên (MSNV)
              </label>
              <div className="mt-1">
                <input
                  id="msnv"
                  name="msnv"
                  type="text"
                  required
                  value={msnv}
                  onChange={(e) => setMsnv(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-2xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-center text-lg font-semibold"
                  placeholder="Nhập mã nhân viên"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100 text-center font-medium animate-pulse">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-2xl shadow-md text-base font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {loading ? <Loader2 className="animate-spin h-6 w-6" /> : 'Đăng nhập'}
              </button>
            </div>
          </form>
        </div>
        
        <p className="mt-8 text-center text-xs text-gray-400">
          &copy; 2026 Công ty Điện lực Vũng Tàu
        </p>
      </div>
    </div>
  );
}
