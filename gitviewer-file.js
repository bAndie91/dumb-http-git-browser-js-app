
import { $, status, clear, state, reportException } from './gitviewer-common.js'

import { renderPOD } from './gitviewer-render-pod.js'
import { renderMarkdown } from './gitviewer-render-md.js'
import { renderMan } from './gitviewer-render-man.js'

export async function selectFile(path) {
  if (state.selectedFileEl) state.selectedFileEl.classList.remove('selected')
  const el = document.querySelector(`[data-filepath="${path}"]`)
  state.selectedFileEl = el
  el.classList.add('selected')

  status(`Loading file: ${path}`)
  clear($('file'))

  // find tree entry
  const entry = state.treeObjects.find(e => e.path === path)
  if (!entry) {
    status('File not found in current tree')
    return
  }

  if (entry.type !== 'blob') {
    status('Not a file object')
    return
  }

  const blobObj = await readObject(state.repoUrl, entry.oid)
  if (blobObj.type !== 'blob') throw new Error('Not a blob object')

  const body = blobObj.body

  // handle rendering
  const container = $('file')
  if (isImage(body, path)) {
    const blob = new Blob([body], { type: mimeTypeFromFilename(path) })
    const url = URL.createObjectURL(blob)
    const img = document.createElement('img')
    img.src = url
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    container.appendChild(img)
  }
  else if (isText(body)) {
    if (path.toLowerCase().endsWith('.md')) {
      // markdown
      container.innerHTML = renderMarkdown(new TextDecoder().decode(body))
      // attach click handlers for relative links
      container.querySelectorAll('a[data-md-link]').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault()
          const href = a.getAttribute('data-md-link')
          const basePath = state.selectedFileEl ? state.selectedFileEl.textContent : ''
          const resolved = resolveRelativePath(basePath, href)
          selectFile(resolved)
        })
      })
    }
    else if (path.toLowerCase().endsWith('.pod')) {
      container.innerHTML = renderPOD(new TextDecoder().decode(body))
    }
    else if (path.match(/\.([0-9][a-zA-Z]*)$/)) {
      container.innerHTML = renderMan(new TextDecoder().decode(body))
    }
    else {
      // plain text
      const pre = document.createElement('pre')
      pre.textContent = new TextDecoder().decode(body)
      container.appendChild(pre)
      // TODO: add line numbering
    }
  }
  else {
    const blob = new Blob([body], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const sizeKB = (body.length / 1024).toFixed(1)
    const btn = document.createElement('button')
    btn.textContent = `Download binary blob (${sizeKB} kB)`
    btn.onclick = () => {
      const a = document.createElement('a')
      a.href = url
      a.download = path
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    container.appendChild(btn)
  }

  status('')
}

function isText(uint8arr) {
  // simple heuristic: check first 512 bytes
  const len = Math.min(512, uint8arr.length)
  for (let i = 0; i < len; i++) {
    const c = uint8arr[i]
    if (c === 0) return false // null byte => binary
  }
  return true
}

function isImage(uint8arr, filename) {
  const ext = filename.split('.').pop().toLowerCase()
  return ['png','jpg','jpeg','gif','bmp','webp','svg'].includes(ext)
}

function mimeTypeFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  switch (ext) {
    case 'png': return 'image/png'
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'bmp': return 'image/bmp'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}

function resolveRelativePath(basePath, relative) {
  if (!relative) return basePath
  if (relative.startsWith('/')) return relative.replace(/^\/+/, '')

  const parts = basePath.split('/').slice(0, -1) // remove filename
  const relParts = relative.split('/')
  for (const part of relParts) {
    if (part === '.') continue
    else if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}
