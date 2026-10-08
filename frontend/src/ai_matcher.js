import { api, getCleanAlertCode, logSystemActivity, formatThaiDate } from './api_firebase.js';
import { db } from './firebase.js';
import { collection, getDocs, doc, setDoc, writeBatch, query, where } from 'firebase/firestore';
import { sendTelegramAlert } from './telegram.js';
import { 
  parseAlertHeadline, 
  classifyModelMatch, 
  extractBaseAlertCode,
  extractFdaProductSubject,
  extractBrandTokens,
  isBrandPlausibleCore
} from './matcher_core.js';

// ---------------------------------------------------------
// ฟังก์ชันตรวจสอบความสอดคล้องของแบรนด์ (เรียกใช้ logic กลางจาก matcher_core.js)
// ---------------------------------------------------------
export function isBrandPlausible(alertBrand, alertTitle, groupBrand, productBrandNames = []) {
  return isBrandPlausibleCore(alertBrand, alertTitle, groupBrand, productBrandNames);
}

// ---------------------------------------------------------
// ✨ NEW: ฟังก์ชัน Enrich Device ด้วย AI — ค้นหาชื่อสินค้า (Product Brand Name)
// สำหรับช่วย matching เมื่อ ECRI ใช้ชื่อสินค้าแทนชื่อบริษัท
// ---------------------------------------------------------
export async function enrichDeviceWithProductBrand(brand, model, deviceName, apiKey) {
  if (!brand && !model) return [];
  const prompt = `You are a medical device database expert.
Given the manufacturer name and model, list the well-known PRODUCT BRAND NAMES (trade names / product line names) that ECRI or FDA commonly use to refer to this device in recall/safety notices.

Manufacturer (Brand): ${brand || '-'}
Model / Series: ${model || '-'}
Device Type: ${deviceName || '-'}

Rules:
- Return ONLY product/trade brand names that ECRI/FDA commonly use (e.g. "LIFEPAK" for Stryker, "NOxBOX" for Bedfont Scientific)
- Do NOT return the manufacturer name itself
- Do NOT return generic device type names
- If the manufacturer name IS already the well-known brand used by ECRI/FDA, return []
- Return at most 5 names

Respond with ONLY a JSON array of strings, e.g.: ["LIFEPAK", "LIFEPAK 15"]
If none found, respond: []`;

  try {
    const responseText = await callDeepseekApi(prompt, apiKey, 15000);
    const jsonStart = responseText.indexOf('[');
    const jsonEnd = responseText.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
      const parsed = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1));
      if (Array.isArray(parsed)) {
        return parsed.map(s => String(s).trim().toUpperCase()).filter(s => s.length > 1);
      }
    }
  } catch (e) {
    console.warn(`enrichDeviceWithProductBrand error for ${brand} ${model}:`, e);
  }
  return [];
}

// ---------------------------------------------------------
// ✨ NEW: Batch Job — เติม Product_Brand_Names ให้ทุก Unique Brand+Model ใน Firestore
// ใช้สำหรับ Migration ครั้งแรก และสามารถเรียกซ้ำได้อย่างปลอดภัย (skip ที่มีอยู่แล้ว)
// ---------------------------------------------------------
export async function runEnrichProductBrandJob(apiKey, onProgress) {
  try {
    // 1. ตรวจสอบ API Key (รับมาจาก api_firebase แทนการ import ซ้ำ เพื่อหลีกเลี่ยง circular dependency)
    if (!apiKey) throw new Error('ยังไม่ได้ตั้งค่า API Key');

    // 2. ดึงเครื่องมือทั้งหมด
    const devicesSnap = await getDocs(collection(db, 'devices'));
    const allDocs = devicesSnap.docs;

    // 3. จัดกลุ่ม Unique Brand+Model (เพื่อเรียก AI แค่ครั้งเดียวต่อกลุ่ม)
    const uniqueMap = new Map();
    allDocs.forEach(d => {
      const data = d.data();
      const brand = data.Brand || data['ยี่ห้อ'] || '';
      const model = data.Model || data['รุ่น'] || '';
      const deviceName = data.Device_Name || data['ชนิดเครื่องมือ'] || '';
      // Skip ถ้ามี Product_Brand_Names อยู่แล้ว
      if (data.Product_Brand_Names !== undefined) return;
      const key = `${brand}___${model}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, { brand, model, deviceName, docIds: [] });
      }
      uniqueMap.get(key).docIds.push(d.id);
    });

    const uniqueGroups = Array.from(uniqueMap.values());
    const total = uniqueGroups.length;
    let processed = 0;
    let enrichedCount = 0;

    if (onProgress) onProgress(0, total, 'เริ่มต้น Enrich Product Brand Names...');

    if (total === 0) {
      if (onProgress) onProgress(0, 0, 'ทุกรายการมีข้อมูลอยู่แล้ว ไม่ต้อง Enrich');
      return { success: true, enrichedCount: 0, skippedCount: allDocs.length, totalGroups: 0 };
    }

    // 4. วิ่งแบบ Concurrency 5 เส้น
    const CONCURRENCY = 5;
    let qIdx = 0;

    const workers = Array.from({ length: Math.min(CONCURRENCY, uniqueGroups.length) }, async () => {
      while (qIdx < uniqueGroups.length) {
        const group = uniqueGroups[qIdx++];
        const { brand, model, deviceName, docIds } = group;

        processed++;
        if (onProgress) onProgress(processed, total, `กำลัง Enrich: ${brand} ${model}`);

        // เรียก AI
        const productBrandNames = await enrichDeviceWithProductBrand(brand, model, deviceName, apiKey);

        // อัปเดตทุก document ในกลุ่มนี้ (batch write)
        for (let i = 0; i < docIds.length; i += 400) {
          const batch = writeBatch(db);
          docIds.slice(i, i + 400).forEach(docId => {
            batch.update(doc(db, 'devices', docId), { Product_Brand_Names: productBrandNames });
          });
          await batch.commit();
        }

        if (productBrandNames.length > 0) enrichedCount++;
      }
    });

    await Promise.all(workers);

    if (onProgress) onProgress(total, total, `เสร็จสมบูรณ์! พบชื่อสินค้าใหม่ ${enrichedCount} กลุ่ม จากทั้งหมด ${total} กลุ่ม`);
    return { success: true, enrichedCount, totalGroups: total };

  } catch (error) {
    console.error('runEnrichProductBrandJob error:', error);
    return { success: false, message: error.toString() };
  }
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
  const alertDesc = alertData.Description || alertData.MANUFACTURER_RECALL_REASON || alertData.REASON_FOR_RECALL || alertData.reason || alertData.alertHeadline || alertHeadline;
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
 * ดึง JSON Array จากคำตอบของ AI อย่างทนทาน
 * - ตัด code fence (```json) ออก
 * - สแกนหา array ที่วงเล็บสมดุลและ parse ได้ (รองรับกรณี AI ตอบ "[]" แล้วตามด้วยข้อความอธิบาย)
 * - คืน null เมื่อหา array ที่ใช้ได้ไม่เจอ (ต่างจาก [] ที่หมายถึง "AI ตอบว่าไม่ตรง")
 */
export function extractJsonArray(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json|```/gi, '');
  for (let start = cleaned.indexOf('['); start !== -1; start = cleaned.indexOf('[', start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          try {
            const v = JSON.parse(cleaned.substring(start, i + 1));
            if (Array.isArray(v) && v.every(x => x && typeof x === 'object')) return v;
          } catch (_) { /* ลองตำแหน่งถัดไป */ }
          break;
        }
      }
    }
  }
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * เรียก AI จับคู่พร้อม retry (สูงสุด 3 ครั้ง)
 * - retry เมื่อ timeout / HTTP error / ตอบกลับ parse ไม่ได้
 * - ถ้าตอบ [] แต่ "น่าสงสัย" (ชื่อรุ่นเครื่องปรากฏในหัวข้อข่าว) ให้ถามซ้ำเพื่อยืนยัน (ผลของ AI ไม่คงที่)
 * @returns {{parsed: Array|null, attempts: number, rawHead: string, error: string}} parsed=null หมายถึงล้มเหลวทุกครั้ง
 */
export async function matchWithRetry(prompt, apiKey, isSuspiciousEmpty = false, maxAttempts = 3) {
  let attempts = 0;
  let lastError = '';
  let rawHead = '';
  let bestEmpty = null;
  while (attempts < maxAttempts) {
    attempts++;
    try {
      const text = await callDeepseekApi(prompt, apiKey, 20000);
      rawHead = String(text || '').substring(0, 1500);
      const arr = extractJsonArray(text);
      if (arr === null) {
        lastError = 'คำตอบ AI ไม่ใช่ JSON array ที่อ่านได้';
      } else if (arr.length > 0) {
        return { parsed: arr, attempts, rawHead, error: '' };
      } else {
        bestEmpty = arr;
        if (!isSuspiciousEmpty) break; // ตอบ [] ปกติ ไม่ต้องถามซ้ำ
        lastError = '';
      }
    } catch (e) {
      lastError = String((e && e.message) || e);
    }
    if (attempts < maxAttempts) await sleep(attempts * 800);
  }
  if (bestEmpty !== null) return { parsed: bestEmpty, attempts, rawHead, error: '' };
  return { parsed: null, attempts, rawHead, error: lastError || 'AI ไม่ตอบกลับ' };
}

/**
 * สร้าง Match Record มาตรฐานสำหรับบันทึกลง matchedAlerts
 */
function buildMatchedRecord(alert, cleanAlertId, alertTitle, matchedDev, confidence, matchReason, thaiSummary, symptomAnalysis, actionPlan, structuredAiObj = null) {
  const normPlan = Array.isArray(actionPlan) ? actionPlan : [actionPlan].filter(Boolean);
  const nowIso = new Date().toISOString();
  const dateIso = nowIso.split('T')[0];
  const pubDate = alert['Alert Publication Date'] || alert.Alert_Date || alert.POSTED_INTERNET_DT || alert.EVENT_DATE_INITIATED || dateIso;

  const aiObj = structuredAiObj || {
    riskLevel: 'ความเสี่ยงสูง (High Risk)',
    confidence: confidence === 'HIGH' ? '95%' : '80%',
    matchReason: matchReason,
    summary: thaiSummary,
    symptoms: symptomAnalysis,
    actionPlan: normPlan,
    explanation: `${thaiSummary}\n\n⚠️ การวิเคราะห์อาการและความเสี่ยง:\n${symptomAnalysis}`
  };

  const hosp = matchedDev.Hospital_Name || matchedDev['โรงพยาบาล'] || matchedDev.hospital || '';
  const devCode = matchedDev.Device_Code || matchedDev.Device_ID || matchedDev['รหัสเครื่องมือ'] || matchedDev['รหัสเครื่อง'] || '';
  const assetId = matchedDev.Asset_ID || matchedDev.Asset_No || matchedDev['เลขคุรุภัณฑ์'] || matchedDev['เลขครุภัณฑ์'] || '';
  const brand = matchedDev.Brand || matchedDev['ยี่ห้อ'] || '';
  const model = matchedDev.Model || matchedDev['รุ่น'] || '';
  const dept = matchedDev.Department || matchedDev['แผนก'] || matchedDev.dept || '';
  const toolName = matchedDev.Device_Name || matchedDev.Tool_Name || matchedDev['ชื่อเครื่องมือ'] || matchedDev['ชนิดเครื่องมือ'] || '';
  const source = alert.source || (String(cleanAlertId).startsWith('ECRI') ? 'ECRI' : 'FDA');

  return {
    Alert_ID: cleanAlertId,
    Real_Alert_ID: cleanAlertId,
    Alert_Title: alertTitle || '',
    Headline: alert.Headline || alert.Title || alertTitle || '',
    Hospital_Name: hosp,
    Device_Code: devCode,
    Device_ID: devCode,
    Asset_ID: assetId,
    Brand: brand,
    Device_Brand: brand,
    Model: model,
    Device_Model: model,
    Department: dept,
    Source: source,
    Alert_Publication_Date: pubDate,
    Confidence: confidence || 'HIGH',
    Match_Confidence: confidence || 'HIGH',
    Match_Reason: matchReason,
    AI_Reason: matchReason,
    AI_Summary: thaiSummary,
    AI_Symptoms: symptomAnalysis,
    AI_Action_Plan: normPlan,
    AI_Analysis: aiObj,
    Tool_Name: toolName,
    Matched_At: nowIso,
    Detect_Date: dateIso,
    Status: 'รอยืนยัน',

    // Thai Keys for full backwards-compatibility
    'โรงพยาบาล': hosp,
    'รหัสเครื่องมือ': devCode,
    'เลขคุรุภัณฑ์': assetId,
    'ยี่ห้อ': brand,
    'รุ่น': model,
    'แผนก': dept,
    'แหล่งข้อมูล': source,
    'รหัสแจ้งเตือน': cleanAlertId,
    'หัวข้อแจ้งเตือน': alertTitle || '',
    'วันที่ประกาศ': pubDate,
    'ระดับความชัดเจน': confidence || 'HIGH',
    'เหตุผลการจับคู่': matchReason,
    'แปลสรุปข่าว': thaiSummary,
    'การวิเคราะห์อาการและความเสี่ยง': symptomAnalysis,
    'แนวทางปฏิบัติการแก้ไข': normPlan.join('\n'),
    'สถานะการตรวจสอบ': 'รอยืนยัน'
  };
}

/**
 * รันกระบวนการ AI Matching ค้นหาเครื่องมือแพทย์ที่ตรงกับประกาศเตือนภัย (Ultra-Strict Precision Mode + High-Performance Concurrency)
 * @param {Array} targetAlerts รายการ Alert ที่ต้องการตรวจสอบ
 * @param {Function} onProgress ฟังก์ชัน callback แจ้งความคืบหน้า
 * @param {string} targetHospital สาขาที่ต้องการ ('All' = ทุกสาขา)
 * @param {{dryRun?: boolean}} options dryRun=true: ไม่เขียน Firestore / ไม่ส่ง Telegram
 * @returns {Object} ผลลัพธ์การแมตช์
 */
export async function runAIMatchingJob(targetAlerts, onProgress, targetHospital = 'All', options = {}) {
  const dryRun = !!options.dryRun;
  try {
    // 1. ดึง API Key
    const aiSettings = await api.getGeminiApiKeySettings();
    const apiKey = aiSettings?.key?.trim();
    if (!apiKey) {
      throw new Error("ยังไม่ได้ตั้งค่า API Key สำหรับ AI ในระบบ (กรุณาใส่ API Key ในส่วนการตั้งค่า)");
    }

    // 2. ดึงรายการเครื่องมือแพทย์เพื่อมาจัดกลุ่ม (ถ้าเลือกสาขา ให้ดึงเฉพาะสาขานั้นเพื่อประหยัดโควตา)
    let deviceDocs = [];
    try {
      if (targetHospital && targetHospital !== 'All') {
        const q = query(collection(db, 'devices'), where('Hospital_Name', '==', targetHospital));
        const snap = await getDocs(q);
        deviceDocs = snap.docs;
      } else {
        const devicesSnap = await getDocs(collection(db, 'devices'));
        deviceDocs = devicesSnap.docs;
      }
    } catch (dbErr) {
      const errStr = String((dbErr && dbErr.message) || dbErr);
      if (errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota exceeded')) {
        throw new Error('โควตาการอ่านฐานข้อมูล Firestore ประจำวันเต็ม (Quota exceeded: เกิน 50,000 reads/วันของ Firebase Spark Plan) — กรุณารอโควตารีเซ็ต หรือเลือกกรองเฉพาะสาขาที่ต้องการตรวจสอบ');
      }
      throw dbErr;
    }
    
    // จัดกลุ่มเครื่องมือ (Device Grouping) ตามยี่ห้อและรุ่น
    const uniqueDevicesMap = new Map();
    deviceDocs.forEach(d => {
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
          // ✨ NEW: ดึง Product_Brand_Names ที่ AI เติมไว้ เพื่อใช้ใน pre-filter
          productBrandNames: Array.isArray(data.Product_Brand_Names) ? data.Product_Brand_Names : [],
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
    const outcomes = [];
    const totalAlerts = targetAlerts.length;

    // ✨ ตรวจสอบและดึงประวัติการแมตช์ของข่าวย้อนหลัง สำหรับข่าวอัปเดต (เช่น A46797 01 -> A46797)
    const baseCodeSet = new Set();
    targetAlerts.forEach(a => {
      const cId = getCleanAlertCode(a, a.id);
      const bCode = extractBaseAlertCode(cId);
      if (bCode) baseCodeSet.add(bCode);
    });

    const inheritedMatchesMap = new Map();
    if (baseCodeSet.size > 0) {
      try {
        const maSnap = await getDocs(collection(db, 'matchedAlerts'));
        maSnap.docs.forEach(d => {
          const mData = d.data();
          const alId = mData.Alert_ID || mData.Real_Alert_ID || '';
          if (baseCodeSet.has(alId)) {
            if (!inheritedMatchesMap.has(alId)) inheritedMatchesMap.set(alId, []);
            inheritedMatchesMap.get(alId).push(mData);
          }
        });
      } catch (e) {
        console.warn('Error loading inherited base matches:', e);
      }
    }

    // 3. เตรียมรายการ Alerts และจัดกลุ่ม Candidate ตามระดับความแน่นอน (Deterministic Classifier)
    const alertQueue = [];
    for (let i = 0; i < totalAlerts; i++) {
      const alert = targetAlerts[i];
      let alertBrand = '';
      let alertSubject = '';
      let alertProblem = '';
      let alertTitle = '';
      let alertDesc = '';

      if (alert.source === 'ECRI') {
        const headline = alert.Headline || alert.Title || alert['หัวเรื่อง'] || '';
        const parsed = parseAlertHeadline(headline, 'ECRI');
        alertBrand = parsed.brand || alert.Manufacturer || '';
        alertSubject = parsed.subject || headline;
        alertProblem = parsed.problem || '';
        alertTitle = headline;
        alertDesc = alert.Headline || alert.Description || '';
      } else {
        alertBrand = alert.FIRM_NAME || alert.RECALLING_FIRM || alert.TRADE_NAME || '';
        alertSubject = alert.BRAND_NAME || alert.GENERIC_NAME || alert.TRADE_NAME || extractFdaProductSubject(alert.PRODUCT_DESCRIPTION) || '';
        alertProblem = alert.MANUFACTURER_RECALL_REASON || alert.REASON_FOR_RECALL || alert.Problem || '';
        const shortSub = String(alertSubject).split(/[\r\n]+/)[0].trim().substring(0, 150);
        alertTitle = alert.TRADE_NAME ? `FDA Recall: ${alert.TRADE_NAME}` : `FDA Recall: ${alertBrand} - ${shortSub}`;
        alertDesc = [alert.PRODUCT_DESCRIPTION, alertProblem].filter(Boolean).join(' | ') || alert.PRODUCT_DESCRIPTION || '';
      }

      const cleanAlertId = getCleanAlertCode(alert, alert.id);
      const baseCode = extractBaseAlertCode(cleanAlertId);
      const inheritedMatches = (baseCode && inheritedMatchesMap.get(baseCode)) || [];

      // ค้นหากลุ่มเครื่องมือที่ Brand เป็นไปได้
      const brandMatches = uniqueDevices.filter(g => {
        return isBrandPlausible(alertBrand, alertTitle, g.originalBrand, g.productBrandNames);
      });

      // จำแนกระดับ Model Match ด้วย matcher_core
      const strongGroups = [];
      const familyGroups = [];
      const otherGroups = [];

      brandMatches.forEach(g => {
        const tier = classifyModelMatch(alertSubject, alertDesc, g.originalModel);
        if (tier === 'STRONG') strongGroups.push(g);
        else if (tier === 'FAMILY') familyGroups.push(g);
        else otherGroups.push(g);
      });

      // เลือกลุ่มส่งให้ AI:
      // ถ้าพบกลุ่ม STRONG หรือ FAMILY ให้เน้นกลุ่มเหล่านี้ (ป้องกัน Prompt ล้น 200+ รายการจน AI มึนงง)
      let potentialGroups = [];
      if (strongGroups.length > 0 || familyGroups.length > 0) {
        potentialGroups = [...strongGroups, ...familyGroups];
      } else {
        potentialGroups = brandMatches.slice(0, 30);
      }

      alertQueue.push({
        alert,
        alertIndex: i + 1,
        alertBrand,
        alertModel: alertSubject,
        alertTitle,
        alertDesc,
        potentialGroups,
        strongGroups,
        inheritedMatches
      });
    }

    // 4. ฟังก์ชันประมวลผลแต่ละ Alert ผ่าน AI
    let processedCount = 0;
    const processSingleAlert = async (item) => {
      const { alert, alertBrand, alertModel, alertTitle, alertDesc, potentialGroups, strongGroups, inheritedMatches } = item;
      const cleanAlertId = getCleanAlertCode(alert, alert.id);

      // ถ้าไม่มีกลุ่มเครื่องมือแพทย์ใดตรงกับยี่ห้อนี้เลย และไม่มี inheritedMatches ให้ข้ามทันที
      if ((!potentialGroups || potentialGroups.length === 0) && (!inheritedMatches || inheritedMatches.length === 0)) {
        processedCount++;
        if (onProgress) onProgress(processedCount, totalAlerts);
        return { alert, alertTitle, status: 'no_candidates', attempts: 0, candidateCount: 0, matchedGroups: 0, error: '', rawHead: '', matches: [] };
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
      let status = 'empty';
      let attempts = 0;
      let errorMsg = '';
      let rawHead = '';
      const matchedIdx = new Set();
      try {
        // ถ้าชื่อรุ่นของเครื่องใดปรากฏครบในหัวข้อข่าว แล้ว AI ตอบ [] ถือว่า "น่าสงสัย" → ถามซ้ำเพื่อยืนยัน
        const cleanTitleForCheck = ` ${standardizeDeviceName(alertTitle)} `;
        const isSuspiciousEmpty = potentialGroups.some(g => {
          const m = standardizeDeviceName(g.originalModel);
          return m.length >= 3 && cleanTitleForCheck.includes(` ${m} `);
        });

        const ai = await matchWithRetry(prompt, apiKey, isSuspiciousEmpty);
        attempts = ai.attempts;
        rawHead = ai.rawHead;
        errorMsg = ai.error;
        const parsedMatches = ai.parsed;
        if (!parsedMatches) status = 'error';
        
        if (parsedMatches) {
          for (const match of parsedMatches) {
            if (String(match.confidence).toUpperCase() !== 'HIGH') continue;

            if (match.index >= 0 && match.index < potentialGroups.length) {
              const matchedGroup = potentialGroups[match.index];
              matchedIdx.add(match.index);
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

              for (const matchedDev of matchedGroup.devices) {
                const matchRecord = buildMatchedRecord(
                  alert, cleanAlertId, alertTitle, matchedDev,
                  'HIGH', matchReason, thaiSummary, symptomAnalysis, actionPlan, structuredAiObj
                );
                alertMatches.push(matchRecord);
              }
            }
          }
        }

        // ✨ 1. Deterministic Safeguard: บันทึกกลุ่ม STRONG MATCH (ถ้า AI ยังไม่ได้บรรจุเข้า หรือ AI ตอบ [])
        for (const sg of (strongGroups || [])) {
          // ตรวจสอบว่า Brand เป็น Direct Brand Match จริงๆ ไม่ใช่การจับคู่ข้ามแบรนด์
          const groupTokens = extractBrandTokens(sg.originalBrand);
          const alertBrandTokens = extractBrandTokens(alertBrand);
          const isDirectBrand = groupTokens.length > 0 && alertBrandTokens.length > 0 && groupTokens.some(gt =>
            alertBrandTokens.some(at => gt === at || (gt.length >= 4 && (at.includes(gt) || gt.includes(at))))
          );
          // ถ้าไม่ใช่ Direct Brand Match ห้าม Safeguard สวนการตัดสินใจของ AI เด็ดขาด
          if (!isDirectBrand) continue;

          for (const dev of sg.devices) {
            const devCode = dev.Device_Code || dev.Device_ID || '';
            const already = alertMatches.some(m => (m.Device_Code || m.Device_ID) === devCode);
            if (!already) {
              const reason = `ยี่ห้อและรุ่นตรงกับประกาศเตือนภัยอย่างชัดเจน (ตรวจสอบพบแบบแม่นยำสูง Deterministic Model Match)`;
              const fallbackPlan = [
                '1. ตรวจสอบ Serial Number ของเครื่องในโรงพยาบาลกับช่วงที่ระบุในประกาศเตือนภัย',
                '2. ตรวจสอบอาการผิดปกติเบื้องต้นตามข้อควรระวังในประกาศเตือนภัย',
                '3. ประสานงานตัวแทนจำหน่าย (Vendor) เพื่อขอรับการตรวจสอบหรือชุดแก้ไข'
              ];
              const safeSummary = `ประกาศแจ้งเตือนความปลอดภัยทางการแพทย์ รหัส ${cleanAlertId} สำหรับเครื่องยี่ห้อ ${dev.Brand || sg.originalBrand} รุ่น ${dev.Model || sg.originalModel} ตรวจพบข้อมูลตรงตามประกาศเตือนภัย`;
              alertMatches.push(buildMatchedRecord(
                alert, cleanAlertId, alertTitle, dev,
                'HIGH', reason, safeSummary, 'มีความเสี่ยงตรงกับประกาศเตือนภัยทางการแพทย์ แนะนำให้ตรวจสอบเครื่องจริงตามขั้นตอน', fallbackPlan
              ));
            }
          }
        }

        // ✨ 2. Update Alert Inheritance: สืบทอดเครื่องที่เคยถูกยืนยันในประกาศฉบับก่อนหน้า
        if (inheritedMatches && inheritedMatches.length > 0) {
          const baseCode = extractBaseAlertCode(cleanAlertId);
          for (const im of inheritedMatches) {
            const dCode = im.Device_Code || im.Device_ID || '';
            const already = alertMatches.some(m => (m.Device_Code || m.Device_ID) === dCode);
            if (!already) {
              const reason = `ตรวจพบเป็นประกาศอัปเดตต่อเนื่องของรหัส ${baseCode} ซึ่งเคยพบเครื่องนี้มีความเสี่ยงมาก่อน`;
              const inheritPlan = [
                '1. ติดตามการอัปเดตอาการและคำแนะนำใหม่ตามประกาศฉบับนี้',
                '2. ตรวจสอบสถานะการแก้ไขเครื่องกับ Vendor ต่อเนื่องจากประกาศฉบับเดิม'
              ];
              const safeInheritSummary = `ประกาศอัปเดตความปลอดภัยต่อเนื่อง รหัส ${cleanAlertId} (ฉบับต่อเนื่องจาก ${baseCode}) สำหรับเครื่องยี่ห้อ ${im.Brand || im.Device_Brand || ''} รุ่น ${im.Model || im.Device_Model || ''}`;
              alertMatches.push(buildMatchedRecord(
                alert, cleanAlertId, alertTitle, im,
                'HIGH', reason, safeInheritSummary, 'มีความเสี่ยงต่อเนื่องจากประกาศฉบับก่อนหน้า แนะนำให้ติดตามผลการแก้ไข', inheritPlan
              ));
            }
          }
        }
      } catch (e) {
        status = 'error';
        errorMsg = String((e && e.message) || e);
        console.warn("AI evaluation error for alert:", alertTitle, e);
      } finally {
        processedCount++;
        if (onProgress) onProgress(processedCount, totalAlerts);
      }

      if (status !== 'error') status = alertMatches.length > 0 ? 'matched' : 'empty';

      return {
        alert,
        alertTitle,
        status,
        attempts,
        candidateCount: potentialGroups.length,
        matchedGroups: matchedIdx.size,
        error: errorMsg,
        rawHead,
        matches: alertMatches
      };
    };

    // 5. ประมวลผลแบบ Parallel Concurrency (พร้อมกัน 4 เส้น) เพื่อความรวดเร็วสูงสุด
    const CONCURRENCY_LIMIT = 4;
    let queueIdx = 0;

    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, alertQueue.length) }, async () => {
      while (queueIdx < alertQueue.length) {
        const item = alertQueue[queueIdx++];
        const outcome = await processSingleAlert(item);
        outcomes.push(outcome);
        if (outcome.matches && outcome.matches.length > 0) {
          results.push(...outcome.matches);
        }
      }
    });

    await Promise.all(workers);

    const failedCount = outcomes.filter(o => o.status === 'error').length;

    // ✨ โหมดทดสอบ: ไม่เขียน Firestore / ไม่ส่ง Telegram — คืนผลสรุปให้ตรวจดูเท่านั้น
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        message: `[DRY RUN] พบรายการตรงกัน ${results.length} รายการ (ล้มเหลว ${failedCount} ข่าว) — ไม่มีการบันทึกข้อมูล`,
        matchedCount: results.length,
        failedCount,
        outcomes: outcomes.map(o => ({
          alert: getCleanAlertCode(o.alert, o.alert.id),
          status: o.status,
          candidates: o.candidateCount,
          attempts: o.attempts,
          matchedGroups: o.matchedGroups,
          error: o.error || ''
        })),
        matches: results.map(r => ({ Alert_ID: r.Alert_ID, Hospital_Name: r.Hospital_Name, Device_Code: r.Device_Code, Model: r.Model }))
      };
    }

    // 6. บันทึกผลลัพธ์ลง Firestore (Batch Chunks ป้องกันเกิน Limit 500)
    const allOperations = [];
    
    // 6.1 บันทึกรายการที่แมตช์เจอ
    for (const res of results) {
      // สร้าง ID เฉพาะ: รหัสแจ้งเตือน_รหัสเครื่อง (กันบันทึกเบิ้ลเวลาลบกวนหรือกด AI หลายรอบ)
      const docIdRaw = `${res.Alert_ID}_${res.Device_Code}`;
      const docIdSafe = docIdRaw.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      allOperations.push({ 
        type: 'set', 
        ref: doc(db, 'matchedAlerts', docIdSafe), 
        data: res, 
        options: { merge: true } // merge: true จะไม่ทับฟิลด์ Status/trackingStatus ที่ user อัปเดตไปแล้ว 
      });
    }
    
    // 6.2 อัปเดตสถานะประกาศเตือนภัยเป็น MATCHED (เฉพาะเมื่อรันทุกสาขา)
    // ✨ เฉพาะข่าวที่ AI ประมวลผลสำเร็จเท่านั้น — ข่าวที่ error จะไม่ถูกมาร์ก เพื่อให้ถูกหยิบมารันซ้ำในรอบถัดไป
    if (!targetHospital || targetHospital === 'All') {
      for (const o of outcomes) {
        if (o.status === 'error') continue;
        const alert = o.alert;
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

    // 6.3 ✨ บันทึก log ต่อข่าว (aiMatchLogs) เพื่อตรวจสอบย้อนหลังว่า AI ตอบอะไร / error เพราะอะไร
    const runId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const logOperations = outcomes.map(o => {
      const logId = `${runId}_${String(o.alert.id || 'unknown')}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      return {
        type: 'set',
        ref: doc(db, 'aiMatchLogs', logId),
        data: {
          Run_ID: runId,
          Alert_Doc_ID: String(o.alert.id || ''),
          Alert_Code: String(getCleanAlertCode(o.alert, o.alert.id) || ''),
          Source: o.alert.source || '',
          Headline: String(o.alertTitle || '').substring(0, 300),
          Status: o.status,
          Candidate_Groups: o.candidateCount,
          Attempts: o.attempts,
          Matched_Groups: o.matchedGroups,
          Error: o.error ? String(o.error).substring(0, 300) : '',
          AI_Raw_Head: String(o.rawHead || '').substring(0, 1500),
          Target_Hospital: targetHospital || 'All',
          Created_At: new Date().toISOString()
        },
        options: {}
      };
    });

    // Commit in chunks of 400
    for (let i = 0; i < allOperations.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = allOperations.slice(i, i + 400);
      chunk.forEach(op => {
        if (op.type === 'set') batch.set(op.ref, op.data, op.options || {});
        if (op.type === 'update') batch.update(op.ref, op.data);
      });
      await batch.commit();
    }

    // ✨ บันทึก log แยกจากงานหลัก — ถ้าเขียน log ไม่สำเร็จ (เช่น Firestore Rules) งานหลักต้องไม่ล้ม
    try {
      for (let i = 0; i < logOperations.length; i += 400) {
        const logBatch = writeBatch(db);
        logOperations.slice(i, i + 400).forEach(op => logBatch.set(op.ref, op.data, op.options || {}));
        await logBatch.commit();
      }
    } catch (logErr) {
      console.warn('aiMatchLogs write failed (non-fatal):', logErr);
    }

    // 7. แจ้งเตือน Telegram และบันทึกประวัติการทำงาน
    try {
      const hospitalsList = await api.getHospitalsMap();
      const allHospitals = hospitalsList.map(h => String(h.name || '').trim()).filter(name => name);

      const matchedSnap = await getDocs(collection(db, 'matchedAlerts'));
      const pendingCounts = {};
      matchedSnap.docs.forEach(d => {
        const data = d.data();
        const status = data.Status || data['สถานะการตรวจสอบ'] || data['สถานะ'];
        if (status === 'รอยืนยัน' || !status) {
          const hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
          if (hName) {
            pendingCounts[hName] = (pendingCounts[hName] || 0) + 1;
          }
        }
      });

      const newCounts = {};
      for (const res of results) {
        const hName = String(res.Hospital_Name || res['โรงพยาบาล'] || '').trim();
        if (hName) {
          newCounts[hName] = (newCounts[hName] || 0) + 1;
        }
      }

      const now = new Date();
      const dateStr = formatThaiDate(now);
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
      message: `การประมวลผล AI เสร็จสมบูรณ์ ตรวจพบความเสี่ยงตรงกัน ${results.length} รายการ` + (failedCount > 0 ? ` (⚠️ ประมวลผลล้มเหลว ${failedCount} ข่าว — ยังไม่มาร์กว่าเสร็จ สามารถกดรันซ้ำได้)` : ''), 
      matchedCount: results.length,
      failedCount
    };

  } catch (error) {
    console.error("AI Matching Job Error:", error);
    return { success: false, message: error.toString() };
  }
}
