<template>
  <div class="minimap-wrap" v-if="atlas.img">
    <div class="sec-hd">Atlas Map</div>
    <canvas
      ref="mmRef"
      class="minimap-canvas"
      @click="onClick"
      @mousemove="onHover"
      @mouseleave="hoverCell = null; draw()"
    ></canvas>
    <div class="minimap-hint">click cell → set row / col</div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { cfg, atlas, player, framesPerRow } from '../store.js'

const mmRef     = ref(null)
const hoverCell = ref(null)

const MINIMAP_MAX_W = 178

function draw() {
  const canvas = mmRef.value
  if (!canvas || !atlas.img) return

  const img = atlas.img
  const s   = Math.min(MINIMAP_MAX_W / img.width, 1)

  canvas.width  = Math.round(img.width  * s)
  canvas.height = Math.round(img.height * s)

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  // Draw atlas thumbnail
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const { fw, fh } = cfg
  const fprow   = framesPerRow.value
  const numCols = fprow
  const numRows = Math.ceil(img.height / fh)

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth   = 0.5

  for (let c = 1; c < numCols; c++) {
    ctx.beginPath()
    ctx.moveTo(c * fw * s, 0)
    ctx.lineTo(c * fw * s, canvas.height)
    ctx.stroke()
  }
  for (let r = 1; r < numRows; r++) {
    ctx.beginPath()
    ctx.moveTo(0, r * fh * s)
    ctx.lineTo(canvas.width, r * fh * s)
    ctx.stroke()
  }

  // Highlight all frames in animation (dim tint)
  for (let i = 0; i < cfg.fc; i++) {
    const abs = cfg.fco + i
    const col = abs % fprow
    const row = cfg.fr + Math.floor(abs / fprow)
    ctx.fillStyle = i === player.frame
      ? 'rgba(91,184,245,0.30)'
      : 'rgba(91,184,245,0.08)'
    ctx.fillRect(col * fw * s, row * fh * s, fw * s, fh * s)
  }

  // Border on current frame
  const curAbs = cfg.fco + player.frame
  const curCol = curAbs % fprow
  const curRow = cfg.fr + Math.floor(curAbs / fprow)
  ctx.strokeStyle = '#5bb8f5'
  ctx.lineWidth   = 1.5
  ctx.strokeRect(curCol * fw * s + 0.5, curRow * fh * s + 0.5, fw * s - 1, fh * s - 1)

  // Hover highlight
  if (hoverCell.value) {
    ctx.fillStyle   = 'rgba(255,255,255,0.12)'
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth   = 1
    const { col, row } = hoverCell.value
    ctx.fillRect  (col * fw * s, row * fh * s, fw * s, fh * s)
    ctx.strokeRect(col * fw * s + 0.5, row * fh * s + 0.5, fw * s - 1, fh * s - 1)
  }
}

function cellFromEvent(e) {
  const canvas = mmRef.value
  if (!canvas || !atlas.img) return null
  const rect = canvas.getBoundingClientRect()
  const s    = canvas.width / atlas.img.width
  const col  = Math.floor((e.clientX - rect.left)  / (cfg.fw * s))
  const row  = Math.floor((e.clientY - rect.top)   / (cfg.fh * s))
  const maxC = framesPerRow.value - 1
  const maxR = Math.floor(atlas.img.height / cfg.fh) - 1
  if (col < 0 || row < 0 || col > maxC || row > maxR) return null
  return { col, row }
}

function onClick(e) {
  const cell = cellFromEvent(e)
  if (!cell) return
  cfg.fr    = cell.row
  cfg.fco   = cell.col
  player.frame = 0
}

function onHover(e) {
  hoverCell.value = cellFromEvent(e)
  draw()
}

watch(
  [() => atlas.img, () => cfg.fw, () => cfg.fh, () => cfg.fr, () => cfg.fco, () => player.frame],
  () => nextTick(draw),
  { flush: 'post' }
)
</script>
