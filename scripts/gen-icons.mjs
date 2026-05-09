// Generate nao_00 PWA icons in Naoclaw warm palette.
// Usage: node scripts/gen-icons.mjs
// Writes PNGs into public/v2/icons/.

import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'v2', 'icons')

const CORAL = '#c96442'
const CREAM = '#faf9f5'
const INK = '#1a1a1a'

// Two icon styles:
//  - "any":      cream square + coral disc + ink "n" wordmark (works everywhere)
//  - "maskable": full-bleed coral with a cream "n" — survives Android safe-zone crops (40% padding)
function svgAny(size) {
  const d = size
  const r = d * 0.18
  const cx = d / 2, cy = d / 2
  const rDisc = d * 0.36
  const fontSize = d * 0.5
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
  <rect width="${d}" height="${d}" rx="${r}" ry="${r}" fill="${CREAM}"/>
  <circle cx="${cx}" cy="${cy}" r="${rDisc}" fill="${CORAL}"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, system-ui, 'Segoe UI', Roboto, Inter, sans-serif"
        font-weight="700" font-size="${fontSize}" fill="${CREAM}">n</text>
</svg>`
}
function svgMaskable(size) {
  const d = size
  const cx = d / 2, cy = d / 2
  const fontSize = d * 0.34
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
  <rect width="${d}" height="${d}" fill="${CORAL}"/>
  <text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, system-ui, 'Segoe UI', Roboto, Inter, sans-serif"
        font-weight="700" font-size="${fontSize}" fill="${CREAM}">n</text>
</svg>`
}
// Apple-touch is full-bleed (iOS rounds it itself).
function svgApple(size) {
  const d = size
  const fontSize = d * 0.5
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
  <rect width="${d}" height="${d}" fill="${CREAM}"/>
  <circle cx="${d/2}" cy="${d/2}" r="${d*0.36}" fill="${CORAL}"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, system-ui, 'Segoe UI', Roboto, Inter, sans-serif"
        font-weight="700" font-size="${fontSize}" fill="${CREAM}">n</text>
</svg>`
}
// Favicon — same shape, smaller wordmark
function svgFavicon(size) {
  const d = size
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
  <rect width="${d}" height="${d}" rx="${d*0.18}" ry="${d*0.18}" fill="${CORAL}"/>
  <text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, system-ui, 'Segoe UI', Roboto, Inter, sans-serif"
        font-weight="700" font-size="${d*0.6}" fill="${CREAM}">n</text>
</svg>`
}

async function renderPng(svg, size, name) {
  const buf = Buffer.from(svg)
  await sharp(buf, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(join(OUT, name))
  console.log('wrote', name)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  await renderPng(svgAny(192),         192, 'icon-192.png')
  await renderPng(svgAny(512),         512, 'icon-512.png')
  await renderPng(svgMaskable(192),    192, 'icon-maskable-192.png')
  await renderPng(svgMaskable(512),    512, 'icon-maskable-512.png')
  await renderPng(svgApple(180),       180, 'apple-touch-icon.png')
  await renderPng(svgFavicon(32),      32,  'favicon-32.png')
  // Save the source SVGs alongside, for future regen.
  await writeFile(join(OUT, '_source-any-512.svg'),      svgAny(512))
  await writeFile(join(OUT, '_source-maskable-512.svg'), svgMaskable(512))
}
main().catch(err => { console.error(err); process.exit(1) })
