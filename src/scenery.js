import * as THREE from 'three'
import { toon } from './toon.js'
import { HALF_W } from './track.js'

let seed = 987654
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647

function distToTrack2(samples, x, z) {
  let min = Infinity
  for (const s of samples) {
    const dx = s.pos.x - x, dz = s.pos.z - z
    const d2 = dx * dx + dz * dz
    if (d2 < min) min = d2
  }
  return min
}

// 在赛道外围随机撒点:距路面 [minGap, maxDist] 之间
function scatter(samples, count, minGap, range, maxTries = 6000) {
  const pts = []
  let tries = 0
  while (pts.length < count && tries++ < maxTries) {
    const x = (rand() - 0.5) * range
    const z = (rand() - 0.5) * range + 20
    const d2 = distToTrack2(samples, x, z)
    if (d2 < (HALF_W + minGap) * (HALF_W + minGap)) continue
    pts.push([x, z])
  }
  return pts
}

export function buildScenery(scene, samples) {
  buildGround(scene)
  buildTrees(scene, samples)
  buildHills(scene, samples)
  buildMushrooms(scene, samples)
  buildFlowers(scene, samples)
  const clouds = buildClouds(scene)
  return { clouds }
}

function buildGround(scene) {
  // 双色格纹草地,马里奥赛车经典味道
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#7ecf63'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#6fc255'
  g.fillRect(0, 0, 32, 32)
  g.fillRect(32, 32, 32, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(70, 70)
  tex.magFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), toon(0xffffff, { map: tex }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -0.02
  mesh.receiveShadow = true
  scene.add(mesh)
}

function buildTrees(scene, samples) {
  const pts = scatter(samples, 150, 8, 560)
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 2.0, 7)
  const blobGeo = new THREE.SphereGeometry(1.7, 10, 8)
  const topGeo = new THREE.SphereGeometry(1.1, 10, 8)
  const trunk = new THREE.InstancedMesh(trunkGeo, toon(0x8a5a33), pts.length)
  const blob = new THREE.InstancedMesh(blobGeo, toon(0xffffff), pts.length)
  const top = new THREE.InstancedMesh(topGeo, toon(0xffffff), pts.length)
  trunk.castShadow = blob.castShadow = top.castShadow = true
  const greens = [new THREE.Color(0x3fae4e), new THREE.Color(0x59c95f), new THREE.Color(0x2f9e44)]
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  pts.forEach(([x, z], i) => {
    const sc = 0.85 + rand() * 0.8
    const s3 = new THREE.Vector3(sc, sc, sc)
    m.compose(new THREE.Vector3(x, sc, z), q, s3)
    trunk.setMatrixAt(i, m)
    m.compose(new THREE.Vector3(x, 2.9 * sc, z), q, s3)
    blob.setMatrixAt(i, m)
    m.compose(new THREE.Vector3(x + 0.4 * sc, 4.2 * sc, z + 0.2 * sc), q, s3)
    top.setMatrixAt(i, m)
    const col = greens[i % greens.length]
    blob.setColorAt(i, col)
    top.setColorAt(i, greens[(i + 1) % greens.length])
  })
  scene.add(trunk, blob, top)
}

function buildHills(scene, samples) {
  // 远处圆滚滚的青山
  const pts = scatter(samples, 14, 55, 900)
  const geo = new THREE.SphereGeometry(1, 14, 10)
  const cols = [0x54b06a, 0x3f9e63, 0x67c07b]
  pts.forEach(([x, z], i) => {
    const r = 35 + rand() * 55
    const hill = new THREE.Mesh(geo, toon(cols[i % cols.length]))
    hill.scale.set(r, r * (0.3 + rand() * 0.15), r)
    hill.position.set(x * 1.6, 0, z * 1.6)
    scene.add(hill)
  })
}

function buildMushrooms(scene, samples) {
  const pts = scatter(samples, 26, 4, 260)
  // 红底白点蘑菇帽贴图
  const c = document.createElement('canvas')
  c.width = 128; c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#e63946'
  g.fillRect(0, 0, 128, 64)
  g.fillStyle = '#fff'
  for (const [dx, dy, r] of [[20, 18, 9], [58, 30, 11], [96, 14, 8], [112, 40, 7], [36, 46, 7], [78, 52, 6]]) {
    g.beginPath(); g.arc(dx, dy, r, 0, Math.PI * 2); g.fill()
  }
  const capTex = new THREE.CanvasTexture(c)
  capTex.colorSpace = THREE.SRGBColorSpace
  const capGeo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  const stemGeo = new THREE.CylinderGeometry(0.42, 0.5, 1, 8)
  const capMat = toon(0xffffff, { map: capTex })
  const stemMat = toon(0xfff2dd)
  pts.forEach(([x, z]) => {
    const sc = 0.5 + rand() * 0.7
    const stem = new THREE.Mesh(stemGeo, stemMat)
    stem.scale.setScalar(sc)
    stem.position.set(x, 0.5 * sc, z)
    stem.castShadow = true
    const cap = new THREE.Mesh(capGeo, capMat)
    cap.scale.set(1.15 * sc, 0.75 * sc, 1.15 * sc)
    cap.position.set(x, 0.95 * sc, z)
    cap.rotation.y = rand() * Math.PI * 2
    cap.castShadow = true
    scene.add(stem, cap)
  })
}

function buildFlowers(scene, samples) {
  const pts = scatter(samples, 260, 1.5, 420)
  const geo = new THREE.IcosahedronGeometry(0.14, 0)
  const inst = new THREE.InstancedMesh(geo, toon(0xffffff), pts.length)
  const cols = [new THREE.Color(0xffe066), new THREE.Color(0xffffff), new THREE.Color(0xff8fab), new THREE.Color(0xffa94d)]
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3(1, 1, 1)
  pts.forEach(([x, z], i) => {
    m.compose(new THREE.Vector3(x, 0.12, z), q, s)
    inst.setMatrixAt(i, m)
    inst.setColorAt(i, cols[i % cols.length])
  })
  scene.add(inst)
}

export function buildClouds(scene) {
  const clouds = []
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const geo = new THREE.SphereGeometry(1, 10, 8)
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group()
    const n = 3 + Math.floor(rand() * 3)
    for (let j = 0; j < n; j++) {
      const b = new THREE.Mesh(geo, mat)
      const r = 5 + rand() * 6
      b.scale.set(r, r * 0.6, r * 0.8)
      b.position.set((j - n / 2) * r * 1.1, (rand() - 0.5) * 2.5, (rand() - 0.5) * 5)
      g.add(b)
    }
    g.position.set((rand() - 0.5) * 900, 70 + rand() * 50, (rand() - 0.5) * 900)
    g.userData.speed = 1.5 + rand() * 2.5
    scene.add(g)
    clouds.push(g)
  }
  return clouds
}

export function updateClouds(clouds, dt) {
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt
    if (c.position.x > 520) c.position.x = -520
  }
}

// ---------- 金币 ----------
export function buildCoins(scene, samples) {
  const N = samples.length
  const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.09, 20)
  geo.rotateX(Math.PI / 2) // 立起来,像马里奥金币
  const mat = toon(0xffc933, { emissive: 0x5c4400 })
  const lanes = [-3.2, 0, 3.2]
  const coins = []
  for (let k = 0; k < 36; k++) {
    const idx = (k * 11 + 6) % N
    const s = samples[idx]
    const lane = lanes[k % 3]
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(s.pos).addScaledVector(s.nor, lane)
    mesh.position.y = 1.0
    mesh.castShadow = true
    scene.add(mesh)
    coins.push({ mesh, taken: false, phase: k * 0.6 })
  }
  return coins
}

export function updateCoins(coins, now) {
  for (const c of coins) {
    if (c.taken) continue
    c.mesh.rotation.y = now * 0.0035 + c.phase
    c.mesh.position.y = 1.0 + Math.sin(now * 0.004 + c.phase) * 0.15
  }
}

// ---------- 漂移烟尘 ----------
export function createPuffPool(scene) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  const pool = []
  for (let i = 0; i < 70; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })
    const sp = new THREE.Sprite(mat)
    sp.visible = false
    scene.add(sp)
    pool.push({ sp, life: 0, max: 0.55, vel: new THREE.Vector3() })
  }
  let cursor = 0
  return {
    spawn(pos, tint = 0xffffff) {
      const p = pool[cursor]
      cursor = (cursor + 1) % pool.length
      p.life = p.max
      p.sp.visible = true
      p.sp.position.copy(pos)
      p.sp.material.color.setHex(tint)
      p.vel.set((Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2)
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue
        p.life -= dt
        if (p.life <= 0) { p.sp.visible = false; continue }
        p.sp.position.addScaledVector(p.vel, dt)
        const t = 1 - p.life / p.max
        const s = 0.6 + t * 2.4
        p.sp.scale.set(s, s, 1)
        p.sp.material.opacity = (p.life / p.max) * 0.75
      }
    },
  }
}
