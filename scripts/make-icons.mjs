import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const index = row + 1 + x * 4
      const centered = Math.hypot(x - size / 2, y - size / 2)
      let red = 0x0c
      let green = 0x0d
      let blue = 0x0f
      if (centered < size * 0.36) {
        red = 0x14
        green = 0x16
        blue = 0x1a
      }
      const wave = Math.sin((x / size) * Math.PI * 4) * Math.sin((x / size) * Math.PI * 2)
      const waveY = size / 2 + wave * size * 0.12
      if (Math.abs(y - waveY) < size * 0.02 && x > size * 0.18 && x < size * 0.82) {
        red = 0xe8
        green = 0xa3
        blue = 0x17
      }
      raw[index] = red
      raw[index + 1] = green
      raw[index + 2] = blue
      raw[index + 3] = 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', png(192))
writeFileSync('public/icons/icon-512.png', png(512))
