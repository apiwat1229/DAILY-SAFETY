// Generates the PWA icons in public/. Run with: node scripts/generate-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')

const BG = '#132e32'
const SHIELD = '#9fe1cb'

const glyph = `
  <path d="M256 92 380 138v116c0 82-55 146-124 176-69-30-124-94-124-176V138Z" fill="${SHIELD}"/>
  <path d="m200 258 40 40 76-84" fill="none" stroke="${BG}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`

const svg = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${BG}"/>${glyph}
</svg>`

await mkdir(path.join(publicDir, 'icons'), { recursive: true })
await writeFile(path.join(publicDir, 'favicon.svg'), svg(true))

const jobs = [
  ['icons/icon-192.png', svg(true), 192],
  ['icons/icon-512.png', svg(true), 512],
  ['icons/maskable-512.png', svg(false), 512],
  ['apple-touch-icon.png', svg(false), 180],
]
for (const [file, markup, size] of jobs) {
  await sharp(Buffer.from(markup)).resize(size, size).png().toFile(path.join(publicDir, file))
  console.log('wrote', file)
}
