import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  Search, 
  Filter, 
  Building2, 
  Clock, 
  CheckCircle2, 
  PlusCircle,
  FileSpreadsheet,
  AlertTriangle
} from 'lucide-react';
import { api } from '../api';

export default function TrackingTab({ hospitals, onOpenActionModal }) {
  const [selectedHospital, setSelectedHospital] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'in_progress', 'completed'
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => {
    loadCases();
  }, [selectedHospital]);

  const loadCases = async () => {
    setLoading(true);
    try {
      const data = await api.getTrackingCases(selectedHospital);
      setCases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading tracking cases:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCases = cases.filter(item => {
    // Status filter
    if (statusFilter === 'in_progress' && item.isFinal) return false;
    if (statusFilter === 'completed' && !item.isFinal) return false;

    // Search filter
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      return (
        (item.hospital || '').toLowerCase().includes(kw) ||
        (item.deviceCode || '').toLowerCase().includes(kw) ||
        (item.brand || '').toLowerCase().includes(kw) ||
        (item.model || '').toLowerCase().includes(kw) ||
        (item.alertId || '').toLowerCase().includes(kw) ||
        (item.latestAction || '').toLowerCase().includes(kw)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 pt-2">
      {/* Tracking Filter Header */}
      <div className="glass-panel rounded-2xl p-5 bg-white/80 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              ติดตามสถานะการแก้ไขและความปลอดภัยของอุปกรณ์ (Action Tracking)
            </h3>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-lg font-bold">
              {filteredCases.length} รายการ
            </span>
          </div>

          <button
            onClick={loadCases}
            disabled={loading}
            className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
          >
            รีเฟรชข้อมูลเคส
          </button>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          {/* Hospital Selector */}
          <div>
            <select
              value={selectedHospital}
              onChange={(e) => setSelectedHospital(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="all">🏥 ทุกโรงพยาบาลสาขา</option>
              {hospitals.map((h) => (
                <option key={h.name} value={h.name}>{h.name}</option>
              ))}
            </select>
          </div>

          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setStatusFilter('in_progress')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                statusFilter === 'in_progress' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              อยู่ระหว่างดำเนินการ
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                statusFilter === 'completed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              เสร็จสิ้นแล้ว
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหาเคส, รหัสเครื่อง, หรือข้อความบันทึก..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Tracking Cases Table */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-3">โรงพยาบาลสาขา</th>
                <th className="p-3">รหัสเครื่อง / ครุภัณฑ์</th>
                <th className="p-3">ยี่ห้อ / รุ่น</th>
                <th className="p-3">รหัสเตือนภัย</th>
                <th className="p-3">บันทึกการดำเนินการล่าสุด</th>
                <th className="p-3 text-center">สถานะ</th>
                <th className="p-3 text-center">เพิ่มบันทึก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    กำลังโหลดข้อมูลรายการติดตามเคส...
                  </td>
                </tr>
              ) : filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    ไม่พบรายการติดตามที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                filteredCases.map((item, idx) => (
                  <tr key={idx} className="hover:bg-sky-50/40 transition">
                    <td className="p-3 font-bold text-slate-800">
                      {item.hospital}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      {item.deviceCode}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-800">{item.brand} {item.model}</div>
                      <div className="text-[10px] text-slate-500">{item.deviceType || '-'}</div>
                    </td>
                    <td className="p-3 font-mono text-[11px] font-bold text-blue-600">
                      {item.alertId}
                    </td>
                    <td className="p-3 max-w-xs">
                      <p className="text-xs font-semibold text-slate-800 line-clamp-2">
                        {item.latestAction || 'ยังไม่มีการบันทึกการปฏิบัติงาน'}
                      </p>
                      {item.actionDate && (
                        <span className="text-[10px] text-slate-400">เมื่อ: {item.actionDate}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                        item.isFinal 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {item.isFinal ? 'เสร็จสิ้น / ปิดเคส' : 'อยู่ระหว่างดำเนินการ'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onOpenActionModal(item, item.hospital, loadCases)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 mx-auto"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>บันทึกเพิ่ม</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
