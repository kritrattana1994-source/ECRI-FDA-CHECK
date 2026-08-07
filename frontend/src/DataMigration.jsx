import React, { useState } from 'react';
import { callApi } from './api';
import { db } from './firebase';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';

export default function DataMigration({ onComplete }) {
  const [status, setStatus] = useState('พร้อมเริ่มการย้ายข้อมูล...');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scriptUrl, setScriptUrl] = useState(() => localStorage.getItem('APPS_SCRIPT_URL') || '');

  const startMigration = async () => {
    if (!scriptUrl) {
      setStatus('❌ กรุณาใส่ Web App URL ก่อนครับ');
      return;
    }
    
    // เซ็ต URL ใหม่ลงไปในระบบก่อนเริ่มดึงข้อมูล
    localStorage.setItem('APPS_SCRIPT_URL', scriptUrl);
    
    setLoading(true);
    try {
      setStatus('กำลังดาวน์โหลดข้อมูลทั้งหมดจาก Google Sheets...');
      const response = await callApi('exportAllData');
      
      if (!response) {
        throw new Error("ดาวน์โหลดข้อมูลล้มเหลว (ไม่ได้ข้อมูลตอบกลับ)");
      }
      
      const dataPayload = response.data || response;
      const { hospitals, ecri, fda, devices, matchedAlerts, logs } = dataPayload;
      
      setStatus('ดาวน์โหลดสำเร็จ! กำลังเตรียมอัปโหลดลง Firestore...');
      
      // ฟังก์ชันช่วยย้ายข้อมูลทีละตาราง (ใช้ Batch เพื่อความรวดเร็วและปลอดภัย)
      const uploadCollection = async (collectionName, dataArray, idField) => {
        if (!dataArray || dataArray.length === 0) return;
        setStatus(`กำลังอัปโหลดตาราง ${collectionName} (${dataArray.length} รายการ)...`);
        
        // Firestore batch รองรับสูงสุด 500 รายการต่อ 1 batch
        const BATCH_SIZE = 450;
        for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
          const chunk = dataArray.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);
          
          chunk.forEach((item, index) => {
            // ใช้ค่าจาก idField หรือสร้าง ID อัตโนมัติ (แต่เราต้องการ ID ชัดเจน)
            let docId = item[idField];
            if (!docId) {
                // ถ้าไม่มี id ให้ใช้ index + timestamp
                docId = `doc_${Date.now()}_${i + index}`;
            }
            const docRef = doc(collection(db, collectionName), String(docId));
            
            // Clean up undefined values and empty keys (Firestore doesn't like them)
            const cleanItem = {};
            Object.keys(item).forEach(key => {
                const trimmedKey = String(key).trim();
                // ข้าม key ที่ว่างเปล่า และข้ามค่าที่เป็น undefined/null/ว่างเปล่าแบบไม่มีประโยชน์
                if (trimmedKey !== '' && item[key] !== undefined && item[key] !== null) {
                    // ถ้าค่าเป็น string ว่างเปล่า จะเก็บไว้ก็ได้ หรือลบทิ้งก็ได้ เพื่อความชัวร์เก็บไว้ก่อน
                    cleanItem[trimmedKey] = item[key];
                }
            });
            
            batch.set(docRef, cleanItem);
          });
          
          await batch.commit();
        }
      };

      // เริ่มการอัปโหลดทีละคอลเลกชัน
      setProgress(20);
      await uploadCollection("hospitals", hospitals, "Hospital_Name");
      
      setProgress(40);
      await uploadCollection("ecri", ecri, "Alert_ID");
      
      setProgress(60);
      await uploadCollection("fda", fda, "Alert_ID");
      
      setProgress(70);
      await uploadCollection("devices", devices, "Device_Code");
      
      setProgress(85);
      // สำหรับ Matched Alerts ให้ใช้ ID พิเศษจากการผสม Alert_ID กับ Device_Code
      const matchedWithId = matchedAlerts.map(m => ({
          ...m,
          Doc_ID: `${m.Alert_ID}_${m.Device_Code}`
      }));
      await uploadCollection("matchedAlerts", matchedWithId, "Doc_ID");
      
      setProgress(95);
      await uploadCollection("logs", logs, "Timestamp");
      
      setProgress(100);
      setStatus('✅ การย้ายข้อมูลเสร็จสมบูรณ์!');
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 3000);

    } catch (error) {
      console.error(error);
      setStatus(`❌ เกิดข้อผิดพลาด: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full text-center">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">เครื่องมือย้ายฐานข้อมูล (Migration)</h2>
        <p className="text-slate-600 mb-6 text-sm">
          หน้านี้จะทำการดึงข้อมูลจาก Google Sheets (Apps Script) ของเดิมทั้งหมด
          และยิงขึ้นไปเซฟใน Firebase Firestore ทันที
        </p>
        
        <div className="mb-6 text-left">
          <label className="block text-sm font-bold text-gray-700 mb-2">Web App URL (เวอร์ชันใหม่ล่าสุดที่เพิ่ง Deploy):</label>
          <input 
            type="text" 
            value={scriptUrl} 
            onChange={(e) => setScriptUrl(e.target.value)} 
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full px-4 py-2 border rounded-lg focus:ring-blue-500"
          />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="font-mono text-sm text-blue-800 font-semibold">{status}</p>
        </div>
        
        {loading && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
            <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
          </div>
        )}

        <button
          onClick={startMigration}
          disabled={loading}
          className={`w-full font-bold py-3 px-4 rounded-lg text-white transition-colors ${
            loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {loading ? 'กำลังทำงาน...' : '🚀 เริ่มต้นย้ายข้อมูลเลย'}
        </button>
      </div>
    </div>
  );
}
