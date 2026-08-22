import React, { useState, useEffect } from 'react';
import { MapContainer, Marker, Popup, Circle, useMapEvents, GeoJSON, ImageOverlay, Tooltip, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { api } from '../api_firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase'; // Assuming firebase.js is in src/

// Fix Leaflet's default icon issue with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons
const createCustomIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = createCustomIcon('red');
const blueIcon = createCustomIcon('blue');
const orangeIcon = createCustomIcon('orange');

// Helper component to handle map clicks for editing coordinates
function LocationPicker({ isEditing, onLocationSelect }) {
  useMapEvents({
    click(e) {
      if (isEditing) {
        onLocationSelect([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

const getRegionColor = (provinceName) => {
  const name = (provinceName || '').toLowerCase();
  
  const north = ['chiang mai', 'chiang rai', 'lampang', 'lamphun', 'mae hong son', 'nan', 'phayao', 'phrae', 'uttaradit'];
  const northeast = ['amnat charoen', 'bueng kan', 'buri ram', 'chaiyaphum', 'kalasin', 'khon kaen', 'loei', 'maha sarakham', 'mukdahan', 'nakhon phanom', 'nakhon ratchasima', 'nong bua lam phu', 'nong khai', 'roi et', 'sakon nakhon', 'si sa ket', 'surin', 'ubon ratchathani', 'udon thani', 'yasothon'];
  const south = ['chumphon', 'krabi', 'nakhon si thammarat', 'narathiwat', 'pattani', 'phangnga', 'phatthalung', 'phuket', 'ranong', 'satun', 'songkhla', 'surat thani', 'trang', 'yala'];
  const east = ['chachoengsao', 'chanthaburi', 'chon buri', 'prachin buri', 'rayong', 'sa kaeo', 'trat'];
  const west = ['kanchanaburi', 'phetchaburi', 'prachuap khiri khan', 'ratchaburi', 'tak'];

  if (north.includes(name)) return '#7dd3fc'; // light blue
  if (northeast.includes(name)) return '#fcd34d'; // amber
  if (south.includes(name)) return '#6ee7b7'; // emerald
  if (east.includes(name)) return '#c4b5fd'; // violet
  if (west.includes(name)) return '#f9a8d4'; // pink
  
  return '#e2e8f0'; // central / default (slate)
};

const getRegionName = (color) => {
  if (color === '#7dd3fc') return 'ภาคเหนือ';
  if (color === '#fcd34d') return 'ภาคอีสาน';
  if (color === '#6ee7b7') return 'ภาคใต้';
  if (color === '#c4b5fd') return 'ภาคตะวันออก';
  if (color === '#f9a8d4') return 'ภาคตะวันตก';
  return 'ภาคกลาง';
}

// Exact coordinates for major Thai hospitals (from Google Maps)
const hospitalCoordinates = {
  // กทม. และ ปริมณฑล
  'ศิริราช': [13.7574, 100.4851],
  'รามาธิบดี': [13.7667, 100.5273],
  'จุฬาลงกรณ์': [13.7317, 100.5332],
  'จุฬา': [13.7317, 100.5332],
  'ราชวิถี': [13.7645, 100.5361],
  'พระมงกุฎ': [13.7677, 100.5333],
  'วชิรพยาบาล': [13.7801, 100.5076],
  'ธรรมศาสตร์': [14.0722, 100.6152],
  'พระนั่งเกล้า': [13.8715, 100.4804],
  'สมุทรปราการ': [13.5993, 100.5968],
  
  // ภาคเหนือ
  'มหาราชนครเชียงใหม่': [18.7883, 98.9853],
  'สวนดอก': [18.7883, 98.9853],
  'เชียงใหม่': [18.7883, 98.9853],
  'นครพิงค์': [18.8475, 98.9669],
  'เชียงราย': [19.9048, 99.8273],
  'ลำปาง': [18.2882, 99.4975],
  'พุทธชินราช': [16.8167, 100.2647],
  'พิษณุโลก': [16.8167, 100.2647],
  'สวรรค์ประชารักษ์': [15.6987, 100.1228],
  'นครสวรรค์': [15.6987, 100.1228],

  // ภาคอีสาน
  'ศรีนครินทร์': [16.4651, 102.8277],
  'ขอนแก่น': [16.4322, 102.8236], // รพ.ศูนย์ขอนแก่น
  'มหาราชนครราชสีมา': [14.9818, 102.1009],
  'โคราช': [14.9818, 102.1009],
  'สรรพสิทธิประสงค์': [15.2287, 104.8564],
  'อุบล': [15.2287, 104.8564],
  'อุดร': [17.4093, 102.7842],
  'ร้อยเอ็ด': [16.0594, 103.6558],
  'บุรีรัมย์': [14.9928, 103.1118],
  'สุรินทร์': [14.8821, 103.4935],

  // ภาคใต้
  'สงขลานครินทร์': [7.0076, 100.4984],
  'มอ.': [7.0076, 100.4984],
  'หาดใหญ่': [7.0094, 100.4730],
  'สงขลา': [7.1903, 100.5960],
  'วชิระภูเก็ต': [7.8931, 98.3842],
  'ภูเก็ต': [7.8931, 98.3842],
  'สุราษฎร์ธานี': [9.1245, 99.3175],
  'สุราษฎร์': [9.1245, 99.3175],
  'มหาราชนครศรีธรรมราช': [8.4357, 99.9678],
  'นครศรีธรรมราช': [8.4357, 99.9678],
  'ยะลา': [6.5413, 101.2829],

  // ภาคตะวันออก & อื่นๆ
  'ชลบุรี': [13.3551, 100.9840],
  'สมเด็จพระบรมราชเทวี': [13.1670, 100.9254],
  'ศรีราชา': [13.1670, 100.9254],
  'ระยอง': [12.6775, 101.2721],
  'พระปกเกล้า': [12.6114, 102.1039],
  'จันทบุรี': [12.6114, 102.1039],
  'สระบุรี': [14.5312, 100.9168],
  'อยุธยา': [14.3512, 100.5699],

  // เอกชน
  'กรุงเทพ': [13.7486, 100.5833],
  'สมิติเวช': [13.7377, 100.5758],
  'บำรุงราษฎร์': [13.7431, 100.5532],
  'พญาไท 1': [13.7578, 100.5401],
  'พญาไท 2': [13.7661, 100.5410],
  'พญาไท 3': [13.7259, 100.4633],
  'พญาไท': [13.7661, 100.5410],
  'รามคำแหง': [13.7634, 100.6358],
  'วิภาราม': [13.7371, 100.6409],
  'สินแพทย์': [13.8347, 100.6659],
  'เปาโล': [13.7915, 100.5492],
};

const getExactCoordinates = (name) => {
  const n = name.toLowerCase();
  
  // Find matching keyword in our exact coordinates dictionary
  for (const [key, coords] of Object.entries(hospitalCoordinates)) {
    if (n.includes(key.toLowerCase())) {
      return coords;
    }
  }

  // Fallback: If completely unknown, hash it to a random location around Central Bangkok
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const baseLat = 13.7563;
  const baseLng = 100.5018;
  const latOffset = ((hash % 100) / 100) * 0.2 - 0.1;
};

const createBadgeIcon = (name, count) => {
  const shortName = name.replace('โรงพยาบาล', 'รพ.');
  const html = `
    <div class="flex flex-col items-center cursor-pointer hover:-translate-y-1 transition-transform group" style="margin-top: -45px; transform: translateX(-50%);">
      <div class="bg-white/95 backdrop-blur-sm border-2 border-red-400 rounded-full shadow-lg pl-3 pr-1 py-1 flex items-center gap-2 group-hover:border-red-600 group-hover:shadow-red-200/50">
        <div class="text-red-800 font-bold text-[11px] whitespace-nowrap drop-shadow-sm">
          ${shortName}
        </div>
        <div class="bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap">
          ${count} เครื่อง
        </div>
      </div>
      <div class="w-1 h-3 bg-red-500"></div>
      <div class="w-3 h-3 rounded-full bg-red-600 border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.5)]"></div>
    </div>
  `;
  return L.divIcon({
    className: 'bg-transparent border-0',
    html: html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -45]
  });
};

export default function MapPage() {
  const [hospitals, setHospitals] = useState([]);
  const [deviceGroups, setDeviceGroups] = useState([]);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState(null);
  
  const [geoData, setGeoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingHospId, setEditingHospId] = useState(null);
  const [customLocations, setCustomLocations] = useState(() => {
    const saved = localStorage.getItem('CUSTOM_MAP_LOCATIONS');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const geoRes = await fetch('/thailand.json');
        const geoJson = await geoRes.json();
        setGeoData(geoJson);

        const snapshot = await getDocs(collection(db, 'matchedAlerts'));
        const alertsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        try {
          const codes = [...new Set(alertsData.map(a => a.Device_Code).filter(Boolean))];
          const aIds = [...new Set(alertsData.filter(a => !a.Device_Code).map(a => a.Asset_ID).filter(Boolean))];
          const deviceLookup = {};

          for (let i = 0; i < codes.length; i += 30) {
            const chunk = codes.slice(i, i + 30);
            const q = query(collection(db, 'devices'), where('Device_Code', 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(d => {
              const data = d.data();
              deviceLookup[data.Device_Code] = data;
            });
          }

          for (let i = 0; i < aIds.length; i += 30) {
            const chunk = aIds.slice(i, i + 30);
            const q = query(collection(db, 'devices'), where('Asset_ID', 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(d => {
              const data = d.data();
              deviceLookup[data.Asset_ID] = data;
            });
          }

          alertsData.forEach(alert => {
            const dCode = alert.Device_Code;
            const aId = alert.Asset_ID;
            const matchedDev = deviceLookup[dCode] || deviceLookup[aId];
            if (matchedDev) {
              alert.Device_Name = alert.Device_Name || matchedDev.Device_Thai_Name || matchedDev.Device_Name || '-';
              alert.Device_Name_Eng = alert.Device_Name_Eng || matchedDev.Device_Type || matchedDev.Device_Name || '-';
            }
          });
        } catch (err) {
          console.error("Error fetching devices for names:", err);
        }

        const groups = {}; 
        const dGroups = {}; 

        alertsData.forEach(alert => {
          const rawName = String(alert.Hospital_Name || alert['โรงพยาบาล'] || alert.hospital || '').trim();
          if (!rawName) return;
          
          const hospName = rawName.toLowerCase();
          
          if (!groups[hospName]) {
            groups[hospName] = {
              id: hospName,
              name: rawName,
              group: alert.Hospital_Group || alert['เครือข่าย'] || 'G.4.2',
              alerts: []
            };
          }
          groups[hospName].alerts.push(alert);

          const brand = String(alert.Brand || alert.Device_Brand || alert['ยี่ห้อ'] || '').trim();
          const model = String(alert.Model || alert.Device_Model || alert['รุ่น'] || '').trim();
          let name = String(alert.Device_Name && alert.Device_Name !== '-' ? alert.Device_Name : (alert.Device_Name_Eng || alert.Asset_Description || alert['รายละเอียด'] || '')).trim();
          if (name === '-') name = '';
            
          if (!brand && !model && !name) name = 'ไม่ระบุชื่อเครื่อง';

          let devTitle = '';
          if (brand && model) devTitle = `${name ? name + ' - ' : ''}ยี่ห้อ: ${brand} รุ่น: ${model}`;
          else if (brand) devTitle = `${name ? name + ' - ' : ''}ยี่ห้อ: ${brand}`;
          else if (model) devTitle = `${name ? name + ' - ' : ''}รุ่น: ${model}`;
          else devTitle = name;

          const dKey = devTitle.toLowerCase();
          if (!dGroups[dKey]) {
            dGroups[dKey] = {
              key: dKey,
              title: devTitle,
              brand, model, name,
              hospitals: new Set(),
              alerts: []
            };
          }
          dGroups[dKey].hospitals.add(hospName);
          dGroups[dKey].alerts.push(alert);
        });

        const finalHospitals = Object.values(groups).map(g => {
          const baseCoords = HOSPITAL_LOCATIONS[g.name] || [13.736717, 100.523186];
          return {
            ...g,
            coords: customLocations[g.id] || baseCoords,
            alertsCount: g.alerts.length
          };
        });

        const finalDevices = Object.values(dGroups).map(d => ({
          ...d,
          alertsCount: d.alerts.length
        })).sort((a, b) => b.alertsCount - a.alertsCount);

        setHospitals(finalHospitals);
        setDeviceGroups(finalDevices);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching map data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [customLocations]);

  const handleUpdateLocation = (newCoords) => {
    if (editingHospId) {
      const updated = { ...customLocations, [editingHospId]: newCoords };
      setCustomLocations(updated);
      localStorage.setItem('CUSTOM_MAP_LOCATIONS', JSON.stringify(updated));
    }
    setEditingHospId(null);
  };

  const styleGeoJson = (feature) => {
    const color = getRegionColor(feature.properties.name);
    return {
      fillColor: color,
      weight: 1,
      opacity: 1,
      color: 'white',
      fillOpacity: 0.8
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-xl font-bold text-slate-500 animate-pulse">กำลังโหลดแผนที่และข้อมูล...</div>
      </div>
    );
  }

  const selectedDevice = deviceGroups.find(d => d.key === selectedDeviceKey);

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="w-1/3 min-w-[320px] max-w-[400px] bg-white border-r border-slate-200 flex flex-col shadow-[4px_0_15px_-3px_rgba(0,0,0,0.1)] z-10">
        <div className="p-5 border-b border-slate-100 bg-white">
          <h1 className="text-xl font-bold text-slate-800 flex items-center">
            <button 
              onClick={() => window.location.hash = '#/'}
              className="mr-3 text-slate-400 hover:text-slate-700 transition-colors flex items-center"
              title="กลับหน้าแรก"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              กลับหน้าแรก
            </button>
          </h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">ระบบวิเคราะห์การกระจายตัวของเครื่องมือแพทย์ที่พบประกาศแจ้งเตือนบ่อยที่สุด</p>
        </div>
        
        <div className="flex-1 overflow-y-auto ai-scroll bg-slate-50/50 p-4">
          {!selectedDevice ? (
            <>
              <div className="mb-4 bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border border-blue-100 shadow-sm flex items-start">
                <span className="text-lg mr-2">👉</span>
                <span><strong>คลิกที่รายชื่อเครื่องมือด้านล่าง</strong> เพื่อดู ป๊อปอัพแสดงพิกัดโรงพยาบาล ที่มีเครื่องมือนั้นใช้งานอยู่บนแผนที่</span>
              </div>
              
              <h2 className="font-bold text-slate-700 mb-3 px-1 flex items-center justify-between">
                จัดอันดับเครื่องมือที่พบปัญหาบ่อย
                <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{deviceGroups.length} รายการ</span>
              </h2>
              
              <div className="space-y-3">
                {deviceGroups.map((d, index) => (
                  <div 
                    key={d.key}
                    onClick={() => setSelectedDeviceKey(d.key)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group flex items-start"
                  >
                    <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold mr-3 mt-0.5 group-hover:scale-110 transition-transform shadow-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-700 text-sm mb-1 leading-snug group-hover:text-red-700 transition-colors">{d.title}</div>
                      <div className="flex items-center text-[10px] text-slate-500 mt-1">
                        <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded font-medium mr-2 border border-red-100">{d.hospitals.size} รพ.</span>
                        <span>({d.alertsCount} เครื่อง)</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="animate-fade-in">
              <button 
                onClick={() => setSelectedDeviceKey(null)}
                className="mb-4 text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm"
              >
                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                ย้อนกลับไปดูอันดับทั้งหมด
              </button>
              
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm mb-4">
                <div className="font-bold text-red-800 text-[15px] mb-2 leading-snug">{selectedDevice.title}</div>
                <div className="text-xs text-red-600/80">พบการแจ้งเตือนทั้งหมด {selectedDevice.alertsCount} รายการ (กระจายอยู่ใน {selectedDevice.hospitals.size} โรงพยาบาล)</div>
              </div>
              
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <h3 className="font-bold text-slate-700 text-xs">โรงพยาบาลที่ได้รับผลกระทบ:</h3>
                </div>
                <div className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto ai-scroll">
                  {hospitals.filter(h => selectedDevice.hospitals.has(h.id)).map(h => (
                    <div key={h.id} className="p-3 hover:bg-slate-50 transition-colors flex justify-between items-center">
                      <div className="text-xs text-slate-700 font-medium">{h.name}</div>
                      <div className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                        {selectedDevice.alerts.filter(a => String(a.Hospital_Name || a['โรงพยาบาล']).trim().toLowerCase() === h.id).length} เครื่อง
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-2/3 h-full relative z-0">
        <MapContainer 
          center={[13.736717, 100.523186]} 
          zoom={6} 
          className="w-full h-full bg-[#f8fbff]"
          zoomControl={false}
        >
          <ZoomControl position="bottomright" />
          
          {geoData && (
            <GeoJSON 
              data={geoData} 
              style={styleGeoJson}
            />
          )}
          
          <LocationPicker isEditing={!!editingHospId} onLocationSelect={handleUpdateLocation} />
          
          {hospitals.map(h => {
            const isIdle = !selectedDevice;
            const hasSelectedDevice = selectedDevice ? selectedDevice.hospitals.has(h.id) : false;
            
            if (!isIdle && !hasSelectedDevice) return null;

            let icon;
            if (!isIdle && hasSelectedDevice) {
              const count = selectedDevice.alerts.filter(a => String(a.Hospital_Name || a['โรงพยาบาล']).trim().toLowerCase() === h.id).length;
              icon = createBadgeIcon(h.name, count);
            } else {
              icon = blueIcon;
            }

            const alertsToShow = !isIdle && hasSelectedDevice 
              ? selectedDevice.alerts.filter(a => String(a.Hospital_Name || a['โรงพยาบาล']).trim().toLowerCase() === h.id)
              : h.alerts;
            
            return (
              <Marker 
                key={h.id} 
                position={h.coords}
                icon={icon}
              >
                {editingHospId !== h.id ? (
                  <Popup minWidth={800} maxWidth={1000} className="custom-popup-table">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-bold text-sm text-red-700">{h.name}</div>
                      <button onClick={() => setEditingHospId(h.id)} className="text-[10px] bg-slate-100 text-slate-600 border border-slate-300 px-2 py-0.5 rounded shadow-sm hover:bg-slate-200 transition-colors">
                        📍 ย้ายหมุด
                      </button>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-600 mb-2 border-b border-slate-200 pb-2">
                      {isIdle ? `เครื่องมือทั้งหมดที่พบปัญหา (${h.alertsCount} รายการ)` : `รายการแจ้งเตือน (${selectedDevice.title})`}
                    </div>
                    
                    <div className="max-h-72 overflow-x-auto overflow-y-auto ai-scroll">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-slate-100 text-slate-700 text-[11px] sticky top-0 shadow-sm z-10">
                          <tr>
                            <th className="px-1.5 py-1 border-b border-slate-200 font-bold">รหัสข่าว/ID Code</th>
                            <th className="px-1.5 py-1 border-b border-slate-200 font-bold">ชื่ออังกฤษ</th>
                            <th className="px-1.5 py-1 border-b border-slate-200 font-bold">ยี่ห้อ</th>
                            <th className="px-1.5 py-1 border-b border-slate-200 font-bold">รุ่น</th>
                            <th className="px-1.5 py-1 border-b border-slate-200 font-bold">สถานะ</th>
                            <th className="px-1.5 py-1 border-b border-slate-200 font-bold">การดำเนินการ</th>
                          </tr>
                        </thead>
                        <tbody className="text-[11px] text-slate-600">
                          {alertsToShow.map((a, i) => {
                            const alertId = a.Alert_ID || a['รหัสข่าว'] || a.Alert_Code || '-';
                            const assetId = a.Asset_ID || a.Asset_No || a['เลขครุภัณฑ์'] || a['เลขคุรุภัณฑ์'] || '-';
                            const deviceCode = a.Device_Code || a.Device_ID || a['รหัสเครื่องมือ'] || '-';
                            
                            const validIds = [
                              (alertId && alertId !== '-' && alertId.toUpperCase() !== 'N/A') ? `🚨 ${alertId}` : null,
                              (assetId && assetId !== '-' && assetId.toUpperCase() !== 'N/A') ? assetId : null,
                              (deviceCode && deviceCode !== '-' && deviceCode.toUpperCase() !== 'N/A') ? deviceCode : null
                            ].filter(Boolean);
                            const idCodeDisplay = validIds.length > 0 ? validIds.join(' / ') : '-';
                              
                            const brand = a.Brand || a.Device_Brand || a['ยี่ห้อ'] || '-';
                            const model = a.Model || a.Device_Model || a['รุ่น'] || '-';
                            const engName = a.Device_Name_Eng || a.Device_Name_EN || a.English_Name || a['ชื่ออังกฤษ'] || a['ชื่อภาษาอังกฤษ'] || '-';
                            const status = a.Status || a['สถานะการตรวจสอบ'] || a.trackingStatus || 'รอยืนยัน';
                            const action = a.Action || a['การดำเนินการ'] || a['รายละเอียดการดำเนินการ'] || '-';

                            return (
                              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="px-1.5 py-1.5 font-mono text-slate-800 font-semibold">{idCodeDisplay}</td>
                                <td className="px-1.5 py-1.5 text-slate-500 truncate max-w-[200px]" title={engName}>{engName}</td>
                                <td className="px-1.5 py-1.5">{brand}</td>
                                <td className="px-1.5 py-1.5">{model}</td>
                                <td className="px-1.5 py-1.5">
                                  <span className={`px-2 py-0.5 rounded-full font-bold ${
                                    status.includes('รอ') ? 'bg-amber-100 text-amber-700' :
                                    status.includes('เสร็จ') || status.includes('ปลอดภัย') ? 'bg-emerald-100 text-emerald-700' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>
                                    {status}
                                  </span>
                                </td>
                                <td className="px-1.5 py-1.5 truncate max-w-[150px]" title={action}>{action}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Popup>
                ) : null}
              </Marker>
            );
          })}
          
        </MapContainer>
      </div>
      
      {editingHospId && (
        <div className="absolute top-4 right-4 z-[2000] bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg font-bold animate-bounce pointer-events-none">
          📍 โหมดแก้ไขพิกัด: คลิกบริเวณบนแผนที่เพื่อวางหมุดใหม่
        </div>
      )}
    </div>
  );
}
