/**
 * Pixel Studio (.psp) project reader.
 * The file is a plain UTF-8 JSON document; each layer keeps its bitmap as a
 * base64 PNG inside `_historyJson._source` (the rest of that blob is undo
 * history and is ignored). Frames of the active clip are composited and laid
 * out into a single atlas the viewer can slice.
 */

const MAX_ATLAS_DIM = 8192

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

function decodeText(buffer) {
  const text = new TextDecoder('utf-8').decode(buffer)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeLayerPNG(base64) {
  const blob = new Blob([base64ToBytes(base64)], { type: 'image/png' })
  return createImageBitmap(blob)
}

/**
 * Pixel Studio persists the layer bitmap as `_source` in the layer's history
 * blob. Layers that were never painted may omit it entirely.
 */
function getLayerSource(layer) {
  if (!layer?._historyJson) return ''

  try {
    return JSON.parse(layer._historyJson)?._source || ''
  } catch {
    return ''
  }
}

function pickClip(project) {
  const clips = Array.isArray(project.Clips) ? project.Clips : []
  if (!clips.length) throw new Error('PSP has no clips')

  const index = Number.isInteger(project.ActiveClipIndex) ? project.ActiveClipIndex : 0
  return clips[index] || clips[0]
}

/** Frame delays are per-frame seconds; the viewer only has one global fps. */
function resolveFps(frames) {
  const delays = frames.map(frame => Number(frame?.Delay)).filter(delay => delay > 0)
  if (delays.length !== frames.length) return 0

  const first = delays[0]
  if (!delays.every(delay => Math.abs(delay - first) < 1e-6)) return 0

  const fps = Math.round(1 / first)
  return fps >= 1 && fps <= 60 ? fps : 0
}

function resolveLayout(width, height, frameCount) {
  const columns = Math.max(1, Math.min(frameCount, Math.floor(MAX_ATLAS_DIM / width) || 1))
  const rows = Math.ceil(frameCount / columns)

  if (rows * height > MAX_ATLAS_DIM) {
    throw new Error(`PSP too large to atlas (${frameCount} frames of ${width}x${height})`)
  }

  return { columns, rows }
}

export async function parsePSP(buffer) {
  let project
  try {
    project = JSON.parse(decodeText(buffer))
  } catch {
    throw new Error('Not a valid PSP file')
  }

  const width = Number(project?.Width)
  const height = Number(project?.Height)

  if (!(width > 0) || !(height > 0)) throw new Error('PSP has no canvas size')

  const clip = pickClip(project)
  const frames = Array.isArray(clip.Frames) ? clip.Frames : []
  if (!frames.length) throw new Error('PSP clip has no frames')

  const { columns, rows } = resolveLayout(width, height, frames.length)
  const atlasCanvas = createCanvas(width * columns, height * rows)
  const atlasCtx = getCanvasContext(atlasCanvas)

  for (const [frameIndex, frame] of frames.entries()) {
    const layers = Array.isArray(frame?.Layers) ? frame.Layers : []
    const originX = (frameIndex % columns) * width
    const originY = Math.floor(frameIndex / columns) * height

    for (const layer of layers) {
      if (layer?.Hidden) continue

      const alpha = layer?.Opacity == null ? 1 : Number(layer.Opacity)
      if (!(alpha > 0)) continue

      const source = getLayerSource(layer)
      if (!source) continue

      const bitmap = await decodeLayerPNG(source)

      atlasCtx.save()
      atlasCtx.globalAlpha = Math.min(alpha, 1)
      atlasCtx.drawImage(bitmap, originX + (Number(layer.Sx) || 0), originY + (Number(layer.Sy) || 0))
      atlasCtx.restore()

      bitmap.close?.()
    }
  }

  return {
    canvas: atlasCanvas,
    frameWidth: width,
    frameHeight: height,
    frameCount: frames.length,
    fps: resolveFps(frames),
  }
}
