import * as THREE from 'three'

// ---------- 剪纸贴图工具:图案外圈加一层"剪刀白边" ----------
function makeOutlined(W, H, draw, border = 6, outlineColor = '#ffffff') {
  const tmp = document.createElement('canvas')
  tmp.width = W; tmp.height = H
  draw(tmp.getContext('2d'))
  // 提取剪影并染成描边色
  const sil = document.createElement('canvas')
  sil.width = W; sil.height = H
  const sg = sil.getContext('2d')
  sg.drawImage(tmp, 0, 0)
  sg.globalCompositeOperation = 'source-in'
  sg.fillStyle = outlineColor
  sg.fillRect(0, 0, W, H)
  // 八方向堆叠剪影 → 白边,再叠原图
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const og = out.getContext('2d')
  for (let a = 0; a < 8; a++) {
    og.drawImage(sil, Math.cos(a * Math.PI / 4) * border, Math.sin(a * Math.PI / 4) * border)
  }
  og.drawImage(tmp, 0, 0)
  const tex = new THREE.CanvasTexture(out)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function circle(g, x, y, r) {
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

export function cutoutMesh(tex, w, h) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })
  )
}

// ---------- 剪纸素材 ----------
export function treeTextures() {
  const variant = (crown, dark) => makeOutlined(128, 176, (g) => {
    g.fillStyle = '#8a5a33'
    g.fillRect(56, 96, 16, 72)
    g.fillStyle = crown
    circle(g, 64, 56, 40)
    circle(g, 34, 84, 28)
    circle(g, 94, 84, 28)
    g.fillStyle = dark
    circle(g, 82, 44, 13)
    circle(g, 44, 68, 10)
    circle(g, 96, 92, 9)
  })
  return [
    variant('#4cae54', '#3c9a46'),
    variant('#63bd57', '#4aa649'),
    variant('#3f9e5e', '#2f8a4e'),
  ]
}

// 底部带转轴的剪纸树,可整体轻轻摇摆
export function paperTreeGroup(tex, s = 1) {
  const g = new THREE.Group()
  const m = cutoutMesh(tex, 7.3 * s, 10 * s)
  m.position.y = 5 * s
  g.add(m)
  g.rotation.y = Math.random() * Math.PI
  g.userData.phase = Math.random() * Math.PI * 2
  return g
}

export function buildPaperClouds(scene) {
  const tex = makeOutlined(256, 128, (g) => {
    g.fillStyle = '#ffffff'
    circle(g, 74, 80, 32)
    circle(g, 122, 58, 42)
    circle(g, 176, 78, 32)
    circle(g, 124, 90, 38)
  }, 8, '#cfe2ef')
  const clouds = []
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    const w = 42 + Math.random() * 46
    sp.scale.set(w, w * 0.5, 1)
    sp.position.set((Math.random() - 0.5) * 950, 85 + Math.random() * 70, (Math.random() - 0.5) * 950)
    sp.userData.speed = 1.5 + Math.random() * 2.5
    scene.add(sp)
    clouds.push(sp)
  }
  return clouds
}

export function buildPaperSun(scene) {
  const tex = makeOutlined(256, 256, (g) => {
    g.fillStyle = '#ffcf4d'
    g.save()
    g.translate(128, 128)
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6)
      g.beginPath()
      g.moveTo(-14, 0)
      g.lineTo(14, 0)
      g.lineTo(0, 120)
      g.closePath()
      g.fill()
    }
    g.restore()
    g.fillStyle = '#ffd166'
    circle(g, 128, 128, 76)
    g.fillStyle = '#ffdd8a'
    circle(g, 128, 128, 58)
  }, 7)
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  sun.scale.set(95, 95, 1)
  sun.position.set(280, 190, -340)
  scene.add(sun)
}

export function buildPaperMountains(scene) {
  const make = (fill, snow) => makeOutlined(512, 224, (g) => {
    g.fillStyle = fill
    g.beginPath()
    g.moveTo(0, 224)
    g.lineTo(0, 150)
    g.lineTo(70, 72)
    g.lineTo(140, 150)
    g.lineTo(215, 42)
    g.lineTo(300, 142)
    g.lineTo(372, 82)
    g.lineTo(442, 160)
    g.lineTo(512, 122)
    g.lineTo(512, 224)
    g.closePath()
    g.fill()
    g.fillStyle = snow
    for (const [px, py] of [[70, 72], [215, 42], [372, 82]]) {
      g.beginPath()
      g.moveTo(px - 24, py + 34)
      g.lineTo(px, py)
      g.lineTo(px + 24, py + 34)
      g.closePath()
      g.fill()
    }
  }, 6)
  const near = make('#9cb8a6', '#f2f7f5')
  const far = make('#c7d8e2', '#ffffff')
  // 两圈纸板山围成立体书舞台
  for (const [tex, r, w, h, n, off] of [[far, 860, 640, 280, 8, 0.4], [near, 680, 500, 220, 8, 0]]) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + off
      const m = cutoutMesh(tex, w, h)
      m.position.set(Math.cos(ang) * r, h * 0.38, Math.sin(ang) * r + 20)
      m.lookAt(0, h * 0.38, 20)
      scene.add(m)
    }
  }
}

// ---------- 折纸折痕:给所有几何体描上白色棱线 ----------
const edgeCache = new Map()

export function applyPaperEdges(root, { threshold = 26, color = 0xfffdf5, opacity = 0.85 } = {}) {
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  const targets = []
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return
    if (o.userData.noEdges) return
    const m = o.material
    if (Array.isArray(m)) return
    if (m.transparent && m.map) return // 剪纸片自带白边,不再描
    targets.push(o)
  })
  for (const o of targets) {
    let eg = edgeCache.get(o.geometry.uuid)
    if (!eg) {
      eg = new THREE.EdgesGeometry(o.geometry, threshold)
      edgeCache.set(o.geometry.uuid, eg)
    }
    if (!eg.attributes.position || eg.attributes.position.count === 0) continue
    o.add(new THREE.LineSegments(eg, mat))
  }
}
