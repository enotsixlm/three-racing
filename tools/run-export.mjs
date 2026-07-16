// 无头跑 export.html,把 GLB + manifest 落盘到 export_out/
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'export_out')
mkdirSync(outDir, { recursive: true })

const PORT = 5199
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' })
await new Promise((res, rej) => {
  vite.stdout.on('data', (d) => { if (String(d).includes('Local:')) res() })
  vite.stderr.on('data', (d) => process.stderr.write(d))
  vite.on('exit', (c) => rej(new Error('vite exited ' + c)))
  setTimeout(() => rej(new Error('vite start timeout')), 20000)
})

const shell = join(process.env.HOME, 'Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell')
const browser = await chromium.launch({ executablePath: shell, args: ['--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage()
  page.on('console', (m) => console.log('[page]', m.text()))
  await page.goto(`http://localhost:${PORT}/export.html`)
  await page.waitForFunction('window.__DONE || window.__ERROR', null, { timeout: 120000 })
  const err = await page.evaluate('window.__ERROR')
  if (err) throw new Error('harness error: ' + err)
  const names = await page.evaluate('Object.keys(window.__EXPORTS)')
  for (const name of names) {
    const b64 = await page.evaluate(`window.__EXPORTS[${JSON.stringify(name)}]`)
    writeFileSync(join(outDir, `${name}.glb`), Buffer.from(b64, 'base64'))
  }
  const manifest = await page.evaluate('window.__MANIFEST')
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))
  console.log(`exported ${names.length} glbs + manifest.json → ${outDir}`)
} finally {
  await browser.close()
  vite.kill()
}
