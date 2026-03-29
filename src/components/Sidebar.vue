<template>
  <aside class="sidebar">
    <div class="sidebar-controls">
      <div class="sec">
        <div class="sec-hd">Atlas</div>
        <button class="open-btn" @click="onOpen">Open File...</button>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*,.psd"
          style="display:none"
          @change="onFileInput"
        >
        <p class="fname">{{ atlas.fileName || 'No file selected' }}</p>
        <p v-if="hasNativePicker" class="picker-note">remembers last folder and tries to restore last file</p>
        <p v-else class="warn-badge">live watch unavailable in this browser</p>
      </div>

      <div class="sec">
        <div class="sec-hd">Frame</div>
        <div class="row"><label>Width</label><input v-model.number="cfg.fw" type="number" min="1" max="4096"></div>
        <div class="row"><label>Height</label><input v-model.number="cfg.fh" type="number" min="1" max="4096"></div>
        <div class="row"><label>Count</label><input v-model.number="cfg.fc" type="number" min="1" max="2048"></div>
        <div class="row"><label>Row</label><input v-model.number="cfg.fr" type="number" min="0" max="512"></div>
        <div class="row"><label>Col</label><input v-model.number="cfg.fco" type="number" min="0" max="512"></div>
      </div>

      <div class="sec">
        <div class="sec-hd">Playback</div>
        <div class="fps-block">
          <div class="fps-top">
            <span class="lbl">FPS</span>
            <span class="fps-num">{{ cfg.fps }}</span>
          </div>
          <input v-model.number="cfg.fps" type="range" min="1" max="60">
        </div>
        <div class="tog-row">
          <span class="lbl">Loop</span>
          <button class="tog-btn" :class="{ on: cfg.looping }" @click="cfg.looping = !cfg.looping">
            {{ cfg.looping ? 'ON' : 'OFF' }}
          </button>
        </div>
        <div class="tog-row">
          <span class="lbl">Ping-pong</span>
          <button class="tog-btn" :class="{ on: cfg.pingpong }" @click="cfg.pingpong = !cfg.pingpong; player.ppDir = 1">
            {{ cfg.pingpong ? 'ON' : 'OFF' }}
          </button>
        </div>
      </div>

      <div class="sec">
        <div class="sec-hd">Display</div>
        <div class="row">
          <label>Scale</label>
          <select v-model.number="cfg.scale">
            <option :value="1">1x</option>
            <option :value="2">2x</option>
            <option :value="3">3x</option>
            <option :value="4">4x</option>
            <option :value="6">6x</option>
            <option :value="8">8x</option>
            <option :value="0">Auto</option>
          </select>
        </div>
        <div class="row">
          <label>BG</label>
          <select v-model="cfg.bg">
            <option value="checker">Checker</option>
            <option value="bg-black">Black</option>
            <option value="bg-white">White</option>
            <option value="bg-dark">Dark</option>
            <option value="bg-mid">Mid gray</option>
          </select>
        </div>
      </div>
    </div>

    <Minimap />
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import { cfg, atlas, player, hasNativePicker, openFile, handleFile } from '../store.js'
import Minimap from './Minimap.vue'

const fileInputRef = ref(null)

function onOpen() {
  if (hasNativePicker) openFile()
  else fileInputRef.value?.click()
}

function onFileInput(event) {
  const file = event.target.files?.[0]
  if (file) handleFile(file, false)
  event.target.value = ''
}
</script>
