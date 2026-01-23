
function parseTroff(troffText) {
  const lines = troffText.split(/\r?\n/);
  let html = '', stack = [];  // stack to track open lists or blocks

  for (let rawLine of lines) {
    // 1. Remove comment lines
    if (/^\.\\[""]/.test(rawLine)) continue;

    // 2. Unescape common escapes (\- → -, \\\& → '', etc.) as needed
    let line = rawLine.replace(/\\-/g, '-').replace(/\\\&/g, '')
                      .replace(/\\fB/g, '<span class="fB">')
                      .replace(/\\fI/g, '<span class="fI">')
                      .replace(/\\f[PR]/g, '</span>'); 
    // (handling of \fP should close whichever font was last opened)

    // 3. Match a macro at line start
    let m = line.match(/^\.(\S+)(?:\s+(.*))?$/);
    if (m) {
      let [, macro, args] = m;
      args = args || '';
      switch (macro) {
        case 'TH':
          // Title: .TH title section date source manual
          let titleText = args.split(/\s+/)[0];
          html += `<h1 class="TH">${titleText}</h1>\n`;
          break;
        case 'SH':
          html += `<section class="SH"><h2>${args}</h2>\n`;
          break;
        case 'SS':
          html += `<h3 class="SS">${args}</h3>\n`;
          break;
        case 'PP':
        case 'LP':
        case 'HP':
        case 'P':
          html += `<p class="${macro}">${args}`;
          break;
        case 'BR':
        case 'BI':
        case 'IR':
        case 'RB':
        case 'RI':
          // Two-part font macros: e.g. .BR bold text, roman text
          const parts = args.split(/\s+/, 2);
          if (parts[0]) html += `<strong class="${macro}">${parts[0]}</strong>`;
          if (parts[1]) html += ` ${parts[1]}`;
          break;
        case 'B':
          html += `<strong class="B">${args}</strong>`;
          break;
        case 'I':
          html += `<em class="I">${args}</em>`;
          break;
        case 'EX':
          html += `<pre class="EX">`;
          stack.push('EX');
          break;
        case 'EE':
          // End example block
          html += `</pre>\n`;
          stack.pop();
          break;
        case 'nf':
          html += `<pre class="nf">`;
          stack.push('nf');
          break;
        case 'fi':
          html += `</pre>\n`;
          stack.pop();
          break;
        case 'Bl':  // begin list (.Bl -enum, -bullet, etc.)
          if (args.includes('-enum')) {
            html += `<ol class="Bl">`;
            stack.push('ol');
          } else {
            html += `<ul class="Bl">`;
            stack.push('ul');
          }
          break;
        case 'El':  // end list
          const listType = stack.pop();
          html += listType === 'ol' ? `</ol>\n` : `</ul>\n`;
          break;
        case 'It':  // list item
          html += `<li class="It">${args}`;
          break;
        case 'IP':
          // Indented/tagged paragraph. E.g. .IP \(bu starts a bullet list.
          if (/\\\(bu/.test(line) || args.startsWith('\\(bu')) {
            // Start bullet list if not already in one
            if (stack[stack.length-1] !== 'ul') {
              html += `<ul class="IP">`;
              stack.push('ul');
            }
            html += `<li class="IP">`;
          } else {
            // Tagged list: .IP tag text
            const [tag, ...rest] = args.split(/\s+/);
            html += `<dt class="IP">${tag}</dt><dd class="IP">${rest.join(' ')}`;
          }
          break;
        case 'TP':
        case 'TQ':
          // Tagged paragraph in man macros: definition list entry
          // If starting new definition list:
          if (!stack.includes('dl')) {
            html += `<dl class="TP">\n`;
            stack.push('dl');
          }
          html += `<dt class="${macro}">`;  // term
          // the actual term text should follow on this line or next
          break;
        case 'UR':
          // Hyperlink start: .UR URL
          html += `<a href="${args}" class="UR">`;
          stack.push('a');  // mark that we're inside a link
          break;
        case 'UE':
          // End hyperlink: close <a>
          html += `</a>`;
          stack.pop();
          break;
        case 'MT':
          // Mail link start: .MT email
          html += `<a href="mailto:${args}" class="MT">`;
          stack.push('a');
          break;
        case 'ME':
          // End mail link
          html += `</a>`;
          stack.pop();
          break;
        case 'RS':
          // Relative indent (blockquote)
          html += `<blockquote class="RS">`;
          stack.push('blockquote');
          break;
        case 'RE':
          html += `</blockquote>\n`;
          stack.pop();
          break;
        case 'RS':
          html += `<blockquote class="RS">`; 
          stack.push('blockquote');
          break;
        case 'PD':
          // Paragraph delimit (could close and start new p)
          html += `</p><p class="PD">`;
          break;
        case 'INDENT':
          // Custom indent
          html += `<div class="INDENT">`;
          stack.push('div');
          break;
        case 'UNINDENT':
          html += `</div>\n`;
          stack.pop();
          break;
        case 'SP':
        case 'sp':
          // Vertical space
          html += `<br class="${macro}"/>`;
          break;
        case 'SH':
          // Already handled above
          break;
        case 'TI': // title end (ignore)
        case 'TH':
        case '\"':
          break;
        default:
          // Catch-all: treat unknown macro as a div or skip
          // (Many technical macros like .nr, .ds, .if, .de are skipped)
          html += macro // TODO
          break;
      }
    } else {
      // No leading dot: normal text or continuation.
      html += line + " ";
    }
    // Ensure paragraphs and items are closed if needed:
    if (/^(?:\.(?:PP|LP|HP|P))/i.test(rawLine)) {
      html += `</p>\n`;
    }
    if (/^(?:\.(?:It|IP))/i.test(rawLine)) {
      html += `</li>\n`;
    }
  }

  // Close any unclosed lists/sections
  while (stack.length) {
    let tag = stack.pop();
    if (tag === 'ul') html += `</ul>\n`;
    else if (tag === 'ol') html += `</ol>\n`;
    else if (tag === 'dl') html += `</dl>\n`;
    else if (tag === 'a') html += `</a>`;
    else if (tag === 'blockquote') html += `</blockquote>\n`;
    else if (tag === 'EX' || tag === 'nf') html += `</pre>\n`;
    else html += `</${tag}>\n`;
  }

  return html;
}


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
  /*
  await loadJroff();
  var generator = new Jroff.HTMLGenerator();
  // Parse man page (an macros)
  var html = generator.generate(text, 'an');
  return html;
  */

  return parseTroff(text)
}
