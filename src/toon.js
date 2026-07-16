import * as THREE from 'three'

let grad = null
function gradientMap() {
  if (!grad) {
    // 两阶色阶,纸片一样的平涂光照
    grad = new THREE.DataTexture(new Uint8Array([150, 255]), 2, 1, THREE.RedFormat)
    grad.minFilter = THREE.NearestFilter
    grad.magFilter = THREE.NearestFilter
    grad.needsUpdate = true
  }
  return grad
}

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts })
}
