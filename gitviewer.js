
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

async function fetchLooseGitObject(url) {
  try {
    return await fetchBinary(url)
  } catch (err) {
    console.log("failed to read loose object: " + err.message)
  }
  return null
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

/* -----------------------------
   Dumb HTTP: objects
----------------------------- */
async function readObject(repoUrl, oid) {
  const dir = oid.slice(0, 2)
  const file = oid.slice(2)
  const compressed = await fetchLooseGitObject(`${repoUrl}/objects/${dir}/${file}`)
  
  if(compressed !== null)
  {
    const data = pako.inflate(compressed)
    const nul = data.indexOf(0)
  
    const header = new TextDecoder().decode(data.slice(0, nul))
    const body = data.slice(nul + 1)
  
    const [type, size] = header.split(' ')
    return { type, size: +size, body }
  }
  
  // try packfiles
  const hit = findInPack(oid)
  if (!hit) throw new Error(`Object ${oid} neither found in packfiles`)
  return readPackedObject(hit.pack, hit.offset)
}

async function loadPackList(repoUrl) {
  const text = await fetchText(`${repoUrl}/objects/info/packs`)
  const packs = []

  for (const line of text.split('\n')) {
    if (line.startsWith('P pack-')) {
      packs.push(line.slice(2).trim())
    }
  }

  return packs.map(p => p.replace(/\.pack$/, ''))
}

function readUint32BE(buf, off) {
  return (
    (buf[off] << 24) |
    (buf[off + 1] << 16) |
    (buf[off + 2] << 8) |
    buf[off + 3]
  ) >>> 0
}

async function loadPack(base) {
  const [idxBuf, packBuf] = await Promise.all([
    fetch(`${state.repoUrl}/objects/pack/${base}.idx`).then(r => r.arrayBuffer()),
    fetch(`${state.repoUrl}/objects/pack/${base}.pack`).then(r => r.arrayBuffer())
  ])

  const idx = new Uint8Array(idxBuf)
  const pack = new Uint8Array(packBuf)

  let pos = 0

  // ---- header ----
  if (
    idx[pos] !== 0xff ||
    idx[pos + 1] !== 0x74 ||
    idx[pos + 2] !== 0x4f ||
    idx[pos + 3] !== 0x63
  ) {
    throw new Error('Invalid idx signature: '+idx[pos]+","+idx[pos+1]+","+idx[pos+2]+","+idx[pos+3])
  }
  pos += 4

  const version = readUint32BE(idx, pos)
  pos += 4
  if (version !== 2) {
    throw new Error(`Unsupported idx version ${version}`)
  }

  // ---- fanout ----
  const fanout = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    fanout[i] = readUint32BE(idx, pos)
    pos += 4
  }

  const objectCount = fanout[255]

  // ---- object IDs ----
  const oids = new Uint8Array(objectCount * 20)
  for (let i = 0; i < objectCount; i++) {
    oids.set(idx.subarray(pos, pos + 20), i * 20)
    pos += 20
  }

  // ---- CRCs (skip) ----
  pos += objectCount * 4

  // ---- raw offsets ----
  const rawOffsets = new Array(objectCount)
  for (let i = 0; i < objectCount; i++) {
    rawOffsets[i] = readUint32BE(idx, pos)
    pos += 4
  }

  // ---- resolve offsets ----
  const offsets = new Array(objectCount)
  const largeOffsetsBase = pos

  for (let i = 0; i < objectCount; i++) {
    const o = rawOffsets[i]
    if (o & 0x80000000) {
      const n = o & 0x7fffffff
      const hi = readUint32BE(idx, largeOffsetsBase + n * 8)
      const lo = readUint32BE(idx, largeOffsetsBase + n * 8 + 4)
      offsets[i] = hi * 2 ** 32 + lo
    } else {
      offsets[i] = o
    }
  }

  // ---- build lookup map ----
  const objects = new Map()
  for (let i = 0; i < objectCount; i++) {
    objects.set(oids[i], offsets[i])
  }

  // ---- register packfile ----
  state.packfiles.push({
    base,
    pack,
    fanout,
    oids,
    offsets,
  })
}

function findInPack(oidHex) {
  const oid = hexToBytes(oidHex)

  for (const p of state.packfiles) {
    const first = oid[0]
    const lo = first === 0 ? 0 : p.fanout[first - 1]
    const hi = p.fanout[first]

    for (let i = lo; i < hi; i++) {
      const o = p.oids.slice(i * 20, i * 20 + 20)
      if (equalBytes(o, oid)) {
        return { pack: p.pack, offset: p.offsets[i], }
      }
    }
  }
  return null
}

function hexToBytes(hex) {
  const a = new Uint8Array(20)
  for (let i = 0; i < 20; i++)
    a[i] = parseInt(hex.substr(i * 2, 2), 16)
  return a
}

function equalBytes(a, b) {
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) return false
  return true
}

function readPackedObject(pack, offset) {
  let i = offset
  let c = pack[i++]

  const typeNum = (c >> 4) & 7
  const type = packType(typeNum)
  if (type.match(/DELTA/)) {
    throw new Error("Delta object: not yet supported")
  }

  let size = c & 0x0f
  let shift = 4

  while (c & 0x80) {
    c = pack[i++]
    size |= (c & 0x7f) << shift
    shift += 7
  }

  // Now i points to start of compressed data
  const compressedStart = i
  // Use streaming decompression to find exact boundary
  const decompressed = decompressPackedObject(pack, compressedStart, size)

  return { type, body: decompressed }
}

function packType(t) {
  return {
    1: 'commit',
    2: 'tree',
    3: 'blob',
    4: 'tag',
    6: 'OFS_DELTA',
    7: 'REF_DELTA',
  }[t]
}

function decompressPackedObject(pack, start, expectedSize) {
  const b1 = pack[start]
  const b2 = pack[start + 1]
  
  console.log('=== DECOMPRESSION DEBUG ===')
  console.log(`Start offset: ${start}`)
  console.log(`Expected size: ${expectedSize}`)
  console.log(`First bytes: ${Array.from(pack.slice(start, start + 20)).map(b => b.toString(16).padStart(2,'0')).join(' ')}`)
  
  // For 78 9c, skip the 2-byte zlib header and use raw deflate
  // This avoids pako's header validation entirely
  const isZlib = (b1 === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b2))
  
  if (isZlib) {
    console.log('Detected zlib wrapper - stripping header and using raw deflate')
    // Skip 2-byte zlib header, decompress the raw deflate stream
    return decompressPackedObjectRaw(pack, start + 2, expectedSize)
  } else {
    console.log('Using raw deflate from start')
    return decompressPackedObjectRaw(pack, start, expectedSize)
  }
}

function decompressPackedObjectRaw(pack, start, expectedSize) {
  // Binary search for the right amount of compressed data
  let lo = Math.floor(expectedSize * 0.3)
  let hi = Math.min(pack.length - start, expectedSize * 5)
  let bestResult = null
  
  console.log(`Binary searching between ${lo} and ${hi} bytes`)
  
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    
    try {
      // Use raw deflate (no zlib wrapper)
      const inflator = new pako.Inflate({ raw: true })
      const chunk = pack.subarray(start, start + mid)
      inflator.push(chunk, true)
      
      if (inflator.err) {
        console.log(`${mid} bytes: error - ${inflator.msg}`)
        lo = mid + 1
        continue
      }
      
      const result = inflator.result
      console.log(`${mid} bytes: decompressed ${result.length} bytes`)
      
      if (result.length >= expectedSize) {
        bestResult = result
        hi = mid - 1  // Try smaller
      } else {
        lo = mid + 1  // Need more
      }
    } catch (err) {
      console.log(`${mid} bytes: exception - ${err.message}`)
      lo = mid + 1
    }
  }
  
  if (bestResult && bestResult.length >= expectedSize) {
    console.log(`Success! Using ${bestResult.length} decompressed bytes`)
    return bestResult.subarray(0, expectedSize)
  }
  
  throw new Error(`Could not decompress: best result was ${bestResult ? bestResult.length : undefined} bytes, needed ${expectedSize}`)
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
  packfiles: [],
  
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
    li.onclick = () => reportException(selectRef, ref)
    $('refs').appendChild(li)
  }

  status('')
  
  // auto-select ref from URL
  var autoloadRef = new URLSearchParams(location.search).get('ref')
  if (autoloadRef) {
    autoloadRef = 'refs/'+autoloadRef
  }
  if (!autoloadRef || state.autoLoadedRef) {
    await selectRef(state.headRef)
  }
  if(autoloadRef && refs.includes(autoloadRef) && !state.autoLoadedRef) {
    await selectRef(autoloadRef)
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
async function loadMoreCommits(loadAll) {
  status('Loading commits…')

  let count = 0
  while (state.commitQueue.length && (loadAll || count < COMMITS_PER_PAGE)) {
    const oid = state.commitQueue.shift()
    const obj = await readObject(state.repoUrl, oid)

    if (obj.type !== 'commit') break

    const commit = parseCommit(obj.body)
    renderCommit(oid, commit)

    if(oid == state.headOid) {
      selectCommit(oid)
    }

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
  let btnMore = document.getElementById('loadMoreBtn')
  let btnAll = document.getElementById('loadAllBtn')

  // No more commits → remove button
  if (state.reachedRoot || state.commitQueue.length === 0) {
    if (btnMore) btnMore.remove()
    if (btnAll) btnAll.remove()
    return
  }

  // Otherwise ensure button exists
  if (!btnMore) {
    btnMore = document.createElement('button')
    btnMore.id = 'loadMoreBtn'
    btnMore.textContent = 'Load more'
    btnMore.onclick = () => reportException(loadMoreCommits, false)
    $('commits-loader').appendChild(btnMore)
  }
  if (!btnAll) {
    btnAll = document.createElement('button')
    btnAll.id = 'loadAllBtn'
    btnAll.textContent = 'Load All'
    btnAll.onclick = () => reportException(loadMoreCommits, true)
    $('commits-loader').appendChild(btnAll)
  }
}

function renderCommit(oid, commit) {
  const li = document.createElement('li')
  li.setAttribute('data-commithash', oid)
  li.textContent = `${oid.slice(0, 7)} — ${commit.message.split('\n')[0]}`
  li.onclick = () => reportException(selectCommit, oid)
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
      li.onclick = () => reportException(selectFile, entry.path)
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
    return `<a href="#${obj.href}" data-md-link="${obj.href}" title="${obj.title || obj.href}">${escapedText}</a>`
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

async function loadPackfiles() {
    state.packfiles = []
    const packs = await loadPackList(state.repoUrl)
    for (const base of packs) {
      await loadPack(base)
    }
}

async function loadRepo(repoUrl) {
  const prevRepoUrl = state.repoUrl
  state.repoUrl = repoUrl
  if(prevRepoUrl != repoUrl) {
    state.autoLoadedRef = true
  }
  await loadPackfiles()
  await loadRefs()
}

async function reportException(func, ...args) {
  try {
    const result = await func(...args)
    return result
  } catch (e) {
    console.log(e)
    status("Error: " + e.message)
    throw e
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
  if(repo) {
    $('repoUrl').value = repo
    reportException(loadRepo, repo)
  }
  $('loadRepoBtn').onclick = () => {
    const url = $('repoUrl').value.trim()
    reportException(loadRepo, url)
  }
}

init()
