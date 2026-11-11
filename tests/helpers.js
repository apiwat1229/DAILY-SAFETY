// Shared harness: boots the real server against a throwaway data directory.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ADMIN_PASSWORD = 'Admin-test-1'
export const LEADER_PASSWORD = 'Leader-test-1'

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
    probe.on('error', reject)
  })
}

export async function startServer() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'daily-safety-test-'))
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_PASSWORD, LEADER_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  const deadline = Date.now() + 30_000
  for (;;) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) break } catch { /* still starting */ }
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${output}`)
    if (Date.now() > deadline) throw new Error(`Server did not start:\n${output}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return {
    baseUrl,
    dataDir,
    async stop() {
      child.kill()
      await new Promise((resolve) => setTimeout(resolve, 300))
      await rm(dataDir, { recursive: true, force: true }).catch(() => undefined)
    },
  }
}

export class Client {
  constructor(baseUrl) { this.baseUrl = baseUrl; this.cookie = '' }
  async call(method, url, body, headers = {}) {
    const isForm = body instanceof FormData
    const response = await fetch(`${this.baseUrl}${url}`, {
      method,
      headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0]
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    return { status: response.status, json }
  }
}

export async function loginAs(baseUrl, username, password) {
  const client = new Client(baseUrl)
  const result = await client.call('POST', '/api/auth/login', { username, password })
  if (result.status !== 200) throw new Error(`login ${username} failed with ${result.status}`)
  return client
}

export const png = () => sharp({ create: { width: 16, height: 16, channels: 3, background: '#00aa00' } }).png().toBuffer()
export const imageBlob = async () => new Blob([await png()], { type: 'image/png' })
export const employeeBody = (code, nameTh) => ({ employeeCode: code, nameTh, nameEn: '', positionTh: 'พนักงาน', positionEn: '', departmentTh: 'ผลิต', departmentEn: '' })
