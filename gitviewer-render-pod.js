export function renderPOD(pod) {
   const lines = pod.split('\n');
   const html = [];
   const listStack = [];
   let inVerbatim = false;
   let verbatimBuffer = [];
   let paragraphBuffer = [];

   function getCurrentList() {
       return listStack.length > 0 ? listStack[listStack.length - 1] : null;
   }

   function escapeHtml(text) {
       return text.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;');
   }

   function flushVerbatim() {
       if (verbatimBuffer.length > 0) {
           const content = escapeHtml(verbatimBuffer.join('\n'));
           const currentList = getCurrentList();
           if (currentList && currentList.currentItem !== null) {
               currentList.currentItem.push('<pre><code>' + content + '</code></pre>');
           } else {
               html.push('<pre><code>' + content + '</code></pre>');
           }
           verbatimBuffer = [];
       }
       inVerbatim = false;
   }

   function flushParagraph() {
       if (paragraphBuffer.length > 0) {
           const text = paragraphBuffer.join('\n');
           const processed = processFormatting(text);
           const currentList = getCurrentList();
           if (currentList && currentList.currentItem !== null) {
               currentList.currentItem.push('<p>' + processed + '</p>');
           } else {
               html.push('<p>' + processed + '</p>');
           }
           paragraphBuffer = [];
       }
   }

   function closeListItem() {
       const currentList = getCurrentList();
       if (currentList && currentList.currentItem !== null) {
           html.push('<li>' + currentList.currentItem.join('') + '</li>');
           currentList.currentItem = null;
       }
   }

   function closeList() {
       if (listStack.length > 0) {
           closeListItem();
           const list = listStack.pop();
           html.push(list.type === 'ul' ? '</ul>' : '</ol>');
       }
   }

   function slugify(text) {
       return text.toLowerCase()
           .replace(/<[^>]+>/g, '')
           .replace(/[^\w\s-]/g, '')
           .replace(/\s+/g, '-')
           .replace(/-+/g, '-')
           .trim();
   }

   function processEntity(entity) {
       if (entity.match(/^\d+$/)) {
           return '&#' + entity + ';';
       }
       if (entity.match(/^0x[0-9a-fA-F]+$/)) {
           return '&#x' + entity.substring(2) + ';';
       }
       const entityMap = {
           'verbar': '|', 'sol': '/', 'apos': '&#39;',
       };
       return entityMap[entity] || '&' + entity + ';';
   }

   function findMatchingBrackets(text, startPos) {
       let count = 1;
       let pos = startPos;
       while (pos < text.length && count > 0) {
           if (text[pos] === '<') count++;
           else if (text[pos] === '>') count--;
           pos++;
       }
       return count === 0 ? pos : -1;
   }

   function renderPodTag(code, text, i) {
       let bracketCount = 0;
       let j = i + 1;
       while (j < text.length && text[j] === '<') {
           bracketCount++;
           j++;
       }
       let replacement = '';

       // Find the matching closing brackets
       let endPos = j;
       let closingStart = -1;
       
       if(bracketCount == 1) {
         // if it's a simple-bracket A<...> tag, allow nested single-bracket tags like A<B<...>>
         let innerBracketCount = bracketCount;
         while (endPos <= text.length) {
           if(text[endPos] == '<') { innerBracketCount++; }
           if(text[endPos] == '>') { innerBracketCount--; }
           if(innerBracketCount == 0) { closingStart = endPos; break; }
           endPos++;
         }
       }
       else {
         // TODO: allow nested A<< B<< ... >> >> like tags but require whitespace before closing bracket cluster.
         
         while (endPos <= text.length - bracketCount) {
           // Check if we have bracketCount consecutive '>' at this position
           let match = true;
           for (let k = 0; k < bracketCount; k++) {
               if (text[endPos + k] !== '>') {
                   match = false;
                   break;
               }
           }
           if (match) {
               closingStart = endPos;
               break;
           }
           endPos++;
         }
       }
       
       if (closingStart !== -1) {
           const content = processFormatting(text.substring(j, closingStart).trim());
           
           if (code === 'Z') {
               replacement = '';
           } else if (code === 'E') {
               replacement = processEntity(content);
           } else if (code === 'S') {
               replacement = content.replace(/ /g, '&nbsp;');
           } else if (code === 'B') {
               replacement = '<strong>' + content + '</strong>';
           } else if (code === 'I') {
               replacement = '<em>' + content + '</em>';
           } else if (code === 'C') {
               replacement = '<code class="pod-tag-code">' + content + '</code>';
           } else if (code === 'F') {
               replacement = '<code class="pod-tag-file">' + content + '</code>';
           } else if (code === 'L') {
               const sectionMatch = content.match(/^(.+?)\|(\/.+)$/) || content.match(/^(\/.+)$/);
               if (sectionMatch) {
                   const label = sectionMatch[2] ? sectionMatch[1] : sectionMatch[1].substring(1);
                   const section = sectionMatch[2] ? sectionMatch[2].substring(1) : sectionMatch[1].substring(1);
                   const anchor = slugify(section);
                   replacement = '<a href="#' + anchor + '">' + escapeHtml(label) + '</a>';
               } else {
                   const parts = content.split('|');
                   if (parts.length === 2) {
                       replacement = '<a href="' + escapeHtml(parts[1].trim()) + '">' + escapeHtml(parts[0].trim()) + '</a>';
                   } else {
                       replacement = '<a href="' + escapeHtml(content) + '">' + escapeHtml(content) + '</a>';
                   }
               }
           }
           
           i = closingStart + bracketCount;
       }
       
       return { text: replacement, continuePos: i };
   }

    function processFormatting(text) {
       const codes = ['Z', 'E', 'S', 'B', 'I', 'C', 'F', 'L'];
       let newText = '';
       let i = 0;
       while (i < text.length) {
           if (codes.indexOf(text[i]) >= 0 && i + 1 < text.length && text[i + 1] === '<') {
               const code = text[i];
               const rendered = renderPodTag(code, text, i);
               if(i == rendered.continuePos) { throw new Error(); }
               newText += rendered.text;
               i = rendered.continuePos;
           }
           else {
               newText += escapeHtml(text[i]);
               i++;
           }
       }
       newText = newText.replace(/\b(\w+\([0-9][a-zA-Z]*\))/, '<span class="manpage-reference">$1</span>');
       return newText;
   }
   
   for (let i = 0; i < lines.length; i++) {
       const line = lines[i];
       const trimmed = line.trim();

       if (trimmed === '=pod' || trimmed === '=cut') {
           continue;
       }

       if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) {
           flushParagraph();
           if (!inVerbatim) {
               inVerbatim = true;
           }
           verbatimBuffer.push(line.substring(1));
           continue;
       } else if (inVerbatim) {
           flushVerbatim();
       }

       if (trimmed === '') {
           flushParagraph();
           continue;
       }

       const headMatch = trimmed.match(/^=head([1-6])\s+(.+)$/);
       if (headMatch) {
           flushParagraph();
           const level = headMatch[1];
           const heading = headMatch[2];
           const id = slugify(heading);
           html.push('<h' + level + ' id="' + id + '">' + processFormatting(heading) + '</h' + level + '>');
           continue;
       }

       if (trimmed === '=over' || trimmed.match(/^=over\s+\d+$/)) {
           flushParagraph();
           closeListItem();
           listStack.push({ type: null, currentItem: null });
           continue;
       }

       if (trimmed.startsWith('=item ')) {
           flushParagraph();
           const currentList = getCurrentList();
           
           if (currentList) {
               closeListItem();
               const itemText = trimmed.substring(6);
               
               if (currentList.type === null) {
                   currentList.type = itemText.match(/^\d+\.?/) ? 'ol' : 'ul';
                   html.push(currentList.type === 'ul' ? '<ul>' : '<ol>');
               }

               currentList.currentItem = [];
               let cleanItem = itemText.replace(/^[\*\d\.]\s*/, '');
               currentList.currentItem.push(processFormatting(cleanItem));
           }
           continue;
       }

       if (trimmed === '=back') {
           flushParagraph();
           closeList();
           continue;
       }

       if (trimmed.startsWith('=') && !trimmed.startsWith('==')) {
           flushParagraph();
           html.push('<div class="pod-command-unknown">' + escapeHtml(trimmed) + '</div>');
           continue;
       }

       paragraphBuffer.push(line);
   }

   flushParagraph();
   flushVerbatim();
   while (listStack.length > 0) {
       closeList();
   }

   return '<div class="renderPOD">' + html.join('\n') + '</div>';
}
