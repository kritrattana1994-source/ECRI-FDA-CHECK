import { api } from './api_firebase';
import { db } from './firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { sendTelegramAlert } from './telegram';

// ---------------------------------------------------------
// ฟังก์ชันสกัดชื่อ Brand และ Model สำหรับเปรียบเทียบ
// ---------------------------------------------------------
function standardizeDeviceName(name) {
  if (!name) return "";
  return name.toString().toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// รายการ Stop-words ในชื่อบริษัทผู้ผลิตเครื่องมือแพทย์ เพื่อไม่ให้เอาคำทั่วไปมาจับคู่ข้ามแบรนด์
const BRAND_STOP_WORDS = new Set([
  'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED',
  'LLC', 'LP', 'MEDICAL', 'HEALTHCARE', 'SYSTEMS', 'TECHNOLOGIES', 'TECH', 'GROUP',
  'SOLUTIONS', 'HOLDINGS', 'INTERNATIONAL', 'INTL', 'USA', 'THAILAND', 'GMBH', 'SERVICES',
  'AG', 'SA', 'BV', 'THE', 'AND', 'OF', 'FOR', 'DEVICES', 'INSTRUMENTS', 'CARE', 'GLOBAL',
  'PRODUCTS', 'DIVISION', 'LABORATORIES', 'LABS'
]);

function extractBrandTokens(brandStr) {
  if (!brandStr) return [];
  const std = standardizeDeviceName(brandStr);
  return std.split(' ').filter(w => w.length >= 2 && !BRAND_STOP_WORDS.has(w));
}

function isBrandPlausible(alertBrand, alertText, groupBrand) {
  const alertTokens = extractBrandTokens(alertBrand);
  const groupTokens = extractBrandTokens(groupBrand);
  
  if (groupTokens.length === 0) return false;

  // หากทั้งสองฝั่งมี Brand tokens ให้ตรวจว่ามี token แบรนด์ตรงกันหรือไม่
  if (alertTokens.length > 0) {
    const hasMatch = groupTokens.some(gt => alertTokens.includes(gt) || alertTokens.some(at => gt.includes(at) || at.includes(gt)));
    if (hasMatch) return true;
  }

  // ตรวจสอบเพิ่มเติมว่าชื่อแบรนด์ของกลุ่มเครื่องมือปรากฏในข้อความหัวข้อ/เนื้อหาของประกาศหรือไม่
  const cleanAlertText = standardizeDeviceName(alertText);
  const textTokens = new Set(cleanAlertText.split(' '));
  return groupTokens.some(gt => gt.length >= 3 && textTokens.has(gt));
}

/**
 * ฟังก์ชันเรียกใช้งาน DeepSeek API
 */
async function callDeepseekApi(promptText, apiKey) {
  const url = `https://api.deepseek.com/chat/completions`;
  
  const payload = {
    model: "deepseek-chat",
    messages: [
      {
        role: "user",
        content: promptText
      }
    ],
    temperature: 0.0
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API Error: ${response.status}`);
  }

  const data = await response.json();
  if (data.choices && data.choices.length > 0 && data.choices[0].message) {
    return data.choices[0].message.content;
  }
  return "";
}

/**
 * รันกระบวนการ AI Matching ค้นหาเครื่องมือแพทย์ที่ตรงกับประกาศเตือนภัย (Ultra-Strict Precision Mode)
 * @param {Array} targetAlerts รายการ Alert ที่ต้องการตรวจสอบ
 * @returns {Object} ผลลัพธ์การแมตช์
 */
export async function runAIMatchingJob(targetAlerts, onProgress) {
  try {
    // 1. ดึง API Key
    const aiSettings = await api.getGeminiApiKeySettings();
    const apiKey = aiSettings?.key?.trim();
    if (!apiKey) {
      throw new Error("ยังไม่ได้ตั้งค่า API Key สำหรับ AI");
    }

    // 2. ดึงรายการเครื่องมือแพทย์ทั้งหมดจาก Firestore เพื่อมาจับคู่
    const devicesSnap = await getDocs(collection(db, 'devices'));
    
    // จัดกลุ่มเครื่องมือ (Device Grouping) ตามยี่ห้อและรุ่น
    const uniqueDevicesMap = new Map();
    devicesSnap.docs.forEach(d => {
      const data = d.data();
      const stdBrand = standardizeDeviceName(data.Brand || data['ยี่ห้อ'] || '');
      const stdModel = standardizeDeviceName(data.Model || data['รุ่น'] || '');
      
      // ข้ามถ้ายี่ห้อและรุ่นว่างทั้งคู่ หรือมีชื่อเป็น "-"
      if (!stdBrand && !stdModel) return;
      if (data.Device_Name === '-' || data['ชื่อเครื่องมือ'] === '-') return;

      const key = `${stdBrand}___${stdModel}`;
      if (!uniqueDevicesMap.has(key)) {
        uniqueDevicesMap.set(key, {
          stdBrand,
          stdModel,
          originalBrand: data.Brand || data['ยี่ห้อ'] || '',
          originalModel: data.Model || data['รุ่น'] || '',
          devices: []
        });
      }
      uniqueDevicesMap.get(key).devices.push({
        ...data,
        docId: d.id,
      });
    });

    const uniqueDevices = Array.from(uniqueDevicesMap.values());
    const results = [];

    // 3. เริ่มวิเคราะห์ทีละ Alert เพื่อความแม่นยำสูงสุด
    for (let i = 0; i < targetAlerts.length; i++) {
      const alert = targetAlerts[i];
      if (onProgress) onProgress(i + 1, targetAlerts.length);

      let alertBrand = '';
      let alertModel = '';
      let alertTitle = '';
      let alertDesc = '';

      if (alert.source === 'ECRI') {
        const headline = alert.Headline || alert.Title || alert['หัวเรื่อง'] || '';
        const parts = headline.split(/—|-/); 
        alertBrand = parts[0]?.trim() || alert.Manufacturer || '';
        alertModel = parts.slice(1).join('-').trim() || headline;
        alertTitle = headline;
        alertDesc = alert.Headline || alert.Description || '';
      } else {
        // ข่าว FDA
        alertBrand = alert.TRADE_NAME || alert.FIRM_NAME || alert.RECALLING_FIRM || '';
        alertModel = alert.PRODUCT_DESCRIPTION || alert.BRAND_NAME || alert.GENERIC_NAME || '';
        alertTitle = `FDA Recall: ${alertBrand} - ${alertModel}`;
        alertDesc = alert.PRODUCT_DESCRIPTION || alert.REASON_FOR_RECALL || '';
      }
      
      // กรองเฉพาะกลุ่มเครื่องมือที่ยี่ห้อตรงกับประกาศ (Strict Pre-filter)
      const potentialGroups = uniqueDevices.filter(g => {
        return isBrandPlausible(alertBrand, `${alertTitle} ${alertDesc}`, g.originalBrand);
      });

      if (potentialGroups.length === 0) continue;

      // 4. Prompt สำหรับ AI ให้ตรวจสอบอย่างเข้มงวดสูงสุด (Ultra-Strict Matching)
      const prompt = `
คุณคือผู้เชี่ยวชาญด้านวิศวกรรมชีวการแพทย์ (Biomedical Engineering Specialist) ประจำฝ่ายบริหารจัดการความปลอดภัยเครื่องมือแพทย์
หน้าที่ของคุณคือตรวจสอบอย่างเข้มงวดสูงสุด (Ultra-Strict High-Precision Matching) ว่า "ประกาศเตือนภัยด้านความปลอดภัย" มีผลกระทบต่อ "เครื่องมือแพทย์ในโรงพยาบาล" หรือไม่

กฎเหล็กในการจับคู่ (Strict Rules - ห้ามฝ่าฝืน):
1. **ยี่ห้อ (Brand) และ รุ่น (Model/Series)**: ต้องตรงกันอย่างชัดเจนตามที่ระบุในประกาศ
   - ยี่ห้อผู้ผลิตต้องเป็นยี่ห้อเดียวกัน
   - รุ่นที่แจ้งเตือนในประกาศต้องตรงกับชื่อรุ่น หรือ Series ของเครื่องในโรงพยาบาล
   - ตัวอย่างที่ถูกต้อง: ประกาศระบุ "Philips IntelliVue MX450" กับเครื่องในรพ. ยี่ห้อ "PHILIPS" รุ่น "MX450" หรือ "IntelliVue MX450" -> [MATCH: HIGH]
2. **ห้ามจับคู่ข้ามรุ่นเด็ดขาด (NO Cross-Model Match)**:
   - หากยี่ห้อเดียวกัน แต่ประกาศระบุรุ่น "CARESCAPE B650" ส่วนเครื่องในรพ.คือรุ่น "Solar 8000M" หรือ "Dash 4000" -> ห้ามจับคู่เด็ดขาด (ถือว่าไม่ตรงกัน)
3. **ห้ามจับคู่เพราะเป็นเครื่องประเภทเดียวกัน (NO Generic Category Match)**:
   - ห้ามจับคู่เพียงเพราะเป็นเครื่องประเภทเดียวกัน เช่น Infusion Pump, Ventilator, Defibrillator หากรุ่นไม่ใช่รุ่นที่ถูกแจ้งเตือน
4. **ความมั่นใจระดับ HIGH (ตรง 100%) เท่านั้น**:
   - หากรุ่นคล้ายกันแต่ไม่แน่ใจ หรือไม่มีการระบุรุ่นที่ชัดเจนในประกาศเตือนภัย -> ห้ามจับคู่เด็ดขาด (ตอบ [])

ข้อมูลประกาศเตือนภัย (Alert):
หัวข้อ: ${alertTitle}
แบรนด์/ผู้ผลิต: ${alertBrand}
รุ่น/รายละเอียดที่ประกาศเตือน: ${alertModel}
เนื้อหารายละเอียดปัญหา: ${alertDesc}

รายการรุ่นเครื่องมือแพทย์ของโรงพยาบาลที่เข้ารอบคัดกรอง:
${potentialGroups.map((g, idx) => `[${idx}] ยี่ห้อ: ${g.originalBrand} | รุ่น: ${g.originalModel}`).join('\n')}

คำสั่ง: จงตรวจสอบและส่งคืนเฉพาะรายการที่ตรงกันจริง 100% เท่านั้น ในรูปแบบ JSON Array:
[{"index": <เลขลำดับ>, "confidence": "HIGH", "reason": "อธิบายสั้นๆ ว่ารุ่นตรงกับประกาศอย่างไร"}]
หากไม่มีรายการใดตรงกันเลย ให้ตอบ: []
`;

      // 5. ส่งให้ DeepSeek วิเคราะห์
      try {
        const aiResponseText = await callDeepseekApi(prompt, apiKey);
        
        const jsonStart = aiResponseText.indexOf('[');
        const jsonEnd = aiResponseText.lastIndexOf(']');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
          const jsonStr = aiResponseText.substring(jsonStart, jsonEnd + 1);
          const parsedMatches = JSON.parse(jsonStr);
          
          for (const match of parsedMatches) {
            // รับเฉพาะความมั่นใจระดับ HIGH เท่านั้น
            if (String(match.confidence).toUpperCase() !== 'HIGH') {
              continue;
            }

            if (match.index >= 0 && match.index < potentialGroups.length) {
              const matchedGroup = potentialGroups[match.index];
              
              for (const matchedDev of matchedGroup.devices) {
                const matchRecord = {
                  Alert_ID: alert.id || alert.Alert_ID || '',
                  Alert_Title: alertTitle || '',
                  Headline: alert.Headline || alert.Title || alertTitle || '',
                  Hospital_Name: matchedDev.Hospital_Name || matchedDev['โรงพยาบาล'] || matchedDev.hospital || '',
                  Device_Code: matchedDev.Device_Code || matchedDev.Device_ID || matchedDev['รหัสเครื่องมือ'] || matchedDev['รหัสเครื่อง'] || '',
                  Device_ID: matchedDev.Device_Code || matchedDev.Device_ID || matchedDev['รหัสเครื่องมือ'] || matchedDev['รหัสเครื่อง'] || '',
                  Asset_ID: matchedDev.Asset_ID || matchedDev.Asset_No || matchedDev['เลขคุรุภัณฑ์'] || matchedDev['เลขครุภัณฑ์'] || '',
                  Brand: matchedDev.Brand || matchedDev['ยี่ห้อ'] || '',
                  Device_Brand: matchedDev.Brand || matchedDev['ยี่ห้อ'] || '',
                  Model: matchedDev.Model || matchedDev['รุ่น'] || '',
                  Device_Model: matchedDev.Model || matchedDev['รุ่น'] || '',
                  Department: matchedDev.Department || matchedDev['แผนก'] || matchedDev.dept || '',
                  Source: alert.source || '',
                  Alert_Publication_Date: alert['Alert Publication Date'] || alert.Alert_Date || alert.POSTED_INTERNET_DT || alert.EVENT_DATE_INITIATED || new Date().toISOString().split('T')[0],
                  Confidence: 'HIGH',
                  Match_Confidence: 'HIGH',
                  Match_Reason: match.reason || '',
                  AI_Reason: match.reason || '',
                  AI_Analysis: match.reason || '',
                  Tool_Name: matchedDev.Device_Name || matchedDev.Tool_Name || matchedDev['ชื่อเครื่องมือ'] || matchedDev['ชนิดเครื่องมือ'] || '',
                  Matched_At: new Date().toISOString(),
                  Detect_Date: new Date().toISOString().split('T')[0],
                  Status: 'รอยืนยัน',

                  // Thai Keys
                  'โรงพยาบาล': matchedDev.Hospital_Name || matchedDev['โรงพยาบาล'] || matchedDev.hospital || '',
                  'รหัสเครื่องมือ': matchedDev.Device_Code || matchedDev.Device_ID || matchedDev['รหัสเครื่องมือ'] || '',
                  'เลขคุรุภัณฑ์': matchedDev.Asset_ID || matchedDev.Asset_No || '',
                  'ยี่ห้อ': matchedDev.Brand || matchedDev['ยี่ห้อ'] || '',
                  'รุ่น': matchedDev.Model || matchedDev['รุ่น'] || '',
                  'แผนก': matchedDev.Department || matchedDev['แผนก'] || '',
                  'แหล่งข้อมูล': alert.source || '',
                  'รหัสแจ้งเตือน': alert.id || alert.Alert_ID || '',
                  'หัวข้อแจ้งเตือน': alertTitle || '',
                  'วันที่ประกาศ': alert['Alert Publication Date'] || alert.Alert_Date || alert.POSTED_INTERNET_DT || alert.EVENT_DATE_INITIATED || new Date().toISOString().split('T')[0],
                  'ระดับความชัดเจน': 'HIGH',
                  'เหตุผลการจับคู่': match.reason || '',
                  'สถานะการตรวจสอบ': 'รอยืนยัน'
                };
                results.push(matchRecord);
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse AI JSON response for alert:", alertTitle, e);
      }
    }

    // 6. บันทึกผลลัพธ์ลง Firestore (Batch)
    const batch = writeBatch(db);
    
    // 6.1 บันทึกรายการที่แมตช์เจอ
    for (const res of results) {
      const docRef = doc(collection(db, 'matchedAlerts'));
      batch.set(docRef, res);
    }
    
    // 6.2 อัปเดตสถานะประกาศเตือนภัยที่วิเคราะห์แล้วทั้งหมดเป็น MATCHED
    for (const alert of targetAlerts) {
      if (alert.id && alert.source) {
        const alertCollection = alert.source.toLowerCase() === 'fda' ? 'fda' : 'ecri';
        const alertDocRef = doc(db, alertCollection, alert.id);
        batch.update(alertDocRef, { Matched: 'MATCHED', AI_Processed_Date: new Date().toISOString() });
      }
    }
    
    await batch.commit();

    // 7. แจ้งเตือน Telegram
    try {
      const hospitalsList = await api.getHospitalsMap();
      const allHospitals = hospitalsList.map(h => h.name).filter(name => name);

      const matchedSnap = await getDocs(collection(db, 'matchedAlerts'));
      const pendingCounts = {};
      matchedSnap.docs.forEach(d => {
        const data = d.data();
        const status = data.Status || data['สถานะการตรวจสอบ'] || data['สถานะ'];
        if (status === 'รอยืนยัน' || !status) {
          const hName = data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '';
          pendingCounts[hName] = (pendingCounts[hName] || 0) + 1;
        }
      });

      const newCounts = {};
      for (const res of results) {
        const hName = res.Hospital_Name || res['โรงพยาบาล'] || '';
        newCounts[hName] = (newCounts[hName] || 0) + 1;
      }

      const now = new Date();
      const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      let message = "🚨 <b>แจ้งเตือนการเฝ้าระวังเครื่องมือแพทย์ (ECRI & FDA)</b>\n";
      message += `📅 ประจำวันที่ ${dateStr} เวลา ${timeStr} น.\n\n`;

      allHospitals.forEach((hName, index) => {
        const newCount = newCounts[hName] || 0;
        const pendingCount = pendingCounts[hName] || 0;
        
        message += `<b>${index + 1}. ${hName}</b>\n`;
        if (newCount > 0) {
          message += `⚠️ ตรวจพบความเสี่ยงใหม่: ${newCount} รายการ\n`;
        } else {
          message += `✅ ไม่พบความเสี่ยงใหม่\n`;
        }
        
        if (pendingCount > 0) {
          message += `⏳ รายการรอยืนยันสะสม: ${pendingCount} รายการ\n\n`;
        } else {
          message += `\n`;
        }
      });

      message += `🔗 <a href="${window.location.origin}">เข้าสู่ระบบตรวจสอบความปลอดภัย</a>`;
      await sendTelegramAlert(message, 'HTML');
    } catch (telErr) {
      console.warn("Telegram notification error:", telErr);
    }

    return { 
      success: true, 
      message: `การประมวลผล AI เสร็จสมบูรณ์ ตรวจพบความเสี่ยงตรงกัน ${results.length} รายการ`, 
      matchedCount: results.length 
    };

  } catch (error) {
    console.error("AI Matching Job Error:", error);
    return { success: false, message: error.toString() };
  }
}
