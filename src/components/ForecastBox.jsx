import './ForecastBox.css'

// Component ย่อยสำหรับแสดง Icon สภาพอากาศ
const WeatherIcon = ({ icon, alt }) => {
  if (!icon) return null
  return <img src={`https://openweathermap.org/img/wn/${icon}@2x.png`} alt={alt} />
}

// Component ย่อยสำหรับแสดงพยากรณ์รายวัน
const DailyForecastItem = ({ day }) => {
  const date = new Date(day.dt * 1000)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })

  return (
    <li>
      <span>{weekday}</span>
      <WeatherIcon icon={day.weather?.[0]?.icon} alt={day.weather?.[0]?.description} />
      <span>{Math.round(day.temp.max)}°</span>
      <span className="temp-min">{Math.round(day.temp.min)}°</span>
    </li>
  )
}

function ForecastBox({ forecast, isLoading, onClose }) {
  // 1. กำลังโหลด
  if (isLoading) {
    return <div className="forecast-box">Loading...</div>
  }

  // 2. ไม่มีข้อมูลหรือผิดพลาด
  if (!forecast || !forecast.current) {
    return <div className="forecast-box">No forecast data available. Please try another location.</div>
  }

  // 3. มีข้อมูลครบถ้วน
  const { current, daily, timezone, place } = forecast
  const countryName = place?.countryName || null
  const cityName = place?.cityName || null
  const locationName = countryName || (timezone ? timezone.split('/')[1]?.replace('_', ' ') : 'Current Location')

  return (
    <div className="forecast-box">
      {typeof onClose === 'function' && (
        <button className="forecast-close" onClick={onClose} title="ซ่อนพยากรณ์">-</button>
      )}
      <h3>{locationName}</h3>
      {cityName && <p style={{ textAlign: 'center', margin: '0 0 10px 0', color: '#bbb' }}>{cityName}</p>}
      <div className="current-weather">
        <WeatherIcon icon={current.weather?.[0]?.icon} alt={current.weather?.[0]?.main} />
        <div className="current-temp">
          <span>{Math.round(current.temp)}°C</span>
          <p>Feels like {Math.round(current.feels_like)}°C</p>
        </div>
      </div>
      <p className="current-description">{current.weather?.[0]?.main}</p>

      <hr />

      <ul className="daily-list">
        {daily?.slice(1, 6).map((day, index) => (
          <DailyForecastItem key={index} day={day} />
        ))}
      </ul>
    </div>
  )
}

export default ForecastBox