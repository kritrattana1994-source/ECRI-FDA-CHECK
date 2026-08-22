import React from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  Building2, 
  BellRing, 
  CheckSquare, 
  ChevronLeft, 
  ChevronRight,
  Database,
  Search
} from 'lucide-react';

export default function Sidebar({ currentTab, setTab, collapsed, setCollapsed }) {
  const navItems = [
    { id: 'dashboard', label: 'ภาพรวมระบบ (Dashboard)', icon: LayoutDashboard },
    { id: 'admin', label: 'หน้าจัดการระบบ (Admin)', icon: Settings },
    { id: 'branch', label: 'งานเฉพาะสาขา (Branch Portal)', icon: Building2 },
    { id: 'alerts', label: 'คลังข่าวแจ้งเตือนภัย (Alerts DB)', icon: BellRing },
    { id: 'manual-check', label: 'ค้นหารายเครื่อง', icon: Search },
    { id: 'tracking', label: 'ติดตามสถานะการดำเนินงาน', icon: CheckSquare },
    { id: 'export-yearly', label: 'ส่งออกเป็นไฟล์รายปี', icon: Database },
  ];

  return (
    <aside 
      className={`${collapsed ? 'w-20' : 'w-64'} h-screen sticky top-0 sidebar-glass flex flex-col justify-between shrink-0 z-20 transition-all duration-300 shadow-sm`}
    >
      <div>
        {/* N Health Brand Logo */}
        <div className="p-5 border-b border-sky-100/60 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-xl shadow-md border border-sky-100/80 p-1">
              <img src="/nhealth-logo.png" alt="N Health Logo" className="w-full h-full object-contain" />
            </div>
            {!collapsed && (
              <div className="transition-opacity duration-200">
                <div className="flex items-center gap-0.5">
                  <span className="font-extrabold text-base text-blue-700 tracking-tight">N</span>
                  <span className="font-bold text-base text-blue-600 tracking-tight">Health</span>
                </div>
                <span className="text-[8px] font-extrabold text-blue-500 uppercase tracking-wider block mt-0.5 truncate">
                  Clinical Engineering
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Menu Links */}
        <nav className="p-3 space-y-1.5 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                title={collapsed ? item.label : ''}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-bold'
                    : 'text-slate-600 hover:bg-sky-50/80 hover:text-blue-600'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1" />

      {/* Switch Group Button */}
      <div className="px-3 pb-2">
        <button
          onClick={() => {
            sessionStorage.removeItem('SELECTED_GROUP');
            window.location.reload();
          }}
          title={collapsed ? 'เปลี่ยนกลุ่ม' : ''}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span>เปลี่ยนกลุ่มเครือข่าย</span>}
        </button>
      </div>

      {/* Footer Credit */}
      <div className="p-3 border-t border-sky-100/60 text-center">
        {!collapsed ? (
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">Clinical Engineering Service</span>
            <span className="text-[8.5px] text-blue-600 font-bold mt-0.5 block">
              N Health Group ({typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'Dev'})
            </span>
          </div>
        ) : (
          <span 
            className="text-[9px] text-blue-600 font-bold block cursor-pointer" 
            title={`Clinical Engineering Service - N Health Group (${typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'Dev'})`}
          >
            NH
          </span>
        )}
      </div>
    </aside>
  );
}
