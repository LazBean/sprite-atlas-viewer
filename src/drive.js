import { reactive } from 'vue'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_POLL_INTERVAL_MS = 4000
const DRIVE_FIELDS = 'id,name,mimeType,modifiedTime,version'
const SUPPORTED_EXTENSIONS = ['.psd', '.psp', '.ase', '.aseprite']

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || '').trim()
const API_KEY = (import.meta.env.VITE_GOOGLE_DRIVE_API_KEY || '').trim()
const APP_ID = (import.meta.env.VITE_GOOGLE_DRIVE_APP_ID || '').trim()

export const googleDrive = reactive({
  isConfigured: Boolean(CLIENT_ID && API_KEY && APP_ID),
  isReady: false,
  busy: false,
  watchActive: false,
  fileId: '',
  fileName: '',
  error: '',
})

const scriptCache = new Map()

let pickerReadyPromise = null
let tokenClient = null
let tokenPromise = null
let accessToken = ''
let accessTokenExpiresAt = 0
let watchTimer = null
let watchBusy = false
let watchedFile = null

function loadScript(src, globalName) {
  if (scriptCache.has(src)) return scriptCache.get(src)

  const promise = new Promise((resolve, reject) => {
    if (globalName && window[globalName]) {
      resolve(window[globalName])
      return
    }

    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => resolve(globalName ? window[globalName] : true)
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })

  scriptCache.set(src, promise)
  return promise
}

function isSupportedMetadata(meta) {
  const name = (meta?.name || '').toLowerCase()
  const mimeType = meta?.mimeType || ''
  return mimeType.startsWith('image/') || SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext))
}

async function ensurePickerReady() {
  if (!googleDrive.isConfigured) {
    throw new Error('Google Drive is not configured')
  }

  if (pickerReadyPromise) return pickerReadyPromise

  pickerReadyPromise = (async () => {
    await Promise.all([
      loadScript('https://accounts.google.com/gsi/client', 'google'),
      loadScript('https://apis.google.com/js/api.js', 'gapi'),
    ])

    await new Promise((resolve, reject) => {
      if (window.gapi?.picker) {
        resolve()
        return
      }

      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Failed to initialize Google Picker')),
      })
    })

    googleDrive.isReady = true
  })()

  return pickerReadyPromise
}

function ensureTokenClient() {
  if (tokenClient) return tokenClient

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {},
  })

  return tokenClient
}

async function getAccessToken(interactive) {
  await ensurePickerReady()

  const isTokenFresh = accessToken && Date.now() < accessTokenExpiresAt - 60_000
  if (isTokenFresh) return accessToken
  if (tokenPromise) return tokenPromise

  tokenPromise = new Promise((resolve, reject) => {
    const client = ensureTokenClient()

    client.callback = response => {
      tokenPromise = null

      if (!response || response.error) {
        reject(new Error(response?.error || 'Failed to get Google access token'))
        return
      }

      accessToken = response.access_token
      accessTokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000
      resolve(accessToken)
    }

    client.requestAccessToken({
      prompt: interactive || !accessToken ? 'consent' : '',
    })
  })

  return tokenPromise
}

async function fetchDrive(endpoint, options = {}) {
  const token = await getAccessToken(false)
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (response.status === 401) {
    accessToken = ''
    accessTokenExpiresAt = 0
    const refreshedToken = await getAccessToken(false)
    return fetch(endpoint, {
      ...options,
      headers: {
        Authorization: `Bearer ${refreshedToken}`,
        ...options.headers,
      },
    })
  }

  return response
}

export async function pickGoogleDriveFile() {
  googleDrive.error = ''
  await ensurePickerReady()
  const token = await getAccessToken(true)

  return new Promise((resolve, reject) => {
    const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false)
      .setMode(window.google.picker.DocsViewMode.LIST)

    const picker = new window.google.picker.PickerBuilder()
      .setDeveloperKey(API_KEY)
      .setOAuthToken(token)
      .setOrigin(window.location.origin)
      .addView(docsView)
      .setCallback(data => {
        if (data.action === window.google.picker.Action.CANCEL) {
          reject(new DOMException('The user aborted a request', 'AbortError'))
          return
        }

        if (data.action !== window.google.picker.Action.PICKED) return

        const doc = data.docs?.[0]
        if (!doc?.id) {
          reject(new Error('No Google Drive file selected'))
          return
        }

        resolve({
          id: doc.id,
          name: doc.name || '',
          mimeType: doc.mimeType || '',
        })
      })

    if (APP_ID) picker.setAppId(APP_ID)
    if (window.google.picker.Feature?.SUPPORT_DRIVES) {
      picker.enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
    }

    picker.build().setVisible(true)
  })
}

export async function getGoogleDriveFileMetadata(fileId) {
  const response = await fetchDrive(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_FIELDS)}&supportsAllDrives=true`,
  )

  if (!response.ok) {
    throw new Error(`Google Drive metadata request failed (${response.status})`)
  }

  const meta = await response.json()
  if (!isSupportedMetadata(meta)) {
    throw new Error('Unsupported Google Drive file type')
  }

  return meta
}

export async function downloadGoogleDriveFile(meta) {
  const response = await fetchDrive(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(meta.id)}?alt=media&supportsAllDrives=true`,
  )

  if (!response.ok) {
    throw new Error(`Google Drive download failed (${response.status})`)
  }

  const blob = await response.blob()
  return new File(
    [blob],
    meta.name,
    {
      type: meta.mimeType || blob.type || 'application/octet-stream',
      lastModified: Date.parse(meta.modifiedTime || '') || Date.now(),
    },
  )
}

export function stopGoogleDriveWatch() {
  clearInterval(watchTimer)
  watchTimer = null
  watchBusy = false
  watchedFile = null
  googleDrive.watchActive = false
  googleDrive.fileId = ''
  googleDrive.fileName = ''
}

export function startGoogleDriveWatch(meta, handlers) {
  stopGoogleDriveWatch()

  watchedFile = {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    modifiedTime: meta.modifiedTime,
    version: meta.version,
  }

  googleDrive.watchActive = true
  googleDrive.fileId = meta.id
  googleDrive.fileName = meta.name

  watchTimer = window.setInterval(async () => {
    if (watchBusy || !watchedFile) return

    watchBusy = true

    try {
      const latestMeta = await getGoogleDriveFileMetadata(watchedFile.id)
      const hasChanged =
        latestMeta.version !== watchedFile.version ||
        latestMeta.modifiedTime !== watchedFile.modifiedTime

      if (hasChanged) {
        watchedFile = latestMeta
        handlers.onBeforeReload?.(latestMeta)
        const file = await downloadGoogleDriveFile(latestMeta)
        await handlers.onFile?.(file, latestMeta)
      }
    } catch (error) {
      handlers.onError?.(error)
    } finally {
      watchBusy = false
    }
  }, DRIVE_POLL_INTERVAL_MS)
}
