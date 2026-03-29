<template>
  <AppHeader />
  <main>
    <Sidebar />
    <Preview />
  </main>
</template>

<script setup>
import { watch, onMounted, onUnmounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import Sidebar   from './components/Sidebar.vue'
import Preview   from './components/Preview.vue'
import {
  cfg,
  player,
  togglePlay,
  stepFrame,
  saveCfg,
  loadCfg,
  tickStatus,
  cleanup,
  restoreLastSession,
} from './store.js'

// Keyboard shortcuts
function onKey(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
  if (e.code === 'Space')      { e.preventDefault(); togglePlay() }
  if (e.code === 'ArrowRight') { e.preventDefault(); stepFrame(1) }
  if (e.code === 'ArrowLeft')  { e.preventDefault(); stepFrame(-1) }
  if (e.code === 'ArrowUp')    { e.preventDefault(); cfg.fr = Math.max(0, cfg.fr - 1) }
  if (e.code === 'ArrowDown')  { e.preventDefault(); cfg.fr += 1 }
}

// Auto-save config on any change
watch(cfg, saveCfg, { deep: true })

// Clamp frame when fc decreases
watch(() => cfg.fc, fc => {
  if (player.frame >= fc) player.frame = 0
})

// Reset ppDir when ping-pong toggled off
watch(() => cfg.pingpong, on => { if (!on) player.ppDir = 1 })

// Reset lastTick when fps changes (avoid stale timing)
watch(() => cfg.fps, () => { player.lastTick = 0 })

let ticker

onMounted(async () => {
  loadCfg()
  await restoreLastSession()
  document.addEventListener('keydown', onKey)
  ticker = setInterval(tickStatus, 1000)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  clearInterval(ticker)
  cleanup()
})
</script>
