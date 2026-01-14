
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
  autoLoadedRef: false,
  
  treeObjects: [],   // list of {mode, type, oid, path} of the current commit
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
