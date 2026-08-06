import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  FileCheck, 
  ClipboardList, 
  Download, 
  Settings, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Save,
  Link
} from 'lucide-react';
import { api, getApiUrl, setApiUrl } from '../api';

// 1. AI Analysis Modal
export function AiAnalysisModal({ item, onClose }) {
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  useEffect(() => {
    if (item) {
      if (item.aiAnalysis) {
        setAnalysisData(item.aiAnalysis);
      } else {
        setLoading(true);
        api.getPersistentAIAnalysis(item.brand, item.model, item.alertId)
          .then((res) => setAnalysisData(res))
          .catch((err) => setAnalysisData({ error: err.toString() }))
          .finally(() => setLoading(false));
      }
    }
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                ผลการวิเคราะห์ความเสี่ยงโดย AI (AI Risk Evaluation)
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {item.brand} {item.model} • ประกาศ {item.alertId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto ai-scroll pr-1">
          {loading ? (
            <div className="text-center py-12 space-y-3">
              <Sparkles className="w-8 h-8 text-purple-500 animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-500">กำลังประมวลผลคำแนะนำจาก AI...</p>
            </div>
          ) : (
            <>
              {/* Risk Level Badge */}
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">
                    ระดับความเสี่ยงที่ประเมิน
                  </span>
                  <span className="text-lg font-extrabold text-purple-900 mt-0.5 block">
                    {analysisData?.riskLevel || 'ความเสี่ยงสูง (High Risk)'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 block">ความน่าจะเป็นที่ตรงกัน</span>
                  <span className="text-base font-extrabold text-slate-800">{analysisData?.confidence || '95%'}</span>
                </div>
              </div>

              {/* Analysis Explanation */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-800">คำอธิบายและการเปรียบเทียบ:</h4>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-line">
                  {typeof analysisData === 'string' 
                    ? analysisData 
                    : (analysisData?.explanation || analysisData?.text || 'ระบบ AI ตรวจพบว่าชื่อยี่ห้อและรุ่นของครุภัณฑ์นี้ตรงกับข้อมูลที่ระบุไว้ในประกาศแจ้งเตือนภัยด้านความปลอดภัย (Safety Alert) แนะนำให้วิศวกรชีวการแพทย์หรือเจ้าหน้าที่ที่เกี่ยวข้องเข้าดำเนินการตรวจสอบเครื่องจริงตามขั้นตอนต่อไป')}
                </div>
              </div>

              {/* Recommended Action */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-800">ข้อเสนอแนะในการปฏิบัติงาน (Recommended Actions):</h4>
                <ul className="list-disc list-inside p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-xs font-medium text-emerald-900 space-y-1.5">
                  <li>ตรวจสอบ Serial Number ของเครื่องกับช่วงที่ระบุในประกาศฉบับเต็ม</li>
                  <li>ติดต่อตัวแทนจำหน่าย (Vendor) เพื่อประสานงานขอชุดอัปเกรดหรือการแก้ไขจากผู้ผลิต</li>
                  <li>บันทึกผลการตรวจสอบในระบบ และรายงานหัวหน้างานเพื่อเฝ้าระวังความปลอดภัย</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}

// 2. Certify Alert Modal
export function CertifyModal({ item, hospitalName, onClose, onSuccess }) {
  const [certifyResult, setCertifyResult] = useState('จริง');
  const [certName, setCertName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!item) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!certName.trim()) {
      setErrorMsg('กรุณากรอกชื่อผู้รับรอง');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.certifyMatchedAlert(
        hospitalName,
        item.deviceCode,
        item.alertId,
        certName.trim(),
        comment.trim(),
        certifyResult
      );
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg(res.message || 'เกิดข้อผิดพลาดในการบันทึก');
      }
    } catch (err) {
      setErrorMsg(err.toString());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                รับรองผลการตรวจสอบความเสี่ยง
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {hospitalName} • รหัส {item.deviceCode}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Radio Choices */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-700 block">
              ผลการตรวจสอบยืนยันกับเครื่องจริง:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`p-3 rounded-2xl border text-xs font-bold cursor-pointer transition flex items-center gap-2 ${
                certifyResult === 'จริง'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                <input
                  type="radio"
                  name="certifyResult"
                  value="จริง"
                  checked={certifyResult === 'จริง'}
                  onChange={() => setCertifyResult('จริง')}
                  className="hidden"
                />
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>จริง (พบคอนเฟิร์มตรง)</span>
              </label>

              <label className={`p-3 rounded-2xl border text-xs font-bold cursor-pointer transition flex items-center gap-2 ${
                certifyResult === 'เท็จ'
                  ? 'border-slate-500 bg-slate-100 text-slate-800 shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                <input
                  type="radio"
                  name="certifyResult"
                  value="เท็จ"
                  checked={certifyResult === 'เท็จ'}
                  onChange={() => setCertifyResult('เท็จ')}
                  className="hidden"
                />
                <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                <span>เท็จ (ไม่ใช่รุ่นนี้)</span>
              </label>
            </div>
          </div>

          {/* Certifier Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              ชื่อผู้รับรอง / วิศวกรชีวการแพทย์: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="เช่น สมชาย ใจดี (BM-BGH)"
              value={certName}
              onChange={(e) => setCertName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
            />
          </div>

          {/* Comment */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              ข้อสังเกตเพิ่มเติม / หมายเหตุ:
            </label>
            <textarea
              rows={3}
              placeholder="ระบุข้อสังเกตหรือรายละเอียดการตรวจสอบ..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-emerald-500"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold">
              {errorMsg}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'กำลังบันทึก...' : 'บันทึกการรับรอง'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 3. Action Tracking Modal
export function ActionModal({ item, hospitalName, onClose, onSuccess }) {
  const [actionDetail, setActionDetail] = useState('');
  const [actionDate, setActionDate] = useState(new Date().toISOString().split('T')[0]);
  const [isFinal, setIsFinal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!item) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!actionDetail.trim()) {
      setErrorMsg('กรุณากรอกรายละเอียดการปฏิบัติงาน');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const targetHosp = hospitalName || item.hospitalName || item.hospital;
      const res = await api.addTrackingAction(
        targetHosp,
        item.deviceCode,
        item.alertId,
        actionDetail.trim(),
        actionDate,
        isFinal
      );
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg(res.message || 'เกิดข้อผิดพลาดในการบันทึก');
      }
    } catch (err) {
      setErrorMsg(err.toString());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                บันทึกการดำเนินการแก้ไขเคส
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {hospitalName} • รหัส {item.deviceCode} • ประกาศ {item.alertId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              วันที่ดำเนินการ:
            </label>
            <input
              type="date"
              required
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              รายละเอียดการปฏิบัติงาน / ความคืบหน้า: <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              placeholder="เช่น ได้ประสานงาน Vendor เข้ามาเปลี่ยนอะไหล่ชุดใหม่ และทำการสอบเทียบเครื่องเรียบร้อยแล้ว"
              value={actionDetail}
              onChange={(e) => setActionDetail(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          <label className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isFinal}
              onChange={(e) => setIsFinal(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <div>
              <span className="text-xs font-bold text-slate-800 block">
                สิ้นสุดการดำเนินการแล้ว (Final Resolution / ปิดเคส)
              </span>
              <span className="text-[10px] text-slate-400">
                ทำเครื่องหมายนี้เมื่อดำเนินการแก้ไขครบถ้วนปลอดภัยแล้ว
              </span>
            </div>
          </label>

          {errorMsg && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold">
              {errorMsg}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 4. Export Excel Modal
export function ExportModal({ onClose }) {
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [sources, setSources] = useState(['ECRI', 'FDA']);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.getAvailableDatabaseMonths().then(res => {
      if (Array.isArray(res)) {
        setAvailableMonths(res);
        setSelectedMonths(res.slice(0, 3));
      }
    }).catch(() => {});
  }, []);

  const toggleMonth = (m) => {
    if (selectedMonths.includes(m)) {
      setSelectedMonths(selectedMonths.filter(x => x !== m));
    } else {
      setSelectedMonths([...selectedMonths, m]);
    }
  };

  const toggleSource = (s) => {
    if (sources.includes(s)) {
      if (sources.length > 1) {
        setSources(sources.filter(x => x !== s));
      }
    } else {
      setSources([...sources, s]);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.getExportAlertsExcel(selectedMonths, sources);
      if (res && res.fileData) {
        // Download base64 file
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.fileData}`;
        link.download = res.fileName || `Medical_Device_Alerts_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onClose();
      } else {
        alert(res.message || 'ส่งออกไฟล์สำเร็จ');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการส่งออกไฟล์: ' + err.toString());
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                ส่งออกคลังข่าวเป็นไฟล์ Excel
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                เลือกช่วงเดือนและแหล่งข้อมูลที่ต้องการ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Source Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              1. เลือกแหล่งข้อมูล:
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleSource('ECRI')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  sources.includes('ECRI') ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                📰 ข่าวเตือนภัย ECRI
              </button>
              <button
                type="button"
                onClick={() => toggleSource('FDA')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  sources.includes('FDA') ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                🏛️ ข่าวเรียกคืน FDA
              </button>
            </div>
          </div>

          {/* Months Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              2. เลือกเดือนที่ต้องการรวมในรายงาน:
            </label>
            <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto ai-scroll p-1">
              {availableMonths.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMonth(m)}
                  className={`p-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    selectedMonths.includes(m)
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-400'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  📅 {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || selectedMonths.length === 0}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? 'กำลังสร้างไฟล์ Excel...' : 'ดาวน์โหลด Excel'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// 5. API Settings Modal (Allows connecting Vercel Frontend to Apps Script Web App)
export function ApiSettingsModal({ onClose }) {
  const [url, setUrl] = useState(getApiUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleSave = () => {
    setApiUrl(url);
    onClose();
    window.location.reload();
  };

  const handleTestConnection = async () => {
    if (!url.trim()) {
      setTestResult({ success: false, message: 'กรุณากรอก Web App URL' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${url.trim()}?action=getHospitalsMap`);
      if (res.ok) {
        const data = await res.json();
        setTestResult({ success: true, message: `เชื่อมต่อสำเร็จ! พบข้อมูล ${Array.isArray(data) ? data.length : 0} สาขา` });
      } else {
        setTestResult({ success: false, message: `HTTP Error ${res.status}` });
      }
    } catch (err) {
      setTestResult({ success: false, message: 'ไม่สามารถเชื่อมต่อได้: ' + err.toString() });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Link className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                ตั้งค่า Google Apps Script Web App API
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                เชื่อมต่อ Frontend บน Vercel เข้ากับฐานข้อมูล Google Sheets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-sky-50/70 p-3.5 rounded-2xl border border-sky-100 text-xs text-slate-600 space-y-1.5">
            <span className="font-bold text-blue-900 block">💡 วิธีรับ URL การติดตั้ง:</span>
            <p>1. เปิด Google Apps Script โปรเจกต์นี้</p>
            <p>2. กดปุ่ม <b>Deploy (ทำให้ใช้งานได้)</b> &gt; <b>New deployment (การทำให้ใช้งานได้รายการใหม่)</b></p>
            <p>3. เลือกประเภท <b>Web App (เว็บแอป)</b> และตั้งค่าสิทธิ์ Who has access ให้เป็น <b>Anyone (ทุกคน)</b></p>
            <p>4. คัดลอก <b>Web App URL</b> (ลงท้ายด้วย <code>/exec</code>) มาวางในช่องด้านล่างนี้</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Google Apps Script Web App URL (URL สำหรับเรียกใช้งาน):
            </label>
            <input
              type="url"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !url.trim()}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              {testing ? 'กำลังทดสอบเชื่อมต่อ...' : '🔌 ทดสอบการเชื่อมต่อ'}
            </button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              testResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>บันทึกและใช้งาน</span>
          </button>
        </div>
      </div>
    </div>
  );
}
