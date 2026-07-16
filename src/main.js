import * as THREE from 'three'
import { buildTrack } from './track.js'
import {
  createCarMesh, createCarState, stepCar, syncCarMesh,
  resetCarToTrack, resolveCarCollisions,
} from './car.js'
import { aiInput } from './ai.js'
import { updateClouds, buildCoins, updateCoins, createPuffPool } from './scenery.js'
import { buildBeijing } from './beijing.js'
import { applyPaperEdges } from './paper.js'

const TOTAL_LAPS = Number(new URLSearchParams(location.search).get('laps')) || 3
const PHYS_DT = 1 / 120

// ---------- 渲染基础 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
renderer.domElement.id = 'game'
document.body.prepend(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xb5d9ec)
scene.fog = new THREE.Fog(0xd3e7f0, 320, 1400)

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500)

const hemi = new THREE.HemisphereLight(0xd6ecff, 0x6fc255, 1.1)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff4da, 1.7)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -120
sun.shadow.camera.right = 120
sun.shadow.camera.top = 120
sun.shadow.camera.bottom = -120
sun.shadow.camera.far = 450
scene.add(sun, sun.target)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ---------- 赛道与车辆 ----------
const track = buildTrack(scene)
const { samples, N } = track
const scenery = buildBeijing(scene, samples)
const coins = buildCoins(scene, samples)
const puffs = createPuffPool(scene)
let coinCount = 0
let puffAcc = 0

const ROSTER = [
  { name: '你', color: 0x2e7dff, isPlayer: true },
  { name: 'AI·红', color: 0xe53935, skill: 0.97, lane: -2.6 },
  { name: 'AI·黄', color: 0xffb300, skill: 0.92, lane: 0 },
  { name: 'AI·紫', color: 0x8e24aa, skill: 0.87, lane: 2.6 },
]

const cars = ROSTER.map((r, i) => {
  // 发车格:起跑线后方两列排开,玩家在最后
  const row = ROSTER.length - 1 - i
  const idx = (N - 8 - row * 7 + N) % N
  const s = samples[idx]
  const latSign = row % 2 === 0 ? 1 : -1
  const pos = s.pos.clone().addScaledVector(s.nor, latSign * 2.8)
  const state = createCarState(pos, Math.atan2(s.tan.x, s.tan.z))
  state.lap = 0
  state.passedHalf = true
  const mesh = createCarMesh(r.color)
  scene.add(mesh.group)
  syncCarMesh(state, mesh)
  return { ...r, state, mesh, lapTimes: [], best: null, lapStart: 0, finishTime: null, prevNearest: null }
})
const player = cars[0]

// 纸模风:给所有几何体描上白色折痕棱线
applyPaperEdges(scene)

// ---------- 输入 ----------
const keys = new Set()
let anyKeyHook = null
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
  if (e.repeat) return
  keys.add(e.code)
  initAudio()
  if (anyKeyHook) { const h = anyKeyHook; anyKeyHook = null; h() }
  if (e.code === 'KeyC') camMode = (camMode + 1) % 3
  if (e.code === 'KeyR') {
    if (phase === 'finished') location.reload()
    else if (phase === 'race') resetCarToTrack(player.state, track)
  }
})
window.addEventListener('keyup', (e) => keys.delete(e.code))

function playerInput() {
  return {
    up: keys.has('ArrowUp') || keys.has('KeyW'),
    down: keys.has('ArrowDown') || keys.has('KeyS'),
    steer: (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0) - (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0),
    drift: keys.has('Space'),
  }
}

// ---------- 音效 ----------
let audio = null
function initAudio() {
  if (audio) return
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 500
  const gain = ctx.createGain()
  gain.gain.value = 0
  osc.connect(filter).connect(gain).connect(ctx.destination)
  osc.start()
  audio = { ctx, osc, gain }
}
function beep(freq, dur = 0.18, vol = 0.2) {
  if (!audio) return
  const { ctx } = audio
  const o = ctx.createOscillator()
  o.type = 'square'
  o.frequency.value = freq
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
  o.connect(g).connect(ctx.destination)
  o.start()
  o.stop(ctx.currentTime + dur)
}
function coinBeep() {
  beep(988, 0.08, 0.15)
  setTimeout(() => beep(1319, 0.14, 0.15), 70)
}

function updateEngineSound() {
  if (!audio) return
  const v = Math.abs(player.state.vF)
  audio.osc.frequency.value = 65 + v * 3.4
  audio.gain.gain.value = phase === 'race' || phase === 'finished' ? 0.035 + v * 0.0006 : 0
}

// ---------- 比赛流程 ----------
let phase = 'ready'          // ready → countdown → race → finished
let countdownEnd = 0
let raceStart = 0
let raceNow = 0

const overlay = document.getElementById('overlay')
anyKeyHook = startCountdown

function startCountdown() {
  phase = 'countdown'
  countdownEnd = performance.now() + 3000
  let last = 4
  const tick = () => {
    if (phase !== 'countdown') return
    const remain = countdownEnd - performance.now()
    const n = Math.ceil(remain / 1000)
    if (n !== last && n > 0) { last = n; beep(660) }
    if (remain <= 0) {
      beep(1100, 0.4, 0.25)
      overlay.classList.add('hidden')
      phase = 'race'
      raceStart = performance.now()
      for (const c of cars) c.lapStart = raceStart
      return
    }
    overlay.innerHTML = `<div class="big">${n}</div>`
    requestAnimationFrame(tick)
  }
  tick()
}

function fmt(ms) {
  if (ms == null) return '--:--.---'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const t = Math.floor(ms % 1000)
  return `${m}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`
}

function updateLapProgress(car, now) {
  const c = car.state
  const prev = car.prevNearest ?? c.nearest
  if (c.nearest > N / 2) c.passedHalf = true
  if (prev > N - 40 && c.nearest < 40) {
    if (c.passedHalf) {
      if (c.lap >= 1) {
        const lapMs = now - car.lapStart
        car.lapTimes.push(lapMs)
        if (car.best == null || lapMs < car.best) car.best = lapMs
      }
      car.lapStart = now
      c.lap++
      c.passedHalf = false
      if (c.lap > TOTAL_LAPS && !c.finished) {
        c.finished = true
        car.finishTime = now - raceStart
        if (car.isPlayer) finishRace()
      }
    }
  } else if (prev < 40 && c.nearest > N - 40) {
    c.lap--
    c.passedHalf = true
  }
  car.prevNearest = c.nearest
}

function sortKey(car) {
  if (car.finishTime != null) return 1e9 - car.finishTime
  return car.state.lap * N + (car.state.nearest ?? 0)
}
function playerRank() {
  const k = sortKey(player)
  let rank = 1
  for (const c of cars) if (c !== player && sortKey(c) > k) rank++
  return rank
}

function finishRace() {
  phase = 'finished'
  const rank = playerRank()
  const medal = ['🏆', '🥈', '🥉', ''][rank - 1] ?? ''
  overlay.classList.remove('hidden')
  overlay.innerHTML = `
    <h1>${medal} 第 ${rank} 名</h1>
    <div class="result">
      总时间 ${fmt(player.finishTime)}<br>
      最快单圈 ${fmt(player.best)}
    </div>
    <p class="blink">按 R 再来一局</p>`
}

// ---------- HUD ----------
const el = {
  lap: document.getElementById('lap'),
  laps: document.getElementById('laps'),
  time: document.getElementById('time'),
  curlap: document.getElementById('curlap'),
  best: document.getElementById('best'),
  rank: document.getElementById('rank'),
  speed: document.getElementById('speedNum'),
  coins: document.getElementById('coins'),
}
el.laps.textContent = TOTAL_LAPS

function updateHUD(now) {
  const c = player.state
  el.lap.textContent = Math.min(Math.max(c.lap, 1), TOTAL_LAPS)
  el.speed.textContent = Math.round(Math.abs(c.vF) * 3.6)
  if (phase === 'race') {
    el.time.textContent = fmt(now - raceStart)
    el.curlap.textContent = c.lap >= 1 ? fmt(now - player.lapStart) : '0:00.000'
  } else if (phase === 'finished') {
    el.time.textContent = fmt(player.finishTime)
  }
  el.best.textContent = fmt(player.best)
  el.rank.innerHTML = `${playerRank()}<small> / ${cars.length}</small>`
}

// ---------- 小地图 ----------
const mini = document.getElementById('minimap')
const mctx = mini.getContext('2d')
const miniMap = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const s of samples) {
    minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x)
    minZ = Math.min(minZ, s.pos.z); maxZ = Math.max(maxZ, s.pos.z)
  }
  const pad = 16
  const scale = Math.min((mini.width - pad * 2) / (maxX - minX), (mini.height - pad * 2) / (maxZ - minZ))
  const toX = (x) => pad + (x - minX) * scale + (mini.width - pad * 2 - (maxX - minX) * scale) / 2
  const toY = (z) => mini.height - (pad + (z - minZ) * scale + (mini.height - pad * 2 - (maxZ - minZ) * scale) / 2)
  const path = new Path2D()
  samples.forEach((s, i) => (i === 0 ? path.moveTo(toX(s.pos.x), toY(s.pos.z)) : path.lineTo(toX(s.pos.x), toY(s.pos.z))))
  path.closePath()
  return { toX, toY, path }
})()

function drawMinimap() {
  mctx.clearRect(0, 0, mini.width, mini.height)
  mctx.strokeStyle = '#8a7a63'
  mctx.lineWidth = 5
  mctx.lineJoin = 'round'
  mctx.stroke(miniMap.path)
  const s0 = samples[0]
  mctx.fillStyle = '#ffd54a'
  mctx.fillRect(miniMap.toX(s0.pos.x) - 3, miniMap.toY(s0.pos.z) - 3, 6, 6)
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i]
    mctx.beginPath()
    mctx.arc(miniMap.toX(c.state.pos.x), miniMap.toY(c.state.pos.z), c.isPlayer ? 5 : 3.5, 0, Math.PI * 2)
    mctx.fillStyle = '#' + c.color.toString(16).padStart(6, '0')
    mctx.fill()
    if (c.isPlayer) {
      mctx.strokeStyle = '#fff'
      mctx.lineWidth = 2
      mctx.stroke()
    }
  }
}

// ---------- 相机 ----------
let camMode = 0
const camPos = new THREE.Vector3(0, 30, -140)
const camLook = new THREE.Vector3()
const _f = new THREE.Vector3()

function updateCamera(dt) {
  const c = player.state
  _f.set(Math.sin(c.heading), 0, Math.cos(c.heading))
  let target, look, fov
  if (camMode === 0) {
    target = c.pos.clone().addScaledVector(_f, -9.5).setY(4.2)
    look = c.pos.clone().addScaledVector(_f, 4).setY(1.2)
    fov = 62 + Math.min(Math.abs(c.vF) * 0.22, 16)
  } else if (camMode === 1) {
    target = c.pos.clone().addScaledVector(_f, 0.6).setY(1.25)
    look = c.pos.clone().addScaledVector(_f, 25).setY(1.0)
    fov = 70 + Math.min(Math.abs(c.vF) * 0.2, 14)
  } else {
    target = c.pos.clone().addScaledVector(_f, -14).setY(46)
    look = c.pos.clone().setY(0)
    fov = 58
  }
  const k = camMode === 1 ? 1 : 1 - Math.exp(-6 * dt)
  camPos.lerp(target, k)
  camLook.lerp(look, camMode === 1 ? 1 : 1 - Math.exp(-10 * dt))
  camera.position.copy(camPos)
  camera.lookAt(camLook)
  if (Math.abs(camera.fov - fov) > 0.1) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4)
    camera.updateProjectionMatrix()
  }
}

// ---------- 主循环 ----------
let lastT = performance.now()
let acc = 0

function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  raceNow = now

  if (phase === 'race' || phase === 'finished') {
    acc += dt
    while (acc >= PHYS_DT) {
      acc -= PHYS_DT
      const pInput = phase !== 'race'
        ? { up: false, down: true, steer: 0, drift: false }
        : (window.__autopilot ? aiInput(player.state, track, { skill: 0.9, lane: 0 }) : playerInput())
      stepCar(player.state, pInput, PHYS_DT, track)
      for (const c of cars) {
        if (c.isPlayer) continue
        stepCar(c.state, aiInput(c.state, track, c), PHYS_DT, track)
      }
      resolveCarCollisions(cars.map((c) => c.state))
    }
    for (const c of cars) updateLapProgress(c, now)
  }

  for (const c of cars) syncCarMesh(c.state, c.mesh)

  // 场景动画:云飘、金币旋转、漂移烟尘
  updateClouds(scenery.clouds, dt)
  updateCoins(coins, now)
  puffs.update(dt)
  // 剪纸树轻轻摇摆
  for (const p of scenery.props) {
    p.rotation.z = Math.sin(now * 0.0012 + p.userData.phase) * 0.05
  }
  if (phase === 'race') {
    const p = player.state
    // 吃金币
    for (const c of coins) {
      if (c.taken) continue
      const dx = c.mesh.position.x - p.pos.x
      const dz = c.mesh.position.z - p.pos.z
      if (dx * dx + dz * dz < 2.0 * 2.0) {
        c.taken = true
        c.mesh.visible = false
        coinCount++
        el.coins.textContent = coinCount
        coinBeep()
      }
    }
    // 漂移 / 冲上草地时冒烟
    if ((p.drifting || p.onGrass) && Math.abs(p.vF) > 8) {
      puffAcc += dt
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading)
      while (puffAcc > 0.035) {
        puffAcc -= 0.035
        const side = Math.random() < 0.5 ? 1 : -1
        puffs.spawn(new THREE.Vector3(
          p.pos.x - fx * 1.5 + fz * 0.9 * side,
          0.35,
          p.pos.z - fz * 1.5 - fx * 0.9 * side
        ), p.onGrass ? 0xcfe8b0 : 0xffffff)
      }
    } else puffAcc = 0
  }

  // 阳光跟随玩家,保证阴影贴图始终覆盖视野
  sun.position.set(player.state.pos.x + 60, 95, player.state.pos.z + 35)
  sun.target.position.copy(player.state.pos)

  updateCamera(dt)
  updateEngineSound()
  updateHUD(now)
  drawMinimap()
  renderer.render(scene, camera)
}
requestAnimationFrame(frame)
