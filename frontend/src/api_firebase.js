import { db } from './firebase';
import { collection, getDocs, query, where, doc, setDoc, addDoc, getDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { api as oldApi, getApiUrl, setApiUrl } from './api'; 
export { getApiUrl, setApiUrl };
import { runAIMatchingJob } from './ai_matcher';

// 🚀 ทยอยย้าย API จาก Apps Script มาเป็น Firestore
export const api = {
  // นำฟังก์ชันเก่ามาทั้งหมดก่อน (ตัวไหนยังไม่ย้าย จะไปเรียกใช้ Apps Script ตามเดิม)
  ...oldApi,

  // ---------------------------------------------------------
  // 3. ดึงเดือนที่มีข้อมูล
  // ---------------------------------------------------------
  getAvailableDatabaseMonths: async () => {
    try {
      // ดึงข้อมูล alerts ก่อนเผื่อยังไม่มี
      await api.getAlertsFromDatabase('all');
      
      const allAlerts = window.__alertsCache || [];
      const monthSet = new Set();
      
      // ดึงเดือนจากข้อมูลที่มี (YYYY-MM)
      allAlerts.forEach(item => {
        if (item.date && item.date.length >= 7) {
          const yyyymm = item.date.substring(0, 7);
          monthSet.add(yyyymm);
        }
      });
      
      // เติม 12 เดือนล่าสุดเป็นขั้นต่ำ
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
  // 4. ระบบติดตามสถานะการดำเนินงาน (Action Tracking)
  // ---------------------------------------------------------
  getTrackingCases: async (hospitalFilter = 'ทั้งหมด') => {
    try {
      const snap = await getDocs(collection(db, 'matchedAlerts'));
      const results = [];
      
      snap.docs.forEach(d => {
        const data = d.data();
        const status = String(data.Status || '').trim();
        const hosp = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        
        // กรองเฉพาะเคสที่ "จริง" หรือ "รับรองแล้ว"
        if (status === 'จริง' || status === 'รับรองแล้ว') {
          if (hospitalFilter && hospitalFilter !== 'ทั้งหมด' && hosp !== hospitalFilter) {
            return;
          }
          
          let actions = data.actions || [];
          
          // ถ้ายังไม่มี Action ให้สร้าง Action ที่ 1 (เจ้าหน้าที่รับรอง) เป็นค่าเริ่มต้น
          if (actions.length === 0) {
            const certName = data.Certifier_Name || data.certifyName || '';
            const certDate = data.Certified_Date || data.certifyDate || '';
            actions.push({
              actionId: 1,
              detail: 'เจ้าหน้าที่ตรวจรับรองความเสี่ยงแล้ว (ชื่อ: ' + certName + ')',
              date: certDate,
              isFinal: false
            });
          }
          
          results.push({
            id: d.id, // ส่ง ID กลับไปด้วยเพื่อใช้ตอนบันทึก
            hospitalName: hosp,
            deviceCode: String(data.Device_Code || ''),
            deviceBrandModel: String(data.Device_Name || '') + ' / ' + String(data.Device_Model || ''),
            department: String(data.Department || ''),
            alertId: String(data.Alert_ID || ''),
            alertSource: String(data.Source || ''),
            alertHeadline: String(data.Headline || data.Match_Reason || ''),
            riskLevel: String(data.Risk_Level || ''),
            certifyName: String(data.Certifier_Name || data.certifyName || ''),
            trackingStatus: String(data.trackingStatus || 'กำลังดำเนินการ'),
            actions: actions
          });
        }
      });
      
      // เรียงลำดับใหม่สุดขึ้นก่อน
      return results.reverse();
    } catch (error) {
      console.error("Firebase getTrackingCases Error:", error);
      return [];
    }
  },

  addTrackingAction: async (hospitalName, deviceCode, alertId, newActionDetail, newActionDate, isFinal) => {
    try {
      // ค้นหาเคสที่ตรงกัน
      const q = query(
        collection(db, 'matchedAlerts'),
        where('Hospital_Name', '==', hospitalName),
        where('Device_Code', '==', deviceCode),
        where('Alert_ID', '==', alertId)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        return { success: false, message: 'ไม่พบเคสในระบบ (Firestore)' };
      }
      
      const docRef = snap.docs[0].ref;
      const data = snap.docs[0].data();
      let actions = data.actions || [];
      
      // ถ้า array ว่าง ให้สร้าง Action ที่ 1 ยืนพื้น
      if (actions.length === 0) {
        const certName = data.Certifier_Name || data.certifyName || '';
        const certDate = data.Certified_Date || data.certifyDate || '';
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
      
      await setDoc(docRef, {
        actions: actions,
        trackingStatus: trackingStatus
      }, { merge: true });
      
      return { success: true, message: 'บันทึกสถานะเรียบร้อยแล้ว!' };
    } catch (error) {
      console.error("Firebase addTrackingAction Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // 5. ดึงข้อมูลรายการสำหรับยืนยันรับรอง
  // ---------------------------------------------------------
  certifyMatchedAlert: async (hospitalName, deviceCode, alertId, certName, comment, certifyResult) => {
    try {
      const q = query(
        collection(db, 'matchedAlerts'),
        where('Hospital_Name', '==', hospitalName),
        where('Device_Code', '==', deviceCode),
        where('Alert_ID', '==', alertId)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        return { success: false, message: 'ไม่พบเคสในระบบ (Firestore)' };
      }
      
      const docRef = snap.docs[0].ref;
      
      // ถ้าไม่เกี่ยวข้อง (เท็จ) ลบเคสทิ้งไปเลยตามคำขอ
      if (certifyResult === 'เท็จ') {
        await deleteDoc(docRef);
        return { success: true, message: 'ลบเคสที่ไม่เกี่ยวข้องออกจากระบบเรียบร้อยแล้ว' };
      }
      
      // ถ้าเกี่ยวข้อง (จริง) ให้อัปเดต Status เป็น 'จริง'
      await updateDoc(docRef, {
        Status: certifyResult, // 'จริง'
        Certifier_Name: certName,
        Certified_Date: new Date().toISOString(),
        Certify_Comment: comment
      });
      
      return { success: true, message: 'บันทึกการรับรองเรียบร้อยแล้ว!' };
    } catch (error) {
      console.error("Firebase certifyMatchedAlert Error:", error);
      return { success: false, message: error.toString() };
    }
  },
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
      // กรองชื่อที่ว่างเปล่าออก และเรียงลำดับตามชื่อ (เหมือนในระบบเดิม)
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
      const devicesRef = collection(db, 'devices');
      // ค้นหาอุปกรณ์ที่มีชื่อโรงพยาบาลตรงกัน (รองรับทั้งฟิลด์ภาษาไทยและอังกฤษ)
      const snap = await getDocs(devicesRef);
      
      const toDelete = [];
      snap.docs.forEach(d => {
        const data = d.data();
        const hName = data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '';
        if (String(hName).trim() === String(hospitalName).trim()) {
          toDelete.push(d.ref);
        }
      });

      if (toDelete.length > 0) {
        // Firestore จำกัด batch ละ 500 operations
        // เราต้องแบ่งลบทีละ 500 รายการ
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
      // 1. ลบข้อมูลทั้งหมดใน matchedAlerts
      const matchedSnap = await getDocs(collection(db, 'matchedAlerts'));
      if (!matchedSnap.empty) {
        for (let i = 0; i < matchedSnap.docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = matchedSnap.docs.slice(i, i + 500);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      // 2. รีเซ็ตสถานะ Matched ใน ECRI
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

      // 3. รีเซ็ตสถานะ Matched ใน FDA
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

  getDashboardStats: async (mode = 'calendar', selectedYear = 2026, hospitalName = 'all', forceRefresh = false) => {
    try {
      const year = selectedYear || new Date().getFullYear();
      
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
          if (hospitalName === 'all' || hospitalName === hName) {
            totalDevices++;
          }
        }
      });
      
      const devicesDetailList = Object.keys(devicesCountByHosp).map(h => ({
        hospital: h,
        count: devicesCountByHosp[h],
        lastUpdate: "เรียลไทม์ (Firestore)"
      }));

      // 2. Fetch matched alerts (matches + certified)
      const matchesSnap = await getDocs(collection(db, 'matchedAlerts'));
      const certCountByHosp = {};
      const matchCountByHosp = {};
      let totalMatched = 0;
      
      matchesSnap.docs.forEach(d => {
        const data = d.data();
        let hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
        let statusVal = String(data.Status || data['สถานะ'] || '').trim();
        
        if (hName) {
          matchCountByHosp[hName] = (matchCountByHosp[hName] || 0) + 1;
          if (statusVal === 'จริง' || statusVal === 'รับรองแล้ว') {
            certCountByHosp[hName] = (certCountByHosp[hName] || 0) + 1;
          }
          if (hospitalName === 'all' || hospitalName === hName) {
            totalMatched++;
          }
        }
      });
      
      const certifiedDetailList = Object.keys(matchCountByHosp).map(h => ({
        hospital: h,
        certified: certCountByHosp[h] || 0,
        matched: matchCountByHosp[h] || 0
      }));

      // 3. Fetch ECRI and FDA totals
      const ecriSnap = await getDocs(collection(db, 'ecri'));
      const fdaSnap = await getDocs(collection(db, 'fda'));
      const ecriCount = ecriSnap.size;
      const fdaCount = fdaSnap.size;
      const totalAlerts = ecriCount + fdaCount;
      
      // 4. Monthly Chart Data (Dummy/simplified for now, using 12 months)
      const thMonthsShort = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
      const finalLabels = thMonthsShort.map(m => `${m} ${String(year + 543).substring(2)}`);
      
      // For real graph we'd group matchesSnap by Month. Here we just put total on the current month as fallback if we don't parse dates.
      // But let's build a minimal empty dataset structure so the chart doesn't crash
      const datasets = [{
        label: 'เคสแจ้งเตือนที่พบ (Matched Cases)',
        data: finalLabels.map(() => 0), // Fill with 0s for now to satisfy UI
        backgroundColor: 'rgba(239, 68, 68, 0.45)',
        borderColor: '#ef4444',
        borderWidth: 2,
        borderRadius: 6,
        type: 'bar',
        order: 2
      }];

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
  // 2. ดึงข้อมูลรายการแจ้งเตือนทั้งหมด (พร้อมระบบ Cache ให้ไวปรี๊ด)
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
            id: data['Accession Number'] || data.ECRI_Number || '',
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
            id: data.RECALL_NUMBER || data.PRODUCT_RES_NUMBER || data.RES_EVENT_NUM || '',
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
  // 2.5 ดึงรายการแจ้งเตือนที่ตรงกับสาขา (Branch Alerts)
  // ---------------------------------------------------------
  getMatchedAlertsForHospital: async (hospitalName) => {
    if (!hospitalName) return [];
    try {
      const snap = await getDocs(collection(db, 'matchedAlerts'));
      const alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // กรองชื่อโรงพยาบาล (ครอบคลุมทั้งชื่อคอลัมน์ภาษาไทยและอังกฤษ)
      return alerts.filter(a => {
        const hName = a.Hospital_Name || a['โรงพยาบาล'] || a.hospital || '';
        return String(hName).trim() === String(hospitalName).trim();
      });
    } catch (error) {
      console.error("Firebase getMatchedAlertsForHospital Error:", error);
      return [];
    }
  },

  // ---------------------------------------------------------
  // 6. อัปโหลดข้อมูลครุภัณฑ์แบบ Batch (Frontend Parsing)
  // ---------------------------------------------------------
  saveDevicesBatch: async (devices, hospitalName, onProgress) => {
    try {
      if (onProgress) onProgress("กำลังเตรียมบันทึกข้อมูล...", 10);
      
      // บันทึกแบบ Upsert (Batch ละ 500)
      for (let i = 0; i < devices.length; i += 500) {
        if (onProgress) onProgress(`กำลังบันทึกข้อมูล (${Math.min(i + 500, devices.length)}/${devices.length})...`, 10 + (90 * (i/devices.length)));
        const batch = writeBatch(db);
        const chunk = devices.slice(i, i + 500);
        
        chunk.forEach(deviceData => {
          // สร้าง ID แบบเจาะจง: [ชื่อรพ]_[รหัสเครื่อง] (ตัดอักขระพิเศษออก)
          const cleanHosp = String(hospitalName).replace(/[\/\\#?]/g, '');
          const cleanId = String(deviceData.Device_Code).replace(/[\/\\#?]/g, '');
          const docId = `${cleanHosp}_${cleanId}`;
          
          const docRef = doc(db, 'devices', docId);
          // ใช้ merge: true เพื่อทำการ Upsert (ถ้ามีอยู่แล้วจะอัปเดต, ถ้าไม่มีจะสร้างใหม่)
          batch.set(docRef, {
            ...deviceData,
            Hospital_Name: hospitalName
          }, { merge: true });
        });
        await batch.commit();
      }
      
      if (onProgress) onProgress("บันทึกข้อมูลเสร็จสมบูรณ์", 100);
      return { success: true, message: `นำเข้าครุภัณฑ์แบบ Upsert จำนวน ${devices.length} รายการเรียบร้อยแล้ว` };
    } catch (error) {
      console.error("Firebase saveDevicesBatch Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // Admin / General Settings (API Keys & Telegram)
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
  // 4. AI Matching Jobs
  // ---------------------------------------------------------
  runMatchingJobForAllUnprocessed: async (onProgress) => {
    try {
      // ดึง ECRI และ FDA
      const ecriSnap = await getDocs(collection(db, 'ecri'));
      const fdaSnap = await getDocs(collection(db, 'fda'));
      
      const unprocessedAlerts = [];

      // กรองเฉพาะอันที่ยังไม่แมตช์
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

      // เรียงลำดับข่าวตามวันที่ (ใหม่สุดไปเก่าสุด)
      unprocessedAlerts.sort((a, b) => {
        const dateA = new Date(a['Alert Publication Date'] || a.Alert_Date || a.POSTED_INTERNET_DT || a.EVENT_DATE_INITIATED || 0);
        const dateB = new Date(b['Alert Publication Date'] || b.Alert_Date || b.POSTED_INTERNET_DT || b.EVENT_DATE_INITIATED || 0);
        return dateB - dateA;
      });

      // หากรอบของ 15 วันแรกทำเสร็จแล้ว การกดครั้งต่อไปจะยึดจากวันที่ของข่าวล่าสุดที่ยังไม่ได้ทำ
      const newestUnprocessedDate = new Date(
        unprocessedAlerts[0]['Alert Publication Date'] || 
        unprocessedAlerts[0].Alert_Date || 
        unprocessedAlerts[0].POSTED_INTERNET_DT || 
        unprocessedAlerts[0].EVENT_DATE_INITIATED || 
        new Date()
      );
      
      const windowStartDate = new Date(newestUnprocessedDate);
      windowStartDate.setDate(windowStartDate.getDate() - 15);

      // กรองเอาเฉพาะข่าวที่อยู่ในช่วง 15 วัน นับจากข่าวที่ใหม่ที่สุดที่ยังไม่ได้ทำ
      const alertsToProcess = unprocessedAlerts.filter(a => {
        const d = new Date(a['Alert Publication Date'] || a.Alert_Date || a.POSTED_INTERNET_DT || a.EVENT_DATE_INITIATED || 0);
        return d >= windowStartDate;
      });

      // ส่งให้ AI ประมวลผล
      return await runAIMatchingJob(alertsToProcess, onProgress);

    } catch (error) {
      console.error("Firebase runMatchingJob Error:", error);
      return { success: false, message: error.toString() };
    }
  },

  // ---------------------------------------------------------
  // สามารถทยอยเพิ่มฟังก์ชันอื่นๆ ที่ต้องการให้ดึงจาก Firebase ได้ที่นี่
  // ---------------------------------------------------------

};
