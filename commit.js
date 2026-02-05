
import { $, status, clear, state, reportException } from './common.js'
import { explode, selectElements, formatDateTime, createMailtoLink } from './util.js'
import { readObject } from './object.js'
import { loadTree } from './tree.js'

export function parseCommit(body) {
  const text = new TextDecoder().decode(body)
  const [rawHeaders, message] = explode(text, '\n\n', 2)

  const headers = {}
  for (const line of rawHeaders.split('\n')) {
    const space = line.indexOf(' ')
    const k = line.slice(0, space)
    const v = line.slice(space + 1)
    headers[k] = v
  }

  const author = parseCommitAuthorHeader(headers.author || '')
  const committer = parseCommitAuthorHeader(headers.committer || '')

  return {
    headers,
    tree: headers.tree,
    parent: headers.parent,
    author,
    committer,
    message: message || ''
  }
}

function parseCommitAuthorHeader(line) {
  // Match: "Name <email> 1234567890 +0100"
  const m = line.match(/^((.*)\s+(\S+?))\s+(\d+)\s+([+-]\d+)$/)
  /* if (!m) throw new Error(`Invalid commit author line: ${line}`) */

  const identity = m[1]
  const name = m[2]
  const email = m[3]
  const timestamp = Number(m[4])
  const timezone = m[5]

  return {
    line,
    identity,
    name,
    email,
    timestamp,
    timezone,
    datetime: new Date(timestamp * 1000)
  }
}

export async function selectCommit(oid) {
  if (state.selectedCommitEl) state.selectedCommitEl.classList.remove('selected')
  const el = document.querySelector(`[data-commithash="${oid}"]`)
  state.selectedCommitEl = el
  el.classList.add('selected')

  status('Loading commit…')
  const commitObj = await readObject(state.repoUrl, oid)
  if (commitObj.type !== 'commit') {
    throw new Error(`Not a commit object: ${oid}`)
  }

  const commit = parseCommit(commitObj.body)
  state.currentCommitOid = oid

  updateCommitDetails(commit, oid)

  // render tree pane
  state.treeObjects = []
  const treeRootEl = $('tree')
  clear(treeRootEl)
  await loadTree(treeRootEl, '', commit.tree)
  status('')
}

function renderCommitDetails(commit, oid) {
  const tpl = document.getElementById('commit-details-template')
  const node = tpl.content.cloneNode(true)
  
  selectElements('.commit-hash', node).textContent = oid
  selectElements('.commit-author-name', node).textContent = commit.author.name
  selectElements('.commit-author-email', node).forEach((el) => el.appendChild(createMailtoLink(commit.author.email)))
  selectElements('.commit-author-datetime', node).textContent = formatDateTime(commit.author.datetime)
  selectElements('.commit-committer-name', node).textContent = commit.committer.name
  selectElements('.commit-committer-email', node).forEach((el) => el.appendChild(createMailtoLink(commit.committer.email)))
  selectElements('.commit-commit-datetime', node).textContent = formatDateTime(commit.committer.datetime)
  selectElements('.commit-message', node).textContent = commit.message
  
  selectElements(commit.author.identity === commit.committer.identity 
    ? '.commit-author-differ-committer'
    : '.commit-author-equal-committer', node).style.display = 'none'
  selectElements(commit.author.timestamp === commit.committer.timestamp 
    ? '.commit-author-date-differ-committer-date'
    : '.commit-author-date-equal-committer-date', node).style.display = 'none'

  return node
}

function updateCommitDetails(commit, oid) {
  const container = document.getElementById('commitDetails')
  container.innerHTML = ''
  container.appendChild(renderCommitDetails(commit, oid))
}
