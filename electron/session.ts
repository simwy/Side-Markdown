import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { SessionState } from './shared'

const SESSION_FILE = 'session.json'

function getSessionPath() {
  return path.join(app.getPath('userData'), SESSION_FILE)
}

function sanitizeSession(raw: unknown): SessionState {
  const empty: SessionState = { openFilePaths: [], activeFilePath: undefined }
  if (!raw || typeof raw !== 'object') return empty
  const obj = raw as { openFilePaths?: unknown; activeFilePath?: unknown }
  const openFilePaths = Array.isArray(obj.openFilePaths)
    ? obj.openFilePaths.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
    : []
  const activeFilePath = typeof obj.activeFilePath === 'string' && obj.activeFilePath.trim().length > 0 ? obj.activeFilePath.trim() : undefined

  // 去重，保序
  const seen = new Set<string>()
  const uniq: string[] = []
  for (const p of openFilePaths) {
    if (seen.has(p)) continue
    seen.add(p)
    uniq.push(p)
  }

  // 防止极端情况下 session 过大
  const MAX_FILES = 50
  const clipped = uniq.slice(0, MAX_FILES)

  return {
    openFilePaths: clipped,
    activeFilePath: activeFilePath && clipped.includes(activeFilePath) ? activeFilePath : undefined
  }
}

export async function readSession(): Promise<SessionState> {
  try {
    const p = getSessionPath()
    const raw = await fs.readFile(p, 'utf8')
    return sanitizeSession(JSON.parse(raw))
  } catch {
    return { openFilePaths: [], activeFilePath: undefined }
  }
}

export async function writeSession(session: SessionState): Promise<void> {
  const p = getSessionPath()
  const dir = path.dirname(p)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(p, JSON.stringify(sanitizeSession(session), null, 2), 'utf8')
}

