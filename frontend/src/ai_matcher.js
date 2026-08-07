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

/**
 * ฟังก์ชันเรียกใช้งาน DeepSeek API (แทนที่ Gemini)
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
    temperature: 0.1
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
 * รันกระบวนการ AI Matching ค้นหาเครื่องมือแพทย์ที่ตรงกับประกาศเตือนภัย
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
    
    // จัดกลุ่มเครื่องมือ (Device Grouping) เพื่อลดขนาดข้อมูล
    const uniqueDevicesMap = new Map();
    devicesSnap.docs.forEach(d => {
      const data = d.data();
      const stdBrand = standardizeDeviceName(data.Brand || data['ยี่ห้อ'] || '');
      const stdModel = standardizeDeviceName(data.Model || data['รุ่น'] || '');
      
      // ข้ามถ้ายี่ห้อและรุ่นว่างทั้งคู่
      if (!stdBrand && !stdModel) return;

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

    // 3. เริ่มวิเคราะห์ทีละ Alert (เพื่อป้องกัน Payload ใหญ่เกินไป)
    for (let i = 0; i < targetAlerts.length; i++) {
      const alert = targetAlerts[i];
      if (onProgress) onProgress(i + 1, targetAlerts.length);

      let alertBrand = '';
      let alertModel = '';
      let alertTitle = '';
      let alertDesc = '';

      if (alert.source === 'ECRI') {
        const headline = alert.Headline || alert.Title || alert['หัวเรื่อง'] || '';
        // ข่าว ECRI มักใช้รูปแบบ "Brand—Model" ใน Headline
        const parts = headline.split(/—|-/); 
        alertBrand = parts[0]?.trim() || '';
        alertModel = parts.slice(1).join('-').trim() || headline;
        alertTitle = headline;
        alertDesc = alert.Headline || alert.Description || '';
      } else {
        // ข่าว FDA
        alertBrand = alert.TRADE_NAME || alert.FIRM_NAME || alert.RECALLING_FIRM || '';
        alertModel = alert.PRODUCT_DESCRIPTION || alert.BRAND_NAME || alert.GENERIC_NAME || '';
        alertTitle = `FDA Recall: ${alertBrand}`;
        alertDesc = alert.PRODUCT_DESCRIPTION || alert.REASON_FOR_RECALL || '';
      }
      
      const stdAlertBrand = standardizeDeviceName(alertBrand);
      
      const potentialGroups = uniqueDevices.filter(g => {
        if (!stdAlertBrand || !g.stdBrand) return true; // ถ้าไม่มีแบรนด์ให้ลองส่งไปวิเคราะห์
        
        // ถ้ายี่ห้อตรงกันเป๊ะ
        if (stdAlertBrand === g.stdBrand) return true;

        // เช็คการตรงกันในระดับคำ (Word-level) ป้องกันปัญหาคำสั้นๆ ไปซ่อนอยู่ในคำยาว (เช่น GE ซ่อนใน SURGEON)
        const words1 = stdAlertBrand.split(' ').filter(w => w.length > 0);
        const words2 = g.stdBrand.split(' ').filter(w => w.length > 0);
        
        // ถ้ามีคำไหนที่ตรงกันเป๊ะๆ (เช่น MASIMO ตรงกับ MASIMO) ให้นับว่าน่าจะใช่
        const hasCommonWord = words1.some(w => words2.includes(w)) || words2.some(w => words1.includes(w));
        return hasCommonWord;
      });

      // ถ้าไม่มี Potential Groups เลย ข้าม
      if (potentialGroups.length === 0) continue;

      // 4. สร้าง Prompt
      const prompt = `
คุณคือผู้เชี่ยวชาญด้านเครื่องมือแพทย์ หน้าที่ของคุณคือเปรียบเทียบ "ประกาศเตือนภัย" กับ "ฐานข้อมูลเครื่องมือแพทย์ของโรงพยาบาล" ว่ามีรุ่นที่ตรงกันหรือไม่

ข้อมูลประกาศเตือนภัย (Alert):
ข้อมูลประกาศเตือนภัย (Alert):
หัวข้อ: ${alertTitle}
แบรนด์: ${alertBrand}
รุ่น/รายละเอียด: ${alertModel}
รายละเอียดปัญหา: ${alertDesc}

รายการเครื่องมือแพทย์ที่ต้องตรวจสอบ (กลุ่มรุ่นตัวแทน):
${potentialGroups.map((g, i) => `[${i}] แบรนด์: ${g.originalBrand} | รุ่น: ${g.originalModel}`).join('\n')}

คำสั่ง: จงหารายการที่ตรงกันอย่างแม่นยำ
- ต้องพิจารณาอย่างรอบคอบ ยี่ห้อต้องตรงกัน และ "ชื่อรุ่น/รหัสรุ่น" ต้องตรงกันหรือมีความเชื่อมโยงกันอย่างชัดเจน (เช่น เป็น Series เดียวกัน)
- หากยี่ห้อตรงกัน แต่ชื่อรุ่นไม่เกี่ยวข้องกันเลย ให้นับว่า "ไม่ตรงกัน"
- ให้ตอบกลับเป็นรูปแบบ JSON array เท่านั้น ห้ามมีคำอธิบายอื่นปนเด็ดขาด
ตัวอย่างโครงสร้างที่ต้องการ: 
[{"index": <เลขลำดับ>, "confidence": "HIGH|MEDIUM|LOW", "reason": "เหตุผลสั้นๆ"}]
ถ้าไม่เจอเลย ให้ตอบ []
`;

      // 6. ส่งให้ DeepSeek วิเคราะห์
      const aiResponseText = await callDeepseekApi(prompt, apiKey);
      
      // สกัด JSON จากคำตอบ AI ให้แม่นยำขึ้น
      const jsonStart = aiResponseText.indexOf('[');
      const jsonEnd = aiResponseText.lastIndexOf(']');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
        const jsonStr = aiResponseText.substring(jsonStart, jsonEnd + 1);
        try {
          const parsedMatches = JSON.parse(jsonStr);
          for (const match of parsedMatches) {
            if (match.index >= 0 && match.index < potentialGroups.length) {
              const matchedGroup = potentialGroups[match.index];
              
              // วนลูปสร้าง Record ให้ทุกเครื่องมือที่อยู่ในกลุ่มนี้
              for (const matchedDev of matchedGroup.devices) {
                const matchRecord = {
                  Alert_ID: alert.id || alert.Alert_ID || '',
                  Alert_Title: alert.Title || alert['หัวเรื่อง'] || '',
                  Hospital_Name: matchedDev.Hospital_Name || matchedDev['โรงพยาบาล'] || matchedDev.hospital || '',
                  Device_ID: matchedDev.Device_ID || matchedDev['รหัสเครื่อง'] || matchedDev.Asset_No || matchedDev.Equipment_Code || '',
                  Device_Brand: matchedDev.Brand || matchedDev['ยี่ห้อ'] || '',
                  Device_Model: matchedDev.Model || matchedDev['รุ่น'] || '',
                  Match_Confidence: match.confidence,
                  AI_Reason: match.reason,
                  Matched_At: new Date().toISOString(),
                  Status: 'รอยืนยัน'
                };
                results.push(matchRecord);
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse AI JSON response:", e, aiResponseText);
        }
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
    
    // รันคำสั่ง Batch ทั้งหมดรวดเดียว
    await batch.commit();

    // 7. แจ้งเตือน Telegram ด้วยรูปแบบที่สวยงามและสรุปรายโรงพยาบาล
    
    // 7.1 ดึงรายชื่อโรงพยาบาลทั้งหมด
    const hospitalsList = await api.getHospitalsMap();
    const allHospitals = hospitalsList.map(h => h.name).filter(name => name);

    // 7.2 ดึงยอดค้างตรวจสอบ (Pending) จาก Firestore
    const matchedSnap = await getDocs(collection(db, 'matchedAlerts'));
    const pendingCounts = {};
    matchedSnap.docs.forEach(d => {
      const data = d.data();
      if (data.Status === 'รอยืนยัน' || !data.Status) {
        const hName = data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '';
        pendingCounts[hName] = (pendingCounts[hName] || 0) + 1;
      }
    });

    // 7.3 นับยอดที่เพิ่งเจอใหม่ (New)
    const newCounts = {};
    for (const res of results) {
      const hName = res.Hospital_Name || res['โรงพยาบาล'] || '';
      newCounts[hName] = (newCounts[hName] || 0) + 1;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    let message = "🚨 <b>ข้อความเตือน เทเลแกรม</b>\n";
    message += `📅 ประจำวันที่ ${dateStr} เวลา ${timeStr} น.\n\n`;

    allHospitals.forEach((hName, index) => {
      const newCount = newCounts[hName] || 0;
      const pendingCount = pendingCounts[hName] || 0;
      
      message += `<b>${index + 1}. ${hName}</b>\n`;
      if (newCount > 0) {
        message += `⚠️ พบเครื่องเสี่ยง ${newCount} เรื่อง\n`;
      } else {
        message += `✅ ไม่พบเครื่องเสี่ยง\n`;
      }
      
      if (pendingCount > 0) {
        message += `⏳ ค้างตรวจสอบ ${pendingCount} เรื่อง\n\n`;
      } else {
        message += `\n`;
      }
    });

    message += `🔗 <a href="${window.location.origin}">เข้าระบบ ECRI/FDA Check (เมนูงานเฉพาะสาขา)</a>`;
    const telRes = await sendTelegramAlert(message, 'HTML');

    if (telRes.success) {
      return { success: true, message: 'จับคู่สำเร็จและส่งแจ้งเตือน Telegram แล้ว', matchedCount: results.length };
    } else {
      return { success: true, message: `จับคู่สำเร็จ (แต่ส่ง Telegram ไม่ได้: ${telRes.message})`, matchedCount: results.length };
    }

  } catch (error) {
    console.error("AI Matching Job Error:", error);
    return { success: false, message: error.toString() };
  }
}
