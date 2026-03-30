<template>
  <div v-if="atlas.img" class="minimap-wrap">
    <div class="sec-hd">Atlas Map</div>
    <canvas
      ref="mmRef"
      class="minimap-canvas"
      @click="onClick"
      @mousemove="onHover"
      @mouseleave="hoverCell = null; draw()"
    ></canvas>
    <div class="minimap-hint">click cell -> set row / col</div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { cfg, atlas, player, framesPerRow } from '../store.js'

const mmRef = ref(null)
const hoverCell = ref(null)

const MINIMAP_MAX_W = 178
const MINIMAP_MAX_H = 180

function draw() {
  const canvas = mmRef.value
  if (!canvas || !atlas.img) return

  const img = atlas.img
  const scale = Math.min(MINIMAP_MAX_W / img.width, MINIMAP_MAX_H / img.height, 1)

  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const { fw, fh } = cfg
  const cols = framesPerRow.value
  const rows = Math.ceil(img.height / fh)

  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 0.5

  for (let col = 1; col < cols; col += 1) {
    ctx.beginPath()
    ctx.moveTo(col * fw * scale, 0)
    ctx.lineTo(col * fw * scale, canvas.height)
    ctx.stroke()
  }

  for (let row = 1; row < rows; row += 1) {
    ctx.beginPath()
    ctx.moveTo(0, row * fh * scale)
    ctx.lineTo(canvas.width, row * fh * scale)
    ctx.stroke()
  }

  for (let i = 0; i < cfg.fc; i += 1) {
    const absoluteFrame = cfg.fco + i
    const col = absoluteFrame % cols
    const row = cfg.fr + Math.floor(absoluteFrame / cols)
    ctx.fillStyle = i === player.frame
      ? 'rgba(91,184,245,0.30)'
      : 'rgba(91,184,245,0.08)'
    ctx.fillRect(col * fw * scale, row * fh * scale, fw * scale, fh * scale)
  }

  const currentAbsoluteFrame = cfg.fco + player.frame
  const currentCol = currentAbsoluteFrame % cols
  const currentRow = cfg.fr + Math.floor(currentAbsoluteFrame / cols)
  ctx.strokeStyle = '#5bb8f5'
  ctx.lineWidth = 1.5
  ctx.strokeRect(
    currentCol * fw * scale + 0.5,
    currentRow * fh * scale + 0.5,
    fw * scale - 1,
    fh * scale - 1,
  )

  if (!hoverCell.value) return

  const { col, row } = hoverCell.value
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1
  ctx.fillRect(col * fw * scale, row * fh * scale, fw * scale, fh * scale)
  ctx.strokeRect(col * fw * scale + 0.5, row * fh * scale + 0.5, fw * scale - 1, fh * scale - 1)
}

function cellFromEvent(event) {
  const canvas = mmRef.value
  if (!canvas || !atlas.img) return null

  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null

  const scaleX = rect.width / atlas.img.width
  const scaleY = rect.height / atlas.img.height
  const col = Math.floor((event.clientX - rect.left) / (cfg.fw * scaleX))
  const row = Math.floor((event.clientY - rect.top) / (cfg.fh * scaleY))
  const maxCol = framesPerRow.value - 1
  const maxRow = Math.ceil(atlas.img.height / cfg.fh) - 1

  if (col < 0 || row < 0 || col > maxCol || row > maxRow) return null
  return { col, row }
}

function onClick(event) {
  const cell = cellFromEvent(event)
  if (!cell) return

  cfg.fr = cell.row
  cfg.fco = cell.col
  player.frame = 0
}

function onHover(event) {
  hoverCell.value = cellFromEvent(event)
  draw()
}

watch(
  [() => atlas.img, () => cfg.fw, () => cfg.fh, () => cfg.fr, () => cfg.fco, () => player.frame],
  () => nextTick(draw),
  { flush: 'post' },
)
</script>
