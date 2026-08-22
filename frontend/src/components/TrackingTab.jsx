import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  Search, 
  Building2, 
  Clock, 
  CheckCircle2, 
  PlusCircle,
  AlertTriangle,
  RotateCw,
  Tag,
  ShieldCheck,
  Calendar,
  ClipboardList
} from 'lucide-react';
import { api } from '../api_firebase';

function formatThaiDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const day = d.getDate();
  const month = thMonths[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

export default function TrackingTab({ hospitals = [], onOpenActionModal, onOpenDeviceListModal }) {
  const [selectedHospital, setSelectedHospital] = useState('ทั้งหมด');
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
    const isCompleted = item.trackingStatus === 'เสร็จสิ้น';

    // Group filter: If "ทั้งหมด" is selected, only show hospitals that belong to the selected group
    if (selectedHospital === 'ทั้งหมด') {
      const validHospitals = hospitals.map(h => h.name);
      if (!validHospitals.includes(item.hospital)) return false;
    }

    // Status filter
    if (statusFilter === 'in_progress' && isCompleted) return false;
    if (statusFilter === 'completed' && !isCompleted) return false;

    // Search filter
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      const hosp = (item.hospitalName || item.hospital || '').toLowerCase();
      const code = (item.deviceCode || '').toLowerCase();
      const bm = (item.deviceBrandModel || '').toLowerCase();
      const alert = (item.alertId || '').toLowerCase();
      const cert = (item.certifyName || '').toLowerCase();
      const actionsText = (item.actions || []).map(a => a.detail || '').join(' ').toLowerCase();

      return hosp.includes(kw) || code.includes(kw) || bm.includes(kw) || alert.includes(kw) || cert.includes(kw) || actionsText.includes(kw);
    }
    return true;
  });

  const finalGroupedCases = [];
  const groupMap = new Map();

  filteredCases.forEach(item => {
    const hosp = item.hospitalName || item.hospital;
    const key = `${item.alertId}_${item.deviceBrandModel}_${hosp}`;
    if (!groupMap.has(key)) {
      const group = { ...item, isGroup: true, groupDevices: [item] };
      groupMap.set(key, group);
      finalGroupedCases.push(group);
    } else {
      groupMap.get(key).groupDevices.push(item);
      // Update tracking status if any is still in progress
      if (item.trackingStatus !== 'เสร็จสิ้น') {
        groupMap.get(key).trackingStatus = 'กำลังดำเนินการ';
      }
    }
  });

  return (
    <div className="space-y-6 pt-2">
      {/* Tracking Header & Filter Bar */}
      <div className="glass-panel rounded-2xl p-5 bg-white/80 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">
                ติดตามสถานะการแก้ไขและความปลอดภัยของอุปกรณ์ (Action Tracking)
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                บันทึกและติดตามความคืบหน้าการจัดการเครื่องมือแพทย์ที่ตรวจพบความเสี่ยง
              </p>
            </div>
            <span className="ml-2 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-lg font-bold">
              {finalGroupedCases.length} รายการ
            </span>
          </div>

          <button
            onClick={loadCases}
            disabled={loading}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูลเคส'}</span>
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          {/* Hospital Selector */}
          <div>
            <select
              value={selectedHospital}
              onChange={(e) => setSelectedHospital(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="ทั้งหมด">🏥 ทุกโรงพยาบาลสาขา</option>
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

      {/* Case Timeline Cards List */}
      <div className="space-y-5">
        {loading ? (
          <div className="glass-panel rounded-2xl p-12 text-center bg-white/80">
            <RotateCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">กำลังโหลดรายการติดตามเคสความปลอดภัย...</p>
          </div>
        ) : finalGroupedCases.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center bg-white/80 border border-slate-200">
            <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">ไม่พบเคสที่ต้องติดตาม (หรือยังไม่มีเคสที่รับรองแล้ว)</p>
            <p className="text-xs text-slate-400 mt-1 font-medium">เมื่อมีรายการตรวจรับรองความเสี่ยงในหน้ารายสาขา เคสจะปรากฏที่นี่โดยอัตโนมัติ</p>
          </div>
        ) : (
          finalGroupedCases.map((item, idx) => {
            const isCompleted = item.trackingStatus === 'เสร็จสิ้น';
            const hospName = item.hospitalName || item.hospital;
            const actions = item.actions || [];

            return (
              <div 
                key={idx} 
                className="glass-panel rounded-2xl overflow-hidden bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition space-y-0"
              >
                {/* Card Header */}
                <div className="p-5 bg-gradient-to-r from-slate-50 via-sky-50/40 to-slate-50 border-b border-slate-200/70 flex flex-wrap justify-between items-start gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-slate-800 text-base flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <span>{hospName}</span>
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                        isCompleted 
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                          : 'bg-blue-100 text-blue-800 border-blue-300'
                      }`}>
                        {isCompleted ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>เสร็จสิ้น</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                            <span>กำลังดำเนินการ</span>
                          </>
                        )}
                      </span>
                    </div>

                    {/* Metadata Subheader */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
                      <span>
                        <button 
                          onClick={() => {
                            if (onOpenDeviceListModal) {
                              const b = item.deviceBrandModel ? item.deviceBrandModel.split(' ')[0] : '';
                              const m = item.deviceBrandModel ? item.deviceBrandModel.split(' ').slice(1).join(' ') : '';
                              onOpenDeviceListModal({ ...item, brand: b, model: m });
                            }
                          }}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          {item.groupDevices?.length || 1} เครื่อง (คลิกดู)
                        </button>
                      </span>
                      <span><b>ยี่ห้อ / รุ่น:</b> <span className="font-bold text-slate-800">{item.deviceBrandModel || '-'}</span></span>
                      <span className="flex items-center gap-1">
                        <b>รหัสข่าว:</b> 
                        <span className="font-mono text-blue-600 font-bold">{item.alertId}</span>
                        {item.alertSource && (
                          <span className="text-[10px] px-1.5 bg-blue-50 text-blue-700 rounded font-bold border border-blue-200">
                            {item.alertSource}
                          </span>
                        )}
                      </span>
                      {item.certifyName && (
                        <span><b>ผู้รับรอง:</b> <span className="text-slate-700 font-semibold">{item.certifyName}</span></span>
                      )}
                    </div>
                  </div>

                  {/* Add Action Button */}
                  <div>
                    {!isCompleted && (
                      <button
                        onClick={() => onOpenActionModal(item, hospName, loadCases)}
                        className="px-4 py-2 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer hover:shadow"
                      >
                        <PlusCircle className="w-4 h-4 text-blue-600" />
                        <span>เพิ่ม Action</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Body - Vertical Timeline */}
                <div className="p-6">
                  <div className="relative border-l-2 border-blue-200 ml-4 space-y-6">
                    {actions.length === 0 ? (
                      <div className="pl-6 text-xs text-slate-400 font-medium">
                        ยังไม่มีบันทึกการปฏิบัติงานเพิ่มเติม
                      </div>
                    ) : (
                      actions.map((act, actIdx) => {
                        const isFinalAction = act.isFinal === true || act.isFinal === 'true';
                        const dotColor = isFinalAction 
                          ? 'bg-emerald-500 ring-emerald-100' 
                          : 'bg-blue-500 ring-blue-100';

                        return (
                          <div key={actIdx} className="relative pl-6">
                            {/* Dot Milestone */}
                            <div className={`absolute w-3.5 h-3.5 rounded-full ${dotColor} ring-4 -left-[8px] top-1.5`}></div>
                            
                            {/* Action Bubble */}
                            <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 p-4 rounded-2xl shadow-xs transition space-y-2">
                              <div className="flex flex-wrap justify-between items-center gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                                    Action {act.actionId || actIdx + 1}
                                  </span>
                                  {isFinalAction && (
                                    <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1">
                                      <ShieldCheck className="w-3 h-3" />
                                      <span>บันทึกปิดเคส</span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-bold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1 shadow-2xs">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>{formatThaiDateTime(act.date)}</span>
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">
                                {act.detail}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

