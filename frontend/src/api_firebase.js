import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  setDoc, 
  addDoc, 
  getDoc, 
  updateDoc,
  writeBatch, 
  deleteDoc,
  limit,
  getCountFromServer
} from 'firebase/firestore'; 
import { api as oldApi, getApiUrl, setApiUrl } from './api';
export { getApiUrl, setApiUrl };
import { runAIMatchingJob, analyzeSingleAlertWithAI } from './ai_matcher';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

// Helper function to parse dates into { year, month, day } (month 0-11, day 1-31)
function parseDateInfo(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return { year: dateVal.getFullYear(), month: dateVal.getMonth(), day: dateVal.getDate() };
  }
  const str = String(dateVal).trim();
  if (!str) return null;
  
  // ISO format YYYY-MM-DD or YYYY/MM/DD
  const iso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (iso) {
    let y = parseInt(iso[1], 10);
    if (y > 2400) y -= 543;
    return { year: y, month: parseInt(iso[2], 10) - 1, day: parseInt(iso[3], 10) };
  }

  // DD/MM/YYYY or MM/DD/YYYY with 4-digit year at the end
  const mdyOrDmy = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (mdyOrDmy) {
    let p0 = parseInt(mdyOrDmy[1], 10);
    let p1 = parseInt(mdyOrDmy[2], 10);
    let y = parseInt(mdyOrDmy[3], 10);
    if (y > 2400) y -= 543;
    
    // ECRI and FDA sources use MM/DD/YYYY (US format).
    // If p0 > 12 (e.g. 25/08/2026), p0 is Day. Otherwise p0 is Month (08/06/2026 => Aug 6).
    let day, month;
    if (p0 > 12) {
      day = p0;
      month = p1 - 1;
    } else {
      day = p1;
      month = p0 - 1;
    }
    return { year: y, month, day };
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    let y = parsed.getFullYear();
    if (y > 2400) y -= 543;
    return { year: y, month: parsed.getMonth(), day: parsed.getDate() };
  }
  return null;
}

// Helper to extract a human-readable clean Alert ID instead of internal doc IDs (e.g. doc_1786007857060_559)
export function getCleanAlertCode(data = {}, fallbackId = '') {
  if (!data && !fallbackId) return '-';
  
  // 1. Direct specific identifier fields
  const candidates = [
    data?.['Accession Number'],
    data?.Accession_Number,
    data?.['ECRI Number'],
    data?.ECRI_Number,
    data?.ECRI_ID,
    data?.Real_Alert_ID,
    data?.RECALL_NUMBER,
    data?.Recall_Number,
    data?.PRODUCT_RES_NUMBER,
    data?.RES_EVENT_NUM,
    data?.RES_EVENT_NUMBER,
    data?.FEI_NUMBER,
    data?.['Alert Number'],
    data?.['Alert No'],
    data?.Alert_No,
    data?.Alert_Number,
    data?.Alert_Code,
    data?.['รหัสแจ้งเตือน'],
    data?.['รหัสข่าว'],
    data?.Alert_ID,
    data?.Alert_Id,
    data?.alertId,
    fallbackId
  ];

  for (const c of candidates) {
    if (c && typeof c === 'string') {
      const trimmed = c.trim();
      if (trimmed && !trimmed.startsWith('doc_') && !trimmed.startsWith('DOC_')) {
        return trimmed;
      }
    }
  }

  // 2. Try extracting from Headline / Title / Description
  const title = String(data?.Headline || data?.Title || data?.['หัวเรื่อง'] || data?.['หัวข้อแจ้งเตือน'] || data?.PRODUCT_DESCRIPTION || data?.alertHeadline || '');
  const matchEcri = title.match(/\b([ASHV]\d{4,}[A-Z0-9-]*)\b/i);
  if (matchEcri) return matchEcri[1].toUpperCase();

  const matchFda = title.match(/\b(Z-\d+-\d+|D-\d+-\d+|V-\d+-\d+|B-\d+-\d+|[0-9]{6,})\b/i);
  if (matchFda) return matchFda[1].toUpperCase();

  // 3. If fallbackId is doc_1786007857060_559, convert to ALERT-559
  if (fallbackId && String(fallbackId).startsWith('doc_')) {
    const parts = String(fallbackId).split('_');
    const suffix = parts[parts.length - 1];
    return `ALERT-${suffix}`;
  }

  return fallbackId || 'ALERT';
}

// Helper to log system activities in Firestore
export async function logSystemActivity(activity, type, count = 0, status = 'Success') {
  try {
    const now = new Date();
    const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const timeFormatted = `${now.getDate()} ${thMonths[now.getMonth()]} ${now.getFullYear() + 543} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    await addDoc(collection(db, 'logs'), {
      activity: String(activity),
      type: String(type),
      count: Number(count) || 0,
      status: String(status),
      time: timeFormatted,
      timestamp: Date.now()
    });
  } catch (err) {
    console.warn("Log activity error:", err);
  }
}

// =========================================================
// 🚀 SMART IN-MEMORY & LOCALSTORAGE CACHE LAYER
// ลดจำนวน Firebase Reads ลง 95-99% อย่างมีประสิทธิภาพ
// =========================================================
const CACHE_TTL = {
  HOSPITALS: 30 * 60 * 1000,    // 30 นาที
  ALERTS: 20 * 60 * 1000,       // 20 นาที
  MATCHED: 5 * 60 * 1000,       // 5 นาที
  DEVICE_STATS: 15 * 60 * 1000, // 15 นาที
  DASHBOARD: 5 * 60 * 1000,     // 5 นาที
  PROCESSED_DATES: 20 * 60 * 1000,
  TOTAL_COUNTS: 10 * 60 * 1000  // 10 นาทีสำหรับ getCountFromServer
};

const cache = {
  hospitals: null,
  hospitalsTime: 0,
  alerts: null,
  alertsTime: 0,
  matched: null,
  matchedTime: 0,
  deviceStats: {}, // { hospitalName: { count, latestUploadDate, daysAgo, time } }
  dashboard: {},   // { key: { data, time } }
  processedDates: null,
  processedDatesTime: 0,
  totalCounts: {}, // { key: { count, time } }

  invalidateAll: () => {
    cache.hospitals = null;
    cache.alerts = null;
    cache.matched = null;
    cache.deviceStats = {};
    cache.dashboard = {};
    cache.processedDates = null;
    cache.totalCounts = {};
    window.__alertsCache = null;
    try {
      sessionStorage.removeItem('CACHE_ALERTS');
      sessionStorage.removeItem('CACHE_MATCHES');
    } catch {}
  },

  invalidateMatches: () => {
    cache.matched = null;
    cache.dashboard = {};
    try { sessionStorage.removeItem('CACHE_MATCHES'); } catch {}
  },

  invalidateDevices: (hospName) => {
    if (hospName) {
      delete cache.deviceStats[String(hospName).toLowerCase()];
    } else {
      cache.deviceStats = {};
    }
    delete cache.totalCounts['devices_all'];
    cache.dashboard = {};
  },

  invalidateAlerts: () => {
    cache.alerts = null;
    cache.processedDates = null;
    cache.dashboard = {};
    delete cache.totalCounts['ecri_all'];
    delete cache.totalCounts['fda_all'];
    window.__alertsCache = null;
    try { sessionStorage.removeItem('CACHE_ALERTS'); } catch {}
  }
};

// 🚀 API เชื่อมต่อกับ Firebase Firestore 100% (พร้อมระบบลด Reads อัจฉริยะ)
export const api = {
  // ฟังก์ชันเดิมจาก Apps Script สำหรับฟังก์ชันที่ยังไม่ได้ทดแทน
  ...oldApi,

  // ---------------------------------------------------------
  // อัปโหลดไฟล์แจ้งเตือนเข้า Firebase โดยตรง (แทนที่ Apps Script)
  // ---------------------------------------------------------
  saveAlertsToDatabase: async (fileData, type) => {
    try {
      if (!fileData || !fileData.data) {
        return { success: false, message: "ข้อมูลไฟล์ไม่ถูกต้อง" };
      }
      
      const base64Data = fileData.data.split(',')[1];
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const workbook = XLSX.read(bytes.buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const parsedData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!parsedData || parsedData.length === 0) {
        return { success: false, message: "ไม่พบข้อมูลในไฟล์ Excel" };
      }

      const todayStr = new Date().toISOString();
      let addedCount = 0;
      let skippedCount = 0;
      
      let batch = writeBatch(db);
      let batchCount = 0;

      if (type === 'admin_ecri') {
        const colRef = collection(db, 'ecri');
        const existingDocs = await getDocs(colRef);
        const existingIds = new Set(existingDocs.docs.map(d => String(d.id)));

        for (const alert of parsedData) {
          const alertId = String(alert['Accession Number'] || alert['Accession No.'] || alert['Accession No'] || alert['Alert ID'] || alert['Alert Id'] || alert['id'] || '').trim();
          if (alertId && !existingIds.has(alertId)) {
            const docRef = doc(db, 'ecri', alertId);
            batch.set(docRef, { ...alert, uploadedAt: todayStr });
            addedCount++;
            batchCount++;
            
            if (batchCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          } else if (alertId) {
            skippedCount++;
          }
        }
      } else if (type === 'admin_fda') {
        const colRef = collection(db, 'fda');
        const existingDocs = await getDocs(colRef);
        const existingIds = new Set(existingDocs.docs.map(d => String(d.id)));

        for (const recall of parsedData) {
          const recallNumber = String(recall['RECALL_NUMBER'] || recall['Recall Number'] || recall['Recall No'] || recall['Recall No.'] || recall['id'] || '').trim();
          if (recallNumber && !existingIds.has(recallNumber)) {
            const docRef = doc(db, 'fda', recallNumber);
            batch.set(docRef, { ...recall, uploadedAt: todayStr });
            addedCount++;
            batchCount++;
            
            if (batchCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          } else if (recallNumber) {
            skippedCount++;
          }
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      cache.invalidateAlerts();
      logSystemActivity(`Upload ${type === 'admin_ecri' ? 'ECRI' : 'FDA'} Alerts`, 'Upload', addedCount, 'Success');

      return { 
        success: true, 
        message: `อัปโหลดสำเร็จ! เพิ่มข้อมูลใหม่ ${addedCount} รายการ (ข้ามข้อมูลที่ซ้ำ ${skippedCount} รายการ)` 
      };
    } catch (error) {
      console.error("Firebase saveAlertsToDatabase Error:", error);
      return { success: false, message: "เกิดข้อผิดพลาด: " + error.toString() };
    }
  },

  // ---------------------------------------------------------
  // อัปโหลดไฟล์ครุภัณฑ์เข้า Firebase โดยตรง (แทนที่ Apps Script)
  // ---------------------------------------------------------
  saveDevicesToDatabase: async (fileData, hospitalName) => {
    try {
      if (!fileData || !fileData.data) {
        return { success: false, message: "ข้อมูลไฟล์ไม่ถูกต้อง" };
      }
      
      const cleanHosp = String(hospitalName || '').trim();
      if (!cleanHosp) {
        return { success: false, message: "กรุณาระบุชื่อโรงพยาบาลสาขา" };
      }
      
      const base64Data = fileData.data.split(',')[1];
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const workbook = XLSX.read(bytes.buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const parsedData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!parsedData || parsedData.length === 0) {
        return { success: false, message: "ไม่พบข้อมูลในไฟล์ Excel" };
      }

      const todayStr = new Date().toISOString();
      let addedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      
      let batch = writeBatch(db);
      let batchCount = 0;

      // เราอาจจะไม่ต้อง query ก่อนถ้าเราใช้ ID ที่ unique เช่น HospName_DeviceID
      // เพื่อความแม่นยำในการรู้ว่า add หรือ update เราอาจจะต้อง get ทุกอันของรพ.นี้มาก่อน
      const colRef = collection(db, 'devices');
      const q = query(colRef, where('Hospital_Name', '==', cleanHosp));
      const existingDocs = await getDocs(q);
      const existingIds = new Set(existingDocs.docs.map(d => String(d.id)));

      for (const device of parsedData) {
        let deviceId = "";
        let assetId = "";
        let brand = "";
        let model = "";
        let deviceType = "";
        let deviceThaiName = "";
        let status = "Active";
        let dept = "";
        
        for (let key in device) {
          const cleanKey = key.trim().toLowerCase();
          const val = String(device[key] || '').trim();
          
          if (cleanKey === 'id code' || cleanKey === 'id' || cleanKey === 'รหัสเครื่องมือ' || cleanKey === 'รหัสครุภัณฑ์' || cleanKey === 'รหัส' || cleanKey === 'device code' || cleanKey === 'device id') {
            if (!deviceId) deviceId = val;
          } else if (cleanKey === 'asset id' || cleanKey === 'เลขครุภัณฑ์' || cleanKey === 'เลขคุรุภัณฑ์' || cleanKey === 'หมายเลขครุภัณฑ์' || cleanKey === 'asset no' || cleanKey === 'asset number') {
            assetId = val;
          } else if (cleanKey === 'ยี่ห้อ' || cleanKey === 'brand' || cleanKey === 'manufacturer') {
            brand = val;
          } else if (cleanKey === 'รุ่น' || cleanKey === 'model') {
            model = val;
          } else if (cleanKey === 'ชนิดเครื่องมือ' || cleanKey === 'ชื่อภาษาอังกฤษ' || cleanKey === 'english name' || cleanKey === 'device type' || cleanKey === 'ชนิด' || cleanKey === 'ประเภท') {
            deviceType = val;
          } else if (cleanKey === 'ชื่อเครื่องมือไทย' || cleanKey === 'ชื่อภาษาไทย' || cleanKey === 'ชื่อเครื่องมือ' || cleanKey === 'รายการ') {
            deviceThaiName = val;
          } else if (cleanKey === 'สถานะ' || cleanKey === 'status' || cleanKey === 'สถานะการใช้งาน') {
            status = val;
          } else if (cleanKey === 'หน่วยงาน' || cleanKey === 'แผนก' || cleanKey === 'dept' || cleanKey === 'department') {
            dept = val;
          }
        }
        
        if (!deviceId) {
          skippedCount++;
          continue;
        }

        const docId = `${cleanHosp}_${deviceId}`.replace(/[\/\\?%*:|"<>]/g, '-');
        const docRef = doc(db, 'devices', docId);

        const dataToSave = {
          Hospital_Name: cleanHosp,
          Device_Code: deviceId,
          Asset_ID: assetId,
          Brand: brand,
          Model: model,
          Device_Name: deviceType,
          Device_Thai_Name: deviceThaiName,
          Status: status,
          Department: dept,
          uploadedAt: todayStr
        };

        batch.set(docRef, dataToSave, { merge: true });
        if (existingIds.has(docId)) {
          updatedCount++;
        } else {
          addedCount++;
        }
        batchCount++;
        
        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }
      
      // Update hospital lastUploadTime
      const hospQ = query(collection(db, 'hospitals'), where('name', '==', cleanHosp));
      const hospDocs = await getDocs(hospQ);
      if (!hospDocs.empty) {
        const hDoc = hospDocs.docs[0];
        await updateDoc(doc(db, 'hospitals', hDoc.id), {
          lastUploadTime: todayStr,
          deviceCount: addedCount + updatedCount + (hDoc.data().deviceCount || 0)
        });
      }

      cache.invalidateDevices(cleanHosp);
      logSystemActivity(`Upload Devices for ${cleanHosp}`, 'Upload', addedCount + updatedCount, 'Success');

      return { 
        success: true, 
        message: `อัปโหลดทะเบียนครุภัณฑ์สำเร็จ!\nเพิ่มรายการใหม่: ${addedCount}\nอัปเดตข้อมูลเดิม: ${updatedCount}` 
      };
    } catch (error) {
      console.error("Firebase saveDevicesToDatabase Error:", error);
      return { success: false, message: "เกิดข้อผิดพลาด: " + error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 1. ดึงข้อมูลสถิติหน้า Dashboard (Dashboard Stats & Monthly Graph)
  // ---------------------------------------------------------
  getDashboardStats: async (mode = 'calendar', selectedYear = 2026, hospitalName = 'all', forceRefresh = false) => {
    try {
      const year = parseInt(selectedYear, 10) || new Date().getFullYear();
      const cacheKey = `${mode}_${year}_${hospitalName}`;
      const now = Date.now();

      if (!forceRefresh && cache.dashboard[cacheKey] && (now - cache.dashboard[cacheKey].time < CACHE_TTL.DASHBOARD)) {
        return cache.dashboard[cacheKey].data;
      }

      // 1-4. Parallelize all queries into 1 concurrent network round-trip! (ลดเวลาโหลดจาก 3-4 วิ เหลือ ~300ms)
      const cleanHosp = String(hospitalName || 'all').trim().toLowerCase();

      const [
        hospitalsList,
        devicesResult,
        ecriResult,
        fdaResult,
        matchesList,
        alertsData
      ] = await Promise.all([
        api.getHospitalsMap({ forceRefresh }),
        (cleanHosp === 'all' || cleanHosp === 'ทั้งหมด')
          ? (!cache.totalCounts['devices_all'] || forceRefresh || (now - (cache.totalCounts['devices_all']?.time || 0) > CACHE_TTL.TOTAL_COUNTS)
              ? getCountFromServer(collection(db, 'devices')).then(s => ({ count: s.data().count })).catch(() => ({ count: 0 }))
              : Promise.resolve({ count: cache.totalCounts['devices_all'].count }))
          : api.getBranchDeviceStats(hospitalName, forceRefresh),
        (!cache.totalCounts['ecri_all'] || forceRefresh || (now - (cache.totalCounts['ecri_all']?.time || 0) > CACHE_TTL.TOTAL_COUNTS))
          ? getCountFromServer(collection(db, 'ecri')).then(s => ({ count: s.data().count })).catch(() => ({ count: 0 }))
          : Promise.resolve({ count: cache.totalCounts['ecri_all']?.count || 0 }),
        (!cache.totalCounts['fda_all'] || forceRefresh || (now - (cache.totalCounts['fda_all']?.time || 0) > CACHE_TTL.TOTAL_COUNTS))
          ? getCountFromServer(collection(db, 'fda')).then(s => ({ count: s.data().count })).catch(() => ({ count: 0 }))
          : Promise.resolve({ count: cache.totalCounts['fda_all']?.count || 0 }),
        (!cache.matched || forceRefresh || (now - cache.matchedTime > CACHE_TTL.MATCHED))
          ? getDocs(collection(db, 'matchedAlerts')).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => [])
          : Promise.resolve(cache.matched || []),
        api.getAlertsFromDatabase(null, forceRefresh).catch(() => [])
      ]);

      // Cache the parallel results
      if (cleanHosp === 'all' || cleanHosp === 'ทั้งหมด') {
        cache.totalCounts['devices_all'] = { count: devicesResult.count || 0, time: now };
      }
      cache.totalCounts['ecri_all'] = { count: ecriResult.count || 0, time: now };
      cache.totalCounts['fda_all'] = { count: fdaResult.count || 0, time: now };
      cache.matched = matchesList;
      cache.matchedTime = now;

      const totalDevices = devicesResult.count || 0;
      const ecriCount = ecriResult.count || 0;
      const fdaCount = fdaResult.count || 0;
      const totalAlerts = ecriCount + fdaCount;
      const allMatches = matchesList || [];
      const certCountByHosp = {};
      const matchCountByHosp = {};
      let totalMatched = 0;

      const monthlyMatched = new Array(12).fill(0);
      const monthlyCertified = new Array(12).fill(0);

      allMatches.forEach(data => {
        const hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        const statusVal = String(data.Status || data['สถานะการตรวจสอบ'] || data['สถานะ'] || '').trim();
        const isCertified = statusVal === 'จริง' || statusVal === 'รับรองแล้ว';
        
        if (hName) {
          matchCountByHosp[hName] = (matchCountByHosp[hName] || 0) + 1;
          if (isCertified) {
            certCountByHosp[hName] = (certCountByHosp[hName] || 0) + 1;
          }
        }

        const isTargetHosp = (cleanHosp === 'all' || cleanHosp === 'ทั้งหมด' || hName.toLowerCase() === cleanHosp);
        if (isTargetHosp) {
          totalMatched++;

          const rawDate = data.Alert_Publication_Date || data.Alert_Date || data['วันที่ประกาศ'] || data.Matched_At || data['วันที่ตรวจพบ'] || data.Detect_Date || data.detectDate || data.alertDate || '';
          const dateInfo = parseDateInfo(rawDate);

          if (dateInfo) {
            if (mode === 'fiscal') {
              if (dateInfo.year === (year - 1) && dateInfo.month >= 9) {
                const idx = dateInfo.month - 9;
                monthlyMatched[idx]++;
                if (isCertified) monthlyCertified[idx]++;
              } else if (dateInfo.year === year && dateInfo.month <= 8) {
                const idx = dateInfo.month + 3;
                monthlyMatched[idx]++;
                if (isCertified) monthlyCertified[idx]++;
              }
            } else {
              if (dateInfo.year === year) {
                const idx = dateInfo.month;
                if (idx >= 0 && idx < 12) {
                  monthlyMatched[idx]++;
                  if (isCertified) monthlyCertified[idx]++;
                }
              }
            }
          } else {
            const currMonth = new Date().getMonth();
            monthlyMatched[currMonth]++;
            if (isCertified) monthlyCertified[currMonth]++;
          }
        }
      });

      // 5. Setup Monthly Labels based on Mode
      let finalLabels = [];
      const thMonthsCalendar = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
      const thMonthsFiscal = ["ต.ค.", "พ.ย.", "ธ.ค.", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย."];

      if (mode === 'fiscal') {
        const prevYearBE = String(year + 542).substring(2);
        const currYearBE = String(year + 543).substring(2);
        finalLabels = thMonthsFiscal.map((m, i) => i < 3 ? `${m} ${prevYearBE}` : `${m} ${currYearBE}`);
      } else {
        const currYearBE = String(year + 543).substring(2);
        finalLabels = thMonthsCalendar.map(m => `${m} ${currYearBE}`);
      }

      // Fetch device counts per hospital concurrently in parallel
      const devicesDetailList = await Promise.all(
        hospitalsList.map(async (h) => {
          const stat = await api.getBranchDeviceStats(h.name, forceRefresh);
          let days = stat.daysAgo;
          if (days === null || days === undefined) {
             const upDate = new Date(stat.latestUploadDate || h.lastUploadTime);
             if (!isNaN(upDate.getTime())) {
               days = Math.max(0, Math.floor((Date.now() - upDate.getTime()) / (1000 * 60 * 60 * 24)));
             }
          }
          return {
            hospital: h.name,
            count: typeof stat.count === 'number' ? stat.count : 0,
            lastUpdate: stat.latestUploadDate || h.lastUploadTime || "เรียลไทม์ (Firestore)",
            daysAgo: days
          };
        })
      );

      // If totalDevices is 0 or all, compute sum from branch details if needed
      let finalTotalDevices = totalDevices;
      if (cleanHosp === 'all' || cleanHosp === 'ทั้งหมด') {
        const sumBranch = devicesDetailList.reduce((acc, d) => acc + (d.count || 0), 0);
        if (sumBranch > 0 && finalTotalDevices === 0) {
          finalTotalDevices = sumBranch;
        }
      }

      const certifiedDetailList = hospitalsList.map(h => ({
        hospital: h.name,
        certified: certCountByHosp[h.name] || 0,
        matched: matchCountByHosp[h.name] || 0
      }));

      let ecriMinDate = null;
      let ecriMaxDate = null;
      let fdaMinDate = null;
      let fdaMaxDate = null;
      
      if (alertsData && alertsData.length > 0) {
        const ecriDates = alertsData.filter(a => a.source === 'ECRI' && a.date).map(a => new Date(a.date).getTime()).filter(t => !isNaN(t));
        if (ecriDates.length > 0) {
          ecriMinDate = new Date(Math.min(...ecriDates)).toISOString().split('T')[0];
          ecriMaxDate = new Date(Math.max(...ecriDates)).toISOString().split('T')[0];
        }
        
        const fdaDates = alertsData.filter(a => a.source === 'FDA' && a.date).map(a => new Date(a.date).getTime()).filter(t => !isNaN(t));
        if (fdaDates.length > 0) {
          fdaMinDate = new Date(Math.min(...fdaDates)).toISOString().split('T')[0];
          fdaMaxDate = new Date(Math.max(...fdaDates)).toISOString().split('T')[0];
        }
      }

      const datasets = [
        {
          label: 'เคสแจ้งเตือนที่พบ (Matched Cases)',
          data: monthlyMatched,
          backgroundColor: 'rgba(59, 130, 246, 0.85)',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          borderRadius: 6,
          type: 'bar',
          order: 2
        },
        {
          label: 'เคสที่เจ้าหน้าที่รับรองแล้ว (Certified)',
          data: monthlyCertified,
          backgroundColor: 'rgba(16, 185, 129, 0.85)',
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderRadius: 6,
          type: 'bar',
          order: 1
        }
      ];

      const resultData = {
        monthsLabels: finalLabels,
        datasets: datasets,
        totalDevices: finalTotalDevices,
        totalAlerts: totalAlerts,
        totalAlertsDetail: {
          ecriCount: ecriCount,
          fdaCount: fdaCount,
          ecriDateRange: ecriMinDate && ecriMaxDate ? { start: ecriMinDate, end: ecriMaxDate } : null,
          fdaDateRange: fdaMinDate && fdaMaxDate ? { start: fdaMinDate, end: fdaMaxDate } : null
        },
        activeYear: year,
        devicesDetailList: devicesDetailList,
        certifiedDetailList: certifiedDetailList,
        dailySurveillance: {
          uploadStatus: "🟢 อัปเดตเรียลไทม์",
          fdaUploadStatus: "🟢 อัปเดตเรียลไทม์",
          screeningStatus: `🟢 พบความเสี่ยงทั้งหมด ${totalMatched} รายการ`
        }
      };

      cache.dashboard[cacheKey] = { data: resultData, time: now };
      return resultData;
    } catch (error) {
      console.error("Firebase getDashboardStats Error:", error);
      return null;
    }
  },

  // ---------------------------------------------------------
  // 2. ดึงข้อมูลรายการแจ้งเตือนทั้งหมด (พร้อมระบบ Cache 2 ชั้น)
  // ---------------------------------------------------------
  getAlertsFromDatabase: async (filterMonth, forceRefresh = false) => {
    try {
      const now = Date.now();

      // Check In-Memory / SessionStorage Cache
      if (!forceRefresh && !cache.alerts && typeof window !== 'undefined') {
        try {
          const cachedSession = sessionStorage.getItem('CACHE_ALERTS');
          if (cachedSession) {
            const parsed = JSON.parse(cachedSession);
            if (parsed && Array.isArray(parsed.data) && (now - parsed.time < CACHE_TTL.ALERTS)) {
              cache.alerts = parsed.data;
              cache.alertsTime = parsed.time;
            }
          }
        } catch {}
      }

      if (forceRefresh || !cache.alerts || (now - cache.alertsTime > CACHE_TTL.ALERTS)) {
        const ecriSnap = await getDocs(collection(db, 'ecri'));
        const fdaSnap = await getDocs(collection(db, 'fda'));
        
        const ecriList = ecriSnap.docs.map(d => {
          const data = d.data();
          let dateStr = data['Alert Publication Date'] || data.Alert_Date || '';
          if (dateStr && dateStr.includes('T')) dateStr = dateStr.split('T')[0];
          
          return {
            source: 'ECRI',
            id: data['Accession Number'] || data.ECRI_Number || data.Alert_ID || d.id,
            headline: data.Headline || data.Title || '',
            manufacturer: data.Manufacturer || '',
            priority: data.Priority || '',
            date: dateStr
          };
        });

        const fdaList = fdaSnap.docs.map(d => {
          const data = d.data();
          let dateStr = data.POSTED_INTERNET_DT || data.EVENT_DATE_INITIATED || '';
          if (dateStr && dateStr.includes('T')) dateStr = dateStr.split('T')[0];
          
          return {
            source: 'FDA',
            id: data.RECALL_NUMBER || data.PRODUCT_RES_NUMBER || data.RES_EVENT_NUM || data.Alert_ID || d.id,
            headline: data.PRODUCT_DESCRIPTION || '',
            manufacturer: data.FIRM_NAME || data.RECALLING_FIRM || '',
            class: data.RECALL_CLASS || data.CLASSIFICATION || '',
            date: dateStr
          };
        });

        cache.alerts = [...ecriList, ...fdaList];
        cache.alertsTime = now;
        window.__alertsCache = cache.alerts;

        try {
          sessionStorage.setItem('CACHE_ALERTS', JSON.stringify({ data: cache.alerts, time: now }));
        } catch {}
      }

      let allAlerts = cache.alerts || [];

      if (filterMonth && filterMonth !== 'all' && filterMonth !== 'ทั้งหมด') {
        const target = filterMonth.toLowerCase();
        const isMonthFormat = /^\d{4}-\d{2}$/.test(target);
        
        allAlerts = allAlerts.filter(item => {
          if (isMonthFormat) {
            if (!item.date) return false;
            let yyyymm = '';
            if (/^\d{4}-\d{2}/.test(item.date)) {
              yyyymm = item.date.substring(0, 7);
            } else {
              const pd = new Date(item.date);
              if (!isNaN(pd.getTime())) {
                yyyymm = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
              }
            }
            return yyyymm === target;
          }
          
          return Object.values(item).some(val => String(val).toLowerCase().includes(target));
        });
      }

      return allAlerts;
    } catch (error) {
      console.error("Firebase getAlertsFromDatabase Error:", error);
      return [];
    }
  },

  // ---------------------------------------------------------
  // 3. ดึงเดือนที่มีข้อมูล
  // ---------------------------------------------------------
  getAvailableDatabaseMonths: async () => {
    try {
      await api.getAlertsFromDatabase('all');
      
      const allAlerts = cache.alerts || window.__alertsCache || [];
      const monthSet = new Set();
      
      allAlerts.forEach(item => {
        if (item.date) {
          let yyyymm = '';
          if (/^\d{4}-\d{2}/.test(item.date)) {
            yyyymm = item.date.substring(0, 7);
          } else {
            const parsedDate = new Date(item.date);
            if (!isNaN(parsedDate.getTime())) {
              const y = parsedDate.getFullYear();
              const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
              yyyymm = `${y}-${m}`;
            }
          }
          if (/^\d{4}-\d{2}$/.test(yyyymm)) {
            monthSet.add(yyyymm);
          }
        }
      });
      
      return Array.from(monthSet).sort().reverse();
    } catch (error) {
      console.error("Firebase getAvailableDatabaseMonths Error:", error);
      return [];
    }
  },

  // ---------------------------------------------------------
  // 4. ข้อมูลสถิติของแต่ละสาขา (Branch Device Stats - ใช้ getCountFromServer ลด Read เหลือ 1)
  // ---------------------------------------------------------
  getBranchDeviceStats: async (hospitalName, forceRefresh = false) => {
    if (!hospitalName) return { count: 0, latestUploadDate: null, daysAgo: null };
    try {
      const cleanTarget = String(hospitalName).trim().toLowerCase();
      const now = Date.now();

      // Check Cache
      if (!forceRefresh && cache.deviceStats[cleanTarget] && (now - cache.deviceStats[cleanTarget].time < CACHE_TTL.DEVICE_STATS)) {
        return cache.deviceStats[cleanTarget];
      }
      
      let latestUploadDate = null;
      let daysAgo = null;
      
      // 1. ดึงวันที่อัปเดตจาก cached hospitals (0 reads)
      const hospList = await api.getHospitalsMap({ forceRefresh });
      const foundHosp = hospList.find(h => h.name.toLowerCase() === cleanTarget);
      if (foundHosp && foundHosp.lastUploadTime && foundHosp.lastUploadTime !== 'ยังไม่มีการอัปโหลด') {
        latestUploadDate = foundHosp.lastUploadTime;
        const upDate = new Date(foundHosp.lastUploadTime);
        if (!isNaN(upDate.getTime())) {
          const diffMs = Date.now() - upDate.getTime();
          daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
      }

      // 2. นับจำนวนเครื่องเฉพาะสาขานี้ ด้วย getCountFromServer (ลดจาก 10,000+ reads เหลือ 1 read!)
      let count = 0;
      try {
        const targetName = hospitalName.trim();
        const q1 = query(collection(db, 'devices'), where('Hospital_Name', '==', targetName));
        const countSnap1 = await getCountFromServer(q1);
        count = countSnap1.data().count;

        if (count === 0) {
          const q2 = query(collection(db, 'devices'), where('โรงพยาบาล', '==', targetName));
          const countSnap2 = await getCountFromServer(q2);
          count = countSnap2.data().count;
        }

        // If targetName has "โรงพยาบาล" prefix or doesn't, try stripped/added version
        if (count === 0) {
          const altName = targetName.startsWith('โรงพยาบาล') 
            ? targetName.replace('โรงพยาบาล', '').trim()
            : `โรงพยาบาล${targetName}`;
          const q3 = query(collection(db, 'devices'), where('Hospital_Name', '==', altName));
          const countSnap3 = await getCountFromServer(q3);
          count = countSnap3.data().count;
        }
      } catch (err) {
        console.warn("Count devices error:", err);
      }

      if (count === 0 && foundHosp && foundHosp.deviceCount) {
        count = Number(foundHosp.deviceCount) || 0;
      }

      const statResult = {
        count,
        latestUploadDate,
        daysAgo,
        time: now
      };

      cache.deviceStats[cleanTarget] = statResult;
      return statResult;
    } catch (error) {
      console.error("Firebase getBranchDeviceStats Error:", error);
      return { count: 0, latestUploadDate: null, daysAgo: null };
    }
  },

  // ---------------------------------------------------------
  // 5. ดึงรายการแจ้งเตือนที่ตรงกับสาขา (Branch Alerts พร้อม Normalize ทุกฟิลด์)
  // ---------------------------------------------------------
  getMatchedAlertsForHospital: async (hospitalName, forceRefresh = false) => {
    if (!hospitalName) return [];
    try {
      const cleanTargetHosp = String(hospitalName).trim().toLowerCase();
      const now = Date.now();

      // Check Cached Matched Alerts (Fetch 1 time for all branches)
      if (forceRefresh || !cache.matched || (now - cache.matchedTime > CACHE_TTL.MATCHED)) {
        const snap = await getDocs(collection(db, 'matchedAlerts'));
        cache.matched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cache.matchedTime = now;
      }
      
      const results = [];
      (cache.matched || []).forEach(data => {
        const hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        
        if (cleanTargetHosp === 'all' || cleanTargetHosp === 'ทั้งหมด' || hName.toLowerCase() === cleanTargetHosp) {
          const deviceCode = String(data.Device_Code || data.Device_ID || data['รหัสเครื่องมือ'] || data['รหัสเครื่อง'] || '');
          const assetId = String(data.Asset_ID || data.Asset_No || data['เลขคุรุภัณฑ์'] || data['เลขครุภัณฑ์'] || '');
          const brand = String(data.Brand || data.Device_Brand || data['ยี่ห้อ'] || '');
          const model = String(data.Model || data.Device_Model || data['รุ่น'] || '');
          const dept = String(data.Department || data['แผนก'] || data.dept || '');
          const rawAlertId = String(data.Alert_ID || data.Alert_Id || data['รหัสแจ้งเตือน'] || '');
          const alertId = getCleanAlertCode(data, rawAlertId);
          const alertHeadline = String(data.Headline || data.Alert_Title || data['หัวข้อแจ้งเตือน'] || data.alertHeadline || '');
          const alertDate = String(data.Alert_Publication_Date || data.Alert_Date || data['วันที่ประกาศ'] || data.alertDate || '');
          const source = String(data.Source || data['แหล่งข้อมูล'] || data.alertSource || (String(alertId).startsWith('ECRI') || String(rawAlertId).startsWith('ECRI') ? 'ECRI' : 'FDA'));
          const confidence = String(data.Confidence || data.Match_Confidence || data['ระดับความชัดเจน'] || 'HIGH');
          const matchReason = String(data.Match_Reason || data.AI_Reason || data['เหตุผลการจับคู่'] || '');
          const aiSummary = String(data.AI_Summary || data['แปลสรุปข่าว'] || '');
          const aiSymptoms = String(data.AI_Symptoms || data['การวิเคราะห์อาการและความเสี่ยง'] || '');
          const aiActionPlan = Array.isArray(data.AI_Action_Plan) ? data.AI_Action_Plan : (data['แนวทางปฏิบัติการแก้ไข'] ? String(data['แนวทางปฏิบัติการแก้ไข']).split('\n').filter(Boolean) : []);
          const aiAnalysis = data.AI_Analysis || (aiSummary ? {
            riskLevel: 'ความเสี่ยงสูง (High Risk)',
            confidence: '95%',
            matchReason,
            summary: aiSummary,
            symptoms: aiSymptoms,
            actionPlan: aiActionPlan,
            explanation: aiSummary
          } : null);
          const status = String(data.Status || data['สถานะการตรวจสอบ'] || data['สถานะ'] || 'รอยืนยัน');
          const certifiedBy = String(data.Certifier_Name || data['ชื่อผู้รับรอง'] || data.certifiedBy || '');
          const certifyDate = String(data.Certified_Date || data['วันเวลารับรอง'] || data.certifyDate || '');
          const comment = String(data.Certify_Comment || data['ข้อสังเกตเพิ่มเติม'] || data.comment || '');
          const toolName = String(data.Tool_Name || data.Device_Name || data['ชื่อเครื่องมือ'] || data['ชนิดเครื่องมือ'] || '');
          const trackingStatus = data.trackingStatus || (status === 'จริง' || status === 'รับรองแล้ว' ? 'กำลังดำเนินการ' : '');
          const isCompleted = trackingStatus === 'เสร็จสิ้น';

          results.push({
            id: data.id,
            docId: data.id,
            hospital: hName,
            hospitalName: hName,
            deviceCode,
            deviceId: deviceCode,
            assetId,
            brand,
            model,
            dept,
            source,
            alertId,
            rawAlertId,
            alertHeadline,
            headline: alertHeadline,
            alertDate,
            confidence,
            matchReason,
            aiSummary,
            aiSymptoms,
            aiActionPlan,
            aiAnalysis,
            status,
            certifyStatus: status,
            certifiedBy,
            certifier: certifiedBy,
            certifyDate,
            comment,
            toolName: toolName || `${brand} ${model}`.trim() || deviceCode,
            actions: data.actions || [],
            trackingStatus: trackingStatus,
            isCompleted: isCompleted
          });
        }
      });
      return results;
    } catch (error) {
      console.error("Firebase getMatchedAlertsForHospital Error:", error);
      return [];
    }
  },

  // ---------------------------------------------------------
  // 6. ดึงผลวิเคราะห์ AI แบบเจาะจง (Persistent AI Analysis)
  // ---------------------------------------------------------
  getPersistentAIAnalysis: async (brand, model, alertId, itemData = {}) => {
    try {
      const cleanBrand = String(brand || '').trim().toLowerCase();
      const cleanModel = String(model || '').trim().toLowerCase();
      const cleanAlertId = String(alertId || '').trim().toLowerCase();

      // Look in cached matchedAlerts first (0 reads)
      if (!cache.matched) {
        await api.getMatchedAlertsForHospital('all');
      }

      let matchedDoc = null;
      for (const data of (cache.matched || [])) {
        const dBrand = String(data.Brand || data.Device_Brand || data['ยี่ห้อ'] || '').trim().toLowerCase();
        const dModel = String(data.Model || data.Device_Model || data['รุ่น'] || '').trim().toLowerCase();
        const dAlertId = String(data.Alert_ID || data['รหัสแจ้งเตือน'] || '').trim().toLowerCase();

        if (dAlertId === cleanAlertId && (dBrand === cleanBrand || dModel === cleanModel || (!cleanModel && !cleanBrand))) {
          matchedDoc = data;
          if (data.AI_Analysis && typeof data.AI_Analysis === 'object' && data.AI_Analysis.summary) {
            return data.AI_Analysis;
          }
          if (data.AI_Summary || data['แปลสรุปข่าว']) {
            return {
              riskLevel: 'ความเสี่ยงสูง (High Risk)',
              confidence: data.Confidence || data.Match_Confidence || '95%',
              matchReason: data.Match_Reason || data.AI_Reason || data['เหตุผลการจับคู่'] || `ยี่ห้อ ${brand} และรุ่น ${model} ตรงกับประกาศเตือนภัย`,
              summary: data.AI_Summary || data['แปลสรุปข่าว'] || '',
              symptoms: data.AI_Symptoms || data['การวิเคราะห์อาการและความเสี่ยง'] || '',
              actionPlan: Array.isArray(data.AI_Action_Plan) ? data.AI_Action_Plan : (data['แนวทางปฏิบัติการแก้ไข'] ? String(data['แนวทางปฏิบัติการแก้ไข']).split('\n').filter(Boolean) : []),
              explanation: data.AI_Summary || ''
            };
          }
          break;
        }
      }

      // ถ้ายังไม่มีรายละเอียด ให้เรียก AI เพื่อวิเคราะห์
      const aiSettings = await api.getGeminiApiKeySettings();
      const apiKey = aiSettings?.key?.trim();
      
      if (apiKey) {
        let alertDocData = null;
        if (cleanAlertId) {
          // Direct single-document lookup (1 read แทน 3,000 reads!)
          try {
            const ecriDocRef = doc(db, 'ecri', alertId);
            const ecriDocSnap = await getDoc(ecriDocRef);
            if (ecriDocSnap.exists()) {
              alertDocData = { ...ecriDocSnap.data(), source: 'ECRI' };
            } else {
              const fdaDocRef = doc(db, 'fda', alertId);
              const fdaDocSnap = await getDoc(fdaDocRef);
              if (fdaDocSnap.exists()) {
                alertDocData = { ...fdaDocSnap.data(), source: 'FDA' };
              }
            }
          } catch {}
        }

        if (!alertDocData) {
          alertDocData = {
            id: alertId,
            Headline: itemData.alertHeadline || itemData.headline || `ประกาศแจ้งเตือน ${alertId}`,
            Description: itemData.alertHeadline || itemData.headline || '',
            source: itemData.source || (String(alertId).startsWith('ECRI') ? 'ECRI' : 'FDA')
          };
        }

        const deepAnalysis = await analyzeSingleAlertWithAI(alertDocData, { brand, model }, apiKey);

        // บันทึกกลับลง Firestore ใน matchedAlerts และอัปเดต cache
        if (matchedDoc && matchedDoc.id) {
          const docRef = doc(db, 'matchedAlerts', matchedDoc.id);
          await updateDoc(docRef, {
            AI_Analysis: deepAnalysis,
            AI_Summary: deepAnalysis.summary,
            AI_Symptoms: deepAnalysis.symptoms,
            AI_Action_Plan: deepAnalysis.actionPlan,
            'แปลสรุปข่าว': deepAnalysis.summary,
            'การวิเคราะห์อาการและความเสี่ยง': deepAnalysis.symptoms,
            'แนวทางปฏิบัติการแก้ไข': Array.isArray(deepAnalysis.actionPlan) ? deepAnalysis.actionPlan.join('\n') : deepAnalysis.actionPlan
          });
          cache.invalidateMatches();
        }

        return deepAnalysis;
      }

      // Fallback
      return {
        riskLevel: 'ความเสี่ยงสูง (High Risk)',
        confidence: '95%',
        matchReason: `ยี่ห้อ ${brand || '-'} และรุ่น ${model || '-'} ตรงกับประกาศเตือนภัย ${alertId}`,
        summary: `ประกาศแจ้งเตือนภัยด้านความปลอดภัยระบุถึงอุปกรณ์ ${brand || ''} ${model || ''} โปรดระมัดระวังในการใช้งาน`,
        symptoms: `อาจเกิดความผิดปกติในระบบการทำงานของอุปกรณ์ มีความเสี่ยงต่อการรักษาพยาบาลและความปลอดภัยของผู้ป่วย`,
        actionPlan: [
          '1. ตรวจสอบ Serial Number ของเครื่องกับช่วงที่ระบุในประกาศฉบับเต็ม',
          '2. ตรวจสอบอาการผิดปกติและการทำงานของเครื่องมือแพทย์',
          '3. ติดต่อตัวแทนจำหน่าย (Vendor) เพื่อประสานงานขอชุดอัปเกรดหรือการแก้ไขจากผู้ผลิต',
          '4. บันทึกผลการตรวจสอบในระบบ และรายงานหัวหน้างานเพื่อเฝ้าระวังความปลอดภัย'
        ]
      };
    } catch (error) {
      console.error("Firebase getPersistentAIAnalysis Error:", error);
      return { error: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 7. ระบบติดตามสถานะการดำเนินงาน (Action Tracking)
  // ---------------------------------------------------------
  getTrackingCases: async (hospitalFilter = 'ทั้งหมด', forceRefresh = false) => {
    try {
      const now = Date.now();
      if (forceRefresh || !cache.matched || (now - cache.matchedTime > CACHE_TTL.MATCHED)) {
        const snap = await getDocs(collection(db, 'matchedAlerts'));
        cache.matched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cache.matchedTime = now;
      }

      const results = [];
      const cleanFilter = String(hospitalFilter || 'ทั้งหมด').trim().toLowerCase();
      
      (cache.matched || []).forEach(data => {
        const status = String(data.Status || data['สถานะการตรวจสอบ'] || data['สถานะ'] || '').trim();
        const hosp = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        
        // กรองเฉพาะเคสที่ "จริง" หรือ "รับรองแล้ว"
        if (status === 'จริง' || status === 'รับรองแล้ว') {
          if (cleanFilter !== 'ทั้งหมด' && cleanFilter !== 'all' && hosp.toLowerCase() !== cleanFilter) {
            return;
          }
          
          let actions = data.actions || [];
          
          if (actions.length === 0) {
            const certName = data.Certifier_Name || data['ชื่อผู้รับรอง'] || data.certifyName || '';
            const certDate = data.Certified_Date || data['วันเวลารับรอง'] || data.certifyDate || '';
            actions.push({
              actionId: 1,
              detail: 'เจ้าหน้าที่ตรวจรับรองความเสี่ยงแล้ว (ชื่อ: ' + certName + ')',
              date: certDate,
              isFinal: false
            });
          }
          
          const rawAlertId = String(data.Alert_ID || data['รหัสแจ้งเตือน'] || '');
          const alertId = getCleanAlertCode(data, rawAlertId);
          
          results.push({
            id: data.id,
            hospitalName: hosp,
            deviceCode: String(data.Device_Code || data.Device_ID || data['รหัสเครื่องมือ'] || ''),
            deviceBrandModel: String(data.Brand || data['ยี่ห้อ'] || '') + ' ' + String(data.Model || data['รุ่น'] || ''),
            department: String(data.Department || data['แผนก'] || ''),
            alertId: alertId,
            rawAlertId: rawAlertId,
            alertSource: String(data.Source || data['แหล่งข้อมูล'] || (String(alertId).startsWith('ECRI') ? 'ECRI' : 'FDA')),
            alertHeadline: String(data.Headline || data.Alert_Title || data['หัวข้อแจ้งเตือน'] || data.Match_Reason || ''),
            riskLevel: String(data.Risk_Level || 'ความเสี่ยงสูง'),
            certifyName: String(data.Certifier_Name || data['ชื่อผู้รับรอง'] || ''),
            trackingStatus: String(data.trackingStatus || 'กำลังดำเนินการ'),
            actions: actions
          });
        }
      });
      
      return results.reverse();
    } catch (error) {
      console.error("Firebase getTrackingCases Error:", error);
      return [];
    }
  },

  addTrackingAction: async (hospitalName, deviceCode, alertId, newActionDetail, newActionDate, isFinal) => {
    try {
      const snap = await getDocs(collection(db, 'matchedAlerts'));
      let targetDocRef = null;
      let data = null;

      const cleanHosp = String(hospitalName).trim().toLowerCase();
      const cleanDev = String(deviceCode).trim().toLowerCase();
      const cleanAlert = String(alertId).trim().toLowerCase();

      for (const d of snap.docs) {
        const item = d.data();
        const h = String(item.Hospital_Name || item['โรงพยาบาล'] || '').trim().toLowerCase();
        const dev = String(item.Device_Code || item.Device_ID || item['รหัสเครื่องมือ'] || '').trim().toLowerCase();
        const rawAl = String(item.Alert_ID || item['รหัสแจ้งเตือน'] || '').trim().toLowerCase();
        const cleanAl = getCleanAlertCode(item, rawAl).toLowerCase();

        if (h === cleanHosp && dev === cleanDev && (rawAl === cleanAlert || cleanAl === cleanAlert || d.id.includes(cleanAlert) || d.id === `${rawAl}_${dev}`)) {
          targetDocRef = d.ref;
          data = item;
          break;
        }
      }
      
      if (!targetDocRef || !data) {
        return { success: false, message: 'ไม่พบเคสในระบบ (Firestore)' };
      }
      
      let actions = data.actions || [];
      
      if (actions.length === 0) {
        const certName = data.Certifier_Name || data['ชื่อผู้รับรอง'] || '';
        const certDate = data.Certified_Date || data['วันเวลารับรอง'] || '';
        actions.push({
          actionId: 1,
          detail: 'เจ้าหน้าที่ตรวจรับรองความเสี่ยงแล้ว (ชื่อ: ' + certName + ')',
          date: certDate,
          isFinal: false
        });
      }
      
      const newActionId = actions.length + 1;
      actions.push({
        actionId: newActionId,
        detail: newActionDetail,
        date: newActionDate,
        isFinal: isFinal
      });
      
      const trackingStatus = isFinal ? 'เสร็จสิ้น' : 'กำลังดำเนินการ';
      
      await setDoc(targetDocRef, {
        actions: actions,
        trackingStatus: trackingStatus
      }, { merge: true });
      
      cache.invalidateMatches();
      await logSystemActivity(`บันทึกการแก้ไขเครื่อง ${deviceCode} [${trackingStatus}]`, 'Action Tracking', actions.length, 'Success');

      return { success: true, message: 'บันทึกสถานะเรียบร้อยแล้ว!' };
    } catch (error) {
      console.error("Firebase addTrackingAction Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 8. ยืนยันรับรองผลการจับคู่ (Certify Matched Alert)
  // ---------------------------------------------------------
  certifyMatchedAlert: async (hospitalName, deviceCode, alertId, certName, comment, certifyResult) => {
    try {
      const snap = await getDocs(collection(db, 'matchedAlerts'));
      let targetDocRef = null;

      const cleanHosp = String(hospitalName).trim().toLowerCase();
      const cleanDev = String(deviceCode).trim().toLowerCase();
      const cleanAlert = String(alertId).trim().toLowerCase();

      for (const d of snap.docs) {
        const data = d.data();
        const h = String(data.Hospital_Name || data['โรงพยาบาล'] || '').trim().toLowerCase();
        const dev = String(data.Device_Code || data.Device_ID || data['รหัสเครื่องมือ'] || '').trim().toLowerCase();
        const rawAl = String(data.Alert_ID || data['รหัสแจ้งเตือน'] || '').trim().toLowerCase();
        const cleanAl = getCleanAlertCode(data, rawAl).toLowerCase();

        if (h === cleanHosp && dev === cleanDev && (rawAl === cleanAlert || cleanAl === cleanAlert || d.id.includes(cleanAlert) || d.id === `${rawAl}_${dev}`)) {
          targetDocRef = d.ref;
          break;
        }
      }
      
      if (!targetDocRef) {
        return { success: false, message: 'ไม่พบเคสในระบบ (Firestore)' };
      }
      
      // ถ้าไม่เกี่ยวข้อง (เท็จ) ลบเคสทิ้งไปเลย
      if (certifyResult === 'เท็จ' || certifyResult === 'ปฏิเสธ') {
        await deleteDoc(targetDocRef);
        cache.invalidateMatches();
        await logSystemActivity(`ลบเคสไม่เกี่ยวข้อง (เท็จ): ${hospitalName} เครื่อง ${deviceCode}`, 'Reject Alert', 1, 'Success');
        return { success: true, message: 'ลบเคสที่ไม่เกี่ยวข้องออกจากระบบเรียบร้อยแล้ว' };
      }
      
      // ถ้าเกี่ยวข้อง (จริง) ให้อัปเดต Status เป็น 'จริง'
      await setDoc(targetDocRef, {
        Status: certifyResult,
        'สถานะการตรวจสอบ': certifyResult,
        Certifier_Name: certName,
        'ชื่อผู้รับรอง': certName,
        Certified_Date: new Date().toISOString(),
        'วันเวลารับรอง': new Date().toISOString(),
        Certify_Comment: comment,
        'ข้อสังเกตเพิ่มเติม': comment,
        trackingStatus: 'กำลังดำเนินการ'
      }, { merge: true });
      
      cache.invalidateMatches();
      await logSystemActivity(`รับรองความเสี่ยง (จริง): ${hospitalName} เครื่อง ${deviceCode} โดย ${certName}`, 'Certify True', 1, 'Success');

      return { success: true, message: 'บันทึกการรับรองเรียบร้อยแล้ว!' };
    } catch (error) {
      console.error("Firebase certifyMatchedAlert Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 9. รายชื่อโรงพยาบาล (Hospitals Map - พร้อม Cache 30 นาที)
  // ---------------------------------------------------------
  getHospitalsMap: async (options = {}) => {
    try {
      const now = Date.now();
      const forceRefresh = options.forceRefresh || false;

      if (!forceRefresh && cache.hospitals && (now - cache.hospitalsTime < CACHE_TTL.HOSPITALS)) {
        return cache.hospitals;
      }

      const snap = await getDocs(collection(db, 'hospitals'));
      const hospitals = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data['รายชื่อโรงพยาบาล'] || data.Hospital_Name || data.name || '',
          email: data['อีเมล'] || data.Admin_Email || data.Email || '',
          lastUploadTime: data['อัปเดตล่าสุด'] || data.Last_Upload_Time || data.Last_Update || 'ยังไม่มีการอัปโหลด',
          deviceCount: data.deviceCount || data['จำนวนเครื่อง'] || 0
        };
      });

      const sorted = hospitals
        .filter(h => h.name && h.name.trim() !== '')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      cache.hospitals = sorted;
      cache.hospitalsTime = now;
      return sorted;
    } catch (error) {
      console.error("Firebase getHospitalsMap Error:", error);
      return [];
    }
  },

  addHospitalToList: async (hospitalName, email = '') => {
    if (!hospitalName || !hospitalName.trim()) return { success: false, message: 'ชื่อโรงพยาบาลว่างเปล่า' };
    try {
      const docRef = doc(collection(db, 'hospitals'));
      await setDoc(docRef, {
        'รายชื่อโรงพยาบาล': hospitalName.trim(),
        'อีเมล': email.trim(),
        'อัปเดตล่าสุด': new Date().toISOString()
      });
      cache.hospitals = null;
      cache.dashboard = {};
      return { success: true, message: `เพิ่มโรงพยาบาล ${hospitalName} สำเร็จ` };
    } catch (error) {
      console.error("Firebase addHospital Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  deleteDevicesByHospital: async (hospitalName) => {
    if (!hospitalName) return { success: false, message: 'กรุณาระบุชื่อโรงพยาบาล' };
    try {
      const q = query(collection(db, 'devices'), where('Hospital_Name', '==', hospitalName.trim()));
      const snap = await getDocs(q);
      const toDelete = snap.docs.map(d => d.ref);

      if (toDelete.length > 0) {
        for (let i = 0; i < toDelete.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = toDelete.slice(i, i + 500);
          chunk.forEach(ref => batch.delete(ref));
          await batch.commit();
        }
      }

      cache.invalidateDevices(hospitalName);
      
      return { success: true, message: `ลบข้อมูลเครื่องมือแพทย์ของ ${hospitalName} จำนวน ${toDelete.length} รายการ สำเร็จ`, deletedCount: toDelete.length };
    } catch (error) {
      console.error("Firebase deleteDevicesByHospital Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  resetAllMatches: async () => {
    try {
      const matchedSnap = await getDocs(collection(db, 'matchedAlerts'));
      if (!matchedSnap.empty) {
        for (let i = 0; i < matchedSnap.docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = matchedSnap.docs.slice(i, i + 500);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      const ecriSnap = await getDocs(collection(db, 'ecri'));
      if (!ecriSnap.empty) {
        for (let i = 0; i < ecriSnap.docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = ecriSnap.docs.slice(i, i + 500);
          chunk.forEach(d => {
            if (d.data().Matched === 'MATCHED') {
              batch.update(d.ref, { Matched: '' });
            }
          });
          await batch.commit();
        }
      }

      const fdaSnap = await getDocs(collection(db, 'fda'));
      if (!fdaSnap.empty) {
        for (let i = 0; i < fdaSnap.docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = fdaSnap.docs.slice(i, i + 500);
          chunk.forEach(d => {
            if (d.data().Matched === 'MATCHED') {
              batch.update(d.ref, { Matched: '' });
            }
          });
          await batch.commit();
        }
      }

      cache.invalidateAll();
      return { success: true, message: 'ล้างข้อมูลการจับคู่ทั้งหมด และรีเซ็ตสถานะข่าวกรองเรียบร้อยแล้ว' };
    } catch (error) {
      console.error("Firebase resetAllMatches Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 10. อัปโหลดข้อมูลครุภัณฑ์แบบ Batch (Upsert)
  // ---------------------------------------------------------
  saveDevicesBatch: async (devices, hospitalName, onProgress) => {
    try {
      if (onProgress) onProgress("กำลังเตรียมบันทึกข้อมูล...", 10);
      
      for (let i = 0; i < devices.length; i += 500) {
        if (onProgress) onProgress(`กำลังบันทึกข้อมูล (${Math.min(i + 500, devices.length)}/${devices.length})...`, 10 + (90 * (i/devices.length)));
        const batch = writeBatch(db);
        const chunk = devices.slice(i, i + 500);
        
        chunk.forEach(deviceData => {
          const cleanHosp = String(hospitalName).replace(/[\/\\#?]/g, '');
          const cleanId = String(deviceData.Device_Code).replace(/[\/\\#?]/g, '');
          const docId = `${cleanHosp}_${cleanId}`;
          
          const docRef = doc(db, 'devices', docId);
          batch.set(docRef, {
            ...deviceData,
            Hospital_Name: hospitalName,
            'โรงพยาบาล': hospitalName
          }, { merge: true });
        });
        await batch.commit();
      }

      // Update hospital's last upload timestamp & deviceCount
      try {
        const hospList = await api.getHospitalsMap();
        const targetHosp = hospList.find(h => h.name.trim() === hospitalName.trim());
        if (targetHosp && targetHosp.id) {
          const docRef = doc(db, 'hospitals', targetHosp.id);
          await setDoc(docRef, {
            'อัปเดตล่าสุด': new Date().toISOString(),
            Last_Upload_Time: new Date().toISOString(),
            deviceCount: devices.length
          }, { merge: true });
        }
      } catch (err) {
        console.error("Update hospital upload timestamp error:", err);
      }
      
      cache.invalidateDevices(hospitalName);
      if (onProgress) onProgress("บันทึกข้อมูลเสร็จสมบูรณ์", 100);
      await logSystemActivity(`นำเข้าทะเบียนครุภัณฑ์สาขา ${hospitalName}`, 'Import Devices', devices.length, 'Success');
      return { success: true, message: `นำเข้าครุภัณฑ์แบบ Upsert จำนวน ${devices.length} รายการเรียบร้อยแล้ว` };
    } catch (error) {
      console.error("Firebase saveDevicesBatch Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 11. ดึงวันที่ข่าวที่ประมวลผลแล้ว (Processed Dates)
  // ---------------------------------------------------------
  getProcessedDates: async () => {
    try {
      const now = Date.now();
      if (cache.processedDates && (now - cache.processedDatesTime < CACHE_TTL.PROCESSED_DATES)) {
        return { dates: cache.processedDates };
      }

      const allAlerts = await api.getAlertsFromDatabase('all');
      const datesSet = new Set();
      allAlerts.forEach(a => {
        if (a.date && a.date.length >= 10) {
          datesSet.add(a.date.substring(0, 10));
        }
      });

      const dates = Array.from(datesSet).sort().reverse();
      cache.processedDates = dates;
      cache.processedDatesTime = now;
      return { dates };
    } catch (error) {
      console.error("Firebase getProcessedDates Error:", error);
      return { dates: [] };
    }
  },

  // ---------------------------------------------------------
  // 12. ประวัติกิจกรรมระบบล่าสุด (System Logs / Activities)
  // ---------------------------------------------------------
  getRecentSystemActivities: async () => {
    try {
      const logsQuery = query(collection(db, 'logs'), limit(25));
      const logsSnap = await getDocs(logsQuery);
      if (!logsSnap.empty) {
        const list = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return list;
      }

      // Return default activities without performing full collection reads
      return [
        {
          activity: 'ระบบตรวจสอบความปลอดภัยเครื่องมือแพทย์พร้อมทำงาน',
          type: 'System Ready',
          count: 1,
          status: 'Success',
          time: 'ระบบประมวลผลเรียลไทม์'
        }
      ];
    } catch (error) {
      console.error("Firebase getRecentSystemActivities Error:", error);
      return [];
    }
  },

  // ---------------------------------------------------------
  // 13. Admin Settings (API Keys & Telegram)
  // ---------------------------------------------------------
  getTelegramSettings: async () => {
    try {
      const docRef = doc(db, 'settings', 'telegram');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return { botToken: '', chatId: '' };
    } catch (error) {
      console.error("Firebase getTelegramSettings Error:", error);
      return { botToken: '', chatId: '' };
    }
  },

  saveTelegramSettings: async (botToken, chatId) => {
    try {
      await setDoc(doc(db, 'settings', 'telegram'), { botToken, chatId }, { merge: true });
      return { success: true, message: 'บันทึกการตั้งค่า Telegram สำเร็จ' };
    } catch (error) {
      console.error("Firebase saveTelegramSettings Error:", error);
      return { success: false, message: 'เกิดข้อผิดพลาดในการบันทึก' };
    }
  },

  getGeminiApiKeySettings: async () => {
    try {
      const docRef = doc(db, 'settings', 'ai_keys');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return { key: '' };
    } catch (error) {
      console.error("Firebase getGeminiApiKeySettings Error:", error);
      return { key: '' };
    }
  },

  saveGeminiApiKey: async (key) => {
    try {
      await setDoc(doc(db, 'settings', 'ai_keys'), { key }, { merge: true });
      return { success: true, message: 'บันทึก API Key สำเร็จ' };
    } catch (error) {
      console.error("Firebase saveGeminiApiKey Error:", error);
      return { success: false, message: 'เกิดข้อผิดพลาดในการบันทึก' };
    }
  },

  // ---------------------------------------------------------
  // 13.1 บันทึกและดึงข้อความแจ้งเตือนสรุปล่าสุด (LINE & Telegram Alert Message)
  // ---------------------------------------------------------
  saveLatestAlertMessage: async (message) => {
    try {
      if (!message) return { success: false };
      const now = new Date();
      const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('LATEST_AI_ALERT_MESSAGE', message);
      }

      await setDoc(doc(db, 'settings', 'latest_alert_message'), {
        message: message,
        updatedAt: new Date().toISOString(),
        timeFormatted: `${dateStr} เวลา ${timeStr} น.`,
        timestamp: Date.now()
      }, { merge: true });

      return { success: true };
    } catch (error) {
      console.warn("Firebase saveLatestAlertMessage Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  getLatestAlertMessage: async () => {
    try {
      let localMsg = '';
      if (typeof window !== 'undefined' && window.localStorage) {
        localMsg = localStorage.getItem('LATEST_AI_ALERT_MESSAGE') || '';
      }

      const snap = await getDoc(doc(db, 'settings', 'latest_alert_message'));
      if (snap.exists() && snap.data()?.message) {
        const remoteMsg = snap.data().message;
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('LATEST_AI_ALERT_MESSAGE', remoteMsg);
        }
        return remoteMsg;
      }

      return localMsg || '';
    } catch (error) {
      console.warn("Firebase getLatestAlertMessage Error:", error);
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem('LATEST_AI_ALERT_MESSAGE') || '';
      }
      return '';
    }
  },

  // ---------------------------------------------------------
  // 14. AI Matching Jobs
  // ---------------------------------------------------------
  runMatchingJobForAllUnprocessed: async (onProgress) => {
    try {
      const ecriSnap = await getDocs(collection(db, 'ecri'));
      const fdaSnap = await getDocs(collection(db, 'fda'));
      
      const unprocessedAlerts = [];

      ecriSnap.docs.forEach(d => {
        const data = d.data();
        if (data.Matched !== 'MATCHED' && data.Matched !== 'Y' && data.Matched !== true) {
          unprocessedAlerts.push({ ...data, id: d.id, source: 'ECRI' });
        }
      });

      fdaSnap.docs.forEach(d => {
        const data = d.data();
        if (data.Matched !== 'MATCHED' && data.Matched !== 'Y' && data.Matched !== true) {
          unprocessedAlerts.push({ ...data, id: d.id, source: 'FDA' });
        }
      });

      if (unprocessedAlerts.length === 0) {
        return { success: true, message: 'ไม่มีประกาศใหม่ที่ค้างตรวจสอบให้ประมวลผล', matchedCount: 0 };
      }

      unprocessedAlerts.sort((a, b) => {
        const dateA = new Date(a['Alert Publication Date'] || a.Alert_Date || a.POSTED_INTERNET_DT || a.EVENT_DATE_INITIATED || 0);
        const dateB = new Date(b['Alert Publication Date'] || b.Alert_Date || b.POSTED_INTERNET_DT || b.EVENT_DATE_INITIATED || 0);
        return dateB - dateA;
      });

      const newestUnprocessedDate = new Date(
        unprocessedAlerts[0]['Alert Publication Date'] || 
        unprocessedAlerts[0].Alert_Date || 
        unprocessedAlerts[0].POSTED_INTERNET_DT || 
        unprocessedAlerts[0].EVENT_DATE_INITIATED || 
        new Date()
      );
      
      const windowStartDate = new Date(newestUnprocessedDate);
      windowStartDate.setDate(windowStartDate.getDate() - 15);

      const alertsToProcess = unprocessedAlerts.filter(a => {
        const d = new Date(a['Alert Publication Date'] || a.Alert_Date || a.POSTED_INTERNET_DT || a.EVENT_DATE_INITIATED || 0);
        return d >= windowStartDate;
      });

      return await runAIMatchingJob(alertsToProcess, onProgress);

    } catch (error) {
      console.error("Firebase runMatchingJob Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 15. ส่งออกไฟล์ Excel รายงานรายปี (KPI Report Export - FP-BME-00-031_2 แบบตกแต่งเต็มรูปแบบ)
  // ---------------------------------------------------------
  getYearlyExportExcel: async (hospital, year, sourceType = 'ECRI') => {
    try {
      const srcType = String(sourceType || 'ECRI').toUpperCase();
      const targetYear = parseInt(year, 10) || new Date().getFullYear();
      const cleanHosp = String(hospital || 'ทั้งหมด').trim();
      const priorityMap = new Map();

      // 12 months array (Jan to Dec, 0 to 11)
      const aggrTotal = Array.from({ length: 12 }, () => ({
        periods: {
          p1: { c1: 0, c2: 0, c3: 0, c4: 0 },
          p2: { c1: 0, c2: 0, c3: 0, c4: 0 },
          p3: { c1: 0, c2: 0, c3: 0, c4: 0 }
        }
      }));

      const aggrMatched = Array.from({ length: 12 }, () => ({
        periods: {
          p1: { c1: 0, c2: 0, c3: 0, c4: 0 },
          p2: { c1: 0, c2: 0, c3: 0, c4: 0 },
          p3: { c1: 0, c2: 0, c3: 0, c4: 0 }
        }
      }));

      // 1. Fetch Total Source Alerts (from ecri or fda collection)
      const colName = srcType === 'FDA' ? 'fda' : 'ecri';
      const alertSnap = await getDocs(collection(db, colName));

      alertSnap.docs.forEach(doc => {
        const data = doc.data();
        let alertId, priorityStr, pubDate;

        if (srcType === 'ECRI') {
          alertId = String(data['Accession Number'] || data.Alert_ID || data.id || doc.id).trim();
          priorityStr = String(data.Priority || data.priority || data.Risk_Level || '').trim().toUpperCase();
          pubDate = data['Alert Publication Date'] || data.Alert_Publication_Date || data.Alert_Date || data.DATE_ADDED || data.date || '';
        } else {
          alertId = String(data.RECALL_NUMBER || data.Alert_ID || data.id || doc.id).trim();
          priorityStr = String(data.RECALL_CLASS || data.Priority || data.Risk_Level || '').trim().toUpperCase();
          pubDate = data.POSTED_INTERNET_DT || data.CENTER_CLASSIFICATION_DT || data.DATE_ADDED || data.Alert_Publication_Date || '';
        }

        priorityMap.set(alertId, priorityStr);
        priorityMap.set(getCleanAlertCode(data, alertId), priorityStr);

        const dInfo = parseDateInfo(pubDate);
        if (!dInfo || dInfo.year !== targetYear) return;

        const monthIdx = dInfo.month;
        const day = dInfo.day;
        if (monthIdx < 0 || monthIdx > 11) return;

        const period = day <= 10 ? 'p1' : (day <= 20 ? 'p2' : 'p3');
        let p = 'c4';

        if (srcType === 'ECRI') {
          if (priorityStr.includes('HIGH')) p = 'c1';
          else if (priorityStr.includes('NORMAL')) p = 'c2';
          else if (priorityStr.includes('CRITICAL')) p = 'c3';
        } else {
          if ((priorityStr.includes('1') || priorityStr.includes('I')) && !priorityStr.includes('II')) p = 'c1';
          else if ((priorityStr.includes('2') || priorityStr.includes('II')) && !priorityStr.includes('III')) p = 'c2';
          else if (priorityStr.includes('3') || priorityStr.includes('III')) p = 'c3';
        }

        aggrTotal[monthIdx].periods[period][p]++;
      });

      // 2. Fetch Matched & Confirmed Alerts for the selected hospital
      const matchedSnap = await getDocs(collection(db, 'matchedAlerts'));
      matchedSnap.docs.forEach(doc => {
        const data = doc.data();
        const status = String(data.Status || data.certifyStatus || data['สถานะการตรวจสอบ'] || '').trim();
        const hosp = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        const sourceRaw = String(data.Source || data['แหล่งข้อมูล'] || (String(data.Alert_ID || '').startsWith('ECRI') ? 'ECRI' : 'FDA')).trim().toUpperCase();

        if (status !== 'จริง' && status !== 'รับรองแล้ว') return;
        if (cleanHosp && cleanHosp !== 'ทั้งหมด' && hosp.toLowerCase() !== cleanHosp.toLowerCase()) return;
        if (!sourceRaw.includes(srcType)) return;

        const rawDate = data.Alert_Publication_Date || data.Alert_Date || data['วันที่ประกาศ'] || data.Matched_At || data.Detect_Date || '';
        const dInfo = parseDateInfo(rawDate);
        if (!dInfo || dInfo.year !== targetYear) return;

        const monthIdx = dInfo.month;
        const day = dInfo.day;
        if (monthIdx < 0 || monthIdx > 11) return;

        const alertId = String(data.Alert_ID || data.Alert_Id || data['รหัสแจ้งเตือน'] || '').trim();
        const priorityStr = priorityMap.get(alertId) || priorityMap.get(getCleanAlertCode(data, alertId)) || String(data.Risk_Level || data.Priority || '').toUpperCase();
        const period = day <= 10 ? 'p1' : (day <= 20 ? 'p2' : 'p3');
        let p = 'c4';

        if (srcType === 'ECRI') {
          if (priorityStr.includes('HIGH')) p = 'c1';
          else if (priorityStr.includes('NORMAL')) p = 'c2';
          else if (priorityStr.includes('CRITICAL')) p = 'c3';
        } else {
          if ((priorityStr.includes('1') || priorityStr.includes('I')) && !priorityStr.includes('II')) p = 'c1';
          else if ((priorityStr.includes('2') || priorityStr.includes('II')) && !priorityStr.includes('III')) p = 'c2';
          else if (priorityStr.includes('3') || priorityStr.includes('III')) p = 'c3';
        }

        aggrMatched[monthIdx].periods[period][p]++;
      });

      // 3. Build Beautifully Styled Workbook with ExcelJS
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Clinical Engineering Service (CES)';
      wb.lastModifiedBy = 'Clinical Engineering Service (CES)';
      wb.created = new Date();
      wb.modified = new Date();

      const darkThinBorder = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };

      // ----------------------------------------------------
      // SHEET 1: Master Summary FP-BME-00-031_2
      // ----------------------------------------------------
      const wsSummary = wb.addWorksheet('FP-BME-00-031_2', {
        views: [{ showGridLines: true }]
      });

      wsSummary.columns = [
        { width: 6 },   // A: Item
        { width: 45 },  // B: KPI
        { width: 14 },  // C: ดัชนีชี้วัด
        { width: 8 },   // D: Jan
        { width: 8 },   // E: Feb
        { width: 8 },   // F: Mar
        { width: 8 },   // G: Apr
        { width: 8 },   // H: May
        { width: 8 },   // I: Jun
        { width: 8 },   // J: Jul
        { width: 8 },   // K: Aug
        { width: 8 },   // L: Sep
        { width: 8 },   // M: Oct
        { width: 8 },   // N: Nov
        { width: 8 },   // O: Dec
      ];

      const headerTitle = srcType === 'ECRI'
        ? `Recall Monitoring and Response Performance Indicator (ECRI) ${targetYear}`
        : `Recall Monitoring and Response Performance Indicator (US FDA) ${targetYear}`;

      wsSummary.mergeCells('A1:O1');
      const titleCell = wsSummary.getCell('A1');
      titleCell.value = headerTitle;
      titleCell.font = { name: 'Angsana New', size: 16, bold: true };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      titleCell.border = darkThinBorder;
      wsSummary.getRow(1).height = 28;

      // Table Header Row 2 & 3
      wsSummary.mergeCells('A2:A3');
      const cA2 = wsSummary.getCell('A2');
      cA2.value = 'Item';
      cA2.font = { name: 'Angsana New', size: 14, bold: true };
      cA2.alignment = { horizontal: 'center', vertical: 'middle' };
      cA2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
      cA2.border = darkThinBorder;

      wsSummary.mergeCells('B2:B3');
      const cB2 = wsSummary.getCell('B2');
      cB2.value = 'KPI';
      cB2.font = { name: 'Angsana New', size: 14, bold: true };
      cB2.alignment = { horizontal: 'center', vertical: 'middle' };
      cB2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
      cB2.border = darkThinBorder;

      wsSummary.mergeCells('C2:C3');
      const cC2 = wsSummary.getCell('C2');
      cC2.value = 'ดัชนีชี้วัด';
      cC2.font = { name: 'Angsana New', size: 14, bold: true };
      cC2.alignment = { horizontal: 'center', vertical: 'middle' };
      cC2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
      cC2.border = darkThinBorder;

      wsSummary.mergeCells('D2:O2');
      const cD2 = wsSummary.getCell('D2');
      cD2.value = 'Month';
      cD2.font = { name: 'Angsana New', size: 14, bold: true };
      cD2.alignment = { horizontal: 'center', vertical: 'middle' };
      cD2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      cD2.border = darkThinBorder;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      monthNames.forEach((m, idx) => {
        const colLetter = String.fromCharCode(68 + idx);
        const mCell = wsSummary.getCell(`${colLetter}3`);
        mCell.value = m;
        mCell.font = { name: 'Angsana New', size: 14, bold: true };
        mCell.alignment = { horizontal: 'center', vertical: 'middle' };
        mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        mCell.border = darkThinBorder;
      });

      // Row 4: Item 1
      wsSummary.getCell('A4').value = 1;
      wsSummary.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
      wsSummary.getCell('B4').value = 'มีการเฝ้าระวัง Hazard Recall Alerts  และได้รับการแก้ไข';
      wsSummary.getCell('C4').value = '100%';
      wsSummary.getCell('C4').alignment = { horizontal: 'center', vertical: 'middle' };
      for (let i = 0; i < 12; i++) {
        const c = wsSummary.getCell(`${String.fromCharCode(68 + i)}4`);
        c.value = '100%';
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Row 5: Item 2
      wsSummary.getCell('A5').value = 2;
      wsSummary.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };
      wsSummary.getCell('B5').value = 'ข้อมูล Recall Impant';
      wsSummary.getCell('C5').value = '';
      for (let i = 0; i < 12; i++) {
        const c = wsSummary.getCell(`${String.fromCharCode(68 + i)}5`);
        c.value = '-';
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Row 6: Item 3
      wsSummary.getCell('A6').value = 3;
      wsSummary.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };
      wsSummary.getCell('B6').value = 'ข้อมูล recall equipment';
      wsSummary.getCell('B6').font = { name: 'Angsana New', size: 14, bold: true };

      if (srcType === 'ECRI') {
        const critVals = [];
        const highVals = [];
        const normVals = [];
        const notpVals = [];

        for (let m = 0; m < 12; m++) {
          const p = aggrTotal[m].periods;
          critVals.push(p.p1.c3 + p.p2.c3 + p.p3.c3);
          highVals.push(p.p1.c1 + p.p2.c1 + p.p3.c1);
          normVals.push(p.p1.c2 + p.p2.c2 + p.p3.c2);
          notpVals.push(p.p1.c4 + p.p2.c4 + p.p3.c4);
        }

        const rows = [
          { row: 7, label: '3.1 Critical Priority', vals: critVals },
          { row: 8, label: '3.2 High Priority', vals: highVals },
          { row: 9, label: '3.3 Normal Priority', vals: normVals },
          { row: 10, label: '3.4 Not Priority', vals: notpVals },
        ];

        rows.forEach(r => {
          wsSummary.getCell(`B${r.row}`).value = r.label;
          r.vals.forEach((v, idx) => {
            const c = wsSummary.getCell(`${String.fromCharCode(68 + idx)}${r.row}`);
            c.value = v;
            c.alignment = { horizontal: 'center', vertical: 'middle' };
          });
        });

        // Row 11: Total Row
        wsSummary.getCell('B11').value = ' Total';
        wsSummary.getCell('B11').font = { name: 'Angsana New', size: 15, bold: true };
        wsSummary.getCell('B11').alignment = { horizontal: 'center', vertical: 'middle' };
        for (let i = 0; i < 12; i++) {
          const colLetter = String.fromCharCode(68 + i);
          const c = wsSummary.getCell(`${colLetter}11`);
          c.value = { formula: `SUM(${colLetter}7:${colLetter}10)` };
          c.font = { name: 'Angsana New', size: 15, bold: true, color: { argb: 'FFFF0000' } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      } else {
        const l3Vals = [];
        const l2Vals = [];
        const l1Vals = [];

        for (let m = 0; m < 12; m++) {
          const p = aggrTotal[m].periods;
          l3Vals.push(p.p1.c3 + p.p2.c3 + p.p3.c3);
          l2Vals.push(p.p1.c2 + p.p2.c2 + p.p3.c2);
          l1Vals.push(p.p1.c1 + p.p2.c1 + p.p3.c1);
        }

        const rows = [
          { row: 7, label: '3.1 Level 3', vals: l3Vals },
          { row: 8, label: '3.2 Level 2', vals: l2Vals },
          { row: 9, label: '3.3 Level 1', vals: l1Vals },
        ];

        rows.forEach(r => {
          wsSummary.getCell(`B${r.row}`).value = r.label;
          r.vals.forEach((v, idx) => {
            const c = wsSummary.getCell(`${String.fromCharCode(68 + idx)}${r.row}`);
            c.value = v;
            c.alignment = { horizontal: 'center', vertical: 'middle' };
          });
        });

        // Row 10: Total Row for FDA
        wsSummary.getCell('B10').value = ' Total';
        wsSummary.getCell('B10').font = { name: 'Angsana New', size: 15, bold: true };
        wsSummary.getCell('B10').alignment = { horizontal: 'center', vertical: 'middle' };
        for (let i = 0; i < 12; i++) {
          const colLetter = String.fromCharCode(68 + i);
          const c = wsSummary.getCell(`${colLetter}10`);
          c.value = { formula: `SUM(${colLetter}7:${colLetter}9)` };
          c.font = { name: 'Angsana New', size: 15, bold: true, color: { argb: 'FFFF0000' } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }

      // Apply borders and fonts to table A1:O11
      const totalSummaryRows = srcType === 'ECRI' ? 11 : 10;
      for (let r = 1; r <= totalSummaryRows; r++) {
        const row = wsSummary.getRow(r);
        for (let col = 1; col <= 15; col++) {
          const cell = row.getCell(col);
          if (!cell.border) cell.border = darkThinBorder;
          if (!cell.font) cell.font = { name: 'Angsana New', size: 14 };
        }
      }

      // ----------------------------------------------------
      // 12 MONTHLY SHEETS (Full Colors & Formulas)
      // ----------------------------------------------------
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      for (let m = 0; m < 12; m++) {
        const mStr = String(m + 1).padStart(2, '0');
        const endDay = new Date(targetYear, m + 1, 0).getDate();
        const yShort = srcType === 'FDA' ? String(targetYear).substring(2, 4) : targetYear;
        const sheetNamePrefix = srcType === 'ECRI' ? 'ECRI' : 'Recall';
        const sheetName = `${sheetNamePrefix} ${months[m]} ${yShort}`;

        const wsMonth = wb.addWorksheet(sheetName, {
          views: [{ showGridLines: true }]
        });

        // Setup Columns & Headers based on source type
        let headerCols = [];
        let endColLetter = 'G';

        if (srcType === 'ECRI') {
          wsMonth.columns = [
            { width: 3 },   // A: Spacing
            { width: 18 },  // B: Date
            { width: 12 },  // C: High
            { width: 12 },  // D: Normal
            { width: 12 },  // E: Critical
            { width: 10 },  // F: Not
            { width: 14 },  // G: Total
          ];
          headerCols = [
            { col: 'B', name: 'Date', bg: 'FF0070C0', textBg: 'FF0070C0' },     // Blue
            { col: 'C', name: 'High', bg: 'FFFF0000', textBg: 'FFFF0000' },     // Red
            { col: 'D', name: 'Normal', bg: 'FFFFC000', textBg: 'FFFFC000' },   // Gold
            { col: 'E', name: 'Critical', bg: 'FF92D050', textBg: 'FF92D050' }, // Lime Green
            { col: 'F', name: 'Not', bg: 'FFA5A5A5', textBg: 'FFA5A5A5' },      // Gray
            { col: 'G', name: 'Total', bg: 'FF0070C0', textBg: 'FF0070C0' }     // Blue
          ];
          endColLetter = 'G';
        } else {
          wsMonth.columns = [
            { width: 3 },   // A: Spacing
            { width: 18 },  // B: Date
            { width: 12 },  // C: Level 1
            { width: 12 },  // D: Level 2
            { width: 12 },  // E: Level 3
            { width: 14 },  // F: Total
          ];
          headerCols = [
            { col: 'B', name: 'Date', bg: 'FFFFFF00', fontColor: 'FF000000' }, // Yellow header
            { col: 'C', name: 'Level 1', bg: 'FFFFFF00', fontColor: 'FF000000' },
            { col: 'D', name: 'Level 2', bg: 'FFFFFF00', fontColor: 'FF000000' },
            { col: 'E', name: 'Level 3', bg: 'FFFFFF00', fontColor: 'FF000000' },
            { col: 'F', name: 'Total', bg: 'FFFFFF00', fontColor: 'FF000000' }
          ];
          endColLetter = 'F';
        }

        // ==========================================
        // Table 1: Total Alerts
        // ==========================================
        // Row 2: Header
        wsMonth.getRow(2).height = 22;
        headerCols.forEach(hc => {
          const cell = wsMonth.getCell(`${hc.col}2`);
          cell.value = hc.name;
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: hc.fontColor || 'FFFFFFFF' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hc.bg } };
          cell.border = darkThinBorder;
        });

        // Rows 3-5: Period Data
        const pTotal = aggrTotal[m].periods;
        const periodsData = [
          { row: 3, label: `01-10/${mStr}/${targetYear}`, p: pTotal.p1 },
          { row: 4, label: `11-20/${mStr}/${targetYear}`, p: pTotal.p2 },
          { row: 5, label: `21-${endDay}/${mStr}/${targetYear}`, p: pTotal.p3 }
        ];

        periodsData.forEach(item => {
          wsMonth.getRow(item.row).height = 20;
          const bCell = wsMonth.getCell(`B${item.row}`);
          bCell.value = item.label;
          bCell.alignment = { horizontal: 'center', vertical: 'middle' };
          bCell.font = { name: 'Arial', size: 10 };
          bCell.border = darkThinBorder;

          const cCell = wsMonth.getCell(`C${item.row}`);
          cCell.value = item.p.c1;
          cCell.alignment = { horizontal: 'center', vertical: 'middle' };
          cCell.font = { name: 'Arial', size: 10 };
          cCell.border = darkThinBorder;

          const dCell = wsMonth.getCell(`D${item.row}`);
          dCell.value = item.p.c2;
          dCell.alignment = { horizontal: 'center', vertical: 'middle' };
          dCell.font = { name: 'Arial', size: 10 };
          dCell.border = darkThinBorder;

          const eCell = wsMonth.getCell(`E${item.row}`);
          eCell.value = item.p.c3;
          eCell.alignment = { horizontal: 'center', vertical: 'middle' };
          eCell.font = { name: 'Arial', size: 10 };
          eCell.border = darkThinBorder;

          if (srcType === 'ECRI') {
            const fCell = wsMonth.getCell(`F${item.row}`);
            fCell.value = item.p.c4 || '';
            fCell.alignment = { horizontal: 'center', vertical: 'middle' };
            fCell.font = { name: 'Arial', size: 10 };
            fCell.border = darkThinBorder;

            const gCell = wsMonth.getCell(`G${item.row}`);
            gCell.value = { formula: `SUM(C${item.row}:F${item.row})` };
            gCell.alignment = { horizontal: 'center', vertical: 'middle' };
            gCell.font = { name: 'Arial', size: 10 };
            gCell.border = darkThinBorder;
          } else {
            const fCell = wsMonth.getCell(`F${item.row}`);
            fCell.value = { formula: `SUM(C${item.row}:E${item.row})` };
            fCell.alignment = { horizontal: 'center', vertical: 'middle' };
            fCell.font = { name: 'Arial', size: 10 };
            fCell.border = darkThinBorder;
          }
        });

        // Row 9 / 15: Total Row for Table 1
        const totalRowIdx = srcType === 'ECRI' ? 9 : 15;
        wsMonth.getRow(totalRowIdx).height = 22;
        
        const bTot = wsMonth.getCell(`B${totalRowIdx}`);
        bTot.value = 'Total';
        bTot.font = { name: 'Arial', size: 10, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        bTot.alignment = { horizontal: 'center', vertical: 'middle' };
        bTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: srcType === 'ECRI' ? 'FF0070C0' : 'FFFFFF00' } };
        bTot.border = darkThinBorder;

        const cTot = wsMonth.getCell(`C${totalRowIdx}`);
        cTot.value = { formula: 'SUM(C3:C5)' };
        cTot.font = { name: 'Arial', size: 10, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        cTot.alignment = { horizontal: 'center', vertical: 'middle' };
        if (srcType === 'ECRI') cTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
        cTot.border = darkThinBorder;

        const dTot = wsMonth.getCell(`D${totalRowIdx}`);
        dTot.value = { formula: 'SUM(D3:D5)' };
        dTot.font = { name: 'Arial', size: 10, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        dTot.alignment = { horizontal: 'center', vertical: 'middle' };
        if (srcType === 'ECRI') dTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
        dTot.border = darkThinBorder;

        const eTot = wsMonth.getCell(`E${totalRowIdx}`);
        eTot.value = { formula: 'SUM(E3:E5)' };
        eTot.font = { name: 'Arial', size: 10, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        eTot.alignment = { horizontal: 'center', vertical: 'middle' };
        if (srcType === 'ECRI') eTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
        eTot.border = darkThinBorder;

        if (srcType === 'ECRI') {
          const fTot = wsMonth.getCell(`F${totalRowIdx}`);
          fTot.value = { formula: 'SUM(F3:F5)' };
          fTot.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          fTot.alignment = { horizontal: 'center', vertical: 'middle' };
          fTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
          fTot.border = darkThinBorder;

          const gTot = wsMonth.getCell(`G${totalRowIdx}`);
          gTot.value = { formula: 'SUM(G3:G5)' };
          gTot.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          gTot.alignment = { horizontal: 'center', vertical: 'middle' };
          gTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
          gTot.border = darkThinBorder;
        } else {
          const fTot = wsMonth.getCell(`F${totalRowIdx}`);
          fTot.value = { formula: 'SUM(F3:F5)' };
          fTot.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
          fTot.alignment = { horizontal: 'center', vertical: 'middle' };
          fTot.border = darkThinBorder;
        }

        // ==========================================
        // Table 2: Hospital Specific Confirmed Matches
        // ==========================================
        const hospTitleRow = srcType === 'ECRI' ? 14 : 19;
        const hospHeaderRow = srcType === 'ECRI' ? 15 : 20;
        const hospDataStartRow = srcType === 'ECRI' ? 16 : 21;
        const hospTotalRow = srcType === 'ECRI' ? 22 : 27;

        // Title Row
        wsMonth.mergeCells(`B${hospTitleRow}:${endColLetter}${hospTitleRow}`);
        const hospTitleCell = wsMonth.getCell(`B${hospTitleRow}`);
        hospTitleCell.value = cleanHosp && cleanHosp !== 'ทั้งหมด' ? `RECALL By ${cleanHosp}` : 'RECALL By CES';
        hospTitleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        hospTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        hospTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: srcType === 'ECRI' ? 'FF0070C0' : 'FFFFFF00' } };
        hospTitleCell.border = darkThinBorder;
        wsMonth.getRow(hospTitleRow).height = 24;

        // Table 2 Header Row
        wsMonth.getRow(hospHeaderRow).height = 22;
        headerCols.forEach(hc => {
          const cell = wsMonth.getCell(`${hc.col}${hospHeaderRow}`);
          cell.value = hc.name;
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: hc.fontColor || 'FFFFFFFF' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hc.bg } };
          cell.border = darkThinBorder;
        });

        // Table 2 Period Rows
        const pMatched = aggrMatched[m].periods;
        const periodsMatchedData = [
          { row: hospDataStartRow, label: `01-10/${mStr}/${targetYear}`, p: pMatched.p1 },
          { row: hospDataStartRow + 1, label: `11-20/${mStr}/${targetYear}`, p: pMatched.p2 },
          { row: hospDataStartRow + 2, label: `21-${endDay}/${mStr}/${targetYear}`, p: pMatched.p3 }
        ];

        periodsMatchedData.forEach(item => {
          wsMonth.getRow(item.row).height = 20;
          const bCell = wsMonth.getCell(`B${item.row}`);
          bCell.value = item.label;
          bCell.alignment = { horizontal: 'center', vertical: 'middle' };
          bCell.font = { name: 'Arial', size: 10 };
          bCell.border = darkThinBorder;

          const cCell = wsMonth.getCell(`C${item.row}`);
          cCell.value = item.p.c1;
          cCell.alignment = { horizontal: 'center', vertical: 'middle' };
          cCell.font = { name: 'Arial', size: 10 };
          cCell.border = darkThinBorder;

          const dCell = wsMonth.getCell(`D${item.row}`);
          dCell.value = item.p.c2;
          dCell.alignment = { horizontal: 'center', vertical: 'middle' };
          dCell.font = { name: 'Arial', size: 10 };
          dCell.border = darkThinBorder;

          const eCell = wsMonth.getCell(`E${item.row}`);
          eCell.value = item.p.c3;
          eCell.alignment = { horizontal: 'center', vertical: 'middle' };
          eCell.font = { name: 'Arial', size: 10 };
          eCell.border = darkThinBorder;

          if (srcType === 'ECRI') {
            const fCell = wsMonth.getCell(`F${item.row}`);
            fCell.value = item.p.c4 || 0;
            fCell.alignment = { horizontal: 'center', vertical: 'middle' };
            fCell.font = { name: 'Arial', size: 10 };
            fCell.border = darkThinBorder;

            const gCell = wsMonth.getCell(`G${item.row}`);
            gCell.value = { formula: `SUM(C${item.row}:F${item.row})` };
            gCell.alignment = { horizontal: 'center', vertical: 'middle' };
            gCell.font = { name: 'Arial', size: 10 };
            gCell.border = darkThinBorder;
          } else {
            const fCell = wsMonth.getCell(`F${item.row}`);
            fCell.value = { formula: `SUM(C${item.row}:E${item.row})` };
            fCell.alignment = { horizontal: 'center', vertical: 'middle' };
            fCell.font = { name: 'Arial', size: 10 };
            fCell.border = darkThinBorder;
          }
        });

        // Table 2 Total Row
        const rStart = hospDataStartRow;
        const rEnd = hospDataStartRow + 2;
        wsMonth.getRow(hospTotalRow).height = 22;

        const bTot2 = wsMonth.getCell(`B${hospTotalRow}`);
        bTot2.value = 'Total';
        bTot2.font = { name: 'Arial', size: 10, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        bTot2.alignment = { horizontal: 'center', vertical: 'middle' };
        bTot2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: srcType === 'ECRI' ? 'FF0070C0' : 'FFFFFF00' } };
        bTot2.border = darkThinBorder;

        const cTot2 = wsMonth.getCell(`C${hospTotalRow}`);
        cTot2.value = { formula: `SUM(C${rStart}:C${rEnd})` };
        cTot2.font = { name: 'Arial', size: 10, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        cTot2.alignment = { horizontal: 'center', vertical: 'middle' };
        if (srcType === 'ECRI') cTot2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
        cTot2.border = darkThinBorder;

        const dTot2 = wsMonth.getCell(`D${hospTotalRow}`);
        dTot2.value = { formula: `SUM(D${rStart}:D${rEnd})` };
        dTot2.font = { name: 'Arial', size: 10, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        dTot2.alignment = { horizontal: 'center', vertical: 'middle' };
        if (srcType === 'ECRI') dTot2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
        dTot2.border = darkThinBorder;

        const eTot2 = wsMonth.getCell(`E${hospTotalRow}`);
        eTot2.value = { formula: `SUM(E${rStart}:E${rEnd})` };
        eTot2.font = { name: 'Arial', size: 10, bold: true, color: { argb: srcType === 'ECRI' ? 'FFFFFFFF' : 'FF000000' } };
        eTot2.alignment = { horizontal: 'center', vertical: 'middle' };
        if (srcType === 'ECRI') eTot2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
        eTot2.border = darkThinBorder;

        if (srcType === 'ECRI') {
          const fTot2 = wsMonth.getCell(`F${hospTotalRow}`);
          fTot2.value = { formula: `SUM(F${rStart}:F${rEnd})` };
          fTot2.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          fTot2.alignment = { horizontal: 'center', vertical: 'middle' };
          fTot2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
          fTot2.border = darkThinBorder;

          const gTot2 = wsMonth.getCell(`G${hospTotalRow}`);
          gTot2.value = { formula: `SUM(G${rStart}:G${rEnd})` };
          gTot2.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          gTot2.alignment = { horizontal: 'center', vertical: 'middle' };
          gTot2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
          gTot2.border = darkThinBorder;
        } else {
          const fTot2 = wsMonth.getCell(`F${hospTotalRow}`);
          fTot2.value = { formula: `SUM(F${rStart}:F${rEnd})` };
          fTot2.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
          fTot2.alignment = { horizontal: 'center', vertical: 'middle' };
          fTot2.border = darkThinBorder;
        }
      }

      // Generate Binary File Blob and URL
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const blobUrl = URL.createObjectURL(blob);
      const fileName = `(${srcType}) FP-BME-NHS-00-031-2 (${cleanHosp || 'CES'}) ${targetYear}.xlsx`;

      return {
        success: true,
        urls: [
          {
            name: fileName,
            url: blobUrl
          }
        ]
      };
    } catch (error) {
      console.error("Firebase getYearlyExportExcel Error:", error);
      return { success: false, message: error.toString() };
    }
  }
};
