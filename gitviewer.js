
import { $, status, clear, state, reportException } from './gitviewer-common.js'
import { loadPackfiles } from './gitviewer-pack.js'
import { loadRefs } from './gitviewer-refs.js'



async function loadRepo(repoUrl) {
  state.repoUrl = repoUrl
  await loadPackfiles()
  await loadRefs()
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
    const newRepoUrl = $('repoUrl').value.trim()
    const prevRepoUrl = state.repoUrl
    if(prevRepoUrl != newRepoUrl) {
      state.autoLoadedRef = true
    }
    reportException(loadRepo, newRepoUrl)
  }
}

init()
