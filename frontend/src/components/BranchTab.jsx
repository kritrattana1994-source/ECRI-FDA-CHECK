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
import { api } from '../api';

export default function BranchTab({ 
  hospitals, 
  selectedBranch, 
  setSelectedBranch,
  onOpenAiModal,
  onOpenCertifyModal,
  onOpenActionModal
}) {
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [matchedAlerts, setMatchedAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showRefreshNotice, setShowRefreshNotice] = useState(false);

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
    try {
      const alerts = await api.getMatchedAlertsForHospital(selectedBranch);
      setMatchedAlerts(Array.isArray(alerts) ? alerts : []);
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
    setUploadMessage({ type: 'info', text: `กำลังนำเข้าไฟล์ทะเบียนเครื่องมือแพทย์ของ ${selectedBranch}...` });

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileData = {
          name: uploadFile.name,
          data: e.target.result,
        };
        const res = await api.saveDevicesToDatabase(fileData, selectedBranch);
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
      }
    };
    reader.readAsDataURL(uploadFile);
  };

  const filteredAlerts = matchedAlerts.filter(item => {
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
                setShowRefreshNotice(true);
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

          {showRefreshNotice && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 shadow-sm animate-pulse">
              <span>⚠️</span>
              <span>เลือกสาขาแล้ว: กรุณากดปุ่ม <strong>"รีเฟรชรายการ"</strong> เพื่ออัปเดตข้อมูลสด</span>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setShowRefreshNotice(false);
            loadBranchAlerts();
          }}
          disabled={loadingAlerts}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50 active:scale-[0.98] shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingAlerts ? 'animate-spin' : ''}`} />
          <span>{loadingAlerts ? 'กำลังดึงข้อมูลสด...' : '🔄 รีเฟรชรายการ'}</span>
        </button>
      </div>

      {/* 2. Upload Branch Devices Excel */}
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex items-center gap-2 border-b border-sky-100 pb-3">
          <UploadCloud className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-extrabold text-slate-800">
            อัปโหลดทะเบียนเครื่องมือแพทย์ของสาขา {selectedBranch || ''}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2">
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
          </div>

          <div>
            <button
              onClick={handleUploadDevices}
              disabled={!uploadFile || uploading || !selectedBranch}
              className="w-full py-3.5 btn-gradient-blue text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{uploading ? 'กำลังนำเข้าครุภัณฑ์...' : 'นำเข้าข้อมูลเข้าสาขา'}</span>
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
              พบ {filteredAlerts.length} รายการ
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหารหัส, ชื่อเครื่องมือ, ยี่ห้อ, รุ่น..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 w-64 shadow-sm"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-3">รหัสเครื่อง / ชื่อเครื่องมือแพทย์</th>
                <th className="p-3">ยี่ห้อ / รุ่น / แผนก</th>
                <th className="p-3">แหล่งข่าว & รหัส</th>
                <th className="p-3">หัวข้อแจ้งเตือนภัย</th>
                <th className="p-3 text-center">วิเคราะห์ AI</th>
                <th className="p-3 text-center">สถานะรับรอง</th>
                <th className="p-3 text-center">จัดการเคส</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingAlerts ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    กำลังโหลดข้อมูลการจับคู่ความเสี่ยง...
                  </td>
                </tr>
              ) : filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    ไม่พบรายการเครื่องมือแพทย์ที่ตรงกับประกาศเตือนภัยในสาขานี้
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((item, index) => {
                  const statusVal = item.status || item.certifyStatus || 'รอยืนยัน';
                  const isCertified = statusVal === 'จริง' || statusVal === 'รับรองแล้ว';
                  const isRejected = statusVal === 'เท็จ' || statusVal === 'ปฏิเสธ';
                  const certName = item.certifiedBy || item.certifier;
                  const certDate = item.certifyDate;
                  const toolDisplayName = item.toolName || item.thaiName || item.deviceType || item.assetId || '-';

                  return (
                    <tr key={index} className="hover:bg-sky-50/40 transition">
                      <td className="p-3 font-bold text-slate-800">
                        <div className="font-mono text-blue-700">{item.deviceCode}</div>
                        <div className="text-[11px] text-slate-600 font-medium mt-0.5 leading-snug" title={toolDisplayName}>
                          {toolDisplayName}
                        </div>
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
                        <div className="font-mono text-[10px] text-slate-500 font-bold">{item.alertId}</div>
                      </td>
                      <td className="p-3 max-w-xs">
                        <p className="text-xs font-semibold text-slate-800 line-clamp-2" title={item.alertHeadline || item.headline}>
                          {item.alertHeadline || item.headline || 'ประกาศแจ้งเตือนความปลอดภัย'}
                        </p>
                        <span className="text-[10px] text-slate-400">ประกาศเมื่อ: {item.alertDate || '-'}</span>
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
                          isCertified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          isRejected ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {isCertified ? '✔️ รับรองแล้ว (จริง)' : isRejected ? '❌ ปฏิเสธ (เท็จ)' : '⏳ รอตรวจสอบ'}
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
                            onClick={() => onOpenCertifyModal(item, selectedBranch, loadBranchAlerts)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm"
                            title="รับรองผลการตรวจสอบ"
                          >
                            <FileCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onOpenActionModal(item, selectedBranch, loadBranchAlerts)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm"
                            title="บันทึกการดำเนินการแก้ไข"
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
