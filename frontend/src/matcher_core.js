/**
 * matcher_core.js
 * แกนหลักการจับคู่รุ่นและยี่ห้อแบบแน่นอน (Deterministic Model & Brand Matching Engine)
 * - เป็น Pure JavaScript Function ทั้งหมด ไม่มี External Dependency
 * - สามารถรัน Unit Test ผ่าน Node.js ได้โดยตรง
 */

// คำ Stop-words สำหรับ Brand (ชื่อบริษัททั่วไป ไม่นำมาเทียบข้ามแบรนด์)
export const BRAND_STOP_WORDS = new Set([
  'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED',
  'LLC', 'LP', 'MEDICAL', 'HEALTHCARE', 'SYSTEMS', 'TECHNOLOGIES', 'TECH', 'GROUP',
  'SOLUTIONS', 'HOLDINGS', 'INTERNATIONAL', 'INTL', 'USA', 'THAILAND', 'GMBH', 'SERVICES',
  'AG', 'SA', 'BV', 'THE', 'AND', 'OF', 'FOR', 'DEVICES', 'INSTRUMENTS', 'CARE', 'GLOBAL',
  'PRODUCTS', 'DIVISION', 'LABORATORIES', 'LABS', 'SET', 'UNIT', 'NEW', 'ALL'
]);

// คำ Stop-words สำหรับ Model (คำศัพท์ทั่วไปในเครื่องมือแพทย์ ไม่ใช่ชื่อรุ่นเฉพาะ)
export const MODEL_STOP_WORDS = new Set([
  'SYSTEM', 'SYSTEMS', 'SERIES', 'DEVICE', 'DEVICES', 'UNIT', 'UNITS',
  'KIT', 'KITS', 'SET', 'SETS', 'MODULE', 'MODULES', 'CONSOLE', 'CONSOLES',
  'EQUIPMENT', 'MACHINE', 'MACHINES', 'FAMILY', 'LINE', 'PLATFORM', 'PLATFORMS',
  'ULTRASOUND', 'SCANNER', 'MONITOR', 'MONITORS', 'PROBE', 'PROBES', 'TRANSDUCER',
  'REUSABLE', 'DISPOSABLE', 'SINGLE-USE', 'PORTABLE', 'DIGITAL', 'WIRELESS',
  'WITH', 'AND', 'FOR', 'THE', 'OF', 'IN', 'ON', 'OR', 'PLUS', 'PRO', 'ALL',
  'MODEL', 'MODELS', 'GEN', 'GENERATION', 'STATION', 'STATIONS', 'SENSOR', 'SENSORS'
]);

/**
 * ทำความสะอาดข้อความ ตัดอักขระพิเศษ แปลงเป็นพิมพ์ใหญ่
 */
export function standardizeName(name) {
  if (!name) return "";
  return name.toString().toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * สกัด Token ของแบรนด์
 */
export function extractBrandTokens(brandStr) {
  if (!brandStr) return [];
  const std = standardizeName(brandStr);
  return std.split(' ').filter(w => w.length >= 2 && !BRAND_STOP_WORDS.has(w));
}

/**
 * สกัด Token ของรุ่น (Model Tokens)
 * - เก็บตัวเลขหรือตัวอักษรโมเดลที่ยาวอย่างน้อย 1 ตัวอักษร เช่น '5', '7', 'X' (เช่น EPIQ 5, da Vinci X)
 */
export function extractModelTokens(modelStr) {
  if (!modelStr) return [];
  const std = standardizeName(modelStr);
  return std.split(' ').filter(w => {
    if (!w) return false;
    if (MODEL_STOP_WORDS.has(w)) return false;
    // อนุญาตตัวเลขเดี่ยว (เช่น 5, 7) หรือตัวอักษรผสม (เช่น X, 7C, CVX)
    if (w.length === 1 && !/[0-9A-Z]/.test(w)) return false;
    return true;
  });
}

/**
 * แยกองค์ประกอบของหัวข้อข่าว ECRI / FDA
 * - ECRI มักมีรูปแบบ: "Manufacturer—Subject/Device: Problem/Recall Reason"
 * - FDA มักมีรูปแบบ: "Firm - Product Description"
 */
export function parseAlertHeadline(headline, alertSource = 'ECRI') {
  if (!headline) return { brand: '', subject: '', problem: '' };

  const raw = headline.trim();
  let brand = '';
  let rest = '';

  // 1. แยก Brand ด้วย '—' (em-dash) หรือ ' - ' (dash มีช่องว่าง)
  const emDashIdx = raw.indexOf('—');
  const spaceDashIdx = raw.search(/\s+-\s+/);

  if (emDashIdx !== -1) {
    brand = raw.substring(0, emDashIdx).trim();
    rest = raw.substring(emDashIdx + 1).trim();
  } else if (spaceDashIdx !== -1) {
    brand = raw.substring(0, spaceDashIdx).trim();
    rest = raw.substring(spaceDashIdx + 3).trim();
  } else {
    // ไม่มี separator ชัดเจน
    const parts = raw.split(/[:]/);
    return {
      brand: '',
      subject: parts[0]?.trim() || raw,
      problem: parts.slice(1).join(':').trim()
    };
  }

  // 2. แยก Subject (รุ่น/ชนิดสินค้า) กับ Problem (อาการ/ปัญหา) ด้วย ':'
  let subject = rest;
  let problem = '';
  const colonIdx = rest.indexOf(':');
  if (colonIdx !== -1) {
    subject = rest.substring(0, colonIdx).trim();
    problem = rest.substring(colonIdx + 1).trim();
  }

  // ตัด [Update] หรือ [MHRA FSN ...] ออกจาก subject หากมี
  subject = subject.replace(/\[.*?\]/g, '').trim();

  return { brand, subject, problem };
}

/**
 * สกัดชื่ออุปกรณ์หรือรุ่นจาก FDA Product Description (กรณีไม่มี Brand/Generic Name สั้น)
 */
export function extractFdaProductSubject(desc) {
  if (!desc) return '';
  const match = desc.match(/Product Name:\s*([^\r\n,]+)/i);
  if (match) return match[1].trim();
  const firstLine = desc.split(/[\r\n]+/)[0].trim();
  return firstLine.substring(0, 150);
}

/**
 * ตรวจสอบความสอดคล้องของ Brand (Pre-filter ขั้นที่ 1)
 */
export function isBrandPlausibleCore(alertBrand, alertTitle, groupBrand, productBrandNames = []) {
  const groupTokens = extractBrandTokens(groupBrand);
  if (groupTokens.length === 0) return false;

  const alertBrandTokens = extractBrandTokens(alertBrand);

  // 1. Direct match ใน Brand/Manufacturer
  if (alertBrandTokens.length > 0) {
    const directMatch = groupTokens.some(gt => 
      alertBrandTokens.some(at => gt === at || (gt.length >= 4 && (at.includes(gt) || gt.includes(at))))
    );
    if (directMatch) return true;
  }

  // 2. Exact word match ใน alertTitle (ใช้เฉพาะ headline บรรทัดแรก เพื่อไม่ให้หลุดไปค้นหาในคำอธิบายยาว)
  const headlinePart = String(alertTitle || '').split(/[\r\n]/)[0].split(/\s+-\s+/)[0];
  const cleanTitle = ` ${standardizeName(headlinePart)} `;
  const titleMatch = groupTokens.some(gt => {
    if (gt.length < 3) return false;
    return cleanTitle.includes(` ${gt} `);
  });
  if (titleMatch) return true;

  // 3. ตรวจสอบ Product Brand Names (ชื่อสินค้าเฉพาะ เช่น "NOxBOX", "LIFEPAK")
  if (productBrandNames && productBrandNames.length > 0) {
    // กรองเฉพาะ token ที่ยาวพอ (>= 4 ตัวอักษร) และไม่ใช่ตัวเลขล้วน เพื่อป้องกันการจับคู่ข้ามแบรนด์
    const pTokens = productBrandNames
      .flatMap(pName => extractBrandTokens(pName))
      .filter(pt => pt.length >= 4 && !/^\d+$/.test(pt));

    if (pTokens.length > 0) {
      // 3.1 ตรงกับ alertBrandTokens
      const directProductMatch = pTokens.some(pt =>
        alertBrandTokens.some(at => at === pt || (at.length >= 4 && (at.includes(pt) || pt.includes(at))))
      );
      if (directProductMatch) return true;

      // 3.2 Exact word match ใน headline สั้น
      const headlineWords = ` ${standardizeName(headlinePart)} `;
      const headlineProductMatch = pTokens.some(pt => headlineWords.includes(` ${pt} `));
      if (headlineProductMatch) return true;
    }
  }

  return false;
}

/**
 * จำแนกระดับการจับคู่รุ่นเครื่องมือแพทย์ (Model Matching Classifier)
 * @param {string} alertSubject ชื่อรุ่นหรือหัวเรื่องในประกาศเตือนภัย (เช่น "EPIQ Elite Systems")
 * @param {string} alertProblem รายละเอียดปัญหาหรือประกาศเตือนภัย
 * @param {string} hospitalModel ชื่อรุ่นเครื่องมือแพทย์ในโรงพยาบาล (เช่น "EPIQ ELITE", "EPIQ CVX")
 * @returns {'STRONG' | 'FAMILY' | 'NONE'}
 */
export function classifyModelMatch(alertSubject, alertProblem, hospitalModel) {
  if (!hospitalModel || !alertSubject) return 'NONE';

  // ถ้า alertSubject เป็นข้อความยาวหลายบรรทัด ให้ใช้เฉพาะบรรทัดแรกที่เป็นชื่ออุปกรณ์/รุ่น
  const cleanSubject = String(alertSubject).split(/[\r\n]+/)[0].trim().substring(0, 150);

  const subTokens = extractModelTokens(cleanSubject);
  const modTokens = extractModelTokens(hospitalModel);

  if (modTokens.length === 0 || subTokens.length === 0) {
    // กรณีโมเดลเป็นตัวเลขสั้นๆ หรือไม่มี token เหลือ ให้ดู exact substring
    const stdSub = standardizeName(cleanSubject);
    const stdMod = standardizeName(hospitalModel);
    if (stdSub && stdMod && stdMod.length >= 3 && (stdSub.includes(stdMod) || stdMod.includes(stdSub))) {
      return 'STRONG';
    }
    return 'NONE';
  }

  // ตรวจหาโทเคนของเครื่องในโรงพยาบาลที่ปรากฏใน alert subject
  const matchedTokens = modTokens.filter(mt => 
    subTokens.some(st => {
      if (st === mt) return true;
      // อนุญาต prefix match เมื่อยาวพอ (>= 4) เช่น "EPIQ" กับ "EPIQCVX"
      if (st.length >= 4 && mt.length >= 4) {
        return (mt.startsWith(st) || st.startsWith(mt));
      }
      return false;
    })
  );

  // ไม่พบ token ที่ตรงกันเลย -> NONE
  if (matchedTokens.length === 0) {
    return 'NONE';
  }

  // ตรวจสอบกรณีโมเดลที่มีโทเคนตัวหนังสือ แต่ตัวที่ match ดันมีแต่ตัวเลขล้วน (เช่น เครื่องคือ "GEN 11" แต่ match เฉพาะเลข "11")
  const nonNumericMod = modTokens.filter(t => !/^\d+$/.test(t));
  const nonNumericMatched = matchedTokens.filter(t => !/^\d+$/.test(t));
  if (nonNumericMod.length > 0 && nonNumericMatched.length === 0) {
    return 'NONE';
  }

  // 1. STRONG MATCH:
  // - ทุก token สำคัญของเครื่องใน รพ. ปรากฏครบในหัวข้อประกาศ (เช่น รพ: "EPIQ ELITE", ข่าว: "EPIQ Elite Systems" -> ตรงทั้ง EPIQ และ ELITE)
  // - หรือทุก token ของหัวข้อข่าว ปรากฏครบในรุ่นของ รพ. (เช่น ข่าว: "SOLTIVE", รพ: "SOLTIVE SuperPulsed")
  const allHospitalTokensMatch = (matchedTokens.length === modTokens.length);
  const allSubjectTokensMatch = (matchedTokens.length >= subTokens.length);

  if (allHospitalTokensMatch || allSubjectTokensMatch) {
    return 'STRONG';
  }

  // 2. FAMILY MATCH:
  // มีบาง token ตรงกัน (เช่น "EPIQ" ตรงกัน) แต่ token เฉพาะเจาะจงต่างกัน (เช่น รพ. เป็น "CVX" แต่ประกาศระบุ "ELITE")
  // จัดเป็นกลุ่มตระกูลเดียวกัน เพื่อส่งต่อให้ AI หรือส่งให้ผู้ใช้รีวิว
  return 'FAMILY';
}

/**
 * สกัดความสัมพันธ์ของข่าวย่อย/ข่าวอัปเดต (Update Alert Inheritance)
 * เช่น "A46797 01" เป็นข่าวต่อเนื่องของ "A46797"
 */
export function extractBaseAlertCode(alertCode) {
  if (!alertCode) return null;
  const trimmed = String(alertCode).trim();
  // รูปแบบ ECRI Update: "A46797 01" หรือ "A46797-01" หรือ "A46797_01" (A ตามด้วยตัวเลข 4-6 หลัก แล้วตามด้วยเลขฉบับย่อย 2 หลัก)
  const match = trimmed.match(/^([A-Z]\d{4,6})[\s\-_]+(\d{2})$/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}
