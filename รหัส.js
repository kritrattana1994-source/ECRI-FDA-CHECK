// คอนฟิกค่าเริ่มต้น
const MAIN_FOLDER_ID = "1nJVYeThG__6Ol51cJndD5DINmQgVgi2s"; // Folder ID ส่วนกลางสำหรับทดสอบ
const SPREADSHEET_ID = "10IhVr8u9QndBqL9AU4bO3XmWef_6extMnJa9VqCAvgY"; // Spreadsheet ID ของระบบ

// 1. ฟังก์ชันแสดงหน้าเว็บหลัก (SPA) และ API Router สำหรับ Web App
function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return handleApiRouter(e);
  }
  return HtmlService.createTemplateFromFile('AppPage')
      .evaluate()
      .setTitle('ระบบบริหารจัดการความปลอดภัยเครื่องมือแพทย์')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  return handleApiRouter(e);
}

// ฟังก์ชันศูนย์กลางจัดการ API Request จากภายนอก (React / Vercel / fetch)
function handleApiRouter(e) {
  try {
    let action = '';
    let params = {};
    
    if (e && e.parameter) {
      params = Object.assign({}, e.parameter);
      if (params.action) {
        action = params.action;
      }
    }
    
    if (e && e.postData && e.postData.contents) {
      try {
        const bodyJson = JSON.parse(e.postData.contents);
        params = Object.assign({}, params, bodyJson);
        if (bodyJson.action) {
          action = bodyJson.action;
        }
      } catch (err) {
        // Not a standard JSON body
      }
    }
    
    // Cache lookup for fast read operations
    const cacheableActions = ['getDashboardStats', 'getHospitalsMap', 'getAvailableDatabaseMonths', 'getRecentSystemActivities', 'getProcessedDates'];
    const isCacheable = cacheableActions.indexOf(action) !== -1 && !params.forceRefresh;
    let cacheKey = '';
    
    if (isCacheable) {
      cacheKey = 'api_' + action + '_' + (params.mode || '') + '_' + (params.selectedYear || '') + '_' + (params.hospitalName || '');
      cacheKey = cacheKey.substring(0, 240);
      try {
        const cachedJson = CacheService.getScriptCache().get(cacheKey);
        if (cachedJson) {
          return ContentService.createTextOutput(cachedJson).setMimeType(ContentService.MimeType.JSON);
        }
      } catch (cErr) {}
    }

    let responseData = null;
    
    switch (action) {
      case 'getDashboardStats':
        responseData = getDashboardStats(params.mode, params.selectedYear ? parseInt(params.selectedYear, 10) : undefined, params.hospitalName);
        break;
      case 'getHospitalsMap':
        responseData = getHospitalsMap();
        break;
      case 'addHospitalToList':
        responseData = addHospitalToList(params.name, params.email);
        break;
      case 'saveAlertsToDatabase':
        responseData = saveAlertsToDatabase(params.fileData, params.type);
        break;
      case 'saveDevicesToDatabase':
        responseData = saveDevicesToDatabase(params.fileData, params.hospitalName);
        break;
      case 'getBranchMonthlyStats':
        responseData = getBranchMonthlyStats(params.hospitalName, params.filterMonth);
        break;
      case 'getMatchedAlertsForHospital':
        responseData = getMatchedAlertsForHospital(params.hospitalName);
        break;
      case 'certifyMatchedAlert':
        responseData = certifyMatchedAlert(params.hospitalName, params.deviceCode, params.alertId, params.certName, params.comment, params.certifyResult);
        break;
      case 'getAlertsFromDatabase':
        responseData = getAlertsFromDatabase(params.filterMonth);
        break;
      case 'getAvailableDatabaseMonths':
        responseData = getAvailableDatabaseMonths();
        break;
      case 'getExportAlertsExcel':
        responseData = getExportAlertsExcel(params.monthsList, params.sourcesList);
        break;
      case 'getAdminEmailSettings':
        responseData = getAdminEmailSettings();
        break;
      case 'saveAdminEmailSettings':
        responseData = saveAdminEmailSettings(params.email);
        break;
      case 'getGeminiApiKeySettings':
      case 'getOpenRouterApiKeySettings':
        responseData = typeof getOpenRouterApiKeySettings === 'function' ? getOpenRouterApiKeySettings() : getGeminiApiKeySettings();
        break;
      case 'saveGeminiApiKey':
      case 'saveOpenRouterApiKey':
        responseData = typeof saveOpenRouterApiKey === 'function' ? saveOpenRouterApiKey(params.key) : saveGeminiApiKey(params.key);
        break;
      case 'testAdminUploadConnection':
        responseData = testAdminUploadConnection();
        break;
      case 'getRecentSystemActivities':
        responseData = getRecentSystemActivities();
        break;
      case 'getProcessedDates':
        responseData = getProcessedDates();
        break;
      case 'runMatchingJobForDate':
        responseData = runMatchingJobForDate(params.dateStr);
        break;
      case 'runMatchingJobForAllUnprocessed':
        responseData = runMatchingJobForAllUnprocessed();
        break;
      case 'getTrackingCases':
        responseData = getTrackingCases(params.hospitalFilter);
        break;
      case 'addTrackingAction':
        responseData = addTrackingAction(params.hospitalName, params.deviceCode, params.alertId, params.newActionDetail, params.newActionDate, params.isFinal);
        break;
      case 'createProjectPresentation':
        responseData = createProjectPresentation();
        break;
      case 'getPersistentAIAnalysis':
        responseData = getPersistentAIAnalysis(params.brand, params.model, params.alertId);
        break;
      default:
        responseData = { success: false, error: 'Unknown API action: ' + action };
        break;
    }
    
    const outputString = JSON.stringify(responseData);
    
    // Save to CacheService if cacheable
    if (isCacheable && outputString && outputString.length < 95000) {
      try {
        CacheService.getScriptCache().put(cacheKey, outputString, 600); // 10 minutes cache
      } catch (cErr) {}
    }
    
    // Invalidate cache if mutating data
    const mutatingActions = ['saveAlertsToDatabase', 'saveDevicesToDatabase', 'addHospitalToList', 'certifyMatchedAlert', 'addTrackingAction', 'runMatchingJobForDate', 'runMatchingJobForAllUnprocessed'];
    if (mutatingActions.indexOf(action) !== -1) {
      try {
        CacheService.getScriptCache().removeAll([
          'api_getHospitalsMap____',
          'api_getDashboardStats_calendar_2026_all',
          'api_getDashboardStats_fiscal_2026_all',
          'api_getProcessedDates____'
        ]);
      } catch (cErr) {}
    }

    return ContentService.createTextOutput(outputString)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. ฟังก์ชันตรวจสอบและสร้างโครงสร้างตารางฐานข้อมูลสะสม (Persistent Sheets)
function initDatabaseSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 2.1 Hospitals
  let sheetHosp = ss.getSheetByName("Hospitals");
  if (!sheetHosp) {
    sheetHosp = ss.insertSheet("Hospitals");
  }
  if (sheetHosp.getLastRow() < 1 || sheetHosp.getLastColumn() < 1) {
    sheetHosp.appendRow(["รายชื่อโรงพยาบาล", "อีเมลติดต่อ", "อัปเดตล่าสุด"]);
    sheetHosp.getRange(1, 1, 1, 3).setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
  } else {
    if (sheetHosp.getLastColumn() < 3) {
      sheetHosp.getRange(1, 3).setValue("อัปเดตล่าสุด").setFontWeight("bold");
    }
  }
  
  // 2.2 ECRI_Database
  let sheetEcri = ss.getSheetByName("ECRI_Database");
  if (!sheetEcri) {
    sheetEcri = ss.insertSheet("ECRI_Database");
  }
  if (sheetEcri.getLastRow() < 1 || sheetEcri.getLastColumn() < 1) {
    sheetEcri.appendRow(["Accession Number", "Priority", "Headline", "Alert Publication Date", "FDA Class", "ALERT_RAW_JSON", "DATE_ADDED"]);
    sheetEcri.getRange(1, 1, 1, 7).setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
  }
  
  // 2.3 FDA_Database
  let sheetFda = ss.getSheetByName("FDA_Database");
  if (!sheetFda) {
    sheetFda = ss.insertSheet("FDA_Database");
  }
  if (sheetFda.getLastRow() < 1 || sheetFda.getLastColumn() < 1) {
    sheetFda.appendRow(["WEB_ADDRESS", "RECALL_NUMBER", "PRODUCT_DESCRIPTION", "TRADE_NAME", "RECALL_CLASS", "CENTER_CLASSIFICATION_DT", "POSTED_INTERNET_DT", "TERMINATION_DT", "FEI_NUMBER", "FIRM_NAME", "MANUFACTURER_RECALL_REASON", "ALERT_RAW_JSON", "DATE_ADDED"]);
    sheetFda.getRange(1, 1, 1, 13).setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
  }
  
  // 2.4 Devices_Database
  let sheetDev = ss.getSheetByName("Devices_Database");
  if (!sheetDev) {
    sheetDev = ss.insertSheet("Devices_Database");
  }
  if (sheetDev.getLastRow() < 1 || sheetDev.getLastColumn() < 1) {
    sheetDev.appendRow(["โรงพยาบาล", "รหัสเครื่องมือ", "เลขคุรุภัณฑ์", "ยี่ห้อ", "รุ่น", "ชื่อภาษาอังกฤษ", "ชื่อภาษาไทย", "สถานะการใช้งาน", "แผนก", "อัปเดตล่าสุด"]);
    sheetDev.getRange(1, 1, 1, 10).setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
  }
  
  // 2.5 Matched_Alerts_Database
  let sheetMatch = ss.getSheetByName("Matched_Alerts_Database");
  if (!sheetMatch) {
    sheetMatch = ss.insertSheet("Matched_Alerts_Database");
  }
  if (sheetMatch.getLastRow() < 1 || sheetMatch.getLastColumn() < 1) {
    // ปรับหัวข้อตัดคำว่า Gemini ทิ้งไปให้เป็นแค่ AI
    sheetMatch.appendRow([
      "โรงพยาบาล", "รหัสเครื่องมือ", "เลขคุรุภัณฑ์", "ยี่ห้อ", "รุ่น", "แผนก", 
      "แหล่งข้อมูล", "รหัสแจ้งเตือน", "หัวข้อแจ้งเตือน", "วันที่ประกาศ", "ระดับความชัดเจน", 
      "เหตุผลการจับคู่", "ผลวิเคราะห์ความเสี่ยงและแนวทางแก้ไขโดย AI", 
      "วันที่ตรวจพบ", "สถานะการตรวจสอบ", "ชื่อผู้รับรอง", "วันเวลารับรอง", "ข้อสังเกตเพิ่มเติม",
      "ประวัติการดำเนินการ", "สถานะการดำเนินการ"
    ]);
    sheetMatch.getRange(1, 1, 1, 20).setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
  } else {
    // เพิ่มคอลัมน์ใหม่ถ้ายังไม่มี
    if (sheetMatch.getLastColumn() < 20) {
      sheetMatch.getRange(1, 19).setValue("ประวัติการดำเนินการ").setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
      sheetMatch.getRange(1, 20).setValue("สถานะการดำเนินการ").setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
    }
  }
  
  // 2.6 Execution_Logs
  let sheetLogs = ss.getSheetByName("Execution_Logs");
  if (!sheetLogs) {
    sheetLogs = ss.insertSheet("Execution_Logs");
  }
  if (sheetLogs.getLastRow() < 1 || sheetLogs.getLastColumn() < 1) {
    sheetLogs.appendRow(["วันที่ดำเนินการ / หัวข้อ", "ประเภทงาน", "จำนวนเคสที่บันทึก", "วันเวลาที่รัน", "สถานะ"]);
    sheetLogs.getRange(1, 1, 1, 5).setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
  }
}

// 3. ฟังก์ชันสร้างโฟลเดอร์รายวัน
function getOrCreateDailyFolder() {
  const mainFolder = DriveApp.getFolderById(MAIN_FOLDER_ID);
  const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  const folders = mainFolder.getFoldersByName(todayStr);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return mainFolder.createFolder(todayStr);
  }
}

// 4. แปลงฟอร์แมตวันที่ให้เป็นมาตรฐาน yyyy-MM-dd (รองรับทั้ง DD/MM/YYYY และ MM/DD/YYYY ตามรูปแบบข้อมูลของคลังข่าวแต่ละค่าย)
function standardizeDateString(dateVal) {
  if (!dateVal) return "";
  if (dateVal instanceof Date) {
    return Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd");
  }
  
  const str = String(dateVal).trim();
  
  // 1. ตรวจสอบกรณีเป็น YYYY-MM-DD อยู่แล้ว
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}\b/.test(str)) {
    return str.substring(0, 10);
  }
  
  // 2. ตรวจสอบรูปแบบที่มีเครื่องหมายสแลชหรือแดช (เช่น DD/MM/YYYY หรือ YYYY/MM/DD)
  const slashParts = str.split(/[\/\-]/);
  if (slashParts.length === 3) {
    let part0 = parseInt(slashParts[0], 10);
    let part1 = parseInt(slashParts[1], 10);
    let part2 = parseInt(slashParts[2], 10);
    
    // หากหลักแรกยาว 4 ตัวอักษรแสดงว่าเป็นรูปแบบปีนำหน้า (เช่น YYYY/MM/DD)
    if (slashParts[0].length === 4) {
      let year = part0;
      let month = part1;
      let day = part2;
      return year + "-" + String(month).padStart(2, '0') + "-" + String(day).padStart(2, '0');
    } else {
      let day, month, year;
      year = part2;
      
      // จัดการปี ค.ศ. รูปแบบย่อ 2 หลัก
      if (year < 100) {
        year += (year > 50 ? 1900 : 2000);
      }
      // หากปี พ.ศ. (ปี > 2400) ให้ทำการทอนปีเป็น ค.ศ.
      if (year > 2400) {
        year -= 543;
      }
      
      // ตรวจหาตำแหน่งอัตโนมัติ: แหล่งข้อมูลของ FDA และ ECRI ล้วนส่งออกมาเป็นแบบของฝั่งสหรัฐอเมริกา (MM/DD/YYYY)
      // ยกเว้นกรณีตัวแรกสุดมีค่ามากกว่า 12 (เช่น 28/06/2026) จึงจะตีความว่าวันมาก่อน (DD/MM/YYYY)
      if (part0 > 12) {
        day = part0;
        month = part1;
      } else {
        day = part1;
        month = part0;
      }
      
      return year + "-" + String(month).padStart(2, '0') + "-" + String(day).padStart(2, '0');
    }
  }
  
  // Fallback สำหรับฟอร์แมตภาษาอังกฤษรูปแบบอื่น
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd");
    }
  } catch(e){}
  
  return str;
}

// 5. บันทึกและดึงข้อมูลรายชื่อโรงพยาบาล (พร้อมระบบตรวจสอบกู้คืนข้อมูลตกหล่นออโต้ - Auto-healing Registry)
function getHospitalsMap() {
  initDatabaseSheets();
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Hospitals");
    const lastRow = sheet.getLastRow();
    
    const registeredNames = new Set();
    const hospitalsList = [];
    
    if (lastRow > 1) {
      const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      values.forEach(row => {
        const name = row[0].toString().trim();
        if (name) {
          registeredNames.add(name);
          const uploadDate = row[2];
          let uploadDateStr = "ยังไม่มีการอัปโหลด";
          if (uploadDate instanceof Date) {
            uploadDateStr = Utilities.formatDate(uploadDate, "GMT+7", "yyyy-MM-dd HH:mm:ss");
          } else if (uploadDate) {
            uploadDateStr = String(uploadDate);
          }
          hospitalsList.push({
            name: name,
            email: row[1] ? row[1].toString().trim() : "",
            lastUploadTime: uploadDateStr
          });
        }
      });
    }
    
    // --- ระบบตรวจสอบความถูกต้องอัตโนมัติ (Auto-healing Registry) ---
    // ตรวจหาโรงพยาบาลที่มีประวัติการประมวลผลหรือคลังข้อมูลอยู่แล้ว แต่ชื่อยังไม่ได้ลงทะเบียนในแผ่นงาน Hospitals
    const missingHospitals = new Set();
    
    // 1. ตรวจสอบจาก Devices_Database
    const devSheet = ss.getSheetByName("Devices_Database");
    const devLastRow = devSheet.getLastRow();
    if (devLastRow > 1) {
      const devValues = devSheet.getRange(2, 1, devLastRow - 1, 1).getValues();
      devValues.forEach(row => {
        const name = String(row[0] || '').trim();
        if (name && !registeredNames.has(name)) {
          missingHospitals.add(name);
        }
      });
    }
    
    // 2. ตรวจสอบจาก Matched_Alerts_Database
    const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
    const matchLastRow = matchSheet.getLastRow();
    if (matchLastRow > 1) {
      const matchValues = matchSheet.getRange(2, 1, matchLastRow - 1, 1).getValues();
      matchValues.forEach(row => {
        const name = String(row[0] || '').trim();
        if (name && !registeredNames.has(name)) {
          missingHospitals.add(name);
        }
      });
    }
    
    // หากพบโรงพยาบาลตกหล่น ให้ทำการบันทึกสมัครสมาชิกให้โดยอัตโนมัติ
    if (missingHospitals.size > 0) {
      missingHospitals.forEach(hName => {
        sheet.appendRow([hName, "", ""]); // ลงทะเบียนชื่อ รพ., เว้นว่างอีเมลและวันซิงค์ล่าสุด
        hospitalsList.push({
          name: hName,
          email: "",
          lastUploadTime: "ยังไม่มีการอัปโหลด"
        });
        registeredNames.add(hName);
        Logger.log("ระบบกู้คืนอัตโนมัติ: ลงทะเบียนโรงพยาบาลที่ตกหล่นสำเร็จ: " + hName);
      });
    }
    
    return hospitalsList.filter(h => h.name !== "");
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการดึงข้อมูลโรงพยาบาล: " + error.toString());
    return [];
  }
}

function addHospitalToList(name, email) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    initDatabaseSheets();
    if (!name || name.trim() === "") {
      return { success: false, message: "กรุณาระบุชื่อโรงพยาบาล" };
    }
    const cleanName = name.trim();
    const cleanEmail = email ? email.trim() : "";
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Hospitals");
    
    const lastRow = sheet.getLastRow();
    let existingNames = [];
    if (lastRow > 1) {
      const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      existingNames = values.map(row => row[0].toString().trim().toLowerCase());
    }
    
    if (existingNames.includes(cleanName.toLowerCase())) {
      return { success: false, message: "มีชื่อโรงพยาบาลนี้ในระบบอยู่แล้ว" };
    }
    
    sheet.appendRow([cleanName, cleanEmail, ""]);
    return { success: true, message: "เพิ่มรายชื่อโรงพยาบาลสำเร็จแล้ว!" };
  } catch (error) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// 6. บันทึกและคัดกรองข้อมูลเตือนภัยเข้าระบบสะสมส่วนกลาง (Upsert Alerts)
function saveAlertsToDatabase(fileData, type) {
  initDatabaseSheets();
  const dailyFolder = getOrCreateDailyFolder();
  
  const contentType = fileData.data.substring(fileData.data.indexOf(":") + 1, fileData.data.indexOf(";"));
  const base64Data = fileData.data.substring(fileData.data.indexOf(",") + 1);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, fileData.name);
  
  const tempFile = dailyFolder.createFile(blob);
  let tempSheetId = "";
  
  try {
    tempSheetId = convertExcelToSheets(tempFile.getId(), dailyFolder.getId());
    const tempSs = SpreadsheetApp.openById(tempSheetId);
    const parsedData = getSheetDataAsJson(tempSs.getSheets()[0]);
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let addedCount = 0;
    const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    
    if (type === 'admin_ecri') {
      const ecriDb = ss.getSheetByName("ECRI_Database");
      const lastRow = ecriDb.getLastRow();
      const existingIds = new Set();
      if (lastRow > 1) {
        ecriDb.getRange(2, 1, lastRow - 1, 1).getValues().forEach(row => {
          existingIds.add(String(row[0]).trim());
        });
      }
      
      const rowsToAppend = [];
      parsedData.forEach(alert => {
        const alertId = String(getObjValue(alert, ['Accession Number', 'Accession No.', 'Accession No', 'Alert ID', 'Alert Id', 'id']) || '').trim();
        if (alertId && !existingIds.has(alertId)) {
          const priority = String(getObjValue(alert, ['Priority', 'priority', 'level']) || '');
          const headline = String(getObjValue(alert, ['Headline', 'headline', 'title', 'subject']) || '');
          const alertDate = standardizeDateString(getObjValue(alert, ['Alert Publication Date', 'Publication Date', 'Date', 'date', 'Published']));
          const fdaClassVal = getObjValue(alert, ['FDA Class', 'Class', 'class']);
          const alertClass = String(fdaClassVal ? 'FDA Class ' + fdaClassVal : 'ECRI Alert');
          
          rowsToAppend.push([
            alertId,
            priority,
            headline,
            alertDate,
            alertClass,
            JSON.stringify(alert),
            todayStr
          ]);
          existingIds.add(alertId);
          addedCount++;
        }
      });
      
      if (rowsToAppend.length > 0) {
        ecriDb.getRange(ecriDb.getLastRow() + 1, 1, rowsToAppend.length, 7).setValues(rowsToAppend);
      }
      
    } else if (type === 'admin_fda') {
      const fdaDb = ss.getSheetByName("FDA_Database");
      const lastRow = fdaDb.getLastRow();
      const existingIds = new Set();
      if (lastRow > 1) {
        fdaDb.getRange(2, 2, lastRow - 1, 1).getValues().forEach(row => {
          existingIds.add(String(row[0]).trim());
        });
      }
      
      const rowsToAppend = [];
      parsedData.forEach(recall => {
        const recallNumber = String(getObjValue(recall, ['RECALL_NUMBER', 'Recall Number', 'Recall No', 'Recall No.', 'id']) || '').trim();
        if (recallNumber && !existingIds.has(recallNumber)) {
          const webAddress = String(getObjValue(recall, ['WEB_ADDRESS', 'Web Address', 'URL', 'url']) || '');
          const productDesc = String(getObjValue(recall, ['PRODUCT_DESCRIPTION', 'Product Description', 'Description', 'desc']) || '');
          const tradeName = String(getObjValue(recall, ['TRADE_NAME', 'Trade Name', 'Brand', 'brand']) || '');
          const recallClassVal = getObjValue(recall, ['RECALL_CLASS', 'Recall Class', 'Class', 'class']);
          const alertClass = String(recallClassVal ? 'FDA Class ' + recallClassVal : 'FDA Recall');
          const centerClassificationDt = standardizeDateString(getObjValue(recall, ['CENTER_CLASSIFICATION_DT', 'Center Classification Date', 'Classification Date']));
          const alertDate = standardizeDateString(getObjValue(recall, ['POSTED_INTERNET_DT', 'Posted Internet Date', 'Posted Date', 'Date', 'date']));
          const terminationDt = standardizeDateString(getObjValue(recall, ['TERMINATION_DT', 'Termination Date']));
          const feiNumber = String(getObjValue(recall, ['FEI_NUMBER', 'FEI Number', 'FEI']) || '');
          const firmName = String(getObjValue(recall, ['FIRM_NAME', 'Firm Name', 'Company', 'company']) || '');
          const reason = String(getObjValue(recall, ['MANUFACTURER_RECALL_REASON', 'Manufacturer Recall Reason', 'Recall Reason', 'Reason']) || '');
          
          rowsToAppend.push([
            webAddress,
            recallNumber,
            productDesc,
            tradeName,
            alertClass,
            centerClassificationDt,
            alertDate,
            terminationDt,
            feiNumber,
            firmName,
            reason,
            JSON.stringify(recall),
            todayStr
          ]);
          existingIds.add(recallNumber);
          addedCount++;
        }
      });
      
      if (rowsToAppend.length > 0) {
        fdaDb.getRange(fdaDb.getLastRow() + 1, 1, rowsToAppend.length, 13).setValues(rowsToAppend);
      }
    }
    
    // ลบไฟล์ Temp
    try { DriveApp.getFileById(tempSheetId).setTrashed(true); } catch(e){}
    try { tempFile.setTrashed(true); } catch(e){}
    
    logSystemActivity("นำเข้าประกาศคลังข่าว " + (type === 'admin_ecri' ? "ECRI" : "FDA") + " ผ่านไฟล์ Excel: " + fileData.name, "Excel Ingest", addedCount, "Success");
    return { 
      success: true, 
      count: addedCount, 
      message: "อัปโหลดและประมวลผลข้อมูลใหม่เข้าระบบสำเร็จ: เพิ่มใหม่ " + addedCount + " รายการ (ข้ามรายการที่ซ้ำ)" 
    };
    
  } catch (error) {
    if (tempSheetId) { try { DriveApp.getFileById(tempSheetId).setTrashed(true); } catch(e){} }
    try { tempFile.setTrashed(true); } catch(e){}
    logSystemActivity("นำเข้าประกาศคลังข่าวล้มเหลว: " + fileData.name + " (" + error.toString() + ")", "Excel Ingest", 0, "Failed");
    return { success: false, message: "เกิดข้อผิดพลาดในการนำเข้าประกาศเตือน: " + error.toString() };
  }
}

// 7. บันทึกและวิเคราะห์ข้อมูลครุภัณฑ์ของโรงพยาบาลแยกรายสาขา (Upsert Devices - Fast Batch)
function saveDevicesToDatabase(fileData, hospitalName) {
  initDatabaseSheets();
  const dailyFolder = getOrCreateDailyFolder();
  
  const contentType = fileData.data.substring(fileData.data.indexOf(":") + 1, fileData.data.indexOf(";"));
  const base64Data = fileData.data.substring(fileData.data.indexOf(",") + 1);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, fileData.name);
  
  const tempFile = dailyFolder.createFile(blob);
  let tempSheetId = "";
  
  try {
    tempSheetId = convertExcelToSheets(tempFile.getId(), dailyFolder.getId());
    const tempSs = SpreadsheetApp.openById(tempSheetId);
    const parsedData = getSheetDataAsJson(tempSs.getSheets()[0]);
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const devSheet = ss.getSheetByName("Devices_Database");
    
    // 1. ดึงข้อมูลทั้งหมดในแผ่น Devices_Database เข้าสู่หน่วยความจำ
    const lastRow = devSheet.getLastRow();
    let allRows = [];
    if (lastRow > 1) {
      allRows = devSheet.getRange(2, 1, lastRow - 1, 10).getValues();
    }
    
    // 2. สร้างดัชนีสำหรับตรวจสอบเครื่องมือเดิมในระดับ (รพ. + รหัสเครื่องมือ) 
    const existingIndexMap = {};
    allRows.forEach((row, idx) => {
      const key = String(row[0]).trim() + "_" + String(row[1]).trim();
      existingIndexMap[key] = idx;
    });
    
    const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    let added = 0;
    let updated = 0;
    
    // 3. ประมวลผลคีย์เวิร์ด
    parsedData.forEach(device => {
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
      
      if (!deviceId) return;
      
      const rowData = [
        hospitalName.trim(), // เพิ่ม trim ป้องกันความผิดพลาด
        deviceId,
        assetId,
        brand,
        model,
        deviceType,
        deviceThaiName,
        status,
        dept,
        todayStr
      ];
      
      const key = hospitalName.trim() + "_" + deviceId;
      if (key in existingIndexMap) {
        const idx = existingIndexMap[key];
        allRows[idx] = rowData; 
        updated++;
      } else {
        allRows.push(rowData); 
        existingIndexMap[key] = allRows.length - 1;
        added++;
      }
    });
    
    // 4. เขียนข้อมูลกลับลงชีต Devices_Database ในรอบเดียวแบบปลอดภัย
    if (lastRow > 1) {
      devSheet.getRange(2, 1, lastRow - 1, 10).clearContent();
    }
    
    if (allRows.length > 0) {
      const maxRows = devSheet.getMaxRows();
      const neededRows = allRows.length + 1; 
      if (maxRows < neededRows) {
        devSheet.insertRowsAfter(maxRows, neededRows - maxRows);
      }
      devSheet.getRange(2, 1, allRows.length, 10).setValues(allRows);
    }
    
    // บันทึกวันอัปเดตล่าสุดลงชีต Hospitals
    const hospSheet = ss.getSheetByName("Hospitals");
    const hospLastRow = hospSheet.getLastRow();
    if (hospLastRow > 1) {
      const hospValues = hospSheet.getRange(2, 1, hospLastRow - 1, 1).getValues();
      for (let i = 0; i < hospValues.length; i++) {
        if (hospValues[i][0].toString().trim() === hospitalName.trim()) {
          hospSheet.getRange(i + 2, 3).setValue(new Date());
          break;
        }
      }
    }
    
    try { DriveApp.getFileById(tempSheetId).setTrashed(true); } catch(e){}
    try { tempFile.setTrashed(true); } catch(e){}
    
    logSystemActivity("นำเข้าทะเบียนเครื่องมือแพทย์ของสาขา " + hospitalName + " ผ่านไฟล์ Excel: " + fileData.name, "Excel Ingest", added, "Success");
    return {
      success: true,
      message: "อัปโหลดครุภัณฑ์สำเร็จ: เพิ่มเครื่องใหม่ " + added + " รายการ, อัปเดตเครื่องเดิม " + updated + " รายการ"
    };
    
  } catch (error) {
    if (tempSheetId) { try { DriveApp.getFileById(tempSheetId).setTrashed(true); } catch(e){} }
    try { tempFile.setTrashed(true); } catch(e){}
    logSystemActivity("นำเข้าทะเบียนเครื่องมือแพทย์ " + hospitalName + " ล้มเหลว: " + fileData.name + " (" + error.toString() + ")", "Excel Ingest", 0, "Failed");
    return { success: false, message: "เกิดข้อผิดพลาดในการนำเข้า: " + error.toString() };
  }
}

// 8. ดึงสถิติมุมมองปีปฏิทิน/ปีงบประมาณ ย้อนหลัง 12 เดือนสำหรับ Dashboard (กรองแยกรายโรงพยาบาลได้)
function getDashboardStats(mode, selectedYear, hospitalName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const year = selectedYear || new Date().getFullYear();
  const months = [];
  const thMonthsShort = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const counts = {};
  const totalCounts = {};
  
  // 1. ดึงรายชื่อสาขาทั้งหมด
  const hospSheetObj = ss.getSheetByName("Hospitals");
  const hospLastRowObj = hospSheetObj.getLastRow();
  const allHospitals = [];
  const lastUpdateByHosp = {};
  const devicesCountByHosp = {};
  
  if (hospLastRowObj > 1) {
    const hospVals = hospSheetObj.getRange(2, 1, hospLastRowObj - 1, 3).getValues();
    hospVals.forEach(row => {
      const hName = String(row[0]).trim();
      let lastDate = row[2];
      let dateStr = "ไม่มีข้อมูล";
      if (lastDate instanceof Date) {
        dateStr = Utilities.formatDate(lastDate, "GMT+7", "yyyy-MM-dd");
      } else if (lastDate) {
        dateStr = String(lastDate);
      }
      lastUpdateByHosp[hName] = dateStr;
      devicesCountByHosp[hName] = 0; // ตั้งต้น 0 เครื่อง
      allHospitals.push(hName);
    });
  }
  
  if (mode === 'fiscal') {
    // ต.ค. (ปีก่อน) - ก.ย. (ปีปัจจุบัน)
    const prevYear = year - 1;
    for (let m = 9; m <= 11; m++) {
      const key = prevYear + "-" + String(m + 1).padStart(2, '0');
      months.push({ label: thMonthsShort[m] + " " + String(prevYear + 543).substring(2), key: key });
      counts[key] = {};
      allHospitals.forEach(h => { counts[key][h] = 0; });
      totalCounts[key] = { matched: 0, certified: 0 };
    }
    for (let m = 0; m <= 8; m++) {
      const key = year + "-" + String(m + 1).padStart(2, '0');
      months.push({ label: thMonthsShort[m] + " " + String(year + 543).substring(2), key: key });
      counts[key] = {};
      allHospitals.forEach(h => { counts[key][h] = 0; });
      totalCounts[key] = { matched: 0, certified: 0 };
    }
  } else {
    // ม.ค. - ธ.ค. (ปีปัจจุบัน)
    for (let m = 0; m <= 11; m++) {
      const key = year + "-" + String(m + 1).padStart(2, '0');
      months.push({ label: thMonthsShort[m] + " " + String(year + 543).substring(2), key: key });
      counts[key] = {};
      allHospitals.forEach(h => { counts[key][h] = 0; });
      totalCounts[key] = { matched: 0, certified: 0 };
    }
  }
  
  // 2. นับสถิติตารางคัดกรองความเสี่ยง Matched_Alerts_Database
  const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
  const lastRow = matchSheet.getLastRow();
  const certCountByHosp = {};
  const matchCountByHosp = {};
  
  allHospitals.forEach(h => {
    certCountByHosp[h] = 0;
    matchCountByHosp[h] = 0;
  });
  
  if (lastRow > 1) {
    const values = matchSheet.getRange(2, 1, lastRow - 1, 15).getValues();
    values.forEach(row => {
      let hospVal = String(row[0] || '').trim();
      let dateVal = row[9]; 
      let statusVal = String(row[14] || '').trim();
      
      // บันทึกสถิติรวมของโรงพยาบาลตลอดกาล (เพื่อใช้ในการ์ด 3)
      if (matchCountByHosp[hospVal] !== undefined) {
        matchCountByHosp[hospVal]++;
        if (statusVal === 'จริง' || statusVal === 'รับรองแล้ว') {
          certCountByHosp[hospVal]++;
        }
      }
      
      // ฟิลเตอร์หากเลือกเฉพาะโรงพยาบาลสาขาบนกราฟ
      if (hospitalName && hospitalName !== 'all' && hospVal.toLowerCase() !== hospitalName.trim().toLowerCase()) {
        return;
      }
      
      let dateStr = "";
      let stdDate = standardizeDateString(dateVal);
      if (stdDate && stdDate.length >= 7) {
        dateStr = stdDate.substring(0, 7);
      }
      
      if (counts[dateStr]) {
        if (counts[dateStr][hospVal] !== undefined) {
          counts[dateStr][hospVal]++;
        } else {
          counts[dateStr][hospVal] = 1;
        }
        
        totalCounts[dateStr].matched++;
        if (statusVal === 'จริง' || statusVal === 'รับรองแล้ว') {
          totalCounts[dateStr].certified++;
        }
      }
    });
  }
  
  // 3. ครุภัณฑ์สะสมของแต่ละโรงพยาบาล
  let totalDevices = 0;
  const devSheet = ss.getSheetByName("Devices_Database");
  const devLastRow = devSheet.getLastRow();
  if (devLastRow > 1) {
    const devValues = devSheet.getRange(2, 1, devLastRow - 1, 1).getValues();
    devValues.forEach(row => {
      const hName = String(row[0]).trim();
      if (devicesCountByHosp[hName] !== undefined) {
        devicesCountByHosp[hName]++;
      } else {
        devicesCountByHosp[hName] = 1;
      }
    });
    
    if (hospitalName && hospitalName !== 'all') {
      totalDevices = devicesCountByHosp[hospitalName] || 0;
    } else {
      totalDevices = devLastRow - 1;
    }
  }
  
  const devicesDetailList = Object.keys(devicesCountByHosp).map(h => {
    return {
      hospital: h,
      count: devicesCountByHosp[h],
      lastUpdate: lastUpdateByHosp[h] || "ไม่มีข้อมูล"
    };
  });
  
  // 4. สถิติคลังข่าวแจ้งเตือนสะสมแยกประเภท
  let ecriCount = 0;
  let minEcriDateStr = "ไม่มีข้อมูล";
  let maxEcriDateStr = "ไม่มีข้อมูล";
  const ecriSheetObj = ss.getSheetByName("ECRI_Database");
  const ecriLastRowObj = ecriSheetObj.getLastRow();
  if (ecriLastRowObj > 1) {
    ecriCount = ecriLastRowObj - 1;
    const ecriDates = ecriSheetObj.getRange(2, 4, ecriCount, 1).getValues();
    let maxTime = 0;
    let minTime = Infinity;
    let maxDateStr = "";
    let minDateStr = "";
    ecriDates.forEach(r => {
      let dateVal = r[0];
      let std = "";
      if (dateVal instanceof Date) {
        std = Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd");
      } else if (dateVal) {
        std = standardizeDateString(dateVal);
      }
      if (std) {
        const t = new Date(std).getTime();
        if (t > maxTime) {
          maxTime = t;
          maxDateStr = std;
        }
        if (t < minTime) {
          minTime = t;
          minDateStr = std;
        }
      }
    });
    if (minDateStr) minEcriDateStr = minDateStr;
    if (maxDateStr) maxEcriDateStr = maxDateStr;
  }
  
  let fdaCount = 0;
  let minFdaDateStr = "ไม่มีข้อมูล";
  let maxFdaDateStr = "ไม่มีข้อมูล";
  const fdaSheetObj = ss.getSheetByName("FDA_Database");
  const fdaLastRowObj = fdaSheetObj.getLastRow();
  if (fdaLastRowObj > 1) {
    fdaCount = fdaLastRowObj - 1;
    const fdaDates = fdaSheetObj.getRange(2, 7, fdaCount, 1).getValues();
    let maxTime = 0;
    let minTime = Infinity;
    let maxDateStr = "";
    let minDateStr = "";
    fdaDates.forEach(r => {
      let dateVal = r[0];
      let std = "";
      if (dateVal instanceof Date) {
        std = Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd");
      } else if (dateVal) {
        std = standardizeDateString(dateVal);
      }
      if (std) {
        const t = new Date(std).getTime();
        if (t > maxTime) {
          maxTime = t;
          maxDateStr = std;
        }
        if (t < minTime) {
          minTime = t;
          minDateStr = std;
        }
      }
    });
    if (minDateStr) minFdaDateStr = minDateStr;
    if (maxDateStr) maxFdaDateStr = maxDateStr;
  }
  
  function formatToDMY(stdDate) {
    if (!stdDate || stdDate === "ไม่มีข้อมูล") return "ไม่มีข้อมูล";
    const parts = stdDate.split('-');
    if (parts.length === 3) {
      return parts[2] + "-" + parts[1] + "-" + parts[0];
    }
    return stdDate;
  }
  
  const totalAlerts = ecriCount + fdaCount;
  
  // 5. บันทึกคำรับรองของโรงพยาบาลในการ์ด 3
  const certifiedDetailList = Object.keys(matchCountByHosp).map(h => {
    return {
      hospital: h,
      certified: certCountByHosp[h],
      matched: matchCountByHosp[h]
    };
  });
  
  // 6. บันทึกและสร้างความงามภาพกราฟ
  const datasets = [];
  const colors = [
    { bg: 'rgba(59, 130, 246, 0.65)', border: '#3b82f6' }, // Blue
    { bg: 'rgba(16, 185, 129, 0.65)', border: '#10b981' }, // Green
    { bg: 'rgba(249, 115, 22, 0.65)', border: '#f97316' }, // Orange
    { bg: 'rgba(139, 92, 246, 0.65)', border: '#8b5cf6' }, // Purple
    { bg: 'rgba(236, 72, 153, 0.65)', border: '#ec4899' }, // Pink
    { bg: 'rgba(234, 179, 8, 0.65)', border: '#eab308' }  // Yellow
  ];
  
  const finalLabels = months.map(m => m.label);
  
  if (hospitalName && hospitalName !== 'all') {
    // โหมดเลือกรายโรงพยาบาลเดี่ยว
    const matchedData = months.map(m => counts[m.key][hospitalName] || 0);
    
    datasets.push({
      label: 'เคสแจ้งเตือนที่พบ (Matched Cases)',
      data: matchedData,
      backgroundColor: 'rgba(239, 68, 68, 0.45)', // สีส้มแดงโปร่งแสง
      borderColor: '#ef4444',
      borderWidth: 2,
      borderRadius: 6,
      type: 'bar',
      stack: 'matched'
    });
    
  } else {
    // โหมดภาพรวมทุกโรงพยาบาล: แยกแท่งเป็นรายสาขา
    allHospitals.forEach((h, index) => {
      const matchedData = months.map(m => counts[m.key][h] || 0);
      
      const color = colors[index % colors.length];
      datasets.push({
        label: 'เคสที่พบ: ' + h,
        data: matchedData,
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 2,
        borderRadius: 6,
        type: 'bar',
        stack: 'matched' // ใช้ stack เดียวกันเพื่อจับกลุ่มซ้อนกันของฝั่ง Matched
      });
    });
  }
  
  // --- Daily Surveillance Dashboard ---
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = Utilities.formatDate(yesterday, "GMT+7", "yyyy-MM-dd");
  const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  
  // 1.1 ตรวจสอบการอัปโหลด ECRI ในวันนี้
  let uploadStatus = "🔴 ยังไม่ได้อัปโหลด"; 
  let ecriUploadedToday = false;
  if (ecriLastRowObj > 1) {
    const ecriAddedVals = ecriSheetObj.getRange(2, 7, ecriLastRowObj - 1, 1).getValues();
    for (let i = 0; i < ecriAddedVals.length; i++) {
      const addedDate = ecriAddedVals[i][0];
      let addedDateStr = "";
      if (addedDate instanceof Date) {
        addedDateStr = Utilities.formatDate(addedDate, "GMT+7", "yyyy-MM-dd");
      } else if (addedDate) {
        addedDateStr = standardizeDateString(addedDate);
      }
      if (addedDateStr === todayStr) {
        ecriUploadedToday = true;
        break;
      }
    }
  }
  if (ecriUploadedToday) {
    uploadStatus = "🟢 อัพโหลดข้อมูลใหม่แล้ววันนี้";
  }
  
  // 1.2 ตรวจสอบการอัปโหลด FDA ในวันนี้
  let fdaUploadStatus = "🔴 ยังไม่ได้อัปโหลด";
  let fdaUploadedToday = false;
  if (fdaLastRowObj > 1) {
    const fdaAddedVals = fdaSheetObj.getRange(2, 13, fdaLastRowObj - 1, 1).getValues();
    for (let i = 0; i < fdaAddedVals.length; i++) {
      const addedDate = fdaAddedVals[i][0];
      let addedDateStr = "";
      if (addedDate instanceof Date) {
        addedDateStr = Utilities.formatDate(addedDate, "GMT+7", "yyyy-MM-dd");
      } else if (addedDate) {
        addedDateStr = standardizeDateString(addedDate);
      }
      if (addedDateStr === todayStr) {
        fdaUploadedToday = true;
        break;
      }
    }
  }
  if (fdaUploadedToday) {
    fdaUploadStatus = "🟢 อัพโหลดข้อมูลใหม่แล้ววันนี้";
  }
  
  // 3. ตรวจสอบสถานะการประมวลผลจับคู่ความเสี่ยงในวันนี้ (จากประวัติการรันแมนนวลหรืออัตโนมัติของวันนี้)
  let matchRanToday = false;
  const logsSheetObj = ss.getSheetByName("Execution_Logs");
  const logsLastRow = logsSheetObj.getLastRow();
  if (logsLastRow > 1) {
    const logVals = logsSheetObj.getRange(2, 1, logsLastRow - 1, 5).getValues();
    for (let i = logVals.length - 1; i >= 0; i--) {
      const type = String(logVals[i][1]);
      const timeRun = logVals[i][3];
      if ((type === "Auto Match" || type === "Manual Match") && timeRun instanceof Date) {
        const timeRunStr = Utilities.formatDate(timeRun, "GMT+7", "yyyy-MM-dd");
        if (timeRunStr === todayStr) {
          matchRanToday = true;
          break;
        }
      }
    }
  }
  
  // 3.1 ผลจับคู่ความเสี่ยงวันนี้
  const matchesTodayByHosp = {};
  if (lastRow > 1) {
    const matchVals = matchSheet.getRange(2, 1, lastRow - 1, 14).getValues();
    matchVals.forEach(row => {
      const hosp = String(row[0] || '').trim();
      const detectDate = row[13];
      let detectDateStr = "";
      if (detectDate instanceof Date) {
        detectDateStr = Utilities.formatDate(detectDate, "GMT+7", "yyyy-MM-dd");
      } else if (detectDate) {
        detectDateStr = standardizeDateString(detectDate);
      }
      
      if (detectDateStr === todayStr) {
        matchesTodayByHosp[hosp] = (matchesTodayByHosp[hosp] || 0) + 1;
      }
    });
  }
  
  let screeningStatus = "⏳ ยังไม่ได้ประมวลผลความเสี่ยงของวันนี้";
  if (matchRanToday) {
    const hospKeys = Object.keys(matchesTodayByHosp);
    if (hospKeys.length > 0) {
      const listStr = hospKeys.map(h => h + ": " + matchesTodayByHosp[h] + " รายการ").join(", ");
      screeningStatus = "🟢 ประมวลผลวันนี้เรียบร้อย (พบความเสี่ยง: " + listStr + ")";
    } else {
      screeningStatus = "🟢 ประมวลผลวันนี้เรียบร้อย วันนี้ไม่มีความเสี่ยงใหม่ของสาขาใด";
    }
  }

  const screeningDetailList = [];
  allHospitals.forEach(hName => {
    const count = matchesTodayByHosp[hName] || 0;
    screeningDetailList.push({
      hospital: hName,
      count: count,
      runToday: matchRanToday
    });
  });
  
  return {
    monthsLabels: finalLabels,
    datasets: datasets,
    totalDevices: totalDevices,
    totalAlerts: totalAlerts,
    activeYear: year,
    dailySurveillance: {
      uploadStatus: uploadStatus,
      fdaUploadStatus: fdaUploadStatus,
      screeningStatus: screeningStatus,
      ecriMaxDate: formatToDMY(maxEcriDateStr),
      fdaMaxDate: formatToDMY(maxFdaDateStr),
      screeningDetailList: screeningDetailList
    },
    devicesDetailList: devicesDetailList,
    totalAlertsDetail: {
      ecriCount: ecriCount,
      minEcriDate: formatToDMY(minEcriDateStr),
      maxEcriDate: formatToDMY(maxEcriDateStr),
      fdaCount: fdaCount,
      minFdaDate: formatToDMY(minFdaDateStr),
      maxFdaDate: formatToDMY(maxFdaDateStr)
    },
    certifiedDetailList: certifiedDetailList
  };
}

// 9. ดึงข้อมูลเครื่องมือแพทย์ที่ติด Alert ของโรงพยาบาลแต่ละแห่ง
function getMatchedAlertsForHospital(hospitalName) {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // ดึงข้อมูลชื่อภาษาอังกฤษของเครื่องมือ (Tool Name) จาก Devices_Database มาเก็บใน Map
  const devSheet = ss.getSheetByName("Devices_Database");
  const devLastRow = devSheet.getLastRow();
  const devToolNameMap = {};
  if (devLastRow > 1) {
    const devVals = devSheet.getRange(2, 1, devLastRow - 1, 10).getValues();
    devVals.forEach(row => {
      const hosp = String(row[0] || '').trim();
      if (hosp.toLowerCase() === hospitalName.trim().toLowerCase()) {
        const code = String(row[1] || '').trim();
        const enName = String(row[5] || '').trim();
        const thName = String(row[6] || '').trim();
        devToolNameMap[code] = enName || thName || "";
      }
    });
  }
  
  const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
  const lastRow = matchSheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const values = matchSheet.getRange(2, 1, lastRow - 1, 18).getValues();
  return values.map(row => {
    let detectDateStr = "";
    if (row[13] instanceof Date) {
      detectDateStr = Utilities.formatDate(row[13], "GMT+7", "yyyy-MM-dd");
    } else if (row[13]) {
      detectDateStr = String(row[13]);
    }
    
    let certifyDateStr = "";
    if (row[16] instanceof Date) {
      certifyDateStr = Utilities.formatDate(row[16], "GMT+7", "yyyy-MM-dd HH:mm:ss");
    } else if (row[16]) {
      certifyDateStr = String(row[16]);
    }
    
    // แปลงวันที่ประกาศด้วยเพื่อความปลอดภัยในการส่งผ่าน API
    let alertDateStr = "";
    if (row[9] instanceof Date) {
      alertDateStr = Utilities.formatDate(row[9], "GMT+7", "yyyy-MM-dd");
    } else if (row[9]) {
      alertDateStr = String(row[9]);
    }
    
    const dCode = String(row[1] || '').trim();
    const toolName = devToolNameMap[dCode] || "";
    
    return {
      hospital: row[0],
      deviceCode: row[1],
      assetId: row[2],
      brand: row[3],
      model: row[4],
      dept: row[5],
      source: row[6],
      alertId: row[7],
      alertHeadline: row[8],
      alertDate: alertDateStr,
      confidence: row[10],
      matchReason: row[11],
      aiAnalysis: row[12],
      detectDate: detectDateStr,
      status: row[14] || "รอยืนยัน",
      certifiedBy: row[15] || "",
      certifyDate: certifyDateStr,
      comment: row[17] || "",
      toolName: toolName
    };
  }).filter(row => row.hospital.trim() === hospitalName.trim()); // เพิ่ม trim ที่นี่ด้วยเพื่อความชัวร์ที่สุด
}

// 10. ตรวจรับรองความถูกต้องปลอดภัยของเครื่องมือแพทย์ประจำสาขา
function certifyMatchedAlert(hospitalName, deviceCode, alertId, certName, comment, certifyResult) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    initDatabaseSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
    const lastRow = matchSheet.getLastRow();
    if (lastRow <= 1) {
      return { success: false, message: "ไม่พบข้อมูลที่ต้องการยืนยันรับรอง" };
    }
    
    const values = matchSheet.getRange(2, 1, lastRow - 1, 8).getValues();
    let foundRow = -1;
    for (let i = 0; i < values.length; i++) {
      const rowHosp = String(values[i][0]).trim();
      const rowDev = String(values[i][1]).trim();
      const rowAlert = String(values[i][7]).trim();
      
      if (rowHosp === hospitalName.trim() && rowDev === deviceCode.trim() && rowAlert === alertId.trim()) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return { success: false, message: "ไม่พบรายการติดแจ้งเตือนนี้" };
    }
    
    if (certifyResult === "ไม่จริง") {
      matchSheet.deleteRow(foundRow);
      // Log event
      logSystemActivity(hospitalName + " ลบและไม่รับรองเคสเสี่ยง: " + alertId + " ของเครื่อง " + deviceCode, "Verification Action", 0, "Success");
      return { success: true, message: "ปฏิเสธและลบรายการแจ้งเตือนนี้ออกจากระบบ (และกราฟหน้าแรก) สำเร็จเรียบร้อยแล้ว!" };
    } else {
      matchSheet.getRange(foundRow, 15).setValue("จริง");
      matchSheet.getRange(foundRow, 16).setValue(certName || "ผู้ใช้งานประจำสาขา");
      matchSheet.getRange(foundRow, 17).setValue(new Date());
      matchSheet.getRange(foundRow, 18).setValue(comment || "");
      // Log event
      logSystemActivity(hospitalName + " รับรองและยืนยันเคสเสี่ยงเป็นจริง: " + alertId + " ของเครื่อง " + deviceCode, "Verification Action", 1, "Success");
      return { success: true, message: "บันทึกคำรับรองความถูกต้องความปลอดภัยสำเร็จเรียบร้อย!" };
    }
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// 11. ดึงข้อเสนอแนะของ AI ที่มีจดจำไว้แล้วในฐานข้อมูลสะสม (Persistent Cache)
function getPersistentAIAnalysis(brand, model, alertId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
  const lastRow = matchSheet.getLastRow();
  if (lastRow <= 1) return null;
  
  const values = matchSheet.getRange(2, 4, lastRow - 1, 10).getValues(); 
  for (let i = 0; i < values.length; i++) {
    const rowBrand = String(values[i][0]).trim().toUpperCase();
    const rowModel = String(values[i][1]).trim().toUpperCase();
    const rowAlertId = String(values[i][4]).trim().toUpperCase(); 
    const rowAI = String(values[i][9]).trim(); 
    
    // กรองข้ามข้อความที่บอกว่าเกิด Error ทั้งของเก่า(Gemini)และใหม่(OpenRouter)
    if (rowBrand === brand.toUpperCase().trim() && 
        rowModel === model.toUpperCase().trim() && 
        rowAlertId === alertId.toUpperCase().trim() && 
        rowAI && 
        rowAI.indexOf("Gemini API Error") === -1 &&
        rowAI.indexOf("OpenRouter API Error") === -1 &&
        rowAI.indexOf("API Error") === -1) {
      return rowAI;
    }
  }
  return null;
}

// 12. ระบบเทียบอัตโนมัติประจำวันรันตอน 13:05 น. เทียบเฉพาะประกาศของ "เมื่อวาน" กับฐานข้อมูลสะสม
function runDailyMatchingJob() {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const openRouterApiKey = getOpenRouterApiKeySettings();
  const adminEmail = getAdminEmailSettings();
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = Utilities.formatDate(yesterday, "GMT+7", "yyyy-MM-dd");
  
  Logger.log("เริ่มต้นงานเทียบข้อมูลอัตโนมัติรายวัน วันตรวจพบ: " + Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd") + " (คัดกรองข่าวย้อนหลังของวันที่: " + yesterdayStr + ")");
  
  // FDA ใช้การอัปโหลดแมนนวล ไม่มี Auto fetch อีกต่อไป
  
  try {
    const yesterdayEcri = [];
    const ecriSheet = ss.getSheetByName("ECRI_Database");
    const ecriLastRow = ecriSheet.getLastRow();
    if (ecriLastRow > 1) {
      const ecriValues = ecriSheet.getRange(2, 1, ecriLastRow - 1, 7).getValues();
      ecriValues.forEach(row => {
        if (standardizeDateString(row[3]) === yesterdayStr) {
          yesterdayEcri.push(JSON.parse(row[5]));
        }
      });
    }
    
    const yesterdayFda = [];
    const fdaSheet = ss.getSheetByName("FDA_Database");
    const fdaLastRow = fdaSheet.getLastRow();
    if (fdaLastRow > 1) {
      const fdaValues = fdaSheet.getRange(2, 1, fdaLastRow - 1, 13).getValues();
      fdaValues.forEach(row => {
        if (standardizeDateString(row[6]) === yesterdayStr) {
          yesterdayFda.push(JSON.parse(row[11]));
        }
      });
    }
    
    Logger.log("จำนวนข่าวเตือนภัยของเมื่อวาน: ECRI = " + yesterdayEcri.length + " รายการ, FDA = " + yesterdayFda.length + " รายการ");
    
    if (yesterdayEcri.length === 0 && yesterdayFda.length === 0) {
      Logger.log("ไม่มีประกาศเตือนของเมื่อวานในระบบ งดรันจับคู่");
      logSystemActivity("จับคู่ความปลอดภัยอัตโนมัติ ของข่าววันที่ " + yesterdayStr, "Auto Match", 0, "Success");
      return;
    }
    
    const devSheet = ss.getSheetByName("Devices_Database");
    const devLastRow = devSheet.getLastRow();
    if (devLastRow <= 1) {
      Logger.log("ไม่พบรายการเครื่องมือแพทย์ในฐานข้อมูลสะสม งดรันจับคู่");
      logSystemActivity("จับคู่ความปลอดภัยอัตโนมัติ ของข่าววันที่ " + yesterdayStr, "Auto Match", 0, "Success");
      return;
    }
    
    const devValues = devSheet.getRange(2, 1, devLastRow - 1, 10).getValues();
    const allDevices = devValues.map(row => {
      return {
        'โรงพยาบาล': row[0],
        'ID CODE': row[1],
        'Asset ID': row[2],
        'ยี่ห้อ': row[3],
        'รุ่น': row[4],
        'ชนิดเครื่องมือ': row[5],
        'ชื่อครื่องมือไทย': row[6],
        'สถานะ': row[7],
        'หน่วยงาน': row[8]
      };
    });
    
    const allMatches = performMatchingLogic(allDevices, yesterdayEcri, yesterdayFda);
    
    const highMatches = allMatches.filter(m => m.confidence === 'High');
    Logger.log("ผลการจับคู่พบเสี่ยงระดับสูงทั้งหมด: " + highMatches.length + " เครื่อง");
    
    if (highMatches.length === 0) {
      Logger.log("ไม่พบเครื่องมือแพทย์ติด Alert ความชัดเจนสูงในวันเมื่อวาน");
      logSystemActivity("จับคู่ความปลอดภัยอัตโนมัติ ของข่าววันที่ " + yesterdayStr, "Auto Match", 0, "Success");
      return;
    }
    
    const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
    const existingMatchKeys = new Set();
    const matchLastRow = matchSheet.getLastRow();
    if (matchLastRow > 1) {
      matchSheet.getRange(2, 1, matchLastRow - 1, 8).getValues().forEach(row => {
        existingMatchKeys.add(String(row[0]).trim() + "_" + String(row[1]).trim() + "_" + String(row[7]).trim());
      });
    }
    
    const aiAnalysisCache = {};
    const todayFullStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    let newMatchesAdded = 0;
    
    const hospitalReports = {};
    const registeredHospitals = getHospitalsMap();
    const hospEmailMap = {};
    registeredHospitals.forEach(h => {
      hospEmailMap[h.name] = h.email;
    });
    
    for (let match of highMatches) {
      const key = match.hospital + "_" + match.deviceCode + "_" + match.alertId;
      if (existingMatchKeys.has(key)) continue; 
      
      let aiText = "";
      const cacheKey = match.brand + "_" + match.model + "_" + match.alertId;
      
      if (aiAnalysisCache[cacheKey]) {
        aiText = aiAnalysisCache[cacheKey];
      } else {
        const dbCachedAI = getPersistentAIAnalysis(match.brand, match.model, match.alertId);
        if (dbCachedAI) {
          aiText = dbCachedAI;
          aiAnalysisCache[cacheKey] = aiText;
        } else {
          // หน่วงเวลาเล็กน้อยเพื่อป้องกัน Rate Limit 
          Utilities.sleep(15000);
          aiText = callOpenRouterAIService(match, match, openRouterApiKey);
          aiAnalysisCache[cacheKey] = aiText;
        }
      }
      
      const newRow = [
        match.hospital,
        match.deviceCode,
        match.assetId,
        match.brand,
        match.model,
        match.dept,
        match.source,
        match.alertId,
        match.alertHeadline,
        match.alertDate,
        "ตรงกันสูง",
        match.matchReason,
        aiText,
        todayFullStr,
        "รอยืนยัน",
        "",
        "",
        ""
      ];
      
      matchSheet.appendRow(newRow);
      existingMatchKeys.add(key);
      newMatchesAdded++;
      
      if (!hospitalReports[match.hospital]) {
        hospitalReports[match.hospital] = [];
      }
      hospitalReports[match.hospital].push(match);
    }
    
    Logger.log("บันทึกความเสี่ยงใหม่เข้าระบบสำเร็จ: " + newMatchesAdded + " รายการ");
    
    Object.keys(hospitalReports).forEach(hName => {
      const recipient = hospEmailMap[hName] || adminEmail;
      if (recipient) {
        sendHospitalDailyReportEmail(hName, recipient, allDevices.filter(d => d['โรงพยาบาล'] === hName).length, hospitalReports[hName].length, ss.getUrl());
      }
    });
    
    logSystemActivity("จับคู่ความปลอดภัยอัตโนมัติ (รอบ 13:05 น.) ของข่าววันที่ " + yesterdayStr, "Auto Match", newMatchesAdded, "Success");
    
  } catch (err) {
    Logger.log("เกิดข้อผิดพลาดในสคริปต์ Matching อัตโนมัติ: " + err.toString());
    logSystemActivity("จับคู่ความปลอดภัยอัตโนมัติ (รอบ 13:05 น.) ของข่าววันที่ " + yesterdayStr + " ล้มเหลว: " + err.toString(), "Auto Match", 0, "Failed");
  }
}

// 12.5 ฟังก์ชันส่งอีเมลผลรายงานรายวันให้โรงพยาบาลแต่ละแห่ง
function sendHospitalDailyReportEmail(hospitalName, recipientEmail, checkedCount, matchedCount, reportUrl) {
  const subject = "🏥 [แจ้งเตือนด่วนประจำวัน] พบเครื่องมือแพทย์ของ " + hospitalName + " ตรงกับประกาศเรียกคืนเครื่องมือแพทย์";
  
  let htmlBody = "<div style='font-family: sans-serif; padding: 20px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;'>";
  htmlBody += "<h2 style='color: #1e1b4b;'>ผลการวิเคราะห์ความปลอดภัยครุภัณฑ์การแพทย์ของ " + hospitalName + "</h2>";
  htmlBody += "<p style='color: #64748b; font-style: italic;'>วันที่ประมวลผล: " + Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd") + "</p>";
  htmlBody += "<hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;'>";
  
  htmlBody += "<h3>📊 รายงานผลตรวจคัดกรอง</h3>";
  htmlBody += "<ul>";
  htmlBody += "<li>พบอุปกรณ์ตกอยู่ในสภาวะความเสี่ยงสูง (High Confidence): <strong style='color: #ef4444;'>" + matchedCount + " เครื่อง</strong></li>";
  htmlBody += "</ul>";
  
  htmlBody += "<div style='background-color: #fdf2f8; border-left: 4px solid #f43f5e; padding: 12px; margin: 15px 0; border-radius: 4px;'>";
  htmlBody += "<strong style='color: #be123c;'>⚠️ โปรดดำเนินการด่วน!</strong><br>";
  htmlBody += "กรุณาเปิดหน้าจอ **งานเฉพาะสาขา** ในระบบคลาวด์เพื่อตรวจรับรองรายการแจ้งเตือนความเสี่ยงภาษาไทย และประสานแผนกวิศวกรรมเพื่อแก้ไขภัยคุกคามทันที";
  htmlBody += "</div>";
  
  htmlBody += "<div style='margin-top: 25px; text-align: center;'>";
  htmlBody += "<a href='" + reportUrl + "' style='background-color: #1e1b4b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;'>📥 คลิกเปิดชีตควบคุมส่วนกลาง</a>";
  htmlBody += "</div>";
  htmlBody += "</div>";
  
  MailApp.sendEmail({
    to: recipientEmail,
    subject: subject,
    htmlBody: htmlBody
  });
  
  Logger.log("ส่งอีเมลแจ้งเตือนเฉพาะของ รพ. " + hospitalName + " ไปที่: " + recipientEmail);
}

// 13. ฟังก์ชันเรียกใช้ OpenRouter API บนสคริปต์คลาวด์เพื่อประเมินความปลอดภัย (แทนที่ Gemini เดิม)
function callOpenRouterAIService(device, alert, apiKey) {
  if (!apiKey) {
    return "ไม่สามารถวิเคราะห์ด้วย AI ได้ เนื่องจากไม่ได้ใส่ OpenRouter API Key";
  }
  
  try {
    const deviceDetail = 
      "- ชนิดเครื่องมือแพทย์ (ภาษาอังกฤษ): " + device.deviceNameEn + "\n" +
      "- ชื่อภาษาไทย: " + device.deviceNameTh + "\n" +
      "- ยี่ห้อ: " + device.brand + "\n" +
      "- รุ่น: " + device.model + "\n" +
      "- หน่วยงาน/แผนกที่ใช้งาน: " + device.dept + "\n" +
      "- รหัสเครื่อง/ครุภัณฑ์: " + device.deviceCode + "\n";

    const alertDetail = 
      "- แหล่งข้อมูลข่าวแจ้งเตือน: " + device.source + " (รหัสแจ้งเตือน: " + device.alertId + ")\n" +
      "- ความรุนแรง /FDA Class: " + device.alertClass + "\n" +
      "- วันที่แจ้งเตือน: " + device.alertDate + "\n" +
      "- หัวข้อข่าวแจ้งเตือน/สาเหตุ: " + device.alertHeadline + "\n";

    const prompt = "คุณคือผู้เชี่ยวชาญด้านวิศวกรรมชีวการแพทย์ (Biomedical Engineering) และความปลอดภัยของเครื่องมือแพทย์ในโรงพยาบาล\n\n" +
      "หน้าที่ของคุณคือการวิเคราะห์เพื่อเปรียบเทียบข้อมูลครุภัณฑ์การแพทย์ของโรงพยาบาลกับรายงานการแจ้งเตือนความปลอดภัย (ECRI Alert หรือ FDA Recall) และให้ข้อเสนอแนะในการจัดการความเสี่ยง\n\n" +
      "ข้อมูลเครื่องมือแพทย์ของโรงพยาบาลเรา:\n" + deviceDetail + "\n" +
      "ข้อมูลประกาศเตือนภัย/เรียกคืน:\n" + alertDetail + "\n\n" +
      "โปรดวิเคราะห์โดยเขียนข้อเสนอแนะเป็นข้อสั้นๆ ภาษาไทยที่เข้าใจง่าย กระชับ และเป็นประโยชน์ต่อผู้ปฏิบัติงานในโรงพยาบาล:\n" +
      "1. ปัญหาคืออะไรและอันตรายต่อผู้ป่วยอย่างไร\n" +
      "2. ข้อเสนอแนะเชิงวิศวกรรมชีวการแพทย์และการจัดการความเสี่ยง (เช่น หยุดใช้งานชั่วคราว, ตรวจสอบเลขล๊อตการผลิต, ติดต่อตัวแทนจำหน่ายเพื่ออัปเดตซอฟต์แวร์ ฯลฯ)";

    const url = "https://openrouter.ai/api/v1/chat/completions";
    const payload = {
      model: "openrouter/auto", // ให้ OpenRouter เลือกโมเดลที่เหมาะสมที่สุดให้อัตโนมัติ (Auto-Routing)
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://script.google.com",
        "X-Title": "Medical Device Alert System"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const resText = response.getContentText();
    const resJson = JSON.parse(resText);
    
    if (response.getResponseCode() !== 200) {
      return "OpenRouter API Error: " + (resJson.error?.message || "เชื่อมต่อล้มเหลว");
    }
    
    const aiText = resJson.choices?.[0]?.message?.content;
    return aiText || "ไม่มีข้อมูลวิเคราะห์ส่งกลับจาก AI";
  } catch (e) {
    return "เกิดข้อผิดพลาดขณะประมวลผลกับ AI: " + e.toString();
  }
}

// นามแฝงเพื่อให้ทำงานกับฟังก์ชันเก่าได้หากเรียกกันภายใน
function callGeminiAIService(device, alert, apiKey) {
  return callOpenRouterAIService(device, alert, apiKey);
}

// 14. ฟังก์ชันทดสอบการเชื่อมต่อสำหรับหน้าแอดมินทั่วไป
function testAdminUploadConnection() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const dailyFolder = getOrCreateDailyFolder();
    const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd_HH-mm-ss");
    const testFileName = "ADMIN_TEST_CONNECTION_" + todayStr + ".txt";
    const blob = Utilities.newBlob("ระบบเชื่อมต่อทำงานได้ปกติอย่างสมบูรณ์", "text/plain", testFileName);
    const file = dailyFolder.createFile(blob);
    return { 
      success: true, 
      message: "ทดสอบเชื่อมต่อสำเร็จ! เชื่อมต่อ Google Drive สำเร็จ",
      fileUrl: file.getUrl()
    };
  } catch (error) {
    return { success: false, message: "เกิดข้อผิดพลาดในการเชื่อมต่อ: " + error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// 15. บันทึก/เรียกดูค่าคอนฟิกส่วนกลาง
function saveAdminEmailSettings(email) {
  try {
    if (!email || email.trim() === "") {
      return { success: false, message: "กรุณาระบุอีเมลที่ถูกต้อง" };
    }
    PropertiesService.getScriptProperties().setProperty('ADMIN_EMAIL', email.trim());
    return { success: true, message: "บันทึกอีเมลผู้รับรายงานสำเร็จแล้ว!" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + e.toString() };
  }
}

function getAdminEmailSettings() {
  try {
    return PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || "";
  } catch (e) {
    return "";
  }
}

// ฟังก์ชันหลักที่บันทึกคีย์ของ OpenRouter
function saveOpenRouterApiKey(key) {
  try {
    if (!key || key.trim() === "") {
      return { success: false, message: "กรุณาระบุคีย์ที่ถูกต้อง" };
    }
    PropertiesService.getScriptProperties().setProperty('OPENROUTER_API_KEY', key.trim());
    return { success: true, message: "บันทึก OpenRouter API Key สำเร็จแล้ว!" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + e.toString() };
  }
}

// นามแฝงป้องกันหน้าเว็บเดิมพังเมื่อเรียก saveGeminiApiKey
function saveGeminiApiKey(key) {
  return saveOpenRouterApiKey(key);
}

// ฟังก์ชันหลักดึงคีย์ของ OpenRouter
function getOpenRouterApiKeySettings() {
  try {
    let key = PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
    if (!key) {
      // ดึงคีย์เดิมเผื่อผู้ใช้ยังไม่ได้เปลี่ยนใหม่
      key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || ""; 
    }
    return key;
  } catch (e) {
    return "";
  }
}

// นามแฝงป้องกันหน้าเว็บเดิมพังเมื่อเรียก getGeminiApiKeySettings
function getGeminiApiKeySettings() {
  return getOpenRouterApiKeySettings();
}




// 16. ตัวช่วยแปรสภาพไฟล์ Excel เป็น Google Sheets
function convertExcelToSheets(fileId, folderId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const resource = {
      title: "TEMP_SHEET_" + file.getName().replace(/\.xlsx$/i, ''),
      mimeType: MimeType.GOOGLE_SHEETS,
      parents: [{ id: folderId }]
    };
    const convertedFile = Drive.Files.insert(resource, file.getBlob());
    return convertedFile.id;
  } catch (e) {
    throw new Error("ล้มเหลวในการแปลงไฟล์ Excel เป็น Google Sheet: " + e.toString());
  }
}

// 17. ล้างข้อความและค้นหายี่ห้อ/คำสำคัญ
function normalizeText(text) {
  if (!text) return "";
  return String(text).trim().toUpperCase().replace(/[\s\-_]+/g, ' ').replace(/[^\w\sก-๙]/g, '');
}

const IGNORE_BRANDS = ["AND", "FDA", "THE", "FOR", "NEW", "ALL", "GEN", "COM", "PRO", "SET", "KIT", "MIN", "MAX", "MID", "LTD", "CO", "CORP", "INC", "SYSTEMS", "MEDICAL", "HEALTHCARE"];

function extractKeywords(text, minLength) {
  if (!text) return [];
  const min = minLength || 3;
  return text.toUpperCase().split(/[\s,.\-\/()]+/).map(w => w.trim()).filter(w => w.length >= min && !IGNORE_BRANDS.includes(w));
}

function checkBrandMatch(brand, targetText) {
  if (!brand || !targetText) return false;
  const normBrand = brand.toUpperCase().trim();
  const normTarget = targetText.toUpperCase();
  if (normBrand === '-' || IGNORE_BRANDS.includes(normBrand) || normBrand.length < 2) return false;
  if (normTarget.indexOf(normBrand) !== -1) return true;
  if (normBrand === 'GE HEALTHCARE' && (normTarget.indexOf('GE HEALTH') !== -1 || normTarget.indexOf('GE MEDICAL') !== -1 || normTarget.indexOf('GENERAL ELECTRIC') !== -1)) return true;
  if (normBrand === 'FRESENIUS KABI' && normTarget.indexOf('FRESENIUS') !== -1) return true;
  if (normBrand === 'B. BRAUN' || normBrand === 'B BRAUN' || normBrand === 'BBRAUN') {
    if (normTarget.indexOf('B. BRAUN') !== -1 || normTarget.indexOf('B BRAUN') !== -1 || normTarget.indexOf('BBRAUN') !== -1) return true;
  }
  return false;
}

// 18. ฟังก์ชันวิเคราะห์ตรรกะการเปรียบเทียบแบรนด์/รุ่น
function performMatchingLogic(devices, alerts, recalls) {
  const matches = [];
  devices.forEach(device => {
    const brand = String(device['ยี่ห้อ'] || '').trim();
    const model = String(device['รุ่น'] || '').trim();
    const deviceType = String(device['ชนิดเครื่องมือ'] || '').trim();
    const deviceThaiName = String(device['ชื่อครื่องมือไทย'] || '').trim();
    const deviceId = String(device['ID CODE'] || device['ID'] || '');
    const assetId = String(device['Asset ID'] || '');
    const dept = String(device['หน่วยงาน'] || '');
    const status = String(device['สถานะ'] || 'Active');
    const hospital = String(device['โรงพยาบาล'] || '');
    
    if (!brand || brand === '-' || brand.length < 2) return;
    const normModel = model.toUpperCase();
    
    // จับคู่ฝั่ง ECRI
    alerts.forEach(alert => {
      const headline = String(alert['Headline'] || '');
      const headlineUpper = headline.toUpperCase();
      const alertId = String(alert['Accession Number'] || '');
      if (checkBrandMatch(brand, headline)) {
        let isMatch = false;
        let matchReason = "";
        let confidence = "Low";
        if (model && model !== '-' && model !== 'VARIOUS' && model !== 'N/A' && model.length >= 2) {
          if (headlineUpper.indexOf(normModel) !== -1) {
            isMatch = true;
            matchReason = "พบชื่อรุ่น [" + model + "] ในหัวข้อประกาศ";
            confidence = "High";
          } else {
            const modelWords = extractKeywords(model, 3);
            const modelMatchedWord = modelWords.find(word => headlineUpper.indexOf(word) !== -1);
            if (modelMatchedWord) {
              isMatch = true;
              matchReason = "พบคำสำคัญของรุ่น [" + modelMatchedWord + "] ในหัวข้อประกาศ";
              confidence = "Medium";
            }
          }
        }
        if (!isMatch) {
          const deviceKeywords = extractKeywords(deviceType, 4);
          const matchedKeyword = deviceKeywords.find(kw => headlineUpper.indexOf(kw) !== -1);
          if (matchedKeyword) {
            isMatch = true;
            matchReason = "พบคำสำคัญประเภทเครื่องมือ [" + matchedKeyword + "] ในประกาศยี่ห้อเดียวกัน";
            confidence = "Medium";
          }
        }
        if (!isMatch) {
          isMatch = true;
          matchReason = "ยี่ห้อตรงกัน (" + brand + ")";
          confidence = "Low";
        }
        if (isMatch) {
          matches.push({
            deviceCode: deviceId,
            assetId: assetId,
            dept: dept,
            brand: brand,
            model: model,
            deviceNameEn: deviceType,
            deviceNameTh: deviceThaiName,
            hospital: hospital,
            status: status,
            source: 'ECRI',
            alertId: alertId,
            alertHeadline: headline,
            alertDate: standardizeDateString(getObjValue(alert, ['Alert Publication Date', 'Publication Date', 'Date', 'date', 'Published'])),
            alertClass: String(alert['FDA Class'] ? 'FDA Class ' + alert['FDA Class'] : 'ECRI Alert'),
            alertPriority: String(alert['Priority'] || 'Normal'),
            confidence: confidence,
            matchReason: matchReason
          });
        }
      }
    });
    
    // จับคู่ฝั่ง FDA
    recalls.forEach(recall => {
      const firmName = String(recall['FIRM_NAME'] || '');
      const firmNameUpper = firmName.toUpperCase();
      const tradeName = String(recall['TRADE_NAME'] || '');
      const productDesc = String(recall['PRODUCT_DESCRIPTION'] || '');
      const reason = String(recall['MANUFACTURER_RECALL_REASON'] || '');
      const recallNumber = String(recall['RECALL_NUMBER'] || '');
      const combinedText = (firmName + " " + tradeName + " " + productDesc).toUpperCase();
      
      if (checkBrandMatch(brand, firmName) || checkBrandMatch(brand, tradeName)) {
        let isMatch = false;
        let matchReason = "";
        let confidence = "Low";
        if (model && model !== '-' && model !== 'VARIOUS' && model !== 'N/A' && model.length >= 2) {
          if (tradeName.toUpperCase().indexOf(normModel) !== -1 || productDesc.toUpperCase().indexOf(normModel) !== -1) {
            isMatch = true;
            matchReason = "พบชื่อรุ่น [" + model + "] ในรายละเอียดสินค้าที่ถูกเรียกคืน";
            confidence = "High";
          } else {
            const modelWords = extractKeywords(model, 3);
            const modelMatchedWord = modelWords.find(word => combinedText.indexOf(word) !== -1);
            if (modelMatchedWord) {
              isMatch = true;
              matchReason = "พบคำสำคัญของรุ่น [" + modelMatchedWord + "] ในรายงานการเรียกคืน";
              confidence = "Medium";
            }
          }
        }
        if (!isMatch) {
          const deviceKeywords = extractKeywords(deviceType, 4);
          const matchedKeyword = deviceKeywords.find(kw => combinedText.indexOf(kw) !== -1);
          if (matchedKeyword) {
            isMatch = true;
            matchReason = "พบคำสำคัญประเภทเครื่องมือ [" + matchedKeyword + "] ในรายงานการเรียกคืนของยี่ห้อเดียวกัน";
            confidence = "Medium";
          }
        }
        if (!isMatch) {
          isMatch = true;
          matchReason = "ยี่ห้อเครื่องมือตรงกับบริษัทที่ถูกเรียกคืน (" + brand + ")";
          confidence = "Low";
        }
        if (isMatch) {
          matches.push({
            deviceCode: deviceId,
            assetId: assetId,
            dept: dept,
            brand: brand,
            model: model,
            deviceNameEn: deviceType,
            deviceNameTh: deviceThaiName,
            hospital: hospital,
            status: status,
            source: 'FDA',
            alertId: recallNumber,
            alertHeadline: "FDA Recall: " + reason,
            alertDate: standardizeDateString(getObjValue(recall, ['POSTED_INTERNET_DT', 'Posted Internet Date', 'Posted Date', 'Date', 'date'])),
            alertClass: String(recall['RECALL_CLASS'] ? 'FDA Class ' + recall['RECALL_CLASS'] : 'FDA Recall'),
            alertPriority: String(recall['RECALL_CLASS'] === '1' ? 'High' : recall['RECALL_CLASS'] === '2' ? 'Normal' : 'Low'),
            confidence: confidence,
            matchReason: matchReason
          });
        }
      }
    });
  });
  return matches;
}

// 19. ดึงข้อมูลชีตแปลงเป็น JSON array (พร้อมระบบค้นหาแถวหัวตารางอัตโนมัติ และรองรับชีตไม่มีหัวตาราง)
function getSheetDataAsJson(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  
  // อ่านแถวแรกมาประเมินว่าเป็นแถวหัวตารางหรือแถวข้อมูลจริง
  const firstRowValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v).trim());
  const firstCell = firstRowValues[0];
  
  // ตรวจสอบลักษณะแถวที่ 1 หากมีรูปแบบเช่น รหัสแจ้งเตือนขึ้นต้นด้วยตัวอักษรตามด้วยเลข (เช่น A45765) หรือรหัส FDA (เช่น Z-2294) หรือเป็นวันที่
  const isDataRow = /^[A-Za-z]\d+/i.test(firstCell) || 
                    /^Z-\d+/i.test(firstCell) || 
                    firstCell.indexOf("/") !== -1 || 
                    (firstCell.length > 0 && !isNaN(Number(firstCell)));
  
  let headers = [];
  let startRowIdx = 1;
  
  if (isDataRow) {
    // ไม่มีแถวหัวตาราง ให้ใช้หัวคอลัมน์จำลอง col1, col2, ... และเริ่มอ่านข้อมูลตั้งแต่แถวที่ 1
    for (let i = 1; i <= lastCol; i++) {
      headers.push("col" + i);
    }
    startRowIdx = 1;
  } else {
    // แถวที่ 1 คือหัวตาราง ให้เริ่มอ่านข้อมูลแถวที่ 2
    headers = firstRowValues;
    startRowIdx = 2;
  }
  
  if (lastRow < startRowIdx) return [];
  
  const rows = sheet.getRange(startRowIdx, 1, lastRow - startRowIdx + 1, lastCol).getValues();
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, colIdx) => {
      if (header) obj[header] = row[colIdx];
    });
    return obj;
  });
}

// 20. ยกเลิกการตั้งเวลารันระบบอัตโนมัติทั้งหมด (ระบบจะเปลี่ยนเป็นแมนนวลให้คนกดสั่งรันเอง)
function setupDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  for (let t of triggers) {
    const fn = t.getHandlerFunction();
    if (fn === "runDailyMatchingJob" || fn === "fetchDailyFdaRecalls") {
      ScriptApp.deleteTrigger(t);
      deletedCount++;
    }
  }
  return {
    success: true,
    message: "ยกเลิกระบบอัตโนมัติเรียบร้อยแล้ว (ลบทริกเกอร์ไป " + deletedCount + " รายการ) ระบบจะใช้ตรรกะแมนนวลให้ผู้ใช้งานกดสั่งรันเองผ่านหน้าจอเท่านั้น"
  };
}

// 20.0.1 ฟังก์ชันย่อยอัปเดตสถานะการประมวลผลประกาศเตือนภัยในตารางหลัก
function flagAlertsAsMatchedInSheets(dateStr, ss) {
  const ecriSheet = ss.getSheetByName("ECRI_Database");
  const ecriLastRow = ecriSheet.getLastRow();
  const fdaSheet = ss.getSheetByName("FDA_Database");
  const fdaLastRow = fdaSheet.getLastRow();

  try {
    if (ecriLastRow > 1) {
      const ecriRange = ecriSheet.getRange(2, 4, ecriLastRow - 1, 5);
      const ecriVals = ecriRange.getValues();
      ecriVals.forEach((row, i) => {
        const alertDate = row[0];
        let alertDateStr = "";
        if (alertDate instanceof Date) {
          alertDateStr = Utilities.formatDate(alertDate, "GMT+7", "yyyy-MM-dd");
        } else if (alertDate) {
          alertDateStr = standardizeDateString(alertDate);
        }
        if (alertDateStr === dateStr) {
          ecriSheet.getRange(i + 2, 8).setValue("MATCHED");
        }
      });
    }
  } catch(eEcri) {
    Logger.log("Error marking ECRI matched: " + eEcri.toString());
  }

  try {
    if (fdaLastRow > 1) {
      const fdaRange = fdaSheet.getRange(2, 7, fdaLastRow - 1, 8);
      const fdaVals = fdaRange.getValues();
      fdaVals.forEach((row, i) => {
        const alertDate = row[0];
        let alertDateStr = "";
        if (alertDate instanceof Date) {
          alertDateStr = Utilities.formatDate(alertDate, "GMT+7", "yyyy-MM-dd");
        } else if (alertDate) {
          alertDateStr = standardizeDateString(alertDate);
        }
        if (alertDateStr === dateStr) {
          fdaSheet.getRange(i + 2, 14).setValue("MATCHED");
        }
      });
    }
  } catch(eFda) {
    Logger.log("Error marking FDA matched: " + eFda.toString());
  }
}

// 20.1 สั่งรันวิเคราะห์เปรียบเทียบข้อมูลความปลอดภัยแมนนวลย้อนหลัง (รันได้ทีละ 1 วันเท่านั้น)
function runMatchingJobForDate(dateStr) {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const openRouterApiKey = getOpenRouterApiKeySettings();
  const adminEmail = getAdminEmailSettings();
  
  Logger.log("เริ่มต้นงานเทียบข้อมูลแมนนวลย้อนหลัง วันที่คัดกรองข่าว: " + dateStr);
  
  try {
    const targetEcri = [];
    const ecriSheet = ss.getSheetByName("ECRI_Database");
    const ecriLastRow = ecriSheet.getLastRow();
    if (ecriLastRow > 1) {
      const ecriValues = ecriSheet.getRange(2, 1, ecriLastRow - 1, 7).getValues();
      ecriValues.forEach(row => {
        if (standardizeDateString(row[3]) === dateStr) {
          targetEcri.push(JSON.parse(row[5]));
        }
      });
    }
    
    const targetFda = [];
    const fdaSheet = ss.getSheetByName("FDA_Database");
    const fdaLastRow = fdaSheet.getLastRow();
    if (fdaLastRow > 1) {
      const fdaValues = fdaSheet.getRange(2, 1, fdaLastRow - 1, 13).getValues();
      fdaValues.forEach(row => {
        if (standardizeDateString(row[6]) === dateStr) {
          targetFda.push(JSON.parse(row[11]));
        }
      });
    }
    
    Logger.log("จำนวนข่าวสำหรับวันที่ " + dateStr + ": ECRI = " + targetEcri.length + " รายการ, FDA = " + targetFda.length + " รายการ");
    
    if (targetEcri.length === 0 && targetFda.length === 0) {
      logSystemActivity("จับคู่ความปลอดภัยแมนนวล ของข่าววันที่ " + dateStr, "Manual Match", 0, "Success");
      return { success: true, count: 0, message: "ไม่มีข่าวเตือนภัยใดๆ ประกาศในระบบสำหรับวันที่ " + dateStr + " (ประมวลผลเสร็จสิ้น)" };
    }
    
    const devSheet = ss.getSheetByName("Devices_Database");
    const devLastRow = devSheet.getLastRow();
    if (devLastRow <= 1) {
      return { success: false, message: "ไม่พบเครื่องมือแพทย์ในฐานข้อมูลกลาง งดรันจับคู่" };
    }
    
    const devValues = devSheet.getRange(2, 1, devLastRow - 1, 10).getValues();
    const allDevices = devValues.map(row => {
      return {
        'โรงพยาบาล': row[0],
        'ID CODE': row[1],
        'Asset ID': row[2],
        'ยี่ห้อ': row[3],
        'รุ่น': row[4],
        'ชนิดเครื่องมือ': row[5],
        'ชื่อครื่องมือไทย': row[6],
        'สถานะ': row[7],
        'หน่วยงาน': row[8]
      };
    });
    
    const allMatches = performMatchingLogic(allDevices, targetEcri, targetFda);
    const highMatches = allMatches.filter(m => m.confidence === 'High');
    
    // ตั้งธงความปลอดภัยค้างส่งประมวลผลหลักเป็นสำเร็จแล้ว (MATCHED)
    flagAlertsAsMatchedInSheets(dateStr, ss);
    
    if (highMatches.length === 0) {
      const logsSheet = ss.getSheetByName("Execution_Logs");
      logsSheet.appendRow([dateStr, "Manual", 0, new Date()]);
      return { success: true, count: 0, message: "ประมวลผลเสร็จสิ้น แต่ไม่พบครุภัณฑ์ของสาขาใดตรงกับประกาศของวันที่ " + dateStr };
    }
    
    const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
    const existingMatchKeys = new Set();
    const matchLastRow = matchSheet.getLastRow();
    if (matchLastRow > 1) {
      matchSheet.getRange(2, 1, matchLastRow - 1, 8).getValues().forEach(row => {
        existingMatchKeys.add(String(row[0]).trim() + "_" + String(row[1]).trim() + "_" + String(row[7]).trim());
      });
    }
    
    const aiAnalysisCache = {};
    const todayFullStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    let newMatchesAdded = 0;
    
    const hospitalReports = {};
    const registeredHospitals = getHospitalsMap();
    const hospEmailMap = {};
    registeredHospitals.forEach(h => {
      hospEmailMap[h.name] = h.email;
    });
    
    for (let match of highMatches) {
      const key = match.hospital + "_" + match.deviceCode + "_" + match.alertId;
      if (existingMatchKeys.has(key)) continue; 
      
      let aiText = "";
      const cacheKey = match.brand + "_" + match.model + "_" + match.alertId;
      
      if (aiAnalysisCache[cacheKey]) {
        aiText = aiAnalysisCache[cacheKey];
      } else {
        const dbCachedAI = getPersistentAIAnalysis(match.brand, match.model, match.alertId);
        if (dbCachedAI) {
          aiText = dbCachedAI;
          aiAnalysisCache[cacheKey] = aiText;
        } else {
          Utilities.sleep(2000); // หากรันแมนนวลให้หน่วงเวลาสั้นลงเล็กน้อย
          aiText = callOpenRouterAIService(match, match, openRouterApiKey);
          aiAnalysisCache[cacheKey] = aiText;
        }
      }
      
      const newRow = [
        match.hospital,
        match.deviceCode,
        match.assetId,
        match.brand,
        match.model,
        match.dept,
        match.source,
        match.alertId,
        match.alertHeadline,
        match.alertDate,
        "ตรงกันสูง",
        match.matchReason,
        aiText,
        todayFullStr,
        "รอยืนยัน",
        "",
        "",
        ""
      ];
      
      matchSheet.appendRow(newRow);
      existingMatchKeys.add(key);
      newMatchesAdded++;
      
      if (!hospitalReports[match.hospital]) {
        hospitalReports[match.hospital] = [];
      }
      hospitalReports[match.hospital].push(match);
    }
    
    Object.keys(hospitalReports).forEach(hName => {
      const recipient = hospEmailMap[hName] || adminEmail;
      if (recipient) {
        sendHospitalDailyReportEmail(hName, recipient, allDevices.filter(d => d['โรงพยาบาล'] === hName).length, hospitalReports[hName].length, ss.getUrl());
      }
    });
    
    logSystemActivity("จับคู่ความปลอดภัยแมนนวล ของข่าววันที่ " + dateStr, "Manual Match", newMatchesAdded, "Success");
    
    return {
      success: true,
      count: newMatchesAdded,
      message: "สั่งรันจับคู่ความปลอดภัยแมนนวลย้อนหลังของวันที่ " + dateStr + " สำเร็จ! ตรวจพบเคสความเสี่ยงใหม่ " + newMatchesAdded + " รายการ"
    };
    
  } catch (error) {
    return { success: false, message: "เกิดข้อผิดพลาดในการประมวลผลแมนนวล: " + error.toString() };
  }
}

// 20.2 ดึงรายการวันที่เคยรันวิเคราะห์แล้วทั้งหมด (แยกรายคลังข่าว ECRI และ FDA เพื่อแสดงสองสีแบ่งครึ่งในปฏิทิน)
function getProcessedDates() {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ecriDates = new Set();
  const fdaDates = new Set();
  
  // 1. ดึงประวัติการรันจากตาราง Execution_Logs
  const logsSheet = ss.getSheetByName("Execution_Logs");
  const logsLastRow = logsSheet.getLastRow();
  const runDates = new Set();
  if (logsLastRow > 1) {
    const logVals = logsSheet.getRange(2, 1, logsLastRow - 1, 2).getValues();
    logVals.forEach(row => {
      const activityVal = row[0];
      const type = String(row[1] || '');
      if (type === "Auto Match" || type === "Manual Match" || type === "Manual") {
        let dateStr = "";
        if (activityVal instanceof Date) {
          dateStr = Utilities.formatDate(activityVal, "GMT+7", "yyyy-MM-dd");
        } else {
          const str = String(activityVal || '').trim();
          const match = str.match(/\d{4}-\d{2}-\d{2}/);
          if (match) {
            dateStr = match[0];
          }
        }
        if (dateStr) {
          runDates.add(dateStr);
        }
      }
    });
  }

  // 2. วิเคราะห์จากตารางหลัก ECRI_Database
  const ecriSheet = ss.getSheetByName("ECRI_Database");
  const ecriLastRow = ecriSheet.getLastRow();
  const ecriTotalByDate = {};
  const ecriMatchedByDate = {};
  
  if (ecriLastRow > 1) {
    const ecriVals = ecriSheet.getRange(2, 4, ecriLastRow - 1, 5).getValues(); // คอลัมน์ D ถึง H
    ecriVals.forEach(row => {
      const alertDate = row[0];
      const matchedFlag = String(row[4] || '').trim().toUpperCase();
      
      let alertDateStr = "";
      if (alertDate instanceof Date) {
        alertDateStr = Utilities.formatDate(alertDate, "GMT+7", "yyyy-MM-dd");
      } else if (alertDate) {
        alertDateStr = standardizeDateString(alertDate);
      }
      
      if (alertDateStr) {
        ecriTotalByDate[alertDateStr] = (ecriTotalByDate[alertDateStr] || 0) + 1;
        if (matchedFlag === "MATCHED" || matchedFlag === "Y" || matchedFlag === "TRUE") {
          ecriMatchedByDate[alertDateStr] = (ecriMatchedByDate[alertDateStr] || 0) + 1;
        }
      }
    });
  }

  // 3. วิเคราะห์จากตารางหลัก FDA_Database
  const fdaSheet = ss.getSheetByName("FDA_Database");
  const fdaLastRow = fdaSheet.getLastRow();
  const fdaTotalByDate = {};
  const fdaMatchedByDate = {};
  
  if (fdaLastRow > 1) {
    const fdaVals = fdaSheet.getRange(2, 7, fdaLastRow - 1, 8).getValues(); // คอลัมน์ G ถึง N
    fdaVals.forEach(row => {
      const alertDate = row[0];
      const matchedFlag = String(row[7] || '').trim().toUpperCase();
      
      let alertDateStr = "";
      if (alertDate instanceof Date) {
        alertDateStr = Utilities.formatDate(alertDate, "GMT+7", "yyyy-MM-dd");
      } else if (alertDate) {
        alertDateStr = standardizeDateString(alertDate);
      }
      
      if (alertDateStr) {
        fdaTotalByDate[alertDateStr] = (fdaTotalByDate[alertDateStr] || 0) + 1;
        if (matchedFlag === "MATCHED" || matchedFlag === "Y" || matchedFlag === "TRUE") {
          fdaMatchedByDate[alertDateStr] = (fdaMatchedByDate[alertDateStr] || 0) + 1;
        }
      }
    });
  }

  // 4. สแกนย้อนหลังจากตารางประกาศที่แมตช์ได้จริงใน Matched_Alerts_Database (ความเสี่ยงสูง)
  const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
  const matchLastRow = matchSheet.getLastRow();
  const matchEcriDates = new Set();
  const matchFdaDates = new Set();
  
  if (matchLastRow > 1) {
    const matchVals = matchSheet.getRange(2, 7, matchLastRow - 1, 4).getValues();
    matchVals.forEach(row => {
      const source = String(row[0] || '').trim().toUpperCase();
      let alertDate = row[3];
      let alertDateStr = "";
      if (alertDate instanceof Date) {
        alertDateStr = Utilities.formatDate(alertDate, "GMT+7", "yyyy-MM-dd");
      } else if (alertDate) {
        alertDateStr = standardizeDateString(alertDate);
      }
      
      if (alertDateStr) {
        if (source === "ECRI") {
          matchEcriDates.add(alertDateStr);
        } else if (source === "FDA") {
          matchFdaDates.add(alertDateStr);
        }
      }
    });
  }

  // รวมผลลัพธ์:
  // สำหรับ ECRI: วันนั้นจะแสดงผลว่ารันแล้วก็ต่อเมื่อ มีประกาศและทุกประกาศในวันนั้นถูกประมวลผลแล้ว (Matched) 
  // หรือไม่มีประกาศเลยแต่มีประวัติเคยรัน หรือพบคู่ความเสี่ยงจริงในตาราง Matched
  const allEcriDates = new Set([...Object.keys(ecriTotalByDate), ...runDates, ...matchEcriDates]);
  allEcriDates.forEach(dateStr => {
    const total = ecriTotalByDate[dateStr] || 0;
    const matched = ecriMatchedByDate[dateStr] || 0;
    if (total > 0) {
      if (matched === total) {
        ecriDates.add(dateStr);
      }
    } else {
      // ไม่มีข้อมูลข่าวประกาศในตารางหลัก แต่มีประวัติการรันหรือการแมตช์ ถือว่ารันเสร็จสิ้น (0 เคส)
      if (runDates.has(dateStr) || matchEcriDates.has(dateStr)) {
        ecriDates.add(dateStr);
      }
    }
  });

  // สำหรับ FDA: ทำเช่นเดียวกัน
  const allFdaDates = new Set([...Object.keys(fdaTotalByDate), ...runDates, ...matchFdaDates]);
  allFdaDates.forEach(dateStr => {
    const total = fdaTotalByDate[dateStr] || 0;
    const matched = fdaMatchedByDate[dateStr] || 0;
    if (total > 0) {
      if (matched === total) {
        fdaDates.add(dateStr);
      }
    } else {
      if (runDates.has(dateStr) || matchFdaDates.has(dateStr)) {
        fdaDates.add(dateStr);
      }
    }
  });
  
  return {
    ecri: Array.from(ecriDates),
    fda: Array.from(fdaDates)
  };
}

// 20.3 ดึงสถิติแจ้งเตือนแยกรายวันของเดือนที่เลือกสำหรับคลังข่าวที่ประมวลผลแล้ว (ECRI และ FDA ตามระดับความเสี่ยง)
function getBranchMonthlyStats(hospitalName, filterMonth) {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const today = new Date();
  let currentYear = today.getFullYear();
  let currentMonth = today.getMonth(); // 0-11
  
  if (filterMonth && /^\d{4}-\d{2}$/.test(filterMonth)) {
    const parts = filterMonth.split("-");
    currentYear = parseInt(parts[0], 10);
    currentMonth = parseInt(parts[1], 10) - 1;
  }
  
  const thMonthsFull = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const ecriDaily = [];
  const fdaDaily = [];
  const labels = [];
  
  for (let d = 1; d <= daysInMonth; d++) {
    labels.push(String(d));
    ecriDaily.push({ High: 0, Normal: 0, Critical: 0, Not: 0 });
    fdaDaily.push({ Level1: 0, Level2: 0, Level3: 0 });
  }
  
  // 1. โหลดข้อมูลสถิติของ ECRI จากตารางหลัก ECRI_Database กรองเฉพาะแถวที่เป็น MATCHED
  const ecriSheet = ss.getSheetByName("ECRI_Database");
  const ecriLastRow = ecriSheet.getLastRow();
  if (ecriLastRow > 1) {
    const ecriVals = ecriSheet.getRange(2, 2, ecriLastRow - 1, 7).getValues(); // B ถึง H
    ecriVals.forEach(row => {
      const priority = String(row[0] || '').trim();
      const alertDateVal = row[2]; // D
      const matchedFlag = String(row[6] || '').trim().toUpperCase(); // H
      
      if (matchedFlag === "MATCHED" || matchedFlag === "Y" || matchedFlag === "TRUE") {
        let dateObj = null;
        if (alertDateVal instanceof Date) {
          dateObj = alertDateVal;
        } else if (alertDateVal) {
          const stdStr = standardizeDateString(alertDateVal);
          if (stdStr) {
            dateObj = new Date(stdStr);
          }
        }
        
        if (dateObj && dateObj.getFullYear() === currentYear && dateObj.getMonth() === currentMonth) {
          const dayNum = dateObj.getDate();
          const idx = dayNum - 1;
          if (idx >= 0 && idx < daysInMonth) {
            if (priority.indexOf("High") !== -1) ecriDaily[idx].High++;
            else if (priority.indexOf("Critical") !== -1) ecriDaily[idx].Critical++;
            else if (priority.indexOf("Normal") !== -1) ecriDaily[idx].Normal++;
            else ecriDaily[idx].Not++;
          }
        }
      }
    });
  }
  
  // 2. โหลดข้อมูลสถิติของ FDA จากตารางหลัก FDA_Database กรองเฉพาะแถวที่เป็น MATCHED
  const fdaSheet = ss.getSheetByName("FDA_Database");
  const fdaLastRow = fdaSheet.getLastRow();
  if (fdaLastRow > 1) {
    const fdaVals = fdaSheet.getRange(2, 2, fdaLastRow - 1, 13).getValues(); // B ถึง N
    fdaVals.forEach(row => {
      const fdaClass = String(row[3] || '').trim(); // E
      const alertDateVal = row[5]; // G
      const matchedFlag = String(row[12] || '').trim().toUpperCase(); // N
      
      if (matchedFlag === "MATCHED" || matchedFlag === "Y" || matchedFlag === "TRUE") {
        let dateObj = null;
        if (alertDateVal instanceof Date) {
          dateObj = alertDateVal;
        } else if (alertDateVal) {
          const stdStr = standardizeDateString(alertDateVal);
          if (stdStr) {
            dateObj = new Date(stdStr);
          }
        }
        
        if (dateObj && dateObj.getFullYear() === currentYear && dateObj.getMonth() === currentMonth) {
          const dayNum = dateObj.getDate();
          const idx = dayNum - 1;
          if (idx >= 0 && idx < daysInMonth) {
            const cls = fdaClass.toUpperCase();
            if (cls.indexOf("CLASS I") !== -1 && cls.indexOf("CLASS II") === -1 && cls.indexOf("CLASS III") === -1) {
              fdaDaily[idx].Level1++;
            } else if (cls.indexOf("CLASS 1") !== -1) {
              fdaDaily[idx].Level1++;
            } else if (cls.indexOf("CLASS II") !== -1 || cls.indexOf("CLASS 2") !== -1) {
              fdaDaily[idx].Level2++;
            } else if (cls.indexOf("CLASS III") !== -1 || cls.indexOf("CLASS 3") !== -1) {
              fdaDaily[idx].Level3++;
            } else {
              fdaDaily[idx].Level2++;
            }
          }
        }
      }
    });
  }
  
  return {
    labels: labels,
    ecri: ecriDaily,
    fda: fdaDaily,
    monthName: thMonthsFull[currentMonth],
    monthNum: String(currentMonth + 1).padStart(2, '0'),
    yearGregorian: currentYear,
    year543: currentYear + 543
  };
}

// 21. ดึงข้อมูลประกาศเตือนภัยสะสมทั้งหมด (ECRI & FDA) สำหรับเปิดดูย้อนหลัง
function getAlertsFromDatabase(filterMonth) {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const alertsList = [];
  
  // 1. ดึง ECRI
  const ecriSheet = ss.getSheetByName("ECRI_Database");
  const ecriLastRow = ecriSheet.getLastRow();
  if (ecriLastRow > 1) {
    const values = ecriSheet.getRange(2, 1, ecriLastRow - 1, 7).getValues();
    values.forEach(function(row) {
      var dateStr = "";
      if (row[3] instanceof Date) {
        dateStr = Utilities.formatDate(row[3], "GMT+7", "yyyy-MM-dd");
      } else if (row[3]) {
        dateStr = String(row[3]);
      }
      
      // กรองเฉพาะเดือนที่ต้องการบน Backend เพื่อให้ดึงข้อมูลได้เร็วขึ้นอย่างมาก
      if (filterMonth && filterMonth !== 'ALL') {
        var itemMonth = dateStr ? dateStr.substring(0, 7) : "";
        if (itemMonth !== filterMonth) return;
      }
      
      alertsList.push({
        id: String(row[0]),
        source: "ECRI",
        date: dateStr,
        class: String(row[4]),
        headline: String(row[2]),
        rawJson: String(row[5] || ""),
        dateAdded: String(row[6])
      });
    });
  }
  
  // 2. ดึง FDA
  const fdaSheet = ss.getSheetByName("FDA_Database");
  const fdaLastRow = fdaSheet.getLastRow();
  if (fdaLastRow > 1) {
    const values = fdaSheet.getRange(2, 1, fdaLastRow - 1, 13).getValues();
    values.forEach(function(row) {
      var dateStr = "";
      if (row[6] instanceof Date) {
        dateStr = Utilities.formatDate(row[6], "GMT+7", "yyyy-MM-dd");
      } else if (row[6]) {
        dateStr = String(row[6]);
      }
      
      // กรองเฉพาะเดือนที่ต้องการบน Backend เพื่อให้ดึงข้อมูลได้เร็วขึ้นอย่างมาก
      if (filterMonth && filterMonth !== 'ALL') {
        var itemMonth = dateStr ? dateStr.substring(0, 7) : "";
        if (itemMonth !== filterMonth) return;
      }
      
      alertsList.push({
        id: String(row[1]),
        source: "FDA",
        date: dateStr,
        class: String(row[4]),
        headline: "FDA Recall: " + String(row[10] || ""),
        rawJson: String(row[11] || ""),
        dateAdded: String(row[12])
      });
    });
  }
  
  // เรียงลำดับวันที่จากใหม่สุดไปเก่าสุด
  alertsList.sort(function(a, b) {
    var timeA = a.date ? new Date(a.date).getTime() : 0;
    var timeB = b.date ? new Date(b.date).getTime() : 0;
    return timeB - timeA;
  });
  
  return alertsList;
}

// ฟังก์ชันเฉพาะกิจเพื่อวิเคราะห์ฟอร์แมตวันที่เตือนภัยในฐานข้อมูลจับคู่จริง
function debugGetMatchedAlertsDates() {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Matched_Alerts_Database");
  const lastRow = sheet.getLastRow();
  const logs = [];
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    values.forEach((row, idx) => {
      logs.push({
        row: idx + 2,
        hospital: row[0],
        alertId: row[7],
        rawAlertDate: row[9],
        rawAlertDateType: typeof row[9],
        standardizedAlertDate: standardizeDateString(row[9])
      });
    });
  }
  return logs;
}

// ฟังก์ชันซ่อมแซมและปรับปรุงแก้ไขวันที่ผิดพลาดในตารางประมวลผลสะสม Matched_Alerts_Database
function fixIncorrectDatesInDatabase() {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. ดึงแผนผังวันที่ที่ถูกต้องเป็นมาตรฐานจากตารางหลัก FDA และ ECRI
  const correctDates = {};
  
  const ecriSheet = ss.getSheetByName("ECRI_Database");
  const ecriLastRow = ecriSheet.getLastRow();
  if (ecriLastRow > 1) {
    const ecriVals = ecriSheet.getRange(2, 1, ecriLastRow - 1, 7).getValues();
    ecriVals.forEach((row, idx) => {
      const alertId = String(row[0]).trim();
      const rawJsonStr = row[5];
      let correctDate = "";
      try {
        const rawJson = JSON.parse(rawJsonStr);
        const originalDate = getObjValue(rawJson, ['Alert Publication Date', 'Publication Date', 'Date', 'date', 'Published']);
        correctDate = standardizeDateString(originalDate);
      } catch(e) {
        correctDate = standardizeDateString(row[3]);
      }
      
      // อัปเดตตารางหลัก ECRI_Database หากวันที่เคยถูกตีความผิดพลาดและบันทึกผิด
      const currentSheetDate = standardizeDateString(row[3]);
      if (correctDate && currentSheetDate !== correctDate) {
        ecriSheet.getRange(idx + 2, 4).setValue(correctDate); // คอลัมน์ที่ 4 คือ Alert Publication Date
      }
      
      if (alertId) {
        correctDates[alertId] = correctDate;
      }
    });
  }
  
  const fdaSheet = ss.getSheetByName("FDA_Database");
  const fdaLastRow = fdaSheet.getLastRow();
  if (fdaLastRow > 1) {
    const fdaVals = fdaSheet.getRange(2, 1, fdaLastRow - 1, 13).getValues();
    fdaVals.forEach((row, idx) => {
      const recallNum = String(row[1]).trim();
      const rawJsonStr = row[11];
      let correctDate = "";
      try {
        const rawJson = JSON.parse(rawJsonStr);
        const originalDate = getObjValue(rawJson, ['POSTED_INTERNET_DT', 'Posted Internet Date', 'Posted Date', 'Date', 'date']);
        correctDate = standardizeDateString(originalDate);
      } catch(e) {
        correctDate = standardizeDateString(row[6]);
      }
      
      // อัปเดตตารางหลัก FDA_Database หากวันที่เคยถูกตีความผิดพลาดและบันทึกผิด
      const currentSheetDate = standardizeDateString(row[6]);
      if (correctDate && currentSheetDate !== correctDate) {
        fdaSheet.getRange(idx + 2, 7).setValue(correctDate); // คอลัมน์ที่ 7 คือ POSTED_INTERNET_DT
      }
      
      if (recallNum) {
        correctDates[recallNum] = correctDate;
      }
    });
  }
  
  // 2. ไล่สแกนและแก้ไขวันที่ใน Matched_Alerts_Database ให้ตรงตามตารางหลัก
  const matchSheet = ss.getSheetByName("Matched_Alerts_Database");
  const matchLastRow = matchSheet.getLastRow();
  let fixCount = 0;
  
  if (matchLastRow > 1) {
    const matchRange = matchSheet.getRange(2, 1, matchLastRow - 1, 18);
    const matchValues = matchRange.getValues();
    
    for (let i = 0; i < matchValues.length; i++) {
      const alertId = String(matchValues[i][7]).trim(); // คอลัมน์ 8 (รหัสแจ้งเตือน)
      const currentRawDate = matchValues[i][9]; // คอลัมน์ 10 (วันที่ประกาศ)
      const currentStdDate = standardizeDateString(currentRawDate);
      
      const correctStdDate = correctDates[alertId];
      if (correctStdDate && currentStdDate !== correctStdDate) {
        // อัปเดตเซลล์วันที่ในคอลัมน์ที่ 10 (ดัชนีคอลัมน์คือ 10 แถวคือ i + 2)
        matchSheet.getRange(i + 2, 10).setValue(correctStdDate);
        fixCount++;
        Logger.log("FIX_DATE: Row=" + (i+2) + " AlertId=" + alertId + " Old=" + currentStdDate + " New=" + correctStdDate);
      }
    }
  }
  return { success: true, fixedCount: fixCount };
}

// ฟังก์ชันดึงค่าจาก Object แบบรองรับชื่อฟิลด์ที่เป็นตัวพิมพ์เล็ก-ใหญ่ และสัญลักษณ์พิเศษข้ามไฟล์ Excel
function getObjValue(obj, possibleKeys) {
  if (!obj) return "";
  for (let i = 0; i < possibleKeys.length; i++) {
    const key = possibleKeys[i];
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  // ค้นหาแบบละเว้นตัวพิมพ์เล็กใหญ่ และสัญลักษณ์พิเศษ (ช่องว่าง, _, -, .)
  const lowerKeys = possibleKeys.map(k => k.toLowerCase().replace(/[\s_\-\.]/g, ''));
  for (let key in obj) {
    const cleanKey = key.toLowerCase().replace(/[\s_\-\.]/g, '');
    if (lowerKeys.indexOf(cleanKey) !== -1) {
      return obj[key];
    }
  }
  return "";
}

// 21. ฟังก์ชันบันทึกล็อกประวัติการทำงานของระบบลงชีต Execution_Logs
function logSystemActivity(activity, type, count, status) {
  try {
    initDatabaseSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Execution_Logs");
    sheet.appendRow([
      activity,
      type,
      count,
      new Date(),
      status || "Success"
    ]);
  } catch(e) {
    Logger.log("เกิดข้อผิดพลาดในการบันทึกกิจกรรมระบบ: " + e.toString());
  }
}

function getRecentSystemActivities() {
  try {
    initDatabaseSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Execution_Logs");
    const lastRow = sheet.getLastRow();
    const logs = [];

    if (lastRow > 1) {
      // ดึงย้อนหลังถึง 50 แถวเพื่อกรองแถวว่างที่เกิดจากการเพิ่มลบแถว
      const startRow = Math.max(2, lastRow - 49);
      const numRows = lastRow - startRow + 1;
      const values = sheet.getRange(startRow, 1, numRows, 5).getValues();
      values.forEach(row => {
        const activity = String(row[0] || '').trim();
        const type = String(row[1] || '').trim();
        if (!activity && !type) return; // ข้ามแถวที่ว่างเปล่า
        
        let timeStr = "";
        if (row[3] instanceof Date) {
          timeStr = Utilities.formatDate(row[3], "GMT+7", "yyyy-MM-dd HH:mm:ss");
        } else if (row[3]) {
          timeStr = String(row[3]);
        }
        logs.push({
          activity: activity,
          type: type,
          count: row[2],
          timestamp: timeStr,
          status: row[4] || "Success"
        });
      });
    }
    return logs.reverse().slice(0, 10);
  } catch(e) {
    Logger.log("เกิดข้อผิดพลาดในการดึงกิจกรรมระบบล่าสุด: " + e.toString());
    return [];
  }
}

// 23. สั่งรันวิเคราะห์เปรียบเทียบข้อมูลความปลอดภัยแมนนวลทั้งหมดสะสม สำหรับทุกวันที่ยังไม่เคยรัน
function runMatchingJobForAllUnprocessed() {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const unprocessedDates = new Set();
  
  // 1. สแกนหาประกาศที่ยังไม่ได้รันจาก ECRI_Database
  const ecriSheet = ss.getSheetByName("ECRI_Database");
  const ecriLastRow = ecriSheet.getLastRow();
  if (ecriLastRow > 1) {
    const ecriVals = ecriSheet.getRange(2, 4, ecriLastRow - 1, 5).getValues();
    ecriVals.forEach(row => {
      const alertDate = row[0];
      const matchedFlag = String(row[4] || '').trim().toUpperCase();
      if (matchedFlag !== "MATCHED" && matchedFlag !== "Y" && matchedFlag !== "TRUE") {
        let alertDateStr = "";
        if (alertDate instanceof Date) {
          alertDateStr = Utilities.formatDate(alertDate, "GMT+7", "yyyy-MM-dd");
        } else if (alertDate) {
          alertDateStr = standardizeDateString(alertDate);
        }
        if (alertDateStr) {
          unprocessedDates.add(alertDateStr);
        }
      }
    });
  }
  
  // 2. สแกนหาประกาศที่ยังไม่ได้รันจาก FDA_Database
  const fdaSheet = ss.getSheetByName("FDA_Database");
  const fdaLastRow = fdaSheet.getLastRow();
  if (fdaLastRow > 1) {
    const fdaVals = fdaSheet.getRange(2, 7, fdaLastRow - 1, 8).getValues();
    fdaVals.forEach(row => {
      const alertDate = row[0];
      const matchedFlag = String(row[7] || '').trim().toUpperCase();
      if (matchedFlag !== "MATCHED" && matchedFlag !== "Y" && matchedFlag !== "TRUE") {
        let alertDateStr = "";
        if (alertDate instanceof Date) {
          alertDateStr = Utilities.formatDate(alertDate, "GMT+7", "yyyy-MM-dd");
        } else if (alertDate) {
          alertDateStr = standardizeDateString(alertDate);
        }
        if (alertDateStr) {
          unprocessedDates.add(alertDateStr);
        }
      }
    });
  }
  
  const datesToRun = Array.from(unprocessedDates).sort();
  if (datesToRun.length === 0) {
    return {
      success: true,
      count: 0,
      message: "ไม่พบประกาศใหม่ที่ยังไม่ได้ประมวลผล ทุกประกาศได้รับการจับคู่เรียบร้อยแล้ว!"
    };
  }
  
  // จำกัดการรันสูงสุด 15 วันต่อรอบการกด เพื่อป้องกัน Script Timeout
  const limit = 15;
  const targetDates = datesToRun.slice(0, limit);
  
  let totalNewMatches = 0;
  let processedCount = 0;
  
  for (let dateStr of targetDates) {
    try {
      const res = runMatchingJobForDate(dateStr);
      if (res && res.success) {
        totalNewMatches += (res.count || 0);
        processedCount++;
      }
    } catch(e) {
      Logger.log("เกิดข้อผิดพลาดในการประมวลผลแมนนวลของวันที่ " + dateStr + ": " + e.toString());
    }
  }
  
  logSystemActivity("ประมวลผลข้อมูลคงค้างทั้งหมดสะสม (" + processedCount + " วัน)", "Bulk Match", totalNewMatches, "Success");
  
  let msg = "ประมวลผลย้อนหลังสำหรับวันที่คงค้างสำเร็จทั้งหมด " + processedCount + " วัน (ตรวจพบครุภัณฑ์ตรงกับประกาศใหม่รวม " + totalNewMatches + " รายการ)";
  if (datesToRun.length > limit) {
    msg += " (ยังมีข้อมูลเหลืออีก " + (datesToRun.length - limit) + " วันที่ยังไม่ได้ประมวลผล กรุณากดสั่งรันประมวลผลทั้งหมดอีกครั้งเพื่อทำต่อ)";
  }
  
  return {
    success: true,
    processedDays: processedCount,
    count: totalNewMatches,
    message: msg
  };
}

// NOTE: fetchDailyFdaRecalls, fetchFdaRecallsFromApi, testFdaApiKey, saveFdaApiKey, getFdaApiKeySettings
// ถูกยกเลิกแล้ว - FDA ใช้การอัปโหลดไฟล์ Excel แมนนวลผ่านหน้าจัดการระบบ เหมือนกับ ECRI

// 22. ดึงปี-เดือนทั้งหมดที่มีการอัปโหลดบันทึกในฐานข้อมูลสะสมย้อนหลัง
function getAvailableDatabaseMonths() {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const monthsSet = {};
  
  // 1. ดึงเดือนจาก ECRI
  const ecriSheet = ss.getSheetByName("ECRI_Database");
  const ecriLastRow = ecriSheet.getLastRow();
  if (ecriLastRow > 1) {
    const values = ecriSheet.getRange(2, 4, ecriLastRow - 1, 1).getValues(); // Column D
    values.forEach(row => {
      let dateVal = row[0];
      let dateStr = "";
      if (dateVal instanceof Date) {
        dateStr = Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd");
      } else if (dateVal) {
        dateStr = String(dateVal);
      }
      if (dateStr && dateStr.length >= 7) {
        monthsSet[dateStr.substring(0, 7)] = true;
      }
    });
  }
  
  // 2. ดึงเดือนจาก FDA
  const fdaSheet = ss.getSheetByName("FDA_Database");
  const fdaLastRow = fdaSheet.getLastRow();
  if (fdaLastRow > 1) {
    const values = fdaSheet.getRange(2, 7, fdaLastRow - 1, 1).getValues(); // Column G
    values.forEach(row => {
      let dateVal = row[0];
      let dateStr = "";
      if (dateVal instanceof Date) {
        dateStr = Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd");
      } else if (dateVal) {
        dateStr = String(dateVal);
      }
      if (dateStr && dateStr.length >= 7) {
        monthsSet[dateStr.substring(0, 7)] = true;
      }
    });
  }
  
  const sortedMonths = Object.keys(monthsSet).sort().reverse();
  return sortedMonths;
}

// 23. ดึงข้อมูลและสร้างไฟล์ Excel (.xlsx) แยกค่ายข่าว (ECRI/FDA) คนละ Sheet
function getExportAlertsExcel(monthsList, sourcesList) {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const selectedMonthsMap = {};
  if (Array.isArray(monthsList)) {
    monthsList.forEach(m => {
      selectedMonthsMap[String(m).trim()] = true;
    });
  }
  
  const selectedSourcesMap = {};
  if (Array.isArray(sourcesList)) {
    sourcesList.forEach(s => {
      selectedSourcesMap[String(s).trim().toUpperCase()] = true;
    });
  }
  
  // 1. สร้าง temporary spreadsheet
  const tempSs = SpreadsheetApp.create("Alerts_Report_Temp");
  const tempSheets = tempSs.getSheets();
  let ecriSheet = null;
  let fdaSheet = null;
  
  // 2. เติมข้อมูล ECRI
  if (selectedSourcesMap["ECRI"]) {
    const ecriDb = ss.getSheetByName("ECRI_Database");
    const ecriLastRow = ecriDb.getLastRow();
    
    // ดึงเฉพาะแถวที่ตรงตามเงื่อนไขเดือน
    const ecriData = [];
    if (ecriLastRow > 1) {
      const values = ecriDb.getRange(2, 1, ecriLastRow - 1, 5).getValues(); // Accession Number ถึง FDA Class (5 คอลัมน์แรก)
      values.forEach(row => {
        var dateVal = row[3];
        var dateStr = "";
        if (dateVal instanceof Date) {
          dateStr = Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd");
        } else if (dateVal) {
          dateStr = String(dateVal);
        }
        var itemMonth = dateStr ? dateStr.substring(0, 7) : "";
        if (selectedMonthsMap[itemMonth]) {
          const rowCopy = [...row];
          rowCopy[3] = dateStr;
          ecriData.push(rowCopy);
        }
      });
    }
    
    ecriSheet = tempSheets[0];
    ecriSheet.setName("ECRI Alerts");
    ecriSheet.appendRow(["Accession Number", "Priority", "Headline", "Alert Publication Date", "FDA Class"]);
    ecriSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
    if (ecriData.length > 0) {
      ecriSheet.getRange(2, 1, ecriData.length, 5).setValues(ecriData);
    }
  }
  
  // 3. เติมข้อมูล FDA
  if (selectedSourcesMap["FDA"]) {
    const fdaDb = ss.getSheetByName("FDA_Database");
    const fdaLastRow = fdaDb.getLastRow();
    
    // ดึงเฉพาะแถวที่ตรงตามเงื่อนไขเดือน
    const fdaData = [];
    if (fdaLastRow > 1) {
      const values = fdaDb.getRange(2, 1, fdaLastRow - 1, 11).getValues(); // 11 คอลัมน์แรก
      values.forEach(row => {
        var dateVal = row[6]; // POSTED_INTERNET_DT
        var dateStr = "";
        if (dateVal instanceof Date) {
          dateStr = Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd");
        } else if (dateVal) {
          dateStr = String(dateVal);
        }
        var itemMonth = dateStr ? dateStr.substring(0, 7) : "";
        if (selectedMonthsMap[itemMonth]) {
          const rowCopy = [...row];
          // แปลงวันที่ทุกช่องให้อยู่ในฟอร์แมตมาตรฐาน
          if (rowCopy[5] instanceof Date) {
            rowCopy[5] = Utilities.formatDate(rowCopy[5], "GMT+7", "yyyy-MM-dd");
          }
          rowCopy[6] = dateStr;
          if (rowCopy[7] instanceof Date) {
            rowCopy[7] = Utilities.formatDate(rowCopy[7], "GMT+7", "yyyy-MM-dd");
          }
          fdaData.push(rowCopy);
        }
      });
    }
    
    if (ecriSheet) {
      fdaSheet = tempSs.insertSheet("FDA Recalls");
    } else {
      fdaSheet = tempSheets[0];
      fdaSheet.setName("FDA Recalls");
    }
    fdaSheet.appendRow(["WEB_ADDRESS", "RECALL_NUMBER", "PRODUCT_DESCRIPTION", "TRADE_NAME", "RECALL_CLASS", "CENTER_CLASSIFICATION_DT", "POSTED_INTERNET_DT", "TERMINATION_DT", "FEI_NUMBER", "FIRM_NAME", "MANUFACTURER_RECALL_REASON"]);
    fdaSheet.getRange(1, 1, 1, 11).setFontWeight("bold").setBackgroundColor("#1e1b4b").setFontColor("#ffffff");
    if (fdaData.length > 0) {
      fdaSheet.getRange(2, 1, fdaData.length, 11).setValues(fdaData);
    }
  }
  
  // 4. บันทึกและดาวน์โหลด
  SpreadsheetApp.flush();
  const fileId = tempSs.getId();
  const filename = "Alerts_Report_" + sourcesList.join("-") + ".xlsx";
  
  const url = "https://docs.google.com/spreadsheets/d/" + fileId + "/export?format=xlsx";
  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token
    },
    muteHttpExceptions: true
  });
  
  const xlsxBlob = response.getBlob().setName(filename);
  
  // ลบไฟล์ Temp
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e){}
  
  const base64 = Utilities.base64Encode(xlsxBlob.getBytes());
  return {
    base64: base64,
    filename: filename
  };
}

// (End of file)

// ===================================================================
// 24. สร้าง Google Slides คู่มือการใช้งานระบบ 20 สไลด์อัตโนมัติ
// ===================================================================
function createProjectPresentation() {
  var prs = SlidesApp.create('คู่มือการใช้งาน | ระบบตรวจสอบความปลอดภัยเครื่องมือแพทย์');
  prs.getSlides()[0].remove(); // ลบสไลด์ว่างเริ่มต้น

  // ---- Hex Colors ----
  var BL  = '#1A47CC'; // Blue
  var DBL = '#0D1E5A'; // Dark Blue
  var WH  = '#FFFFFF'; // White
  var LBL = '#D6EAFF'; // Light Blue
  var OR  = '#E06B10'; // Orange
  var DG  = '#222222'; // Dark Gray
  var GR  = '#555555'; // Gray
  var LGR = '#F0F4FF'; // Light Gray-Blue
  var GN  = '#1A6B30'; // Green
  var LGN = '#E6F9EC'; // Light Green
  var YL  = '#FFF3CD'; // Yellow

  // ---- Helpers ----
  function newSlide(bg) {
    var s = prs.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    s.getBackground().setSolidFill(bg);
    return s;
  }
  function box(s, x, y, w, h, bg) {
    var r = s.insertShape(SlidesApp.ShapeType.RECTANGLE, x, y, w, h);
    r.getFill().setSolidFill(bg);
    r.getBorder().setTransparent();
    return r;
  }
  function txt(s, t, x, y, w, h, sz, bold, col, align) {
    var b = s.insertTextBox(t, x, y, w, h);
    b.getText().getTextStyle().setFontSize(sz).setBold(bold).setForegroundColor(col).setFontFamily('Noto Sans Thai');
    b.getText().getParagraphStyle().setParagraphAlignment(align || SlidesApp.ParagraphAlignment.START);
    b.setContentAlignment(SlidesApp.ContentAlignment.TOP);
    b.getBorder().setTransparent();
    b.getFill().setTransparent();
    return b;
  }
  function bul(s, items, x, y, w, h, sz, col) {
    return txt(s, items.map(function(i){ return '\u25B8  '+i; }).join('\n'), x, y, w, h, sz||13, false, col||DG);
  }
  var CA = SlidesApp.ParagraphAlignment.CENTER;
  var SA = SlidesApp.ParagraphAlignment.START;

  var s;

  // ==============================================
  // สไลด์ 1 — ปก
  // ==============================================
  s = newSlide(DBL);
  box(s, 0, 300, 720, 105, BL);
  txt(s, 'ระบบตรวจสอบความปลอดภัย\nเครื่องมือแพทย์', 60, 55, 600, 130, 30, true, WH, CA);
  txt(s, 'Medical Device Safety Alert Monitoring System', 60, 195, 600, 32, 14, false, LBL, CA);
  txt(s, 'คู่มือการใช้งานสำหรับเจ้าหน้าที่โรงพยาบาล', 60, 313, 600, 28, 13, true, WH, CA);
  txt(s, 'NHealth Surveillance Platform  |  Version 2026', 60, 350, 600, 28, 11, false, LBL, CA);

  // ==============================================
  // สไลด์ 2 — ระบบนี้คืออะไร
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'ระบบนี้คืออะไร?', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'ระบบถูกพัฒนาขึ้นเพื่อให้โรงพยาบาลสามารถติดตามข่าวการแจ้งเตือนภัย\nด้านความปลอดภัยของเครื่องมือแพทย์จาก ECRI และ FDA ได้อัตโนมัติ', 25, 68, 670, 65, 13, false, DG, SA);
  var icons2 = [
    [25,  145, '\uD83D\uDD0D ตรวจจับ\nอัตโนมัติ'],
    [198, 145, '\uD83D\uDD17 จับคู่\nครุภัณฑ์'],
    [371, 145, '\u26A0\uFE0F แจ้งเตือน\nเคสเสี่ยง'],
    [544, 145, '\u2705 รับรอง\nความปลอดภัย']
  ];
  icons2.forEach(function(ic){
    box(s, ic[0], ic[1], 158, 90, LBL);
    txt(s, ic[2], ic[0]+8, ic[1]+10, 142, 70, 13, true, DBL, CA);
  });
  txt(s, 'แหล่งข้อมูล: ECRI Alert  \u2502  FDA Recall  \u2502  ฐานข้อมูลครุภัณฑ์โรงพยาบาล', 25, 258, 670, 25, 12, false, BL, CA);
  box(s, 25, 290, 670, 90, LGR);
  bul(s, [
    'ไม่ต้องติดตั้งซอฟต์แวร์ — ทำงานบน Google Workspace ทั้งหมด',
    'รองรับหลายโรงพยาบาลในระบบเดียว',
    'AI วิเคราะห์และจับคู่เครื่องมือแพทย์โดยอัตโนมัติ'
  ], 35, 295, 650, 80, 12, BL);

  // ==============================================
  // สไลด์ 3 — สถาปัตยกรรมระบบ
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'สถาปัตยกรรมระบบ', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'ทำงานบน Google Cloud — ไม่ต้องติดตั้งอะไรเพิ่ม', 25, 66, 670, 25, 12, false, GR, CA);
  var flow3 = [
    [15,  100, 155, 80, '\uD83D\uDCE5 อัปโหลดไฟล์\nECRI / FDA'],
    [195, 100, 155, 80, '\uD83E\uDDE0 AI จับคู่\nครุภัณฑ์'],
    [375, 100, 155, 80, '\uD83D\uDCCA Dashboard\nแสดงผล'],
    [555, 100, 155, 80, '\u2705 เจ้าหน้าที่\nตรวจรับรอง']
  ];
  flow3.forEach(function(f, i){
    box(s, f[0], f[1], f[2], f[3], LBL);
    txt(s, f[4], f[0]+8, f[1]+10, f[2]-16, f[3]-20, 12, true, DBL, CA);
    if (i < 3) txt(s, '\u2192', f[0]+f[2]+2, f[1]+28, 18, 25, 18, true, BL, CA);
  });
  box(s, 15, 200, 710, 60, LGR);
  txt(s, '\uD83D\uDDC4\uFE0F ฐานข้อมูล Google Sheets (Central)', 30, 210, 400, 22, 12, true, DBL, SA);
  txt(s, 'จัดเก็บข้อมูลถาวร — ECRI_Database, FDA_Database, Case_Records, Certification_Log', 30, 234, 680, 22, 11, false, GR, SA);
  box(s, 15, 278, 710, 100, '#F0FFF4');
  bul(s, [
    '\uD83C\uDF10 เข้าถึงผ่าน Web Browser ทุกอุปกรณ์ (PC / Tablet / Mobile)',
    '\uD83D\uDD12 ปลอดภัยด้วย Google Account',
    '\uD83D\uDD04 อัปเดตข้อมูลแบบ Real-time'
  ], 25, 282, 680, 90, 12, GN);

  // ==============================================
  // สไลด์ 4 — บทบาทผู้ใช้
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'บทบาทผู้ใช้งานในระบบ', 25, 10, 670, 42, 22, true, WH, SA);
  box(s, 15, 70, 340, 310, LGR);
  txt(s, '\uD83D\uDEE1\uFE0F ผู้ดูแลระบบส่วนกลาง', 25, 80, 320, 30, 14, true, DBL, SA);
  txt(s, 'Super Admin', 25, 112, 320, 22, 11, false, GR, SA);
  bul(s, [
    'อัปโหลดข้อมูล ECRI / FDA',
    'จัดการรายชื่อโรงพยาบาล',
    'ตั้งค่า API Key สำหรับ AI',
    'ดูภาพรวมทุกสาขา',
    'ตั้งค่าอีเมลรับรายงานประจำวัน'
  ], 25, 138, 320, 165, 12, DG);
  box(s, 365, 70, 340, 310, '#FFF8F0');
  txt(s, '\uD83C\uDFE5 เจ้าหน้าที่สาขา', 375, 80, 320, 30, 14, true, DBL, SA);
  txt(s, 'Branch Staff', 375, 112, 320, 22, 11, false, GR, SA);
  bul(s, [
    'ดูเคสเสี่ยงของโรงพยาบาลตัวเอง',
    'อัปโหลดข้อมูลครุภัณฑ์',
    'ตรวจรับรองและออกใบรับรอง',
    'ดูกราฟสรุปรายเดือน',
    'ดาวน์โหลดรายงาน Excel'
  ], 375, 138, 320, 165, 12, DG);

  // ==============================================
  // สไลด์ 5 — การเข้าสู่ระบบ
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'การเข้าสู่ระบบ', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'ขั้นตอนการเปิดและเข้าใช้งานระบบ', 25, 68, 450, 26, 15, true, DBL, SA);
  bul(s, [
    '1\uFE0F\u20E3  เปิด Browser (Chrome แนะนำ)',
    '2\uFE0F\u20E3  ไปที่ลิงก์ระบบที่ผู้ดูแลระบบแจกให้',
    '3\uFE0F\u20E3  หน้าแรกจะแสดง Dashboard ภาพรวมระบบทันที',
    '4\uFE0F\u20E3  กดเมนูด้านซ้ายเพื่อเปลี่ยนหน้าการทำงาน',
    '5\uFE0F\u20E3  ระบบบันทึกโรงพยาบาลที่เลือกล่าสุดไว้อัตโนมัติ'
  ], 30, 100, 660, 185, 13, DG);
  box(s, 25, 300, 670, 82, YL);
  txt(s, '\uD83D\uDCA1 เคล็ดลับ: ไม่ต้อง Login!', 40, 308, 400, 24, 12, true, '#7A5000', SA);
  txt(s, 'ระบบเปิดใช้งานได้ทันทีผ่านลิงก์ที่ได้รับ\nหากต้องการตั้งค่าพิเศษ ติดต่อผู้ดูแลระบบส่วนกลาง', 40, 332, 640, 45, 11, false, '#7A5000', SA);

  // ==============================================
  // สไลด์ 6 — แถบเมนูหลัก
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'แถบเมนูหลัก (Navigation)', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'ระบบมี 4 เมนูหลัก เลือกได้ตลอดเวลาจากแถบด้านซ้าย', 25, 66, 670, 24, 12, false, GR, CA);
  var mn6 = [
    [15,  98, '\uD83D\uDCCA', 'ภาพรวมระบบ',     'ดูสถิติรวมทุกโรงพยาบาล\nกราฟแนวโน้มและ Activity Log', LGR],
    [193, 98, '\u2699\uFE0F', 'จัดการระบบ',      'อัปโหลด ECRI/FDA\nจัดการโรงพยาบาล + ครุภัณฑ์', '#EFFFEF'],
    [371, 98, '\uD83C\uDFE5', 'งานเฉพาะสาขา',   'ดูเคสเสี่ยงรายสาขา\nตรวจรับรอง + ออกใบรับรอง', '#FFF5EB'],
    [549, 98, '\uD83D\uDCCB', 'คลังข่าวประกาศ', 'ค้นหา/กรอง ECRI-FDA\nดาวน์โหลดรายงาน Excel', '#F5EEFF']
  ];
  mn6.forEach(function(m){
    box(s, m[0], m[1], 163, 215, m[5]);
    txt(s, m[2], m[0]+10, m[1]+15, 143, 38, 26, false, DBL, CA);
    txt(s, m[3], m[0]+10, m[1]+58, 143, 28, 12, true, DBL, CA);
    txt(s, m[4], m[0]+10, m[1]+92, 143, 100, 11, false, GR, CA);
  });
  box(s, 15, 330, 690, 52, LGR);
  txt(s, '\u26A1 Tip: ระบบแสดง Loading Spinner ระหว่างโหลดข้อมูล — รอจนหายไปเองก็พร้อมใช้งาน', 25, 343, 670, 30, 12, false, BL, CA);

  // ==============================================
  // สไลด์ 7 — Dashboard ภาพรวม
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'เมนู ภาพรวมระบบ (Dashboard)', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'ดูสถิติรวมทุกโรงพยาบาลและกราฟแนวโน้มรายเดือน', 25, 66, 670, 24, 12, false, GR, CA);
  var cards7 = [
    [15,  98, '\uD83C\uDFE5 ครุภัณฑ์\nทั้งหมด',    'รวมทุกโรงพยาบาล'],
    [193, 98, '\uD83D\uDCF0 ประกาศข่าว\nทั้งหมด',  'ECRI + FDA รวม'],
    [371, 98, '\u26A0\uFE0F เคสเสี่ยง\nสะสม',      'Matched / Certified'],
    [549, 98, '\uD83D\uDCC5 สถานะ\nวันนี้',         'ผลการประมวลล่าสุด']
  ];
  cards7.forEach(function(c){
    box(s, c[0], c[1], 163, 90, LBL);
    txt(s, c[2], c[0]+10, c[1]+8, 143, 50, 12, true, DBL, CA);
    txt(s, c[3], c[0]+10, c[1]+62, 143, 24, 10, false, GR, CA);
  });
  txt(s, 'กราฟแนวโน้มเคสความเสี่ยงรายเดือน', 15, 206, 450, 24, 13, true, DBL, SA);
  box(s, 15, 232, 690, 110, LGR);
  txt(s, '\uD83D\uDCCA Bar Chart แสดงจำนวนเคสที่พบรายเดือน ย้อนหลัง 12 เดือน\n   \u2022 กดปุ่ม "ปีปฏิทิน / ปีงบประมาณ" เพื่อสลับมุมมอง\n   \u2022 แท่ง ECRI สีน้ำเงิน  \u2502  แท่ง FDA สีส้ม\n   \u2022 แสดง Tooltip เมื่อ hover', 30, 240, 665, 95, 12, false, DG, SA);
  txt(s, '\uD83D\uDC46 คลิกปุ่มชื่อโรงพยาบาลด้านบน เพื่อกรองดูเฉพาะสาขาที่ต้องการ', 15, 355, 690, 30, 12, false, BL, CA);

  // ==============================================
  // สไลด์ 8 — การกรองโรงพยาบาล
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'การกรองข้อมูลตามโรงพยาบาล', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'แถบปุ่มด้านบนช่วยให้กรองดูข้อมูลเฉพาะโรงพยาบาลที่ต้องการ', 25, 66, 670, 24, 12, false, GR, CA);
  // Mock button bar
  box(s, 15, 98, 690, 50, LGR);
  box(s, 23, 107, 120, 32, BL);
  txt(s, 'ภาพรวมทั้งหมด', 25, 112, 116, 24, 11, true, WH, CA);
  box(s, 151, 107, 105, 32, WH);
  txt(s, 'โรงพยาบาล ก', 155, 112, 100, 24, 11, false, DBL, CA);
  box(s, 263, 107, 105, 32, WH);
  txt(s, 'โรงพยาบาล ข', 266, 112, 100, 24, 11, false, DBL, CA);
  box(s, 375, 107, 90, 32, WH);
  txt(s, 'ศูนย์ฯ ค', 378, 112, 85, 24, 11, false, DBL, CA);
  txt(s, '\u2191 ตัวอย่างแถบปุ่มกรองโรงพยาบาล (ปุ่มสีน้ำเงิน = ที่เลือกอยู่)', 15, 153, 690, 22, 10, false, GR, CA);
  bul(s, [
    'กดปุ่มชื่อโรงพยาบาล \u2192 ข้อมูลทั้งหมดในหน้ากรองเฉพาะสาขานั้น',
    'กด "ภาพรวมทั้งหมด" \u2192 กลับมาดูข้อมูลรวมทุกโรงพยาบาล',
    'ปุ่มที่เลือกอยู่แสดงสีน้ำเงินเข้ม — ระบบจำการเลือกไว้ตลอดการใช้งาน',
    'Spinner แสดงระหว่างโหลด รอสักครู่จะหายไปเอง'
  ], 25, 182, 670, 155, 13, DG);
  box(s, 15, 350, 690, 38, LGR);
  txt(s, '\u2B50 แถบนี้ "ปักหมุด" อยู่ด้านบนตลอด แม้เลื่อนหน้าจอลงก็ยังเห็นและกดได้', 25, 360, 670, 24, 12, false, BL, CA);

  // ==============================================
  // สไลด์ 9 — Admin Panel
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'เมนู จัดการระบบ (Admin Panel)', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'สำหรับผู้ดูแลระบบส่วนกลาง — จัดการข้อมูลและตั้งค่า', 25, 66, 670, 24, 12, false, GR, CA);
  var adm9 = [
    [15,  98,  '\uD83D\uDCE5 อัปโหลด ECRI',    'นำเข้าไฟล์ Excel\nข่าว ECRI Alerts', LBL],
    [193, 98,  '\uD83D\uDCE5 อัปโหลด FDA',     'นำเข้าไฟล์ Excel\nFDA Recalls',      LBL],
    [371, 98,  '\uD83C\uDFE5 จัดการสาขา',      'เพิ่ม/แก้ไข\nรายชื่อโรงพยาบาล',    LBL],
    [549, 98,  '\uD83D\uDD11 ตั้งค่า API',     'API Key\nสำหรับ AI Analysis',        LBL],
    [15,  215, '\uD83D\uDCCA สถานะระบบ',       'ดูว่าอัปโหลด\nข้อมูลแล้วหรือยัง',    '#EFFFEF'],
    [193, 215, '\uD83D\uDCCB Activity Log',    'ประวัติการทำงาน\nของระบบทั้งหมด',    '#EFFFEF'],
    [371, 215, '\uD83D\uDCE7 ตั้งค่าอีเมล',   'กำหนดอีเมล\nรับรายงานประจำวัน',     '#EFFFEF'],
    [549, 215, '\uD83D\uDD04 ประมวลผล AI',     'สั่งให้ AI\nประมวลผลทันที',          '#EFFFEF']
  ];
  adm9.forEach(function(a){
    box(s, a[0], a[1], 163, 100, a[4]);
    txt(s, a[2], a[0]+8, a[1]+8, 147, 30, 11, true, DBL, CA);
    txt(s, a[3], a[0]+8, a[1]+42, 147, 50, 10, false, GR, CA);
  });

  // ==============================================
  // สไลด์ 10 — อัปโหลด ECRI
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'การอัปโหลดข้อมูล ECRI Alerts', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'นำเข้าไฟล์ Excel จาก ECRI เพื่ออัปเดตข่าวประกาศเตือนภัยล่าสุด', 25, 66, 670, 24, 12, false, GR, CA);
  bul(s, [
    'ดาวน์โหลดไฟล์ Excel จากเว็บ ECRI ล่าสุด (.xlsx)',
    'เข้าเมนู จัดการระบบ \u2192 กดปุ่ม "อัปโหลด ECRI Alerts"',
    'เลือกไฟล์ .xlsx (ลากวางก็ได้)',
    'รอระบบประมวลผล — จะแจ้งจำนวนรายการที่เพิ่มใหม่',
    'ระบบข้ามรายการซ้ำอัตโนมัติ ไม่ต้องกังวลข้อมูลซ้ำ'
  ], 25, 98, 670, 180, 13, DG);
  box(s, 15, 292, 690, 92, LGN);
  txt(s, '\uD83D\uDCCB โครงสร้างคอลัมน์ไฟล์ ECRI ที่ระบบรับได้:', 28, 298, 500, 22, 11, true, GN, SA);
  txt(s, 'Accession Number  \u2502  Priority  \u2502  Headline  \u2502  Alert Publication Date  \u2502  FDA Class', 28, 320, 665, 22, 10, false, DG, SA);
  txt(s, '\u26A1 รองรับทั้ง .xlsx และ .xls — ระบบแปลงและบันทึกอัตโนมัติ  \u2502  ข้ามรายการที่มีอยู่แล้ว', 28, 348, 665, 30, 10, false, GN, SA);

  // ==============================================
  // สไลด์ 11 — อัปโหลด FDA
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'การอัปโหลดข้อมูล FDA Recalls', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'นำเข้าไฟล์ Excel จาก FDA เพื่ออัปเดตรายการเรียกคืนเครื่องมือแพทย์', 25, 66, 670, 24, 12, false, GR, CA);
  bul(s, [
    'ดาวน์โหลดไฟล์ Excel จาก FDA Recall Database (.xlsx)',
    'เข้าเมนู จัดการระบบ \u2192 กดปุ่ม "อัปโหลด FDA Recalls"',
    'เลือกไฟล์ .xlsx (รองรับ .xls ด้วย)',
    'รอระบบประมวลผล — จะแจ้งจำนวนรายการที่เพิ่มใหม่',
    'สามารถอัปโหลดทั้ง ECRI + FDA ได้อิสระในวันเดียวกัน'
  ], 25, 98, 670, 180, 13, DG);
  box(s, 15, 292, 690, 92, YL);
  txt(s, '\uD83D\uDCCB โครงสร้างคอลัมน์ไฟล์ FDA ที่ระบบรับได้:', 28, 298, 500, 22, 11, true, '#7A5000', SA);
  txt(s, 'RECALL_NUMBER \u2502 PRODUCT_DESCRIPTION \u2502 TRADE_NAME \u2502 RECALL_CLASS \u2502 FIRM_NAME \u2502 ...', 28, 320, 665, 22, 10, false, DG, SA);
  txt(s, '\u26A1 ระบบกรอง Class I / II / III อัตโนมัติ พร้อมบันทึกวันที่ทุกช่อง', 28, 348, 665, 30, 10, false, '#7A5000', SA);

  // ==============================================
  // สไลด์ 12 — จัดการโรงพยาบาล/ครุภัณฑ์
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'จัดการโรงพยาบาลและครุภัณฑ์', 25, 10, 670, 42, 22, true, WH, SA);
  box(s, 10, 68, 345, 300, LGR);
  txt(s, '\uD83C\uDFE5 เพิ่มโรงพยาบาลสาขาใหม่', 20, 76, 325, 28, 13, true, DBL, SA);
  bul(s, [
    'ไปที่เมนู จัดการระบบ',
    'กดปุ่ม "เพิ่มสาขาใหม่"',
    'กรอกชื่อโรงพยาบาล (ภาษาไทย)',
    'กรอกอีเมลติดต่อ (ไม่บังคับ)',
    'กด บันทึก — ชื่อจะปรากฏ\nในแถบปุ่มทันที'
  ], 20, 108, 325, 200, 12, DG);
  box(s, 365, 68, 345, 300, '#FFF5EB');
  txt(s, '\uD83D\uDD27 อัปโหลดครุภัณฑ์สาขา', 375, 76, 325, 28, 13, true, DBL, SA);
  bul(s, [
    'เข้าเมนู งานเฉพาะสาขา',
    'เลือกชื่อโรงพยาบาล',
    'กด "อัปโหลดข้อมูลครุภัณฑ์"',
    'เลือกไฟล์ Excel ที่มีคอลัมน์\nยี่ห้อ / รุ่น / หมายเลขครุภัณฑ์',
    'รอระบบบันทึก'
  ], 375, 108, 325, 200, 12, DG);
  box(s, 10, 380, 700, 15, '#FF8027');
  txt(s, '\u26A0\uFE0F อัปโหลดครุภัณฑ์ให้ครบก่อน แล้วค่อยอัปโหลด ECRI/FDA เพื่อให้การจับคู่แม่นยำ', 10, 382, 700, 22, 11, true, OR, CA);

  // ==============================================
  // สไลด์ 13 — งานเฉพาะสาขา
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'เมนู งานเฉพาะสาขา (Branch Portal)', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'หัวใจหลักของระบบ — ดูและจัดการเคสเสี่ยงของโรงพยาบาลสาขา', 25, 66, 670, 24, 12, false, GR, CA);
  bul(s, [
    'เลือกชื่อโรงพยาบาลจากปุ่มด้านบน',
    'ระบบโหลดเคสเสี่ยงทั้งหมดของสาขานั้นมาแสดงในตาราง',
    'ตารางแสดง: รหัสเครื่อง \u2502 ยี่ห้อ/รุ่น \u2502 แผนก \u2502 แหล่งข่าว \u2502 หัวข้อ \u2502 AI Analysis \u2502 สถานะ',
    'รหัสเครื่องมือ = รหัสครุภัณฑ์ที่อัปโหลดไว้',
    'กราฟสรุปรายเดือน (ECRI + FDA) อยู่ด้านล่างตาราง'
  ], 25, 98, 670, 170, 13, DG);
  box(s, 15, 282, 690, 100, LBL);
  txt(s, '\uD83D\uDCCA กราฟสรุปเคสประจำเดือน (ด้านล่างตาราง)', 28, 290, 500, 22, 12, true, DBL, SA);
  bul(s, [
    'แสดงจำนวนเคส ECRI (High/Normal/Critical) และ FDA (Level 1/2/3)',
    'แบ่งเป็น 3 ช่วง/เดือน: 1–10  \u2502  11–20  \u2502  21–สิ้นเดือน'
  ], 28, 315, 665, 62, 12, DBL);

  // ==============================================
  // สไลด์ 14 — ตารางเคสเสี่ยง
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'การอ่านตารางเคสเสี่ยง', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'แสดงเฉพาะเคสที่ AI ตรวจพบว่ามีความเสี่ยงสูง', 25, 66, 670, 24, 12, false, GR, CA);
  // Header
  var cw14 = [88, 92, 68, 52, 120, 118, 78];
  var ch14 = ['รหัสเครื่อง', 'ยี่ห้อ/รุ่น', 'แผนก', 'แหล่ง', 'หัวข้อประกาศ', 'AI Analysis', 'สถานะ'];
  var cx14 = 8;
  ch14.forEach(function(c, i){
    box(s, cx14, 98, cw14[i], 30, BL);
    txt(s, c, cx14+3, 101, cw14[i]-6, 26, 9, true, WH, CA);
    cx14 += cw14[i]+2;
  });
  // Row 1
  var r114 = ['BH-0123\n(เครื่อง A)', 'Philips\nHD-450', 'ICU', 'ECRI', 'Philips Alert:\nBattery Risk', 'ความเสี่ยงสูง:\nตรงยี่ห้อ+รุ่น', '\u26A0\uFE0F รอตรวจ'];
  cx14 = 8;
  r114.forEach(function(c, i){
    box(s, cx14, 130, cw14[i], 48, '#FFF5EB');
    txt(s, c, cx14+3, 133, cw14[i]-6, 44, 9, false, DG, CA);
    cx14 += cw14[i]+2;
  });
  // Row 2
  var r214 = ['BH-0456\n(เครื่อง B)', 'GE\nMRI-900', 'Radiology', 'FDA', 'FDA Recall:\nSoftware Bug', 'ตรงยี่ห้อ:\nควรตรวจสอบ', '\u2705 รับรองแล้ว'];
  cx14 = 8;
  r214.forEach(function(c, i){
    box(s, cx14, 180, cw14[i], 48, LBL);
    txt(s, c, cx14+3, 183, cw14[i]-6, 44, 9, false, DG, CA);
    cx14 += cw14[i]+2;
  });
  txt(s, '\uD83D\uDCA1 กดที่ช่อง AI Analysis เพื่อเปิดอ่านฉบับเต็มในหน้าต่าง Popup', 15, 240, 690, 24, 11, false, BL, CA);
  box(s, 15, 272, 690, 55, LGR);
  txt(s, 'สีแถว: \u26A0\uFE0F สีส้ม = รอตรวจ   \u2705 สีเขียว = รับรองแล้ว (ล็อคแก้ไข)\nปุ่มรับรองหายไปหลังรับรองเสร็จ เหลือแต่ badge สีเขียว', 28, 278, 665, 45, 12, false, DG, SA);
  txt(s, 'แสดงผลทีละ 50 รายการ มีปุ่มแบ่งหน้า', 15, 336, 690, 52, 12, false, BL, CA);

  // ==============================================
  // สไลด์ 15 — AI Analysis
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'การอ่านผล AI Analysis', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'AI วิเคราะห์ความเสี่ยงและเสนอแนวทางแก้ไขสำหรับแต่ละเคส', 25, 66, 670, 24, 12, false, GR, CA);
  box(s, 15, 98, 690, 195, LGR);
  txt(s, 'ตัวอย่างผล AI Analysis (เปิดด้วยการคลิกช่องนั้น):', 28, 105, 500, 22, 11, true, DBL, SA);
  txt(s,
    '"เครื่องมือ Philips HD-450 SN: BH-0123 ตรงกับ ECRI Alert A46089\n' +
    'โดยยี่ห้อและรุ่นตรงกันทุกประการ แนะนำให้ดำเนินการดังนี้:\n' +
    '1. หยุดใช้งานเครื่องทันทีหากพบอาการที่ระบุในประกาศ\n' +
    '2. ติดต่อตัวแทน Philips เพื่อขอ Firmware Update\n' +
    '3. บันทึกผลการตรวจสอบในระบบเพื่อความปลอดภัย"',
    28, 130, 665, 155, 11, false, DG, SA);
  txt(s, 'วิธีเปิดอ่าน:', 15, 305, 200, 22, 13, true, DBL, SA);
  bul(s, [
    'คลิกที่ช่อง AI Analysis \u2192 Popup เปิดแสดงข้อความเต็ม',
    'กด "ปิดหน้าต่าง" เพื่อกลับสู่ตาราง'
  ], 15, 328, 690, 60, 13, DG);

  // ==============================================
  // สไลด์ 16 — ตรวจรับรองเคส
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'ขั้นตอนการตรวจรับรองเคส', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'บันทึกผลการตรวจสอบเพื่อความโปร่งใสและติดตามได้', 25, 66, 670, 24, 12, false, GR, CA);
  bul(s, [
    'กดปุ่ม \u26A0\uFE0F "ตรวจรับรอง" ในแถวเคสที่ต้องการ',
    'Popup เปิดขึ้น — กรอกข้อมูล:',
    '    \u2022 ชื่อผู้รับรอง (ผู้ตรวจสอบ)',
    '    \u2022 ผลการตรวจ: จริง / ไม่จริง / รอดำเนินการ',
    '    \u2022 ข้อสังเกตเพิ่มเติม (ไม่บังคับ)',
    'กดปุ่ม "บันทึกใบรับรองความปลอดภัย" — รอ Spinner หายไป',
    'เคสเปลี่ยนเป็น \u2705 รับรองแล้ว ทันที และล็อคไม่ให้แก้ไข'
  ], 25, 98, 670, 215, 13, DG);
  box(s, 15, 325, 690, 62, LGN);
  txt(s, '\u2705 หลังบันทึกสำเร็จ:', 28, 332, 300, 22, 12, true, GN, SA);
  txt(s, 'แถวเปลี่ยนเป็นสีเขียว \u2502 ล็อคการแก้ไข \u2502 บันทึกชื่อผู้รับรอง+วันเวลาลงฐานข้อมูลกลาง', 28, 355, 665, 28, 11, false, GN, SA);

  // ==============================================
  // สไลด์ 17 — คลังข่าวประกาศ
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'เมนู คลังข่าวประกาศ (Alerts DB)', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'ดูและค้นหาประกาศ ECRI + FDA ทั้งหมดที่อยู่ในระบบ', 25, 66, 670, 24, 12, false, GR, CA);
  bul(s, [
    'ตารางรวมประกาศทั้งหมดจาก ECRI และ FDA',
    'คอลัมน์: เลขประกาศ \u2502 แหล่งข้อมูล \u2502 วันประกาศ \u2502 ประเภท \u2502 หัวข้อ \u2502 วันเข้าระบบ',
    'แสดงผล 20 รายการต่อหน้า มีปุ่มแบ่งหน้า'
  ], 25, 98, 670, 110, 13, DG);
  box(s, 15, 220, 690, 105, LBL);
  txt(s, '\uD83D\uDD0D วิธีค้นหาและกรอง:', 28, 228, 400, 22, 13, true, DBL, SA);
  bul(s, [
    'พิมพ์คำค้นในช่อง Search \u2192 กด Enter',
    'เลือกเดือนในช่องวันที่ เพื่อดูเฉพาะช่วงเวลา',
    'กด "แสดงทั้งหมด" เพื่อล้างตัวกรอง'
  ], 28, 253, 665, 68, 12, DBL);
  box(s, 15, 338, 690, 50, YL);
  txt(s, '\uD83D\uDCA1 ใช้ฟีเจอร์นี้เพื่อตรวจสอบว่ามีประกาศเกี่ยวกับเครื่องมือใดก่อนตัดสินใจซื้อใหม่', 28, 350, 665, 30, 12, false, '#7A5000', CA);

  // ==============================================
  // สไลด์ 18 — ดาวน์โหลด Excel
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'การดาวน์โหลดรายงาน Excel (.xlsx)', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'ส่งออกข้อมูลเป็นไฟล์ Excel แยก Sheet ECRI และ FDA', 25, 66, 670, 24, 12, false, GR, CA);
  bul(s, [
    'กดปุ่ม "ดาวน์โหลดรายงานประจำเดือน (.xlsx)" ในเมนูคลังข่าว',
    'Popup เปิดขึ้น:',
    '    \u2022 ติ๊กเลือก ECRI และ/หรือ FDA ตามต้องการ',
    '    \u2022 ติ๊กเลือกเดือนที่ต้องการ (เลือกได้หลายเดือน)',
    '    \u2022 กด "เลือกทั้งหมด" เพื่อติ๊กทุกเดือนพร้อมกัน',
    'กด "เริ่มดาวน์โหลดไฟล์ Excel (.xlsx)" — รอสักครู่',
    'ไฟล์มี 2 Sheet: "ECRI Alerts" และ "FDA Recalls" แยกกัน'
  ], 25, 98, 670, 205, 13, DG);
  box(s, 15, 316, 690, 72, LGN);
  txt(s, '\uD83D\uDCCA คอลัมน์ตรงกับไฟล์ต้นฉบับ 100%:', 28, 323, 400, 22, 11, true, GN, SA);
  txt(s, 'ECRI: Accession Number \u2502 Priority \u2502 Headline \u2502 Date \u2502 FDA Class', 28, 346, 665, 20, 10, false, DG, SA);
  txt(s, 'FDA: RECALL_NUMBER \u2502 PRODUCT_DESCRIPTION \u2502 TRADE_NAME \u2502 RECALL_CLASS \u2502 FIRM_NAME \u2502 ...', 28, 368, 665, 20, 10, false, DG, SA);

  // ==============================================
  // สไลด์ 19 — ปัญหาที่พบบ่อย
  // ==============================================
  s = newSlide(WH);
  box(s, 0, 0, 720, 58, DBL);
  txt(s, 'ปัญหาที่พบบ่อยและวิธีแก้ไข', 25, 10, 670, 42, 22, true, WH, SA);
  var prb19 = [
    ['อัปโหลดไฟล์แล้วแจ้งว่า 0 รายการ', 'ตรวจสอบคอลัมน์ไฟล์ให้ถูกต้อง\nไฟล์ที่อัปโหลดซ้ำจะถูกข้าม'],
    ['ไม่เห็นเคสเสี่ยงในสาขา',          'ตรวจสอบว่าอัปโหลดครุภัณฑ์แล้ว\nกดรัน AI ประมวลผลใหม่'],
    ['ปุ่มบันทึกค้างนาน',               'ปกติ — กำลังบันทึกลงคลาวด์\nรอ Spinner หายเองอย่าปิดหน้า'],
    ['ตัวกรองรีเซ็ตหลังรีเฟรช',        'เปิด Browser ใหม่และไปที่ลิงก์เดิม\nระบบจำโรงพยาบาลล่าสุดไว้']
  ];
  prb19.forEach(function(p, i){
    var yy = 72 + i*78;
    box(s, 8, yy, 345, 68, '#FFF0EC');
    box(s, 363, yy, 345, 68, '#ECFFF2');
    txt(s, '\u2753 ' + p[0], 18, yy+8, 328, 52, 11, true, OR, SA);
    txt(s, '\u2705 ' + p[1], 373, yy+8, 328, 52, 11, false, GN, SA);
  });

  // ==============================================
  // สไลด์ 20 — สรุปและ Best Practices
  // ==============================================
  s = newSlide(DBL);
  box(s, 0, 0, 720, 58, BL);
  txt(s, 'สรุปแนวทางปฏิบัติที่ดีที่สุด', 25, 10, 670, 42, 22, true, WH, SA);
  txt(s, 'Routine ที่แนะนำสำหรับเจ้าหน้าที่ทุกระดับ', 25, 66, 670, 28, 13, false, LBL, CA);
  var sum20 = [
    '\uD83D\uDCC5 รายสัปดาห์: อัปโหลดไฟล์ ECRI และ FDA ใหม่จากเว็บ',
    '\uD83D\uDD0D รายสัปดาห์: ตรวจสอบและรับรองเคสเสี่ยงใหม่ให้ครบ',
    '\uD83C\uDFE5 รายสาขา: อัปโหลดรายการครุภัณฑ์ให้อัปเดตอยู่เสมอ',
    '\uD83D\uDCCA รายเดือน: ดาวน์โหลดรายงาน Excel เก็บเป็นหลักฐาน',
    '\u2699\uFE0F เมื่อมีครุภัณฑ์ใหม่: เพิ่มรายการแล้วรัน AI ประมวลผลใหม่'
  ];
  bul(s, sum20, 30, 105, 660, 182, 14, LBL);
  box(s, 20, 302, 680, 82, BL);
  txt(s, '\uD83C\uDF89 ขอบคุณที่ใช้งานระบบ NHealth Medical Device Safety Monitoring\nหากมีข้อสงสัยหรือปัญหา ติดต่อผู้ดูแลระบบส่วนกลางได้ตลอดเวลา', 35, 315, 650, 60, 13, true, WH, CA);

  var url = prs.getUrl();
  logSystemActivity('สร้าง Google Slides คู่มือ 20 สไลด์สำเร็จ', 'Slides', 20, 'Success');
  return url;
}
// ===================================================================
// 25. ระบบติดตามสถานะการดำเนินงาน (Tracking Operations)
// ===================================================================

function getTrackingCases(hospitalFilter) {
  initDatabaseSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const matchSheet = ss.getSheetByName('Matched_Alerts_Database');
  const lastRow = matchSheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  const values = matchSheet.getRange(2, 1, lastRow - 1, 20).getValues();
  const results = [];
  
  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][14]).trim();
    const hosp = String(values[i][0]).trim();
    
    if (status === 'จริง' || status === 'รับรองแล้ว') {
      if (hospitalFilter && hospitalFilter !== 'ทั้งหมด' && hosp !== hospitalFilter) {
        continue;
      }
      
      let actions = [];
      try {
        if (values[i][18]) {
          actions = JSON.parse(values[i][18]);
        }
      } catch (e) {
        actions = [];
      }
      
      if (actions.length === 0) {
        const certName = String(values[i][15]);
        const certDate = String(values[i][16]);
        actions.push({
          actionId: 1,
          detail: 'เจ้าหน้าที่ตรวจรับรองความเสี่ยงแล้ว (ชื่อ: ' + certName + ')',
          date: certDate,
          isFinal: false
        });
      }
      
      results.push({
        hospitalName: hosp,
        deviceCode: String(values[i][1]),
        deviceBrandModel: String(values[i][3]) + ' / ' + String(values[i][4]),
        department: String(values[i][5]),
        alertId: String(values[i][7]),
        alertSource: String(values[i][6]),
        alertHeadline: String(values[i][8]),
        riskLevel: String(values[i][10]),
        certifyName: String(values[i][15]),
        trackingStatus: String(values[i][19]) || 'กำลังดำเนินการ',
        actions: actions
      });
    }
  }
  
  return results.reverse();
}

function addTrackingAction(hospitalName, deviceCode, alertId, newActionDetail, newActionDate, isFinal) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const matchSheet = ss.getSheetByName('Matched_Alerts_Database');
    const lastRow = matchSheet.getLastRow();
    
    if (lastRow <= 1) return { success: false, message: 'ไม่พบข้อมูลฐานข้อมูล' };
    
    const values = matchSheet.getRange(2, 1, lastRow - 1, 8).getValues();
    let foundRow = -1;
    
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim() === hospitalName.trim() &&
          String(values[i][1]).trim() === deviceCode.trim() &&
          String(values[i][7]).trim() === alertId.trim()) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) return { success: false, message: 'ไม่พบเคสที่ต้องการอัปเดต' };
    
    const historyCell = matchSheet.getRange(foundRow, 19);
    const statusCell = matchSheet.getRange(foundRow, 20);
    
    let actions = [];
    try {
      if (historyCell.getValue()) {
        actions = JSON.parse(historyCell.getValue());
      }
    } catch(e) {}
    
    if (actions.length === 0) {
       const certInfo = matchSheet.getRange(foundRow, 15, 1, 3).getValues()[0];
       actions.push({
         actionId: 1,
         detail: 'เจ้าหน้าที่ตรวจรับรองความเสี่ยงแล้ว (ชื่อ: ' + certInfo[1] + ')',
         date: String(certInfo[2]),
         isFinal: false
       });
    }
    
    actions.push({
      actionId: actions.length + 1,
      detail: newActionDetail,
      date: newActionDate,
      isFinal: isFinal
    });
    
    historyCell.setValue(JSON.stringify(actions));
    
    if (isFinal) {
      statusCell.setValue('เสร็จสิ้น');
    } else {
      statusCell.setValue('กำลังดำเนินการ');
    }
    
    logSystemActivity('เพิ่ม Action ใหม่ให้กับเคส ' + alertId + ' รหัสเครื่อง ' + deviceCode, 'Tracking', 1, 'Success');
    return { success: true, message: 'บันทึกการดำเนินการเรียบร้อยแล้ว' };
    
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}
