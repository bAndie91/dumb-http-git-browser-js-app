
import { $, status, clear, state, reportException } from './gitviewer-common.js'
import { selectFile } from './gitviewer-file.js'

export function parseTree(body) {
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

export function renderTree() {
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
    
    if(state.selectedFilePath) {
      if(state.selectedFilePath == entry.path) {
        selectFile(entry.path);
      }
    }
    else if(['README', 'README.md', 'README.txt'].indexOf(entry.path)>=0) {
      selectFile(entry.path);
    }
  }
}
