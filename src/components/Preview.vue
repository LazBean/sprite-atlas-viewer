<template>
  <div class="preview">
    <div
      class="canvas-wrap"
      :class="[cfg.bg, { 'drag-active': isDragging }]"
      ref="wrapRef"
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
      <!-- Empty state -->
      <div class="empty-state" v-if="!atlas.img">
        <div class="px-grid" ref="gridRef"></div>
        <div class="empty-label">Drop a PNG or PSD here</div>
        <div class="empty-sub">or click Open File in the sidebar</div>
      </div>

      <!-- Main canvas -->
      <canvas
        ref="canvasRef"
        class="main-canvas"
        v-show="atlas.img"
        :style="canvasTransform"
      ></canvas>

      <!-- Scale badge: shows screen pixels per sprite pixel -->
      <div class="scale-badge" v-if="atlas.img">
        {{ effectiveScale }}× px
      </div>
    </div>

    <Playbar />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { cfg, atlas, player, advance, handleFile } from '../store.js'
import Playbar from './Playbar.vue'

const canvasRef  = ref(null)
const wrapRef    = ref(null)
const gridRef    = ref(null)
const isDragging = ref(false)

// Pan state
const panX = ref(0)
const panY = ref(0)
let panning = false
let pStartX = 0, pStartY = 0, pStartPanX = 0, pStartPanY = 0

// Effective integer scale (for rendering)
const effectiveScale = computed(() => {
  if (cfg.scale !== 0) return cfg.scale
  const wrap = wrapRef.value
  if (!wrap || !cfg.fw || !cfg.fh) return 1
  const aw = Math.max(1, wrap.clientWidth  - 24)
  const ah = Math.max(1, wrap.clientHeight - 24)
  return Math.max(1, Math.min(Math.floor(aw / cfg.fw), Math.floor(ah / cfg.fh)))
})

const canvasTransform = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px)`,
}))

// ─── Draw ──────────────────────────────────────────────────
function draw() {
  const canvas = canvasRef.value
  if (!canvas || !atlas.img) return

  const ctx = canvas.getContext('2d')
  const { fw, fh, fr, fco } = cfg
  const s = effectiveScale.value

  canvas.width  = fw * s
  canvas.height = fh * s
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false

  const fprow = Math.max(1, Math.floor(atlas.img.width / fw))
  const abs   = fco + player.frame
  const col   = abs % fprow
  const row   = fr  + Math.floor(abs / fprow)

  ctx.drawImage(atlas.img, col * fw, row * fh, fw, fh, 0, 0, fw * s, fh * s)
}

// ─── Animation loop ────────────────────────────────────────
let rafId

function loop(ts) {
  rafId = requestAnimationFrame(loop)
  if (!atlas.img || !player.playing) return
  const interval = 1000 / cfg.fps
  if (ts - player.lastTick < interval) return
  player.lastTick = ts
  advance()
  draw()
}

// Redraw on state changes (when paused or config changes)
watch(
  [() => player.frame, () => atlas.img, () => cfg.fw, () => cfg.fh,
   () => cfg.fr, () => cfg.fco, () => cfg.scale],
  () => nextTick(draw),
  { flush: 'post' }
)

// Flash green border on atlas reload
let flashTimeout
watch(() => atlas.img, () => {
  if (!atlas.img) return
  nextTick(() => {
    const c = canvasRef.value
    if (!c) return
    c.classList.remove('flash')
    void c.offsetWidth
    c.classList.add('flash')
    clearTimeout(flashTimeout)
    flashTimeout = setTimeout(() => c.classList.remove('flash'), 550)
  })
})

// Reset pan when atlas or scale changes
watch([() => atlas.img, () => cfg.scale], () => {
  panX.value = 0
  panY.value = 0
})

onMounted(() => {
  // Build decorative pixel grid in empty state
  if (gridRef.value) {
    const shades = ['#2a2a2a', '#333', '#222', '#3a3a3a', '#292929']
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('span')
      s.style.background    = shades[i % shades.length]
      s.style.animationDelay = (i * 0.07) + 's'
      gridRef.value.appendChild(s)
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

function onResize() {
  if (cfg.scale === 0) nextTick(draw)
}

// ─── Zoom (mouse wheel) ────────────────────────────────────
// Scroll changes integer scale → crisp pixel art zoom
function onWheel(e) {
  const delta = e.deltaY < 0 ? 1 : -1
  const cur   = cfg.scale === 0 ? effectiveScale.value : cfg.scale
  cfg.scale   = Math.max(1, Math.min(16, Math.round(cur) + delta))
  panX.value  = 0
  panY.value  = 0
}

// ─── Pan (Alt + drag or middle click) ─────────────────────
function onMouseDown(e) {
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault()
    panning    = true
    pStartX    = e.clientX; pStartY = e.clientY
    pStartPanX = panX.value; pStartPanY = panY.value
  }
}

function onMouseMove(e) {
  if (!panning) return
  panX.value = pStartPanX + (e.clientX - pStartX)
  panY.value = pStartPanY + (e.clientY - pStartY)
}

function stopPan() { panning = false }

// ─── Drag & drop ───────────────────────────────────────────
function onDragLeave(e) {
  if (!wrapRef.value.contains(e.relatedTarget)) isDragging.value = false
}

async function onDrop(e) {
  isDragging.value = false
  const file = e.dataTransfer.files[0]
  if (file && (file.type.startsWith('image/') || file.name.endsWith('.psd'))) {
    handleFile(file, false)
  }
}
</script>
