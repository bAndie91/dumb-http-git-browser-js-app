
function loadJroff() {
  return new Promise((resolve, reject) => {
    if (window.Jroff) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'jroff.js';
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load jroff.js'));

    document.head.appendChild(script);
  });
}

export async function renderMan(text) {
  await loadJroff();
  var generator = new Jroff.HTMLGenerator();
  // Parse man page (an macros)
  var html = generator.generate(text, 'an');
  return html;
}
