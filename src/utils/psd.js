/**
 * Minimal PSD composite reader.
 * Reads the merged image from the Image Data section.
 * Supports 8-bit RGB and Grayscale files with Raw or RLE compression.
 * Requires "Maximize Compatibility" enabled in Photoshop.
 */
export function parsePSD(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  if (view.getUint32(0) !== 0x38425053) {
    throw new Error('Not a valid PSD file')
  }

  const version = view.getUint16(4)
  const channels = view.getUint16(12)
  const height = view.getUint32(14)
  const width = view.getUint32(18)
  const depth = view.getUint16(22)
  const colorMode = view.getUint16(24)

  if (depth !== 8) {
    throw new Error(`Only 8-bit PSD supported (file is ${depth}-bit)`)
  }

  if (colorMode !== 1 && colorMode !== 3) {
    throw new Error('Only RGB and Grayscale PSD supported')
  }

  let offset = 26
  offset += 4 + view.getUint32(offset)
  offset += 4 + view.getUint32(offset)

  if (version === 2) {
    offset += 8 + view.getUint32(offset + 4)
  } else {
    offset += 4 + view.getUint32(offset)
  }

  const compression = view.getUint16(offset)
  offset += 2

  if (compression > 1) {
    throw new Error('ZIP-compressed PSD not supported - re-save without ZIP compression')
  }

  const totalPixels = width * height
  const channelBuffers = []

  if (compression === 0) {
    for (let channel = 0; channel < channels; channel += 1) {
      channelBuffers.push(bytes.slice(offset, offset + totalPixels))
      offset += totalPixels
    }
  } else {
    offset += channels * height * 2

    for (let channel = 0; channel < channels; channel += 1) {
      const output = new Uint8Array(totalPixels)
      let writeOffset = 0

      while (writeOffset < totalPixels) {
        const header = view.getInt8(offset)
        offset += 1

        if (header === -128) continue

        if (header >= 0) {
          const count = header + 1
          output.set(bytes.subarray(offset, offset + count), writeOffset)
          writeOffset += count
          offset += count
          continue
        }

        const count = 1 - header
        output.fill(bytes[offset], writeOffset, writeOffset + count)
        writeOffset += count
        offset += 1
      }

      channelBuffers.push(output)
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(width, height)
  const pixels = imageData.data

  for (let i = 0; i < totalPixels; i += 1) {
    const pixelOffset = i * 4

    if (colorMode === 1) {
      const value = channelBuffers[0][i]
      pixels[pixelOffset] = value
      pixels[pixelOffset + 1] = value
      pixels[pixelOffset + 2] = value
      pixels[pixelOffset + 3] = channelBuffers[1]?.[i] ?? 255
      continue
    }

    pixels[pixelOffset] = channelBuffers[0]?.[i] ?? 0
    pixels[pixelOffset + 1] = channelBuffers[1]?.[i] ?? 0
    pixels[pixelOffset + 2] = channelBuffers[2]?.[i] ?? 0
    pixels[pixelOffset + 3] = channelBuffers[3]?.[i] ?? 255
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}
