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
  Link,
  Printer
} from 'lucide-react';
import { api, getApiUrl, setApiUrl } from '../api_firebase';

// 1. AI Analysis Modal
export function AiAnalysisModal({ item, onClose }) {
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  useEffect(() => {
    if (item) {
      if (item.aiAnalysis && typeof item.aiAnalysis === 'object' && item.aiAnalysis.summary && item.aiAnalysis.symptoms) {
        setAnalysisData(item.aiAnalysis);
      } else {
        setLoading(true);
        api.getPersistentAIAnalysis(item.brand, item.model, item.alertId, item)
          .then((res) => setAnalysisData(res))
          .catch((err) => setAnalysisData({ error: err.toString() }))
          .finally(() => setLoading(false));
      }
    }
  }, [item]);

  if (!item) return null;

  const rawSummary = analysisData?.summary || analysisData?.thai_summary || '';
  const rawSymptoms = analysisData?.symptoms || analysisData?.symptom_analysis || '';
  const rawActions = analysisData?.actionPlan || analysisData?.action_plan || [];
  const rawMatchReason = analysisData?.matchReason || analysisData?.match_reason || analysisData?.explanation || '';

  const actionList = Array.isArray(rawActions) && rawActions.length > 0
    ? rawActions 
    : typeof rawActions === 'string' && rawActions.trim()
      ? rawActions.split('\n').filter(Boolean)
      : [
          'ตรวจสอบ Serial Number ของเครื่องกับช่วงที่ระบุในประกาศฉบับเต็ม',
          'ตรวจสอบอาการผิดปกติและการทำงานของเครื่องมือแพทย์ตามคำเตือน',
          'ติดต่อตัวแทนจำหน่าย (Vendor) เพื่อประสานงานขอชุดอัปเกรดหรือการแก้ไขจากผู้ผลิต',
          'บันทึกผลการตรวจสอบในระบบ และรายงานหัวหน้างานเพื่อเฝ้าระวังความปลอดภัย'
        ];

  return (
    <>
    {/* --- 1. Screen Modal UI (Hidden on Print) --- */}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-800">
                  ผลการวิเคราะห์ความเสี่ยงและแนวทางแก้ไขโดย AI
                </h3>
                <span className="text-[10px] font-extrabold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md">
                  AI Medical Advisory
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {item.brand} {item.model} {item.toolName ? `(${item.toolName})` : ''} • ประกาศ {item.alertId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition cursor-pointer print:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 print:overflow-visible">
          {loading ? (
            <div className="text-center py-16 space-y-4">
              <div className="relative w-12 h-12 mx-auto">
                <Sparkles className="w-12 h-12 text-purple-600 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-slate-700">กำลังแปลข่าวและวิเคราะห์อาการโดย AI...</p>
                <p className="text-xs text-slate-400 mt-1">ถอดรหัสประกาศความปลอดภัยทางการแพทย์และประเมินผลกระทบทางชีวการแพทย์</p>
              </div>
            </div>
          ) : (
            <>
              {/* Risk Level & Match Probability Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
                      ระดับความเสี่ยงที่ประเมิน
                    </span>
                    <span className="text-sm font-extrabold text-rose-900 mt-0.5 block">
                      {analysisData?.riskLevel || 'ความเสี่ยงสูง (High Risk)'}
                    </span>
                  </div>
                  <ShieldAlert className="w-6 h-6 text-rose-500" />
                </div>
                <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">
                      ความน่าจะเป็นที่ตรงกัน
                    </span>
                    <span className="text-sm font-extrabold text-purple-900 mt-0.5 block">
                      {analysisData?.confidence || 'ตรงกันสูง (95%)'}
                    </span>
                  </div>
                  <CheckCircle2 className="w-6 h-6 text-purple-500" />
                </div>
              </div>

              {/* 1. Thai News Translation & Summary */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                  สรุปเนื้อหาข่าวแจ้งเตือนภัย (แปลไทย):
                </h4>
                <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-100 text-xs font-medium text-slate-800 leading-relaxed whitespace-pre-line">
                  {rawSummary || rawMatchReason || 'ระบบ AI ตรวจพบว่าเครื่องมือแพทย์ยี่ห้อและรุ่นดังกล่าวตรงกับข้อมูลในประกาศเตือนภัยด้านความปลอดภัย'}
                </div>
              </div>

              {/* 2. Symptom & Clinical Hazard Analysis */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                  การวิเคราะห์อาการผิดปกติเบื้องต้นและสาเหตุความเสี่ยง:
                </h4>
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs font-medium text-amber-950 leading-relaxed whitespace-pre-line">
                  {rawSymptoms || 'อาจเกิดความผิดปกติในระบบการทำงานของอุปกรณ์ มีความเสี่ยงต่อการรักษาพยาบาลและความปลอดภัยของผู้ป่วย แนะนำให้เข้าตรวจสอบเครื่องจริงตามขั้นตอน'}
                </div>
              </div>

              {/* 3. Recommended Actions & Next Steps */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  ข้อเสนอแนะและแนวทางปฏิบัติการแก้ไข (Recommended Actions):
                </h4>
                <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-xs font-medium text-emerald-950 space-y-2">
                  {actionList.map((action, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-extrabold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-snug">
                        {action.replace(/^\d+[\.\)]\s*/, '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Match Rationale */}
              {rawMatchReason && rawSummary !== rawMatchReason && (
                <div className="space-y-1">
                  <h4 className="text-[11px] font-extrabold text-slate-600">เกณฑ์การจับคู่ความตรงกัน:</h4>
                  <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {rawMatchReason}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-100 pt-3 flex justify-between items-center print:hidden">
          <span className="text-[10px] text-slate-400">
            ระบบเฝ้าระวังความปลอดภัยเครื่องมือแพทย์ N Health Group
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              พิมพ์ผล (A4)
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* --- 2. Print-Only Formal A4 Document (Hidden on Screen) --- */}
    <div className="hidden print:block absolute top-0 left-0 w-full bg-white text-black p-8 font-sans z-[100] min-h-screen">
      {/* Formal Header */}
      <div className="text-center mb-6 border-b-2 border-slate-800 pb-4">
        <h2 className="text-xl font-bold mb-1">ใบรายงานผลการวิเคราะห์ความเสี่ยงเครื่องมือแพทย์</h2>
        <h3 className="text-base font-semibold text-slate-700 uppercase tracking-wide">Medical Device Risk Analysis Report</h3>
      </div>
      
      {/* Document Info */}
      <div className="mb-6 grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 border border-slate-200 rounded-lg">
        <div>
          <p className="mb-1"><span className="font-bold">รหัสประกาศเตือนภัย (Alert ID):</span> {item.alertId}</p>
          <p className="mb-1"><span className="font-bold">วันที่ออกประกาศ:</span> {item.alertDate || '-'}</p>
          <p className="mb-1"><span className="font-bold">แหล่งข่าว (Source):</span> {item.alertSource || item.source || (item.alertId?.startsWith('ECRI') ? 'ECRI' : item.alertId?.startsWith('Z-') ? 'FDA' : 'FDA')}</p>
        </div>
        <div>
          <p className="mb-1"><span className="font-bold">ยี่ห้อ (Brand):</span> {item.brand}</p>
          <p className="mb-1"><span className="font-bold">รุ่น (Model):</span> {item.model}</p>
          <p className="mb-1"><span className="font-bold">ชื่อเครื่องมือแพทย์:</span> {item.toolName || '-'}</p>
        </div>
      </div>

      {/* AI Analysis Body */}
      {loading ? (
        <p className="text-center text-slate-500 italic my-10">กำลังประมวลผลข้อมูลโดย AI...</p>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-200 text-sm">
            <p><span className="font-bold text-rose-700">ระดับความเสี่ยงประเมินโดย AI:</span> {analysisData?.riskLevel || 'ความเสี่ยงสูง (High Risk)'}</p>
            <p><span className="font-bold text-purple-700">ความน่าจะเป็นที่ตรงกัน:</span> {analysisData?.confidence || 'ตรงกันสูง (95%)'}</p>
          </div>

          <div>
            <h4 className="font-bold text-sm mb-2 border-l-4 border-slate-800 pl-2">1. สรุปเนื้อหาข่าวแจ้งเตือนภัย (Executive Summary)</h4>
            <p className="whitespace-pre-line text-sm pl-3 leading-relaxed text-slate-800 text-justify">
              {rawSummary || rawMatchReason || '-'}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-sm mb-2 border-l-4 border-slate-800 pl-2">2. การวิเคราะห์อาการผิดปกติและสาเหตุความเสี่ยง (Hazard Analysis)</h4>
            <p className="whitespace-pre-line text-sm pl-3 leading-relaxed text-slate-800 text-justify">
              {rawSymptoms || '-'}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-sm mb-2 border-l-4 border-slate-800 pl-2">3. ข้อเสนอแนะและแนวทางปฏิบัติการแก้ไข (Recommended Actions)</h4>
            <ol className="list-decimal pl-7 text-sm space-y-1.5 text-slate-800">
              {actionList.map((act, idx) => (
                <li key={idx}>{act.replace(/^\d+[\.\)]\s*/, '')}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Signatures */}
      <div className="mt-20 grid grid-cols-2 gap-8 text-center text-sm">
        <div>
          <p className="mb-8">ลงชื่อ.......................................................</p>
          <p className="mb-2">(.......................................................)</p>
          <p className="mb-1 font-bold">ผู้ตรวจสอบ / วิศวกรชีวการแพทย์</p>
          <p>วันที่: ......./......./.......</p>
        </div>
        <div>
          <p className="mb-8">ลงชื่อ.......................................................</p>
          <p className="mb-2">(.......................................................)</p>
          <p className="mb-1 font-bold">หัวหน้าแผนก / ผู้อำนวยการ</p>
          <p>วันที่: ......./......./.......</p>
        </div>
      </div>
      
      {/* Footer Text */}
      <div className="mt-12 text-center text-[10px] text-slate-400 border-t border-slate-200 pt-2">
        สร้างโดยระบบ AI Medical Advisory • วันที่พิมพ์: {new Date().toLocaleDateString('th-TH')}
      </div>
    </div>
    </>
  );
}

// 2. Certify Alert Modal (Deprecated)
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

// 3. Action Tracking & Certify Modal (Merged)
export function ActionModal({ item, hospitalName, onClose, onSuccess, onNavigateToTracking }) {
  const initialCertifyResult = (item?.Status_Verification === 'จริง' || item?.Status_Verification === 'รับรองแล้ว') ? 'จริง' 
                                : (item?.Status_Verification === 'เท็จ' ? 'เท็จ' : '');
                                
  const [certifyResult, setCertifyResult] = useState(initialCertifyResult);
  const [certName, setCertName] = useState(item?.Verifier_Name || '');
  const [actionDetail, setActionDetail] = useState('');
  const [actionDate, setActionDate] = useState(new Date().toISOString().split('T')[0]);
  const [isFinal, setIsFinal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!item) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!certifyResult) {
      setErrorMsg('กรุณาเลือกว่าเคสนี้เกี่ยวข้อง (จริง) หรือไม่เกี่ยวข้อง (เท็จ)');
      return;
    }
    if (!certName.trim()) {
      setErrorMsg('กรุณาระบุชื่อผู้รับรอง / ผู้ตรวจสอบ');
      return;
    }
    if (certifyResult === 'จริง' && !actionDetail.trim()) {
      setErrorMsg('กรุณากรอกรายละเอียดการปฏิบัติงาน');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const targetHosp = hospitalName || item.hospitalName || item.hospital;
      const devicesToUpdate = item.isGroup && item.groupDevices ? item.groupDevices : [item];

      await Promise.all(devicesToUpdate.map(async (dev) => {
        const certRes = await api.certifyMatchedAlert(
          targetHosp,
          dev.deviceCode,
          item.alertId,
          certName.trim(),
          certifyResult === 'เท็จ' ? (actionDetail.trim() || 'แจ้งว่าไม่เกี่ยวข้อง') : '',
          certifyResult
        );
        
        if (!certRes.success) {
          throw new Error(`เกิดข้อผิดพลาดเครื่อง ${dev.deviceCode}: ${certRes.message || 'ไม่ทราบสาเหตุ'}`);
        }

        if (certifyResult === 'จริง' && actionDetail.trim()) {
          const actionRes = await api.addTrackingAction(
            targetHosp,
            dev.deviceCode,
            item.alertId,
            actionDetail.trim(),
            actionDate,
            isFinal
          );
          if (!actionRes.success) {
            throw new Error(`เกิดข้อผิดพลาดอัปเดตเครื่อง ${dev.deviceCode}: ${actionRes.message}`);
          }
        }
      }));

      onSuccess();
      onClose();
      
      // นำทางไปหน้า Tracking ถ้าเลือกจริงและมีการส่งฟังก์ชันนำทางมา
      if (certifyResult === 'จริง' && onNavigateToTracking) {
        onNavigateToTracking();
      }

    } catch (err) {
      setErrorMsg(err.toString());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh] ai-scroll">
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                ดำเนินการ / รับรองผลเคส {item.isGroup ? `(รวม ${item.groupDevices.length} เครื่อง)` : ''}
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {hospitalName} • {item.isGroup ? `${item.brand} ${item.model}` : `รหัส ${item.deviceCode}`} • ประกาศ {item.alertId}
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
          
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-700 block">
              1. ผลการตรวจสอบยืนยันกับเครื่องจริง: <span className="text-rose-500">*</span>
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
                <span>จริง (เกี่ยวข้อง)</span>
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
                <span>เท็จ (ไม่เกี่ยวข้อง)</span>
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              ชื่อผู้รับรอง / ผู้ตรวจสอบ: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="เช่น สมชาย ใจดี"
              value={certName}
              onChange={(e) => setCertName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          {certifyResult === 'จริง' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                2. วันที่ดำเนินการแก้ไข:
              </label>
              <input
                type="date"
                required
                value={actionDate}
                onChange={(e) => setActionDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              {certifyResult === 'จริง' ? (
                <>3. รายละเอียดการปฏิบัติงาน / ความคืบหน้า: <span className="text-rose-500">*</span></>
              ) : (
                'หมายเหตุเพิ่มเติม (ถ้ามี):'
              )}
            </label>
            <textarea
              rows={3}
              required={certifyResult === 'จริง'}
              placeholder={certifyResult === 'จริง' ? "เช่น ได้ประสานงาน Vendor เข้ามาเปลี่ยนอะไหล่ชุดใหม่..." : "ระบุสาเหตุที่ไม่เกี่ยวข้อง..."}
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
      const b64 = res?.base64 || res?.fileData;
      if (b64) {
        // Download base64 file
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}`;
        link.download = res.fileName || `Medical_Device_Alerts_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onClose();
      } else {
        alert(res?.message || 'ส่งออกไฟล์สำเร็จแต่ไม่มีข้อมูลไฟล์ (No base64 data)');
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

// 6. Device List Modal for Grouped Alerts
export function DeviceListModal({ group, onClose }) {
  if (!group || !group.isGroup) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                รายชื่อเครื่องมือที่ได้รับผลกระทบ
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {group.brand} {group.model} • ประกาศ {group.alertId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 pr-1 border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs">
                <th className="p-3">รหัสเครื่อง</th>
                <th className="p-3">เลขครุภัณฑ์</th>
                <th className="p-3">แผนก</th>
                <th className="p-3">สถานะเครื่อง</th>
                <th className="p-3 text-center">สถานะติดตาม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {group.groupDevices.map((dev, idx) => {
                const status = dev.trackingStatus || dev.status || 'รอดำเนินการ';
                const isCompleted = status === 'เสร็จสิ้น';
                return (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-bold text-blue-700 font-mono">
                      {dev.deviceCode || '-'}
                    </td>
                    <td className="p-3 text-slate-600">
                      {dev.assetId || '-'}
                    </td>
                    <td className="p-3 text-slate-600">
                      {dev.dept || '-'}
                    </td>
                    <td className="p-3">
                      <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                        {dev.deviceStatus || '-'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                        isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-500">
            รวมทั้งหมด {group.groupDevices.length} เครื่อง
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
