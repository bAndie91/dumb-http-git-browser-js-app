
import { $, status, clear, state, reportException } from './common.js'
import { selectElements, formatDateTime } from './util.js'
import { parseCommit, selectCommit } from './commit.js'
import { readObject } from './object.js'

var COMMITS_PER_PAGE = 5

/* -----------------------------
   Commit log (paged)
----------------------------- */
export async function loadMoreCommits(loadAll) {
  status('Loading commits…')

  let count = 0
  while (state.commitQueue.length && (loadAll || count < COMMITS_PER_PAGE)) {
    const oid = state.commitQueue.shift()
    const obj = await readObject(state.repoUrl, oid)

    if (obj.type !== 'commit') break

    const commit = parseCommit(obj.body)
    const commitListItem = renderCommit(oid, commit)
    $('commits').appendChild(commitListItem)

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
  const tpl = document.getElementById('commit-list-item-template')
  const node = tpl.content.cloneNode(true)

  selectElements('.commit-list-item', node)
    .setAttribute('data-commithash', oid)
    .on('click', () => reportException(selectCommit, oid))
  selectElements('.commit-datetime', node).textContent = formatDateTime(commit.committer.datetime)
  selectElements('.commit-message-subject', node).textContent = commit.message.split('\n', 1)[0]
  return node
}
