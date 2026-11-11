// Usage: node server/backup.js [--out <dir>] [--keep <count>]
// Creates <out>/daily-safety-<timestamp>/ containing a consistent SQLite snapshot and a copy of uploads.
// Restore: stop the app, copy daily-safety.sqlite and uploads/ back into the data directory, start the app.
import 'dotenv/config'
import path from 'node:path'
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultDataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(appRoot, 'data')

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

export async function createBackup({ dataDir = defaultDataDir, outDir = path.join(dataDir, 'backups'), keep = 14 } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(outDir, `daily-safety-${stamp}`)
  await mkdir(target, { recursive: true })

  const db = new DatabaseSync(path.join(dataDir, 'daily-safety.sqlite'))
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const snapshot = path.join(target, 'daily-safety.sqlite').replace(/'/g, "''")
    db.exec(`VACUUM INTO '${snapshot}'`)
  } finally {
    db.close()
  }

  const uploads = path.join(dataDir, 'uploads')
  try {
    await stat(uploads)
    await cp(uploads, path.join(target, 'uploads'), { recursive: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const backups = (await readdir(outDir)).filter((name) => name.startsWith('daily-safety-')).sort()
  const stale = backups.slice(0, Math.max(0, backups.length - keep))
  await Promise.all(stale.map((name) => rm(path.join(outDir, name), { recursive: true, force: true })))
  return { target, removed: stale.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await createBackup({ outDir: path.resolve(option('out', path.join(defaultDataDir, 'backups'))), keep: Number(option('keep', '14')) })
  console.log(`Backup created: ${result.target} (removed ${result.removed} old backup(s))`)
}
