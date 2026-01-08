
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

const COMMITS_PER_PAGE = 5

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
    li.onclick = () => selectFile(entry.path)
    container.appendChild(li)
  }
}

function selectFile(path) {
  if (state.selectedFileEl) state.selectedFileEl.classList.remove('selected')
  const el = document.querySelector(`[data-filepath="${path}"]`)
  state.selectedFileEl = el
  el.classList.add('selected')

  // TODO: load blob content
}

/* -----------------------------
   Startup
----------------------------- */
function init() {
  const params = new URLSearchParams(location.search)
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
