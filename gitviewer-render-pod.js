
import { escapeHtml } from './gitviewer-util.js';

export function renderPOD(fileContent) {
   // POD documentation can start implicitly or with =pod
   // If there's an explicit =pod tag, we start outside POD sections.
   // need a beginning =pod tag to start parsing POD if there is at least 1 in the file
   let inPOD = !fileContent.match(/^=pod(\s|$)/m)
   let mixedPODnonPOD = false
   const lines = fileContent.split('\n');
   const html = [];
   const listStack = [];
   let inVerbatim = false;
   let verbatimBuffer = [];
   let paragraphBuffer = [];
   let sectionBuffer = []; // Buffer for current section (POD or non-POD)
   let currentSectionType = inPOD ? 'pod' : 'non-pod'; // Track current section type
   let suspendedListStack = null; // Store list state when leaving POD mode
   let listItemCounters = {}; // Track item counts for ordered lists

   function getCurrentList() {
       return listStack.length > 0 ? listStack[listStack.length - 1] : null;
   }

   function flushVerbatim() {
       if (verbatimBuffer.length > 0) {
           const content = escapeHtml(verbatimBuffer.join('\n'));
           const currentList = getCurrentList();
           if (currentList && currentList.currentItem !== null) {
               currentList.currentItem.push('<pre><code>' + content + '</code></pre>');
           } else {
               sectionBuffer.push('<pre><code>' + content + '</code></pre>');
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
               sectionBuffer.push('<p>' + processed + '</p>');
           }
           paragraphBuffer = [];
       }
   }

   function closeListItem() {
       const currentList = getCurrentList();
       if (currentList && currentList.currentItem !== null) {
           sectionBuffer.push('<li>' + currentList.currentItem.join('') + '</li>');
           currentList.currentItem = null;
           // Increment counter for ordered lists
           if (currentList.type === 'ol') {
               const listId = currentList.id;
               listItemCounters[listId] = (listItemCounters[listId] || 0) + 1;
           }
       }
   }

   function closeList() {
       if (listStack.length > 0) {
           closeListItem();
           const list = listStack.pop();
           sectionBuffer.push(list.type === 'ul' ? '</ul>' : '</ol>');
       }
   }

   function flushSection() {
       if (sectionBuffer.length > 0) {
           html.push(`<div class="${currentSectionType}-portion">` + sectionBuffer.join('\n') + '</div>');
           sectionBuffer = [];
       }
   }

   function suspendLists() {
       // Close current list item but don't close the lists themselves
       closeListItem();
       // Deep copy the list stack to preserve state
       suspendedListStack = listStack.map(list => ({
           type: list.type,
           currentItem: null,
           id: list.id,
           startNumber: list.type === 'ol' ? (listItemCounters[list.id] || 0) + 1 : undefined
       }));
   }

   function resumeLists() {
       if (suspendedListStack && suspendedListStack.length > 0) {
           // Restore the list stack
           listStack.length = 0;
           for (const list of suspendedListStack) {
               listStack.push({
                   type: list.type,
                   currentItem: null,
                   id: list.id
               });
               // Reopen the list with appropriate attributes
               if (list.type === 'ol' && list.startNumber > 1) {
                   sectionBuffer.push('<ol start="' + list.startNumber + '">');
               } else {
                   sectionBuffer.push(list.type === 'ul' ? '<ul>' : '<ol>');
               }
           }
           suspendedListStack = null;
       }
   }

   function switchSection(newType) {
       if (currentSectionType !== newType) {
           mixedPODnonPOD = true
           flushParagraph();
           flushVerbatim();
           if (newType === 'non-pod' && listStack.length > 0) {
             // Leaving POD mode with open lists - suspend them
             suspendLists();
           }
           else {
             // Normal case - close all lists
             while (listStack.length > 0) {
               closeList();
             }
           }
           flushSection();
           currentSectionType = newType;
           if (newType === 'pod') {
               // Returning to POD mode - resume suspended lists if any
               resumeLists();
           }
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

   /*
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
   */

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
       newText = newText.replace(/\b([\w\.:-]+\([0-9][a-zA-Z]*\))/g, '<span class="manpage-reference">$1</span>');
       return newText;
   }
   
   for (let i = 0; i < lines.length; i++) {
       const line = lines[i];
       const trimmed = line.trim();

       // Handle POD/non-POD transitions
       if (trimmed === '=pod') {
         switchSection('pod')
         inPOD = true
         continue
       }
       if (trimmed === '=cut') {
         switchSection('non-pod')
         inPOD = false
         continue
       }

       if (inPOD) {
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
             sectionBuffer.push('<h' + level + ' id="' + id + '">' + processFormatting(heading) + '</h' + level + '>');
             continue;
         }
  
         if (trimmed === '=over' || trimmed.match(/^=over\s+\d+$/)) {
             flushParagraph();
             closeListItem();
             const listId = 'list_' + Math.random().toString(36).substr(2, 9);
             listStack.push({ type: null, currentItem: null, id: listId });
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
                     if (currentList.type === 'ol') {
                         // Initialize counter for this list
                         listItemCounters[currentList.id] = 0;
                     }
                     sectionBuffer.push(currentList.type === 'ul' ? '<ul>' : '<ol>');
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
             sectionBuffer.push('<div class="pod-command-unknown">' + escapeHtml(trimmed) + '</div>');
             continue;
         }
  
         paragraphBuffer.push(line);
     }
     else {
       // Non-POD content is rendered as preformatted code
       sectionBuffer.push(escapeHtml(line));
     }
   }

   // Flush any remaining content
   flushParagraph();
   flushVerbatim();
   while (listStack.length > 0) {
       closeList();
   }
   flushSection();

   return `<div class="renderPOD ${mixedPODnonPOD ? "pod-mixed-non-pod" : ""}">` + html.join('\n') + '</div>';
}
