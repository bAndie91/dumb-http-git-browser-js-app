
import { $, status, clear, state, reportException } from './gitviewer-common.js'
import { explode } from './gitviewer-util.js'
import { readObject } from './gitviewer-object.js'

import { renderPOD } from './gitviewer-render-pod.js'
import { renderMarkdown } from './gitviewer-render-md.js'
import { renderMan } from './gitviewer-render-man.js'

export async function getTreeEntryContent(filePath) {
  // find tree entry
  const entry = state.treeObjects.find(e => e.path+e.filename === filePath)
  if (!entry) {
    throw new Error(`${filePath}: file not found in current tree.`)
  }
  if (entry.type !== 'blob') {
    throw new Error(`${filePath}: not a file object, but ${entry.type}.`)
  }
  
  const blobObj = await readObject(state.repoUrl, entry.oid)
  if (blobObj.type !== 'blob') throw new Error(`${entry.oid}: not a blob object, but ${blobObj.type}.`)

  return blobObj.body
}

export async function selectFile(filePath, jumpToAnchor, forceFileFormat) {
  if (state.selectedFileEl) state.selectedFileEl.classList.remove('selected')
  const el = $('tree').querySelector(`[data-git-tree-path="${filePath}"]`)
  if (!el) { throw new Error(`${filePath}: not found element with file path.`) }
  state.selectedFileEl = el
  el.classList.add('selected')
  state.selectedFilePath = filePath
  
  const basename = filePath.split('/').pop()
  status(`Loading file: ${filePath}`)

  const body = await getTreeEntryContent(filePath)

  // handle rendering
  const container = $('dumbgitviewerFile')
  clear(container)
  if (container.shadowRoot) container.shadowRoot.innerHTML = ''
  $('dumbgitviewerFile').dataset.format = ''
  $('fileFormatSwitcher').style.display = 'none'  /* always hide for non-text contents */
  
  if (isImage(body, basename)) {
    const blob = new Blob([body], { type: mimeTypeFromFilename(basename) })
    const url = URL.createObjectURL(blob)
    const img = document.createElement('img')
    img.src = url
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    container.appendChild(img)
  }
  else if (isText(body)) {
    let detectedFileFormat = 'raw'
    if (basename.toLowerCase().endsWith('.md'))       detectedFileFormat = 'md'
    else if (basename.toLowerCase().endsWith('.pod')) detectedFileFormat = 'pod'
    else if (basename.match(/\.([0-9][a-zA-Z]*)$/))   detectedFileFormat = 'man'
    let finalFileFormat = forceFileFormat ? forceFileFormat : detectedFileFormat
    $('dumbgitviewerFile').dataset.format = finalFileFormat
    
    const fileFormatOptions = new Set()
    fileFormatOptions.add(detectedFileFormat)
    fileFormatOptions.add(finalFileFormat)
    fileFormatOptions.add('raw')
    
    if (finalFileFormat == 'md') {
      // markdown
      container.innerHTML = await renderMarkdown(new TextDecoder().decode(body))
      // attach click handlers for relative links
      container.querySelectorAll('a[data-relative-link]').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault()
          const href = a.getAttribute('data-relative-link')
          const basePath = state.selectedFilePath
          const resolved = resolveRelativePath(basePath, href)
          const [filePath, fragment] = explode(resolved, '#', 2)
          reportException(selectFile, filePath, fragment)
        })
      })
    }
    else if (finalFileFormat == 'pod') {
      container.innerHTML = renderPOD(new TextDecoder().decode(body))
    }
    else if (finalFileFormat == 'man') {
      container.innerHTML = await renderMan(new TextDecoder().decode(body))
      // attach shadow DOM to apply the stylesheet only to this section
      if (!container.shadowRoot) container.attachShadow({ mode: 'open' });
      container.shadowRoot.innerHTML = '<link rel="stylesheet" href="troff.css">  <slot></slot>';
    }
    else {
      // raw plain text
      const pre = document.createElement('pre')
      pre.textContent = new TextDecoder().decode(body)
      container.appendChild(pre)
      // TODO: add line numbering
      
      if(pre.textContent.match(/^=pod(\s|$)/m)) fileFormatOptions.add('pod')
      if(pre.textContent.match(/^\.(TH|SH|SS) /m)) fileFormatOptions.add('man')
    }
    
    const fileFormatButtons = $('fileFormatSwitcher').querySelectorAll('button');
    fileFormatButtons.forEach(btn => {
      const isActive = btn.dataset.format === finalFileFormat;
      btn.setAttribute('aria-checked', isActive);
      btn.style.display = fileFormatOptions.has(btn.dataset.format) ? '' : 'none'
    });
    $('fileFormatSwitcher').style.display = fileFormatOptions.size < 2 ? 'none' : ''
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
      a.download = basename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    container.appendChild(btn)
  }

  if(jumpToAnchor) {
    location.hash = '#'+jumpToAnchor
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

export function mimeTypeFromFilename(filename) {
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

export function resolveRelativePath(basePath, relative) {
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


/* initiate the file format switcher buttons */
const fileFormatButtons = $('fileFormatSwitcher').querySelectorAll('button');
fileFormatButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    selectFile(state.selectedFilePath, null, btn.dataset.format)
  })
})
