import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  UploadCloud, 
  FileSpreadsheet, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  ShieldAlert, 
  ClipboardList, 
  Search, 
  CheckCircle, 
  FileCheck,
  RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../api_firebase';

export default function BranchTab({ 
  hospitals = [], 
  selectedBranch, 
  setSelectedBranch, 
  onOpenAiModal, 
  onOpenActionModal,
  onOpenDeviceListModal
}) {
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [matchedAlerts, setMatchedAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [branchStats, setBranchStats] = useState(null);

  useEffect(() => {
    if (!selectedBranch && hospitals.length > 0) {
      setSelectedBranch(hospitals[0].name);
    }
  }, [hospitals]);

  useEffect(() => {
    if (selectedBranch) {
      loadBranchAlerts();
    }
  }, [selectedBranch]);

  const loadBranchAlerts = async () => {
    setLoadingAlerts(true);
    setBranchStats(null);
    try {
      const [alertsRes, statsRes] = await Promise.allSettled([
        api.getMatchedAlertsForHospital(selectedBranch),
        api.getBranchDeviceStats(selectedBranch)
      ]);
      const alerts = alertsRes.status === 'fulfilled' ? alertsRes.value : [];
      const stats = statsRes.status === 'fulfilled' ? statsRes.value : null;
      setMatchedAlerts(Array.isArray(alerts) ? alerts : []);
      setBranchStats(stats);
    } catch (err) {
      console.error("Error loading branch alerts:", err);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      setUploadMessage(null);
    }
  };

  const handleUploadDevices = async () => {
    if (!uploadFile || !selectedBranch) return;
    setUploading(true);
    setUploadProgress({ msg: 'กำลังอ่านไฟล์ Excel...', pct: 5 });
    setUploadMessage(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setUploadProgress({ msg: 'กำลังประมวลผลข้อมูล...', pct: 10 });
        
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Read as array of arrays to find header row
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        if (rawData.length < 2) {
          throw new Error('ไฟล์ว่างเปล่าหรือไม่พบข้อมูล');
        }

        // Find header row (the one with the most non-empty strings in the first 10 rows)
        let headerRowIdx = 0;
        let maxCols = 0;
        for (let i = 0; i < Math.min(15, rawData.length); i++) {
          const colsCount = rawData[i].filter(c => String(c).trim() !== '').length;
          if (colsCount > maxCols) {
            maxCols = colsCount;
            headerRowIdx = i;
          }
        }

        const headers = rawData[headerRowIdx];
        const validDevices = [];
        
        // Process rows after header
        for (let i = headerRowIdx + 1; i < rawData.length; i++) {
          const row = rawData[i];
          let deviceId = "";
          let assetId = "";
          let brand = "";
          let model = "";
          let deviceType = "";
          let deviceThaiName = "";
          let status = "Active";
          let dept = "";
          
          headers.forEach((key, colIdx) => {
            const cleanKey = String(key || '').trim().toLowerCase();
            const val = String(row[colIdx] || '').trim();
            
            if (['id code', 'id', 'รหัสเครื่องมือ', 'รหัสครุภัณฑ์', 'รหัส', 'device code', 'device id'].includes(cleanKey)) {
              if (!deviceId) deviceId = val;
            } else if (['asset id', 'เลขครุภัณฑ์', 'เลขคุรุภัณฑ์', 'หมายเลขครุภัณฑ์', 'asset no', 'asset number'].includes(cleanKey)) {
              assetId = val;
            } else if (['ยี่ห้อ', 'brand', 'manufacturer'].includes(cleanKey)) {
              brand = val;
            } else if (['รุ่น', 'model'].includes(cleanKey)) {
              model = val;
            } else if (['ชนิดเครื่องมือ', 'ชื่อภาษาอังกฤษ', 'english name', 'device type', 'ชนิด', 'ประเภท'].includes(cleanKey)) {
              deviceType = val;
            } else if (['ชื่อเครื่องมือไทย', 'ชื่อภาษาไทย', 'ชื่อเครื่องมือ', 'รายการ'].includes(cleanKey)) {
              deviceThaiName = val;
            } else if (['สถานะ', 'status', 'สถานะการใช้งาน'].includes(cleanKey)) {
              status = val;
            } else if (['หน่วยงาน', 'แผนก', 'dept', 'department'].includes(cleanKey)) {
              dept = val;
            }
          });
          
          if (deviceId) {
            validDevices.push({
              Device_Code: deviceId,
              Asset_ID: assetId,
              Brand: brand,
              Model: model,
              Device_Type: deviceType,
              Device_Name: deviceThaiName,
              Status: status,
              Department: dept,
              Hospital_Name: selectedBranch,
              Upload_Date: new Date().toISOString()
            });
          }
        }

        if (validDevices.length === 0) {
          const foundHeaders = headers.map(h => String(h).trim()).filter(Boolean).join(', ');
          throw new Error(`ไม่พบข้อมูลเครื่องมือแพทย์ในไฟล์ หรือหาคอลัมน์ "รหัสเครื่องมือ" ไม่เจอ (คอลัมน์ที่ระบบเจอในไฟล์: ${foundHeaders})`);
        }

        const res = await api.saveDevicesBatch(validDevices, selectedBranch, (msg, pct) => {
          setUploadProgress({ msg, pct });
        });
        
        if (res.success) {
          setUploadMessage({ type: 'success', text: res.message });
          setUploadFile(null);
          loadBranchAlerts();
        } else {
          setUploadMessage({ type: 'error', text: res.message || 'เกิดข้อผิดพลาดในการอัปโหลด' });
        }
      } catch (err) {
        setUploadMessage({ type: 'error', text: err.toString() });
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    };
    reader.onerror = () => {
      setUploadMessage({ type: 'error', text: 'เกิดข้อผิดพลาดในการอ่านไฟล์' });
      setUploading(false);
      setUploadProgress(null);
    };
    reader.readAsArrayBuffer(uploadFile);
  };

  const completedCount = matchedAlerts.filter(item => item.isCompleted || item.trackingStatus === 'เสร็จสิ้น').length;
  const activeCount = matchedAlerts.length - completedCount;

  const filteredAlerts = matchedAlerts.filter(item => {
    const isCompleted = item.isCompleted || item.trackingStatus === 'เสร็จสิ้น';
    
    // ซ่อนเคสที่ปิดแล้ว/เสร็จสิ้นแล้วเป็นค่าเริ่มต้น (เว้นแต่จะกดปุ่มแสดงเคสที่เสร็จแล้ว)
    if (!showCompleted && isCompleted) return false;

    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    return (
      (item.deviceCode || '').toLowerCase().includes(kw) ||
      (item.toolName || '').toLowerCase().includes(kw) ||
      (item.assetId || '').toLowerCase().includes(kw) ||
      (item.brand || '').toLowerCase().includes(kw) ||
      (item.model || '').toLowerCase().includes(kw) ||
      (item.alertId || '').toLowerCase().includes(kw) ||
      (item.alertHeadline || item.headline || '').toLowerCase().includes(kw) ||
      (item.dept || '').toLowerCase().includes(kw)
    );
  }).sort((a, b) => {
    const timeA = new Date(a.alertDate || 0).getTime() || 0;
    const timeB = new Date(b.alertDate || 0).getTime() || 0;
    return timeB - timeA;
  });

  const finalGroupedAlerts = [];
  const groupMap = new Map();

  filteredAlerts.forEach(item => {
    const key = `${item.alertId}_${item.brand}_${item.model}`;
    if (!groupMap.has(key)) {
      const group = { ...item, isGroup: true, groupDevices: [item] };
      groupMap.set(key, group);
      finalGroupedAlerts.push(group);
    } else {
      groupMap.get(key).groupDevices.push(item);
    }
  });

  return (
    <div className="space-y-6 pt-2">
      {/* 1. Branch Selector Dropdown & Refresh Bar */}
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-sky-100/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            เลือกสาขาโรงพยาบาล:
          </label>
          <div className="relative flex-1 max-w-md">
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
              }}
              className="w-full pl-3.5 pr-8 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 focus:border-blue-500 focus:bg-white text-slate-800 text-xs md:text-sm font-bold rounded-xl outline-none transition cursor-pointer shadow-sm"
            >
              {hospitals.map((hosp) => (
                <option key={hosp.name} value={hosp.name}>
                  🏥 {hosp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {branchStats && (
          <div className="mt-4 md:mt-0 flex gap-4 md:border-l md:border-sky-100 md:pl-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase">ยอดเครื่องทั้งหมด</span>
              <span className="text-lg font-extrabold text-blue-700">{branchStats.count.toLocaleString()} <span className="text-xs font-normal text-slate-500">เครื่อง</span></span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase">อัปเดตล่าสุด</span>
              <span className="text-xs font-bold text-slate-700 mt-1">
                {branchStats.latestUploadDate ? new Date(branchStats.latestUploadDate).toLocaleDateString('th-TH') : '-'}
              </span>
              {branchStats.daysAgo !== null && (
                <span className="text-[9px] text-emerald-600 font-bold">
                  (ผ่านมา {branchStats.daysAgo} วัน)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Upload Branch Devices Excel */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex items-center gap-2 border-b border-sky-100 pb-3">
          <UploadCloud className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-extrabold text-slate-800">
            อัปโหลดทะเบียนเครื่องมือแพทย์ของสาขา {selectedBranch || ''}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <label className="drag-area rounded-2xl p-4 flex items-center justify-center gap-3 cursor-pointer text-center">
            <FileSpreadsheet className="w-8 h-8 text-blue-500 shrink-0" />
            <div className="text-left">
              <span className="text-xs font-bold text-slate-700 block">
                {uploadFile ? uploadFile.name : 'คลิกเลือกไฟล์ทะเบียนเครื่องมือ (.xlsx, .csv)'}
              </span>
              <span className="text-[10px] text-slate-400">
                {uploadFile ? `${(uploadFile.size / 1024).toFixed(1)} KB` : 'ระบบจะทำการ Upsert อัปเดตเครื่องเดิมและเพิ่มเครื่องใหม่อัตโนมัติ'}
              </span>
            </div>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          <div className="flex flex-col sm:flex-row justify-between items-center mt-2 gap-3">
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              รองรับไฟล์นามสกุล .xlsx หรือ .csv เท่านั้น
            </span>
            <button
              onClick={handleUploadDevices}
              disabled={!uploadFile || uploading || !selectedBranch}
              className="btn-gradient-blue text-white py-2 px-6 rounded-xl text-xs font-bold transition shadow-md flex items-center justify-center gap-2 relative overflow-hidden sm:w-auto w-full"
            >
              {uploading && uploadProgress && (
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300 ease-out" 
                  style={{ width: `${uploadProgress.pct}%` }}
                ></div>
              )}
              <UploadCloud className={`w-4 h-4 ${uploading ? 'animate-pulse' : ''} relative z-10`} />
              <span className="relative z-10">
                {uploading ? (uploadProgress ? uploadProgress.msg : 'กำลังนำเข้าครุภัณฑ์...') : 'นำเข้าข้อมูลเข้าสาขา'}
              </span>
            </button>
          </div>
        </div>

        {uploadMessage && (
          <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            uploadMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
            uploadMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
            'bg-sky-50 text-sky-800 border border-sky-200'
          }`}>
            {uploadMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{uploadMessage.text}</span>
          </div>
        )}
      </div>

      {/* 3. High Risk Matched Alerts Table */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-sky-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              รายการเครื่องมือที่ตรวจพบความเสี่ยงตรงกับประกาศเตือนภัย
            </h3>
            <span className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-lg font-bold">
              {showCompleted ? `ทั้งหมด ${finalGroupedAlerts.length} รายการ` : `รอดำเนินการ ${finalGroupedAlerts.length} รายการ`}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {completedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm border ${
                  showCompleted
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
                title={showCompleted ? 'คลิกเพื่อซ่อนรายการที่เสร็จสิ้นแล้ว' : 'คลิกเพื่อแสดงรายการที่เสร็จสิ้นแล้ว'}
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${showCompleted ? 'text-white' : 'text-emerald-600'}`} />
                <span>{showCompleted ? 'ซ่อนเคสที่ปิดแล้ว' : `แสดงเคสที่เสร็จแล้ว (${completedCount})`}</span>
              </button>
            )}

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="ค้นหารหัส, ชื่อเครื่องมือ, ยี่ห้อ, รุ่น..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 w-56 shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-3 text-center">จำนวนเครื่อง (รวม)</th>
                <th className="p-3">ยี่ห้อ / รุ่น / แผนก</th>
                <th className="p-3">แหล่งข่าว & รหัส</th>
                <th className="p-3">หัวข้อแจ้งเตือนภัย</th>
                <th className="p-3 text-center leading-tight">วันที่ประกาศข่าว<br/><span className="text-[9px] font-normal opacity-75">(MM/DD/YYYY)</span></th>
                <th className="p-3 text-center">วิเคราะห์ AI</th>
                <th className="p-3 text-center">สถานะรับรอง / ติดตาม</th>
                <th className="p-3 text-center">จัดการเคส</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingAlerts ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                    กำลังโหลดข้อมูลการจับคู่ความเสี่ยง...
                  </td>
                </tr>
              ) : finalGroupedAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                    {completedCount > 0 && !showCompleted 
                      ? `เคสความเสี่ยงทั้งหมด (${completedCount} เคส) ดำเนินการแก้ไขเสร็จสิ้นแล้ว` 
                      : 'ไม่พบรายการเครื่องมือแพทย์ที่ตรงกับประกาศเตือนภัยในสาขานี้'}
                  </td>
                </tr>
              ) : (
                finalGroupedAlerts.map((item, index) => {
                  const isCompleted = item.isCompleted || item.trackingStatus === 'เสร็จสิ้น';
                  const statusVal = item.status || item.certifyStatus || 'รอยืนยัน';
                  const isCertified = statusVal === 'จริง' || statusVal === 'รับรองแล้ว';
                  const isRejected = statusVal === 'เท็จ' || statusVal === 'ปฏิเสธ';
                  const certName = item.certifiedBy || item.certifier;
                  const certDate = item.certifyDate;
                  const toolDisplayName = item.toolName || item.thaiName || item.deviceType || item.assetId || '-';
                  
                  let displayDate = item.alertDate || '-';
                  if (displayDate !== '-' && displayDate) {
                    const dateObj = new Date(displayDate);
                    if (!isNaN(dateObj.getTime())) {
                      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                      const dd = String(dateObj.getDate()).padStart(2, '0');
                      const yyyy = dateObj.getFullYear();
                      displayDate = `${mm}/${dd}/${yyyy}`;
                    }
                  }

                  return (
                    <tr key={index} className={`transition ${isCompleted ? 'bg-emerald-50/30' : 'hover:bg-sky-50/40'}`}>
                      <td className="p-3 font-bold text-slate-800 text-center">
                        <button 
                          onClick={() => {
                            if (onOpenDeviceListModal) onOpenDeviceListModal(item);
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 mx-auto shadow-sm"
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span>{item.groupDevices?.length || 1} เครื่อง</span>
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{item.brand} {item.model}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {item.dept ? `🏢 แผนก: ${item.dept}` : '-'}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md inline-block mb-1 ${
                          item.source === 'ECRI' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {item.source}
                        </span>
                        <div className="font-mono text-[10px] text-slate-600 font-bold">{item.alertId}</div>
                      </td>
                      <td className="p-3 max-w-xs">
                        <p className="text-xs font-semibold text-slate-800 line-clamp-2" title={item.alertHeadline || item.headline}>
                          {item.alertHeadline || item.headline || 'ประกาศแจ้งเตือนความปลอดภัย'}
                        </p>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="text-[11px] font-bold text-slate-700 bg-slate-100/80 px-2.5 py-1 rounded-md border border-slate-200">
                          {displayDate}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => onOpenAiModal(item)}
                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 mx-auto shadow-sm"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                          <span>ดู AI</span>
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full inline-block ${
                          isCompleted ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          isCertified ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          isRejected ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {isCompleted ? '✔️ เสร็จสิ้น (ปิดเคสแล้ว)' : isCertified ? '✔️ รับรองแล้ว (จริง)' : isRejected ? '❌ ปฏิเสธ (เท็จ)' : '⏳ รอตรวจสอบ'}
                        </span>
                        {certName && (
                          <div className="text-[9px] text-slate-500 mt-1 leading-tight">
                            <div>โดย: {certName}</div>
                            {certDate && <div className="text-[8px] text-slate-400">{certDate}</div>}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onOpenActionModal(item, selectedBranch, loadBranchAlerts)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm"
                            title="ดำเนินการ / รับรองผล"
                          >
                            <ClipboardList className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
