import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { 
  AiAnalysisModal, 
  ActionModal, 
  ExportModal, 
  ApiSettingsModal 
} from './components/Modals';
import { api } from './api_firebase';
import DataMigration from './DataMigration';

// Lazy-loaded tabs — โหลดเฉพาะ tab ที่ user เปิดใช้
const DashboardTab = lazy(() => import('./components/DashboardTab'));
const AdminTab = lazy(() => import('./components/AdminTab'));
const BranchTab = lazy(() => import('./components/BranchTab'));
const AlertsTab = lazy(() => import('./components/AlertsTab'));
const TrackingTab = lazy(() => import('./components/TrackingTab'));
const ExportYearlyTab = lazy(() => import('./components/ExportYearlyTab'));

const TabFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const LoginScreen = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === 'CES-ADMIN') {
      onLogin();
    } else {
      setError('รหัสผ่านไม่ถูกต้อง');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-sky-100 via-sky-50 to-white">
      <div className="max-w-md w-full mx-4 bg-white p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800">ระบบจัดการข้อมูล</h2>
          <p className="text-slate-500 mt-2">ECRI & FDA Check</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="กรุณาใส่รหัสผ่าน"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mt-2 font-medium">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
          >
            เข้าสู่ระบบ
          </button>
        </form>
        <div className="mt-6 text-center">
          <button 
            type="button" 
            onClick={() => window.location.hash = '#migrate'} 
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            เปิดเครื่องมือย้ายข้อมูล (Migration)
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [isMigrating, setIsMigrating] = useState(() => window.location.hash === '#migrate');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('AUTH_PASSED') === 'true';
  });
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  
  // Instant Cache initialization (0ms initial load!)
  const [hospitals, setHospitals] = useState(() => {
    try {
      const saved = localStorage.getItem('HOSPITALS_CACHE');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedBranch, setSelectedBranch] = useState(() => {
    try {
      const saved = localStorage.getItem('LAST_SELECTED_BRANCH');
      return saved || '';
    } catch {
      return '';
    }
  });

  // Modals state
  const [aiModalItem, setAiModalItem] = useState(null);
  const [actionModalData, setActionModalData] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);

  const loadHospitals = async (force = false) => {
    try {
      const list = await api.getHospitalsMap({ forceRefresh: force });
      if (Array.isArray(list) && list.length > 0) {
        setHospitals(list);
        localStorage.setItem('HOSPITALS_CACHE', JSON.stringify(list));
        if (!selectedBranch) {
          setSelectedBranch(list[0].name);
          localStorage.setItem('LAST_SELECTED_BRANCH', list[0].name);
        }
      }
    } catch (err) {
      console.error("Error loading hospitals:", err);
    }
  };

  useEffect(() => {
    const handleHashChange = () => setIsMigrating(window.location.hash === '#migrate');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    loadHospitals();
  }, []);

  const handleSelectBranch = (branchName) => {
    setSelectedBranch(branchName);
    localStorage.setItem('LAST_SELECTED_BRANCH', branchName);
  };

  if (isMigrating) {
    return <DataMigration onComplete={() => window.location.hash = ''} />;
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen 
        onLogin={() => {
          sessionStorage.setItem('AUTH_PASSED', 'true');
          setIsAuthenticated(true);
        }} 
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-tr from-sky-100 via-sky-50 to-white text-slate-800">
      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setTab={setCurrentTab}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-6 lg:p-8 overflow-y-auto max-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Top Header */}
          <Header
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            onOpenApiSettings={() => setApiSettingsOpen(true)}
          />

          {/* Active Tab View — Lazy Loaded */}
          <Suspense fallback={<TabFallback />}>
            {currentTab === 'dashboard' && (
              <DashboardTab
                hospitals={hospitals}
                onSelectHospital={(hospName) => {
                  handleSelectBranch(hospName);
                  setCurrentTab('branch');
                }}
              />
            )}

            {currentTab === 'admin' && (
              <AdminTab
                hospitals={hospitals}
                onReloadHospitals={() => loadHospitals(true)}
              />
            )}

            {currentTab === 'branch' && (
              <BranchTab
                hospitals={hospitals}
                selectedBranch={selectedBranch}
                setSelectedBranch={handleSelectBranch}
                onOpenAiModal={(item) => setAiModalItem(item)}
                onOpenActionModal={(item, hosp, cb) => setActionModalData({ item, hosp, cb })}
              />
            )}

            {currentTab === 'alerts' && (
              <AlertsTab
                onOpenExportModal={() => setExportModalOpen(true)}
              />
            )}

            {currentTab === 'tracking' && (
              <TrackingTab
                hospitals={hospitals}
                onOpenActionModal={(item, hosp, cb) => setActionModalData({ item, hosp, cb })}
              />
            )}

            {currentTab === 'export-yearly' && (
              <ExportYearlyTab
                hospitals={hospitals}
              />
            )}
          </Suspense>
        </div>
      </main>

      {/* Popups & Modals */}
      {aiModalItem && (
        <AiAnalysisModal
          item={aiModalItem}
          onClose={() => setAiModalItem(null)}
        />
      )}

      {actionModalData && (
        <ActionModal
          item={actionModalData.item}
          hospitalName={actionModalData.hosp}
          onClose={() => setActionModalData(null)}
          onSuccess={() => {
            if (actionModalData.cb) actionModalData.cb();
          }}
          onNavigateToTracking={() => setCurrentTab('tracking')}
        />
      )}

      {exportModalOpen && (
        <ExportModal
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {apiSettingsOpen && (
        <ApiSettingsModal
          onClose={() => setApiSettingsOpen(false)}
        />
      )}
    </div>
  );
}
