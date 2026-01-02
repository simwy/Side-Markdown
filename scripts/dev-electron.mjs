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
let ignoreChangesUntil = 0

function log(...args) {
  process.stdout.write(`[dev-electron] ${args.join(' ')}\n`)
}

function getElectronBin() {
  // 直接启动 Electron 可执行文件（避免 npx/脚本 wrapper 导致杀不干净，从而出现“双实例”）
  if (process.platform === 'darwin') {
    return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  }
  if (process.platform === 'win32') {
    return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  }
  return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
}

function spawnElectron() {
  const env = { ...process.env }
  // 在 dev 模式下由 Vite 提供页面地址（package.json 的 dev 脚本已注入）
  const cmd = getElectronBin()
  const args = ['.']

  // 刚启动/重启后，dist-electron 往往还会抖动写入一小段时间；忽略这段时间的 watch 事件，避免连环重启
  ignoreChangesUntil = Date.now() + 500

  log('starting Electron...')
  child = spawn(cmd, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    // 让子进程成为新的进程组 leader，便于一次性杀掉整棵树（Electron 会派生 helper）
    detached: process.platform !== 'win32'
  })
  if (process.platform !== 'win32') child.unref()

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
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
        } else {
          // kill process group
          process.kill(-p.pid, 'SIGKILL')
        }
      } catch {}
      resolve()
    }, 1500)

    p.once('exit', () => {
      clearTimeout(killTimeout)
      resolve()
    })

    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        // kill process group
        process.kill(-p.pid, 'SIGTERM')
      }
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
        if (Date.now() < ignoreChangesUntil) return
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

