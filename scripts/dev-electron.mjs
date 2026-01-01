import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const watchDirs = [path.join(projectRoot, 'dist-electron')]

/** @type {import('node:child_process').ChildProcess | null} */
let child = null
let restarting = false
let pending = false
let debounceTimer = null

function log(...args) {
  process.stdout.write(`[dev-electron] ${args.join(' ')}\n`)
}

function spawnElectron() {
  const env = { ...process.env }
  // 在 dev 模式下由 Vite 提供页面地址（package.json 的 dev 脚本已注入）
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const args = ['--no', 'electron', '.']

  log('starting Electron...')
  child = spawn(cmd, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit'
  })

  child.on('exit', (code, signal) => {
    child = null
    if (!restarting) log(`Electron exited (code=${code}, signal=${signal})`)
  })
}

async function stopElectron() {
  if (!child) return
  const p = child
  return await new Promise((resolve) => {
    const killTimeout = setTimeout(() => {
      try {
        p.kill('SIGKILL')
      } catch {}
      resolve()
    }, 1500)

    p.once('exit', () => {
      clearTimeout(killTimeout)
      resolve()
    })

    try {
      p.kill('SIGTERM')
    } catch {
      clearTimeout(killTimeout)
      resolve()
    }
  })
}

async function restartElectron(reason) {
  pending = true
  if (restarting) return

  restarting = true
  while (pending) {
    pending = false
    log(`restarting... (${reason})`)
    await stopElectron()
    spawnElectron()
  }
  restarting = false
}

function scheduleRestart(reason) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void restartElectron(reason)
  }, 200)
}

// Watch dist-electron (tsup --watch output)
for (const dir of watchDirs) {
  try {
    watch(
      dir,
      { recursive: true },
      (_eventType, filename) => {
        if (!filename) return
        // ignore sourcemaps noise (still fine to restart, but reduces churn)
        if (String(filename).endsWith('.map')) return
        scheduleRestart(`changed: ${filename}`)
      }
    )
    log(`watching ${dir}`)
  } catch (e) {
    log(`failed to watch ${dir}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

process.on('SIGINT', async () => {
  log('SIGINT, stopping...')
  await stopElectron()
  process.exit(0)
})
process.on('SIGTERM', async () => {
  log('SIGTERM, stopping...')
  await stopElectron()
  process.exit(0)
})

spawnElectron()

