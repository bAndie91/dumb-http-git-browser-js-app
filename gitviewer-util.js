export function hexToBytes(hex) {
  const a = new Uint8Array(20)
  for (let i = 0; i < 20; i++)
    a[i] = parseInt(hex.substr(i * 2, 2), 16)
  return a
}

export function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function equalBytes(a, b) {
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) return false
  return true
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
