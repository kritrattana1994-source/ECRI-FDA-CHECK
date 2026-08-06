import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { 
  AiAnalysisModal, 
  ActionModal, 
  ExportModal, 
  ApiSettingsModal 
} from './components/Modals';
import { api } from './api';

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

export default function App() {
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
    loadHospitals();
  }, []);

  const handleSelectBranch = (branchName) => {
    setSelectedBranch(branchName);
    localStorage.setItem('LAST_SELECTED_BRANCH', branchName);
  };

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
