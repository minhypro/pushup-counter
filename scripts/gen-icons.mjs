import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(data) {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  let crc = 0xffffffff
  for (const b of data) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const d = Buffer.from(data)
  const lenBuf = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(d.length)
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, d])))
  return Buffer.concat([lenBuf, t, d, crcBuf])
}

function makePNG(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6  // 8-bit RGBA

  const rows = []
  for (let y = 0; y < size; y++) {
    rows.push(0)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      rows.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3])
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.from(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function createIcon(size) {
  const pixels = new Uint8Array(size * size * 4)
  const cx = size / 2, cy = size / 2, r = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > r) { pixels[i+3] = 0; continue }  // transparent

      // zinc-950 background
      let pr = 9, pg = 9, pb = 11, pa = 255

      const nr = r * 0.9
      if (dist <= nr) {
        // Dumbbell icon in emerald-400 (#34d399)
        const nx = dx / (nr * 0.75), ny = dy / (nr * 0.75)
        // Horizontal bar
        if (Math.abs(ny) < 0.12 && Math.abs(nx) < 0.55) {
          pr = 52; pg = 211; pb = 153
        }
        // Left weight plate
        if (Math.sqrt((nx + 0.52) ** 2 + ny ** 2) < 0.22) {
          pr = 52; pg = 211; pb = 153
        }
        // Right weight plate
        if (Math.sqrt((nx - 0.52) ** 2 + ny ** 2) < 0.22) {
          pr = 52; pg = 211; pb = 153
        }
      }

      pixels[i] = pr; pixels[i+1] = pg; pixels[i+2] = pb; pixels[i+3] = pa
    }
  }
  return pixels
}

for (const [size, name] of [[512, 'pwa-512x512'], [192, 'pwa-192x192'], [180, 'apple-touch-icon']]) {
  writeFileSync(`public/${name}.png`, makePNG(size, createIcon(size)))
  console.log(`✓ public/${name}.png`)
}
