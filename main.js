const INTERCOM_MESSAGE_TYPE = Object.freeze({
  IFRAME_READY: 'IFRAME_READY',
  INTERCOM_BOOT: 'INTERCOM_BOOT',
  INTERCOM_UPDATE: 'INTERCOM_UPDATE',
})

const INTERCOM_SCRIPT_BASE_URL = 'https://widget.intercom.io/widget/'

const STANDALONE_BOOT_QUERY_PARAM = Object.freeze({
  ENABLE: 'standaloneIntercomBoot',
  APP_ID: 'appId',
  API_BASE: 'apiBase',
  EMAIL: 'email',
  USER_ID: 'userId',
  NAME: 'name',
  USER_HASH: 'userHash',
})

/**
 * Replace with your local parent origin when testing, e.g. 'http://localhost:5173'.
 * If you use a different port, update this.
 */
const ALLOWED_PARENT_ORIGINS = new Set(['http://127.0.0.1:5173'])

/** @type {boolean} */
let isIntercomBooted = false

/** @type {HTMLDivElement | null} */
const logEl = document.querySelector('#log')

/** @type {HTMLDivElement | null} */
const intercomStateEl = document.querySelector('#intercomState')

/**
 * @param {{ message: string }} params
 * @returns {void}
 */
const log = ({ message }) => {
  if (!logEl) {
    return
  }

  logEl.textContent = message
}

/**
 * @param {{ isBooted: boolean }} params
 * @returns {void}
 */
const setIntercomState = ({ isBooted }) => {
  if (!intercomStateEl) {
    return
  }

  intercomStateEl.textContent = isBooted ? 'Intercom: booted' : 'Intercom: not booted'
}

/**
 * @param {{ settings: { app_id: string } & Record<string, unknown> }} params
 * @returns {void}
 */
const setIntercomSettings = ({ settings }) => {
  window.intercomSettings = settings
}

/**
 * @returns {{ enabled: boolean; payload: ({ app_id: string } & Record<string, unknown>) | null }}
 */
const getStandaloneBootConfig = () => {
  const searchParams = new URLSearchParams(window.location.search)
  const enabled = searchParams.get(STANDALONE_BOOT_QUERY_PARAM.ENABLE) === 'true'

  if (!enabled) {
    return { enabled, payload: null }
  }

  const appId = searchParams.get(STANDALONE_BOOT_QUERY_PARAM.APP_ID) ?? ''
  if (appId.trim().length === 0) {
    return { enabled, payload: null }
  }

  const apiBase = searchParams.get(STANDALONE_BOOT_QUERY_PARAM.API_BASE) ?? ''
  const email = searchParams.get(STANDALONE_BOOT_QUERY_PARAM.EMAIL) ?? ''
  const userId = searchParams.get(STANDALONE_BOOT_QUERY_PARAM.USER_ID) ?? ''
  const name = searchParams.get(STANDALONE_BOOT_QUERY_PARAM.NAME) ?? ''
  const userHash = searchParams.get(STANDALONE_BOOT_QUERY_PARAM.USER_HASH) ?? ''

  /** @type {{ app_id: string } & Record<string, unknown>} */
  const payload = {
    app_id: appId,
  }

  if (apiBase.trim().length > 0) {
    payload.api_base = apiBase.trim()
  }

  if (email.trim().length > 0) {
    payload.email = email.trim()
  }

  if (userId.trim().length > 0) {
    payload.user_id = userId.trim()
  }

  if (name.trim().length > 0) {
    payload.name = name.trim()
  }

  if (userHash.trim().length > 0) {
    payload.user_hash = userHash.trim()
  }

  return { enabled, payload }
}

/**
 * @param {{ payload: { app_id: string } & Record<string, unknown> }} params
 * @returns {Promise<void>}
 */
const bootIntercomFromStandaloneConfig = async ({ payload }) => {
  setIntercomSettings({ settings: payload })

  try {
    await loadIntercomScript({ appId: payload.app_id })
  } catch (error) {
    log({ message: 'Intercom script failed to load (standalone)' })
    return
  }

  if (!window.Intercom) {
    log({ message: 'Intercom global not available after script load (standalone)' })
    return
  }

  window.Intercom('boot', payload)
  isIntercomBooted = true
  setIntercomState({ isBooted: true })
  log({ message: 'Intercom booted (standalone mode)' })
}

/**
 * @param {{ appId: string }} params
 * @returns {Promise<void>}
 */
const loadIntercomScript = async ({ appId }) => {
  if (window.Intercom) {
    return
  }

  /** @type {HTMLScriptElement} */
  const scriptEl = document.createElement('script')
  scriptEl.type = 'text/javascript'
  scriptEl.async = true
  scriptEl.src = `${INTERCOM_SCRIPT_BASE_URL}${encodeURIComponent(appId)}`

  const promise = new Promise((resolve, reject) => {
    scriptEl.onload = () => resolve(undefined)
    scriptEl.onerror = () => reject(new Error('Failed to load Intercom script'))
  })

  const firstScript = document.getElementsByTagName('script')[0]
  if (!firstScript?.parentNode) {
    document.head.appendChild(scriptEl)
    await promise
    return
  }

  firstScript.parentNode.insertBefore(scriptEl, firstScript)
  await promise
}

/**
 * @param {unknown} payload
 * @returns {{ app_id: string } & Record<string, unknown> | null}
 */
const normalisePayload = payload => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  /** @type {{ app_id?: unknown }} */
  // @ts-ignore
  const candidate = payload

  if (typeof candidate.app_id !== 'string' || candidate.app_id.trim().length === 0) {
    return null
  }

  /** @type {{ app_id: string } & Record<string, unknown>} */
  const typedPayload = /** @type {{ app_id: string } & Record<string, unknown>} */ (payload)
  return typedPayload
}

/**
 * @param {MessageEvent<unknown>} event
 * @returns {Promise<void>}
 */
const handleParentMessage = async event => {
  if (!ALLOWED_PARENT_ORIGINS.has(event.origin)) {
    return
  }

  if (!event.data || typeof event.data !== 'object') {
    return
  }

  /** @type {{ type?: unknown; payload?: unknown }} */
  // @ts-ignore
  const data = event.data

  if (data.type !== INTERCOM_MESSAGE_TYPE.INTERCOM_BOOT && data.type !== INTERCOM_MESSAGE_TYPE.INTERCOM_UPDATE) {
    return
  }

  const payload = normalisePayload(data.payload)
  if (!payload) {
    log({ message: 'Invalid Intercom payload received' })
    return
  }

  setIntercomSettings({ settings: payload })

  try {
    await loadIntercomScript({ appId: payload.app_id })
  } catch (error) {
    log({ message: 'Intercom script failed to load' })
    return
  }

  if (!window.Intercom) {
    log({ message: 'Intercom global not available after script load' })
    return
  }

  if (!isIntercomBooted || data.type === INTERCOM_MESSAGE_TYPE.INTERCOM_BOOT) {
    window.Intercom('boot', payload)
    isIntercomBooted = true
    setIntercomState({ isBooted: true })
    log({ message: `Intercom booted for ${event.origin}` })
    return
  }

  window.Intercom('update', payload)
  log({ message: `Intercom updated for ${event.origin}` })
}

window.addEventListener('message', event => {
  void handleParentMessage(event)
})

const standaloneBootConfig = getStandaloneBootConfig()

if (standaloneBootConfig.enabled && standaloneBootConfig.payload) {
  void bootIntercomFromStandaloneConfig({ payload: standaloneBootConfig.payload })
} else {
  window.parent.postMessage({ type: INTERCOM_MESSAGE_TYPE.IFRAME_READY }, '*')
  setIntercomState({ isBooted: false })
  log({ message: 'Waiting for parent to send INTERCOM_BOOT...' })
}
