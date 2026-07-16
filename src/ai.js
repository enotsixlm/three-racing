import { MAX_SPEED } from './car.js'

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
}

// 根据前方目标点 + 曲率限速生成 AI 输入
export function aiInput(c, track, cfg) {
  const { samples, curv, N } = track
  if (c.nearest == null) return { up: false, down: false, steer: 0, drift: false }

  // 目标点:前方一段距离(随速度加大),带固定车道偏移
  const aheadSamples = Math.round(5 + Math.max(0, c.vF) * 0.45)
  const ti = (c.nearest + aheadSamples) % N
  const s = samples[ti]
  const tx = s.pos.x + s.nor.x * cfg.lane
  const tz = s.pos.z + s.nor.z * cfg.lane

  const desired = Math.atan2(tx - c.pos.x, tz - c.pos.z)
  const dh = wrapAngle(desired - c.heading)
  const steer = Math.max(-1, Math.min(1, dh * 2.6))

  // 前方 30 个采样内最大曲率 → 目标速度
  let maxc = 0
  for (let j = 4; j < 34; j++) maxc = Math.max(maxc, curv[(c.nearest + j) % N])
  let target = 13.5 / Math.sqrt(Math.max(maxc, 0.02))
  target = Math.min(target, MAX_SPEED * cfg.skill)
  target = Math.max(target, 11)

  // 卡住时倒车脱困
  if (Math.abs(c.vF) < 1.5) {
    c._stuck = (c._stuck || 0) + 1
  } else c._stuck = 0
  if (c._stuck > 90 && c._stuck < 180) {
    return { up: false, down: true, steer: -steer, drift: false }
  }
  if (c._stuck >= 180) c._stuck = 0

  return {
    up: c.vF < target,
    down: c.vF > target + 3,
    steer,
    drift: false,
  }
}
