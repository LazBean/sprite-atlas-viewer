<template>
  <AppHeader
    :is-mobile="isMobile"
    :sidebar-open="mobileSidebarOpen"
    @toggle-sidebar="toggleSidebar"
  />

  <main class="app-main" :class="{ 'sidebar-open': isMobile && mobileSidebarOpen }">
    <Sidebar
      :is-mobile="isMobile"
      :open="!isMobile || mobileSidebarOpen"
      @close="closeSidebar"
    />
    <button
      v-if="isMobile && mobileSidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="Close sidebar"
      @click="closeSidebar"
    ></button>
    <Preview />
  </main>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'
import Preview from './components/Preview.vue'
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

const MOBILE_BREAKPOINT = 820

const isMobile = ref(false)
const mobileSidebarOpen = ref(false)

function isEditableTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'TEXTAREA'
  )
}

function closeSidebar() {
  mobileSidebarOpen.value = false
}

function toggleSidebar() {
  if (!isMobile.value) return
  mobileSidebarOpen.value = !mobileSidebarOpen.value
}

function syncViewport() {
  const mobile = window.innerWidth <= MOBILE_BREAKPOINT
  isMobile.value = mobile
  mobileSidebarOpen.value = mobile ? mobileSidebarOpen.value : false
}

function onKey(event) {
  if (event.code === 'Escape' && isMobile.value && mobileSidebarOpen.value) {
    event.preventDefault()
    closeSidebar()
    return
  }

  if (isEditableTarget(event.target)) return
  if (event.code === 'Space')      { event.preventDefault(); togglePlay() }
  if (event.code === 'ArrowRight') { event.preventDefault(); stepFrame(1) }
  if (event.code === 'ArrowLeft')  { event.preventDefault(); stepFrame(-1) }
  if (event.code === 'ArrowUp')    { event.preventDefault(); cfg.fr = Math.max(0, cfg.fr - 1) }
  if (event.code === 'ArrowDown')  { event.preventDefault(); cfg.fr += 1 }
}

watch(cfg, saveCfg, { deep: true })

watch(() => cfg.fc, frameCount => {
  if (player.frame >= frameCount) player.frame = 0
})

watch(() => cfg.pingpong, enabled => {
  if (!enabled) player.ppDir = 1
})

watch(() => cfg.fps, () => {
  player.lastTick = 0
})

let ticker

onMounted(async () => {
  loadCfg()
  await restoreLastSession()
  syncViewport()
  window.addEventListener('resize', syncViewport)
  document.addEventListener('keydown', onKey)
  ticker = setInterval(tickStatus, 1000)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewport)
  document.removeEventListener('keydown', onKey)
  clearInterval(ticker)
  cleanup()
})
</script>
