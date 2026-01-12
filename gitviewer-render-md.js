
const defaultMdRenderer = new marked.Renderer()
const mdRenderer = new marked.Renderer()

// override markdown link rendering
mdRenderer.link = function(obj) {
  if(!obj.href.match(/^([^/]+):\/\//))
  {
    // make a safe escaped link text
    const escapedText = obj.text || obj.href
    return `<a href="#${obj.href}" data-md-link="${obj.href}" title="${obj.title || obj.href}">${escapedText}</a>`
    // TODO: let href be a permalink
  }
  return defaultMdRenderer.link.call(this, obj)
}

export function renderMarkdown(body) {
  return marked.parse(body, { renderer: mdRenderer })
}
