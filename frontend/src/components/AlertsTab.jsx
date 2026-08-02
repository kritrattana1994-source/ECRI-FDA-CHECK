import React, { useState, useEffect } from 'react';
import { 
  BellRing, 
  Search, 
  Filter, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  ExternalLink,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../api';

export default function AlertsTab({ onOpenExportModal }) {
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'ECRI', 'FDA'
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    // Load available months
    api.getAvailableDatabaseMonths().then(res => {
      if (Array.isArray(res)) setAvailableMonths(res);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [selectedMonth]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const data = await api.getAlertsFromDatabase(selectedMonth);
      setAlerts(Array.isArray(data) ? data : []);
      setCurrentPage(1);
    } catch (err) {
      console.error("Error loading alerts:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredAlerts = alerts.filter(item => {
    // Filter source
    if (sourceFilter !== 'all' && item.source !== sourceFilter) {
      return false;
    }
    // Filter search keyword
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      return (
        (item.id || '').toLowerCase().includes(kw) ||
        (item.headline || '').toLowerCase().includes(kw) ||
        (item.manufacturer || '').toLowerCase().includes(kw) ||
        (item.class || '').toLowerCase().includes(kw)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage) || 1;
  const paginatedAlerts = filteredAlerts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 pt-2">
      {/* Search and Filters Bar */}
      <div className="glass-panel rounded-2xl p-5 bg-white/80 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              คลังข่าวประกาศเตือนภัยเครื่องมือแพทย์สะสม (Alerts Database)
            </h3>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-lg font-bold">
              {filteredAlerts.length.toLocaleString()} รายการ
            </span>
          </div>

          <button
            onClick={onOpenExportModal}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>ส่งออก Excel รายงาน</span>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          {/* Source Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setSourceFilter('all')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                sourceFilter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setSourceFilter('ECRI')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                sourceFilter === 'ECRI' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              ECRI Only
            </button>
            <button
              onClick={() => setSourceFilter('FDA')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                sourceFilter === 'FDA' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              FDA Only
            </button>
          </div>

          {/* Month Selector */}
          <div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="all">📅 ทุกเดือนสะสมในระบบ</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>เดือน {m}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหารหัส, ผู้ผลิต, หรือหัวข้อ..."
              value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-3">แหล่งข่าว</th>
                <th className="p-3">รหัสประกาศ</th>
                <th className="p-3">หัวข้อแจ้งเตือน / รายละเอียดสินค้า</th>
                <th className="p-3">ผู้ผลิต / ยี่ห้อ</th>
                <th className="p-3">วันที่ประกาศ</th>
                <th className="p-3 text-center">ระดับ / คลาส</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                    กำลังดึงข้อมูลคลังข่าวเตือนภัย...
                  </td>
                </tr>
              ) : paginatedAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                    ไม่พบข้อมูลข่าวประกาศเตือนภัยที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                paginatedAlerts.map((item, idx) => (
                  <tr key={idx} className="hover:bg-sky-50/40 transition">
                    <td className="p-3">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                        item.source === 'ECRI' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {item.source}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      {item.id}
                    </td>
                    <td className="p-3 max-w-md">
                      <p className="text-xs font-semibold text-slate-800 line-clamp-2" title={item.headline}>
                        {item.headline}
                      </p>
                    </td>
                    <td className="p-3 font-medium text-slate-600">
                      {item.manufacturer || '-'}
                    </td>
                    <td className="p-3 text-slate-500 font-medium">
                      {item.date || '-'}
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                        {item.class || item.priority || '-'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex justify-between items-center pt-2">
          <span className="text-xs font-bold text-slate-500">
            แสดงหน้า {currentPage} จากทั้งหมด {totalPages} หน้า
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>ก่อนหน้า</span>
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40 flex items-center gap-1"
            >
              <span>ถัดไป</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
