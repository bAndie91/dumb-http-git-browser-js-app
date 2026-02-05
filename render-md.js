
import { state } from './common.js'
import { slugify } from './util.js'
import { mimeTypeFromFilename, getTreeEntryContent, resolveRelativePath } from './file.js'

const defaultMdRenderer = new marked.Renderer()
const mdRenderer = new marked.Renderer()


function isAbsoluteLink(link) {
  return link.match(/^([^/]+):/)
}
function isFragmentLink(link) {
  return link.match(/^#/)
}

// override markdown link rendering
mdRenderer.link = function(obj) {
  if(!isAbsoluteLink(obj.href) && !isFragmentLink(obj.href))
  {
    // make a safe escaped link text
    const escapedText = obj.text || obj.href
    return `<a href="javascript:;" data-relative-link="${obj.href}" title="${obj.title || obj.href}">${escapedText}</a>`
    // TODO: let href be a permalink
  }
  return defaultMdRenderer.link.call(this, obj)
}

mdRenderer.image = function(obj) {
  if(!isAbsoluteLink(obj.href)) {
    const imageLink = obj.href
    obj.href = ''
    const rendered = defaultMdRenderer.image.call(this, obj)
    const html_parser = new DOMParser()
    const doc = html_parser.parseFromString(rendered, 'text/html')
    const img = doc.querySelector(`img`)
    const img_id = 'gitviewer-img-' + Math.random().toString(36).substr(2, 9)
    img.id = img_id
    
    const basePath = state.selectedFilePath
    const resolvedPath = resolveRelativePath(basePath, imageLink)
    getTreeEntryContent(resolvedPath).then((body) => {
      const basename = imageLink.split('/').pop()
      const blob = new Blob([body], { type: mimeTypeFromFilename(basename) })
      const updateImageSrc = () => {
        const img = document.getElementById(img_id)
        if(img) {
          img.src = URL.createObjectURL(blob)
        }
        else {
          // <img> not yet appended to the DOM
          setTimeout(updateImageSrc, 200)
        }
      }
      updateImageSrc()
    })
    return img.outerHTML
  }
  return defaultMdRenderer.image.call(this, obj)
}


let toc = [];

mdRenderer.heading = function(obj) {
    let rendered = defaultMdRenderer.heading.call(this, obj)
    const html_parser = new DOMParser()
    const doc = html_parser.parseFromString(rendered, 'text/html');
    const heading = doc.querySelector(`h${obj.depth}`)
    let text = heading.innerText
    const id = slugify(text);
    toc.push({
      level: obj.depth,
      text,
      id
    });
    heading.id = id
    return heading.outerHTML
}

function buildTocTree(headings) {
  const root = [];
  const stack = [{ level: 0, children: root }];

  for (const h of headings) {
    const node = { ...h, children: [] };

    while (stack.at(-1).level >= h.level) {
      stack.pop();
    }

    stack.at(-1).children.push(node);
    stack.push(node);
  }

  return root;
}

function renderToc(nodes) {
  if (!nodes.length) return '';
  const list_items = nodes.map(n => `
    <li>
      <a href="#${n.id}">${n.text}</a>
      ${renderToc(n.children)}
    </li>
  `).join('');
  return `<ul class="toc">
      ${list_items}
    </ul>
`;
}

export function renderMarkdown(body) {
  toc = [];
  let rendered = marked.parse(body, { renderer: mdRenderer })
  
  const tocTree = buildTocTree(toc);
  const tocHtml = renderToc(tocTree);
  if(tocHtml != '') {
    rendered = `<fieldset>
      <legend>Table Of Contents</legend>
      <nav class="toc-container">
        ${tocHtml}
      </nav>
    </fieldset>
    ` + rendered;
  }
  return rendered;
}
