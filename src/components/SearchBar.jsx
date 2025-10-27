import { useState } from 'react';
import './SearchBar.css';

const API_KEY = import.meta.env.VITE_OWM_API_KEY;

function SearchBar({ onSelectPosition }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const performSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      // ใช้ Nominatim ครั้งเดียว: ตรวจจับประเทศโดยขอบเขตมีขนาดใหญ่
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1&polygon_geojson=0`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'th,en' } });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        let bounds = null;
        if (item.boundingbox && item.boundingbox.length === 4) {
          const south = parseFloat(item.boundingbox[0]);
          const north = parseFloat(item.boundingbox[1]);
          const west = parseFloat(item.boundingbox[2]);
          const east = parseFloat(item.boundingbox[3]);
          bounds = [[south, west], [north, east]];
          const latSpan = Math.abs(north - south);
          const lonSpan = Math.abs(east - west);
          const isLargeArea = latSpan > 5 || lonSpan > 5;
          // จำแนกระดับ "ประเทศ/ภูมิภาค" เฉพาะประเภทใหญ่จริง ๆ เท่านั้น
          const adminTypesLarge = ['country', 'state', 'province', 'region'];
          const isAdminLarge = adminTypesLarge.includes(item.type);
          if (isAdminLarge || isLargeArea) {
            onSelectPosition([lat, lon], { level: 'country', bounds });
            return;
          }
        }
        // ค่าเริ่มต้น: ถือว่าเป็นจุดหรือเมือง
        onSelectPosition([lat, lon], { level: 'place' });
      } else {
        // fallback: ใช้ OWM geocoding
        const url2 = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${API_KEY}`;
        const res2 = await fetch(url2);
        const data2 = await res2.json();
        if (Array.isArray(data2) && data2.length > 0) {
          const { lat, lon } = data2[0];
          onSelectPosition([lat, lon], { level: 'place' });
        } else {
          setError('ไม่พบผลลัพธ์ที่ค้นหา');
        }
      }
    } catch (e) {
      setError('เกิดข้อผิดพลาดในการค้นหา');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="พิมพ์ชื่อเมืองหรือประเทศ เช่น Rangsit, Thailand"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={loading}
      />
      <button className="search-btn" onClick={performSearch} disabled={loading || !query.trim()}>
        {loading ? 'กำลังค้นหา…' : 'ค้นหา'}
      </button>
      {error && <div className="search-error">{error}</div>}
    </div>
  );
}

export default SearchBar;