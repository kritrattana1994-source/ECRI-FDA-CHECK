import { api, getCleanAlertCode, logSystemActivity } from './api_firebase';
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
  'PRODUCTS', 'DIVISION', 'LABORATORIES', 'LABS', 'SET', 'UNIT', 'NEW', 'ALL'
]);

function extractBrandTokens(brandStr) {
  if (!brandStr) return [];
  const std = standardizeDeviceName(brandStr);
  return std.split(' ').filter(w => w.length >= 2 && !BRAND_STOP_WORDS.has(w));
}

export function isBrandPlausible(alertBrand, alertTitle, groupBrand) {
  const groupTokens = extractBrandTokens(groupBrand);
  if (groupTokens.length === 0) return false;

  const alertBrandTokens = extractBrandTokens(alertBrand);
  // 1. Direct match in alert's brand/manufacturer field
  if (alertBrandTokens.length > 0) {
    const directMatch = groupTokens.some(gt => 
      alertBrandTokens.some(at => gt === at || (gt.length >= 4 && (at.includes(gt) || gt.includes(at))))
    );
    if (directMatch) return true;
  }

  // 2. Exact word match in alert title/headline (with word boundaries to avoid false substring matches)
  const cleanTitle = ` ${standardizeDeviceName(alertTitle)} `;
  return groupTokens.some(gt => {
    if (gt.length < 3) return false;
    return cleanTitle.includes(` ${gt} `);
  });
}

/**
 * ฟังก์ชันเรียกใช้งาน DeepSeek API พร้อมระบบ Timeout และ AbortController ป้องกันการค้าง
 */
export async function callDeepseekApi(promptText, apiKey, timeoutMs = 25000) {
  const url = `https://api.deepseek.com/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = {
      model: "deepseek-chat",
      messages: [
        {
          role: "user",
          content: promptText
        }
      ],
      temperature: 0.1
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * วิเคราะห์และแปลข่าวฉบับเดี่ยวแบบเจาะลึก (Single Alert Deep Evaluation)
 * สำหรับหน้าต่างแสดงผล AI หรือการร้องขอบนหน้าเว็บ
 */
export async function analyzeSingleAlertWithAI(alertData, deviceData, apiKey) {
  const brand = deviceData.brand || deviceData.Brand || deviceData.Device_Brand || '';
  const model = deviceData.model || deviceData.Model || deviceData.Device_Model || '';
  const alertHeadline = alertData.Headline || alertData.Title || alertData.PRODUCT_DESCRIPTION || alertData.headline || alertData.alertHeadline || '';
  const alertDesc = alertData.Description || alertData.REASON_FOR_RECALL || alertData.alertHeadline || alertHeadline;
  const alertSource = alertData.source || (String(alertData.id || alertData.alertId || '').startsWith('ECRI') ? 'ECRI' : 'FDA');
  const alertId = alertData.id || alertData.Alert_ID || alertData.alertId || '-';

  const prompt = `
คุณคือผู้เชี่ยวชาญระดับสูงด้านวิศวกรรมชีวการแพทย์ (Chief Biomedical & Clinical Engineer)
หน้าที่ของคุณคือวิเคราะห์ "ประกาศเตือนภัยทางการแพทย์" ฉบับนี้อย่างละเอียด เพื่อให้ทีมวิศวกรชีวการแพทย์และโรงพยาบาลเข้าใจและนำไปปฏิบัติได้ทันที

ข้อมูลเครื่องมือแพทย์ของโรงพยาบาล:
- ยี่ห้อ: ${brand}
- รุ่น: ${model}

ข้อมูลประกาศเตือนภัย (${alertSource}):
- รหัสประกาศ: ${alertId}
- หัวข้อประกาศ: ${alertHeadline}
- รายละเอียดประกาศฉบับเต็ม: ${alertDesc}

ภารกิจที่ต้องดำเนินการ:
1. **แปลและสรุปเนื้อหาข่าวเป็นภาษาไทย (Thai Translation & Summary)**: อธิบายสรุปสิ่งที่เกิดขึ้นกับเครื่องรุ่นนี้ ให้กระชับ ชัดเจน เข้าใจง่าย
2. **วิเคราะห์อาการผิดปกติเบื้องต้นและสาเหตุความเสี่ยง (Symptom & Hazard Analysis)**: ระบุว่าเครื่องอาจเกิดอาการอย่างไร สาเหตุทางเทคนิคคืออะไร (เช่น ซอฟต์แวร์บั๊ก, ฮาร์ดแวร์ลัดวงจร, เซ็นเซอร์เพี้ยน) และมีผลกระทบ/อันตรายต่อผู้ป่วยหรือผู้ใช้อย่างไร
3. **ข้อเสนอแนะและแนวทางปฏิบัติการแก้ไข (Recommended Actions & Next Steps)**: ระบุขั้นตอนปฏิบัติงาน 3-5 ข้ออย่างเป็นรูปธรรมสำหรับวิศวกรชีวการแพทย์ (เช่น การเช็ค Serial No., การทดสอบอาการ, การติดต่อ Vendor/ผู้ผลิต, การระงับใช้ชั่วคราว)

ให้ตอบกลับเป็นโครงสร้าง JSON ดังนี้เท่านั้น (ห้ามใส่คำนำหน้าหรือ markdown quote อื่นนอก JSON):
{
  "risk_level": "ความเสี่ยงสูง (High Risk)",
  "confidence": "95%",
  "match_reason": "ยี่ห้อ ${brand} และรุ่น ${model} ตรงกับข้อมูลที่ระบุในประกาศเตือนภัย",
  "thai_summary": "แปลและสรุปเนื้อหาข่าวเป็นภาษาไทยอย่างละเอียด...",
  "symptom_analysis": "วิเคราะห์อาการผิดปกติเบื้องต้นและสาเหตุความเสี่ยง...",
  "action_plan": [
    "1. ตรวจสอบ Serial Number ของเครื่องในโรงพยาบาลกับช่วงที่ระบุในประกาศ",
    "2. ตรวจสอบอาการผิดปกติเบื้องต้นตามคำเตือน",
    "3. ประสานงานตัวแทนจำหน่าย (Vendor) หรือผู้ผลิตเพื่อขอชุดอัปเกรด/แก้ไข",
    "4. บันทึกผลการตรวจสอบลงในระบบประวัติเครื่องมือแพทย์"
  ]
}
`;

  const responseText = await callDeepseekApi(prompt, apiKey, 30000);
  const jsonStart = responseText.indexOf('{');
  const jsonEnd = responseText.lastIndexOf('}');
  
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
    const jsonStr = responseText.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonStr);
    return {
      riskLevel: parsed.risk_level || 'ความเสี่ยงสูง (High Risk)',
      confidence: parsed.confidence || '95%',
      matchReason: parsed.match_reason || `ยี่ห้อ ${brand} และรุ่น ${model} ตรงกับประกาศเตือนภัย`,
      summary: parsed.thai_summary || '',
      symptoms: parsed.symptom_analysis || '',
      actionPlan: Array.isArray(parsed.action_plan) ? parsed.action_plan : [parsed.action_plan].filter(Boolean),
      source: alertSource,
      alertId: alertId,
      headline: alertHeadline
    };
  }

  throw new Error("Invalid AI JSON format from DeepSeek");
}

/**
 * รันกระบวนการ AI Matching ค้นหาเครื่องมือแพทย์ที่ตรงกับประกาศเตือนภัย (Ultra-Strict Precision Mode + High-Performance Concurrency)
 * @param {Array} targetAlerts รายการ Alert ที่ต้องการตรวจสอบ
 * @param {Function} onProgress ฟังก์ชัน callback แจ้งความคืบหน้า
 * @returns {Object} ผลลัพธ์การแมตช์
 */
export async function runAIMatchingJob(targetAlerts, onProgress, targetHospital = 'All') {
  try {
    // 1. ดึง API Key
    const aiSettings = await api.getGeminiApiKeySettings();
    const apiKey = aiSettings?.key?.trim();
    if (!apiKey) {
      throw new Error("ยังไม่ได้ตั้งค่า API Key สำหรับ AI ในระบบ (กรุณาใส่ API Key ในส่วนการตั้งค่า)");
    }

    // 2. ดึงรายการเครื่องมือแพทย์ทั้งหมดจาก Firestore เพื่อมาจัดกลุ่ม
    const devicesSnap = await getDocs(collection(db, 'devices'));
    
    // จัดกลุ่มเครื่องมือ (Device Grouping) ตามยี่ห้อและรุ่น
    const uniqueDevicesMap = new Map();
    devicesSnap.docs.forEach(d => {
      const data = d.data();
      
      // กรองสาขาถ้ามีการระบุ targetHospital
      if (targetHospital && targetHospital !== 'All') {
        const hospName = data.Hospital_Name || data.Hospital || data['โรงพยาบาล'] || '';
        if (hospName !== targetHospital) return;
      }
      
      const stdBrand = standardizeDeviceName(data.Brand || data['ยี่ห้อ'] || '');
      const stdModel = standardizeDeviceName(data.Model || data['รุ่น'] || '');
      
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
    const totalAlerts = targetAlerts.length;

    // 3. เตรียมรายการ Alerts ที่ผ่าน Pre-filter เบื้องต้น
    const alertQueue = [];
    for (let i = 0; i < totalAlerts; i++) {
      const alert = targetAlerts[i];
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
        alertBrand = alert.TRADE_NAME || alert.FIRM_NAME || alert.RECALLING_FIRM || '';
        alertModel = alert.PRODUCT_DESCRIPTION || alert.BRAND_NAME || alert.GENERIC_NAME || '';
        alertTitle = `FDA Recall: ${alertBrand} - ${alertModel}`;
        alertDesc = alert.PRODUCT_DESCRIPTION || alert.REASON_FOR_RECALL || '';
      }

      const potentialGroups = uniqueDevices.filter(g => {
        return isBrandPlausible(alertBrand, alertTitle, g.originalBrand);
      });

      alertQueue.push({
        alert,
        alertIndex: i + 1,
        alertBrand,
        alertModel,
        alertTitle,
        alertDesc,
        potentialGroups
      });
    }

    // 4. ฟังก์ชันประมวลผลแต่ละ Alert ผ่าน AI
    let processedCount = 0;
    const processSingleAlert = async (item) => {
      const { alert, alertBrand, alertModel, alertTitle, alertDesc, potentialGroups } = item;

      // ถ้าไม่มีกลุ่มเครื่องมือแพทย์ใดตรงกับยี่ห้อนี้เลย ให้ข้ามทันที (ไม่ต้องยิง AI API)
      if (!potentialGroups || potentialGroups.length === 0) {
        processedCount++;
        if (onProgress) onProgress(processedCount, totalAlerts);
        return [];
      }

      const prompt = `
คุณคือผู้เชี่ยวชาญด้านวิศวกรรมชีวการแพทย์ (Biomedical Engineering Specialist) ประจำฝ่ายบริหารจัดการความปลอดภัยเครื่องมือแพทย์
หน้าที่ของคุณคือ:
1. ตรวจสอบอย่างเข้มงวดสูงสุด (Ultra-Strict High-Precision Matching) ว่า "ประกาศเตือนภัยด้านความปลอดภัย" มีผลกระทบต่อ "เครื่องมือแพทย์ในโรงพยาบาล" หรือไม่
2. หากตรงกัน ให้ทำการ:
   - แปลและสรุปเนื้อหาข่าวแจ้งเตือนภัยเป็นภาษาไทย (thai_summary)
   - วิเคราะห์อาการผิดปกติเบื้องต้นและสาเหตุความเสี่ยงต่อผู้ป่วย/เครื่องมือ (symptom_analysis)
   - เสนอแนะแนวทางการปฏิบัติงานและขั้นตอนแก้ไขต่อไปสำหรับวิศวกรชีวการแพทย์ (action_plan)

กฎเหล็กในการจับคู่ (Strict Rules - ห้ามฝ่าฝืน):
1. **ยี่ห้อ (Brand) และ รุ่น (Model/Series)**: ต้องตรงกันอย่างชัดเจนตามที่ระบุในประกาศ
   - ยี่ห้อผู้ผลิตต้องเป็นยี่ห้อเดียวกัน
   - รุ่นที่แจ้งเตือนในประกาศต้องตรงกับชื่อรุ่น หรือ Series ของเครื่องในโรงพยาบาล
   - ตัวอย่างที่ถูกต้อง: ประกาศระบุ "Olympus UHI-4" กับเครื่องในรพ. ยี่ห้อ "OLYMPUS" รุ่น "UHI-4" -> [MATCH: HIGH]
2. **ห้ามจับคู่ข้ามรุ่นเด็ดขาด (NO Cross-Model Match)**:
   - หากยี่ห้อเดียวกัน แต่ประกาศระบุรุ่น "UHI-4" ส่วนเครื่องในรพ.คือรุ่น "CV-190" หรือ "CLV-290" -> ห้ามจับคู่เด็ดขาด (ถือว่าไม่ตรงกัน)
3. **ห้ามจับคู่เพราะเป็นเครื่องประเภทเดียวกัน (NO Generic Category Match)**
4. **ความมั่นใจระดับ HIGH (ตรง 100%) เท่านั้น**:
   - หากไม่แน่ใจ หรือไม่มีการระบุรุ่นที่ชัดเจนในประกาศเตือนภัย -> ให้ตอบ: []

ข้อมูลประกาศเตือนภัย (Alert):
หัวข้อ: ${alertTitle}
แบรนด์/ผู้ผลิต: ${alertBrand}
รุ่น/รายละเอียดที่ประกาศเตือน: ${alertModel}
เนื้อหารายละเอียดปัญหา: ${alertDesc.substring(0, 1500)}

รายการรุ่นเครื่องมือแพทย์ของโรงพยาบาลที่เข้ารอบคัดกรอง:
${potentialGroups.map((g, idx) => `[${idx}] ยี่ห้อ: ${g.originalBrand} | รุ่น: ${g.originalModel}`).join('\n')}

คำสั่ง: จงตรวจสอบและส่งคืนเฉพาะรายการที่ตรงกันจริง 100% เท่านั้น ในรูปแบบ JSON Array:
[
  {
    "index": <เลขลำดับ>,
    "confidence": "HIGH",
    "match_reason": "ยี่ห้อและรุ่นตรงกับประกาศเตือนภัยอย่างชัดเจน",
    "thai_summary": "แปลและสรุปเนื้อหาข่าวภาษาไทยอย่างชัดเจน...",
    "symptom_analysis": "วิเคราะห์อาการผิดปกติเบื้องต้น สาเหตุ และผลกระทบต่อผู้ป่วย...",
    "action_plan": [
      "1. ตรวจสอบ Serial Number ของเครื่องในโรงพยาบาล",
      "2. ตรวจสอบอาการผิดปกติเบื้องต้นตามคำเตือน",
      "3. ประสานงานตัวแทนจำหน่าย (Vendor) เพื่อขออัปเกรดหรือแก้ไข",
      "4. บันทึกผลการตรวจสอบลงในระบบ"
    ]
  }
]
หากไม่มีรายการใดตรงกันเลย ให้ตอบ: []
`;

      const alertMatches = [];
      try {
        const aiResponseText = await callDeepseekApi(prompt, apiKey, 20000);
        const jsonStart = aiResponseText.indexOf('[');
        const jsonEnd = aiResponseText.lastIndexOf(']');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
          const jsonStr = aiResponseText.substring(jsonStart, jsonEnd + 1);
          const parsedMatches = JSON.parse(jsonStr);
          
          for (const match of parsedMatches) {
            if (String(match.confidence).toUpperCase() !== 'HIGH') continue;

            if (match.index >= 0 && match.index < potentialGroups.length) {
              const matchedGroup = potentialGroups[match.index];
              const matchReason = match.match_reason || match.reason || '';
              const thaiSummary = match.thai_summary || '';
              const symptomAnalysis = match.symptom_analysis || '';
              const actionPlan = Array.isArray(match.action_plan) ? match.action_plan : [match.action_plan].filter(Boolean);

              const structuredAiObj = {
                riskLevel: 'ความเสี่ยงสูง (High Risk)',
                confidence: '95%',
                matchReason: matchReason,
                summary: thaiSummary,
                symptoms: symptomAnalysis,
                actionPlan: actionPlan,
                explanation: `${thaiSummary}\n\n⚠️ การวิเคราะห์อาการและความเสี่ยง:\n${symptomAnalysis}`
              };
              
              const cleanAlertId = getCleanAlertCode(alert, alert.id);

              for (const matchedDev of matchedGroup.devices) {
                const matchRecord = {
                  Alert_ID: cleanAlertId,
                  Real_Alert_ID: cleanAlertId,
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
                  Source: alert.source || (String(cleanAlertId).startsWith('ECRI') ? 'ECRI' : 'FDA'),
                  Alert_Publication_Date: alert['Alert Publication Date'] || alert.Alert_Date || alert.POSTED_INTERNET_DT || alert.EVENT_DATE_INITIATED || new Date().toISOString().split('T')[0],
                  Confidence: 'HIGH',
                  Match_Confidence: 'HIGH',
                  Match_Reason: matchReason,
                  AI_Reason: matchReason,
                  AI_Summary: thaiSummary,
                  AI_Symptoms: symptomAnalysis,
                  AI_Action_Plan: actionPlan,
                  AI_Analysis: structuredAiObj,
                  Tool_Name: matchedDev.Device_Name || matchedDev.Tool_Name || matchedDev['ชื่อเครื่องมือ'] || matchedDev['ชนิดเครื่องมือ'] || '',
                  Matched_At: new Date().toISOString(),
                  Detect_Date: new Date().toISOString().split('T')[0],
                  Status: 'รอยืนยัน',

                  // Thai Keys for full backwards-compatibility
                  'โรงพยาบาล': matchedDev.Hospital_Name || matchedDev['โรงพยาบาล'] || matchedDev.hospital || '',
                  'รหัสเครื่องมือ': matchedDev.Device_Code || matchedDev.Device_ID || matchedDev['รหัสเครื่องมือ'] || '',
                  'เลขคุรุภัณฑ์': matchedDev.Asset_ID || matchedDev.Asset_No || '',
                  'ยี่ห้อ': matchedDev.Brand || matchedDev['ยี่ห้อ'] || '',
                  'รุ่น': matchedDev.Model || matchedDev['รุ่น'] || '',
                  'แผนก': matchedDev.Department || matchedDev['แผนก'] || '',
                  'แหล่งข้อมูล': alert.source || (String(cleanAlertId).startsWith('ECRI') ? 'ECRI' : 'FDA'),
                  'รหัสแจ้งเตือน': cleanAlertId,
                  'หัวข้อแจ้งเตือน': alertTitle || '',
                  'วันที่ประกาศ': alert['Alert Publication Date'] || alert.Alert_Date || alert.POSTED_INTERNET_DT || alert.EVENT_DATE_INITIATED || new Date().toISOString().split('T')[0],
                  'ระดับความชัดเจน': 'HIGH',
                  'เหตุผลการจับคู่': matchReason,
                  'แปลสรุปข่าว': thaiSummary,
                  'การวิเคราะห์อาการและความเสี่ยง': symptomAnalysis,
                  'แนวทางปฏิบัติการแก้ไข': actionPlan.join('\n'),
                  'สถานะการตรวจสอบ': 'รอยืนยัน'
                };
                alertMatches.push(matchRecord);
              }
            }
          }
        }
      } catch (e) {
        console.warn("AI evaluation error for alert:", alertTitle, e);
      } finally {
        processedCount++;
        if (onProgress) onProgress(processedCount, totalAlerts);
      }

      return alertMatches;
    };

    // 5. ประมวลผลแบบ Parallel Concurrency (พร้อมกัน 4 เส้น) เพื่อความรวดเร็วสูงสุด
    const CONCURRENCY_LIMIT = 4;
    let queueIdx = 0;

    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, alertQueue.length) }, async () => {
      while (queueIdx < alertQueue.length) {
        const item = alertQueue[queueIdx++];
        const matchedItems = await processSingleAlert(item);
        if (matchedItems && matchedItems.length > 0) {
          results.push(...matchedItems);
        }
      }
    });

    await Promise.all(workers);

    // 6. บันทึกผลลัพธ์ลง Firestore (Batch Chunks ป้องกันเกิน Limit 500)
    const allOperations = [];
    
    // 6.1 บันทึกรายการที่แมตช์เจอ
    for (const res of results) {
      allOperations.push({ type: 'set', ref: doc(collection(db, 'matchedAlerts')), data: res });
    }
    
    // 6.2 อัปเดตสถานะประกาศเตือนภัยที่วิเคราะห์แล้วทั้งหมดเป็น MATCHED (เฉพาะเมื่อรันทุกสาขา)
    if (!targetHospital || targetHospital === 'All') {
      for (const alert of targetAlerts) {
        if (alert.id && alert.source) {
          const alertCollection = alert.source.toLowerCase() === 'fda' ? 'fda' : 'ecri';
          allOperations.push({
            type: 'update',
            ref: doc(db, alertCollection, alert.id),
            data: { Matched: 'MATCHED', AI_Processed_Date: new Date().toISOString() }
          });
        }
      }
    }

    // Commit in chunks of 400
    for (let i = 0; i < allOperations.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = allOperations.slice(i, i + 400);
      chunk.forEach(op => {
        if (op.type === 'set') batch.set(op.ref, op.data);
        if (op.type === 'update') batch.update(op.ref, op.data);
      });
      await batch.commit();
    }

    // 7. แจ้งเตือน Telegram และบันทึกประวัติการทำงาน
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
      const originUrl = 'https://ecri-fda-check.vercel.app';

      let message = "🚨 <b>แจ้งเตือนการเฝ้าระวังเครื่องมือแพทย์ (ECRI & FDA)</b>\n";
      message += `📅 ประจำวันที่ ${dateStr} เวลา ${timeStr} น.\n\n`;

      let plainMessage = `🚨 แจ้งเตือนการเฝ้าระวังเครื่องมือแพทย์ (ECRI & FDA)\n`;
      plainMessage += `📅 ประจำวันที่ ${dateStr} เวลา ${timeStr} น.\n\n`;

      allHospitals.forEach((hName, index) => {
        const newCount = newCounts[hName] || 0;
        const pendingCount = pendingCounts[hName] || 0;
        
        message += `<b>${index + 1}. ${hName}</b>\n`;
        plainMessage += `${index + 1}. ${hName}\n`;

        if (newCount > 0) {
          message += `⚠️ ตรวจพบความเสี่ยงใหม่: ${newCount} รายการ\n`;
          plainMessage += `⚠️ ตรวจพบความเสี่ยงใหม่: ${newCount} รายการ\n`;
        }
        if (pendingCount > 0) {
          message += `⏳ รายการรอยืนยันสะสม: ${pendingCount} รายการ\n`;
          plainMessage += `⏳ รายการรอยืนยันสะสม: ${pendingCount} รายการ\n`;
        }
        if (newCount === 0 && pendingCount === 0) {
          message += `✅ สถานะปกติ (ไม่พบความเสี่ยงค้างรับรอง)\n`;
          plainMessage += `✅ สถานะปกติ (ไม่พบความเสี่ยงค้างรับรอง)\n`;
        }
        
        message += `\n`;
        plainMessage += `\n`;
      });

      message += `🔗 <b>ลิงก์เข้าสู่ระบบความปลอดภัย:</b>\n${originUrl}`;
      plainMessage += `🔗 ลิงก์เข้าสู่ระบบความปลอดภัย:\n${originUrl}`;

      // บันทึกข้อความล่าสุดไว้ในระบบ (Firestore & LocalStorage) เพื่อให้ปุ่มคัดลอกลง LINE นำไปใช้ต่อได้ทันที
      await api.saveLatestAlertMessage(plainMessage);

      // ส่งข้อความแจ้งเตือนทาง Telegram
      await sendTelegramAlert(message, 'HTML');
      await logSystemActivity(`ประมวลผลการจับคู่ AI เสร็จสมบูรณ์ (พบความเสี่ยง ${results.length} รายการ)`, 'AI Matcher', results.length, 'Success');
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
