<template>
  <div class="preview">
    <div
      ref="wrapRef"
      class="canvas-wrap"
      :class="[cfg.bg, { 'drag-active': isDragging }]"
      @wheel.prevent="onWheel"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="stopPan"
      @mouseleave="stopPan"
      @dragenter.prevent="isDragging = true"
      @dragleave="onDragLeave"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <button
        v-if="!atlas.img"
        class="empty-state empty-state-button"
        type="button"
        @click="onOpenFromEmptyState"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*,.psd,.ase,.aseprite"
          style="display:none"
          @change="onFileInput"
        >
        <div ref="gridRef" class="px-grid"></div>
        <div class="empty-label">Drop an image, PSD, or Aseprite file here</div>
        <div class="empty-sub">{{ emptyStateSubtext }}</div>
      </button>

      <canvas
        v-show="atlas.img"
        ref="canvasRef"
        class="main-canvas"
        :style="canvasTransform"
      ></canvas>

      <div v-if="atlas.img" class="scale-badge">
        {{ effectiveScale }}x px
      </div>
    </div>

    <Playbar />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { cfg, atlas, player, advance, hasNativePicker, openDroppedFile, openFile, openLooseFile } from '../store.js'
import Playbar from './Playbar.vue'

const canvasRef = ref(null)
const wrapRef = ref(null)
const gridRef = ref(null)
const fileInputRef = ref(null)
const isDragging = ref(false)

const panX = ref(0)
const panY = ref(0)

let panning = false
let pStartX = 0
let pStartY = 0
let pStartPanX = 0
let pStartPanY = 0
let rafId = 0
let flashTimeout = 0

const effectiveScale = computed(() => {
  if (cfg.scale !== 0) return cfg.scale

  const wrap = wrapRef.value
  if (!wrap || !cfg.fw || !cfg.fh) return 1

  const availableWidth = Math.max(1, wrap.clientWidth - 24)
  const availableHeight = Math.max(1, wrap.clientHeight - 24)

  return Math.max(
    1,
    Math.min(
      Math.floor(availableWidth / cfg.fw),
      Math.floor(availableHeight / cfg.fh),
    ),
  )
})

const emptyStateSubtext = computed(() => (
  hasNativePicker
    ? 'or click Open File in the sidebar'
    : 'or click Open File in the sidebar. After save, pick the file again.'
))

const canvasTransform = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px)`,
}))

function draw() {
  const canvas = canvasRef.value
  if (!canvas || !atlas.img) return

  const ctx = canvas.getContext('2d')
  const { fw, fh, fr, fco } = cfg
  const scale = effectiveScale.value

  canvas.width = fw * scale
  canvas.height = fh * scale
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false

  const framesPerRow = Math.max(1, Math.floor(atlas.img.width / fw))
  const absoluteFrame = fco + player.frame
  const col = absoluteFrame % framesPerRow
  const row = fr + Math.floor(absoluteFrame / framesPerRow)

  ctx.drawImage(atlas.img, col * fw, row * fh, fw, fh, 0, 0, fw * scale, fh * scale)
}

function loop(timestamp) {
  rafId = requestAnimationFrame(loop)
  if (!atlas.img || !player.playing) return

  const interval = 1000 / cfg.fps
  if (timestamp - player.lastTick < interval) return

  player.lastTick = timestamp
  advance()
  draw()
}

function onResize() {
  if (cfg.scale === 0) nextTick(draw)
}

function onWheel(event) {
  const delta = event.deltaY < 0 ? 1 : -1
  const currentScale = cfg.scale === 0 ? effectiveScale.value : cfg.scale
  cfg.scale = Math.max(1, Math.min(16, Math.round(currentScale) + delta))
  panX.value = 0
  panY.value = 0
}

function onMouseDown(event) {
  if (event.button === 1 || (event.button === 0 && event.altKey)) {
    event.preventDefault()
    panning = true
    pStartX = event.clientX
    pStartY = event.clientY
    pStartPanX = panX.value
    pStartPanY = panY.value
  }
}

function onMouseMove(event) {
  if (!panning) return
  panX.value = pStartPanX + (event.clientX - pStartX)
  panY.value = pStartPanY + (event.clientY - pStartY)
}

function stopPan() {
  panning = false
}

function onDragLeave(event) {
  if (!wrapRef.value?.contains(event.relatedTarget)) isDragging.value = false
}

async function onDrop(event) {
  isDragging.value = false
  await openDroppedFile(event.dataTransfer)
}

function onOpenFromEmptyState() {
  if (hasNativePicker) openFile()
  else fileInputRef.value?.click()
}

async function onFileInput(event) {
  const file = event.target.files?.[0]
  if (file) await openLooseFile(file)
  event.target.value = ''
}

watch(
  [() => player.frame, () => atlas.img, () => cfg.fw, () => cfg.fh, () => cfg.fr, () => cfg.fco, () => cfg.scale],
  () => nextTick(draw),
  { flush: 'post' },
)

watch(() => atlas.img, () => {
  if (!atlas.img) return

  nextTick(() => {
    const canvas = canvasRef.value
    if (!canvas) return

    canvas.classList.remove('flash')
    void canvas.offsetWidth
    canvas.classList.add('flash')

    clearTimeout(flashTimeout)
    flashTimeout = window.setTimeout(() => canvas.classList.remove('flash'), 550)
  })
})

watch([() => atlas.img, () => cfg.scale], () => {
  panX.value = 0
  panY.value = 0
})

onMounted(() => {
  if (gridRef.value) {
    const shades = ['#2a2a2a', '#333', '#222', '#3a3a3a', '#292929']
    for (let i = 0; i < 40; i += 1) {
      const cell = document.createElement('span')
      cell.style.background = shades[i % shades.length]
      cell.style.animationDelay = `${i * 0.07}s`
      gridRef.value.appendChild(cell)
    }
  }

  rafId = requestAnimationFrame(loop)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', onResize)
  clearTimeout(flashTimeout)
})
</script>
