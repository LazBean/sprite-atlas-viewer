import { Aseprite } from '@pixelation/aseprite'

const CHUNK_OLD_PALETTE_0 = 4
const CHUNK_OLD_PALETTE_1 = 17
const CHUNK_LAYER = 8196
const CHUNK_CEL = 8197
const CHUNK_COLOR_PROFILE = 8199
const CHUNK_TAGS = 8216
const CHUNK_PALETTE = 8217
const CHUNK_USER_DATA = 8224

const CEL_TYPE_LINKED = 1

const BLEND_MODE_TO_COMPOSITE = {
  0: 'source-over',
  1: 'multiply',
  2: 'screen',
  3: 'overlay',
  4: 'darken',
  5: 'lighten',
  6: 'color-dodge',
  7: 'color-burn',
  8: 'hard-light',
  9: 'soft-light',
  10: 'difference',
  11: 'exclusion',
  12: 'hue',
  13: 'saturation',
  14: 'color',
  15: 'luminosity',
  16: 'lighter',
}

class ViewerAseprite extends Aseprite {
  parseFrame(parsedFrames) {
    if (this.readSignedInt32(), this.readUnsignedInt16() !== 61946) {
      throw new Error('Invalid frame magic number')
    }

    const legacyChunkCount = this.readUnsignedInt16()
    const duration = this.readUnsignedInt16()
    this.readBytes(2)

    const chunkCount = this.readUnsignedInt32() || legacyChunkCount
    const frame = {
      duration,
      layers: [],
      userdata: {},
    }

    if (parsedFrames.length > 0) {
      for (const [index, layer] of parsedFrames[0].layers.entries()) {
        frame.layers.push({
          ...layer,
          index,
          cels: [],
          userdata: { ...layer.userdata },
        })
      }
    }

    let userDataTarget = frame
    let hasModernPalette = false
    let legacyPalette = null

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const chunk = this.parseChunk()
      if (!chunk) continue

      switch (chunk.kind) {
        case CHUNK_COLOR_PROFILE:
          break

        case CHUNK_OLD_PALETTE_0:
        case CHUNK_OLD_PALETTE_1:
          legacyPalette = chunk
          break

        case CHUNK_PALETTE:
          hasModernPalette = true
          for (let entryIndex = chunk.start; entryIndex <= chunk.end; entryIndex += 1) {
            const entry = chunk.entries[entryIndex - chunk.start]
            this.palette[entryIndex] = {
              red: entry.red,
              green: entry.green,
              blue: entry.blue,
              alpha: entry.alpha,
            }
          }
          break

        case CHUNK_LAYER: {
          const layer = {
            index: frame.layers.length,
            blend: chunk.blend,
            opacity: chunk.opacity,
            visible: !!(chunk.flags & 1),
            cels: [],
            userdata: {},
          }

          userDataTarget = layer
          frame.layers.push(layer)
          break
        }

        case CHUNK_CEL: {
          const cel = {
            x: chunk.x,
            y: chunk.y,
            z: chunk.z,
            width: chunk.width ?? 0,
            height: chunk.height ?? 0,
            opacity: chunk.opacity,
            pixels: chunk.pixels,
            linkedFrame: chunk.type === CEL_TYPE_LINKED ? chunk.frame : null,
            userdata: {},
          }

          userDataTarget = cel

          if (!frame.layers[chunk.layer]) {
            console.error('Cel found without a layer')
            break
          }

          frame.layers[chunk.layer].cels.push(cel)
          break
        }

        case CHUNK_USER_DATA:
          if (!userDataTarget) break
          if (chunk.flags & 1) userDataTarget.userdata._text = chunk.text
          if (chunk.flags & 2) userDataTarget.userdata._color = chunk.color
          if (chunk.flags & 4) {
            userDataTarget.userdata = {
              ...userDataTarget.userdata,
              ...chunk.data,
            }
          }
          break

        case CHUNK_TAGS:
          this.tags.push(...chunk.tags)
          userDataTarget = null
          break

        default:
          break
      }
    }

    if (!hasModernPalette && legacyPalette) {
      for (const packet of legacyPalette.packets) {
        for (let index = 0; index < packet.colors.length; index += 1) {
          this.palette[packet.offset + index] = {
            red: packet.colors[index][0],
            green: packet.colors[index][1],
            blue: packet.colors[index][2],
            alpha: 255,
          }
        }
      }
    }

    return frame
  }
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getCanvasContext(canvas) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.imageSmoothingEnabled = false
  return ctx
}

function resolveRenderableCel(frames, layerIndex, cel, visited = new Set()) {
  if (!cel) return null

  if (cel.pixels?.length) {
    return {
      source: cel,
      x: cel.x,
      y: cel.y,
      z: cel.z,
      opacity: cel.opacity,
    }
  }

  if (!Number.isInteger(cel.linkedFrame)) return null

  const key = `${layerIndex}:${cel.linkedFrame}:${cel.z}`
  if (visited.has(key)) return null
  visited.add(key)

  const sourceLayer = frames[cel.linkedFrame]?.layers?.[layerIndex]
  if (!sourceLayer) return null

  const sourceCel = sourceLayer.cels.find(entry => (
    entry?.z === cel.z && (entry.pixels?.length || Number.isInteger(entry.linkedFrame))
  )) ?? sourceLayer.cels.find(entry => (
    entry?.pixels?.length || Number.isInteger(entry.linkedFrame)
  ))

  const resolved = resolveRenderableCel(frames, layerIndex, sourceCel, visited)
  if (!resolved) return null

  return {
    ...resolved,
    x: cel.x,
    y: cel.y,
    z: cel.z,
    opacity: cel.opacity,
  }
}

function paintCelPixels(ctx, sprite, cel) {
  const imageData = ctx.createImageData(cel.width, cel.height)
  const output = imageData.data
  const pixels = cel.pixels || []
  const depth = sprite.header.depth
  const transparencyIndex = sprite.header.transparency

  for (let i = 0; i < pixels.length; i += 1) {
    const outIndex = i * 4
    const pixel = pixels[i]

    if (depth === 32) {
      output[outIndex] = pixel?.[0] ?? 0
      output[outIndex + 1] = pixel?.[1] ?? 0
      output[outIndex + 2] = pixel?.[2] ?? 0
      output[outIndex + 3] = pixel?.[3] ?? 255
      continue
    }

    if (depth === 16) {
      const value = pixel?.[0] ?? 0
      output[outIndex] = value
      output[outIndex + 1] = value
      output[outIndex + 2] = value
      output[outIndex + 3] = pixel?.[1] ?? 255
      continue
    }

    const entry = sprite.palette[pixel]
    output[outIndex] = entry?.red ?? 0
    output[outIndex + 1] = entry?.green ?? 0
    output[outIndex + 2] = entry?.blue ?? 0
    output[outIndex + 3] = pixel === transparencyIndex ? 0 : (entry?.alpha ?? 255)
  }

  ctx.putImageData(imageData, 0, 0)
}

function getCelBitmap(sprite, cel, cache) {
  if (cache.has(cel)) return cache.get(cel)

  const canvas = createCanvas(cel.width, cel.height)
  const ctx = getCanvasContext(canvas)
  paintCelPixels(ctx, sprite, cel)
  cache.set(cel, canvas)
  return canvas
}

function compositeFrame(frameCtx, sprite, frameIndex, bitmapCache) {
  const frame = sprite.frames[frameIndex]
  frameCtx.clearRect(0, 0, sprite.width, sprite.height)

  for (const [layerIndex, layer] of frame.layers.entries()) {
    if (!layer.visible) continue

    const renderableCels = layer.cels
      .map(cel => resolveRenderableCel(sprite.frames, layerIndex, cel))
      .filter(Boolean)
      .sort((a, b) => a.z - b.z)

    for (const cel of renderableCels) {
      const alpha = (layer.opacity / 255) * (cel.opacity / 255)
      if (alpha <= 0 || !cel.source.width || !cel.source.height) continue

      frameCtx.save()
      frameCtx.globalAlpha = alpha
      frameCtx.globalCompositeOperation = BLEND_MODE_TO_COMPOSITE[layer.blend] || 'source-over'
      frameCtx.drawImage(getCelBitmap(sprite, cel.source, bitmapCache), cel.x, cel.y)
      frameCtx.restore()
    }
  }
}

export function parseAseprite(buffer) {
  const sprite = new ViewerAseprite(buffer)
  const frameCount = Math.max(1, sprite.frames.length)

  const atlasCanvas = createCanvas(sprite.width * frameCount, sprite.height)
  const atlasCtx = getCanvasContext(atlasCanvas)
  const frameCanvas = createCanvas(sprite.width, sprite.height)
  const frameCtx = getCanvasContext(frameCanvas)
  const bitmapCache = new WeakMap()

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    compositeFrame(frameCtx, sprite, frameIndex, bitmapCache)
    atlasCtx.drawImage(frameCanvas, frameIndex * sprite.width, 0)
  }

  return {
    canvas: atlasCanvas,
    frameWidth: sprite.width,
    frameHeight: sprite.height,
    frameCount,
  }
}
