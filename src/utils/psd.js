/**
 * Minimal PSD composite reader.
 * Reads the merged/flattened image from the Image Data section.
 * Supports: 8-bit RGB and Grayscale, Raw and RLE (PackBits) compression.
 * Requires "Maximize Compatibility" enabled in Photoshop (default).
 */
export function parsePSD(buffer) {
  const dv = new DataView(buffer)
  const u8 = new Uint8Array(buffer)

  if (dv.getUint32(0) !== 0x38425053)
    throw new Error('Not a valid PSD file')

  const version   = dv.getUint16(4)
  const channels  = dv.getUint16(12)
  const height    = dv.getUint32(14)
  const width     = dv.getUint32(18)
  const depth     = dv.getUint16(22)
  const colorMode = dv.getUint16(24)  // 1=Grayscale, 3=RGB

  if (depth !== 8)
    throw new Error(`Only 8-bit PSD supported (file is ${depth}-bit)`)
  if (colorMode !== 3 && colorMode !== 1)
    throw new Error('Only RGB and Grayscale PSD supported')

  let o = 26
  o += 4 + dv.getUint32(o)  // skip Color Mode Data
  o += 4 + dv.getUint32(o)  // skip Image Resources

  // Layer & Mask: 4-byte length (PSD) or 8-byte (PSB)
  if (version === 2) {
    o += 8 + dv.getUint32(o + 4)
  } else {
    o += 4 + dv.getUint32(o)
  }

  const compression = dv.getUint16(o); o += 2
  if (compression > 1)
    throw new Error('ZIP-compressed PSD not supported — re-save without ZIP compression')

  const total = width * height
  const chBufs = []

  if (compression === 0) {
    for (let c = 0; c < channels; c++) {
      chBufs.push(u8.slice(o, o + total))
      o += total
    }
  } else {
    // RLE (PackBits): skip byte-count table, decompress each channel
    o += channels * height * 2
    for (let c = 0; c < channels; c++) {
      const buf = new Uint8Array(total)
      let w = 0
      while (w < total) {
        const n = dv.getInt8(o++)
        if (n === -128) {
          // NOP
        } else if (n >= 0) {
          const cnt = n + 1
          buf.set(u8.subarray(o, o + cnt), w)
          w += cnt; o += cnt
        } else {
          const cnt = 1 - n
          buf.fill(u8[o++], w, w + cnt)
          w += cnt
        }
      }
      chBufs.push(buf)
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const imgData = ctx.createImageData(width, height)
  const px = imgData.data

  for (let i = 0; i < total; i++) {
    const p = i * 4
    if (colorMode === 1) {
      px[p] = px[p + 1] = px[p + 2] = chBufs[0][i]
      px[p + 3] = chBufs[1] ? chBufs[1][i] : 255
    } else {
      px[p]     = chBufs[0] ? chBufs[0][i] : 0
      px[p + 1] = chBufs[1] ? chBufs[1][i] : 0
      px[p + 2] = chBufs[2] ? chBufs[2][i] : 0
      px[p + 3] = chBufs[3] ? chBufs[3][i] : 255
    }
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas
}
