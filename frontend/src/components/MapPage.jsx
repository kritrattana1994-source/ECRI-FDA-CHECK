import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { api } from '../api_firebase';

// Fix Leaflet's default icon issue with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Mock generator for coordinates within Thailand based on hospital name
const getMockCoordinates = (name) => {
  if (name.includes('เชียงใหม่')) return [18.7883, 98.9853];
  if (name.includes('ขอนแก่น')) return [16.4322, 102.8236];
  if (name.includes('สงขลา') || name.includes('หาดใหญ่')) return [7.0094, 100.4730];
  if (name.includes('ชลบุรี')) return [13.3611, 100.9847];
  if (name.includes('โคราช') || name.includes('นครราชสีมา')) return [14.9799, 102.0978];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Bangkok center: 13.7563, 100.5018
  // Spread across Thailand roughly
  const lat = 13.7563 + ((hash % 100) / 100) * 8 - 4; 
  const lng = 100.5018 + (((hash >> 4) % 100) / 100) * 6 - 3; 
  return [lat, lng];
};

export default function MapPage() {
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const list = await api.getHospitalsMap();
        
        // Add coordinates to each hospital
        const hospitalsWithCoords = list.map(h => ({
          ...h,
          coords: getMockCoordinates(h.name)
        }));
        
        setHospitals(hospitalsWithCoords);
      } catch (err) {
        console.error("Failed to load hospitals for map:", err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Example of finding nearby hospitals (mock distance < 1.0 degree)
  const nearbyHospitals = selectedHospital 
    ? hospitals.filter(h => h.id !== selectedHospital.id && 
        Math.abs(h.coords[0] - selectedHospital.coords[0]) < 1.0 &&
        Math.abs(h.coords[1] - selectedHospital.coords[1]) < 1.0)
    : [];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Left Sidebar */}
      <div className="w-96 bg-white border-r border-slate-200 shadow-xl flex flex-col z-[1000] relative">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <button 
              onClick={() => window.close()} 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              title="ปิดหน้าต่าง"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-slate-800">แผนที่วิเคราะห์</h1>
          </div>
          <p className="text-sm text-slate-500">ระบบวิเคราะห์ความเกี่ยวข้องของเครื่องมือแพทย์ระหว่างโรงพยาบาล</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedHospital ? (
            <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
              <h2 className="text-xl font-bold text-blue-900 mb-1">{selectedHospital.name}</h2>
              <p className="text-sm text-blue-700 mb-4">กลุ่มเครือข่าย: {selectedHospital.group}</p>
              
              <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">เครื่องมือที่พบในประกาศ (สมมติ)</h3>
                <ul className="text-xs space-y-2">
                  <li className="flex justify-between items-center text-red-600 font-medium">
                    <span>Infusion Pump ยี่ห้อ A รุ่น 100X</span>
                    <span className="bg-red-100 px-2 py-1 rounded">2 เครื่อง</span>
                  </li>
                  <li className="flex justify-between items-center text-orange-600 font-medium">
                    <span>Defibrillator ยี่ห้อ B รุ่น Z2</span>
                    <span className="bg-orange-100 px-2 py-1 rounded">1 เครื่อง</span>
                  </li>
                </ul>
              </div>

              {nearbyHospitals.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    รพ. ใกล้เคียงที่มีรุ่นเดียวกัน
                  </h3>
                  <ul className="space-y-2">
                    {nearbyHospitals.slice(0, 3).map(h => (
                      <li key={h.id} className="text-xs bg-white p-2 rounded-lg border border-slate-100 flex justify-between items-center">
                        <span className="font-semibold text-slate-700 truncate">{h.name}</span>
                        <span className="text-emerald-600 font-bold whitespace-nowrap ml-2">มี 1 เครื่อง</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button 
                onClick={() => setSelectedHospital(null)}
                className="mt-6 w-full py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 font-semibold rounded-lg transition-colors text-sm"
              >
                ดูภาพรวมทั้งหมด
              </button>
            </div>
          ) : (
            <div>
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-4 text-sm text-yellow-800">
                คลิกที่หมุดบนแผนที่เพื่อดูข้อมูลเครื่องมือแพทย์ของโรงพยาบาล และค้นหาโรงพยาบาลข้างเคียงที่มีรุ่นเดียวกัน
              </div>
              <h3 className="font-bold text-slate-700 mb-3 px-2">รายชื่อโรงพยาบาลทั้งหมด ({hospitals.length})</h3>
              <div className="space-y-2">
                {hospitals.map(h => (
                  <button
                    key={h.id}
                    onClick={() => setSelectedHospital(h)}
                    className="w-full text-left p-3 hover:bg-slate-100 rounded-xl transition-colors border border-transparent hover:border-slate-200"
                  >
                    <div className="font-medium text-slate-800">{h.name}</div>
                    <div className="text-xs text-slate-500 mt-1">กลุ่ม {h.group}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0">
        <MapContainer 
          center={[13.7563, 100.5018]} 
          zoom={6} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {hospitals.map(h => {
            const isSelected = selectedHospital?.id === h.id;
            const isNearby = nearbyHospitals.some(nh => nh.id === h.id);
            
            return (
              <Marker 
                key={h.id} 
                position={h.coords}
                icon={isSelected ? redIcon : blueIcon}
                eventHandlers={{
                  click: () => setSelectedHospital(h),
                }}
              >
                <Popup>
                  <div className="font-bold text-sm">{h.name}</div>
                  <div className="text-xs text-gray-500">กลุ่ม: {h.group}</div>
                  {isNearby && <div className="text-xs text-emerald-600 font-bold mt-1">⭐ มีเครื่องมือรุ่นเดียวกัน</div>}
                </Popup>
              </Marker>
            );
          })}
          
          {/* Draw a radius circle around selected hospital */}
          {selectedHospital && (
            <Circle 
              center={selectedHospital.coords}
              radius={50000} // 50km
              pathOptions={{ fillColor: 'red', color: 'red', fillOpacity: 0.1, weight: 1 }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
