<template>
  <header>
    <span class="logo">Sprite Atlas</span>
    <div class="vr"></div>
    <div class="status-chip">
      <div class="status-dot" :class="player.status"></div>
      <span class="status-text">{{ player.statusMsg }}</span>
    </div>

    <div class="shortcuts">
      <div class="shortcut-item">
        <div class="shortcut-keys">
          <kbd :class="{ active: isPressed('Space') }">Space</kbd>
        </div>
        <span class="shortcut-label">play</span>
      </div>

      <div class="shortcut-item">
        <div class="shortcut-keys">
          <kbd :class="{ active: isPressed('ArrowLeft') }">Left</kbd>
          <kbd :class="{ active: isPressed('ArrowRight') }">Right</kbd>
        </div>
        <span class="shortcut-label">frame</span>
      </div>

      <div class="shortcut-item">
        <div class="shortcut-keys">
          <kbd :class="{ active: isPressed('ArrowUp') }">Up</kbd>
          <kbd :class="{ active: isPressed('ArrowDown') }">Down</kbd>
        </div>
        <span class="shortcut-label">row</span>
      </div>

      <div class="shortcut-item">
        <div class="shortcut-keys">
          <kbd :class="{ active: scrollActive }">Scroll</kbd>
        </div>
        <span class="shortcut-label">zoom</span>
      </div>

      <div class="shortcut-item">
        <div class="shortcut-keys">
          <kbd :class="{ active: panModifierActive }">{{ panModifierLabel }}</kbd>
          <kbd :class="{ active: dragActive }">Drag</kbd>
        </div>
        <span class="shortcut-label">pan</span>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { player } from '../store.js'

const pressed = reactive({})
const scrollActive = ref(false)
const dragActive = ref(false)

let scrollTimer = 0

const isMac = computed(() => {
  if (typeof navigator === 'undefined') return false

  const platform =
    navigator.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    ''

  return /Mac|iPhone|iPad|iPod/i.test(platform)
})

const panModifierLabel = computed(() => (isMac.value ? 'Option' : 'Alt'))
const panModifierActive = computed(() => !!pressed.AltLeft || !!pressed.AltRight)

function isPressed(code) {
  return !!pressed[code]
}

function onKeyDown(event) {
  pressed[event.code] = true
}

function onKeyUp(event) {
  pressed[event.code] = false
}

function onPointerDown(event) {
  if (event.button === 1 || event.altKey) dragActive.value = true
}

function onPointerUp() {
  dragActive.value = false
}

function onWheel() {
  scrollActive.value = true
  clearTimeout(scrollTimer)
  scrollTimer = window.setTimeout(() => {
    scrollActive.value = false
  }, 150)
}

function resetStates() {
  Object.keys(pressed).forEach(key => {
    pressed[key] = false
  })
  scrollActive.value = false
  dragActive.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('blur', resetStates)
  window.addEventListener('wheel', onWheel, { passive: true })
})

onUnmounted(() => {
  clearTimeout(scrollTimer)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('blur', resetStates)
  window.removeEventListener('wheel', onWheel)
})
</script>
