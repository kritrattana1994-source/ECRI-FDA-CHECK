import React, { useState, useEffect } from 'react';
import { 
  BellRing, 
  Search, 
  Filter, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  AlertTriangle,
  Info,
  X
} from 'lucide-react';
import { api, formatThaiDate } from '../api_firebase';

const thMonths = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function formatMonthLabel(mStr) {
  if (!mStr || !mStr.includes('-')) return mStr;
  const [y, m] = mStr.split('-');
  const mIdx = parseInt(m, 10) - 1;
  const thYear = parseInt(y, 10) + 543;
  if (mIdx >= 0 && mIdx < 12) {
    return `${thMonths[mIdx]} ${thYear} (${mStr})`;
  }
  return mStr;
}

const getCurrentYearMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const getRecentMonthsList = (count = 12) => {
  const list = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    list.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return list;
};

export default function AlertsTab({ onOpenExportModal }) {
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'ECRI', 'FDA'
  const [selectedMonth, setSelectedMonth] = useState(getCurrentYearMonth());
  const [availableMonths, setAvailableMonths] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAlertDetail, setSelectedAlertDetail] = useState(null);
  const itemsPerPage = 15;

  useEffect(() => {
    // Load available months from DB and merge with recent months
    api.getAvailableDatabaseMonths().then(res => {
      const dbMonths = Array.isArray(res) ? res : [];
      
      const mergedSorted = dbMonths.sort().reverse();
      
      setAvailableMonths(mergedSorted);
      
      const cur = getCurrentYearMonth();
      if (!selectedMonth || selectedMonth === cur) {
        if (mergedSorted.includes(cur)) {
          setSelectedMonth(cur);
        } else if (mergedSorted.length > 0) {
          setSelectedMonth(mergedSorted[0]);
        }
      }
    }).catch((err) => {
      console.error("Error loading available database months:", err);
    });
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      loadAlerts();
    }
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
        (item.reason || '').toLowerCase().includes(kw) ||
        (item.tradeName || '').toLowerCase().includes(kw) ||
        (item.manufacturer || '').toLowerCase().includes(kw) ||
        (item.class || '').toLowerCase().includes(kw)
      );
    }
    return true;
  }).sort((a, b) => {
    const parseSortDate = (dateStr) => {
      if (!dateStr || dateStr === '-') return 0;
      const str = String(dateStr).trim();
      const parsed = new Date(str).getTime();
      if (!isNaN(parsed)) return parsed;
      const m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
      if (m) {
        const p0 = parseInt(m[1], 10);
        const p1 = parseInt(m[2], 10);
        let y = parseInt(m[3], 10);
        if (y > 2400) y -= 543;
        return p0 > 12 ? new Date(y, p1 - 1, p0).getTime() : new Date(y, p0 - 1, p1).getTime();
      }
      return 0;
    };
    const timeA = parseSortDate(a.date);
    const timeB = parseSortDate(b.date);
    return timeB - timeA;
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
              {availableMonths.map((m) => (
                <option key={m} value={m}>📅 {formatMonthLabel(m)}</option>
              ))}
              {!availableMonths.includes(selectedMonth) && selectedMonth && (
                <option value={selectedMonth}>📅 {formatMonthLabel(selectedMonth)}</option>
              )}
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
                  <tr 
                    key={idx} 
                    onClick={() => setSelectedAlertDetail(item)}
                    className="hover:bg-sky-50/60 transition cursor-pointer group"
                  >
                    <td className="p-3">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                        item.source === 'ECRI' ? 'bg-blue-50 text-blue-700 border border-blue-200/50' : 'bg-rose-50 text-rose-700 border border-rose-200/50'
                      }`}>
                        {item.source}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                      {item.id}
                    </td>
                    <td className="p-3 max-w-lg">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.tradeName && (
                            <span className="text-[10px] font-extrabold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200/60">
                              {item.tradeName}
                            </span>
                          )}
                          <p className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition" title={item.headline}>
                            {item.headline}
                          </p>
                        </div>
                        {item.reason && (
                          <div className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50/70 border border-amber-200/60 rounded-md px-2 py-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <p className="line-clamp-2 leading-relaxed font-normal">
                              <span className="font-bold text-amber-800">สาเหตุ: </span>
                              {item.reason}
                            </p>
                          </div>
                        )}
                        {item.webAddress && (
                          <div className="pt-0.5">
                            <a 
                              href={item.webAddress} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>ดูเอกสารทางการ {item.source}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-medium text-slate-600">
                      {item.manufacturer || '-'}
                    </td>
                    <td className="p-3 text-slate-600 font-medium whitespace-nowrap">
                      {formatThaiDate(item.date)}
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

      {/* Alert Detail Modal */}
      {selectedAlertDetail && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedAlertDetail(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-md ${
                    selectedAlertDetail.source === 'ECRI' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                  }`}>
                    {selectedAlertDetail.source}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-700">
                    {selectedAlertDetail.id}
                  </span>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                    ระดับความเสี่ยง: {selectedAlertDetail.class || selectedAlertDetail.priority || '-'}
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  รายละเอียดประกาศเตือนภัยทางการแพทย์ฉบับเต็ม
                </h3>
              </div>
              <button 
                onClick={() => setSelectedAlertDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-3.5 text-xs text-slate-700">
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">ผู้ผลิต / บริษัทที่เรียกคืน (Manufacturer / Firm):</span>
                <p className="font-semibold text-slate-900 mt-0.5">{selectedAlertDetail.manufacturer || '-'}</p>
              </div>

              {selectedAlertDetail.tradeName && (
                <div>
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">ชื่อทางการค้า (Trade Name):</span>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedAlertDetail.tradeName}</p>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">หัวข้อ / รายละเอียดสินค้า (Product Description):</span>
                <p className="font-medium text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100 mt-0.5 whitespace-pre-line leading-relaxed">
                  {selectedAlertDetail.headline || '-'}
                </p>
              </div>

              {selectedAlertDetail.reason && (
                <div>
                  <span className="font-bold text-amber-700 uppercase tracking-wider text-[10px]">สาเหตุการเรียกคืน / ปัญหาที่ตรวจพบ (Reason for Recall):</span>
                  <div className="bg-amber-50/80 border border-amber-200 text-amber-950 p-3 rounded-xl mt-0.5 leading-relaxed font-normal">
                    {selectedAlertDetail.reason}
                  </div>
                </div>
              )}

              {selectedAlertDetail.codeInfo && (
                <div>
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">ข้อมูล Lot / Serial / Model Codes:</span>
                  <p className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-0.5 font-mono text-[11px] whitespace-pre-line">
                    {selectedAlertDetail.codeInfo}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                <span>วันที่ประกาศ: {formatThaiDate(selectedAlertDetail.date)}</span>
                {selectedAlertDetail.webAddress && (
                  <a 
                    href={selectedAlertDetail.webAddress} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>เปิดดูเอกสารทางการต้นทาง</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
