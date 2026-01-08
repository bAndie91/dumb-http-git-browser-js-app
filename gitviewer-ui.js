
const SPLIT_KEY = 'pane-sizes'

function initSplitters(containerId) {
  const container = document.getElementById(containerId)
  const panes = [...container.querySelectorAll('.pane')]
  const splitters = [...container.querySelectorAll('.splitter')]

  loadPaneSizes(container, panes)

  splitters.forEach((splitter, i) => {
    const left = panes[i]
    const right = panes[i + 1]

    splitter.addEventListener('mousedown', e => {
      e.preventDefault()

      const startX = e.clientX
      const leftWidth = left.offsetWidth
      const rightWidth = right.offsetWidth

      function onMove(ev) {
        const dx = ev.clientX - startX
        const newLeft = leftWidth + dx
        const newRight = rightWidth - dx

        if (newLeft < 80 || newRight < 80) return

        left.style.flexBasis = `${newLeft}px`
        right.style.flexBasis = `${newRight}px`
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        savePaneSizes(container, panes)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  })
}

function savePaneSizes(container, panes) {
  const total = container.clientWidth
  const sizes = panes.map(p => p.offsetWidth / total)
  localStorage.setItem(SPLIT_KEY, JSON.stringify(sizes))
}

function loadPaneSizes(container, panes) {
  const raw = localStorage.getItem(SPLIT_KEY)
  if (!raw) return

  try {
    const sizes = JSON.parse(raw)
    if (sizes.length !== panes.length) return

    panes.forEach((pane, i) => {
      pane.style.flexBasis = `${sizes[i] * 100}%`
    })
  } catch {}
}

document.addEventListener("DOMContentLoaded", () => {
  initSplitters('panes');
});

