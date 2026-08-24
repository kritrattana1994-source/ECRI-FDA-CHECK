import React, { useState, useEffect } from 'react';
import { Menu, Clock, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getApiUrl } from '../api_firebase';

export default function Header({ collapsed, setCollapsed, onOpenApiSettings }) {
  const [timeStr, setTimeStr] = useState('');
  const hasUrl = Boolean(getApiUrl());

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options = {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      setTimeStr(now.toLocaleString('th-TH', options));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-between items-center pb-4 border-b border-sky-100/60">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition cursor-pointer text-slate-600" 
          title="ซ่อน/แสดง เมนู"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img
            src="/nhealth-logo.png"
            alt="NHealth Logo"
            className="h-12 w-auto object-contain"
          />
      </div>

      <div className="flex items-center gap-3">
        {/* Real-time Clock Badge */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs bg-white/80 border border-sky-100 px-3 py-1.5 rounded-xl font-bold text-slate-600 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-blue-600" />
          <span>{timeStr || 'กำลังโหลดเวลา...'}</span>
        </div>

        {/* API Connection Setup Button */}
        <button
          onClick={onOpenApiSettings}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold transition shadow-sm border cursor-pointer ${
            hasUrl 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          }`}
          title="ตั้งค่าการเชื่อมต่อ Google Apps Script API"
        >
          {hasUrl ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>API เชื่อมต่อแล้ว</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>ตั้งค่า Apps Script URL</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
