import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Play, 
  RotateCcw, 
  Building2, 
  KeyRound, 
  Mail, 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  PlusCircle,
  Clock,
  Sparkles,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Zap,
  Info
} from 'lucide-react';
import { api } from '../api';

export default function AdminTab({ hospitals, onReloadHospitals }) {
  // Alert upload state
  const [uploadType, setUploadType] = useState('admin_ecri'); // 'admin_ecri' or 'admin_fda'
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Calendar & Manual Run state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [processedDates, setProcessedDates] = useState(() => {
    try {
      const saved = localStorage.getItem('PROCESSED_DATES_MAP');
      return saved ? JSON.parse(saved) : { ecri: [], fda: [] };
    } catch {
      return { ecri: [], fda: [] };
    }
  });
  const [loadingDates, setLoadingDates] = useState(false);
  const [manualStartDate, setManualStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualEndDate, setManualEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [runningJob, setRunningJob] = useState(false);
  const [jobProgressMsg, setJobProgressMsg] = useState(null);

  // Branch registration state
  const [newHospName, setNewHospName] = useState('');
  const [newHospEmail, setNewHospEmail] = useState('');
  const [addingHosp, setAddingHosp] = useState(false);
  const [hospMessage, setHospMessage] = useState(null);

  // Settings state
  const [apiKey, setApiKey] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null);

  // Activity logs state
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  const thMonthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  useEffect(() => {
    // Load initial settings, dates, and logs sequentially to prevent GAS rate limit 404s
    const initAll = async () => {
      await loadSettings();
      await loadProcessedDates();
      await loadActivities();
    };
    initAll();
  }, []);

  const loadSettings = async () => {
    // Fetch sequentially instead of Promise.all to avoid throttling
    try {
      const emailVal = await api.getAdminEmailSettings();
      if (emailVal && typeof emailVal === 'string') setAdminEmail(emailVal);
    } catch (err) {
      console.error("Error loading email settings:", err);
    }
    
    try {
      const keyVal = await api.getGeminiApiKeySettings();
      if (keyVal && typeof keyVal === 'string') setApiKey(keyVal);
    } catch (err) {
      console.error("Error loading API key settings:", err);
    }
  };

  const loadProcessedDates = async () => {
    setLoadingDates(true);
    try {
      const res = await api.getProcessedDates();
      if (res) {
        let ecri = [];
        let fda = [];
        if (Array.isArray(res.ecri) || Array.isArray(res.fda)) {
          ecri = Array.isArray(res.ecri) ? res.ecri : [];
          fda = Array.isArray(res.fda) ? res.fda : [];
        } else {
          const dataMap = res.data || res;
          if (typeof dataMap === 'object' && !Array.isArray(dataMap)) {
            Object.entries(dataMap).forEach(([dateStr, status]) => {
              const s = String(status).toLowerCase();
              if (s === 'ecri' || s === 'both') ecri.push(dateStr);
              if (s === 'fda' || s === 'both') fda.push(dateStr);
            });
          }
        }
        const formatted = { ecri, fda };
        setProcessedDates(formatted);
        localStorage.setItem('PROCESSED_DATES_MAP', JSON.stringify(formatted));
      }
    } catch (err) {
      console.error("Error loading processed dates:", err);
    } finally {
      setLoadingDates(false);
    }
  };

  const loadActivities = async () => {
    setLoadingActivities(true);
    try {
      const logs = await api.getRecentSystemActivities();
      setActivities(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.error("Error loading activities:", err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      setUploadMessage(null);
    }
  };

  const handleUploadAlertFile = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadMessage({ type: 'info', text: 'กำลังอัปโหลดและประมวลผลไฟล์...' });

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileData = {
          name: uploadFile.name,
          data: e.target.result,
        };
        const res = await api.saveAlertsToDatabase(fileData, uploadType);
        if (res.success) {
          setUploadMessage({ type: 'success', text: res.message });
          setUploadFile(null);
          loadProcessedDates();
          loadActivities();
        } else {
          setUploadMessage({ type: 'error', text: res.message || 'เกิดข้อผิดพลาดในการอัปโหลด' });
        }
      } catch (err) {
        setUploadMessage({ type: 'error', text: err.toString() });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(uploadFile);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await api.testAdminUploadConnection();
      alert(res.message || 'ทดสอบการเชื่อมต่อสำเร็จ');
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการทดสอบ: ' + err.toString());
    } finally {
      setTestingConnection(false);
    }
  };

  // Run matching for selected range
  const handleExecuteManualRunRange = async () => {
    if (!manualStartDate || !manualEndDate) {
      setJobProgressMsg('⚠️ กรุณาระบุทั้งวันที่เริ่มต้นและสิ้นสุดครับ');
      return;
    }
    const start = new Date(manualStartDate);
    const end = new Date(manualEndDate);
    if (start > end) {
      setJobProgressMsg('⚠️ วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุดครับ');
      return;
    }

    setRunningJob(true);
    setJobProgressMsg(`⏳ กำลังสั่งรันวิเคราะห์เปรียบเทียบข้อมูลตั้งแต่ ${manualStartDate} ถึง ${manualEndDate}...`);

    try {
      let currentDate = new Date(start);
      let successCount = 0;
      let totalDays = 0;

      while (currentDate <= end) {
        totalDays++;
        const dateStr = currentDate.toISOString().split('T')[0];
        setJobProgressMsg(`🔄 กำลังประมวลผลวันที่ ${dateStr} (${totalDays} วัน)...`);
        
        try {
          const res = await api.runMatchingJobForDate(dateStr);
          if (res && res.success) successCount++;
        } catch (e) {
          console.warn(`Error running for date ${dateStr}:`, e);
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      setJobProgressMsg(`✅ สั่งรันวิเคราะห์ข้อมูลสำเร็จเรียบร้อย (${successCount}/${totalDays} วัน)`);
      loadProcessedDates();
      loadActivities();
    } catch (err) {
      setJobProgressMsg(`❌ เกิดข้อผิดพลาด: ${err.toString()}`);
    } finally {
      setRunningJob(false);
    }
  };

  // Run bulk all unprocessed
  const handleExecuteBulkManualRun = async () => {
    if (!confirm('ต้องการเริ่มรันตรวจจับความเสี่ยงทุกวันที่ยังค้างอยู่ในระบบใช่หรือไม่?')) return;
    setRunningJob(true);
    setJobProgressMsg('⏳ กำลังค้นหาและประมวลผลเคสที่ตกค้างสะสมทั้งหมด...');
    try {
      const res = await api.runMatchingJobForAllUnprocessed();
      setJobProgressMsg(`✅ เสร็จสิ้น: ${res.message || 'ประมวลผลข้อมูลสำเร็จ'}`);
      loadProcessedDates();
      loadActivities();
    } catch (err) {
      setJobProgressMsg(`❌ เกิดข้อผิดพลาด: ${err.toString()}`);
    } finally {
      setRunningJob(false);
    }
  };

  const handleDateClick = (dateStr) => {
    setManualStartDate(dateStr);
    setManualEndDate(dateStr);
  };

  const changeCalendarMonth = (offset) => {
    const next = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + offset, 1);
    setCalendarDate(next);
  };

  const handleAddHospital = async (e) => {
    e.preventDefault();
    if (!newHospName.trim()) return;
    setAddingHosp(true);
    try {
      const res = await api.addHospitalToList(newHospName.trim(), newHospEmail.trim());
      if (res.success) {
        setHospMessage({ type: 'success', text: res.message });
        setNewHospName('');
        setNewHospEmail('');
        onReloadHospitals();
      } else {
        setHospMessage({ type: 'error', text: res.message });
      }
    } catch (err) {
      setHospMessage({ type: 'error', text: err.toString() });
    } finally {
      setAddingHosp(false);
    }
  };

  const handleSaveApiKey = async () => {
    setSavingKey(true);
    setSettingsMsg(null);
    try {
      const res = await api.saveGeminiApiKey(apiKey.trim());
      if (res && res.success !== false) {
        setSettingsMsg({ type: 'success', text: res.message || 'บันทึก API Key สำเร็จ' });
      } else {
        setSettingsMsg({ type: 'error', text: res?.message || 'ไม่สามารถบันทึกได้' });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.message || err.toString() });
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    setSettingsMsg(null);
    try {
      const res = await api.saveAdminEmailSettings(adminEmail.trim());
      if (res && res.success !== false) {
        setSettingsMsg({ type: 'success', text: res.message || 'บันทึกอีเมลผู้ดูแลระบบสำเร็จ' });
      } else {
        setSettingsMsg({ type: 'error', text: res?.message || 'ไม่สามารถบันทึกได้' });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.message || err.toString() });
    } finally {
      setSavingEmail(false);
    }
  };

  // Calendar matrix rendering
  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    const cells = [];

    // Empty spaces before first day
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(
        <div key={`empty-${i}`} className="h-16 border border-transparent"></div>
      );
    }

    // Days in month
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isEcri = (processedDates.ecri || []).includes(dateStr);
      const isFda = (processedDates.fda || []).includes(dateStr);
      const isSelected = manualStartDate === dateStr || manualEndDate === dateStr;

      let cellStyle = {};
      let borderClass = 'border-slate-100 hover:border-slate-300';
      let badges = null;

      if (isEcri && isFda) {
        // Dual processed: Left half blue (ECRI), Right half orange (FDA)
        cellStyle = {
          background: 'linear-gradient(to right, rgba(59, 130, 246, 0.12) 50%, rgba(249, 115, 22, 0.12) 50%)'
        };
        borderClass = 'border-slate-300 shadow-sm';
        badges = (
          <div className="flex gap-0.5 justify-center w-full">
            <span className="text-[8px] px-1 bg-blue-50 text-blue-600 border border-blue-200 font-extrabold rounded">ECRI</span>
            <span className="text-[8px] px-1 bg-orange-50 text-orange-600 border border-orange-200 font-extrabold rounded">FDA</span>
          </div>
        );
      } else if (isEcri) {
        cellStyle = {
          background: 'linear-gradient(to right, rgba(59, 130, 246, 0.12) 50%, #ffffff 50%)'
        };
        borderClass = 'border-blue-200 shadow-sm';
        badges = (
          <div className="flex gap-0.5 justify-center w-full">
            <span className="text-[8px] px-1 bg-blue-50 text-blue-600 border border-blue-200 font-extrabold rounded">ECRI</span>
            <span className="text-[8px] px-1 text-slate-300 font-bold rounded">-</span>
          </div>
        );
      } else if (isFda) {
        cellStyle = {
          background: 'linear-gradient(to right, #ffffff 50%, rgba(249, 115, 22, 0.12) 50%)'
        };
        borderClass = 'border-orange-200 shadow-sm';
        badges = (
          <div className="flex gap-0.5 justify-center w-full">
            <span className="text-[8px] px-1 text-slate-300 font-bold rounded">-</span>
            <span className="text-[8px] px-1 bg-orange-50 text-orange-600 border border-orange-200 font-extrabold rounded">FDA</span>
          </div>
        );
      } else {
        cellStyle = { background: '#ffffff' };
        borderClass = 'border-slate-100 hover:bg-slate-50';
        badges = (
          <span className="text-[8px] text-slate-400 font-semibold">ยังไม่รัน</span>
        );
      }

      cells.push(
        <div
          key={dateStr}
          onClick={() => handleDateClick(dateStr)}
          style={cellStyle}
          className={`flex flex-col items-center justify-between h-16 p-1.5 border rounded-xl cursor-pointer transition hover:scale-105 duration-150 relative ${borderClass} ${
            isSelected ? 'ring-2 ring-blue-500 font-extrabold' : ''
          }`}
          title={`${dateStr}: คลิกเพื่อเลือกช่วงวันที่รันตรวจจับคู่`}
        >
          <span className={`text-xs font-bold ${isSelected ? 'text-blue-600 font-extrabold' : 'text-slate-700'}`}>
            {d}
          </span>
          {badges}
        </div>
      );
    }

    return cells;
  };

  return (
    <div className="space-y-6 pt-2">
      {/* 1. Upload Alerts Section */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex items-center justify-between border-b border-sky-100 pb-3">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              1. นำเข้าข้อมูลเตือนภัยจากแหล่งข่าว (ECRI & FDA)
            </h3>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-100 cursor-pointer disabled:opacity-50"
          >
            {testingConnection ? 'กำลังทดสอบ...' : '🔌 ทดสอบ Cloud'}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setUploadType('admin_ecri')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                uploadType === 'admin_ecri'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              📰 ข่าวเตือนภัย ECRI
            </button>
            <button
              onClick={() => setUploadType('admin_fda')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                uploadType === 'admin_fda'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              🏛️ ข่าวเรียกคืน FDA
            </button>
          </div>

          <label className="drag-area rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer block text-center">
            <FileSpreadsheet className="w-10 h-10 text-blue-500 mb-2 opacity-80" />
            <span className="text-xs font-bold text-slate-700">
              {uploadFile ? uploadFile.name : 'คลิกหรือลากไฟล์ Excel (.xlsx, .csv) มาวางที่นี่'}
            </span>
            <span className="text-[10px] text-slate-400 mt-1">
              {uploadFile ? `${(uploadFile.size / 1024).toFixed(1)} KB` : 'รองรับไฟล์จากระบบ ECRI หรือ FDA Database'}
            </span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {uploadMessage && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              uploadMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
              uploadMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
              'bg-sky-50 text-sky-800 border border-sky-200'
            }`}>
              {uploadMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{uploadMessage.text}</span>
            </div>
          )}

          <button
            onClick={handleUploadAlertFile}
            disabled={!uploadFile || uploading}
            className="w-full py-2.5 btn-gradient-blue text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{uploading ? 'กำลังประมวลผลข้อมูล...' : 'บันทึกเข้าคลังข้อมูลสะสมส่วนกลาง'}</span>
          </button>
        </div>
      </div>

      {/* 2. Registered Hospitals & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hospital Registry Manager */}
        <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-sky-100 pb-3">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              2.1 ทะเบียนรายชื่อโรงพยาบาลสาขา ({hospitals.length})
            </h3>
          </div>

          <form onSubmit={handleAddHospital} className="space-y-3 bg-sky-50/50 p-3.5 rounded-xl border border-sky-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="ชื่อโรงพยาบาล (เช่น รพ.กรุงเทพ)"
                value={newHospName}
                onChange={(e) => setNewHospName(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                required
              />
              <input
                type="email"
                placeholder="อีเมลผู้รับรายงาน (ตัวเลือก)"
                value={newHospEmail}
                onChange={(e) => setNewHospEmail(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={addingHosp}
              className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{addingHosp ? 'กำลังบันทึก...' : 'ลงทะเบียนสาขาใหม่'}</span>
            </button>
          </form>

          {hospMessage && (
            <div className={`p-2.5 rounded-xl text-xs font-bold ${
              hospMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
            }`}>
              {hospMessage.text}
            </div>
          )}

          <div className="max-h-48 overflow-y-auto ai-scroll space-y-1.5">
            {hospitals.map((h, i) => (
              <div key={i} className="flex justify-between items-center p-2.5 bg-white rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="font-bold text-slate-800 block">{h.name}</span>
                  <span className="text-[10px] text-slate-400">{h.email || 'ไม่มีอีเมล'}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-semibold bg-slate-50 px-2 py-1 rounded-lg">
                  อัปเดต: {h.lastUploadTime || 'ยังไม่มีการอัปโหลด'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* System Settings & Keys */}
        <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-sky-100 pb-3">
            <KeyRound className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              2.2 ตั้งค่าคีย์ระบบและผู้ดูแล (Configurations)
            </h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                <span>DeepSeek API Key:</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-xxxxxxxxxxxx"
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={savingKey}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {savingKey ? 'บันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>อีเมลผู้ดูแลระบบหลัก (Admin Notification Email):</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@nhealth.co.th"
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSaveEmail}
                  disabled={savingEmail}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {savingEmail ? 'บันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>

            {settingsMsg && (
              <div className={`p-2.5 rounded-xl text-xs font-bold ${
                settingsMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
              }`}>
                {settingsMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Calendar & Manual Matching Runner (Section 3 - Exact original layout) */}
      <div className="glass-panel rounded-2xl p-6 space-y-5 bg-white/80">
        <div className="flex justify-between items-center border-b border-sky-100 pb-2">
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            <span>3. ปฏิทินแสดงผลและปุ่มสั่งรันวิเคราะห์เปรียบเทียบแมนนวล (Manual Run)</span>
          </h3>
          <button
            onClick={loadProcessedDates}
            disabled={loadingDates}
            className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer disabled:opacity-50"
          >
            {loadingDates ? 'กำลังโหลดปฏิทิน...' : '🔄 รีเฟรชปฏิทิน'}
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-100 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              📢 <b>หมายเหตุระบบแมนนวล:</b> ระบบจะทำการวิเคราะห์จับคู่เปรียบเทียบข้อมูลเมื่อมีผู้ใช้งานสั่งรันวิเคราะห์ผ่านระบบนี้ (คลิกเลือกวันที่บนปฏิทิน หรือระบุช่วงวันที่แล้วกดสั่งรัน)
            </p>
          </div>

          {/* Calendar Display Box */}
          <div className="border border-slate-200/80 rounded-2xl p-5 bg-white shadow-sm space-y-4">
            {/* Calendar Header Controls */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => changeCalendarMonth(-1)}
                className="p-1 px-3 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>ก่อนหน้า</span>
              </button>
              <h4 className="text-sm font-extrabold text-slate-800">
                {thMonthNames[calendarDate.getMonth()]} {calendarDate.getFullYear() + 543}
              </h4>
              <button
                onClick={() => changeCalendarMonth(1)}
                className="p-1 px-3 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer flex items-center gap-1"
              >
                <span>ถัดไป</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold text-slate-500 uppercase">
              <div>อา.</div><div>จ.</div><div>อ.</div><div>พ.</div><div>พฤ.</div><div>ศ.</div><div>ส.</div>
            </div>

            {/* Calendar Days Matrix */}
            <div className="grid grid-cols-7 gap-2">
              {renderCalendar()}
            </div>

            {/* Calendar Legend */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-600 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span>
                <span>รัน ECRI แล้ว</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300"></span>
                <span>รัน FDA แล้ว</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-gradient-to-r from-blue-200 to-orange-200 border border-slate-300"></span>
                <span>รันสมบูรณ์ทั้งคู่ (ECRI & FDA)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-white border border-slate-200"></span>
                <span>ยังไม่เคยรัน</span>
              </div>
            </div>
          </div>

          {/* Manual Run Form Controls */}
          <div className="bg-slate-100/90 rounded-2xl p-5 space-y-4 border border-slate-200/60">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <span>🛠️ สั่งรันวิเคราะห์ความปลอดภัยรายวันแบบกำหนดเอง (เลือกช่วงวันที่ต้องการประมวลผลย้อนหลัง)</span>
            </h4>
            
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-bold whitespace-nowrap">เริ่มต้น:</span>
                  <input
                    type="date"
                    value={manualStartDate}
                    onChange={(e) => setManualStartDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-bold whitespace-nowrap">สิ้นสุด:</span>
                  <input
                    type="date"
                    value={manualEndDate}
                    onChange={(e) => setManualEndDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={handleExecuteManualRunRange}
                  disabled={runningJob}
                  className="btn-gradient-blue text-white font-bold py-2.5 px-5 rounded-xl text-xs transition whitespace-nowrap shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>🚀 สั่งรันตรวจจับคู่</span>
                </button>
              </div>

              <div className="border-t border-slate-200 my-2"></div>

              <div className="flex justify-end">
                <button
                  onClick={handleExecuteBulkManualRun}
                  disabled={runningJob}
                  className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold py-3 px-6 rounded-xl text-xs transition shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Zap className={`w-4 h-4 ${runningJob ? 'animate-spin' : ''}`} />
                  <span>⚡ สั่งรันตรวจจับคู่ทั้งหมดสะสม (ข้ามประวัติที่รันแล้ว)</span>
                </button>
              </div>

              {jobProgressMsg && (
                <div className="p-3.5 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono border border-slate-800">
                  {jobProgressMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Activity Logs Section */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex items-center justify-between border-b border-sky-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              4. บันทึกกิจกรรมล่าสุดของระบบ (System Activity Logs)
            </h3>
          </div>
          <button
            onClick={loadActivities}
            className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
          >
            รีเฟรชประวัติ
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto ai-scroll">
          {loadingActivities ? (
            <div className="text-center py-6 text-xs text-slate-400 font-bold">กำลังโหลดข้อมูลประวัติ...</div>
          ) : activities.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 font-bold">ยังไม่มีประวัติกิจกรรม</div>
          ) : (
            activities.map((act, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100 text-xs hover:border-blue-100 transition">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <div>
                    <span className="font-bold text-slate-800 block">{act.activity}</span>
                    <span className="text-[10px] text-slate-400">{act.type} • บันทึก {act.count || 0} รายการ</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                    act.status === 'Success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}>
                    {act.status}
                  </span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">{act.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
