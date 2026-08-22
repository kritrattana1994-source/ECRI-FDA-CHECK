import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../api_firebase';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  LineController
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend
);

export default function DashboardTab({ hospitals, selectedGroup, onSelectHospital }) {
  const [selectedHosp, setSelectedHosp] = useState('all');
  const [statsMode, setStatsMode] = useState('calendar'); // 'calendar' or 'fiscal'
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [showRefreshNotice, setShowRefreshNotice] = useState(false);

  const cacheKey = `STATS_CACHE_${selectedHosp}_${statsMode}_${calendarYear}_${selectedGroup || "all"}`;

  // Instant SWR cache initialization
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem(cacheKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(!stats);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (force = false) => {
    if (force) setRefreshing(true);
    else if (!stats) setLoading(true);

    try {
      const statsData = await api.getDashboardStats(statsMode, calendarYear, selectedHosp, force, selectedGroup);
      if (statsData) {
        setStats(statsData);
        localStorage.setItem(cacheKey, JSON.stringify(statsData));
      }
    } catch (err) {
      console.error("Error loading dashboard stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // SWR pattern: Load cache instantly if exists
    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        setStats(JSON.parse(saved));
        setLoading(false);
      }
    } catch {}
    
    // Fetch fresh stats in parallel in background
    loadData(false);
  }, [selectedHosp, statsMode, calendarYear]);

  // Extract total certified and matched
  const totalCertified = stats?.certifiedDetailList
    ? stats.certifiedDetailList.reduce((acc, c) => acc + (c.certified || 0), 0)
    : 0;
  const totalMatched = stats?.certifiedDetailList
    ? stats.certifiedDetailList.reduce((acc, c) => acc + (c.matched || 0), 0)
    : 0;

  // Chart data from GAS datasets or labels
  const chartLabels = stats?.monthsLabels || [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];

  const chartData = {
    labels: chartLabels,
    datasets: stats?.datasets && stats.datasets.length > 0
      ? stats.datasets
      : [
          {
            label: 'เคสที่ตรวจพบ (Matched)',
            data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderRadius: 6,
          },
          {
            label: 'เคสที่รับรองแล้ว (Certified)',
            data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderRadius: 6,
          },
        ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: { family: 'Sarabun', size: 12, weight: '600' },
          color: '#475569',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: 12,
        titleFont: { family: 'Sarabun', size: 13 },
        bodyFont: { family: 'Sarabun', size: 12 },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(226, 232, 240, 0.6)' },
        ticks: { stepSize: 5, font: { family: 'Outfit', size: 11 } },
      },
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Sarabun', size: 11, weight: '500' } },
      },
    },
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Hospital Selector Dropdown & Refresh Bar */}
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-sky-100/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            ระบุโรงพยาบาลเพื่อดูสถิติ:
          </label>
          <div className="relative flex-1 max-w-md">
            <select
              value={selectedHosp}
              onChange={(e) => {
                setSelectedHosp(e.target.value);
              }}
              className="w-full pl-3.5 pr-8 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 focus:border-blue-500 focus:bg-white text-slate-800 text-xs md:text-sm font-bold rounded-xl outline-none transition cursor-pointer shadow-sm"
            >
              <option value="all">📊 ภาพรวมทั้งหมด (ทุกโรงพยาบาลสาขา)</option>
              {hospitals && hospitals.map((hosp) => (
                <option key={hosp.name} value={hosp.name}>
                  🏥 {hosp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={refreshing || loading}
          className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 border border-blue-200 self-end md:self-auto disabled:opacity-50"
          title="รีเฟรชข้อมูลแดชบอร์ดล่าสุด"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรชข้อมูล'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* Card 1: Total Devices */}
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden bg-white/70 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  ครุภัณฑ์สะสมทั้งหมด
                </span>
                <span className="text-4xl font-extrabold text-slate-900 mt-2 block min-h-[44px]">
                  {stats ? (
                    (stats.totalDevices || 0).toLocaleString()
                  ) : (
                    <span className="inline-block w-28 h-9 bg-slate-200 rounded-lg animate-pulse" />
                  )}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold block mt-1">
                  ✔️ ทำงานซิงค์ข้อมูลกลางอัตโนมัติ
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Layers className="w-6 h-6" />
              </div>
            </div>

            <div className="border-t border-slate-100/80 mt-4 pt-3 space-y-2 text-[11px] font-semibold text-slate-600">
              {stats?.devicesDetailList && stats.devicesDetailList.length > 0 ? (
                stats.devicesDetailList
                  .filter(d => selectedHosp === 'all' || d.hospital === selectedHosp)
                  .map((d, i) => (
                  <div key={i} className="flex justify-between items-center py-1 border-b border-slate-50">
                    <div className="flex flex-col">
                      <span className="truncate pr-2 font-medium">{d.hospital}</span>
                      <span className="text-[9px] text-slate-400 mt-0.5">
                        {d.lastUpdate === "เรียลไทม์ (Firestore)" ? "อัปเดตเรียลไทม์" : `อัปเดต: ${d.lastUpdate.split('T')[0]}`}
                        {d.daysAgo !== undefined && d.daysAgo !== null && d.daysAgo > 0 ? ` (ผ่านมา ${d.daysAgo} วัน)` : d.daysAgo === 0 ? ` (วันนี้)` : ''}
                      </span>
                    </div>
                    <span className="font-bold text-slate-800 shrink-0">
                      {typeof d.count === 'number' ? `${d.count.toLocaleString()} เครื่อง` : d.count}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-400 text-center py-2 animate-pulse">กำลังโหลดข้อมูลสาขา...</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Alerts In Database */}
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden bg-white/70 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  ประกาศภัยในคลังข่าวสะสม
                </span>
                <span className="text-4xl font-extrabold text-slate-900 mt-2 block min-h-[44px]">
                  {stats ? (
                    (stats.totalAlerts || 0).toLocaleString()
                  ) : (
                    <span className="inline-block w-24 h-9 bg-slate-200 rounded-lg animate-pulse" />
                  )}
                </span>
                <span className="text-[10px] text-blue-600 font-bold block mt-1">
                  📰 รวบรวมจากแหล่งข้อมูล ECRI & FDA
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

            <div className="border-t border-slate-100/80 mt-4 pt-3 space-y-2.5 text-[11px] font-semibold text-slate-600">
              <div className="flex justify-between items-start py-1 border-b border-slate-50">
                <div className="flex flex-col">
                  <span className="text-blue-700 font-bold">ECRI Database:</span>
                  {stats?.totalAlertsDetail?.ecriDateRange && (
                    <span className="text-[9px] text-slate-400 mt-0.5">
                      {stats.totalAlertsDetail.ecriDateRange.start} - {stats.totalAlertsDetail.ecriDateRange.end}
                    </span>
                  )}
                </div>
                <span className="font-bold text-slate-800 shrink-0">
                  {stats?.totalAlertsDetail?.ecriCount !== undefined ? `${stats.totalAlertsDetail.ecriCount.toLocaleString()} รายการ` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-start py-1 border-b border-slate-50">
                <div className="flex flex-col">
                  <span className="text-rose-700 font-bold">FDA Database:</span>
                  {stats?.totalAlertsDetail?.fdaDateRange && (
                    <span className="text-[9px] text-slate-400 mt-0.5">
                      {stats.totalAlertsDetail.fdaDateRange.start} - {stats.totalAlertsDetail.fdaDateRange.end}
                    </span>
                  )}
                </div>
                <span className="font-bold text-slate-800 shrink-0">
                  {stats?.totalAlertsDetail?.fdaCount !== undefined ? `${stats.totalAlertsDetail.fdaCount.toLocaleString()} รายการ` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50 text-slate-500">
                <span>สถานะการเฝ้าระวัง:</span>
                <span className="font-bold text-emerald-600">เรียลไทม์ 100%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Certified Cases */}
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden bg-white/70 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  เครื่องที่เจ้าหน้าที่สาขาตรวจรับรองแล้ว
                </span>
                <span className="text-4xl font-extrabold text-slate-900 mt-2 block min-h-[44px]">
                  {stats ? (
                    `${totalCertified} / ${totalMatched}`
                  ) : (
                    <span className="inline-block w-20 h-9 bg-slate-200 rounded-lg animate-pulse" />
                  )}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold block mt-1">
                  🔬 ยืนยันพบล่าสุดในแต่ละโรงพยาบาล
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            <div className="border-t border-slate-100/80 mt-4 pt-3 space-y-2 text-[11px] font-semibold text-slate-600">
              {stats?.certifiedDetailList && stats.certifiedDetailList.length > 0 ? (
                stats.certifiedDetailList
                  .filter(c => selectedHosp === 'all' || c.hospital === selectedHosp)
                  .map((c, i) => (
                  <div key={i} className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="truncate pr-2 font-medium">{c.hospital}</span>
                    <span className="font-bold text-emerald-700 shrink-0">
                      {c.certified} / {c.matched} เครื่อง
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-400 text-center py-2">กำลังโหลด...</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Visuals: Monthly Trend Chart Full Width */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-sky-100 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              สถิติแนวโน้มการตรวจพบและการรับรองเคสเสี่ยง (Monthly Trends)
            </h3>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setStatsMode('calendar')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                statsMode === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              ปีปฏิทิน
            </button>
            <button
              onClick={() => setStatsMode('fiscal')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                statsMode === 'fiscal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              ปีงบประมาณ
            </button>
          </div>
        </div>

        <div className="h-80 w-full pt-2">
          <Bar key={`${selectedHosp}_${statsMode}_${calendarYear}`} data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}
