
import { $, status, clear, state, reportException } from './gitviewer-common.js'
import { readObject } from './gitviewer-object.js'
import { selectFile } from './gitviewer-file.js'

export function parseTree(body, path) {
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

    state.treeObjects.push({ mode, type, oid, path, filename })
  }
}

export async function loadTree(parentElem, parentPath, treeOID) {
  // fetch tree
  const treeObj = await readObject(state.repoUrl, treeOID)
  if (treeObj.type !== 'tree') {
    throw new Exception(`Not a tree object: ${treeOID}`)
  }
  
  parseTree(treeObj.body, parentPath)
  renderTree(parentElem, parentPath)
}

async function loadSubTree(parentElem, treeOID) {
  const subtreeElem = document.createElement('UL')
  const parentPath = parentElem.dataset.gitTreePath+'/'
  parentElem.appendChild(subtreeElem)
  await loadTree(subtreeElem, parentPath, treeOID)
}

async function expandSubTree(li, oid) {
  const subtreeElem = li.querySelector(':scope > ul')
  if (!subtreeElem) {
    await loadSubTree(li, oid)
    li.classList.add('open')
  }
  else {
    if(li.classList.contains('open')) li.classList.remove('open')
    else li.classList.add('open')
  }
}

async function renderTree(parentElem, parentPath) {
  const auto_filepath = new URLSearchParams(location.search).get('filepath')
  
  for (const entry of state.treeObjects.filter(entry => entry.path == parentPath)) {
    const filePath = parentPath + entry.filename
    const li = document.createElement('li')
    li.setAttribute('data-git-tree-path', filePath)
    li.textContent = entry.filename
    if (entry.type === 'tree') {
      li.classList.add('folder')
    }
    
    li.onclick = (evt) => {
      evt.stopPropagation()
      if (entry.type === 'blob') {
        reportException(selectFile, filePath)
      }
      else if (entry.type === 'tree') {
        reportException(expandSubTree, li, entry.oid)
      }
      else status(`unknown entry type: ${entry.type}`)
    }
    parentElem.appendChild(li)
    
    if(state.selectedFilePath) {
      if(state.selectedFilePath == filePath) {
        await selectFile(filePath);
      }
    }
    else if(filePath === auto_filepath) {
      await selectFile(filePath);
    }
    else if(['README', 'README.md', 'README.txt'].indexOf(entry.filename)>=0) {
      await selectFile(filePath);
    }
  }
}
