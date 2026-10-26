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
  $('ring').style.strokeDashoffset = String(69.1 * (1 - p / 100))
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

tauri?.core.invoke('version').then((v) => ($('version').textContent = `Version ${v}`)).catch(() => {})
