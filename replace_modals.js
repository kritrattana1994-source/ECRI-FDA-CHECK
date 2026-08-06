const fs = require('fs');
const file = 'c:/Users/mark4/VS Code/ECRI FDA Check/frontend/src/components/Modals.jsx';
let content = fs.readFileSync(file, 'utf8');

const startStr = '// 2. Certify Modal\nexport function CertifyModal';
const endStr = '// 4. Export Excel Modal';
const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.log("Not found");
  process.exit(1);
}

const replacement = `// 3. Action Tracking & Certify Modal (Merged)
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
      
      // 1. รับรองความเกี่ยวข้องก่อนเสมอ
      const certRes = await api.certifyMatchedAlert(
        targetHosp,
        item.deviceCode,
        item.alertId,
        certifyResult,
        certName.trim(),
        certifyResult === 'เท็จ' ? (actionDetail.trim() || 'แจ้งว่าไม่เกี่ยวข้อง') : ''
      );
      
      if (!certRes.success) {
        throw new Error(certRes.message || 'เกิดข้อผิดพลาดในการรับรอง');
      }

      // 2. ถ้าเกี่ยวข้อง และมีการกรอกรายละเอียด ให้บันทึก Tracking Action ด้วย
      if (certifyResult === 'จริง' && actionDetail.trim()) {
        const actionRes = await api.addTrackingAction(
          targetHosp,
          item.deviceCode,
          item.alertId,
          actionDetail.trim(),
          actionDate,
          isFinal
        );
        if (!actionRes.success) {
          throw new Error(actionRes.message || 'รับรองสำเร็จ แต่เกิดข้อผิดพลาดในการบันทึกการแก้ไข');
        }
      }

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
                ดำเนินการ / รับรองผลเคส
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
          
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-700 block">
              1. ผลการตรวจสอบยืนยันกับเครื่องจริง: <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={\`p-3 rounded-2xl border text-xs font-bold cursor-pointer transition flex items-center gap-2 \${
                certifyResult === 'จริง'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }\`}>
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

              <label className={\`p-3 rounded-2xl border text-xs font-bold cursor-pointer transition flex items-center gap-2 \${
                certifyResult === 'เท็จ'
                  ? 'border-slate-500 bg-slate-100 text-slate-800 shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }\`}>
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

          {certifyResult === 'จริง' && (
            <label className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3 cursor-pointer mt-2">
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
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold mt-2">
              {errorMsg}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 flex justify-end gap-2 mt-4">
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

\n`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(file, newContent);
console.log("Replaced successfully!");
