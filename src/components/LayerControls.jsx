import './LayerControls.css'

function LayerControls({
  activeLayers,
  onToggleClouds,
  onTogglePrecipitation,
  onTogglePressure,
  onToggleWind,
  onToggleTemperature,
}) {
  const isCloudsActive = !!activeLayers?.clouds
  const isPrecipActive = !!activeLayers?.precipitation
  const isPressureActive = !!activeLayers?.pressure
  const isWindActive = !!activeLayers?.wind
  const isTempActive = !!activeLayers?.temperature

  return (
    <div className="layer-controls">
      <button className={`layer-btn ${isCloudsActive ? 'active' : ''}`} onClick={onToggleClouds}>
        ☁️ Clouds
      </button>
      <button className={`layer-btn ${isPrecipActive ? 'active' : ''}`} onClick={onTogglePrecipitation}>
        🌧️ Precipitation
      </button>
      <button className={`layer-btn ${isPressureActive ? 'active' : ''}`} onClick={onTogglePressure}>
        🧭 Sea level pressure
      </button>
      <button className={`layer-btn ${isWindActive ? 'active' : ''}`} onClick={onToggleWind}>
        💨 Wind speed
      </button>
      <button className={`layer-btn ${isTempActive ? 'active' : ''}`} onClick={onToggleTemperature}>
        🌡️ Temperature
      </button>
    </div>
  )
}

export default LayerControls