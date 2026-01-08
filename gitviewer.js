
async function fetchText(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}

async function fetchBinary(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return new Uint8Array(await r.arrayBuffer())
}

/* -----------------------------
   Dumb HTTP: refs
----------------------------- */
async function listRefs(repoUrl) {
  const refs = []

  // HEAD
  const head = (await fetchText(`${repoUrl}/HEAD`)).trim()
  var head_ref
  if (head.startsWith('ref: ')) {
    head_ref = head.slice(5)
    state.headRef = head_ref
    refs.push(head_ref)
  }

  // refs
  const info_refs = (await fetchText(`${repoUrl}/info/refs`)).trim().split('\n')
  for (const info_ref of info_refs) {
    var ref = info_ref.slice(41)
    if(ref != head_ref) {
      refs.push(ref)
    }
  }

  return refs
}

// naive directory listing fallback
async function tryListDir(url) {
  // dumb HTTP servers do NOT standardize this
  // so this is best-effort and optional
  return []
}

/* -----------------------------
   Dumb HTTP: objects
----------------------------- */
async function readObject(repoUrl, oid) {
  const dir = oid.slice(0, 2)
  const file = oid.slice(2)

  const compressed = await fetchBinary(
    `${repoUrl}/objects/${dir}/${file}`
  )

  const data = pako.inflate(compressed)
  const nul = data.indexOf(0)

  const header = new TextDecoder().decode(data.slice(0, nul))
  const body = data.slice(nul + 1)

  const [type, size] = header.split(' ')
  return { type, size: +size, body }
}

/* -----------------------------
   Parse commit object
----------------------------- */
function parseCommit(body) {
  const text = new TextDecoder().decode(body)
  const [rawHeaders, message] = text.split('\n\n', 2)

  const headers = {}
  for (const line of rawHeaders.split('\n')) {
    const [k, ...v] = line.split(' ')
    headers[k] = v.join(' ')
  }

  return {
    tree: headers.tree,
    parent: headers.parent,
    author: headers.author,
    committer: headers.committer,
    message: message || ''
  }
}

/* -----------------------------
   DOM helpers
----------------------------- */
const $ = id => document.getElementById(id)
const status = msg => $('status').textContent = msg || ''
const clear = el => el.innerHTML = ''

/* -----------------------------
   State
----------------------------- */
const state = {
  repoUrl: null,
  ref: null,
  headOid: null,
  commitQueue: [],
  loadedCommits: 0,
  reachedRoot: false,
  autoLoadedRef: false,
  
  treeObjects: [],   // list of {mode, type, oid, path} of the current commit
  
  selectedRefEl: null,
  selectedCommitEl: null,
  selectedFileEl: null,
}

var COMMITS_PER_PAGE = 5

/* -----------------------------
   Refs panel
----------------------------- */
async function loadRefs() {
  clear($('refs'))
  status('Loading refs…')

  const refs = await listRefs(state.repoUrl)

  for (const ref of refs) {
    const li = document.createElement('li')
    li.setAttribute('data-ref', ref)
    li.textContent = ref.replace(/^refs\//, '')
    li.onclick = () => selectRef(ref)
    $('refs').appendChild(li)
  }

  status('')

  // auto-select ref from URL
  var autoloadRef = new URLSearchParams(location.search).get('ref')
  if (autoloadRef) {
    autoloadRef = 'refs/'+autoloadRef
  }
  if (!autoloadRef || state.autoLoadedRef) {
    selectRef(state.headRef)
  }
  if(autoloadRef && refs.includes(autoloadRef) && !state.autoLoadedRef) {
    selectRef(autoloadRef)
    state.autoLoadedRef = true
  }
}

/* -----------------------------
   Select ref → resolve OID
----------------------------- */
async function selectRef(ref) {
  state.ref = ref
  
  if (state.selectedRefEl) state.selectedRefEl.classList.remove('selected')
  const el = document.querySelector(`[data-ref="${ref}"]`)
  state.selectedRefEl = el
  el.classList.add('selected')
  
  clear($('commits'))
  status(`Resolving ${ref}…`)

  const oid = (await fetchText(`${state.repoUrl}/${ref}`)).trim()
  state.headOid = oid
  state.commitQueue = [oid]
  state.loadedCommits = 0
  state.reachedRoot = false

  await loadMoreCommits()
}

/* -----------------------------
   Commit log (paged)
----------------------------- */
async function loadMoreCommits() {
  status('Loading commits…')

  let count = 0
  while (state.commitQueue.length && count < COMMITS_PER_PAGE) {
    const oid = state.commitQueue.shift()
    const obj = await readObject(state.repoUrl, oid)

    if (obj.type !== 'commit') break

    const commit = parseCommit(obj.body)
    renderCommit(oid, commit)

    if (commit.parent) {
      state.commitQueue.push(commit.parent)
    }
    else {
      state.reachedRoot = true
    }

    count++
    state.loadedCommits++
  }

  updateLoadMoreButton()
  status('')
}

function updateLoadMoreButton() {
  let btn = document.getElementById('loadMore')

  // No more commits → remove button
  if (state.reachedRoot || state.commitQueue.length === 0) {
    if (btn) btn.remove()
    return
  }

  // Otherwise ensure button exists
  if (!btn) {
    btn = document.createElement('button')
    btn.id = 'loadMore'
    btn.textContent = 'Load more'
    btn.onclick = loadMoreCommits
    $('commits-loader').appendChild(btn)
  }
}

function renderCommit(oid, commit) {
  const li = document.createElement('li')
  li.setAttribute('data-commithash', oid)
  li.textContent = `${oid.slice(0, 7)} — ${commit.message.split('\n')[0]}`
  li.onclick = () => selectCommit(oid)
  $('commits').appendChild(li)
}

async function selectCommit(oid) {
  if (state.selectedCommitEl) state.selectedCommitEl.classList.remove('selected')
  const el = document.querySelector(`[data-commithash="${oid}"]`)
  state.selectedCommitEl = el
  el.classList.add('selected')

  status('Loading commit…')
  const commitObj = await readObject(state.repoUrl, oid)
  if (commitObj.type !== 'commit') {
    status('Not a commit object')
    return
  }

  const commit = parseCommit(commitObj.body)
  state.currentCommitOid = oid

  // fetch tree
  const treeObj = await readObject(state.repoUrl, commit.tree)
  if (treeObj.type !== 'tree') {
    status('Not a tree object')
    return
  }

  state.treeObjects = parseTree(treeObj.body)

  // render tree pane
  renderTree()
  status('')
}

function parseTree(body) {
  const entries = []
  let i = 0
  while (i < body.length) {
    // parse mode
    let j = i
    while (body[j] !== 0x20) j++
    const mode = new TextDecoder().decode(body.slice(i, j))
    i = j + 1

    // parse filename
    j = i
    while (body[j] !== 0x00) j++
    const filename = new TextDecoder().decode(body.slice(i, j))
    i = j + 1

    // parse SHA1
    const oidBytes = body.slice(i, i + 20)
    const oid = Array.from(oidBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    i += 20

    const type = mode.startsWith('4') ? 'tree' : 'blob'

    entries.push({ mode, type, oid, path: filename })
  }
  return entries
}

function renderTree() {
  const container = $('tree')
  clear(container)

  for (const entry of state.treeObjects) {
    const li = document.createElement('li')
    li.textContent = entry.path + (entry.type === 'tree' ? '/' : '')
    li.setAttribute('data-filepath', entry.path)
    if (entry.type === 'blob') {
      li.onclick = () => selectFile(entry.path)
    }
    container.appendChild(li)
  }
}

const defaultMdRenderer = new marked.Renderer()
const mdRenderer = new marked.Renderer()
// override markdown link rendering
mdRenderer.link = function(obj) {
  if(!obj.href.match(/^([^/]+):\/\//))
  {
    // make a safe escaped link text
    const escapedText = obj.text || obj.href
    return `<a href="#" data-md-link="${obj.href}" title="${obj.title || obj.href}">${escapedText}</a>`
    // TODO: let href be a permalink
  }
  return defaultMdRenderer.link.call(this, obj)
}

function renderMarkdown(container, body) {
  const html = marked.parse(body, { renderer: mdRenderer })
  container.innerHTML = html

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

async function selectFile(path) {
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

  try {
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
        renderMarkdown(container, new TextDecoder().decode(body))
      } else {
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
  } catch (err) {
    status(err.message)
  }
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
  return ['png','jpg','jpeg','gif','bmp','webp'].includes(ext)
}

function mimeTypeFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  switch (ext) {
    case 'png': return 'image/png'
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'bmp': return 'image/bmp'
    case 'webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
}

/* -----------------------------
   Startup
----------------------------- */
function init() {
  const params = new URLSearchParams(location.search)
  
  const commits_per_page_param = params.get('commits_per_page')
  if(commits_per_page_param) {
    COMMITS_PER_PAGE = commits_per_page_param
  }

  const repo = params.get('repo')
  if (repo) {
    state.repoUrl = repo
  }
  
  $('repoUrl').value = state.repoUrl
  $('loadRepo').onclick = () => {
    const url = $('repoUrl').value.trim()
    const prevRepoUrl = state.repoUrl
    if (url) state.repoUrl = url
    if(prevRepoUrl != url) {
      state.autoLoadedRef = true
    }
    loadRefs().catch(e => status(e.message))
  }
  
  loadRefs().catch(e => status(e.message))
}

init()
