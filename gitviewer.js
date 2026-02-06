
import { $, status, clear, state, reportException } from './common.js'
import { setUrlParam, getUrlParam } from './util.js'
import { loadPackfiles } from './pack.js'
import { loadRefs } from './refs.js'



async function loadRepo(repoUrl) {
  state.repoUrl = repoUrl
  setUrlParam('repo', repoUrl)
  await loadPackfiles()
  await loadRefs()
}

/* -----------------------------
   Startup
----------------------------- */
function init() {
  const commits_per_page_param = getUrlParam('commits_per_page')
  if(commits_per_page_param) {
    COMMITS_PER_PAGE = commits_per_page_param
  }

  const repo = getUrlParam('repo')
  if(repo) {
    $('repoUrl').value = repo
    reportException(loadRepo, repo)
  }
  $('loadRepoBtn').onclick = () => {
    const newRepoUrl = $('repoUrl').value.trim()
    const prevRepoUrl = state.repoUrl
    if(prevRepoUrl != newRepoUrl) {
      state.autoLoadedRef = true
    }
    reportException(loadRepo, newRepoUrl)
  }
}

init()
