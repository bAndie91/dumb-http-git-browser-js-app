
import { escapeHtml } from './gitviewer-util.js';

let control_char = '.'
let nonbreak_control_char = "'"
let escape_char = "\\"
let escape_char_saved = escape_char
let enable_escpe_char = true


function resolve_escape(name, param) {
  if(name == '"' || name == '#') // TODO
  
  const r = ({
    '´':  '´',
    'aa': '´',
    '`':  '`',
    'ga': '`',
    '-':  '-',
    '_':  '_',
    '.':  '.',
    '%':  '&shy;',
    '!':  '',  // not_implemented // Transparent line indicator
    '?':  '',  // not_implemented
    ' ':  '&nbsp;',
    '0':  '&nbsp;',
    '|':  '<span class="sixth-space"> </span>',
    '^':  '<span class="twelfth-space"> </span>',
    '&':  '',
    ')':  '',
    '/':  '',  // not_implemented
    ',':  '',  // not_implemented
    '~':  '&nbsp;',
    ':':  '&zwnj;',
    '{':  '',  // not_implemented
    '}':  '',  // not_implemented
    '\\': '\\',
    'a':  '',  // not_implemented // Non-interpreted leader character.
    'A':  '',  // not_implemented
    'b':  '',  // not_implemented
    'B':  '',  // not_implemented
    'c':  '',  // not_implemented
    'C':  '',  // not_implemented
    'd':  '',  // not_implemented
    'D':  '',  // not_implemented
    'e':  '\\',
    'E':  '\\',
    'g':  '',  // not_implemented
    'H':  '',  // not_implemented
    'k':  '',  // not_implemented
    'l':  '',  // not_implemented
    'L':  '',  // not_implemented
    'm':  '',  // not_implemented
    'M':  '',  // not_implemented
    'N':  '',  // not_implemented
    'o':  '',  // not_implemented
    'O':  '',  // not_implemented
    'p':  '',  // not_implemented
    'r':  '',  // not_implemented
    'R':  '',  // not_implemented
    's':  '',  // not_implemented
    'S':  '',  // not_implemented
    't':  '<span class="horizontal-tab"></span>',
    'u':  '',  // not_implemented
    'v':  '',  // not_implemented
    'V':  '',  // not_implemented
    'w':  '',  // not_implemented
    'x':  '',  // not_implemented
    'X':  '',  // not_implemented
    'Y':  '',  // not_implemented
    'z':  '',  // not_implemented
    'Z':  '',  // not_implemented
    'Do': '$',
    'Eu': '€',
    'Po': '£',
    'aq': "&apos;",
    'bu': '•',
    'co': '©',
    'cq': '’',
    'ct': '¢',
    'dd': '‡',
    'de': '°',
    'dg': '†',
    'dq': '&quot;',
    'em': '—',
    'en': '–',
    'hy': '‐',
    'lq': '“',
    'oq': '‘',
    'rg': '®',
    'rq': '”',
    'rs': '\\',
    'sc': '§',
    'tm': '™',
    'ul': '_',
    '==': '≡',
    '>=': '≥',
    '<=': '≤',
    '!=': '≠',
    '->': '→',
    '<-': '←',
    '+-': '±',
  })[name];
  if(r !== undefined) return r  
  
  if(name == '*') return escapeHtml(troff_string[param]);
  if(name == 'n') return escapeHtml(troff_register[param]);
  if(name == 'f') // TODO change font
  if(name == 'F') // TODO change font family
  if(name == 'h') /* Local horizontal motion; move right N (left if negative). */ return ' '.repeat(param || 1);
  
  if(name.length == 1) return name  /* If  a backslash is followed by a character that does not constitute a defined escape sequence, the backslash is silently ignored and the character maps to itself. */
  
  if(let m = name.match(/^u([a-zA-Z0-9]+)$/)) {
    /* unicode char */
    return `&#x${m[1]};`;
  }
  
  return `<span class="unknown-escape-code escape-code-${name}">&#xFFFD;</span>`
}
function unescape_cb(match, group, pos) {
  if(let m = group.match(/^(.)(\((.+)|\[(.+?)\]|'(.+?)'|(.*))$/)) {
    let name = m[1]
    let param = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5])
    return resolve_escape(name, param)
  }
  if(group == '') {
    /* escape was at the end of line */
    line_continuation = true
    return ''
  }
  throw new Error(`don't know how to unescape: ${group}`)
}
function unescapeLine(line) {
  return line.replace(/\\([acdeEprtu]|[fFgkmMnsVY\*]\(..|[fFgkmMnsVY\*]\[.*?\]|[AbBCDhHlLNoRsSvwxXZ]'.*?'|[fFgkmMnOsVYz].|.|$)/g, unescape_cb)
}



let last_adj_mode
const font_boldness = []
let center_lines_counter = 0
let right_justify_lines_counter = 0
let underline_lines_counter = 0
const current_classes = []
const troff_string = {}
const troff_env = {}
const troff_register = {}
const font_family_stack = []
const font_stack = []
const fill_color_stack = []
const indention_stack = []
let enable_fill = false
let nospace_mode = false
let line_continuation = false
let mdoc_author_mode = 'nosplit'
const mdoc_Eo_stack = []
let mdoc_Es_delimiters = ['', '']
let mdoc_Nm = ''


const macros = {
  /* groff macros (control commands) */
  
  ab: function(arg, args) {
    // .ab string
    // Print string on standard error, exit program.
    throw new Error(`troff processing aborted: ${args}`)
  },
  ad: function(arg) {
    // .ad       Begin line adjustment for output lines in current adjust mode.
    // .ad c     Start line adjustment in mode c (c=l,r,c,b,n).
    let adj_mod = arg[0] || last_adj_mode
    last_adj_mode = adj_mod
  },
  af: function(arg) {
    // .af register c
    // Assign format c to register (c=l,i,I,a,A).
    const format = arg[1]  /* possible values: l i I a A */
    troff_register[arg[0]] = format
  },
/*
       .aln alias register
                 Create alias name for register.
       .als alias object
                 Create alias name for request, string, macro, or diversion object.
       .am macro Append to macro until .. is encountered.
       .am macro end
                 Append to macro until .end is called.
       .am1 macro
                 Same as .am but with compatibility mode switched off during macro expansion.
       .am1 macro end
                 Same as .am but with compatibility mode switched off during macro expansion.
       .ami macro
                 Append to a macro whose name is contained in the string register macro until .. is encountered.
       .ami macro end
                 Append to a macro indirectly.  macro and end are string registers whose contents are interpolated for the macro name  and  the
                 end macro, respectively.
       .ami1 macro
                 Same as .ami but with compatibility mode switched off during macro expansion.
       .ami1 macro end
                 Same as .ami but with compatibility mode switched off during macro expansion.
*/
  as: function(arg) {
    // .as stringvar anything
    // Append anything to stringvar.
    troff_string[arg[0]] += arg[1]
  },
/*
       .as1 stringvar anything
                 Same as .as but with compatibility mode switched off during string expansion.
       .asciify diversion
                 Unformat ASCII characters, spaces, and some escape sequences in diversion.
       .backtrace
                 Print a backtrace of the input on stderr.
*/
  bd: function(arg) {
    // .bd font N
    // Embolden font by N-1 units.
    font_boldness[arg[0]] = arg[1]
  },
/*
       .bd S font N
                 Embolden Special Font S when current font is font.
       .blm      Unset the blank line macro.
       .blm macro
                 Set the blank line macro to macro.
       .box      End current diversion.
       .box macro
                 Divert to macro, omitting a partially filled line.
       .boxa     End current diversion.
       .boxa macro
                 Divert and append to macro, omitting a partially filled line.
*/
  bp: function() {
    // .bp       Eject current page and begin new page.
    // .bp ±N    Eject current page; next page number ±N.
    return { html: '<hr/>' }
  },
  br: function() {
    // .br       Line break.
    return { html: '<br/>' }
  },
/*
       .brp      Break output line; adjust if applicable.
       .break    Break out of a while loop.
*/
  c2: function(arg) {
    // .c2       Reset no-break control character to “'”.
    // .c2 c     Set no-break control character to c.
    nonbreak_control_char = arg.length == 0 ? "'" : arg[0]
  },
  cc: function(arg) {
    // .cc       Reset control character to ‘.’.
    // .cc c     Set control character to c.
    control_char = arg.length == 0 ? '.' : arg[0]
  },
  ce: function(arg) {
    //     .ce       Center the next input line.
    //     .ce N     Center following N input lines.
    center_lines_counter = arg.length == 0 ? 1 : arg[0]
  },
/*
       .cf filename
                 Copy contents of file filename unprocessed to stdout or to the diversion.
       .cflags mode c1 c2 ...
                 Treat characters c1, c2, ... according to mode number.
       .ch trap N
                 Change trap location to N.
       .char c anything
                 Define entity c as string anything.
       .chop object
                 Chop the last character off macro, string, or diversion object.
       .class name c1 c2 ...
                 Assign a set of characters, character ranges, or classes c1, c2, ... to name.
       .close stream
                 Close the stream.
       .color    Enable colors.
       .color N  If N is zero disable colors, otherwise enable them.
       .composite from to
                 Map glyph name from to glyph name to while constructing a composite glyph name.
       .continue Finish the current iteration of a while loop.
       .cp       Enable compatibility mode.
       .cp N     If N is zero disable compatibility mode, otherwise enable it.
       .cs font N M
                 Set constant character width mode for font to N/36 ems with em M.
*/
  cu: function() {
    // .cu N     Continuous underline in nroff, like .ul in troff.
    current_classes['underline'] = 1
  },
/*
       .da       End current diversion.
       .da macro Divert and append to macro.
       .de macro Define or redefine macro until .. is encountered.
       .de macro end
                 Define or redefine macro until .end is called.
       .de1 macro
                 Same as .de but with compatibility mode switched off during macro expansion.
       .de1 macro end
                 Same as .de but with compatibility mode switched off during macro expansion.
       .defcolor color scheme component
                 Define  or redefine a color with name color.  scheme can be rgb, cym, cymk, gray, or grey.  component can be single components
                 specified as fractions in the range 0 to 1 (default scaling indicator f), as a string of two-digit  hexadecimal  color  compo‐
                 nents  with  a  leading #, or as a string of four-digit hexadecimal components with two leading #.  The color default cant be
                 redefined.
       .dei macro
                 Define or redefine a macro whose name is contained in the string register macro until .. is encountered.
       .dei macro end
                 Define or redefine a macro indirectly.  macro and end are string registers whose contents are interpolated for the macro  name
                 and the end macro, respectively.
       .dei1 macro
                 Same as .dei but with compatibility mode switched off during macro expansion.
       .dei1 macro end
                 Same as .dei but with compatibility mode switched off during macro expansion.
       .device anything
                 Write anything to the intermediate output as a device control function.
       .devicem name
                 Write contents of macro or string name uninterpreted to the intermediate output as a device control function.
       .di       End current diversion.
       .di macro Divert to macro.  See groff_tmac(5) for more details.
       .do name  Interpret .name with compatibility mode disabled.
*/
  ds: function(arg, args) {
    // .ds stringvar anything
    // Set stringvar to anything.
    args = args.replace(/^[""]/, '')
    troff_string[arg[0]] = arg[1]
  },
/*
       .ds1 stringvar anything
                 Same as .ds but with compatibility mode switched off during string expansion.
       .dt N trap
                 Set diversion trap to position N (default scaling indicator v).
*/
  ec: function(arg) {
    escape_char = arg.length == 0 ? "\\" : arg[0]
  },
  ecr: function() {
    // .ecr      Restore escape character saved with .ecs.
    escape_char = escape_char_saved
  },
  ecs: function() {
    // .ecs      Save current escape character.
    escape_char_saved = escape_char
  },
/*
       .el anything
                 Else part for if-else (.ie) request.
       .em macro The macro is run after the end of input.
*/
  eo: function() {
    // .eo       Turn off escape character mechanism.
    enable_escpe_char = false
  },
/*
  ev: function(arg) {
    // .ev       Switch to previous environment and pop it off the stack.
    // .ev env   Push down environment number or name env to the stack and switch to it.
  },
       .evc env  Copy the contents of environment env to the current environment.  No pushing or popping.
       .ex       Exit from roff processing.
*/
  fam: function(arg) {
    // .fam      Return to previous font family.
    // .fam name Set the current font family to name.
    if(arg.length == 0) {
      font_family_stack.pop()
    }
    else {
      font_family_stack.push(arg[0])
    }
  },
/*
       .fc       Disable field mechanism.
       .fc a     Set field delimiter to a and pad glyph to space.
       .fc a b   Set field delimiter to a and pad glyph to b.
       .fchar c anything
                 Define fallback character (or glyph) c as string anything.
*/
  fcolor: function(arg) {
    //   .fcolor   Set fill color to previous fill color.
    //   .fcolor c Set fill color to c.
    if(arg.length == 0) {
      fill_color_stack.pop()
    }
    else {
      fill_color_stack.push(arg[0])
    }
  },
  fi: function() {
    // .fi       Fill output lines.
    enable_fill = true
  },
/*
       .fl       Flush output buffer.
       .fp n font
                 Mount font on position n.
       .fp n internal external
                 Mount font with long external name to short internal name on position n.
       .fschar f c anything
                 Define fallback character (or glyph) c for font f as string anything.
       .fspecial font
                 Reset list of special fonts for font to be empty.
       .fspecial font s1 s2 ...
                 When the current font is font, then the fonts s1, s2, ... are special.
*/
  ft: function(arg) {
    //     .ft       Return to previous font.  Same as \ or \.
    //     .ft font  Change to font name or number font; same as \f[font] escape sequence.
    // R: roman, B: bold, I: italic
    // CR CI CB: monospace
    if(arg.length == 0) {
      font_stack.pop()
    }
    else {
      font_stack.push(arg[0])
    }
  },
/*
       .ftr font1 font2
                 Translate font1 to font2.
       .fzoom font
                 Dont magnify font.
       .fzoom font zoom
                 Set zoom factor for font (in multiples of 1/1000th).
       .gcolor   Set glyph color to previous glyph color.
       .gcolor c Set glyph color to c.
       .hc       Remove additional hyphenation indicator character.
       .hc c     Set up additional hyphenation indicator character c.
       .hcode c1 code1 [c2 code2] ...
                 Set the hyphenation code of character c1 to code1, that of c2 to code2, etc.
       .hla lang Set the current hyphenation language to lang.
       .hlm n    Set the maximum number of consecutive hyphenated lines to n.
       .hpf file Read hyphenation patterns from file.
       .hpfa file
                 Append hyphenation patterns from file.
       .hpfcode a b c d ...
                 Set input mapping for .hpf.
       .hw words List of words with exceptional hyphenation.
       .hy N     Switch to hyphenation mode N.
       .hym n    Set the hyphenation margin to n (default scaling indicator m).
       .hys n    Set the hyphenation space to n.
       .ie cond anything
                 If cond then anything else goto .el.
       .if cond anything
                 If cond then anything; otherwise do nothing.
       .ig       Ignore text until .. is encountered.
       .ig end   Ignore text until .end is called.
*/
  'in': function(arg) {
    //   .in       Change to previous indentation value.
    //   .in ±N    Change indentation according to ±N (default scaling indicator m).
    if(arg.length == 0) {
      indention_stack.pop()
    }
    else {
      indention_stack.push(arg[0])
    }
  },
/*
       .it N trap
                 Set an input-line count trap for the next N lines.
       .itc N trap
                 Same as .it but dont count lines interrupted with \c.
       .kern     Enable pairwise kerning.
       .kern n   If n is zero, disable pairwise kerning, otherwise enable it.
       .lc       Remove leader repetition glyph.
       .lc c     Set leader repetition glyph to c.
*/
  length: function(arg) {
    //   .length register anything
    //             Write the length of the string anything to register.
    troff_register[arg[0]] = arg[1].length
  },
/*
       .linetabs Enable line-tabs mode (i.e., calculate tab positions relative to output line).
       .linetabs n
                 If n is zero, disable line-tabs mode, otherwise enable it.
       .lf N     Set input line number to N.
       .lf N file
                 Set input line number to N and filename to file.
       .lg N     Ligature mode on if N>0.
       .ll       Change to previous line length.
       .ll ±N    Set line length according to ±N (default length 6.5i, default scaling indicator m).
       .lsm      Unset the leading spaces macro.
       .lsm macro
                 Set the leading spaces macro to macro.
       .ls       Change to the previous value of additional intra-line skip.
       .ls N     Set additional intra-line skip value to N, i.e., N-1 blank lines are inserted after each text output line.
       .lt ±N    Length of title (default scaling indicator m).
       .mc       Margin glyph off.
       .mc c     Print glyph c after each text line at actual distance from right margin.
       .mc c N   Set margin glyph to c and distance to N from right margin (default scaling indicator m).
       .mk [register]
                 Mark current vertical position in register, or in an internal register used by .rt if no argument.
       .mso file The same as .so except that file is searched in the tmac directories.
       .na       No output-line adjusting.
*/
/*
  ne: function(arg) {
    //   .ne       Need a one-line vertical space.
    //   .ne N     Need N vertical space (default scaling indicator v).
  },
*/
/*
       .nf       No filling or adjusting of output lines.
       .nh       No hyphenation.
       .nm       Number mode off.
       .nm ±N [M [S [I]]]
                 In line number mode, set number, multiple, spacing, and indentation.
       .nn       Do not number next line.
       .nn N     Do not number next N lines.
*/
  nop: function() {
    //   .nop anything
    //             Always process anything.
  },
  nr: function(arg) {
    // .nr register ±N [M]
    // Define or modify register using ±N with auto-increment M.
    troff_register[arg[0]] = arg[1]  // TODO auto-increment(?) arg[2]
  },
/*
       .nroff    Make the built-in conditions n true and t false.
*/
  ns: function() {
    //   .ns       Turn on no-space mode.
    nospace_mode = true
  },
/*
       .nx       Immediately jump to end of current file.
       .nx filename
                 Immediately continue processing with file file.
       .open stream filename
                 Open filename for writing and associate the stream named stream with it.
       .opena stream filename
                 Like .open but append to it.
       .os       Output vertical distance that was saved by the sv request.
       .output string
                 Emit string directly to intermediate output, allowing leading whitespace if string starts with " (which is stripped off).
       .pc       Reset page number character to ‘%’.
       .pc c     Page number character.
       .pev      Print the current environment and each defined environment state to stderr.
       .pi program
                 Pipe output to program (nroff only).
       .pl       Set page length to default 11i.  The current page length is stored in register .p.
       .pl ±N    Change page length to ±N (default scaling indicator v).
       .pm       Print macro names and sizes (number of blocks of 128 bytes).
       .pm t     Print only total of sizes of macros (number of 128 bytes blocks).
       .pn ±N    Next page number N.
       .pnr      Print the names and contents of all currently defined number registers on stderr.
       .po       Change to previous page offset.  The current page offset is available in register .o.
       .po ±N    Page offset N.
       .ps       Return to previous point size.
       .ps ±N    Point size; same as \s[±N].
       .psbb filename
                 Get the bounding box of a PostScript image filename.
       .pso command
                 This behaves like the so request except that input comes from the standard output of command.
       .ptr      Print the names and positions of all traps (not including input line traps and diversion traps) on stderr.
       .pvs      Change to previous post-vertical line spacing.
       .pvs ±N   Change post-vertical line spacing according to ±N (default scaling indicator p).
       .rchar c1 c2 ...
                 Remove the definitions of entities c1, c2, ...
       .rd prompt
                 Read insertion.
       .return   Return from a macro.
       .return anything
                 Return twice, namely from the macro at the current level and from the macro one level higher.
       .rfschar f c1 c2 ...
                 Remove the definitions of entities c1, c2, ... for font f.
*/
  rj: function(arg) {
    //   .rj n     Right justify the next n input lines.
    right_justify_lines_counter = arg[0]
  },
/*
       .rm name  Remove request, macro, diversion, or string name.
       .rn old new
                 Rename request, macro, diversion, or string old to new.
       .rnn reg1 reg2
                 Rename register reg1 to reg2.
*/
  rr: function(arg) {
    //    .rr register
    //             Remove register.
    delete troff_register[arg[0]]
  },
  rs: function() {
    //   .rs       Restore spacing; turn no-space mode off.
    nospace_mode = false
  },
/*
       .rt       Return (upward only) to vertical position marked by .mk on the current page.
       .rt ±N    Return (upward only) to specified distance from the top of the page (default scaling indicator v).
       .schar c anything
                 Define global fallback character (or glyph) c as string anything.
       .shc      Reset soft hyphen glyph to \(hy.
       .shc c    Set the soft hyphen glyph to c.
       .shift n  In a macro, shift the arguments by n positions.
       .sizes s1 s2 ... sn [0]
                 Set available font sizes similar to the sizes command in a DESC file.
       .so filename
                 Include source file.
*/
  sp: function(arg) {
    //   .sp       Skip one line vertically.
    //   .sp N     Space vertical distance N up or down according to sign of N (default scaling indicator v).
    let lines = arg.length == 0 ? 1 : arg[0]
    if(lines < 0) { console.log(`.sp: ${lines} negative lines count is not supported`); return; }
    let html = '';
    html += '<div class="vertical-spacer"></div>'.repeat(arg[0] || 1)
    return { 'html': html }
  },
/*
       .special  Reset global list of special fonts to be empty.
       .special s1 s2 ...
                 Fonts s1, s2, etc. are special and are searched for glyphs not in the current font.
       .spreadwarn
                 Toggle the spread warning on and off without changing its value.
       .spreadwarn limit
                 Emit a warning if each space in an output line is widened by limit or more (default scaling indicator m).
       .ss N     Set space glyph size to N/12 of the space width in the current font.
       .ss N M   Set space glyph size to N/12 and sentence space size set to M/12 of the space width in the current font.
       .sty n style
                 Associate style with font position n.
       .substring xx n1 n2
                 Replace the string named xx with the substring defined by the indices n1 and n2.
       .sv       Save 1 v of vertical space.
       .sv N     Save the vertical distance N for later output with os request (default scaling indicator v).
       .sy command-line
                 Execute program command-line.
       .ta T N   Set tabs after every position that is a multiple of N (default scaling indicator m).
       .ta n1 n2 ... nn T r1 r2 ... rn
                 Set tabs at positions n1, n2, ..., nn, then set tabs at nn+m×rn+r1 through nn+m×rn+rn, where m increments from 0, 1, 2, ... to
                 infinity.
       .tc       Remove tab repetition glyph.
       .tc c     Set tab repetition glyph to c.
       .ti ±N    Temporary indent next line (default scaling indicator m).
       .tkf font s1 n1 s2 n2
                 Enable track kerning for font.
*/
  tl: function(arg, args) {
    //   .tl ’left’center’right’
    //             Three-part title.
    let delim = args.substr(0, 1)
    let part = args.substr(1).split(delim).map((x) => unescapeLine(x))
    return { html: `<div class="treepart-title"><span class="part1">${part[0]}</span><span class="part2">${part[1]}</span><span class="part3">${part[2]}</span></div>` }
  },
/*
       .tm anything
                 Print anything on stderr.
       .tm1 anything
                 Print anything on stderr, allowing leading whitespace if anything starts with " (which is stripped off).
       .tmc anything
                 Similar to .tm1 without emitting a final newline.
       .tr abcd...
                 Translate a to b, c to d, etc. on output.
       .trf filename
                 Transparently output the contents of file filename.
       .trin abcd...
                 This is the same as the tr request except that the asciify request uses the character  code  (if  any)  before  the  character
                 translation.
       .trnt abcd...
                 This  is  the same as the tr request except that the translations do not apply to text that is transparently throughput into a
                 diversion with \!.
       .troff    Make the built-in conditions t true and n false.
       .uf font  Set underline font to font (to be switched to by .ul).
*/
  ul: function(arg) {
    //   .ul N     Underline (italicize in troff) N input lines.
    underline_lines_counter = arg.length == 0 ? 1 : arg[0]
  },
/*
       .unformat diversion
                 Unformat space characters and tabs in diversion, preserving font information.
       .vpt n    Enable vertical position traps if n is non-zero, disable them otherwise.
       .vs       Change to previous vertical base line spacing.
       .vs ±N    Set vertical base line spacing to ±N (default scaling indicator p).
       .warn n   Set warnings code to n.
       .warnscale si
                 Set scaling indicator used in warnings to si.
       .wh N     Remove (first) trap at position N.
       .wh N trap
                 Set location trap; negative means from page bottom.
       .while cond anything
                 While condition cond is true, accept anything as input.
       .write stream anything
                 Write anything to the stream named stream.
       .writec stream anything
                 Similar to .write without emitting a final newline.
       .writem stream xx
                 Write contents of macro or string xx to the stream named stream.
*/

  /* mdoc macros */
  '%A': (arg, raw_args, html_args) => `<span class="author-name">${html_args}</span>`,
  '%B': (arg, raw_args, html_args) => `<span class="book-title">${html_args}</span>`,
  '%C': (arg, raw_args, html_args) => `<span class="publication-location">${html_args}</span>`,
  '%D': (arg, raw_args, html_args) => `<span class="publication-date">${html_args}</span>`,
  '%I': (arg, raw_args, html_args) => `<span class="issuer-name">${html_args}</span>`,
  '%J': (arg, raw_args, html_args) => `<span class="journal-name">${html_args}</span>`,
  '%N': (arg, raw_args, html_args) => `<span class="issue-number">${html_args}</span>`,
  '%O': (arg, raw_args, html_args) => `<span class="optional-info">${html_args}</span>`,
  '%P': (arg, raw_args, html_args) => `<span class="page-number">${html_args}</span>`,
  '%Q': (arg, raw_args, html_args) => `<span class="institution-name">${html_args}</span>`,
  '%R': (arg, raw_args, html_args) => `<span class="technical-report-name">${html_args}</span>`,
  '%T': (arg, raw_args, html_args) => `<span class="artical-title">${html_args}</span>`,
  '%U': (arg, raw_args, html_args) => `<a class="reference-document" href="${escapeHtml(raw_args)}">${html_args}</a>`,
  '%V': (arg, raw_args, html_args) => `<span class="volume-number">${html_args}</span>`,
  'Ac': () => "&gt;",
  'Ad': (arg, raw_args, html_args) => `<span class="memory-address">${html_args}</span>`,
  'An': (arg, raw_args, html_args) => {
    if(let m = raw_args.match(/^-(.*)/)) {
      mdoc_author_mode = m[1]
      return ''
    }
    else {
      return `<span class="author-name">${html_args}</span>`
    }
  },
  'Ao': (arg, raw_args, html_args) => `&lt;${html_args}`,
  'Ap': () => '&apos;',
  'Aq': (arg, raw_args, html_args) => `&lt;${html_args}&gt;`,
  'Ar': (arg, raw_args, html_args) => {
    if(html_args == '') html_args = "file ..."
    return `<span class="command-argument">${html_args}</span>`
  },
  'At': (arg, raw_args, html_args) => {
     if(raw_args.match(/v[1-7]|32v/)) return { plaintext: "A version of AT&T UNIX." }
     if(raw_args.match(/III/))        return { plaintext: "AT&T System III UNIX." }
     if(raw_args.match(/V|V\.[1-4]))  return { plaintext: "A version of AT&T System V UNIX." }
     return { html: `<!-- .At ${escapeHtml(raw_args)} -->` }
  },
  'Bc': () => "]",
  'Bd': (arg, raw_args, html_args) => {
    const classes = [ `Bd${arg[0]}` ]
    if(arg[1] == '-offset') classes.append(`offset-${arg[2]}`)
    if('-compact' in arg) classes.append(`compact`)
    return { open: 'div', classes }
  },
  // 'Bf': () => '',
  // 'Bk': () => '',
  'Bl': (arg, raw_args, html_args) => {
    const classes = [ `Bl${arg[0]}` ]
    for(let i = 1; i < arg.length-1; i++) {
      if(arg[i] == '-offset') classes.append(`offset-${arg[i+1]}`)
      // TODO [-width val]
    }
    if('-compact' in arg) classes.append(`compact`)
    return { open: 'ul', classes }
  },
  'Bo': (arg, raw_args, html_args) => `[${html_args}`,
  'Bq': (arg, raw_args, html_args) => `[${html_args}]`,
  'Brc': () => "}",
  'Bro': (arg, raw_args, html_args) => `{${html_args}`,
  'Brq': (arg, raw_args, html_args) => `{${html_args}}`,
  'Bsx': (arg, raw_args, html_args) => `<span class="BSDOS-version">${html_args || "&#xFFFD;"}</span>`,
  'Bt': () => "is currently in beta test.",
  'Bx': (arg, raw_args, html_args) => `<span class="BSD-version">${html_args || "&#xFFFD;"}</span>`,
  'Cd': (arg, raw_args, html_args) => `<span class="kernel-config-declaration">${html_args}</span>`,
  'Cm': (arg, raw_args, html_args) => `<span class="command-modifier">${html_args}</span>`,
  'D1': (arg, raw_args, html_args) => `<div class="D1">${html_args}</div>`,
  'Db': () => '',
  'Dc': () => "&quot;",
  'Dd': (arg, raw_args, html_args) => `<span class="document-date">${html_args || "&#xFFFD;"}</span>`,
  'Dl': (arg, raw_args, html_args) => `<div class="Dl">${html_args}</div>`,
  'Do': (arg, raw_args, html_args) => `&quot;${html_args}`,
  'Dq': (arg, raw_args, html_args) => `<q>${html_args}</q>`,
  'Dt': (arg, raw_args, html_args) => `<h1>${html_args}</h1>`,  // TODO probably need to separate arguments: .Dt TITLE section [arch]
  // Dv
  'Dx': (arg, raw_args, html_args) => `<span class="Dragonfly-version">${html_args || "&#xFFFD;"}</span>`,
  'Ec': (arg, raw_args, html_args) => {
    let closing_delimiter = mdoc_Eo_stack.pop()
    if(html_args !== '') closing_delimiter = html_args
    else closing_delimiter = unescapeLine(closing_delimiter)
    return escapeHtml(closing_delimiter)
  },
  'Ed': () => { close: 'div' },
  // 'Ef':
  // Ek
  'El': () => { close: 'ul' },
  'Em': (arg, raw_args, html_args) => `<em>${html_args}</em>`,
  'En': (arg, raw_args, html_args) => `${mdoc_Es_delimiters[0]}${html_args}${mdoc_Es_delimiters[1]}`,
  'Eo': (arg, raw_args, html_args) => {
    mdoc_Eo_stack.push(raw_args)
    return html_args
  },
  'Er': (arg, raw_args, html_args) => `<span class="error-constant">${html_args}</span>`,
  'Es': (arg, raw_args, html_args) => {
    mdoc_Es_delimiters = arg
  },
  'Ev': (arg, raw_args, html_args) => `<span class="environment-variable">${html_args}</span>`,
  'Ex': (arg, raw_args, html_args) => `The ${html_args[1] || mdoc_Nm} utility exits 0 on success, and >0 if an error occurs.`,
}

export function renderMan(troffText) {
  let html = '';
  for(let line of troffText.split(/\r?\n/)) {
    if(line === control_char || line === nonbreak_control_char) {
      continue
    }
    else if(line[0] == control_char || line[0] == nonbreak_control_char) {
      const match = line.substr(1).match(/^\s*(\S+)( (.*)|)$/)
      let macro = match[1]
      if(macro == '\\"') {
        // comment
        continue
      }
      let raw_args = match[3] === undefined ? '' : match[3]
      let arg = raw_args.split(/\s+/)  // TODO what is the correct tokenization here?
      if(macro in macros) {
        macro_result = macros[macro](arg, raw_args, unescapeLine(raw_args))
        if(macro_result === undefined) {
          continue
        }
        if(typeof macro_result == 'string') {
          html += macro_result
        }
        else {
          if('html' in macro_result) {
            html += macro_result.html
          }
          else if('plaintext' in macro_result) {
            html += escapeHtml(macro_result.plaintext)
          }
          if('close' in macro_result) {
            html += `</${macro_result.close}>`
          }
          if('open' in macro_result && !('html' in macro_result)) {
            const classes = 'classes' in macro_result ? macro_result.classes : []
            html += `<${macro_result.open} class="${macro} ${classes.join(' ')}">`
          }
        }
      }
      else {
        console.log(`macro not supported: ${macro}`)
      }
    }
    else {
      // plain text
      html += unescapeLine(line)
      if(!line_continuation) html += ' '
      line_continuation = false
    }
  }
  return html;
}
