import { useState, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Globe from './components/Globe'
import ForecastBox from './components/ForecastBox'
import LayerControls from './components/LayerControls'
import SearchBar from './components/SearchBar'
import Map2D from './components/Map2D'
import AirQualityBox from './components/AirQualityBox'

const API_KEY = import.meta.env.VITE_OWM_API_KEY

function App() {
  const [position, setPosition] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [flatView, setFlatView] = useState(false)
  const [forecastVisible, setForecastVisible] = useState(false)
  const [viewMeta, setViewMeta] = useState({ trigger: null })
  const [aqiVisible, setAqiVisible] = useState(false)
  const [airQuality, setAirQuality] = useState(null)
  const [aqiError, setAqiError] = useState(null)

  // ใช้กับ Globe
  const [activeLayers, setActiveLayers] = useState({
    clouds: false,
    precipitation: false,
    pressure: false,
    wind: false,
    temperature: false,
  })

  // ฟังก์ชันช่วย: เรียก One Call 3.0
  const fetchOneCall3 = async (lat, lon) => {
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=minutely,hourly,alerts&appid=${API_KEY}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`3.0 onecall failed: ${res.status}`)
    return res.json()
  }

  // ฟังก์ชันช่วย: เรียก One Call 2.5 (fallback เดิม)
  const fetchOneCall25 = async (lat, lon) => {
    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=minutely,hourly,alerts&appid=${API_KEY}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`2.5 onecall failed: ${res.status}`)
    return res.json()
  }

  // ฟังก์ชันช่วย: รวมข้อมูลจาก weather + forecast (3-hour) ให้มี current และ daily
  const fetchWeatherAndForecast25 = async (lat, lon) => {
    const urlWeather = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
    const urlForecast = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
    const [resW, resF] = await Promise.all([fetch(urlWeather), fetch(urlForecast)])
    if (!resW.ok || !resF.ok) throw new Error(`weather/forecast failed: ${resW.status}/${resF.status}`)
    const [currentData, forecastData] = await Promise.all([resW.json(), resF.json()])

    // สร้าง current
    const current = {
      temp: currentData?.main?.temp,
      feels_like: currentData?.main?.feels_like,
      weather: currentData?.weather,
    }

    // จัดกลุ่มรายวันจาก 3-hour blocks
    const groups = new Map()
    for (const item of forecastData?.list || []) {
      const d = new Date(item.dt * 1000)
      const key = d.toISOString().slice(0, 10) // YYYY-MM-DD
      const arr = groups.get(key) || []
      arr.push(item)
      groups.set(key, arr)
    }

    const daily = []
    // เพิ่มวันนี้
    const today = new Date()
    const todayKey = today.toISOString().slice(0, 10)
    if (!groups.has(todayKey)) {
      daily.push({
        dt: currentData?.dt || Math.floor(Date.now() / 1000),
        temp: { max: currentData?.main?.temp, min: currentData?.main?.temp },
        weather: currentData?.weather,
      })
    }

    // สรุปแต่ละวันจากกลุ่ม forecast
    for (const [key, items] of groups.entries()) {
      let min = Infinity
      let max = -Infinity
      let representative = items[Math.floor(items.length / 2)] || items[0]
      for (const it of items) {
        const t = it?.main?.temp
        if (typeof t === 'number') {
          min = Math.min(min, t)
          max = Math.max(max, t)
        }
      }
      // หาก temp ไม่มี ให้ fallback ที่ค่า representative
      if (!isFinite(min) || !isFinite(max)) {
        const t = representative?.main?.temp
        min = typeof t === 'number' ? t : 0
        max = typeof t === 'number' ? t : 0
      }
      daily.push({
        dt: new Date(key).getTime() / 1000,
        temp: { max, min },
        weather: representative?.weather,
      })
    }

    // สร้าง timezone ให้มีรูปแบบที่ ForecastBox ใช้ได้
    const cityName = forecastData?.city?.name || currentData?.name || 'Location'
    const timezone = `City/${cityName.replace(/\s+/g, '_')}`

    return { current, daily, timezone }
  }

  // ฟังก์ชันช่วย: Fallback ใช้ Open-Meteo เมื่อทุก endpoint ของ OpenWeather ล้มเหลว
  const fetchOpenMeteo = async (lat, lon) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`open-meteo failed: ${res.status}`)
    const data = await res.json()

    const codeToIcon = (code) => {
      // map คร่าว ๆ ให้พอแสดงผลได้
      if (code === 0) return { icon: '01d', main: 'Clear', description: 'Clear sky' }
      if (code === 1) return { icon: '02d', main: 'Mainly Clear', description: 'Mainly clear' }
      if (code === 2) return { icon: '03d', main: 'Partly Cloudy', description: 'Partly cloudy' }
      if (code === 3) return { icon: '04d', main: 'Overcast', description: 'Overcast' }
      if (code === 45 || code === 48) return { icon: '50d', main: 'Fog', description: 'Fog' }
      if (code >= 51 && code <= 57) return { icon: '09d', main: 'Drizzle', description: 'Drizzle' }
      if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '10d', main: 'Rain', description: 'Rain' }
      if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { icon: '13d', main: 'Snow', description: 'Snow' }
      if (code >= 95 && code <= 99) return { icon: '11d', main: 'Thunderstorm', description: 'Thunderstorm' }
      return { icon: '01d', main: 'Clear', description: 'Clear' }
    }

    const currentCode = data?.current?.weather_code
    const currentInfo = codeToIcon(currentCode)
    const current = {
      temp: data?.current?.temperature_2m,
      feels_like: data?.current?.temperature_2m,
      weather: [{ icon: currentInfo.icon, description: currentInfo.description, main: currentInfo.main }],
    }

    const daily = []
    const times = data?.daily?.time || []
    const tmax = data?.daily?.temperature_2m_max || []
    const tmin = data?.daily?.temperature_2m_min || []
    const wcode = data?.daily?.weather_code || []
    for (let i = 0; i < times.length; i++) {
      const d = new Date(times[i])
      const info = codeToIcon(wcode[i])
      daily.push({
        dt: Math.floor(d.getTime() / 1000),
        temp: { max: tmax[i], min: tmin[i] },
        weather: [{ icon: info.icon, description: info.description, main: info.main }],
      })
    }

    const timezone = data?.timezone || 'Location/Unknown'
    return { current, daily, timezone }
  }

  // ปรับปรุงฟังก์ชัน fetchForecast ให้มี fallback อัตโนมัติ
  const fetchForecast = async (lat, lon) => {
    setIsLoading(true)
    // จัดพิกัดให้อยู่ในช่วงที่ถูกต้องเสมอ (ต้องอยู่ภายนอก try เพื่อให้ใช้ได้ในทุก fallback)
    const clampLat = (v) => Math.max(-90, Math.min(90, v))
    const wrapLng = (v) => ((v + 180) % 360 + 360) % 360 - 180
    const nLat = clampLat(lat)
    const nLon = wrapLng(lon)
    try {
      // ใช้ One Call 3.0 เป็นหลัก ตามที่ต้องการ
      const [data3, place] = await Promise.all([
        fetchOneCall3(nLat, nLon),
        reverseGeocode(nLat, nLon),
      ])
      setForecast({ ...data3, place })
    } catch (error3) {
      console.warn('3.0 onecall failed, trying 2.5...', error3)
      try {
        const [data25, place] = await Promise.all([
          fetchOneCall25(nLat, nLon),
          reverseGeocode(nLat, nLon),
        ])
        setForecast({ ...data25, place })
      } catch (error25) {
        console.warn('2.5 onecall failed, trying weather+forecast combine...', error25)
        try {
          const [dataMix, place] = await Promise.all([
            fetchWeatherAndForecast25(nLat, nLon),
            reverseGeocode(nLat, nLon),
          ])
          setForecast({ ...dataMix, place })
        } catch (errorMix) {
          console.warn('weather+forecast combine failed, trying Open-Meteo fallback...', errorMix)
          try {
            const [dataOM, place] = await Promise.all([
              fetchOpenMeteo(nLat, nLon),
              reverseGeocode(nLat, nLon),
            ])
            setForecast({ ...dataOM, place })
          } catch (errorOM) {
            console.error('All providers failed:', errorOM)
            setForecast(null)
          }
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ดึงข้อมูลคุณภาพอากาศ (AQI) จาก OpenWeather Air Pollution API
  const fetchAirQuality = async (lat, lon) => {
    try {
      setAqiError(null)
      const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`air pollution failed: ${res.status}`)
      const json = await res.json()
      const item = json?.list?.[0]
      if (!item) throw new Error('no air quality data')
      setAirQuality({ aqi: item?.main?.aqi, components: item?.components })
    } catch (err) {
      console.warn('fetchAirQuality failed:', err)
      setAqiError(err?.message || 'AQI fetch error')
      setAirQuality(null)
    }
  }

  // ครั้งแรก: พยายามดึงตำแหน่งปัจจุบัน หากไม่สำเร็จให้ fallback กรุงเทพฯ
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setPosition([latitude, longitude])
      },
      (err) => {
        console.error(err)
        setPosition([13.7563, 100.5018])
      }
    )
  }, [])

  useEffect(() => {
    if (position) {
      fetchForecast(position[0], position[1])
      fetchAirQuality(position[0], position[1])
    }
  }, [position])

  const toggleClouds = () => {
    setActiveLayers((prev) => ({ ...prev, clouds: !prev.clouds }))
  }

  const togglePrecipitation = () => {
    setActiveLayers((prev) => ({ ...prev, precipitation: !prev.precipitation }))
  }

  const togglePressure = () => {
    setActiveLayers((prev) => ({ ...prev, pressure: !prev.pressure }))
  }

  const toggleWind = () => {
    setActiveLayers((prev) => ({ ...prev, wind: !prev.wind }))
  }

  const toggleTemperature = () => {
    setActiveLayers((prev) => ({ ...prev, temperature: !prev.temperature }))
  }

  // ใช้สำหรับ SearchBar: ตั้งตำแหน่งและบอกว่าเกิดจากการค้นหา
  const handleSearchSelectPosition = (pos, meta = {}) => {
    setPosition(pos)
    // รับ metadata จาก SearchBar เพื่อบอกระดับและ bounds สำหรับประเทศ
    setViewMeta({ trigger: 'search', level: meta.level || 'place', bounds: meta.bounds || null })
  }

  // ใช้สำหรับ Map2D คลิกบนแผนที่: ตั้งตำแหน่งและบอกว่าเกิดจากการคลิก
  const handleMapClickSelectPosition = (pos) => {
    setPosition(pos)
    setViewMeta({ trigger: 'click' })
  }

  // ปุ่มนำทางกลับตำแหน่งปัจจุบันของผู้ใช้
  const locateCurrentPosition = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setPosition([latitude, longitude])
        // ระบุว่าเกิดจากการ locate เพื่อใช้ตรรกะซูมเริ่มต้นแบบทั่วไป
        setViewMeta({ trigger: 'locate', level: 'place' })
      },
      (err) => {
        console.warn('locate failed:', err)
      }
    )
  }

  return (
    <div className="App">
      {/* Canvas พื้นหลัง 3D */}
      <Canvas className="globe-canvas" gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>
        <Suspense fallback={null}>
          <Globe position={position} activeLayers={activeLayers} onSelectPosition={setPosition} flatView={flatView} />
        </Suspense>
      </Canvas>

      {/* UI ลอยอยู่เหนือ Canvas */}
      {flatView && (
        <Map2D position={position} onSelectPosition={handleMapClickSelectPosition} activeLayers={activeLayers} viewMeta={viewMeta} />
      )}
      <SearchBar onSelectPosition={handleSearchSelectPosition} />
      {forecastVisible && <ForecastBox forecast={forecast} isLoading={isLoading} onClose={() => setForecastVisible(false)} />}
      {aqiVisible && airQuality && <AirQualityBox data={airQuality} />}
      <LayerControls
        activeLayers={activeLayers}
        onToggleClouds={toggleClouds}
        onTogglePrecipitation={togglePrecipitation}
        onTogglePressure={togglePressure}
        onToggleWind={toggleWind}
        onToggleTemperature={toggleTemperature}
      />
      {/* ปุ่มสลับ 2D/3D (ไอคอนลูกตา) */}
      <button
        onClick={() => setFlatView((v) => !v)}
        title={flatView ? 'สลับเป็น 3D' : 'สลับเป็น 2D'}
        style={{
          position: 'absolute',
          left: '16px',
          bottom: '16px',
          zIndex: 10,
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          border: '1px solid #444',
          background: flatView ? '#1f1f1f' : '#2b2b2b',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
        }}
      >
        {flatView ? '🌍' : '🗺️'}
      </button>
      {/* ปุ่มกลับสู่ตำแหน่งปัจจุบัน (ข้างปุ่มลมมุมขวาล่าง ระยะห่างมากขึ้น) */}
      <button
        onClick={locateCurrentPosition}
        title={'กลับสู่ตำแหน่งปัจจุบัน'}
        style={{
          position: 'absolute',
          right: '84px', // ขยับให้ห่างจากปุ่มลมมากขึ้น (16 + 42 + ช่องไฟ ~26)
          bottom: '16px',
          zIndex: 11,
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          border: '1px solid #444',
          background: '#2b2b2b',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
        }}
      >
        📍
      </button>
      {/* ปุ่มลมมุมขวาล่าง สำหรับเปิด/ปิดกรอบ AQI */}
      <button
        onClick={() => setAqiVisible((v) => !v)}
        title={aqiVisible ? 'ซ่อนคุณภาพอากาศ' : 'แสดงคุณภาพอากาศ'}
        style={{
          position: 'absolute',
          right: '16px',
          bottom: '16px',
          zIndex: 11,
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          border: '1px solid #444',
          background: aqiVisible ? '#1f1f1f' : '#2b2b2b',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
        }}
      >
        💨
      </button>
      {/* ปุ่มเปิดพยากรณ์เมื่อถูกปิด (อยู่มุมขวาบนของหน้า) */}
      {!forecastVisible && (
        <button
          onClick={() => setForecastVisible(true)}
          title={'แสดงพยากรณ์'}
          style={{
            position: 'absolute',
            right: '16px',
            top: '16px',
            zIndex: 11,
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            border: '1px solid #444',
            background: '#1f1f1f',
            color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 600,
          }}
        >
          +
        </button>
      )}
    </div>
  )
}

export default App
  // ฟังก์ชันช่วย: reverse geocode เพื่อหาชื่อประเทศ/เมืองจาก lat/lon
  const reverseGeocode = async (lat, lon) => {
    try {
      const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`reverse geocode failed: ${res.status}`)
      const arr = await res.json()
      const item = arr?.[0]
      const cityName = item?.name || null
      const countryCode = item?.country || null
      let countryName = null
      try {
        const dn = new Intl.DisplayNames(['th', 'en'], { type: 'region' })
        if (countryCode) countryName = dn.of(countryCode) || countryCode
      } catch {
        countryName = countryCode
      }
      if (cityName || countryName) {
        return { cityName, countryCode, countryName }
      }
      // Fallback: ใช้ Nominatim reverse (ลองหลายระดับซูมเพื่อให้ได้ชื่อพื้นที่/ประเทศ)
      const tryNominatim = async (z) => {
        const url2 = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=${z}&addressdetails=1&extratags=1&namedetails=1`
        const res2 = await fetch(url2, { headers: { 'Accept-Language': 'th,en' } })
        if (!res2.ok) return null
        const data2 = await res2.json()
        const addr = data2?.address || {}
        const country = addr.country || null
        const city = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || addr.state || null
        if (city || country) return { cityName: city, countryCode: null, countryName: country }
        return null
      }
      let nomi = null
      for (const z of [16, 14, 12, 10]) {
        try { nomi = await tryNominatim(z) } catch { nomi = null }
        if (nomi) return nomi
      }
      return { cityName: null, countryCode: null, countryName: null }
    } catch (err) {
      console.warn('reverseGeocode failed:', err)
      return null
    }
  }
