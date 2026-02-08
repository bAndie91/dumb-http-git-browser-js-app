
import { $, status, clear, state, reportException, fetchText } from './common.js'
import { setUrlParam, getUrlParam } from './util.js'
import { loadMoreCommits } from './commitlog.js'

export async function loadRefs() {
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
  var autoloadRef = getUrlParam('ref')
  if (autoloadRef) {
    autoloadRef = 'refs/'+autoloadRef
  }
  if (autoloadRef) {
    if(refs.includes(autoloadRef)) {
      await selectRef(autoloadRef)
    }
  }
  else {
    var autoloadCommit = getUrlParam('commit')
    if(autoloadCommit) {
      state.commitQueue = [ autoloadCommit ]
      await loadMoreCommits()
    }
    else {
      await selectRef(state.headRef)
    }
  }
}

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
   Select ref → resolve OID
----------------------------- */
async function selectRef(ref) {
  state.ref = ref
  
  if (state.selectedRefEl) state.selectedRefEl.classList.remove('selected')
  const el = document.querySelector(`[data-ref="${ref}"]`)
  state.selectedRefEl = el
  el.classList.add('selected')
  setUrlParam('ref', ref.replace(/^(refs\/)/, ''))
  
  clear($('commits'))
  status(`Resolving ${ref}…`)

  const oid = (await fetchText(`${state.repoUrl}/${ref}`)).trim()
  state.headOid = oid
  state.commitQueue = [oid]
  state.loadedCommits = 0
  state.reachedRoot = false

  await loadMoreCommits()
}
