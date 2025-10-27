import React, { useRef, useEffect, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { gsap } from 'gsap'

// ใช้ day map ที่ผู้ใช้ระบุ
import EarthDayMap from '../asset/8k_earth_daymap.jpg'

const API_KEY = import.meta.env.VITE_OWM_API_KEY

const clampLat = (lat) => Math.max(-90, Math.min(90, lat))
const wrapLng = (lng) => ((lng + 180) % 360 + 360) % 360 - 180

const LAYER_MAP = {
  clouds: 'clouds_new',
  precipitation: 'precipitation_new',
  pressure: 'pressure_new',
  wind: 'wind_new',
  temperature: 'temp_new',
}

export default function Globe({ position, activeLayers, onSelectPosition, flatView }) {
  const [colorMap] = useLoader(THREE.TextureLoader, [EarthDayMap])

  const groupRef = useRef()
  const markerRef = useRef()
  const pauseUntilRef = useRef(0)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const originalCamRef = useRef({ pos: null, target: new THREE.Vector3(0, 0, 0) })
  const controlsRef = useRef()
  const { camera } = useThree()
  const bwTextureRef = useRef(null)
  const [layerTex, setLayerTex] = useState({})

  // สร้าง texture ขาวดำจากแผนที่สีเพื่อใช้ในโหมด 2D (คล้าย Sample)
  useEffect(() => {
    if (!colorMap || !colorMap.image) return
    const img = colorMap.image
    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imgData.data
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        // แปลงเป็น grayscale (luma)
        const v = 0.299 * r + 0.587 * g + 0.114 * b
        data[i] = data[i + 1] = data[i + 2] = v
      }
      ctx.putImageData(imgData, 0, 0)
      const tex = new THREE.Texture(canvas)
      tex.needsUpdate = true
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      bwTextureRef.current = tex
    } catch (err) {
      console.warn('Failed to build grayscale texture:', err)
      bwTextureRef.current = null
    }
  }, [colorMap])

  // 1) หมุนโลกเองด้วย delta เพื่อให้ลื่นไหล
  // ปิดการหมุนอัตโนมัติ: ไม่หมุนเอง
  useFrame(() => {})

  // ไม่หมุนกลุ่มเพิ่มเติม; จะปรับการแมป texture ด้วย phiStart ของ geometry แทน

  // เมื่อ position เปลี่ยน ให้หมุนลูกโลกไปยัง lat/lon ที่ได้รับ
  // ไม่หมุนไปยังพิกัดอัตโนมัติอีกต่อไป เพื่อให้ควบคุมง่ายและตรงตามการคลิก

  // แปลง lat/lon เป็นตำแหน่งบนทรงกลม
  const latLonToVec3 = (lat, lon, radius = 1.03) => {
    const latRad = THREE.MathUtils.degToRad(clampLat(lat))
    const lonRad = THREE.MathUtils.degToRad(wrapLng(lon))
    // กลับแกน x เพื่อให้ซ้าย-ขวาของเทกซ์เจอร์ตรงกับพิกัดจริง
    const x = -radius * Math.cos(latRad) * Math.cos(lonRad)
    const y = radius * Math.sin(latRad)
    const z = radius * Math.cos(latRad) * Math.sin(lonRad)
    return new THREE.Vector3(x, y, z)
  }

  // Helper: lat/lon => plane coords (width=2, height=1)
  const latLonToPlane = (lat, lon) => {
    const x = THREE.MathUtils.clamp(lon, -180, 180) / 180
    const y = THREE.MathUtils.clamp(lat, -90, 90) / 180
    return new THREE.Vector3(x, y, 0.01)
  }

  // อัปเดตตำแหน่ง marker เมื่อมี position
  useEffect(() => {
    if (position && markerRef.current) {
      const [lat, lon] = position
      if (!flatView) {
        const v = latLonToVec3(lat, lon, 1.03)
        markerRef.current.position.copy(v)
        // หมุน/เลื่อนกล้องให้ไปดูตำแหน่งที่ค้นหา (3D)
        if (camera) {
          // ระยะกล้องคงที่เพื่อดูทั้งโลก
          const camDist = 3
          const dest = latLonToVec3(lat, lon, camDist)
          gsap.to(camera.position, {
            x: dest.x,
            y: dest.y,
            z: dest.z,
            duration: 0.7,
            ease: 'power3.out',
            onUpdate: () => {
              camera.lookAt(0, 0, 0)
              if (controlsRef.current) {
                controlsRef.current.target.set(0, 0, 0)
                controlsRef.current.update()
              }
            }
          })
        }
      } else {
        const p = latLonToPlane(lat, lon)
        markerRef.current.position.copy(p)
      }
    }
  }, [position, flatView])

  // ปรับมุมมองกล้องเมื่อสลับโหมด 2D/3D ให้ “เหมือน Sample”: 2D มองตรง plane และแพน/ซูมได้
  useEffect(() => {
    if (!camera) return
    if (!flatView) {
      // กลับสู่มุมมอง 3D ดั้งเดิม
      const backPos = originalCamRef.current.pos || new THREE.Vector3(2.5, 1.8, 3.2)
      gsap.to(camera.position, { x: backPos.x, y: backPos.y, z: backPos.z, duration: 0.6, ease: 'power2.out' })
      camera.lookAt(0, 0, 0)
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0)
        controlsRef.current.update()
      }
    } else {
      // เก็บตำแหน่งกล้องเดิมไว้
      if (!originalCamRef.current.pos) originalCamRef.current.pos = camera.position.clone()
      // มุมมอง 2D: กล้องอยู่หน้าตรงและห่างพอให้ plane เต็มจอ
      gsap.to(camera.position, { x: 0, y: 0, z: 2.2, duration: 0.5, ease: 'power2.out' })
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0)
        controlsRef.current.update()
      }
    }
  }, [flatView, camera])

  // คลิกบนผิวโลกเพื่อเลือกตำแหน่ง
  const handlePickOnSphere = (e) => {
    e.stopPropagation()
    if (!groupRef.current) return
    pauseUntilRef.current = Date.now() + 2000
    const local = groupRef.current.worldToLocal(e.point.clone())
    const r = local.length()
    if (!r) return
    const latRad = Math.asin(local.y / r)
    // เนื่องจากเรากลับแกน x ใน latLonToVec3 ต้องใช้ -x ในการคำนวณลองจิจูด
    let lonRad = Math.atan2(local.z, -local.x)
    const latDeg = THREE.MathUtils.radToDeg(latRad)
    let lonDegLocal = THREE.MathUtils.radToDeg(lonRad)
    if (lonDegLocal > 180) lonDegLocal -= 360
    if (lonDegLocal < -180) lonDegLocal += 360
    const geoLonDeg = wrapLng(lonDegLocal)
    // วาง marker ตรงจุดที่คลิก (ตรงกับ e.point จริง)
    if (markerRef.current) {
      const pLocal = groupRef.current.worldToLocal(e.point.clone())
      markerRef.current.position.copy(pLocal)
    }
    if (typeof onSelectPosition === 'function') {
      onSelectPosition([clampLat(latDeg), geoLonDeg])
    }
  }

  // คลิกบนแผนที่ 2D เพื่อเลือกพิกัด (ใช้ UV จาก raycaster)
  const handlePickOnPlane = (e) => {
    e.stopPropagation()
    // e.uv: (0..1, 0..1) บน texture
    const uv = e.uv
    if (!uv) return
    const lonDeg = (uv.x - 0.5) * 360
    const latDeg = (0.5 - uv.y) * 180
    if (markerRef.current) {
      const p = latLonToPlane(latDeg, lonDeg)
      markerRef.current.position.copy(p)
    }
    if (typeof onSelectPosition === 'function') {
      onSelectPosition([latDeg, lonDeg])
    }
  }

  // แยกคลิกกับลาก: คลิกซ้ายเลือก, คลิกซ้าย+ลากหมุนลูกโลก
  const onPointerDownSphere = (e) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    isDraggingRef.current = false
  }
  const onPointerMoveSphere = (e) => {
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    if (Math.hypot(dx, dy) > 5) {
      isDraggingRef.current = true
    }
  }
  const onPointerUpSphere = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      return
    }
    handlePickOnSphere(e)
  }

  // โหลดโอเวอร์เลย์สำหรับเลเยอร์ที่เปิดใช้งาน (รวมภาพ tile เป็น texture เดียว)
  useEffect(() => {
    const loadLayerTexture = async (layerKey, z = 2) => {
      const layerName = LAYER_MAP[layerKey]
      if (!layerName) return null
      const tiles = 1 << z
      const size = tiles * 256
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const loadTile = (x, y) =>
        new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            try {
              ctx.drawImage(img, x * 256, y * 256, 256, 256)
              resolve()
            } catch (err) {
              reject(err)
            }
          }
          img.onerror = (e) => reject(e)
          img.src = `https://tile.openweathermap.org/map/${layerName}/${z}/${x}/${y}.png?appid=${API_KEY}`
        })

      const jobs = []
      for (let y = 0; y < tiles; y++) {
        for (let x = 0; x < tiles; x++) {
          jobs.push(loadTile(x, y))
        }
      }
      await Promise.all(jobs)
      const texture = new THREE.Texture(canvas)
      texture.needsUpdate = true
      texture.wrapS = THREE.ClampToEdgeWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.flipY = false
      return texture
    }

    let cancelled = false
    const ensureTexture = async (key) => {
      // ถ้า layer เปิดและยังไม่มี texture -> โหลด
      if (activeLayers?.[key] && !layerTex?.[key]) {
        try {
          const tex = await loadLayerTexture(key, 2)
          if (!cancelled && tex) {
            setLayerTex((prev) => ({ ...prev, [key]: tex }))
          }
        } catch (e) {
          // ignore โหลดล้มเหลว
        }
      }
    }

    ensureTexture('clouds')
    ensureTexture('precipitation')
    ensureTexture('pressure')
    ensureTexture('wind')
    ensureTexture('temperature')

    return () => {
      cancelled = true
    }
  }, [activeLayers, layerTex])

  return (
    <>
      {/* Ambient และ Directional light ตามคำสั่ง */}
      <ambientLight intensity={0.3} />
      <directionalLight color="#ffffff" position={[10, 10, 5]} intensity={1.5} />

      <Stars radius={300} depth={60} count={20000} factor={7} saturation={0} fade />

      {/* แสดงผลตามโหมด: 3D Globe หรือ 2D Map */}
      {!flatView ? (
        <group ref={groupRef} scale={1.25}>
          <mesh
            onPointerDown={onPointerDownSphere}
            onPointerMove={onPointerMoveSphere}
            onPointerUp={onPointerUpSphere}
          >
            <sphereGeometry args={[1, 32, 32, Math.PI, Math.PI * 2]} />
            <meshStandardMaterial map={colorMap} metalness={0.4} roughness={0.7} />
          </mesh>
          {/* โอเวอร์เลย์สภาพอากาศบนผิวโลก (แต่ละเลเยอร์เป็นทรงกลมบาง ๆ ซ้อนกัน) */}
          {activeLayers?.clouds && layerTex?.clouds && (
            <mesh>
              <sphereGeometry args={[1.005, 32, 32, Math.PI, Math.PI * 2]} />
              <meshBasicMaterial map={layerTex.clouds} transparent opacity={0.6} depthWrite={false} />
            </mesh>
          )}
          {activeLayers?.precipitation && layerTex?.precipitation && (
            <mesh>
              <sphereGeometry args={[1.006, 32, 32, Math.PI, Math.PI * 2]} />
              <meshBasicMaterial map={layerTex.precipitation} transparent opacity={0.65} depthWrite={false} />
            </mesh>
          )}
          {activeLayers?.temperature && layerTex?.temperature && (
            <mesh>
              <sphereGeometry args={[1.004, 32, 32, Math.PI, Math.PI * 2]} />
              <meshBasicMaterial map={layerTex.temperature} transparent opacity={0.5} depthWrite={false} />
            </mesh>
          )}
          {activeLayers?.wind && layerTex?.wind && (
            <mesh>
              <sphereGeometry args={[1.007, 32, 32, Math.PI, Math.PI * 2]} />
              <meshBasicMaterial map={layerTex.wind} transparent opacity={0.6} depthWrite={false} />
            </mesh>
          )}
          {activeLayers?.pressure && layerTex?.pressure && (
            <mesh>
              <sphereGeometry args={[1.008, 32, 32, Math.PI, Math.PI * 2]} />
              <meshBasicMaterial map={layerTex.pressure} transparent opacity={0.5} depthWrite={false} />
            </mesh>
          )}
          {position && (
            <mesh ref={markerRef}>
              <sphereGeometry args={[0.012, 16, 16]} />
              <meshBasicMaterial color="#ff3b3b" />
            </mesh>
          )}
        </group>
      ) : (
        <group>
          <mesh
            onPointerDown={(e) => {
              onPointerDownSphere(e)
            }}
            onPointerMove={(e) => {
              onPointerMoveSphere(e)
            }}
            onPointerUp={(e) => {
              if (isDraggingRef.current) {
                isDraggingRef.current = false
                return
              }
              handlePickOnPlane(e)
            }}
          >
            <planeGeometry args={[2, 1, 1, 1]} />
            <meshBasicMaterial map={bwTextureRef.current || colorMap} color="#ffffff" />
          </mesh>
          {position && (
            <mesh ref={markerRef}>
              <sphereGeometry args={[0.012, 16, 16]} />
              <meshBasicMaterial color="#ff3b3b" />
            </mesh>
          )}
        </group>
      )}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableZoom={true}
        enablePan={flatView}
        enableDamping={true}
        dampingFactor={0.08}
        zoomSpeed={1.2}
        minDistance={flatView ? 1.6 : 1.3}
        maxDistance={flatView ? 6 : 12}
        rotateSpeed={0.5}
        enableRotate={!flatView}
        // เมื่อผู้ใช้หมุนกล้อง ไม่เลือก location (onClick จะไม่ยิงหากเป็นการลาก)
      />
    </>
  )
}