
export const $ = id => document.getElementById(id)
export const status = msg => $('status').textContent = msg || ''
export const clear = el => el.innerHTML = ''

export const state = {
  repoUrl: null,
  ref: null,
  headOid: null,
  commitQueue: [],
  loadedCommits: 0,
  reachedRoot: false,
  selectedFilePath: null,
  
  treeObjects: [],   // list of {mode, type, oid, path, filename} of the current commit
  packfiles: [],
  
  selectedRefEl: null,
  selectedCommitEl: null,
  selectedFileEl: null,
}

export async function reportException(func, ...args) {
  try {
    const result = await func(...args)
    return result
  } catch (e) {
    console.log(e)
    status("Error: " + e.message)
    throw e
  }
}

export async function fetchText(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}

export async function fetchBinary(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return new Uint8Array(await r.arrayBuffer())
}
