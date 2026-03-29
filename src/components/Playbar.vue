<template>
  <div class="playbar">
    <button class="pb-btn" title="Previous frame" @click="stepFrame(-1)">Prev</button>
    <button class="pb-btn pb-btn-toggle" :class="{ active: player.playing }" title="Play or pause" @click="togglePlay">
      {{ player.playing ? 'Pause' : 'Play' }}
    </button>
    <button class="pb-btn" title="Next frame" @click="stepFrame(1)">Next</button>

    <div class="pb-vr"></div>

    <div class="frame-ctr">
      <strong>{{ atlas.img ? player.frame + 1 : '-' }}</strong>
      <span class="sep">/</span>
      <span>{{ atlas.img ? cfg.fc : '-' }}</span>
    </div>

    <div ref="scrubRef" class="scrubber" @pointerdown="onScrubDown">
      <div class="scrub-track">
        <div class="scrub-fill" :style="{ width: `${scrubPct}%` }"></div>
        <div class="scrub-thumb" :style="{ left: `${scrubPct}%` }"></div>
        <div class="scrub-ticks">
          <div v-for="i in tickCount" :key="i" class="scrub-tick"></div>
        </div>
      </div>
    </div>

    <div class="atlas-info">
      {{ atlas.img ? `${atlas.img.width}x${atlas.img.height}` : '-' }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { cfg, atlas, player, togglePlay, stepFrame } from '../store.js'

const scrubRef = ref(null)

const scrubPct = computed(() => (cfg.fc > 1 ? (player.frame / (cfg.fc - 1)) * 100 : 0))
const tickCount = computed(() => Math.min(cfg.fc, 128))

let scrubbing = false

function seek(event) {
  const rect = scrubRef.value?.getBoundingClientRect()
  if (!rect || !cfg.fc) return

  const t = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  player.frame = Math.round(t * Math.max(0, cfg.fc - 1))
}

function onScrubDown(event) {
  scrubbing = true
  seek(event)
}

function onGlobalMove(event) {
  if (scrubbing) seek(event)
}

function onGlobalUp() {
  scrubbing = false
}

onMounted(() => {
  window.addEventListener('pointermove', onGlobalMove)
  window.addEventListener('pointerup', onGlobalUp)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onGlobalMove)
  window.removeEventListener('pointerup', onGlobalUp)
})
</script>
