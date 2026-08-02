// API Client for Google Apps Script Web App Backend

const DEFAULT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

export const getApiUrl = () => {
  return localStorage.getItem('APPS_SCRIPT_URL') || DEFAULT_URL;
};

export const setApiUrl = (url) => {
  if (url) {
    localStorage.setItem('APPS_SCRIPT_URL', url.trim());
  } else {
    localStorage.removeItem('APPS_SCRIPT_URL');
  }
};

/**
 * Universal callApi dispatcher
 * Handles both GET and POST requests cleanly, bypassing CORS preflight restrictions by using text/plain payload
 */
export async function callApi(action, payload = {}) {
  const url = getApiUrl();
  
  if (!url) {
    console.warn(`[API] Web App URL not set. Calling '${action}' in mock/preview mode.`);
    return getMockResponse(action, payload);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action,
        ...payload,
      }),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[API] Error calling '${action}':`, error);
    throw error;
  }
}

// Convenient action wrappers
export const api = {
  getDashboardStats: (mode, selectedYear, hospitalName) => 
    callApi('getDashboardStats', { mode, selectedYear, hospitalName }),
    
  getHospitalsMap: () => 
    callApi('getHospitalsMap'),
    
  addHospitalToList: (name, email) => 
    callApi('addHospitalToList', { name, email }),
    
  saveAlertsToDatabase: (fileData, type) => 
    callApi('saveAlertsToDatabase', { fileData, type }),
    
  saveDevicesToDatabase: (fileData, hospitalName) => 
    callApi('saveDevicesToDatabase', { fileData, hospitalName }),
    
  getBranchMonthlyStats: (hospitalName, filterMonth) => 
    callApi('getBranchMonthlyStats', { hospitalName, filterMonth }),
    
  getMatchedAlertsForHospital: (hospitalName) => 
    callApi('getMatchedAlertsForHospital', { hospitalName }),
    
  certifyMatchedAlert: (hospitalName, deviceCode, alertId, certName, comment, certifyResult) => 
    callApi('certifyMatchedAlert', { hospitalName, deviceCode, alertId, certName, comment, certifyResult }),
    
  getAlertsFromDatabase: (filterMonth) => 
    callApi('getAlertsFromDatabase', { filterMonth }),
    
  getAvailableDatabaseMonths: () => 
    callApi('getAvailableDatabaseMonths'),
    
  getExportAlertsExcel: (monthsList, sourcesList) => 
    callApi('getExportAlertsExcel', { monthsList, sourcesList }),
    
  getAdminEmailSettings: () => 
    callApi('getAdminEmailSettings'),
    
  saveAdminEmailSettings: (email) => 
    callApi('saveAdminEmailSettings', { email }),
    
  getGeminiApiKeySettings: () => 
    callApi('getGeminiApiKeySettings'),
    
  saveGeminiApiKey: (key) => 
    callApi('saveGeminiApiKey', { key }),
    
  testAdminUploadConnection: () => 
    callApi('testAdminUploadConnection'),
    
  getRecentSystemActivities: () => 
    callApi('getRecentSystemActivities'),
    
  getProcessedDates: () => 
    callApi('getProcessedDates'),
    
  runMatchingJobForDate: (dateStr) => 
    callApi('runMatchingJobForDate', { dateStr }),
    
  runMatchingJobForAllUnprocessed: () => 
    callApi('runMatchingJobForAllUnprocessed'),
    
  getTrackingCases: (hospitalFilter) => 
    callApi('getTrackingCases', { hospitalFilter }),
    
  addTrackingAction: (hospitalName, deviceCode, alertId, newActionDetail, newActionDate, isFinal) => 
    callApi('addTrackingAction', { hospitalName, deviceCode, alertId, newActionDetail, newActionDate, isFinal }),
    
  createProjectPresentation: () => 
    callApi('createProjectPresentation'),
    
  getPersistentAIAnalysis: (brand, model, alertId) => 
    callApi('getPersistentAIAnalysis', { brand, model, alertId }),
};

/**
 * Fallback Mock Data generator for local preview / initial deployment before Web App URL is connected
 */
function getMockResponse(action, payload) {
  return new Promise((resolve) => {
    setTimeout(() => {
      switch (action) {
        case 'getHospitalsMap':
          resolve([
            { name: 'โรงพยาบาลกรุงเทพ', email: 'bgh@nhealth.co.th', lastUploadTime: '2026-07-28 14:30:00' },
            { name: 'โรงพยาบาลสมิติเวช สุขุมวิท', email: 'svh@nhealth.co.th', lastUploadTime: '2026-07-29 10:15:00' },
            { name: 'โรงพยาบาลพญาไท 2', email: 'pyt2@nhealth.co.th', lastUploadTime: '2026-07-30 09:00:00' }
          ]);
          break;
        case 'getDashboardStats':
          resolve({
            totalDevices: 12450,
            totalAlerts: 842,
            totalCertified: 18,
            totalMatched: 24,
            ecriCount: 520,
            fdaCount: 322,
            minEcriDate: '01-01-2026',
            maxEcriDate: '30-07-2026',
            minFdaDate: '01-01-2026',
            maxFdaDate: '30-07-2026',
            devicesDetail: [
              { hospital: 'โรงพยาบาลกรุงเทพ', count: 5200, lastUpdate: '2026-07-28' },
              { hospital: 'โรงพยาบาลสมิติเวช สุขุมวิท', count: 4100, lastUpdate: '2026-07-29' },
              { hospital: 'โรงพยาบาลพญาไท 2', count: 3150, lastUpdate: '2026-07-30' }
            ],
            certifiedDetail: [
              { hospital: 'โรงพยาบาลกรุงเทพ', certified: 8, matched: 10 },
              { hospital: 'โรงพยาบาลสมิติเวช สุขุมวิท', certified: 6, matched: 8 },
              { hospital: 'โรงพยาบาลพญาไท 2', certified: 4, matched: 6 }
            ],
            months: [
              { label: 'ม.ค. 69', key: '2026-01' },
              { label: 'ก.พ. 69', key: '2026-02' },
              { label: 'มี.ค. 69', key: '2026-03' },
              { label: 'เม.ย. 69', key: '2026-04' },
              { label: 'พ.ค. 69', key: '2026-05' },
              { label: 'มิ.ย. 69', key: '2026-06' },
              { label: 'ก.ค. 69', key: '2026-07' }
            ],
            totalCounts: {
              '2026-01': { matched: 3, certified: 3 },
              '2026-02': { matched: 4, certified: 4 },
              '2026-03': { matched: 2, certified: 2 },
              '2026-04': { matched: 5, certified: 4 },
              '2026-05': { matched: 3, certified: 2 },
              '2026-06': { matched: 4, certified: 3 },
              '2026-07': { matched: 3, certified: 0 }
            }
          });
          break;
        case 'getRecentSystemActivities':
          resolve([
            { activity: 'นำเข้าประกาศคลังข่าว FDA ผ่านไฟล์ Excel', type: 'Excel Ingest', count: 12, time: '2026-07-30 11:20', status: 'Success' },
            { activity: 'ประมวลผลจับคู่ความเสี่ยงประจำวัน (Daily Matching)', type: 'AI Matching', count: 3, time: '2026-07-30 08:00', status: 'Success' }
          ]);
          break;
        case 'getProcessedDates':
          resolve(['2026-07-28', '2026-07-29', '2026-07-30']);
          break;
        case 'getAvailableDatabaseMonths':
          resolve(['2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01']);
          break;
        case 'getAdminEmailSettings':
          resolve('admin@nhealth.co.th');
          break;
        case 'getGeminiApiKeySettings':
          resolve('sk-or-v1-xxxxxxxxxxxxxxxx');
          break;
        case 'getTrackingCases':
          resolve([]);
          break;
        case 'getMatchedAlertsForHospital':
          resolve([]);
          break;
        case 'getAlertsFromDatabase':
          resolve([]);
          break;
        default:
          resolve({ success: true, message: 'Mock response executed successfully.' });
      }
    }, 400);
  });
}
