const tauri = window.__TAURI__
const win = tauri?.window?.getCurrentWindow?.()
const $ = (id) => document.getElementById(id)
const root = document.querySelector('.window')

const STEPS = [
  [0, 'Unpacking…'],
  [25, 'Copying files…'],
  [55, 'Creating shortcuts…'],
  [80, 'Almost there…'],
]

let timer = null
let shown = 0

function setProgress(p) {
  shown = p
  $('fill').style.width = `${p}%`
  $('percent').textContent = `${Math.round(p)}%`
  const step = [...STEPS].reverse().find(([from]) => p >= from)
  if (step) $('status').textContent = step[1]
}

function state(name) {
  root.dataset.state = name
}

// The installer gives no progress, so ease towards 92% and finish the last stretch when it is done.
function startProgress() {
  setProgress(2)
  timer = setInterval(() => {
    const target = 92
    setProgress(shown + (target - shown) * 0.045)
  }, 160)
}

async function install() {
  state('installing')
  startProgress()
  try {
    await tauri.core.invoke('install')
    clearInterval(timer)
    setProgress(100)
    $('status').textContent = 'Done'
    setTimeout(() => state('done'), 600)
  } catch (e) {
    clearInterval(timer)
    $('error').textContent = String(e)
    state('error')
  }
}

$('install').addEventListener('click', install)
$('retry').addEventListener('click', install)
$('launch').addEventListener('click', () => tauri.core.invoke('launch'))
$('close').addEventListener('click', () => win?.close())
$('min').addEventListener('click', () => win?.minimize())

// the Universitas Indonesia build of Setup wears the makara and its own name
tauri?.core
  .invoke('variant')
  .then((v) => {
    if (v !== 'ui') return
    root.dataset.variant = 'ui'
    document.title = 'Astra Isle UI Setup'
    document.querySelectorAll('.app-name').forEach((el) => (el.textContent = 'Astra Isle UI'))
  })
  .catch(() => {})

tauri?.core.invoke('version').then((v) => ($('version').textContent = `Version ${v}`)).catch(() => {})

// The mascot blinks now and then and glances around while it waits.
const eyes = [$('eyeL'), $('eyeR')]
const look = (x, y) => eyes.forEach((e) => (e.style.translate = `${x}px ${y}px`))
function blink() {
  if (root.dataset.state === 'error') return
  eyes.forEach((e) => (e.style.transform = 'scaleY(0.1)'))
  setTimeout(() => eyes.forEach((e) => (e.style.transform = '')), 130)
}
function glance() {
  if (root.dataset.state === 'done' || root.dataset.state === 'error') return look(0, 0)
  look((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 8)
  setTimeout(() => look(0, 0), 1100)
}
setInterval(blink, 3200)
setInterval(glance, 4800)
