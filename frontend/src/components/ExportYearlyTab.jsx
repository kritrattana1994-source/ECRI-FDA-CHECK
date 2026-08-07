import React, { useState, useEffect } from 'react';
import { Download, Database, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../api_firebase';

export default function ExportYearlyTab({ hospitals }) {
  const [selectedHospital, setSelectedHospital] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear + 1; y >= 2020; y--) {
    years.push(y);
  }

  useEffect(() => {
    setSelectedYear(String(currentYear));
  }, []);

  const handleExport = async (sourceType) => {
    if (!selectedHospital) {
      alert("กรุณาเลือกสาขา");
      return;
    }
    
    setIsLoading(true);
    setResult(null);
    
    try {
      const res = await api.getYearlyExportExcel(selectedHospital, selectedYear, sourceType);
      setResult(res);
    } catch (error) {
      setResult({ success: false, message: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 pt-2 max-w-3xl mx-auto animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2 mb-6">
          <Database className="w-6 h-6 text-blue-600" />
          ส่งออกข้อมูลรายปี (แบบฟอร์มโรงพยาบาล)
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              เลือกสาขา (โรงพยาบาล)
            </label>
            <select 
              value={selectedHospital}
              onChange={(e) => setSelectedHospital(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 p-3 font-medium transition-colors cursor-pointer"
            >
              <option value="">-- เลือกสาขา --</option>
              <option value="ทั้งหมด">ทั้งหมด (รวมทุกสาขา)</option>
              {hospitals.map(h => (
                <option key={h.name || h} value={h.name || h}>
                  {h.name || h}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              เลือกปี (ค.ศ.)
            </label>
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 p-3 font-medium transition-colors cursor-pointer"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          
          <div className="flex gap-4 mt-4">
            <button 
              onClick={() => handleExport('ECRI')}
              disabled={isLoading || !selectedHospital}
              className={`w-full font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                isLoading || !selectedHospital 
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-[0.98]'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  กำลังประมวลผล...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  ดาวน์โหลดรายงาน KPI - ECRI (.xlsx)
                </>
              )}
            </button>
            <button 
              onClick={() => handleExport('FDA')}
              disabled={isLoading || !selectedHospital}
              className={`w-full font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                isLoading || !selectedHospital 
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-[0.98]'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  กำลังประมวลผล...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  ดาวน์โหลดรายงาน KPI - FDA (.xlsx)
                </>
              )}
            </button>
          </div>
          
          {result && (
            <div className={`mt-4 p-4 rounded-xl text-sm font-medium border ${
              !result.success ? 'bg-rose-50 border-rose-200 text-rose-800' :
              (result.urls && result.urls.length > 0) ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {!result.success ? (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 shrink-0" />
                  ผิดพลาด: {result.message}
                </div>
              ) : (result.urls && result.urls.length > 0) ? (
                <div>
                  <div className="font-bold mb-3 flex items-center gap-2 text-emerald-700">
                    <CheckCircle className="w-5 h-5" />
                    สร้างไฟล์รายงานสำเร็จ!
                  </div>
                  <div className="space-y-3">
                    {result.urls.map((file, idx) => (
                      <a 
                        key={idx}
                        href={file.url} 
                        download={file.name}
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-700 font-bold py-2.5 px-4 rounded-xl transition-colors shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        ดาวน์โหลด {file.name}
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-2 text-center text-amber-700 space-y-2">
                  <Database className="w-8 h-8 text-amber-400 mb-1" />
                  <span className="font-bold text-base">ไม่พบข้อมูลความเสี่ยง</span>
                  <span className="text-amber-600/80 text-xs">
                    ไม่พบรายการเครื่องมือแพทย์ที่ตรงกับประกาศเตือนภัยในสาขาและปีที่คุณเลือก
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
