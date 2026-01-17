
const defaultMdRenderer = new marked.Renderer()
const mdRenderer = new marked.Renderer()

function slugify(text) {
    return text.toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

function isAbsoluteLink(link) {
  return link.match(/^([^/]+):\/\//)
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
    obj.href = null // TODO image source points into the repo, make a "data:" URL
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
