import * as THREE from 'three'
import { toon } from './toon.js'
import { HALF_W } from './track.js'
import { treeTextures, paperTreeGroup, buildPaperClouds, buildPaperSun, buildPaperMountains } from './paper.js'

let seed = 424242
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647

// 地标占位区,普通楼房避开这些位置
const ZONES = [
  [0, -20, 38],     // 天安门
  [0, -52, 10],     // 旗杆
  [40, 185, 40],    // 鸟巢
  [98, 180, 28],    // 水立方
  [175, 15, 35],    // 央视大楼
  [155, -65, 30],   // 中国尊
  [160, -30, 45],   // CBD
  [-75, -165, 35],  // 天坛
  [-175, 30, 36],   // 国家大剧院
  [-30, 30, 30],    // 胡同 + 白塔
]

function nearTrack2(samples, x, z) {
  let min = Infinity
  for (const s of samples) {
    const dx = s.pos.x - x, dz = s.pos.z - z
    const d2 = dx * dx + dz * dz
    if (d2 < min) min = d2
  }
  return min
}
function inZone(x, z, extra = 0) {
  for (const [zx, zz, zr] of ZONES) {
    const dx = x - zx, dz = z - zz
    if (dx * dx + dz * dz < (zr + extra) * (zr + extra)) return true
  }
  return false
}

export function buildBeijing(scene, samples) {
  const props = [] // 会轻轻摇摆的剪纸道具
  buildPavement(scene)
  buildTiananmen(scene)
  buildFlagpole(scene)
  buildBirdsNest(scene)
  buildWaterCube(scene)
  buildCCTV(scene)
  buildCiticTower(scene)
  buildCBD(scene)
  buildTempleOfHeaven(scene)
  buildEgg(scene)
  buildHutong(scene)
  buildWhitePagoda(scene)
  buildCityBlocks(scene, samples)
  buildLanterns(scene, samples)
  buildParks(scene, samples, props)
  buildRoadsideTrees(scene, samples, props)
  buildPaperMountains(scene)
  buildPaperSun(scene)
  return { clouds: buildPaperClouds(scene), props }
}

export function buildPavement(scene) {
  // 一张张拼起来的灰卡纸,带纸纤维斑点
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#e0ddd4'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(90, 78, 62, ${0.03 + rand() * 0.05})`
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2)
  }
  g.strokeStyle = '#f8f5ec'
  g.lineWidth = 10
  g.strokeRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(26, 26)
  tex.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), toon(0xffffff, { map: tex }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -0.02
  mesh.receiveShadow = true
  scene.add(mesh)
}

// 四坡屋顶:4 段圆柱=方锥台,旋转 45° 对齐,再压扁拉长
function hipRoof(w, d, h, topScale, color) {
  const geo = new THREE.CylinderGeometry(w * 0.5 * topScale, w * 0.5 * 1.42, h, 4)
  geo.rotateY(Math.PI / 4)
  const m = new THREE.Mesh(geo, toon(color))
  m.scale.z = d / w
  return m
}

export function buildTiananmen(scene) {
  const g = new THREE.Group()
  const red = toon(0xb03a2e)
  const darkRed = toon(0x6e1f18)

  // 城台
  const base = new THREE.Mesh(new THREE.BoxGeometry(44, 10, 12), red)
  base.position.y = 5
  g.add(base)
  // 五个门洞(中间最大)
  const holes = [[0, 3.4, 4.6], [-8.5, 3, 4], [8.5, 3, 4], [-16.5, 2.7, 3.6], [16.5, 2.7, 3.6]]
  for (const [x, w, h] of holes) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), darkRed)
    hole.position.set(x, h / 2, -6.1)
    g.add(hole)
  }
  // 白玉栏杆
  const rail = new THREE.Mesh(new THREE.BoxGeometry(45, 1, 13), toon(0xf5f1e8))
  rail.position.y = 10.5
  g.add(rail)
  // 城楼
  const hall = new THREE.Mesh(new THREE.BoxGeometry(30, 5.5, 8), red)
  hall.position.y = 13.75
  g.add(hall)
  // 重檐金顶
  const roof1 = hipRoof(34, 11, 2.4, 0.72, 0xd4ac0d)
  roof1.position.y = 17.7
  g.add(roof1)
  const hall2 = new THREE.Mesh(new THREE.BoxGeometry(26, 2.4, 6.5), red)
  hall2.position.y = 20.1
  g.add(hall2)
  const roof2 = hipRoof(29, 9.5, 2.8, 0.28, 0xd4ac0d)
  roof2.position.y = 22.7
  g.add(roof2)

  g.position.set(0, 0, -20)
  g.rotation.y = Math.PI // 面向南边的起点直道
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  scene.add(g)
}

export function buildFlagpole(scene) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 14, 8), toon(0xe8e8e8))
  pole.position.set(0, 7, -52)
  pole.castShadow = true
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), new THREE.MeshBasicMaterial({ color: 0xe03131, side: THREE.DoubleSide }))
  flag.position.set(1.8, 12.8, -52)
  scene.add(pole, flag)
}

export function buildBirdsNest(scene) {
  const g = new THREE.Group()
  // 外圈钢网:两圈压扁的环
  const ringMat = toon(0xaab4bd)
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(24, 5.5, 10, 28), ringMat)
  ring1.rotation.x = Math.PI / 2
  ring1.scale.set(1, 1.25, 1)
  ring1.position.y = 7
  g.add(ring1)
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(19, 3, 8, 24), ringMat)
  ring2.rotation.x = Math.PI / 2
  ring2.position.y = 11.5
  g.add(ring2)
  // 红色内碗
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(15, 17, 7, 24), toon(0xc0392b))
  bowl.position.y = 4
  g.add(bowl)
  g.position.set(40, 0, 185)
  g.scale.y = 0.8
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  scene.add(g)
}

export function buildWaterCube(scene) {
  // 气泡贴图
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g2 = c.getContext('2d')
  g2.fillStyle = '#74c0fc'
  g2.fillRect(0, 0, 128, 128)
  g2.strokeStyle = 'rgba(255,255,255,0.65)'
  g2.lineWidth = 2
  for (let i = 0; i < 26; i++) {
    g2.beginPath()
    g2.arc(rand() * 128, rand() * 128, 6 + rand() * 12, 0, Math.PI * 2)
    g2.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(30, 11, 30),
    toon(0x9bd4ff, { map: tex, transparent: true, opacity: 0.92 })
  )
  cube.position.set(98, 5.5, 180)
  cube.castShadow = true
  scene.add(cube)
}

export function buildCCTV(scene) {
  // 大裤衩:两根内倾的塔 + 顶部悬挑环
  const g = new THREE.Group()
  const mat = toon(0x7f8fa6)
  const dark = toon(0x57606f)
  const base = new THREE.Mesh(new THREE.BoxGeometry(42, 6, 18), dark)
  base.position.y = 3
  g.add(base)
  const towerA = new THREE.Mesh(new THREE.BoxGeometry(11, 52, 13), mat)
  towerA.position.set(-14, 30, 0)
  towerA.rotation.z = 0.12
  g.add(towerA)
  const towerB = new THREE.Mesh(new THREE.BoxGeometry(11, 52, 13), mat)
  towerB.position.set(14, 30, 0)
  towerB.rotation.z = -0.12
  g.add(towerB)
  const top = new THREE.Mesh(new THREE.BoxGeometry(32, 10, 13), mat)
  top.position.set(0, 58, 0)
  g.add(top)
  const hang = new THREE.Mesh(new THREE.BoxGeometry(12, 16, 13), mat)
  hang.position.set(6, 45, 0)
  g.add(hang)
  g.position.set(175, 0, 15)
  g.rotation.y = -0.5
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  scene.add(g)
}

export function buildCiticTower(scene) {
  // 中国尊:中间收腰、上下外扩
  const g = new THREE.Group()
  const mat = toon(0x9fb3c8)
  const widths = [17, 14.5, 12.5, 11.5, 12, 13.5]
  let y = 0
  for (const w of widths) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 13, w), mat)
    seg.position.y = y + 6.5
    g.add(seg)
    y += 13
  }
  const crown = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 10), toon(0xd4ac0d))
  crown.position.y = y + 1.5
  g.add(crown)
  g.position.set(155, 0, -65)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  scene.add(g)
}

export function buildCBD(scene) {
  const mat = toon(0xb9c7d6)
  for (let i = 0; i < 9; i++) {
    const w = 8 + rand() * 8
    const h = 22 + rand() * 34
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat)
    const ang = rand() * Math.PI * 2
    const r = 22 + rand() * 30
    b.position.set(160 + Math.cos(ang) * r, h / 2, -35 + Math.sin(ang) * r * 0.8)
    b.castShadow = true
    scene.add(b)
  }
}

export function buildTempleOfHeaven(scene) {
  const g = new THREE.Group()
  // 三层汉白玉圆台
  const white = toon(0xf5f1e8)
  for (const [r, y] of [[17, 0.75], [14, 2.25], [11, 3.75]]) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.8, 1.5, 24), white)
    tier.position.y = y
    g.add(tier)
  }
  // 殿身 + 三重蓝琉璃檐
  const hall = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 4, 18), toon(0x8e2f2f))
  hall.position.y = 6.5
  g.add(hall)
  const blue = 0x274b8f
  const eaves = [[9.5, 2.2, 9.2], [7.5, 2.2, 11.6], [5.5, 3.8, 14.6]]
  for (const [r, h, y] of eaves) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 18), toon(blue))
    cone.position.y = y
    g.add(cone)
    if (h < 3) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r - 2.2, r - 2.2, 1.2, 18), toon(0x8e2f2f))
      band.position.y = y + h / 2 + 0.5
      g.add(band)
    }
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), toon(0xd4ac0d))
  tip.position.y = 17
  g.add(tip)
  g.position.set(-75, 0, -165)
  g.scale.setScalar(1.15)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  scene.add(g)
}

export function buildEgg(scene) {
  // 国家大剧院:银色半蛋壳 + 环形水池
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xaeb9c2))
  dome.scale.set(20, 11, 15)
  dome.position.set(-175, 0, 30)
  dome.castShadow = true
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.003, 24, 12, -0.5, 1, 0, Math.PI / 2), toon(0x5c7cfa))
  glass.scale.copy(dome.scale)
  glass.position.copy(dome.position)
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(27, 27, 0.12, 28), toon(0x74c0fc))
  pool.position.set(-175, 0.06, 30)
  scene.add(dome, glass, pool)
}

export function buildHutong(scene) {
  // 一小片灰瓦四合院
  const wall = toon(0x9aa0a6)
  const roofMat = toon(0x5d6d7e)
  const door = toon(0xb03a2e)
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group()
    const w = 5 + rand() * 3
    const d = 4 + rand() * 2
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), wall)
    house.position.y = 1.5
    g.add(house)
    const roof = hipRoof(w + 1.2, d + 1.2, 1.3, 0.15, 0x5d6d7e)
    roof.material = roofMat
    roof.position.y = 3.65
    g.add(roof)
    const dr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.15), door)
    dr.position.set(0, 1, d / 2 + 0.05)
    g.add(dr)
    g.position.set(-42 + (i % 4) * 9 + rand() * 2, 0, 18 + Math.floor(i / 4) * 9 + rand() * 2)
    g.rotation.y = (rand() - 0.5) * 0.3
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    scene.add(g)
  }
}

export function buildWhitePagoda(scene) {
  // 北海白塔
  const g = new THREE.Group()
  const white = toon(0xfafafa)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 2.5, 12), white)
  base.position.y = 1.25
  g.add(base)
  const body = new THREE.Mesh(new THREE.SphereGeometry(3.6, 14, 12), white)
  body.scale.y = 1.15
  body.position.y = 6
  g.add(body)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 3.5, 10), white)
  neck.position.y = 10.5
  g.add(neck)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 10), toon(0xd4ac0d))
  spire.position.y = 14
  g.add(spire)
  g.position.set(-18, 0, 42)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  scene.add(g)
}

export function buildCityBlocks(scene, samples) {
  // 环城普通楼房:白底窗格贴图 + 实例染色
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 64, 128)
  for (let y = 8; y < 118; y += 14) {
    for (let x = 8; x < 54; x += 13) {
      g.fillStyle = rand() < 0.3 ? '#ffe8a3' : '#3d4a5c'
      g.fillRect(x, y, 8, 9)
    }
  }
  // 白色纸边,让每面墙像贴上去的卡纸
  g.strokeStyle = '#ffffff'
  g.lineWidth = 10
  g.strokeRect(0, 0, 64, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const winMat = toon(0xffffff, { map: tex })
  const roofMat = toon(0x8d99a6)
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const mats = [winMat, winMat, roofMat, roofMat, winMat, winMat]

  const spots = []
  let tries = 0
  while (spots.length < 70 && tries++ < 8000) {
    const x = (rand() - 0.5) * 640 + 10
    const z = (rand() - 0.5) * 640 + 20
    if (nearTrack2(samples, x, z) < (HALF_W + 14) * (HALF_W + 14)) continue
    if (inZone(x, z, 8)) continue
    spots.push([x, z])
  }
  const inst = new THREE.InstancedMesh(geo, mats, spots.length)
  inst.castShadow = true
  const cols = [new THREE.Color(0xf2e9dc), new THREE.Color(0xdde3ea), new THREE.Color(0xe8d3c3), new THREE.Color(0xcfe0d8), new THREE.Color(0xf5f5f5)]
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  spots.forEach(([x, z], i) => {
    const w = 9 + rand() * 10
    const h = 10 + rand() * 24
    const d = 9 + rand() * 10
    m.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(w, h, d))
    inst.setMatrixAt(i, m)
    inst.setColorAt(i, cols[i % cols.length])
  })
  scene.add(inst)
}

export function buildLanterns(scene, samples) {
  // 沿赛道的红灯笼路灯
  const N = samples.length
  const idxs = []
  for (let i = 0; i < N; i += 12) idxs.push(i)
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 5.2, 8)
  const lanternGeo = new THREE.SphereGeometry(0.55, 10, 10)
  const tasselGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.5, 6)
  const pole = new THREE.InstancedMesh(poleGeo, toon(0x4a4f57), idxs.length)
  const lantern = new THREE.InstancedMesh(lanternGeo, toon(0xe03131, { emissive: 0x7a1500 }), idxs.length)
  const tassel = new THREE.InstancedMesh(tasselGeo, toon(0xd4ac0d), idxs.length)
  pole.castShadow = true
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const sc = new THREE.Vector3(1, 1, 1)
  const lsc = new THREE.Vector3(1, 1.25, 1)
  idxs.forEach((idx, k) => {
    const s = samples[idx]
    const side = k % 2 === 0 ? 1 : -1
    const p = s.pos.clone().addScaledVector(s.nor, side * (HALF_W + 2.6))
    m.compose(new THREE.Vector3(p.x, 2.6, p.z), q, sc)
    pole.setMatrixAt(k, m)
    m.compose(new THREE.Vector3(p.x, 5.4, p.z), q, lsc)
    lantern.setMatrixAt(k, m)
    m.compose(new THREE.Vector3(p.x, 4.5, p.z), q, sc)
    tassel.setMatrixAt(k, m)
  })
  scene.add(pole, lantern, tassel)
}

let treeTexCache = null

function addPaperTree(scene, props, x, z, sc) {
  if (!treeTexCache) treeTexCache = treeTextures()
  const tree = paperTreeGroup(treeTexCache[Math.floor(rand() * treeTexCache.length)], sc)
  tree.position.set(x, 0, z)
  scene.add(tree)
  props.push(tree)
}

export function buildParks(scene, samples, props) {
  // 几块绿卡纸草坪 + 剪纸树
  const grass = toon(0x7ecf63)
  const spots = []
  let tries = 0
  while (spots.length < 5 && tries++ < 3000) {
    const x = (rand() - 0.5) * 400
    const z = (rand() - 0.5) * 400 + 20
    if (nearTrack2(samples, x, z) < (HALF_W + 22) * (HALF_W + 22)) continue
    if (inZone(x, z, 20)) continue
    spots.push([x, z])
  }
  for (const [x, z] of spots) {
    const r = 16 + rand() * 10
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 20), grass)
    pad.position.set(x, 0.04, z)
    pad.receiveShadow = true
    scene.add(pad)
    const n = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
      const ang = rand() * Math.PI * 2
      const rr = rand() * (r - 5)
      addPaperTree(scene, props, x + Math.cos(ang) * rr, z + Math.sin(ang) * rr, 0.8 + rand() * 0.6)
    }
  }
}

export function buildRoadsideTrees(scene, samples, props) {
  let placed = 0
  let tries = 0
  while (placed < 18 && tries++ < 3000) {
    const x = (rand() - 0.5) * 440
    const z = (rand() - 0.5) * 440 + 20
    if (nearTrack2(samples, x, z) < (HALF_W + 5) * (HALF_W + 5)) continue
    if (inZone(x, z, 4)) continue
    addPaperTree(scene, props, x, z, 0.9 + rand() * 0.7)
    placed++
  }
}
