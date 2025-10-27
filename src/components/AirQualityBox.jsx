import React from "react";
import "./AirQualityBox.css";

function getAqiInfo(aqi) {
  const map = {
    1: { th: "ดี", en: "Good", color: "#2ecc71" },
    2: { th: "พอใช้", en: "Fair", color: "#f1c40f" },
    3: { th: "ปานกลาง", en: "Moderate", color: "#e67e22" },
    4: { th: "แย่", en: "Poor", color: "#8d5a2b" },
    5: { th: "แย่มาก", en: "Very Poor", color: "#c0392b" },
  };
  return map[aqi] || { th: "ไม่ทราบ", en: "Unknown", color: "#7f8c8d" };
}

export default function AirQualityBox({ data }) {
  if (!data) return null;

  const { aqi, components } = data;
  const info = getAqiInfo(aqi);

  const pm25 = components?.pm2_5;
  const pm10 = components?.pm10;

  return (
    <div className="aqi-box">
      <div className="aqi-header">คุณภาพอากาศ (AQI)</div>
      <div className="aqi-pill" style={{ backgroundColor: info.color }}>
        {`AQI ${aqi}: ${info.th} (${info.en})`}
      </div>
      <div className="aqi-values">
        <span>PM2.5: {pm25 != null ? Math.round(pm25) : "-"}</span>
        <span>PM10: {pm10 != null ? Math.round(pm10) : "-"}</span>
      </div>
    </div>
  );
}