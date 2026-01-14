
/* resizable panes */

function initSplitters(containerId) {
  const container = document.getElementById(containerId);

  container.querySelectorAll('.splitter').forEach(splitter => {
    const first = splitter.previousElementSibling;
    const second = splitter.nextElementSibling;

    if (!first || !second) return;

    const parent = splitter.parentElement;
    const isVertical = parent.classList.contains('vertical');

    splitter.addEventListener('mousedown', e => {
      e.preventDefault();

      const start = isVertical ? e.clientY : e.clientX;
      const firstSize = isVertical ? first.offsetHeight : first.offsetWidth;
      const secondSize = isVertical ? second.offsetHeight : second.offsetWidth;

      function onMove(ev) {
        const current = isVertical ? ev.clientY : ev.clientX;
        const delta = current - start;

        const newFirst = firstSize + delta;
        const newSecond = secondSize - delta;

        if (newFirst < 40 || newSecond < 40) return;

        first.style.flexBasis = `${newFirst}px`;
        second.style.flexBasis = `${newSecond}px`;
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        savePaneSizes(parent);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

function savePaneSizes(panesContainer) {
  const panes = [...panesContainer.children].filter(el => el.classList.contains('pane'));
  const isVertical = panesContainer.classList.contains('vertical');
  const total = isVertical ? panesContainer.clientHeight : panesContainer.clientWidth;

  const sizes = panes.map(p =>
    (isVertical ? p.offsetHeight : p.offsetWidth) / total
  );

  const key = 'pane-sizes-' + panesContainer.id;
  localStorage.setItem(key, JSON.stringify(sizes));
}

function loadPaneSizes(panesContainer) {
  const key = 'pane-sizes-' + panesContainer.id;
  const raw = localStorage.getItem(key);
  if (!raw) return;

  const panes = [...panesContainer.children].filter(el => el.classList.contains('pane'));
  const sizes = JSON.parse(raw);

  if (sizes.length !== panes.length) return;

  panes.forEach((pane, i) => {
    pane.style.flexBasis = `${sizes[i] * 100}%`;
  });
}

/* commit log message view modes */

function setLongLinesDisplayMode(modeSwitcherContainer, mode, targetContainer) {
  const buttons = modeSwitcherContainer.querySelectorAll('button');
  // Update button states
  buttons.forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.setAttribute('aria-checked', isActive);
  });
  // Update message styles
  targetContainer.classList.remove('ellipsize-long-lines')
  targetContainer.classList.remove('hscroll-long-lines')
  targetContainer.classList.remove('wrap-long-lines')
  targetContainer.classList.add(`${mode}-long-lines`)
}

function initLongLinesDisplayModeSwitcherContainer(modeSwitcherContainer, pane_name, targetContainer) {
  // Add click handlers to buttons
  const buttons = modeSwitcherContainer.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem(`longLinesDisplayMode-${pane_name}`, btn.dataset.mode);
      setLongLinesDisplayMode(modeSwitcherContainer, btn.dataset.mode, targetContainer);
    });
  });
}

/* init */

document.addEventListener("DOMContentLoaded", () => {
  for (let panesContainer of document.querySelectorAll('.panes[id]')) {
    loadPaneSizes(panesContainer)
  }
  initSplitters('panes-main');
  
  for(const pane_name of ['refs', 'log', 'commit', 'tree', 'file']) {
    const pane = document.getElementById(`pane-${pane_name}`)
    const pane_head = pane.querySelector('h3')
    const targetContainer = pane.querySelector('.pane-inner')
    const tpl = document.getElementById('long-lines-display-mode-switcher')
    pane_head.appendChild(tpl.content.cloneNode(true))
    
    const longLinesDisplayModeSwitcherContainer = pane_head.querySelector('.long-lines-display-mode-switcher')
    initLongLinesDisplayModeSwitcherContainer(longLinesDisplayModeSwitcherContainer, pane_name, targetContainer);
    setLongLinesDisplayMode(longLinesDisplayModeSwitcherContainer, localStorage.getItem(`longLinesDisplayMode-${pane_name}`) || 'hscroll', targetContainer);
  }
});
