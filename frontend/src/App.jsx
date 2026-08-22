import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { 
  AiAnalysisModal, 
  ActionModal,
  BranchCertifyModal,
  ExportModal, 
  ApiSettingsModal,
  DeviceListModal
} from './components/Modals';
import { api } from './api_firebase';

// Lazy-loaded tabs — โหลดเฉพาะ tab ที่ user เปิดใช้
const DashboardTab = lazy(() => import('./components/DashboardTab'));
const AdminTab = lazy(() => import('./components/AdminTab'));
const BranchTab = lazy(() => import('./components/BranchTab'));
const AlertsTab = lazy(() => import('./components/AlertsTab'));
const TrackingTab = lazy(() => import('./components/TrackingTab'));
const ExportYearlyTab = lazy(() => import('./components/ExportYearlyTab'));
const ManualCheckTab = lazy(() => import('./components/ManualCheckTab'));

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
    if (password === '465321' || password === 'CES-ADMIN') {
      onLogin();
    } else {
      setError('รหัสผ่านไม่ถูกต้อง');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
      </div>
    </div>
  );
};

const GroupSelectionScreen = ({ onSelectGroup }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100 text-center">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">เลือกกลุ่มเครือข่าย</h2>
        <p className="text-slate-500 mb-10 text-lg">กรุณาเลือกกลุ่มของโรงพยาบาลที่ต้องการเข้าสู่ระบบ</p>
        
        <div className="grid grid-cols-2 gap-6">
          <button
            onClick={() => onSelectGroup('G.4.1')}
            className="flex flex-col items-center justify-center p-8 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded-2xl transition-all shadow-sm hover:shadow-lg group border border-blue-100 hover:border-transparent cursor-pointer"
          >
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 text-blue-500 shadow-sm group-hover:text-blue-600">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="text-2xl font-black">กลุ่ม G.4.1</span>
          </button>
          
          <button
            onClick={() => onSelectGroup('G.4.2')}
            className="flex flex-col items-center justify-center p-8 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 rounded-2xl transition-all shadow-sm hover:shadow-lg group border border-emerald-100 hover:border-transparent cursor-pointer"
          >
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 text-emerald-500 shadow-sm group-hover:text-emerald-600">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="text-2xl font-black">กลุ่ม G.4.2</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('AUTH_PASSED') === 'true';
  });
  
  const [selectedGroup, setSelectedGroup] = useState(() => {
    return sessionStorage.getItem('SELECTED_GROUP') || null;
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
  const [actionModalData, setActionModalData] = useState(null);       // TrackingTab
  const [branchCertifyData, setBranchCertifyData] = useState(null);   // BranchTab
  const [deviceListModalGroup, setDeviceListModalGroup] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);

  const loadHospitals = async (force = false) => {
    try {
      const list = await api.getHospitalsMap({ forceRefresh: force });
      if (Array.isArray(list) && list.length > 0) {
        setHospitals(list);
        localStorage.setItem('HOSPITALS_CACHE', JSON.stringify(list));
        
        // Only default selectedBranch if it's empty OR if the selected branch isn't in the current group
        if (!selectedBranch && selectedGroup) {
           const groupHospitals = list.filter(h => h.group === selectedGroup);
           if (groupHospitals.length > 0) {
             setSelectedBranch(groupHospitals[0].name);
             localStorage.setItem('LAST_SELECTED_BRANCH', groupHospitals[0].name);
           }
        }
      }
    } catch (err) {
      console.error("Error loading hospitals:", err);
    }
  };

  useEffect(() => {
    loadHospitals();
  }, [selectedGroup]);

  const handleSelectBranch = (branchName) => {
    setSelectedBranch(branchName);
    localStorage.setItem('LAST_SELECTED_BRANCH', branchName);
  };

  if (!isAuthenticated) {
    return (
      <LoginScreen 
        onLogin={() => {
          setIsAuthenticated(true);
          sessionStorage.setItem('AUTH_PASSED', 'true');
        }} 
      />
    );
  }

  if (!selectedGroup) {
    return (
      <GroupSelectionScreen 
        onSelectGroup={(group) => {
          setSelectedGroup(group);
          sessionStorage.setItem('SELECTED_GROUP', group);
        }}
      />
    );
  }

  // Filter hospitals to only show those in the selectedGroup
  const filteredHospitals = hospitals.filter(h => h.group === selectedGroup);

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
                selectedGroup={selectedGroup}
                hospitals={filteredHospitals}
                onSelectHospital={(hospName) => {
                  handleSelectBranch(hospName);
                  setCurrentTab('branch');
                }}
              />
            )}

            {currentTab === 'admin' && (
              <AdminTab
                hospitals={filteredHospitals}
                selectedGroup={selectedGroup}
                onReloadHospitals={() => loadHospitals(true)}
              />
            )}

            {currentTab === 'branch' && (
              <BranchTab
                hospitals={filteredHospitals}
                selectedBranch={selectedBranch}
                setSelectedBranch={handleSelectBranch}
                onOpenAiModal={(item) => setAiModalItem(item)}
                onOpenActionModal={(item, hosp, cb) => setBranchCertifyData({ item, hosp, cb })}
                onOpenDeviceListModal={(item) => setDeviceListModalGroup(item)}
              />
            )}

            {currentTab === 'alerts' && (
              <AlertsTab
                onOpenExportModal={() => setExportModalOpen(true)}
              />
            )}

            {currentTab === 'manual-check' && (
              <ManualCheckTab 
                onOpenAiModal={(item) => setAiModalItem(item)}
              />
            )}

            {currentTab === 'tracking' && (
              <TrackingTab
                hospitals={filteredHospitals}
                selectedGroup={selectedGroup}
                onOpenActionModal={(item, hosp, cb) => setActionModalData({ item, hosp, cb })}
                onOpenDeviceListModal={(item) => setDeviceListModalGroup(item)}
              />
            )}

            {currentTab === 'export-yearly' && (
              <ExportYearlyTab
                hospitals={filteredHospitals}
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

      {branchCertifyData && (
        <BranchCertifyModal
          item={branchCertifyData.item}
          hospitalName={branchCertifyData.hosp}
          onClose={() => setBranchCertifyData(null)}
          onSuccess={() => {
            if (branchCertifyData.cb) branchCertifyData.cb();
          }}
          onNavigateToTracking={() => setCurrentTab('tracking')}
        />
      )}

      {deviceListModalGroup && (
        <DeviceListModal
          group={deviceListModalGroup}
          onClose={() => setDeviceListModalGroup(null)}
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
