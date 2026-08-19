import { reactive, computed } from 'vue'
import { parsePSD } from './utils/psd.js'
import { parseAseprite } from './utils/aseprite.js'
import {
  googleDrive,
  pickGoogleDriveFile,
  getGoogleDriveFileMetadata,
  downloadGoogleDriveFile,
  startGoogleDriveWatch,
  stopGoogleDriveWatch,
} from './drive.js'

export { googleDrive }

const CFG_STORAGE_KEY = 'sav:cfg:v3'
const HANDLE_DB_NAME = 'sprite-atlas-viewer'
const HANDLE_STORE_NAME = 'file-handles'
const LAST_FILE_HANDLE_KEY = 'last-file'
const FILE_PICKER_ID = 'sprite-atlas-viewer'
const WATCH_INTERVAL_MS = 300

const DEFAULT_CFG = Object.freeze({
  fw: 64,
  fh: 64,
  fc: 8,
  fr: 0,
  fco: 0,
  fps: 12,
  scale: 4,
  bg: 'checker',
  looping: true,
  pingpong: false,
})

const BG_OPTIONS = new Set(['checker', 'bg-black', 'bg-white', 'bg-dark', 'bg-mid'])

function supportsNativePicker() {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

function getIdleStatusMessage() {
  return supportsNativePicker() ? 'no file' : 'manual reopen'
}

function clampInt(value, fallback, min, max) {
  const num = Number.parseInt(value, 10)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function clampBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function sanitizeCfg(raw = {}) {
  const next = {
    ...DEFAULT_CFG,
    ...raw,
  }

  next.fw = clampInt(next.fw, DEFAULT_CFG.fw, 1, 4096)
  next.fh = clampInt(next.fh, DEFAULT_CFG.fh, 1, 4096)
  next.fc = clampInt(next.fc, DEFAULT_CFG.fc, 1, 2048)
  next.fr = clampInt(next.fr, DEFAULT_CFG.fr, 0, 512)
  next.fco = clampInt(next.fco, DEFAULT_CFG.fco, 0, 512)
  next.fps = clampInt(next.fps, DEFAULT_CFG.fps, 1, 60)
  next.scale = clampInt(next.scale, DEFAULT_CFG.scale, 0, 16)
  next.bg = BG_OPTIONS.has(next.bg) ? next.bg : DEFAULT_CFG.bg
  next.looping = clampBool(next.looping, DEFAULT_CFG.looping)
  next.pingpong = clampBool(next.pingpong, DEFAULT_CFG.pingpong)

  return next
}

function currentFrameCount() {
  return Math.max(1, clampInt(cfg.fc, DEFAULT_CFG.fc, 1, 2048))
}

export const cfg = reactive({ ...DEFAULT_CFG })

export const atlas = reactive({
  img: null,
  fileName: '',
  sourceLabel: '',
})

export const player = reactive({
  frame: 0,
  playing: true,
  ppDir: 1,
  lastTick: 0,
  isWatching: false,
  watchKind: '',
  lastUpdate: 0,
  status: 'idle',
  statusMsg: getIdleStatusMessage(),
})

export const framesPerRow = computed(() => {
  if (!atlas.img) return 1
  const frameWidth = Math.max(1, cfg.fw)
  return Math.max(1, Math.floor(atlas.img.width / frameWidth))
})

export function advance() {
  const n = currentFrameCount()
  if (n <= 1) {
    player.frame = 0
    return
  }

  if (cfg.pingpong) {
    player.frame += player.ppDir
    if (player.frame >= n - 1) {
      player.frame = n - 1
      player.ppDir = -1
    } else if (player.frame <= 0) {
      player.frame = 0
      player.ppDir = 1
    }
    return
  }

  player.frame += 1
  if (player.frame >= n) {
    if (cfg.looping) {
      player.frame = 0
    } else {
      player.frame = n - 1
      player.playing = false
    }
  }
}

export function togglePlay() {
  if (!atlas.img) return
  player.playing = !player.playing
  if (player.playing && player.frame >= currentFrameCount() - 1 && !cfg.pingpong) {
    player.frame = 0
  }
  player.lastTick = 0
}

export function stepFrame(dir) {
  if (!atlas.img) return
  const n = currentFrameCount()
  player.playing = false
  player.frame = ((player.frame + dir) % n + n) % n
}

export function setStatus(status, msg) {
  player.status = status
  switch (status) {
    case 'ok':
      player.statusMsg = 'watching'
      break
    case 'warn':
      player.statusMsg = msg || 'updating...'
      break
    case 'err':
      player.statusMsg = msg || 'error'
      break
    case 'loaded':
      player.statusMsg = 'loaded'
      break
    default:
      player.statusMsg = getIdleStatusMessage()
  }
}

export function tickStatus() {
  if (!atlas.img || !player.isWatching || player.status !== 'ok') return
  const sec = Math.floor((Date.now() - player.lastUpdate) / 1000)
  if (sec < 4) player.statusMsg = 'just updated'
  else if (sec < 60) player.statusMsg = `${sec}s ago`
  else player.statusMsg = `${Math.floor(sec / 60)}m ago`
}

export const hasNativePicker = supportsNativePicker()

let _fileHandle = null
let _pickerStartHandle = null
let _objURL = null
let _lastMod = 0
let _watchTimer = null

function getFileExtension(name = '') {
  const lower = name.toLowerCase()
  if (lower.endsWith('.aseprite')) return '.aseprite'
  if (lower.endsWith('.psd')) return '.psd'
  if (lower.endsWith('.ase')) return '.ase'

  const dotIndex = lower.lastIndexOf('.')
  return dotIndex >= 0 ? lower.slice(dotIndex) : ''
}

function clearWatchedFile() {
  clearInterval(_watchTimer)
  _watchTimer = null
  _fileHandle = null
  _lastMod = 0
  stopGoogleDriveWatch()
}

function isSupportedAtlasFile(file) {
  if (!file?.name) return false
  const ext = getFileExtension(file.name)
  return (file.type || '').startsWith('image/') || ext === '.psd' || ext === '.ase' || ext === '.aseprite'
}

function supportsHandlePersistence() {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openHandleDb() {
  if (!supportsHandlePersistence()) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        req.result.createObjectStore(HANDLE_STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveLastFileHandle(handle) {
  if (!supportsHandlePersistence() || !handle) return

  try {
    const db = await openHandleDb()
    if (!db) return

    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite')
      tx.objectStore(HANDLE_STORE_NAME).put(handle, LAST_FILE_HANDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })

    db.close()
  } catch (err) {
    console.warn('Failed to persist file handle', err)
  }
}

async function loadLastFileHandle() {
  if (!supportsHandlePersistence()) return null

  try {
    const db = await openHandleDb()
    if (!db) return null

    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readonly')
      const req = tx.objectStore(HANDLE_STORE_NAME).get(LAST_FILE_HANDLE_KEY)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })

    db.close()
    return handle
  } catch (err) {
    console.warn('Failed to load file handle', err)
    return null
  }
}

async function queryReadPermission(handle) {
  if (!handle?.queryPermission) return 'prompt'

  try {
    return await handle.queryPermission({ mode: 'read' })
  } catch {
    return 'prompt'
  }
}

async function openFromHandle(handle, persist = true) {
  stopGoogleDriveWatch()
  _fileHandle = handle
  _pickerStartHandle = handle
  if (persist) await saveLastFileHandle(handle)

  const file = await handle.getFile()
  _lastMod = file.lastModified
  await handleFile(file, true, 'local')
  _startWatch()
}

function buildPickerOptions() {
  const options = {
    id: FILE_PICKER_ID,
    types: [{
      description: 'Sprite Atlas',
      accept: {
        'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
        'application/octet-stream': ['.psd', '.ase', '.aseprite'],
      },
    }],
    multiple: false,
  }

  if (_pickerStartHandle) options.startIn = _pickerStartHandle
  return options
}

async function showPickerWithFallback() {
  const options = buildPickerOptions()

  try {
    return await window.showOpenFilePicker(options)
  } catch (err) {
    if (options.startIn && (err?.name === 'TypeError' || err?.name === 'DataError')) {
      delete options.startIn
      return window.showOpenFilePicker(options)
    }
    throw err
  }
}

export async function openLooseFile(file) {
  clearWatchedFile()
  await handleFile(file, false, 'manual')
}

export async function openFile() {
  try {
    const [handle] = await showPickerWithFallback()
    await openFromHandle(handle)
  } catch (err) {
    if (err?.name !== 'AbortError') setStatus('err', 'failed to open')
  }
}

export async function openDroppedFile(dataTransfer) {
  const item = Array.from(dataTransfer?.items || []).find(entry => entry.kind === 'file')

  if (item && typeof item.getAsFileSystemHandle === 'function') {
    try {
      const handle = await item.getAsFileSystemHandle()
      if (handle?.kind === 'file') {
        const file = await handle.getFile()
        if (isSupportedAtlasFile(file)) {
          await openFromHandle(handle)
          return
        }
      }
    } catch (err) {
      console.warn('Failed to watch dropped file', err)
    }
  }

  const file = dataTransfer?.files?.[0]
  if (isSupportedAtlasFile(file)) {
    await openLooseFile(file)
  }
}

export async function handleFile(file, watching, watchKind = watching ? 'local' : 'manual') {
  player.isWatching = watching
  player.watchKind = watchKind

  let source
  let parsedMeta = null
  const ext = getFileExtension(file.name)

  if (_objURL) {
    URL.revokeObjectURL(_objURL)
    _objURL = null
  }

  if (ext === '.psd') {
    setStatus('warn', 'parsing psd...')
    try {
      source = parsePSD(await file.arrayBuffer())
    } catch (err) {
      setStatus('err', err.message || 'psd error')
      console.error(err)
      return
    }
  } else if (ext === '.ase' || ext === '.aseprite') {
    setStatus('warn', 'parsing aseprite...')
    try {
      parsedMeta = parseAseprite(await file.arrayBuffer())
      source = parsedMeta.canvas
    } catch (err) {
      setStatus('err', err.message || 'aseprite error')
      console.error(err)
      return
    }
  } else {
    _objURL = URL.createObjectURL(file)

    const img = new Image()
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = _objURL
      })
    } catch {
      setStatus('err', 'invalid image')
      return
    }

    source = img
  }

  atlas.img = source
  atlas.fileName = file.name
  atlas.sourceLabel = watchKind === 'drive' ? 'Google Drive' : 'Local file'

  if (parsedMeta) {
    cfg.fw = parsedMeta.frameWidth
    cfg.fh = parsedMeta.frameHeight
    cfg.fc = parsedMeta.frameCount
    cfg.fr = 0
    cfg.fco = 0
  }

  player.frame = 0
  player.ppDir = 1
  player.lastUpdate = Date.now()
  setStatus(watching ? 'ok' : 'loaded')
}

export async function openGoogleDrive() {
  if (!googleDrive.isConfigured) {
    setStatus('err', 'drive not configured')
    return
  }

  googleDrive.busy = true
  googleDrive.error = ''
  setStatus('warn', 'connecting drive...')

  try {
    const picked = await pickGoogleDriveFile()
    const meta = await getGoogleDriveFileMetadata(picked.id)
    const file = await downloadGoogleDriveFile(meta)

    clearWatchedFile()
    player.watchKind = 'drive'
    await handleFile(file, true, 'drive')

    startGoogleDriveWatch(meta, {
      onBeforeReload() {
        setStatus('warn', 'syncing drive...')
      },
      async onFile(nextFile) {
        player.watchKind = 'drive'
        await handleFile(nextFile, true, 'drive')
      },
      onError(error) {
        console.warn('Failed to sync Google Drive file', error)
        setStatus('warn', 'drive retrying...')
      },
    })
  } catch (err) {
    if (err?.name !== 'AbortError') {
      googleDrive.error = err?.message || 'Google Drive error'
      setStatus('err', 'drive failed')
      console.error(err)
    } else if (!atlas.img) {
      setStatus('idle')
    } else {
      setStatus(player.isWatching ? 'ok' : 'loaded')
    }
  } finally {
    googleDrive.busy = false
  }
}

function _startWatch() {
  clearInterval(_watchTimer)
  _watchTimer = setInterval(async () => {
    if (!_fileHandle) return

    try {
      const file = await _fileHandle.getFile()
      if (file.lastModified !== _lastMod) {
        _lastMod = file.lastModified
        setStatus('warn', 'reloading...')
        await handleFile(file, true, 'local')
      }
    } catch {}
  }, WATCH_INTERVAL_MS)
}

export async function restoreLastSession() {
  if (!hasNativePicker) return

  const handle = await loadLastFileHandle()
  if (!handle) return

  _pickerStartHandle = handle

  const permission = await queryReadPermission(handle)
  if (permission !== 'granted') return

  try {
    await openFromHandle(handle, false)
  } catch (err) {
    console.warn('Failed to restore last file', err)
  }
}

export function cleanup() {
  clearInterval(_watchTimer)
  stopGoogleDriveWatch()
  if (_objURL) URL.revokeObjectURL(_objURL)
}

export function saveCfg() {
  try {
    localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(sanitizeCfg(cfg)))
  } catch {}
}

export function loadCfg() {
  try {
    const raw = localStorage.getItem(CFG_STORAGE_KEY)
    if (!raw) return
    Object.assign(cfg, sanitizeCfg(JSON.parse(raw)))
  } catch {}
}
