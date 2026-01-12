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
