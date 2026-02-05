
export function hexToBytes(hex) {
  const a = new Uint8Array(20)
  for (let i = 0; i < 20; i++)
    a[i] = parseInt(hex.substr(i * 2, 2), 16)
  return a
}

export function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function readUint32BE(buf, off) {
  return (
    (buf[off] << 24) |
    (buf[off + 1] << 16) |
    (buf[off + 2] << 8) |
    buf[off + 3]
  ) >>> 0
}

export function readVarInt(buf, posObj) {
  let result = 0;
  let shift = 0;
  let byte;

  do {
    byte = buf[posObj.pos++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);

  return result;
}

export function equalBytes(a, b) {
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) return false
  return true
}

export function explode(str, sep, count) {
  const pieces = str.split(sep)
  return [ pieces.slice(0, count-1), pieces.slice(count-1).join(sep) ].flat()
}

function loadJsSHA() {
  return new Promise((resolve, reject) => {
    if (window.jsSHA) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'sha1.js';
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load jsSHA'));

    document.head.appendChild(script);
  });
}

let sha1Impl = null;

export async function sha1hex(data) {
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-1", data);
    const hash = bytesToHex(new Uint8Array(digest));
    return hash;
  }
  // fallback
  if (!sha1Impl) {
    await loadJsSHA();
    sha1Impl = function (buf) {
      const sha = new window.jsSHA("SHA-1", "ARRAYBUFFER");
      sha.update(buf);
      return sha.getHash("HEX");
    };
  }
  return sha1Impl(data);
}

export function formatDateTime(d) {
  const pad = n => String(n).padStart(2, '0')
  const Y = d.getFullYear()
  const M = pad(d.getMonth() + 1)
  const D = pad(d.getDate())
  const h = pad(d.getHours())
  const m = pad(d.getMinutes())
  const s = pad(d.getSeconds())
  // compute local timezone offset in ±HHMM
  const tzOffsetMin = -d.getTimezoneOffset() // JS is opposite sign
  const sign = tzOffsetMin >= 0 ? '+' : '-'
  const tzH = pad(Math.floor(Math.abs(tzOffsetMin) / 60))
  const tzM = pad(Math.abs(tzOffsetMin) % 60)
  const tz = `${sign}${tzH}${tzM}`
  return `${Y}-${M}-${D} ${h}:${m}:${s} ${tz}`
}

export function escapeHtml(text) {
  if(text === undefined) return ''
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/[""]/g, '&#34;')
             .replace(/['']/g, '&#39;');
}

export function slugify(text) {
  return text.toLowerCase()
         .replace(/<[^>]+>/g, '')
         .replace(/[^\w\s-]/g, '')
         .replace(/\s+/g, '-')
         .replace(/-+/g, '-')
         .trim();
}

export function createMailtoLink(email) {
  const anchor = document.createElement('A')
  anchor.href = 'mailto:' + email
  anchor.textContent = email
  return anchor
}

export function selectElements(selector, root = document) {
  const nodes = Array.from(root.querySelectorAll(selector))

  let proxy = new Proxy({}, {
    get(_, prop) {
      // allow access to raw nodes if needed
      if (prop === 'nodes') return nodes
      if (prop === 'length') return nodes.length

      // custom helpers
      if (prop === 'on') {
        return (event, handler) => {
          for (const el of nodes) {
            el.addEventListener(event, handler)
          }
          return proxy
        }
      }
      
      if (prop === 'forEach') {
        return (callback) => {
          for (const el of nodes) {
            callback(el)
          }
          return proxy
        }
      }
      
      // chainable text content setter
      if (prop === 'text') {
        return (txt) => {
          for (const el of nodes) el.textContent = txt
          return proxy
        }
      }
      
      // method fan-out for DOM methods
      if (prop in nodes[0] && typeof nodes[0][prop] === 'function') {
        return (...args) => {
          for (const el of nodes) {
            el[prop](...args)
          }
          return proxy
        }
      }
      
      // property read returns first element's value
      if (nodes.length > 0) return nodes[0][prop]

      return undefined
    },

    set(_, prop, value) {
      for (const el of nodes) {
        el[prop] = value
      }
      return true
    }
  })
  
  return proxy
}
