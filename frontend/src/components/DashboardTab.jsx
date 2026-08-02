import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../api';
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
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function DashboardTab({ hospitals, onSelectHospital }) {
  const [selectedHosp, setSelectedHosp] = useState('all');
  const [statsMode, setStatsMode] = useState('calendar'); // 'calendar' or 'fiscal'
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processedDates, setProcessedDates] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, dates] = await Promise.all([
        api.getDashboardStats(statsMode, calendarYear, selectedHosp),
        api.getProcessedDates().catch(() => [])
      ]);
      setStats(statsData);
      setProcessedDates(Array.isArray(dates) ? dates : []);
    } catch (err) {
      console.error("Error loading dashboard stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedHosp, statsMode, calendarYear]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

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

  // Calendar matrix calculation
  const renderCalendarDays = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const days = [];

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-9 w-9"></div>);
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isProcessed = processedDates.includes(dateStr);
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      days.push(
        <div
          key={dateStr}
          className={`h-9 w-9 rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all relative ${
            isProcessed
              ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 font-extrabold'
              : isToday
              ? 'border-2 border-blue-500 text-blue-600 bg-blue-50/50'
              : 'bg-slate-100/70 text-slate-600 hover:bg-slate-200'
          }`}
          title={`${dateStr}: ${isProcessed ? 'ประมวลผลแล้ว' : 'ยังไม่ประมวลผล'}`}
        >
          <span>{d}</span>
          {isProcessed && (
            <span className="w-1.5 h-1.5 bg-white rounded-full absolute bottom-1"></span>
          )}
        </div>
      );
    }

    return days;
  };

  const monthNamesTh = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  return (
    <div className="space-y-6 pt-2">
      {/* Sticky Hospital Selector Filter */}
      <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-sky-100/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            ระบุโรงพยาบาลเพื่อดูสถิติ:
          </span>
          <button
            onClick={() => setSelectedHosp('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              selectedHosp === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            📊 ภาพรวมทั้งหมด
          </button>
          {hospitals && hospitals.map((hosp) => (
            <button
              key={hosp.name}
              onClick={() => setSelectedHosp(hosp.name)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedHosp === hosp.name
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🏥 {hosp.name}
            </button>
          ))}
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 shadow-sm transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${refreshing ? 'animate-spin' : ''}`} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Statistics summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Total Devices */}
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden bg-white/70">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                ครุภัณฑ์สะสมทั้งหมด
              </span>
              <span className="text-4xl font-extrabold text-slate-900 mt-2 block">
                {stats ? (stats.totalDevices || 0).toLocaleString() : '...'}
              </span>
              <span className="text-[10px] text-emerald-600 font-bold block mt-1">
                ✔️ ทำงานซิงค์ข้อมูลกลางอัตโนมัติ
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Layers className="w-6 h-6" />
            </div>
          </div>

          <div className="border-t border-slate-100/80 mt-4 pt-3 space-y-2 text-[11px] font-semibold text-slate-600 max-h-36 overflow-y-auto ai-scroll">
            {stats?.devicesDetailList && stats.devicesDetailList.length > 0 ? (
              stats.devicesDetailList.map((d, i) => (
                <div key={i} className="flex justify-between items-center py-0.5 border-b border-slate-50">
                  <span className="truncate pr-2 font-medium">{d.hospital}</span>
                  <span className="font-bold text-slate-800 shrink-0">{(d.count || 0).toLocaleString()} เครื่อง</span>
                </div>
              ))
            ) : (
              <div className="text-slate-400 text-center py-2">ไม่มีข้อมูลสาขา</div>
            )}
          </div>
        </div>

        {/* Card 2: Alerts In Database */}
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden bg-white/70">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                ประกาศภัยในคลังข่าวสะสม
              </span>
              <span className="text-4xl font-extrabold text-slate-900 mt-2 block">
                {stats ? (stats.totalAlerts || 0).toLocaleString() : '...'}
              </span>
              <span className="text-[10px] text-blue-600 font-bold block mt-1">
                📰 รวบรวมจากแหล่งข้อมูล ECRI & FDA
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>

          <div className="border-t border-slate-100/80 mt-4 pt-3 space-y-2 text-[11px] font-semibold text-slate-600">
            <div className="flex justify-between items-center py-1">
              <span className="text-blue-700 font-bold">ECRI Database:</span>
              <span className="font-bold text-slate-800">{(stats?.totalAlertsDetail?.ecriCount || 0).toLocaleString()} รายการ</span>
            </div>
            <div className="text-[10px] text-slate-400 pl-2">
              ช่วงวันที่: {stats?.totalAlertsDetail?.minEcriDate || '-'} ถึง {stats?.totalAlertsDetail?.maxEcriDate || '-'}
            </div>
            <div className="flex justify-between items-center py-1 pt-2 border-t border-slate-50">
              <span className="text-rose-700 font-bold">FDA Database:</span>
              <span className="font-bold text-slate-800">{(stats?.totalAlertsDetail?.fdaCount || 0).toLocaleString()} รายการ</span>
            </div>
            <div className="text-[10px] text-slate-400 pl-2">
              ช่วงวันที่: {stats?.totalAlertsDetail?.minFdaDate || '-'} ถึง {stats?.totalAlertsDetail?.maxFdaDate || '-'}
            </div>
          </div>
        </div>

        {/* Card 3: Certified Cases */}
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden bg-white/70">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                เคสที่เจ้าหน้าที่สาขาตรวจรับรองแล้ว
              </span>
              <span className="text-4xl font-extrabold text-slate-900 mt-2 block">
                {stats ? `${totalCertified} / ${totalMatched}` : '...'}
              </span>
              <span className="text-[10px] text-red-600 font-bold block mt-1">
                🔬 ยืนยันพบล่าสุดในแต่ละโรงพยาบาล
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="border-t border-slate-100/80 mt-4 pt-3 space-y-2 text-[11px] font-semibold text-slate-600 max-h-36 overflow-y-auto ai-scroll">
            {stats?.certifiedDetailList && stats.certifiedDetailList.length > 0 ? (
              stats.certifiedDetailList.map((c, i) => (
                <div key={i} className="flex justify-between items-center py-0.5 border-b border-slate-50">
                  <span className="truncate pr-2 font-medium">{c.hospital}</span>
                  <span className="font-bold text-emerald-700 shrink-0">
                    {c.certified} / {c.matched} เคส
                  </span>
                </div>
              ))
            ) : (
              <div className="text-slate-400 text-center py-2">ไม่มีข้อมูลการรับรอง</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Visuals: Monthly Trend Chart & Processing Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend Chart */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
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

          <div className="h-72 w-full pt-2">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Processing Calendar Matrix */}
        <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
          <div className="flex justify-between items-center border-b border-sky-100 pb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-extrabold text-slate-800">
                ปฏิทินตรวจจับรายวัน
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11);
                    setCalendarYear(calendarYear - 1);
                  } else {
                    setCalendarMonth(calendarMonth - 1);
                  }
                }}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-700 px-1">
                {monthNamesTh[calendarMonth]} {calendarYear + 543}
              </span>
              <button
                onClick={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0);
                    setCalendarYear(calendarYear + 1);
                  } else {
                    setCalendarMonth(calendarMonth + 1);
                  }
                }}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-2">
            <div>อา</div><div>จ</div><div>อ</div><div>พ</div><div>พฤ</div><div>ศ</div><div>ส</div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 justify-items-center">
            {renderCalendarDays()}
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-emerald-500"></span>
              <span>ประมวลผลแล้ว</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-slate-200"></span>
              <span>ยังไม่มีข้อมูล</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
