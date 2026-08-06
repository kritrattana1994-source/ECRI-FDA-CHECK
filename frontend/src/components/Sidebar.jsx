import React from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  Building2, 
  BellRing, 
  CheckSquare, 
  ChevronLeft, 
  ChevronRight,
  Database
} from 'lucide-react';

export default function Sidebar({ currentTab, setTab, collapsed, setCollapsed }) {
  const navItems = [
    { id: 'dashboard', label: 'ภาพรวมระบบ (Dashboard)', icon: LayoutDashboard },
    { id: 'admin', label: 'หน้าจัดการระบบ (Admin)', icon: Settings },
    { id: 'branch', label: 'งานเฉพาะสาขา (Branch Portal)', icon: Building2 },
    { id: 'alerts', label: 'คลังข่าวแจ้งเตือนภัย (Alerts DB)', icon: BellRing },
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
            <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-xl shadow-md border border-sky-100/80">
              <svg className="w-7 h-7" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 15H36L64 70V15H80V85H64L36 30V85H20V15Z" fill="#0050cd"/>
                <path d="M14 44H38V56H14V44Z" fill="#ffffff"/>
                <path d="M21 37H31V63H21V37Z" fill="#ffffff"/>
              </svg>
            </div>
            {!collapsed && (
              <div className="transition-opacity duration-200">
                <div className="flex items-center gap-0.5">
                  <span className="font-extrabold text-base text-slate-900 tracking-tight">N</span>
                  <span className="font-bold text-base text-blue-600 tracking-tight">Health</span>
                </div>
                <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider block mt-0.5 truncate">
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

      {/* Footer Credit */}
      <div className="p-4 border-t border-sky-100/60 text-center">
        {!collapsed ? (
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">Clinical Engineering Service</span>
            <span className="text-[9px] text-blue-600 font-bold mt-0.5 block">N Health Group</span>
          </div>
        ) : (
          <span className="text-[9px] text-blue-600 font-bold block">NH</span>
        )}
      </div>
    </aside>
  );
}
