// API Client for Google Apps Script Web App Backend

const DEFAULT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbybXewXEiq_Bw4J07uIu8RbWccdkxNaNhAwebpc_JpsCvCFjV3K8c6ZUvTXaxfk8sYizg/exec';

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
 * Performs GET for read queries (optimal with Google Apps Script 302 redirects)
 * and POST for mutations / file uploads.
 */
export async function callApi(action, payload = {}) {
  const url = getApiUrl();
  
  if (!url) {
    console.warn(`[API] Web App URL not configured. Action: ${action}`);
    return null;
  }

  // Determine method: read operations use GET
  const readActions = [
    'getDashboardStats',
    'getHospitalsMap',
    'getBranchMonthlyStats',
    'getMatchedAlertsForHospital',
    'getAlertsFromDatabase',
    'getAvailableDatabaseMonths',
    'getAdminEmailSettings',
    'getGeminiApiKeySettings',
    'testAdminUploadConnection',
    'getRecentSystemActivities',
    'getProcessedDates',
    'getTrackingCases',
    'getPersistentAIAnalysis',
    'getExportAlertsExcel'
  ];

  const isRead = readActions.includes(action) && (!payload.fileData);

  try {
    let response;

    if (isRead) {
      const params = new URLSearchParams({ action, ...payload });
      const separator = url.includes('?') ? '&' : '?';
      response = await fetch(`${url}${separator}${params.toString()}`, {
        method: 'GET',
        redirect: 'follow',
      });
    } else {
      // POST mutation using text/plain to prevent CORS preflight OPTIONS failure
      response = await fetch(url, {
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
    }

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[API] Error executing '${action}':`, error);
    throw error;
  }
}

// Convenient action wrappers
export const api = {
  getDashboardStats: (mode = 'calendar', selectedYear = 2026, hospitalName = 'all', forceRefresh = false) => 
    callApi('getDashboardStats', { mode, selectedYear, hospitalName, forceRefresh }),
    
  getHospitalsMap: (options = {}) => 
    callApi('getHospitalsMap', options),
    
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
