// 把游戏场景按分组导出成 Wanaka 可用的 GLB + 布局清单(manifest)。
// 只在 export.html 里使用,不参与游戏运行。
// 约定:场景组 GLB 烘焙世界坐标×100(米→引擎单位),在 Wanaka 里全部放在原点;
//       卡丁车/金币 GLB 以模型原点为锚,由实例/逻辑摆放。
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { buildTrack, HALF_W, OUT_BOUND } from './track.js'
import * as B from './beijing.js'
import { buildPaperClouds, buildPaperSun, buildPaperMountains, applyPaperEdges } from './paper.js'
import { createCarMesh } from './car.js'

const SCALE = 100 // 1 m = 100 引擎单位(Wanaka 惯例)

// InstancedMesh 展开成普通 Mesh(GLTFExporter 不导实例;实例色乘进材质色)
function expandInstanced(root) {
  const list = []
  root.traverse((o) => { if (o.isInstancedMesh) list.push(o) })
  for (const im of list) {
    const mats = Array.isArray(im.material) ? im.material : [im.material]
    const m = new THREE.Matrix4()
    const col = new THREE.Color()
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m)
      let useMats = im.material
      if (im.instanceColor) {
        im.getColorAt(i, col)
        const cloned = mats.map((mt) => {
          const c = mt.clone()
          c.color = mt.color.clone().multiply(col)
          return c
        })
        useMats = Array.isArray(im.material) ? cloned : cloned[0]
      }
      const mesh = new THREE.Mesh(im.geometry, useMats)
      mesh.applyMatrix4(m)
      mesh.userData.noEdges = true // 原作 applyPaperEdges 跳过 InstancedMesh,保持一致
      im.parent.add(mesh)
    }
    im.parent.remove(im)
  }
}

// Sprite(云/太阳)→ 十字交叉双面片,任何角度都可读
function spritesToPlanes(root) {
  const sprites = []
  root.traverse((o) => { if (o.isSprite) sprites.push(o) })
  for (const sp of sprites) {
    const g = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({
      map: sp.material.map, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    })
    for (const ry of [0, Math.PI / 2]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(sp.scale.x, sp.scale.y), mat)
      p.rotation.y = ry
      p.userData.noEdges = true
      g.add(p)
    }
    g.position.copy(sp.position)
    sp.parent.add(g)
    sp.parent.remove(sp)
  }
}

// MeshToonMaterial(gradientMap 导不出)→ 无金属 Standard,保色/贴图/透明
function convertMaterials(root) {
  const cache = new Map()
  root.traverse((o) => {
    if (!o.isMesh) return
    const conv = (m) => {
      if (!m || !m.isMeshToonMaterial) return m
      if (cache.has(m)) return cache.get(m)
      const std = new THREE.MeshStandardMaterial({
        color: m.color, map: m.map || null,
        emissive: m.emissive || new THREE.Color(0), metalness: 0, roughness: 0.95,
        transparent: m.transparent, opacity: m.opacity,
        alphaTest: m.alphaTest || 0, side: m.side,
      })
      cache.set(m, std)
      return std
    }
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material)
  })
}

// 贴图 repeat 烘进 UV(KHR_texture_transform 会崩 Wanaka WebGPU,必须避开)
function bakeTextureRepeat(root) {
  root.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      const t = m.map
      if (!t || (t.repeat.x === 1 && t.repeat.y === 1)) continue
      const uv = o.geometry.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * t.repeat.x, uv.getY(i) * t.repeat.y)
      uv.needsUpdate = true
      t.repeat.set(1, 1)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
    }
  })
}

function prepare(tmp) {
  expandInstanced(tmp)
  spritesToPlanes(tmp)
  applyPaperEdges(tmp) // 白色折痕棱线(与原作同一函数)
  convertMaterials(tmp)
  bakeTextureRepeat(tmp)
}

const exporter = new GLTFExporter()

function exportGroup(name, buildFn, { scale = SCALE } = {}) {
  return new Promise((resolve, reject) => {
    const tmp = new THREE.Scene()
    const extra = buildFn(tmp) // 可返回附加数据
    prepare(tmp)
    const root = new THREE.Group()
    root.name = name
    root.scale.setScalar(scale)
    root.add(...[...tmp.children])
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)
    exporter.parse(root, (glb) => {
      const bytes = new Uint8Array(glb)
      let bin = ''
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
      window.__EXPORTS[name] = btoa(bin)
      window.__MANIFEST.assets[name] = {
        file: `${name}.glb`,
        size: { x: +size.x.toFixed(1), y: +size.y.toFixed(1), z: +size.z.toFixed(1) },
        center: { x: +center.x.toFixed(1), y: +center.y.toFixed(1), z: +center.z.toFixed(1) },
        min: { x: +box.min.x.toFixed(1), y: +box.min.y.toFixed(1), z: +box.min.z.toFixed(1) },
        bytes: bytes.length,
      }
      resolve(extra)
    }, reject, { binary: true, onlyVisible: true })
  })
}

async function main() {
  window.__EXPORTS = {}
  window.__MANIFEST = { scale: SCALE, halfW: HALF_W * SCALE, outBound: OUT_BOUND * SCALE, assets: {} }

  // 赛道(路面/黄虚线/白边线/路肩/起点门+格子起跑线),同时拿到采样表
  let track = null
  await exportGroup('track', (tmp) => { track = buildTrack(tmp); return track })
  const { samples, N } = track

  await exportGroup('ground', (tmp) => B.buildPavement(tmp))
  await exportGroup('tiananmen', (tmp) => B.buildTiananmen(tmp))
  await exportGroup('flagpole', (tmp) => B.buildFlagpole(tmp))
  await exportGroup('birdsnest', (tmp) => B.buildBirdsNest(tmp))
  await exportGroup('watercube', (tmp) => B.buildWaterCube(tmp))
  await exportGroup('cctv', (tmp) => B.buildCCTV(tmp))
  await exportGroup('citic', (tmp) => B.buildCiticTower(tmp))
  await exportGroup('cbd', (tmp) => B.buildCBD(tmp))
  await exportGroup('temple', (tmp) => B.buildTempleOfHeaven(tmp))
  await exportGroup('egg', (tmp) => B.buildEgg(tmp))
  await exportGroup('hutong', (tmp) => B.buildHutong(tmp))
  await exportGroup('pagoda', (tmp) => B.buildWhitePagoda(tmp))
  await exportGroup('cityblocks', (tmp) => B.buildCityBlocks(tmp, samples))
  await exportGroup('lanterns', (tmp) => B.buildLanterns(tmp, samples))
  await exportGroup('greenery', (tmp) => { const props = []; B.buildParks(tmp, samples, props); B.buildRoadsideTrees(tmp, samples, props) })
  await exportGroup('mountains', (tmp) => buildPaperMountains(tmp))
  await exportGroup('sky', (tmp) => { buildPaperClouds(tmp); buildPaperSun(tmp) })

  // 卡丁车(原点锚)×4 色 + 金币(原点锚)
  const KART_COLORS = { kart_blue: 0x2e7dff, kart_red: 0xe53935, kart_yellow: 0xffb300, kart_purple: 0x8e24aa }
  for (const [name, color] of Object.entries(KART_COLORS)) {
    await exportGroup(name, (tmp) => { tmp.add(createCarMesh(color).group) })
  }
  await exportGroup('coin', (tmp) => {
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.09, 20)
    geo.rotateX(Math.PI / 2)
    const mat = new THREE.MeshToonMaterial({ color: 0xffc933, emissive: 0x5c4400 })
    tmp.add(new THREE.Mesh(geo, mat))
  })

  // ---- 布局数据(引擎单位) ----
  const M = window.__MANIFEST
  // 采样表:每 3 个取 1(140 条),供逻辑做最近点/横向偏移/护栏
  M.samples = []
  for (let i = 0; i < N; i += 3) {
    const s = samples[i]
    M.samples.push([
      +(s.pos.x * SCALE).toFixed(1), +(s.pos.z * SCALE).toFixed(1),
      +s.tan.x.toFixed(4), +s.tan.z.toFixed(4),
      +s.nor.x.toFixed(4), +s.nor.z.toFixed(4),
    ])
  }
  // 金币(原作 buildCoins 布局)
  M.coins = []
  const lanes = [-3.2, 0, 3.2]
  for (let k = 0; k < 36; k++) {
    const s = samples[(k * 11 + 6) % N]
    const lane = lanes[k % 3]
    M.coins.push({
      x: +((s.pos.x + s.nor.x * lane) * SCALE).toFixed(1),
      z: +((s.pos.z + s.nor.z * lane) * SCALE).toFixed(1),
    })
  }
  // 发车格(原作 main.js:玩家在最后一排),朝向转引擎偏航(yaw0=-Z → deg = 180 - 原作deg)
  M.grid = []
  const roster = ['kart_blue', 'kart_red', 'kart_yellow', 'kart_purple']
  roster.forEach((kart, i) => {
    const row = roster.length - 1 - i
    const idx = (N - 8 - row * 7 + N) % N
    const s = samples[idx]
    const latSign = row % 2 === 0 ? 1 : -1
    const headingDeg = Math.atan2(s.tan.x, s.tan.z) * 180 / Math.PI
    M.grid.push({
      kart,
      x: +((s.pos.x + s.nor.x * latSign * 2.8) * SCALE).toFixed(1),
      z: +((s.pos.z + s.nor.z * latSign * 2.8) * SCALE).toFixed(1),
      yawDeg: +(180 - headingDeg).toFixed(2),
      player: i === 0,
    })
  })

  window.__DONE = true
  document.title = 'EXPORT DONE'
}

main().catch((e) => {
  window.__ERROR = String(e && e.stack || e)
  console.error(e)
})
