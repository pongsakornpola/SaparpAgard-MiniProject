import React, { useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const API_KEY = import.meta.env.VITE_OWM_API_KEY

const BlueDot = () => {
  return `
    <div class="blue-dot-marker">
      <span class="inner"></span>
    </div>
  `
}

// ช่วยจัดพิกัดให้อยู่ในช่วงที่ถูกต้อง
const clampLat = (lat) => Math.max(-90, Math.min(90, lat))
const wrapLng = (lng) => ((lng + 180) % 360 + 360) % 360 - 180

function ClickCapture({ onSelectPosition }) {
  useMapEvents({
    click(e) {
      const { latlng } = e
      const lat = clampLat(latlng.lat)
      const lng = wrapLng(latlng.lng)
      if (onSelectPosition) onSelectPosition([lat, lng])
    },
  })
  return null
}

function CenterAndZoomOnPosition({ center, viewMeta, defaultZoom = 15, searchZoom = 14.0 }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !center) return
    // หากมี bounds (เช่นประเทศ) จะให้ตัว FitBoundsOnMeta จัดการ
    if (viewMeta?.bounds) return
    // กรณีค้นหา: ปรับซูมแตกต่างตามระดับ (เมือง vs ประเทศ)
    if (viewMeta?.trigger === 'search') {
      const lvl = viewMeta?.level
      const targetZoom = lvl === 'country' ? 6 : searchZoom
      const zoom = Math.max(Math.min(targetZoom, map.getMaxZoom()), map.getMinZoom())
      map.flyTo(center, zoom, { animate: true, duration: 0.6, easeLinearity: 0.25 })
      return
    }

    // กรณีคลิกซ้ายเพิ่มมาร์ก: ไม่เปลี่ยนซูม, เพียงแค่แพนไปตำแหน่ง (นุ่มนวลเล็กน้อย)
    if (viewMeta?.trigger === 'click') {
      map.panTo(center, { animate: true, duration: 0.4, easeLinearity: 0.25 })
      return
    }

    // กรณีอื่น ๆ (เช่นครั้งแรก): ใช้ซูมเริ่มต้น
    const targetZoom = defaultZoom
    const zoom = Math.max(Math.min(targetZoom, map.getMaxZoom()), map.getMinZoom())
    map.flyTo(center, zoom, { animate: true, duration: 0.6, easeLinearity: 0.25 })
  }, [center, viewMeta, defaultZoom, searchZoom, map])
  return null
}

function FitBoundsOnMeta({ viewMeta }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const b = viewMeta?.bounds
    if (!b || !Array.isArray(b) || b.length !== 2) return
    try {
      const south = clampLat(parseFloat(b[0][0]))
      const west = wrapLng(parseFloat(b[0][1]))
      const north = clampLat(parseFloat(b[1][0]))
      const east = wrapLng(parseFloat(b[1][1]))
      const bounds = L.latLngBounds([[south, west], [north, east]])
      // ตรวจกรณีข้ามเส้นวันที่ (east < west) หรือพื้นที่ใหญ่มาก เช่น Russia
      const latSpan = Math.abs(north - south)
      let lonSpan = Math.abs(east - west)
      const crossesDateLine = east < west
      const lvl = viewMeta?.level

      if (crossesDateLine) {
        // คำนวณจุดกึ่งกลางแบบปรับแกนลองจิจูด
        const eastAdj = east + 360
        let lonMid = (west + eastAdj) / 2
        // wrap กลับให้อยู่ช่วง -180..180
        lonMid = wrapLng(lonMid)
        const latMid = (south + north) / 2
        // เลือกซูมตามขนาดพื้นที่
        let targetZoom = 6
        if (lvl === 'country') {
          if (latSpan > 40 || (360 - lonSpan) > 40) targetZoom = 3.5
          else if (latSpan > 20 || (360 - lonSpan) > 20) targetZoom = 5
          else targetZoom = 6
        }
        map.flyTo([latMid, lonMid], targetZoom, { animate: true, duration: 0.6, easeLinearity: 0.25 })
        return
      }

      // กรณีปกติ: fit ขอบเขตและจำกัดซูมไม่ให้ลึกเกินไปสำหรับประเทศ
      const maxZoom = lvl === 'country' ? 6 : 8
      map.flyToBounds(bounds, { animate: true, padding: [24, 24], maxZoom })
    } catch (e) {
      // ignore
    }
  }, [viewMeta, map])
  return null
}

export default function Map2D({ position, onSelectPosition, activeLayers, viewMeta }) {
  const center = position
    ? { lat: clampLat(position[0]), lng: wrapLng(position[1]) }
    : { lat: 13.7563, lng: 100.5018 }

  const showClouds = !!activeLayers?.clouds
  const showPrecip = !!activeLayers?.precipitation
  const showPressure = !!activeLayers?.pressure
  const showWind = !!activeLayers?.wind
  const showTemperature = !!activeLayers?.temperature

  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'blue-dot-icon',
        html: BlueDot(),
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    []
  )

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 9 }}>
      <MapContainer
        center={center}
        zoom={4}
        style={{ height: '100%', width: '100%', background: '#0c0c0c' }}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
        touchZoom={true}
        keyboard={true}
        zoomControl={true}
        zoomSnap={0.25}
        zoomDelta={0.25}
        wheelPxPerZoomLevel={120}
        inertia={false}
        worldCopyJump={false}
        minZoom={3}
        maxZoom={19}
        attributionControl={false}
        maxBounds={[[-80, -170], [80, 170]]}
        maxBoundsViscosity={1.0}
      >
        {/* Basemap กลับมา เพื่อไม่ให้เห็นพื้นที่ว่างสีขาว และไม่ loop */}
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          noWrap={true}
          maxZoom={19}
          updateWhileAnimating={true}
          updateWhileInteracting={true}
          zIndex={1}
        />
        {showClouds && (
          <TileLayer
            attribution='Weather layer © OpenWeather'
            url={`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${API_KEY}`}
            opacity={0.6}
            zIndex={2}
            noWrap={true}
            maxNativeZoom={10}
          />
        )}
        {showPrecip && (
          <TileLayer
            attribution='Weather layer © OpenWeather'
            url={`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${API_KEY}`}
            opacity={0.65}
            zIndex={3}
            noWrap={true}
            maxNativeZoom={10}
          />
        )}
        {showTemperature && (
          <TileLayer
            attribution='Weather layer © OpenWeather'
            url={`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${API_KEY}`}
            opacity={0.5}
            zIndex={2}
            noWrap={true}
            maxNativeZoom={10}
          />
        )}
        {showWind && (
          <TileLayer
            attribution='Weather layer © OpenWeather'
            url={`https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${API_KEY}`}
            opacity={0.6}
            zIndex={4}
            noWrap={true}
            maxNativeZoom={10}
          />
        )}
        {showPressure && (
          <TileLayer
            attribution='Weather layer © OpenWeather'
            url={`https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png?appid=${API_KEY}`}
            opacity={0.5}
            zIndex={5}
            noWrap={true}
            maxNativeZoom={10}
          />
        )}
        {position && <Marker position={center} icon={icon} />}
        <CenterAndZoomOnPosition center={center} viewMeta={viewMeta} defaultZoom={15} searchZoom={14} />
        <FitBoundsOnMeta viewMeta={viewMeta} />
        <ClickCapture onSelectPosition={onSelectPosition} />
      </MapContainer>
      {/* สไตล์ Blue Dot marker */}
      <style>
        {`
          .blue-dot-marker {
            position: relative;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: rgba(30,144,255,0.18);
            border: 2px solid rgba(30,144,255,0.5);
            box-shadow: 0 0 0 8px rgba(30,144,255,0.12);
          }
          .blue-dot-marker .inner {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #1E90FF;
          }
        `}
      </style>
    </div>
  )
}