import * as THREE from 'three'
import { toon } from './toon.js'
import { findNearest, lateralOffset, HALF_W, OUT_BOUND } from './track.js'

const MAX_SPEED = 47        // m/s ≈ 169 km/h
const GRASS_MAX = 17
const ACCEL = 21
const BRAKE = 34
const REVERSE_MAX = 11
const DRAG = 0.45
const WHEELBASE = 2.7
const MAX_STEER = 0.55
const WHEEL_R = 0.42

// 卡丁车 + 圆脑袋车手,马里奥赛车风
export function createCarMesh(color) {
  const group = new THREE.Group()
  const bodyMat = toon(color)
  const darkMat = toon(0x2a2e3a)

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 2.9), bodyMat)
  chassis.position.y = 0.5
  group.add(chassis)

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.3, 0.6), bodyMat)
  bumper.position.set(0, 0.45, 1.6)
  group.add(bumper)

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), bodyMat)
  nose.scale.set(1.2, 0.6, 1)
  nose.position.set(0, 0.62, 1.15)
  group.add(nose)

  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.36, 0.55), bodyMat)
  rear.position.set(0, 0.5, -1.5)
  group.add(rear)

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.66, 0.22), darkMat)
  seat.position.set(0, 1.0, -1.0)
  group.add(seat)

  // 车手
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.44), toon(0xffffff))
  torso.position.set(0, 1.08, -0.62)
  group.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), toon(0xffd9b3))
  head.position.set(0, 1.58, -0.6)
  group.add(head)
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.33, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat)
  cap.position.set(0, 1.6, -0.6)
  group.add(cap)
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.32), bodyMat)
  visor.position.set(0, 1.66, -0.34)
  group.add(visor)

  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.05, 8, 16), darkMat)
  steering.position.set(0, 1.15, -0.02)
  steering.rotation.x = -1.05
  group.add(steering)

  // 大轮子:黑胎 + 灰毂
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.42, 14)
  tireGeo.rotateZ(Math.PI / 2)
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.44, 10)
  hubGeo.rotateZ(Math.PI / 2)
  const tireMat = toon(0x1c1c1c)
  const hubMat = toon(0xd9d9d9)
  const wheels = { spin: [], frontPivots: [] }
  for (const [x, z, front] of [[0.92, 1.3, true], [-0.92, 1.3, true], [0.92, -1.3, false], [-0.92, -1.3, false]]) {
    const wheel = new THREE.Group()
    wheel.add(new THREE.Mesh(tireGeo, tireMat), new THREE.Mesh(hubGeo, hubMat))
    if (front) {
      const pivot = new THREE.Group()
      pivot.position.set(x, WHEEL_R, z)
      pivot.add(wheel)
      group.add(pivot)
      wheels.frontPivots.push(pivot)
    } else {
      wheel.position.set(x, WHEEL_R, z)
      group.add(wheel)
    }
    wheels.spin.push(wheel)
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return { group, wheels }
}

export function createCarState(pos, heading) {
  return {
    pos: pos.clone(),
    heading,
    vF: 0,          // 前向速度
    vR: 0,          // 横向速度
    steer: 0,
    nearest: null,
    lap: 1,
    passedHalf: false,
    finished: false,
    onGrass: false,
    drifting: false,
    wheelSpin: 0,
  }
}

const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _vel = new THREE.Vector3()

export function stepCar(c, input, dt, track) {
  _fwd.set(Math.sin(c.heading), 0, Math.cos(c.heading))
  _right.set(_fwd.z, 0, -_fwd.x)

  if (c.nearest == null) c.nearest = findNearest(track, c.pos, null)
  else c.nearest = findNearest(track, c.pos, c.nearest)
  const lat = lateralOffset(track, c.pos, c.nearest)
  c.onGrass = Math.abs(lat) > HALF_W

  // 纵向受力
  const grassAccel = c.onGrass ? 0.4 : 1
  const maxSpd = c.onGrass ? GRASS_MAX : MAX_SPEED
  if (input.up) c.vF = Math.min(c.vF + ACCEL * grassAccel * dt, maxSpd)
  if (input.down) {
    if (c.vF > 0.5) c.vF -= BRAKE * dt
    else c.vF = Math.max(c.vF - ACCEL * 0.55 * dt, -REVERSE_MAX)
  }
  c.vF -= c.vF * DRAG * (c.onGrass ? 2.2 : 1) * dt
  if (!input.up && !input.down) {
    const roll = 1.8 * dt
    c.vF -= Math.sign(c.vF) * Math.min(Math.abs(c.vF), roll)
  }

  // 横向抓地(漂移/草地时打滑)
  c.drifting = input.drift && Math.abs(c.vF) > 8
  const grip = c.onGrass ? 3.5 : (c.drifting ? 2.0 : 9)
  c.vR *= Math.exp(-grip * dt)

  // 世界速度、位移
  _vel.copy(_fwd).multiplyScalar(c.vF).addScaledVector(_right, c.vR)
  c.pos.addScaledVector(_vel, dt)

  // 隐形护栏:超出边界拉回并消掉向外的速度
  if (Math.abs(lat) > HALF_W + OUT_BOUND) {
    const s = track.samples[c.nearest]
    const side = Math.sign(lat)
    c.pos.x = s.pos.x + s.nor.x * side * (HALF_W + OUT_BOUND)
    c.pos.z = s.pos.z + s.nor.z * side * (HALF_W + OUT_BOUND)
    // 只消掉向外的分量,保留切向速度,让车能贴墙滑动而不是被吸住
    const outX = s.nor.x * side, outZ = s.nor.z * side
    const vn = _vel.x * outX + _vel.z * outZ
    if (vn > 0) {
      _vel.x -= outX * vn
      _vel.z -= outZ * vn
    }
    _vel.multiplyScalar(0.995)
  }

  // 转向 → 偏航
  const steerTarget = input.steer * MAX_STEER
  c.steer += (steerTarget - c.steer) * Math.min(1, dt * 8)
  const effSteer = c.steer / (1 + Math.abs(c.vF) * 0.05)
  let yawRate = (c.vF * Math.tan(effSteer)) / WHEELBASE
  if (c.drifting) yawRate *= 1.2
  yawRate = THREE.MathUtils.clamp(yawRate, -2.4, 2.4)
  c.heading += yawRate * dt

  // 按新朝向重新分解速度
  _fwd.set(Math.sin(c.heading), 0, Math.cos(c.heading))
  _right.set(_fwd.z, 0, -_fwd.x)
  c.vF = _vel.dot(_fwd)
  c.vR = _vel.dot(_right)

  c.wheelSpin += (c.vF / WHEEL_R) * dt
}

export function syncCarMesh(c, mesh) {
  mesh.group.position.copy(c.pos)
  mesh.group.rotation.y = c.heading
  for (const w of mesh.wheels.spin) w.rotation.x = c.wheelSpin
  for (const p of mesh.wheels.frontPivots) p.rotation.y = c.steer * 0.9
}

export function resetCarToTrack(c, track) {
  const idx = c.nearest ?? findNearest(track, c.pos, null)
  const s = track.samples[idx]
  c.pos.copy(s.pos)
  c.heading = Math.atan2(s.tan.x, s.tan.z)
  c.vF = 0
  c.vR = 0
  c.steer = 0
}

// 简单的车-车碰撞:位置分离 + 法向相对速度衰减
export function resolveCarCollisions(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j]
      const dx = b.pos.x - a.pos.x
      const dz = b.pos.z - a.pos.z
      const d2 = dx * dx + dz * dz
      const minD = 2.5
      if (d2 > minD * minD || d2 < 1e-6) continue
      const d = Math.sqrt(d2)
      const nx = dx / d, nz = dz / d
      const push = (minD - d) / 2
      a.pos.x -= nx * push; a.pos.z -= nz * push
      b.pos.x += nx * push; b.pos.z += nz * push
      a.vF *= 0.96; b.vF *= 0.96
    }
  }
}

export { MAX_SPEED }
