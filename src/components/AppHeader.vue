<template>
  <header>
    <span class="logo">Sprite Atlas</span>
    <div class="vr"></div>
    <div class="status-chip">
      <div class="status-dot" :class="player.status"></div>
      <span class="status-text">{{ player.statusMsg }}</span>
    </div>
    <div class="shortcuts">
      <kbd>Space</kbd> play
      <kbd>Left</kbd><kbd>Right</kbd> frame
      <kbd>Up</kbd><kbd>Down</kbd> row
      <kbd>Scroll</kbd> zoom
      <kbd>Alt+drag</kbd> pan
    </div>
  </header>
</template>

<script setup>
import { player } from '../store.js'
</script>
