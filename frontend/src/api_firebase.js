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
  deleteDoc 
} from 'firebase/firestore'; 
import { api as oldApi, getApiUrl, setApiUrl } from './api';
export { getApiUrl, setApiUrl };
import { runAIMatchingJob, analyzeSingleAlertWithAI } from './ai_matcher';
import * as XLSX from 'xlsx';

// Helper function to parse dates into { year, month } (month 0-11)
function parseDateInfo(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return { year: dateVal.getFullYear(), month: dateVal.getMonth() };
  }
  const str = String(dateVal).trim();
  if (!str) return null;
  
  // ISO format YYYY-MM-DD or YYYY/MM/DD
  const iso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (iso) {
    let y = parseInt(iso[1], 10);
    if (y > 2400) y -= 543;
    return { year: y, month: parseInt(iso[2], 10) - 1 };
  }

  // DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (dmy) {
    let y = parseInt(dmy[3], 10);
    if (y > 2400) y -= 543;
    return { year: y, month: parseInt(dmy[2], 10) - 1 };
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    let y = parsed.getFullYear();
    if (y > 2400) y -= 543;
    return { year: y, month: parsed.getMonth() };
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

// 🚀 API เชื่อมต่อกับ Firebase Firestore 100%
export const api = {
  // ฟังก์ชันเดิมจาก Apps Script สำหรับฟังก์ชันที่ยังไม่ได้ทดแทน
  ...oldApi,

  // ---------------------------------------------------------
  // 1. ดึงข้อมูลสถิติหน้า Dashboard (Dashboard Stats & Monthly Graph)
  // ---------------------------------------------------------
  getDashboardStats: async (mode = 'calendar', selectedYear = 2026, hospitalName = 'all', forceRefresh = false) => {
    try {
      const year = parseInt(selectedYear, 10) || new Date().getFullYear();
      
      // 1. Fetch hospitals & count devices
      const devicesSnap = await getDocs(collection(db, 'devices'));
      let totalDevices = 0;
      const devicesCountByHosp = {};
      devicesSnap.docs.forEach(d => {
        const data = d.data();
        
        // กรองเครื่องมือที่มีชื่อเป็น "-" ออก
        const deviceName = String(data.Device_Name || data['ชื่อเครื่องมือ'] || '').trim();
        if (deviceName === '-') return;

        let hName = data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '';
        hName = String(hName).trim();
        if (hName) {
          devicesCountByHosp[hName] = (devicesCountByHosp[hName] || 0) + 1;
          if (hospitalName === 'all' || hospitalName === 'ทั้งหมด' || hospitalName.trim().toLowerCase() === hName.toLowerCase()) {
            totalDevices++;
          }
        }
      });
      
      const devicesDetailList = Object.keys(devicesCountByHosp).map(h => ({
        hospital: h,
        count: devicesCountByHosp[h],
        lastUpdate: "เรียลไทม์ (Firestore)"
      }));

      // 2. Setup Monthly Labels based on Mode
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

      const monthlyMatched = new Array(12).fill(0);
      const monthlyCertified = new Array(12).fill(0);

      // 3. Fetch matched alerts (matches + certified)
      const matchesSnap = await getDocs(collection(db, 'matchedAlerts'));
      const certCountByHosp = {};
      const matchCountByHosp = {};
      let totalMatched = 0;
      
      matchesSnap.docs.forEach(d => {
        const data = d.data();
        const hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        const statusVal = String(data.Status || data['สถานะการตรวจสอบ'] || data['สถานะ'] || '').trim();
        const isCertified = statusVal === 'จริง' || statusVal === 'รับรองแล้ว';
        
        if (hName) {
          matchCountByHosp[hName] = (matchCountByHosp[hName] || 0) + 1;
          if (isCertified) {
            certCountByHosp[hName] = (certCountByHosp[hName] || 0) + 1;
          }
        }

        const isTargetHosp = (hospitalName === 'all' || hospitalName === 'ทั้งหมด' || hName.toLowerCase() === hospitalName.trim().toLowerCase());
        if (isTargetHosp) {
          totalMatched++;

          // Extract date for monthly graph
          const rawDate = data.Alert_Publication_Date || data.Alert_Date || data['วันที่ประกาศ'] || data.Matched_At || data['วันที่ตรวจพบ'] || data.Detect_Date || data.detectDate || data.alertDate || '';
          const dateInfo = parseDateInfo(rawDate);

          if (dateInfo) {
            if (mode === 'fiscal') {
              // Fiscal Year: Oct-Dec of (year - 1) -> 0, 1, 2; Jan-Sep of year -> 3..11
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
              // Calendar Year: Jan-Dec of year -> 0..11
              if (dateInfo.year === year) {
                const idx = dateInfo.month;
                if (idx >= 0 && idx < 12) {
                  monthlyMatched[idx]++;
                  if (isCertified) monthlyCertified[idx]++;
                }
              }
            }
          } else {
            // Fallback: put in current month
            const currMonth = new Date().getMonth();
            monthlyMatched[currMonth]++;
            if (isCertified) monthlyCertified[currMonth]++;
          }
        }
      });
      
      const certifiedDetailList = Object.keys(matchCountByHosp).map(h => ({
        hospital: h,
        certified: certCountByHosp[h] || 0,
        matched: matchCountByHosp[h] || 0
      }));

      // 4. Fetch ECRI and FDA totals
      const ecriSnap = await getDocs(collection(db, 'ecri'));
      const fdaSnap = await getDocs(collection(db, 'fda'));
      const ecriCount = ecriSnap.size;
      const fdaCount = fdaSnap.size;
      const totalAlerts = ecriCount + fdaCount;
      
      // 5. Monthly Chart Datasets (Real dynamically calculated counts)
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

      return {
        monthsLabels: finalLabels,
        datasets: datasets,
        totalDevices: totalDevices,
        totalAlerts: totalAlerts,
        totalAlertsDetail: {
          ecriCount: ecriCount,
          fdaCount: fdaCount
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
    } catch (error) {
      console.error("Firebase getDashboardStats Error:", error);
      return null;
    }
  },

  // ---------------------------------------------------------
  // 2. ดึงข้อมูลรายการแจ้งเตือนทั้งหมด (พร้อมระบบ Cache)
  // ---------------------------------------------------------
  getAlertsFromDatabase: async (filterMonth) => {
    try {
      if (!window.__alertsCache) {
        const ecriSnap = await getDocs(collection(db, 'ecri'));
        const fdaSnap = await getDocs(collection(db, 'fda'));
        
        const ecriList = ecriSnap.docs.map(d => {
          const data = d.data();
          let dateStr = data['Alert Publication Date'] || data.Alert_Date || '';
          if (dateStr && dateStr.includes('T')) dateStr = dateStr.split('T')[0];
          
          return {
            source: 'ECRI',
            id: data['Accession Number'] || data.ECRI_Number || data.Alert_ID || '',
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
            id: data.RECALL_NUMBER || data.PRODUCT_RES_NUMBER || data.RES_EVENT_NUM || data.Alert_ID || '',
            headline: data.PRODUCT_DESCRIPTION || '',
            manufacturer: data.FIRM_NAME || data.RECALLING_FIRM || '',
            class: data.RECALL_CLASS || data.CLASSIFICATION || '',
            date: dateStr
          };
        });

        window.__alertsCache = [...ecriList, ...fdaList];
      }

      let allAlerts = window.__alertsCache;

      if (filterMonth && filterMonth !== 'all' && filterMonth !== 'ทั้งหมด') {
        const target = filterMonth.toLowerCase();
        allAlerts = allAlerts.filter(item => Object.values(item).some(val => String(val).toLowerCase().includes(target)));
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
      
      const allAlerts = window.__alertsCache || [];
      const monthSet = new Set();
      
      allAlerts.forEach(item => {
        if (item.date && item.date.length >= 7) {
          const yyyymm = item.date.substring(0, 7);
          monthSet.add(yyyymm);
        }
      });
      
      const d = new Date();
      for (let i = 0; i < 12; i++) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        monthSet.add(`${y}-${m}`);
        d.setMonth(d.getMonth() - 1);
      }
      
      return Array.from(monthSet).sort().reverse();
    } catch (error) {
      console.error("Firebase getAvailableDatabaseMonths Error:", error);
      return [];
    }
  },

  // ---------------------------------------------------------
  // 4. ข้อมูลสถิติของแต่ละสาขา (Branch Device Stats)
  // ---------------------------------------------------------
  getBranchDeviceStats: async (hospitalName) => {
    if (!hospitalName) return { count: 0, latestUploadDate: null, daysAgo: null };
    try {
      const cleanTarget = String(hospitalName).trim().toLowerCase();
      
      let latestUploadDate = null;
      let daysAgo = null;
      
      // 1. ดึงวันที่อัปเดตจากตาราง hospitals
      const hospSnap = await getDocs(collection(db, 'hospitals'));
      hospSnap.docs.forEach(d => {
        const data = d.data();
        const hName = String(data['รายชื่อโรงพยาบาล'] || data.Hospital_Name || data.name || '').trim();
        if (hName.toLowerCase() === cleanTarget) {
          const upTime = data['อัปเดตล่าสุด'] || data.Last_Upload_Time || data.Last_Update;
          if (upTime) {
            latestUploadDate = upTime;
            const upDate = new Date(upTime);
            if (!isNaN(upDate.getTime())) {
              const diffMs = Date.now() - upDate.getTime();
              daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            }
          }
        }
      });

      // 2. นับจำนวนเครื่องทั้งหมดของสาขานี้
      const devicesSnap = await getDocs(collection(db, 'devices'));
      let count = 0;
      devicesSnap.docs.forEach(d => {
        const data = d.data();
        const hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        if (hName.toLowerCase() === cleanTarget) {
          count++;
        }
      });

      return {
        count,
        latestUploadDate,
        daysAgo
      };
    } catch (error) {
      console.error("Firebase getBranchDeviceStats Error:", error);
      return { count: 0, latestUploadDate: null, daysAgo: null };
    }
  },

  // ---------------------------------------------------------
  // 5. ดึงรายการแจ้งเตือนที่ตรงกับสาขา (Branch Alerts พร้อม Normalize ทุกฟิลด์)
  // ---------------------------------------------------------
  getMatchedAlertsForHospital: async (hospitalName) => {
    if (!hospitalName) return [];
    try {
      const cleanTargetHosp = String(hospitalName).trim().toLowerCase();
      const snap = await getDocs(collection(db, 'matchedAlerts'));
      
      const results = [];
      snap.docs.forEach(d => {
        const data = d.data();
        const hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        
        if (hName.toLowerCase() === cleanTargetHosp) {
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
            id: d.id,
            docId: d.id,
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
      const snap = await getDocs(collection(db, 'matchedAlerts'));
      const cleanBrand = String(brand || '').trim().toLowerCase();
      const cleanModel = String(model || '').trim().toLowerCase();
      const cleanAlertId = String(alertId || '').trim().toLowerCase();

      let matchedDoc = null;
      for (const d of snap.docs) {
        const data = d.data();
        const dBrand = String(data.Brand || data.Device_Brand || data['ยี่ห้อ'] || '').trim().toLowerCase();
        const dModel = String(data.Model || data.Device_Model || data['รุ่น'] || '').trim().toLowerCase();
        const dAlertId = String(data.Alert_ID || data['รหัสแจ้งเตือน'] || '').trim().toLowerCase();

        if (dAlertId === cleanAlertId && (dBrand === cleanBrand || dModel === cleanModel || (!cleanModel && !cleanBrand))) {
          matchedDoc = { id: d.id, ...data };
          // หากมีข้อมูลแบบครบถ้วนแล้ว ให้ส่งคืนทันที
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

      // ถ้ายังไม่มีรายละเอียดการแปลและวิเคราะห์อาการ ให้เรียก DeepSeek เพื่อสร้างการวิเคราะห์ฉบับเต็มทันที
      const aiSettings = await api.getGeminiApiKeySettings();
      const apiKey = aiSettings?.key?.trim();
      
      if (apiKey) {
        let alertDocData = null;
        if (cleanAlertId) {
          // ค้นหาจาก ECRI
          const ecriSnap = await getDocs(collection(db, 'ecri'));
          const ecriDoc = ecriSnap.docs.find(doc => doc.id === alertId || doc.data().Alert_ID === alertId || doc.data().id === alertId);
          if (ecriDoc) {
            alertDocData = { ...ecriDoc.data(), source: 'ECRI' };
          } else {
            // ค้นหาจาก FDA
            const fdaSnap = await getDocs(collection(db, 'fda'));
            const fdaDoc = fdaSnap.docs.find(doc => doc.id === alertId || doc.data().Alert_ID === alertId || doc.data().id === alertId);
            if (fdaDoc) {
              alertDocData = { ...fdaDoc.data(), source: 'FDA' };
            }
          }
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

        // บันทึกกลับลง Firestore ใน matchedAlerts เพื่อแคชไว้สำหรับการเปิดครั้งต่อไป
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
  getTrackingCases: async (hospitalFilter = 'ทั้งหมด') => {
    try {
      const snap = await getDocs(collection(db, 'matchedAlerts'));
      const results = [];
      
      snap.docs.forEach(d => {
        const data = d.data();
        const status = String(data.Status || data['สถานะการตรวจสอบ'] || data['สถานะ'] || '').trim();
        const hosp = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        
        // กรองเฉพาะเคสที่ "จริง" หรือ "รับรองแล้ว"
        if (status === 'จริง' || status === 'รับรองแล้ว') {
          if (hospitalFilter && hospitalFilter !== 'ทั้งหมด' && hosp.toLowerCase() !== hospitalFilter.trim().toLowerCase()) {
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
            id: d.id,
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
      
      await logSystemActivity(`รับรองความเสี่ยง (จริง): ${hospitalName} เครื่อง ${deviceCode} โดย ${certName}`, 'Certify True', 1, 'Success');

      return { success: true, message: 'บันทึกการรับรองเรียบร้อยแล้ว!' };
    } catch (error) {
      console.error("Firebase certifyMatchedAlert Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 9. รายชื่อโรงพยาบาล (Hospitals Map)
  // ---------------------------------------------------------
  getHospitalsMap: async (options = {}) => {
    try {
      const snap = await getDocs(collection(db, 'hospitals'));
      const hospitals = snap.docs.map(d => {
        const data = d.data();
        return {
          name: data['รายชื่อโรงพยาบาล'] || data.Hospital_Name || '',
          email: data['อีเมล'] || data.Admin_Email || data.Email || '',
          lastUploadTime: data['อัปเดตล่าสุด'] || data.Last_Upload_Time || data.Last_Update || 'ยังไม่มีการอัปโหลด'
        };
      });
      return hospitals
        .filter(h => h.name && h.name.trim() !== '')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
      return { success: true, message: `เพิ่มโรงพยาบาล ${hospitalName} สำเร็จ` };
    } catch (error) {
      console.error("Firebase addHospital Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  deleteDevicesByHospital: async (hospitalName) => {
    if (!hospitalName) return { success: false, message: 'กรุณาระบุชื่อโรงพยาบาล' };
    try {
      const snap = await getDocs(collection(db, 'devices'));
      const toDelete = [];
      snap.docs.forEach(d => {
        const data = d.data();
        const hName = data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '';
        if (String(hName).trim() === String(hospitalName).trim()) {
          toDelete.push(d.ref);
        }
      });

      if (toDelete.length > 0) {
        for (let i = 0; i < toDelete.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = toDelete.slice(i, i + 500);
          chunk.forEach(ref => batch.delete(ref));
          await batch.commit();
        }
      }
      
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

      // Update hospital's last upload timestamp
      try {
        const hospSnap = await getDocs(collection(db, 'hospitals'));
        let foundDoc = null;
        hospSnap.docs.forEach(d => {
          const data = d.data();
          const name = data['รายชื่อโรงพยาบาล'] || data.Hospital_Name || '';
          if (name.trim() === hospitalName.trim()) foundDoc = d;
        });
        if (foundDoc) {
          await setDoc(foundDoc.ref, {
            'อัปเดตล่าสุด': new Date().toISOString(),
            Last_Upload_Time: new Date().toISOString()
          }, { merge: true });
        }
      } catch (err) {
        console.error("Update hospital upload timestamp error:", err);
      }
      
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
      const datesSet = new Set();
      const ecriSnap = await getDocs(collection(db, 'ecri'));
      ecriSnap.docs.forEach(d => {
        const data = d.data();
        const dt = data['Alert Publication Date'] || data.Alert_Date || '';
        if (dt) datesSet.add(dt.substring(0, 10));
      });
      const fdaSnap = await getDocs(collection(db, 'fda'));
      fdaSnap.docs.forEach(d => {
        const data = d.data();
        const dt = data.POSTED_INTERNET_DT || data.EVENT_DATE_INITIATED || '';
        if (dt) datesSet.add(dt.substring(0, 10));
      });
      return { dates: Array.from(datesSet).sort().reverse() };
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
      const logsSnap = await getDocs(collection(db, 'logs'));
      if (!logsSnap.empty) {
        const list = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return list.slice(0, 30);
      }

      // If logs collection is empty, synthesize activities from actual Firestore collections
      const synthLogs = [];
      
      // Check matched alerts
      const matchedSnap = await getDocs(collection(db, 'matchedAlerts'));
      if (!matchedSnap.empty) {
        const certifiedCount = matchedSnap.docs.filter(d => ['จริง', 'รับรองแล้ว'].includes(d.data().Status || d.data()['สถานะการตรวจสอบ'])).length;
        synthLogs.push({
          activity: 'ประมวลผลการจับคู่ความเสี่ยง (AI Matching)',
          type: 'AI Matcher',
          count: matchedSnap.size,
          status: 'Success',
          time: 'ระบบประมวลผลล่าสุด'
        });
        if (certifiedCount > 0) {
          synthLogs.push({
            activity: 'รับรองผลการตรวจสอบความเสี่ยงเครื่องมือแพทย์',
            type: 'Verification',
            count: certifiedCount,
            status: 'Success',
            time: 'เจ้าหน้าที่รับรองแล้ว'
          });
        }
      }

      // Check ECRI & FDA counts
      const ecriSnap = await getDocs(collection(db, 'ecri'));
      if (!ecriSnap.empty) {
        synthLogs.push({
          activity: 'นำเข้าข้อมูลข่าวเตือนภัย ECRI',
          type: 'ECRI Database',
          count: ecriSnap.size,
          status: 'Success',
          time: 'ฐานข้อมูลพร้อมใช้งาน'
        });
      }

      const fdaSnap = await getDocs(collection(db, 'fda'));
      if (!fdaSnap.empty) {
        synthLogs.push({
          activity: 'นำเข้าข้อมูลข่าวเตือนภัย FDA Recall',
          type: 'FDA Database',
          count: fdaSnap.size,
          status: 'Success',
          time: 'ฐานข้อมูลพร้อมใช้งาน'
        });
      }

      const devSnap = await getDocs(collection(db, 'devices'));
      if (!devSnap.empty) {
        synthLogs.push({
          activity: 'นำเข้าทะเบียนเครื่องมือแพทย์โรงพยาบาล',
          type: 'Device Registry',
          count: devSnap.size,
          status: 'Success',
          time: 'ฐานข้อมูลพร้อมใช้งาน'
        });
      }

      return synthLogs;
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
  // 15. ส่งออกไฟล์ Excel รายงานรายปี (KPI Report Export)
  // ---------------------------------------------------------
  getYearlyExportExcel: async (hospital, year, sourceType) => {
    try {
      const targetYear = parseInt(year, 10);
      const cleanHosp = String(hospital || '').trim().toLowerCase();
      const snap = await getDocs(collection(db, 'matchedAlerts'));
      
      const rows = [];
      let index = 1;

      snap.docs.forEach(d => {
        const data = d.data();
        const hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        const src = String(data.Source || data['แหล่งข้อมูล'] || (String(data.Alert_ID || '').startsWith('ECRI') ? 'ECRI' : 'FDA')).trim().toUpperCase();
        
        // กรองตามสาขา
        if (cleanHosp && cleanHosp !== 'ทั้งหมด' && hName.toLowerCase() !== cleanHosp) {
          return;
        }

        // กรองตามแหล่งข่าว
        if (sourceType && sourceType !== 'ALL' && sourceType !== 'ทั้งหมด' && src !== sourceType.toUpperCase()) {
          return;
        }

        // กรองตามปี
        const rawDate = data.Alert_Publication_Date || data.Alert_Date || data['วันที่ประกาศ'] || data.Matched_At || data.Detect_Date || '';
        const dateInfo = parseDateInfo(rawDate);
        if (targetYear && dateInfo && dateInfo.year !== targetYear) {
          return;
        }

        const actions = data.actions || [];
        const actionsSummary = actions.map((a, i) => `[${i + 1}] ${a.date || ''}: ${a.detail || ''}`).join('\n');

        rows.push({
          'ลำดับ': index++,
          'โรงพยาบาล': hName,
          'รหัสเครื่องมือ': data.Device_Code || data.Device_ID || data['รหัสเครื่องมือ'] || '',
          'เลขครุภัณฑ์': data.Asset_ID || data.Asset_No || data['เลขคุรุภัณฑ์'] || '',
          'ชื่อเครื่องมือแพทย์': data.Tool_Name || data.Device_Name || data['ชื่อเครื่องมือ'] || '',
          'ยี่ห้อ': data.Brand || data.Device_Brand || data['ยี่ห้อ'] || '',
          'รุ่น': data.Model || data.Device_Model || data['รุ่น'] || '',
          'แผนก': data.Department || data['แผนก'] || '',
          'แหล่งข่าว': src,
          'รหัสแจ้งเตือน': data.Alert_ID || data.Alert_Id || data['รหัสแจ้งเตือน'] || '',
          'หัวข้อแจ้งเตือน': data.Headline || data.Alert_Title || data['หัวข้อแจ้งเตือน'] || '',
          'วันที่ประกาศ': data.Alert_Publication_Date || data.Alert_Date || data['วันที่ประกาศ'] || '',
          'ระดับความเสี่ยง': data.Risk_Level || 'สูง',
          'สถานะการรับรอง': data.Status || data['สถานะการตรวจสอบ'] || 'รอยืนยัน',
          'ผู้ตรวจรับรอง': data.Certifier_Name || data['ชื่อผู้รับรอง'] || '',
          'วันเวลาที่รับรอง': data.Certified_Date || data['วันเวลารับรอง'] || '',
          'ข้อสังเกตเพิ่มเติม': data.Certify_Comment || data['ข้อสังเกตเพิ่มเติม'] || '',
          'ประวัติการดำเนินการ (Actions)': actionsSummary || '-'
        });
      });

      if (rows.length === 0) {
        return { success: true, urls: [] };
      }

      // Create Workbook with SheetJS
      const ws = XLSX.utils.json_to_sheet(rows);
      
      // Auto-fit column widths
      const colWidths = Object.keys(rows[0]).map(k => ({
        wch: Math.max(k.length * 2, 15)
      }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `KPI_${sourceType || 'Alerts'}`);

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const blobUrl = URL.createObjectURL(blob);
      const fileName = `รายงาน_KPI_${sourceType || 'ECRI_FDA'}_${hospital}_ปี_${year}.xlsx`;

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
