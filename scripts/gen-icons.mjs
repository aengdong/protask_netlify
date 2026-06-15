// public/favicon.svg → PWA PNG 아이콘 생성. `node scripts/gen-icons.mjs`
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg')
const targets = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/icon-maskable-512.png', 512],
]
for (const [path, size] of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path)
  console.log('wrote', path, `${size}x${size}`)
}
