
import { $, status, clear, state, reportException, fetchBinary } from './gitviewer-common.js'
import { hexToBytes, equalBytes, sha1hex } from './gitviewer-util.js'
import { readPackedObject } from './gitviewer-pack.js'

const objectCache = new Map(); // key: oidHex OR packOffset


async function fetchLooseGitObject(url) {
  try {
    return await fetchBinary(url)
  } catch (err) {
    console.log("failed to read loose object: " + err.message)
  }
  return null
}

/* -----------------------------
   Dumb HTTP: objects
----------------------------- */
async function readObjectUnverified(repoUrl, oid) {
  // try packfiles first
  const hit = findInPack(oid)
  if (hit) {
    return readPackedObject(hit.pack, hit.offset, oid)
  }
  
  const dir = oid.slice(0, 2)
  const file = oid.slice(2)
  const compressed = await fetchLooseGitObject(`${repoUrl}/objects/${dir}/${file}`)
  if(compressed !== null)
  {
    const data = pako.inflate(compressed)
    const nul = data.indexOf(0)
  
    const header = new TextDecoder().decode(data.slice(0, nul))
    const body = data.slice(nul + 1)
  
    const [type, size] = header.split(' ')
    return { type, size: +size, body }
  }
  
  throw new Error(`Object ${oid} found neither in packfiles nor as loose object`)
}

export async function readObject(repoUrl, oid) {
  const obj = await readObjectUnverified(repoUrl, oid)
  const verifyChecksum = await hashGitObject(obj.type, obj.body);
  if (verifyChecksum !== oid) {
    throw new Error(`SHA1 mismatch: object ${oid} calcualted checksum is ${verifyChecksum}`);
  }
  return obj
}

async function hashGitObject(type, body) {
  const enc = new TextEncoder();
  const header = enc.encode(`${type} ${body.length}\0`);

  const data = new Uint8Array(header.length + body.length);
  data.set(header, 0);
  data.set(body, header.length);

  const digestHex = await sha1hex(data);
  return digestHex;
}

function findInPack(oidHex) {
  const oid = hexToBytes(oidHex)

  for (const p of state.packfiles) {
    const first = oid[0]
    const lo = first === 0 ? 0 : p.fanout[first - 1]
    const hi = p.fanout[first]

    for (let i = lo; i < hi; i++) {
      const o = p.oids.slice(i * 20, i * 20 + 20)
      if (equalBytes(o, oid)) {
        return { pack: p.pack, offset: p.offsets[i], }
      }
    }
  }
  return null
}
