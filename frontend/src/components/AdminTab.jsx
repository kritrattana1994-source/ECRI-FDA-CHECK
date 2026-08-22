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
  Info,
  Trash2,
  Copy,
  Check,
  Share2,
  Loader2
} from 'lucide-react';
import { api } from '../api_firebase';
import { sendTelegramAlert } from '../telegram';

export default function AdminTab({ hospitals, selectedGroup, onReloadHospitals }) {
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
  const [manualMonth, setManualMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [manualHospital, setManualHospital] = useState('All');
  const [runningJob, setRunningJob] = useState(false);
  const [jobProgressMsg, setJobProgressMsg] = useState(null);
  const [aiProgress, setAiProgress] = useState(null);

  // Branch registration state
  const [newHospName, setNewHospName] = useState('');
  const [newHospEmail, setNewHospEmail] = useState('');
  const [newHospGroup, setNewHospGroup] = useState(selectedGroup || 'G.4.1');
  const [addingHosp, setAddingHosp] = useState(false);
  const [hospMessage, setHospMessage] = useState(null);

  // Settings state
  const [apiKey, setApiKey] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('-4852820114'); // Default from user
  const [savingKey, setSavingKey] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null);

  // Activity logs state
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [copiedLineMsg, setCopiedLineMsg] = useState(false);

  // Authentication state for Settings
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  const handleCopyLineSummary = async (targetGroup) => {
    try {
      const hospitalsList = await api.getHospitalsMap();
      const groupHospitals = hospitalsList.filter(h => h.group === targetGroup).map(h => h.name).filter(Boolean);
      
      const matchedAlerts = await api.getMatchedAlertsForHospital('all') || [];
      const pendingCounts = {};
      matchedAlerts.forEach(a => {
        const isComp = a.isCompleted || a.trackingStatus === 'เสร็จสิ้น';
        if (!isComp && (a.status === 'รอยืนยัน' || a.certifyStatus === 'รอยืนยัน' || !a.status)) {
          const h = a.hospitalName || a.hospital || a.Hospital_Name || '';
          if (h) pendingCounts[h] = (pendingCounts[h] || 0) + 1;
        }
      });

      const now = new Date();
      const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      const originUrl = (typeof window !== 'undefined' && window.location && window.location.origin) 
        ? window.location.origin 
        : 'https://ecri-fda-check.vercel.app';

      let msg = `🚨 แจ้งเตือนการเฝ้าระวังเครื่องมือแพทย์ (${targetGroup})\n`;
      msg += `📅 ประจำวันที่ ${dateStr} เวลา ${timeStr} น.\n\n`;

      groupHospitals.forEach((hName, index) => {
        const pendingCount = pendingCounts[hName] || 0;
        msg += `${index + 1}. ${hName}\n`;
        if (pendingCount > 0) {
          msg += `⏳ รายการรอยืนยันความเสี่ยง: ${pendingCount} รายการ\n\n`;
        } else {
          msg += `✅ สถานะปกติ (ไม่พบความเสี่ยงค้างรับรอง)\n\n`;
        }
      });

      msg += `🔗 ลิงก์เข้าสู่ระบบความปลอดภัย:\n${originUrl}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = msg;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopiedLineMsg(targetGroup);
      setTimeout(() => setCopiedLineMsg(null), 3000);
    } catch (e) {
      console.error("Copy LINE summary error:", e);
    }
  };

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
      const telegramVal = await api.getTelegramSettings();
      if (telegramVal) {
        setTelegramBotToken(telegramVal.botToken || '');
        if (telegramVal.chatId) setTelegramChatId(telegramVal.chatId);
      }
    } catch (err) {
      console.error("Error loading Telegram settings:", err);
    }
    
    try {
      const keyVal = await api.getGeminiApiKeySettings();
      if (typeof keyVal === 'string') {
        setApiKey(keyVal);
      } else if (keyVal && keyVal.key) {
        setApiKey(keyVal.key);
      }
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

  // Run matching for selected month
  const handleExecuteManualRunRange = async () => {
    if (!manualMonth) {
      setJobProgressMsg('⚠️ กรุณาระบุเดือนที่ต้องการรันครับ');
      return;
    }
    const [year, month] = manualMonth.split('-');
    const start = new Date(year, parseInt(month) - 1, 1);
    const end = new Date(year, parseInt(month), 0); // Last day of the month

    setRunningJob(true);
    setJobProgressMsg(`⏳ กำลังสั่งรันวิเคราะห์เปรียบเทียบข้อมูลของเดือน ${manualMonth} (เฉพาะสาขา: ${manualHospital === 'All' ? 'ทั้งหมด' : manualHospital})...`);

    try {
      // ส่ง setJobProgressMsg ไปให้ api_firebase อัปเดตสถานะแบบเรียลไทม์
      const res = await api.runMatchingJobForMonth(manualMonth, manualHospital, setJobProgressMsg);
      if (res && res.success) {
         setJobProgressMsg(`✅ ${res.message || 'รันวิเคราะห์ข้อมูลสำเร็จเรียบร้อย'}`);
      } else {
         setJobProgressMsg(`❌ เกิดข้อผิดพลาด: ${res?.message || 'ไม่ทราบสาเหตุ'}`);
      }
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
    setAiProgress(null);
    try {
      const res = await api.runMatchingJobForAllUnprocessed((current, total) => {
        setAiProgress({ current, total });
        setJobProgressMsg(`⏳ กำลังวิเคราะห์ AI... (${current}/${total})`);
      });
      if (res.success) {
        setJobProgressMsg({ type: 'success', text: `ทำงานเสร็จสิ้น: ${res.message || 'จับคู่สำเร็จ'} (พบเคสตรงกัน ${res.matchedCount || 0} รายการ)` });
      } else {
        setJobProgressMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${res.message}` });
      }
    } catch (err) {
      setJobProgressMsg({ type: 'error', text: err.toString() });
    } finally {
      setRunningJob(false);
      loadActivities();
    }
  };

  const handleResetMatches = async () => {
    if (!window.confirm("⚠️ คำเตือนสุดยอด!\nคุณแน่ใจหรือไม่ที่จะ 'ล้างผลการจับคู่ทั้งหมด' รวมถึงรีเซ็ตสถานะข่าวกรองทั้งหมดให้กลับไปเป็น 'ยังไม่ได้ประมวลผล'?\n\n- ข้อมูลเครื่องมือแพทย์จะไม่หาย\n- ข่าว ECRI/FDA ต้นฉบับจะไม่หาย\n- เฉพาะ 'รายการที่เคยกดรอยืนยัน/ตรวจสอบแล้ว' จะหายหมด!\n\nกด OK เพื่อยืนยันการล้างข้อมูล")) return;

    setRunningJob(true);
    setJobProgressMsg({ type: 'info', text: 'กำลังล้างข้อมูลผลการจับคู่ทั้งหมดและรีเซ็ตข่าว... อาจใช้เวลาสักครู่' });
    try {
      const res = await api.resetAllMatches();
      if (res.success) {
        setJobProgressMsg({ type: 'success', text: res.message });
      } else {
        setJobProgressMsg({ type: 'error', text: res.message });
      }
    } catch (err) {
      setJobProgressMsg({ type: 'error', text: err.toString() });
    } finally {
      setRunningJob(false);
    }
  };

  const handleAddHospital = async (e) => {
    e.preventDefault();
    if (!newHospName.trim()) return;
    setAddingHosp(true);
    try {
      const res = await api.addHospitalToList(newHospName.trim(), newHospEmail.trim(), newHospGroup);
      if (res.success) {
        setHospMessage({ type: 'success', text: res.message });
        setNewHospName('');
        setNewHospEmail('');
        onReloadHospitals();
      } else {
        setHospMessage({ type: 'error', text: res.message || 'เพิ่มสาขาไม่สำเร็จ' });
      }
    } catch (err) {
      setHospMessage({ type: 'error', text: 'Error: ' + err.toString() });
    } finally {
      setAddingHosp(false);
    }
  };

  const handleDeleteDevices = async (hName) => {
    if (!window.confirm(`⚠️ คำเตือน!\nคุณแน่ใจหรือไม่ที่จะลบทิ้งทะเบียนเครื่องมือแพทย์ทั้งหมดของ "${hName}"?\n(หากคุณอัปโหลดไฟล์ผิดสาขา ให้ลบทิ้งที่นี่แล้วไปอัปโหลดใหม่)`)) return;
    
    setHospMessage({ type: 'info', text: 'กำลังลบข้อมูล... กรุณารอสักครู่' });
    try {
      const res = await api.deleteDevicesByHospital(hName);
      if (res.success) {
        setHospMessage({ type: 'success', text: res.message });
      } else {
        setHospMessage({ type: 'error', text: res.message });
      }
    } catch (err) {
      setHospMessage({ type: 'error', text: 'Error: ' + err.toString() });
    }
  };

  const handleChangeGroup = async (hName, hospId, newGroup) => {
    if (!window.confirm(`ยืนยันการย้าย ${hName} ไปยังกลุ่ม ${newGroup}? (โรงพยาบาลจะหายไปจากหน้านี้หากย้ายไปกลุ่มอื่น)`)) return;
    setHospMessage({ type: 'info', text: `กำลังย้าย ${hName} ไปยัง ${newGroup}...` });
    try {
      const res = await api.updateHospitalGroup(hospId, newGroup);
      if (res.success) {
        setHospMessage({ type: 'success', text: `ย้าย ${hName} เรียบร้อยแล้ว` });
        onReloadHospitals();
      } else {
        setHospMessage({ type: 'error', text: res.message });
      }
    } catch (e) {
      setHospMessage({ type: 'error', text: e.toString() });
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

  const handleSaveTelegram = async () => {
    setSavingTelegram(true);
    setSettingsMsg(null);
    try {
      const res = await api.saveTelegramSettings(telegramBotToken.trim(), telegramChatId.trim());
      if (res && res.success !== false) {
        setSettingsMsg({ type: 'success', text: res.message || 'บันทึกการตั้งค่า Telegram สำเร็จ' });
      } else {
        setSettingsMsg({ type: 'error', text: res?.message || 'ไม่สามารถบันทึกได้' });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.message || err.toString() });
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setSettingsMsg({ type: 'info', text: 'กำลังส่งข้อความสรุปล่าสุดไปยัง Telegram...' });
    try {
      let msg = await api.getLatestAlertMessage();
      if (!msg) {
        const hospitalsList = hospitals && hospitals.length > 0 ? hospitals : await api.getHospitalsMap();
        const allHospitals = hospitalsList.map(h => h.name).filter(Boolean);
        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const originUrl = 'https://ecri-fda-check.vercel.app';
        msg = `🚨 แจ้งเตือนการเฝ้าระวังเครื่องมือแพทย์ (ECRI & FDA)\n`;
        msg += `📅 ประจำวันที่ ${dateStr} เวลา ${timeStr} น.\n\n`;
        allHospitals.forEach((hName, index) => {
          msg += `${index + 1}. ${hName}\n✅ สถานะปกติ (ไม่พบความเสี่ยงค้างรับรอง)\n\n`;
        });
        msg += `🔗 ลิงก์เข้าสู่ระบบความปลอดภัย:\n${originUrl}`;
      }

      const res = await sendTelegramAlert(msg, '');
      if (res && res.success !== false) {
        setSettingsMsg({ type: 'success', text: 'ส่งข้อความแจ้งเตือนล่าสุดเข้า Telegram สำเร็จแล้ว!' });
      } else {
        setSettingsMsg({ type: 'error', text: `ส่งไม่สำเร็จ: ${res?.message || 'โปรดตรวจสอบ Bot Token และ Chat ID'}` });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.toString() });
    } finally {
      setTestingTelegram(false);
    }
  };
  const changeCalendarMonth = (offset) => {
    const newDate = new Date(calendarDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCalendarDate(newDate);
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
      const isSelected = manualMonth === dateStr.substring(0, 7);

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

        <div className="space-y-4">
          <div className="flex gap-4">
            <label 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  setUploadType('admin_ecri');
                  setUploadFile(e.dataTransfer.files[0]);
                }
              }}
              className={`flex-1 drag-area rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer text-center border-2 border-dashed transition ${
                uploadType === 'admin_ecri'
                  ? 'border-blue-500 bg-blue-50 shadow-inner'
                  : 'border-slate-200 hover:border-blue-300 bg-white'
              }`}
            >
              <FileSpreadsheet className={`w-8 h-8 mb-2 ${uploadType === 'admin_ecri' ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className={`text-xs font-bold ${uploadType === 'admin_ecri' ? 'text-blue-800' : 'text-slate-600'}`}>
                📰 ลากไฟล์ ECRI วางที่นี่
              </span>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  setUploadType('admin_ecri');
                  handleFileChange(e);
                }}
                className="hidden"
              />
            </label>

            <label 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  setUploadType('admin_fda');
                  setUploadFile(e.dataTransfer.files[0]);
                }
              }}
              className={`flex-1 drag-area rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer text-center border-2 border-dashed transition ${
                uploadType === 'admin_fda'
                  ? 'border-rose-500 bg-rose-50 shadow-inner'
                  : 'border-slate-200 hover:border-rose-300 bg-white'
              }`}
            >
              <FileSpreadsheet className={`w-8 h-8 mb-2 ${uploadType === 'admin_fda' ? 'text-rose-600' : 'text-slate-400'}`} />
              <span className={`text-xs font-bold ${uploadType === 'admin_fda' ? 'text-rose-800' : 'text-slate-600'}`}>
                🏛️ ลากไฟล์ FDA วางที่นี่
              </span>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  setUploadType('admin_fda');
                  handleFileChange(e);
                }}
                className="hidden"
              />
            </label>
          </div>

          {uploadFile && (
            <div className="text-center p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium">
              ไฟล์ที่เลือก: <span className="font-bold text-slate-900">{uploadFile.name}</span> ({(uploadFile.size / 1024).toFixed(1)} KB) - {uploadType === 'admin_ecri' ? 'เป้าหมาย: ข่าวเตือนภัย ECRI' : 'เป้าหมาย: ข่าวเรียกคืน FDA'}
            </div>
          )}

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

          <div className="space-y-2">
            <button
              onClick={handleUploadAlertFile}
              disabled={!uploadFile || uploading || runningJob}
              className="w-full py-2.5 btn-gradient-blue text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{uploading ? 'กำลังประมวลผลข้อมูล...' : 'บันทึกเข้าคลังข้อมูลสะสมส่วนกลาง'}</span>
            </button>

            <div className="flex gap-2">
              <button 
                onClick={handleExecuteBulkManualRun}
                disabled={runningJob || uploading}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold py-2.5 px-6 rounded-xl text-xs transition shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 relative overflow-hidden"
              >
                {runningJob && aiProgress && aiProgress.total > 0 && (
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300 ease-out" 
                    style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%` }}
                  ></div>
                )}
                <Zap className={`w-4 h-4 ${runningJob ? 'animate-spin' : ''} relative z-10`} />
                <span className="relative z-10">
                  {runningJob && aiProgress && aiProgress.total > 0
                    ? `⚡ กำลังรัน AI (${aiProgress.current}/${aiProgress.total})...`
                    : '⚡ สั่งรัน AI'
                  }
                </span>
              </button>
            </div>
          </div>
          
          {jobProgressMsg && (
            <div className={`p-3.5 rounded-xl text-xs font-mono border ${
              typeof jobProgressMsg === 'string' ? 'bg-slate-900 text-emerald-400 border-slate-800' :
              jobProgressMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
              'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              {typeof jobProgressMsg === 'string' ? jobProgressMsg : jobProgressMsg.text}
            </div>
          )}
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="glass-panel rounded-2xl p-8 bg-white/80 space-y-4 text-center max-w-md mx-auto mt-8 border border-slate-200 shadow-sm">
          <KeyRound className="w-12 h-12 text-blue-500 mx-auto mb-2 opacity-80" />
          <h3 className="text-sm font-extrabold text-slate-800">เข้าสู่ระบบเพื่อจัดการการตั้งค่า</h3>
          <p className="text-xs text-slate-500 mb-4">โปรดใส่รหัสผ่านเพื่อแสดงส่วนจัดการสาขาและตั้งค่าระบบ (คำใบ้: เลข 6 หลัก)</p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="รหัสผ่าน"
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && adminPasswordInput === '465321') {
                  setIsAuthenticated(true);
                } else if (e.key === 'Enter') {
                  alert('รหัสผ่านไม่ถูกต้อง');
                }
              }}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono text-center font-bold text-slate-700 outline-none focus:border-blue-500"
            />
            <button
              onClick={() => {
                if (adminPasswordInput === '465321') setIsAuthenticated(true);
                else alert('รหัสผ่านไม่ถูกต้อง');
              }}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              ยืนยัน
            </button>
          </div>
        </div>
      ) : (
        <>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              <select
                value={newHospGroup}
                onChange={(e) => setNewHospGroup(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="G.4.1">กลุ่ม G.4.1</option>
                <option value="G.4.2">กลุ่ม G.4.2</option>
              </select>
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
                  <div className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                    {h.name}
                    <select
                      value={h.group || 'G.4.1'}
                      onChange={(e) => handleChangeGroup(h.name, h.id, e.target.value)}
                      className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded text-[9px] font-black outline-none cursor-pointer"
                    >
                      <option value="G.4.1">G.4.1 (เหนือ)</option>
                      <option value="G.4.2">G.4.2 (อีสาน)</option>
                    </select>
                  </div>
                  <span className="text-[10px] text-slate-400">{h.email || 'ไม่มีอีเมล'}</span>
                </div>
                <button
                  onClick={() => handleDeleteDevices(h.name)}
                  className="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 font-bold transition flex items-center gap-1"
                  title="ลบข้อมูลเครื่องมือแพทย์ของสาขานี้"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ลบอุปกรณ์
                </button>
                <span className="text-[10px] text-slate-500 font-semibold bg-slate-50 px-2 py-1 rounded-lg">
                  อัปเดต: {h.lastUploadTime || 'ยังไม่มีการอัปโหลด'}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400 mt-2 px-1">
            *คุณสามารถเปลี่ยนกลุ่มของโรงพยาบาลได้โดยเลือกจาก Dropdown <br/>(หากเปลี่ยนกลุ่ม โรงพยาบาลจะถูกย้ายออกจากหน้านี้ทันที)
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

            <div className="space-y-1.5 pt-3 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>Telegram Notification Settings:</span>
              </label>
              
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="Telegram Bot Token (เช่น 123456:ABC-DEF)"
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                  />
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="Group Chat ID (เช่น -4852820114)"
                    className="flex-1 min-w-[180px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSaveTelegram}
                    disabled={savingTelegram || testingTelegram}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {savingTelegram ? 'บันทึก...' : 'บันทึก Telegram'}
                  </button>
                  <button
                    onClick={handleTestTelegram}
                    disabled={savingTelegram || testingTelegram || !telegramBotToken || !telegramChatId}
                    className="px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
                    title="ทดสอบส่งข้อความแจ้งเตือนล่าสุดเข้ากลุ่ม Telegram"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{testingTelegram ? 'กำลังส่ง...' : 'ทดสอบส่งข้อความล่าสุด'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">ระบบจะจำข้อความสรุปล่าสุดจากการรัน AI และส่งสรุปรายงานเข้ากลุ่ม Telegram อัตโนมัติ (และสามารถคัดลอกลง LINE ได้ที่หัวข้อประวัติกิจกรรม)</p>
              </div>
            </div>

            <div className="space-y-1.5 pt-3 border-t border-rose-100 mt-4">
              <label className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                <span>อันตราย! (Danger Zone):</span>
              </label>
              <button 
                onClick={handleResetMatches}
                disabled={runningJob || uploading}
                className="w-full bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-extrabold py-2.5 px-6 rounded-xl text-xs transition shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>ล้างข้อมูลผลการจับคู่ทั้งหมด (Reset)</span>
              </button>
              <p className="text-[10px] text-rose-400 leading-tight">ปุ่มนี้จะรีเซ็ตสถานะข่าวทั้งหมด และล้างเคสที่ตรวจพบทั้งหมด (ไม่ส่งผลกระทบต่อรายการเครื่องมือแพทย์และรายการข่าวต้นฉบับ)</p>
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
              <span>🛠️ สั่งรันวิเคราะห์ความปลอดภัยย้อนหลัง (เลือกทีละเดือน และระบุสาขาได้)</span>
            </h4>
            
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-bold whitespace-nowrap">เดือน/ปี:</span>
                  <input
                    type="month"
                    value={manualMonth}
                    onChange={(e) => setManualMonth(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-bold whitespace-nowrap">สาขา:</span>
                  <select
                    value={manualHospital}
                    onChange={(e) => setManualHospital(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="All">ดึงข้อมูลทุกสาขา (All)</option>
                    {hospitals && hospitals.map((h, i) => (
                      <option key={i} value={h.name}>{h.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleExecuteManualRunRange}
                  disabled={runningJob}
                  className="btn-gradient-blue text-white font-bold py-2.5 px-5 rounded-xl text-xs transition whitespace-nowrap shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {runningJob ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{runningJob ? 'กำลังรัน...' : '🚀 สั่งรันตรวจจับคู่'}</span>
                </button>
              </div>
              
              {/* Show Progress Message specific to Manual Run */}
              {jobProgressMsg && (
                <div className={`p-3 rounded-xl text-xs font-mono border mt-2 ${
                  typeof jobProgressMsg === 'string' ? 'bg-slate-900 text-emerald-400 border-slate-800' :
                  jobProgressMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                  'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {typeof jobProgressMsg === 'string' ? jobProgressMsg : jobProgressMsg.text}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* 4. Activity Logs Section */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-sky-100 pb-3 gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              4. บันทึกกิจกรรมล่าสุดของระบบ (System Activity Logs)
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleCopyLineSummary('G.4.1')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm border ${
                copiedLineMsg === 'G.4.1'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
              }`}
              title="คัดลอกข้อความสรุปสถานะกลุ่ม G.4.1 สำหรับส่งต่อทาง LINE"
            >
              {copiedLineMsg === 'G.4.1' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLineMsg === 'G.4.1' ? 'คัดลอก G.4.1 แล้ว!' : '📋 คัดลอกส่ง LINE (G.4.1)'}</span>
            </button>
            <button
              onClick={() => handleCopyLineSummary('G.4.2')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm border ${
                copiedLineMsg === 'G.4.2'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
              }`}
              title="คัดลอกข้อความสรุปสถานะกลุ่ม G.4.2 สำหรับส่งต่อทาง LINE"
            >
              {copiedLineMsg === 'G.4.2' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLineMsg === 'G.4.2' ? 'คัดลอก G.4.2 แล้ว!' : '📋 คัดลอกส่ง LINE (G.4.2)'}</span>
            </button>
            <button
              onClick={loadActivities}
              className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              รีเฟรชประวัติ
            </button>
          </div>
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
