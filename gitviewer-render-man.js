
export function renderMan(text) {
  const lines = text.split(/\r?\n/);
  let html = '';
  let inPre = false;

  for (let line of lines) {
    if (line.startsWith('.SH ')) {
      html += `<h1>${line.slice(4)}</h1>`;
    } else if (line.startsWith('.SS ')) {
      html += `<h2>${line.slice(4)}</h2>`;
    } else if (line.startsWith('.B ')) {
      html += `<b>${line.slice(3)}</b>`;
    } else if (line.startsWith('.I ')) {
      html += `<i>${line.slice(3)}</i>`;
    } else if (line.startsWith('.TP')) {
      html += `<div class="tagged"><p>`; // tagged paragraph
      inPre = true;
    } else if (line.startsWith('.') && !line.startsWith('.B') && !line.startsWith('.I')) {
      // skip unknown macros
    } else {
      if (inPre) {
        html += line + '</p></div>';
        inPre = false;
      } else {
        html += `<p>${line}</p>`;
      }
    }
  }

  return html;
}
