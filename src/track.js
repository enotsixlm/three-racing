import * as THREE from 'three'
import { toon } from './toon.js'

export const HALF_W = 7          // 路面半宽
export const OUT_BOUND = 9       // 超出路肩多远撞上隐形护栏

// 赛道控制点(俯视 x/z 平面,闭合)
const CONTROL = [
  [0, -80], [60, -70], [100, -30], [90, 20], [120, 60], [90, 100],
  [30, 90], [0, 130], [-50, 120], [-90, 70], [-70, 20],
  [-110, -20], [-80, -70], [-30, -90],
].map(([x, z]) => new THREE.Vector3(x, 0, z))

export function buildTrack(scene) {
  const curve = new THREE.CatmullRomCurve3(CONTROL, true, 'catmullrom', 0.5)
  const N = 420
  const samples = []
  for (let i = 0; i < N; i++) {
    const t = i / N
    const pos = curve.getPointAt(t)
    pos.y = 0
    const tan = curve.getTangentAt(t)
    tan.y = 0
    tan.normalize()
    const nor = new THREE.Vector3(-tan.z, 0, tan.x)
    samples.push({ pos, tan, nor })
  }

  // 曲率:当前切线与前方切线的夹角,供 AI 决定过弯速度
  const curv = []
  for (let i = 0; i < N; i++) {
    const a = samples[i].tan
    const b = samples[(i + 6) % N].tan
    curv.push(Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)))
  }

  buildRoad(scene, samples, N)
  buildCenterLine(scene, samples, N)
  buildEdgeLines(scene, samples)
  buildCurbs(scene, samples, N, curv)
  buildStartGate(scene, samples[0])

  return { samples, N, curv, halfW: HALF_W }
}

function buildRoad(scene, samples, N) {
  const positions = new Float32Array(N * 2 * 3)
  const indices = []
  for (let i = 0; i < N; i++) {
    const s = samples[i]
    const L = s.pos.clone().addScaledVector(s.nor, HALF_W)
    const R = s.pos.clone().addScaledVector(s.nor, -HALF_W)
    positions.set([L.x, 0.01, L.z, R.x, 0.01, R.z], i * 6)
    const j = (i + 1) % N
    indices.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, toon(0x6e7480, { side: THREE.DoubleSide }))
  mesh.receiveShadow = true
  scene.add(mesh)
}

function buildCenterLine(scene, samples, N) {
  const step = 4
  const count = Math.floor(N / step)
  const geo = new THREE.BoxGeometry(0.28, 0.02, 2.0)
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe066 })
  const inst = new THREE.InstancedMesh(geo, mat, count)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  for (let k = 0; k < count; k++) {
    const s = samples[k * step]
    q.setFromAxisAngle(up, Math.atan2(s.tan.x, s.tan.z))
    m.compose(new THREE.Vector3(s.pos.x, 0.03, s.pos.z), q, new THREE.Vector3(1, 1, 1))
    inst.setMatrixAt(k, m)
  }
  inst.instanceMatrix.needsUpdate = true
  scene.add(inst)
}

function buildEdgeLines(scene, samples) {
  // 路面两侧白色实线
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff })
  for (const side of [1, -1]) {
    const pts = samples.map((s) =>
      s.pos.clone().addScaledVector(s.nor, side * (HALF_W - 0.25)).setY(0.03))
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    scene.add(new THREE.LineLoop(geo, mat))
  }
}

function buildCurbs(scene, samples, N, curv) {
  // 只在弯道边缘铺红白路肩
  const slots = []
  for (let i = 0; i < N; i += 2) {
    let maxc = 0
    for (let j = -4; j <= 4; j++) maxc = Math.max(maxc, curv[(i + j + N) % N])
    if (maxc > 0.1) slots.push(i)
  }
  const geo = new THREE.BoxGeometry(0.9, 0.1, 4.0)
  const red = new THREE.InstancedMesh(geo, toon(0xff5d5d), slots.length)
  const white = new THREE.InstancedMesh(geo, toon(0xffffff), slots.length)
  let ri = 0, wi = 0
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  for (let k = 0; k < slots.length; k++) {
    const s = samples[slots[k]]
    q.setFromAxisAngle(up, Math.atan2(s.tan.x, s.tan.z))
    for (const side of [1, -1]) {
      const p = s.pos.clone().addScaledVector(s.nor, side * (HALF_W + 0.45))
      p.y = 0.04
      m.compose(p, q, one)
      const useRed = (k + (side === 1 ? 0 : 1)) % 2 === 0
      if (useRed) red.setMatrixAt(ri++, m)
      else white.setMatrixAt(wi++, m)
    }
  }
  red.count = ri
  white.count = wi
  red.instanceMatrix.needsUpdate = true
  white.instanceMatrix.needsUpdate = true
  scene.add(red, white)
}

function makeStartBannerTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = '#e63946'
  g.fillRect(0, 0, 512, 96)
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#1a1a1a'
    g.fillRect(i * 32, 0, 32, 14)
    g.fillStyle = i % 2 ? '#1a1a1a' : '#ffffff'
    g.fillRect(i * 32, 82, 32, 14)
  }
  g.fillStyle = '#ffffff'
  g.font = 'bold 52px Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('S T A R T !', 256, 48)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function buildStartGate(scene, s0) {
  const group = new THREE.Group()
  const heading = Math.atan2(s0.nor.x, s0.nor.z)
  const postMat = toon(0xf4f4f4)
  const postGeo = new THREE.CylinderGeometry(0.3, 0.35, 7, 10)
  const balloonGeo = new THREE.SphereGeometry(0.55, 12, 10)
  const balloonCols = [0xff5d5d, 0xffd43b, 0x4dabf7]
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(postGeo, postMat)
    const p = s0.pos.clone().addScaledVector(s0.nor, side * (HALF_W + 1.2))
    post.position.set(p.x, 3.5, p.z)
    post.castShadow = true
    group.add(post)
    // 门柱顶上的一串气球
    balloonCols.forEach((col, i) => {
      const b = new THREE.Mesh(balloonGeo, toon(col))
      b.position.set(
        p.x + Math.sin(i * 2.1 + side) * 0.7,
        7.4 + (i % 2) * 0.8,
        p.z + Math.cos(i * 2.1 + side) * 0.7
      )
      group.add(b)
    })
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry((HALF_W + 1.2) * 2, 1.6),
    new THREE.MeshBasicMaterial({ map: makeStartBannerTexture(), side: THREE.DoubleSide })
  )
  banner.position.set(s0.pos.x, 6.2, s0.pos.z)
  banner.rotation.y = heading
  group.add(banner)

  // 黑白格起跑线
  const cells = 12
  const cw = (HALF_W * 2) / cells
  for (let i = 0; i < cells; i++) {
    for (let r = 0; r < 2; r++) {
      if ((i + r) % 2 === 0) continue
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(cw, 0.02, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      )
      const lat = -HALF_W + cw * (i + 0.5)
      const p = s0.pos.clone().addScaledVector(s0.nor, lat).addScaledVector(s0.tan, (r - 0.5) * 0.8)
      cell.position.set(p.x, 0.035, p.z)
      cell.rotation.y = Math.atan2(s0.tan.x, s0.tan.z)
      group.add(cell)
    }
  }
  scene.add(group)
}

// 在 hint 附近局部搜索最近采样点(hint 为 null 时全量搜索)
export function findNearest(track, pos, hint) {
  const { samples, N } = track
  let best = -1
  let bestD = Infinity
  if (hint == null) {
    for (let i = 0; i < N; i++) {
      const d = samples[i].pos.distanceToSquared(pos)
      if (d < bestD) { bestD = d; best = i }
    }
  } else {
    for (let j = -18; j <= 18; j++) {
      const i = (hint + j + N) % N
      const d = samples[i].pos.distanceToSquared(pos)
      if (d < bestD) { bestD = d; best = i }
    }
  }
  return best
}

// 相对赛道中心线的带符号横向偏移(正 = nor 方向)
export function lateralOffset(track, pos, idx) {
  const s = track.samples[idx]
  return (pos.x - s.pos.x) * s.nor.x + (pos.z - s.pos.z) * s.nor.z
}
