import React, { useState } from 'react';
import { Search, Plus, Trash2, Download, ShieldAlert, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../api_firebase';
import { isBrandPlausible, analyzeSingleAlertWithAI } from '../ai_matcher';

export default function ManualCheckTab() {
  const [devices, setDevices] = useState([
    { id: 1, name: '', brand: '', model: '', assetId: '' }
  ]);
  const [results, setResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState(null);

  const handleAddDevice = () => {
    if (devices.length < 5) {
      setDevices([...devices, { id: Date.now(), name: '', brand: '', model: '', assetId: '' }]);
    }
  };

  const handleRemoveDevice = (id) => {
    if (devices.length > 1) {
      setDevices(devices.filter(d => d.id !== id));
    }
  };

  const handleChange = (id, field, value) => {
    setDevices(devices.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleSearch = async () => {
    // Validate
    const validDevices = devices.filter(d => d.brand.trim() !== '');
    if (validDevices.length === 0) {
      alert('กรุณากรอก ยี่ห้อ (Brand) อย่างน้อย 1 เครื่องครับ');
      return;
    }

    setIsSearching(true);
    setResults(null);
    setProgress('กำลังดึงข้อมูลข่าวเตือนภัยทั้งหมด...');

    try {
      // 1. Fetch all alerts
      const allAlerts = await api.getAlertsFromDatabase();
      if (!allAlerts || allAlerts.length === 0) {
        setProgress('ไม่พบข้อมูลข่าวเตือนภัยในระบบ');
        setIsSearching(false);
        return;
      }

      let matchResults = [];
      let totalChecked = 0;

      for (let i = 0; i < validDevices.length; i++) {
        const device = validDevices[i];
        setProgress(`กำลังค้นหาข้อมูลเครื่องที่ ${i + 1}/${validDevices.length}: ${device.brand} ${device.model}...`);
        
        // Group format for the AI matcher
        const groupMock = {
          groupBrand: device.brand,
          groupModel: device.model,
          originalBrand: device.brand,
          originalModel: device.model,
          toolName: device.name,
          sourceCount: 1
        };

        // 2. Pre-filter alerts for this device
        const plausibleAlerts = allAlerts.filter(alert => 
          isBrandPlausible(alert.manufacturer, alert.headline, device.brand)
        );

        // 3. AI Deep Matching
        for (let j = 0; j < plausibleAlerts.length; j++) {
          const alert = plausibleAlerts[j];
          setProgress(`กำลังให้ AI วิเคราะห์เครื่อง ${device.brand} กับข่าว: ${alert.id} (${j+1}/${plausibleAlerts.length})`);
          
          try {
            const aiResult = await analyzeSingleAlertWithAI(alert, groupMock);
            totalChecked++;
            if (aiResult.isMatch) {
              matchResults.push({
                deviceAssetId: device.assetId || '-',
                deviceName: device.name || '-',
                deviceBrand: device.brand,
                deviceModel: device.model,
                alertSource: alert.source,
                alertId: alert.id,
                alertHeadline: alert.headline,
                alertDate: alert.date,
                aiConfidence: aiResult.confidence,
                aiReason: aiResult.reason,
                riskLevel: aiResult.riskLevel || 'Normal'
              });
            }
          } catch (e) {
            console.error('AI match error for alert', alert.id, e);
          }
        }
      }

      setResults(matchResults);
      setProgress(`ตรวจสอบสำเร็จ! พบข่าวที่ตรงกัน ${matchResults.length} รายการ (จากข่าวที่ผ่านเกณฑ์ ${totalChecked} รายการ)`);
      
    } catch (error) {
      console.error(error);
      setProgress('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleExportExcel = () => {
    if (!results || results.length === 0) return;
    
    const exportData = results.map(r => ({
      'รหัสทรัพย์สิน (Asset ID)': r.deviceAssetId,
      'ชื่อเครื่อง (Device Name)': r.deviceName,
      'ยี่ห้อ (Brand)': r.deviceBrand,
      'รุ่น (Model)': r.deviceModel,
      'แหล่งข่าว': r.alertSource,
      'รหัสข่าว (Alert ID)': r.alertId,
      'หัวข้อข่าว (Headline)': r.alertHeadline,
      'วันที่ประกาศ': r.alertDate,
      'ความแม่นยำ (Confidence)': r.aiConfidence,
      'เหตุผลจาก AI (Reason)': r.aiReason,
      'ระดับความเสี่ยง': r.riskLevel
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Manual_Match_Results");
    XLSX.writeFile(wb, `Manual_Match_Results_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 pt-2">
      <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4">
        <div className="flex items-center gap-2 border-b border-sky-100 pb-3">
          <Search className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-extrabold text-slate-800">
            ค้นหารายเครื่อง (Manual Check)
          </h3>
        </div>
        
        <p className="text-xs text-slate-600">
          กรอกข้อมูลเครื่องมือแพทย์ที่ต้องการตรวจสอบกับคลังข่าวเตือนภัย (สูงสุด 5 เครื่อง) ระบบจะใช้ AI วิเคราะห์ความเสี่ยงให้โดยไม่บันทึกลงในฐานข้อมูลหลักของโรงพยาบาล
        </p>

        <div className="space-y-4">
          {devices.map((device, index) => (
            <div key={device.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row gap-3 items-end">
              <div className="w-full md:w-1/4">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">รหัสเครื่อง / Asset ID (ถ้ามี)</label>
                <input 
                  type="text" 
                  value={device.assetId} 
                  onChange={(e) => handleChange(device.id, 'assetId', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  placeholder="เช่น INV-12345"
                />
              </div>
              <div className="w-full md:w-1/4">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">ชื่อเครื่องมือ (Device Type)</label>
                <input 
                  type="text" 
                  value={device.name} 
                  onChange={(e) => handleChange(device.id, 'name', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  placeholder="เช่น เครื่องช่วยหายใจ"
                />
              </div>
              <div className="w-full md:w-1/4">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">ยี่ห้อ (Brand) <span className="text-rose-500">*</span></label>
                <input 
                  type="text" 
                  value={device.brand} 
                  onChange={(e) => handleChange(device.id, 'brand', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                  placeholder="เช่น Philips"
                />
              </div>
              <div className="w-full md:w-1/4">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">รุ่น (Model)</label>
                <input 
                  type="text" 
                  value={device.model} 
                  onChange={(e) => handleChange(device.id, 'model', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  placeholder="เช่น V60"
                />
              </div>
              <div className="shrink-0">
                <button 
                  onClick={() => handleRemoveDevice(device.id)}
                  disabled={devices.length === 1}
                  className={`p-2 rounded-lg transition ${devices.length === 1 ? 'bg-slate-100 text-slate-300' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
                  title="ลบเครื่องนี้"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button 
            onClick={handleAddDevice}
            disabled={devices.length >= 5}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${devices.length >= 5 ? 'bg-slate-100 text-slate-400' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'}`}
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มเครื่องมือ ({devices.length}/5)</span>
          </button>

          <button 
            onClick={handleSearch}
            disabled={isSearching}
            className="btn-gradient-blue text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 hover:shadow-lg transition"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>{isSearching ? 'กำลังค้นหาและวิเคราะห์...' : 'เริ่มค้นหาและเทียบข่าว'}</span>
          </button>
        </div>

        {progress && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs font-medium text-blue-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{progress}</span>
          </div>
        )}
      </div>

      {results !== null && (
        <div className="glass-panel rounded-2xl p-6 bg-white/80 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-extrabold text-slate-800">
                ผลลัพธ์การค้นหา
              </h3>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                พบ {results.length} รายการ
              </span>
            </div>
            
            {results.length > 0 && (
              <button 
                onClick={handleExportExcel}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>ส่งออกเป็น Excel</span>
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="text-center p-8 text-slate-500 text-xs flex flex-col items-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-300 mb-3" />
              <p className="font-bold text-sm text-slate-700">ไม่พบข่าวแจ้งเตือนภัย</p>
              <p className="mt-1">เครื่องมือที่คุณระบุ ไม่มีความเสี่ยงในคลังข่าว ณ ขณะนี้</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">ข้อมูลเครื่อง</th>
                    <th className="p-3">แหล่งข่าว & รหัส</th>
                    <th className="p-3">หัวข้อข่าวแจ้งเตือน</th>
                    <th className="p-3 text-center">AI ความแม่นยำ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-sky-50/30 transition">
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{r.deviceBrand} {r.deviceModel}</div>
                        <div className="text-[10px] text-slate-500">{r.deviceName} | {r.deviceAssetId}</div>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md inline-block mb-1 ${
                          r.alertSource === 'ECRI' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {r.alertSource}
                        </span>
                        <div className="font-mono text-[10px] text-slate-600 font-bold">{r.alertId}</div>
                      </td>
                      <td className="p-3">
                        <p className="font-semibold text-slate-800 line-clamp-2" title={r.alertHeadline}>{r.alertHeadline}</p>
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">เหตุผล: {r.aiReason}</p>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2.5 py-1 rounded-lg font-bold inline-block text-[10px] ${
                          r.aiConfidence === 'High' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                          r.aiConfidence === 'Medium' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          'bg-sky-100 text-sky-700 border border-sky-200'
                        }`}>
                          {r.aiConfidence} Match
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
