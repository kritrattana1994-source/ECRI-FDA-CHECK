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
  Sparkles
} from 'lucide-react';
import { api } from '../api';

export default function AdminTab({ hospitals, onReloadHospitals }) {
  // Alert upload state
  const [uploadType, setUploadType] = useState('admin_ecri'); // 'admin_ecri' or 'admin_fda'
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Matching job state
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
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

  useEffect(() => {
    // Load initial settings and logs
    api.getAdminEmailSettings().then(setAdminEmail).catch(() => {});
    api.getGeminiApiKeySettings().then(setApiKey).catch(() => {});
    loadActivities();
  }, []);

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

  const handleRunManualDate = async () => {
    if (!manualDate) return;
    setRunningJob(true);
    setJobProgressMsg(`กำลังประมวลผลวันที่ ${manualDate}...`);
    try {
      const res = await api.runMatchingJobForDate(manualDate);
      setJobProgressMsg(`เสร็จสิ้น: ${res.message || 'ประมวลผลสำเร็จ'}`);
      loadActivities();
    } catch (err) {
      setJobProgressMsg(`เกิดข้อผิดพลาด: ${err.toString()}`);
    } finally {
      setRunningJob(false);
    }
  };

  const handleRunAllUnprocessed = async () => {
    if (!confirm('ต้องการเริ่มรันตรวจจับความเสี่ยงทุกวันที่ยังค้างอยู่ใช่หรือไม่?')) return;
    setRunningJob(true);
    setJobProgressMsg('กำลังค้นหาและประมวลผลเคสที่ตกค้างทั้งหมด...');
    try {
      const res = await api.runMatchingJobForAllUnprocessed();
      setJobProgressMsg(`เสร็จสิ้น: ${res.message || 'ประมวลผลข้อมูลสำเร็จ'}`);
      loadActivities();
    } catch (err) {
      setJobProgressMsg(`เกิดข้อผิดพลาด: ${err.toString()}`);
    } finally {
      setRunningJob(false);
    }
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
    try {
      const res = await api.saveGeminiApiKey(apiKey.trim());
      setSettingsMsg({ type: 'success', text: 'บันทึก API Key สำเร็จ' });
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.toString() });
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    try {
      const res = await api.saveAdminEmailSettings(adminEmail.trim());
      setSettingsMsg({ type: 'success', text: 'บันทึกอีเมลผู้ดูแลระบบสำเร็จ' });
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.toString() });
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <div className="space-y-6 pt-2">
      {/* 1. Upload Section & Matching Runners */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Alerts Excel */}
        <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
          <div className="flex items-center justify-between border-b border-sky-100 pb-3">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-extrabold text-slate-800">
                นำเข้าข้อมูลเตือนภัยจากแหล่งข่าว (ECRI & FDA)
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

        {/* AI Risk Matching Runners */}
        <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-sky-100 pb-3">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-extrabold text-slate-800">
              สั่งประมวลผลจับคู่ความเสี่ยง (AI Matching Jobs)
            </h3>
          </div>

          <div className="space-y-4">
            <div className="bg-sky-50/50 p-4 rounded-xl border border-sky-100 space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                1. รันตรวจจับความเสี่ยงเฉพาะวันที่:
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleRunManualDate}
                  disabled={runningJob}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>เริ่มรัน</span>
                </button>
              </div>
            </div>

            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700">
                  2. รันตรวจจับทุกวันที่ยังค้างอยู่ (Run All Unprocessed):
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                ระบบจะตรวจสอบวันที่ประกาศในคลังข่าวที่ยังไม่มีบันทึกการจับคู่ และประมวลผลให้อัตโนมัติ
              </p>
              <button
                onClick={handleRunAllUnprocessed}
                disabled={runningJob}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RotateCcw className={`w-4 h-4 ${runningJob ? 'animate-spin' : ''}`} />
                <span>เริ่มประมวลผลทั้งหมด</span>
              </button>
            </div>

            {jobProgressMsg && (
              <div className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono">
                {jobProgressMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Registered Hospitals & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hospital Registry Manager */}
        <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-sky-100 pb-3">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              ทะเบียนรายชื่อโรงพยาบาลสาขา ({hospitals.length})
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
              ตั้งค่าคีย์ระบบและผู้ดูแล (Configurations)
            </h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                <span>OpenRouter / Gemini API Key:</span>
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

      {/* 3. Recent Activity Timeline */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex items-center justify-between border-b border-sky-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-800">
              บันทึกกิจกรรมล่าสุดของระบบ (System Activity Logs)
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
