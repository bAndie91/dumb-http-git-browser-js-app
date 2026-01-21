
import { escapeHtml } from './gitviewer-util.js';

// --- Tokenizer ---
function tokenize(text) {
  return text.split("\n").map(line => {
    if (line.trim().startsWith(".\"")) return { type:"comment" };
    const m = line.match(/^\.(\S+)(?:\s+(.*))?$/);
    return m
      ? { type: "macro", name: m[1], args: m[2] || "" }
      : { type: "text", text: line };
  });
}

// ---- Inline troff escape processing ----
function processTroffEscapes(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i+1 < text.length) {
      const next = text[i+1];
      switch (next) {
        case "e": out += "\\"; i++; break; // literal backslash
        case "-": out += "-"; i++; break;  // troff minus
        case "\"": return out; // comment rest ignored
        // TODO support \fB, \fI, \fP, \fR, ...
        default:
          // ignore backslash if not recognized
          out += next;
          i++;
      }
    } else {
      out += text[i];
    }
  }
  return out;
}

// ---- Handle .BR / .RB font alternation ----
function fontAlternation(args, order) {
  const parts = args.trim().split(/\s+/);
  const frag = document.createDocumentFragment();
  parts.forEach((p,i) => {
    const span = document.createElement(order[i % order.length] === "B" ? "strong" : "span");
    if (order[i % order.length] === "R") span.style.fontStyle = "normal";
    span.textContent = processTroffEscapes(p) + " ";
    frag.appendChild(span);
  });
  return frag;
}

// --- Parser ---
function parseAndRender(tokens, container) {
  let currentParagraph = null;
  let currentDl = null;
  let inPre = false;

  function closeParagraph() {
    if (currentParagraph) {
      container.appendChild(currentParagraph);
      currentParagraph = null;
    }
  }

  tokens.forEach(tok => {
    
    if (tok.type === "comment") return;

    if (tok.type === "macro") {

      closeParagraph();
      
      const { name, args } = tok;

      // Verbatim toggles
      if (name === "nf") {
        verbatim = true;
        container.appendChild(Object.assign(document.createElement("pre"), { textContent: "" }));
        return;
      }
      if (name === "fi") {
        inPre = false;
        return;
      }
      if (inPre) {
        container.lastElementChild.textContent += args + "\n";
        return;
      }

      switch(name) {
        case "TH":
        case "SH":
        case "SS": {
          const h = document.createElement(({TH: "h1", SH: "h2", SS: "h3"})[name]);
          h.textContent = processTroffEscapes(args);
          container.appendChild(h);
        } break;

        case "PP":
        case "LP": {
          currentParagraph = document.createElement("p");
        } break;

        case "TP":
        case "TQ": {
          if (!currentDl) {
            currentDl = document.createElement("dl");
            container.appendChild(currentDl);
          }
        } break;
        
        case "IP": {
          if (currentDl) {
            const dt = document.createElement("dt");
            dt.textContent = processTroffEscapes(args);
            currentDl.appendChild(dt);
            const dd = document.createElement("dd");
            currentDl.appendChild(dd);
          }
        } break;

        case "BR":
          closeParagraph();
          container.appendChild(fontAlternation(args, ["B","R"]));
        break;

        case "RB":
          closeParagraph();
          container.appendChild(fontAlternation(args, ["R","B"]));
        break;
        
        default: {
          if(args.trim() !== "") {
            // unhandled macro → clickable:
            const cue = document.createElement("span");
            cue.classList.add('troff-macro-unknown')
            cue.textContent = "⧉";  // U+29C9 TWO JOINED SQUARES
            cue.setAttribute('onclick', 'this.classList.toggle("expanded")');
            container.appendChild(cue);
  
            const detail = document.createElement("span");
            detail.textContent = `.${name} ${args}`;
            cue.appendChild(detail);
          }
        }
      }
    }
    else if (tok.type === "text") {
      if (!currentParagraph) {
        currentParagraph = document.createElement("p");
      }
      currentParagraph.textContent += processTroffEscapes(tok.text) + "\n";
    }
  });
  
  closeParagraph();
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

  const tokens = tokenize(text)
  const rendered = document.createElement('DIV')
  parseAndRender(tokens, rendered)
  return rendered.innerHTML
}
