
import { $, status, clear, state, reportException, fetchText } from './gitviewer-common.js'
import { readUint32BE, readVarInt, bytesToHex, hexToBytes, sha1hex } from './gitviewer-util.js';
import { readObject } from './gitviewer-object.js'

const debug_pack_decompress = false


export async function loadPackfiles() {
    state.packfiles = []
    const packs = await loadPackList(state.repoUrl)
    for (const base of packs) {
      await loadPack(base)
    }
}

async function loadPackList(repoUrl) {
  status('loading pack list')
  const text = await fetchText(`${repoUrl}/objects/info/packs`)
  const packs = []

  for (const line of text.split('\n')) {
    if (line.startsWith('P pack-')) {
      packs.push(line.slice(2).trim())
    }
  }

  return packs.map(p => p.replace(/\.pack$/, ''))
}

async function loadPack(base) {
  status(`loading pack ${base}`)
  const idxBuf = await fetch(`${state.repoUrl}/objects/pack/${base}.idx`).then(r => r.arrayBuffer())
  const packBuf = await fetch(`${state.repoUrl}/objects/pack/${base}.pack`).then(r => r.arrayBuffer())
  const idx = new Uint8Array(idxBuf)
  const pack = new Uint8Array(packBuf)

  let pos = 0

  // ---- header ----
  if (
    idx[pos] !== 0xff ||
    idx[pos + 1] !== 0x74 ||
    idx[pos + 2] !== 0x4f ||
    idx[pos + 3] !== 0x63
  ) {
    throw new Error('Invalid idx signature: '+idx[pos]+","+idx[pos+1]+","+idx[pos+2]+","+idx[pos+3])
  }
  pos += 4

  const version = readUint32BE(idx, pos)
  pos += 4
  if (version !== 2) {
    throw new Error(`Unsupported idx version ${version}`)
  }

  // ---- fanout ----
  const fanout = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    fanout[i] = readUint32BE(idx, pos)
    pos += 4
  }

  const objectCount = fanout[255]

  // ---- object IDs ----
  const oids = new Uint8Array(objectCount * 20)
  for (let i = 0; i < objectCount; i++) {
    oids.set(idx.subarray(pos, pos + 20), i * 20)
    pos += 20
  }

  // ---- CRCs (skip) ----
  pos += objectCount * 4

  // ---- raw offsets ----
  const rawOffsets = new Array(objectCount)
  for (let i = 0; i < objectCount; i++) {
    rawOffsets[i] = readUint32BE(idx, pos)
    pos += 4
  }

  // ---- resolve offsets ----
  const offsets = new Array(objectCount)
  const largeOffsetsBase = pos

  for (let i = 0; i < objectCount; i++) {
    const o = rawOffsets[i]
    if (o & 0x80000000) {
      const n = o & 0x7fffffff
      const hi = readUint32BE(idx, largeOffsetsBase + n * 8)
      const lo = readUint32BE(idx, largeOffsetsBase + n * 8 + 4)
      offsets[i] = hi * 2 ** 32 + lo
    } else {
      offsets[i] = o
    }
  }

  // ---- build lookup map ----
  const objects = new Map()
  for (let i = 0; i < objectCount; i++) {
    objects.set(oids[i], offsets[i])
  }
  
  verifyPackChecksum(base, pack)

  // ---- register packfile ----
  state.packfiles.push({
    base,
    pack,
    fanout,
    oids,
    offsets,
  })
}

async function verifyPackChecksum(packBaseName, packBytes) {
  const content = packBytes.subarray(0, packBytes.length - 20);
  const expected_checksum = bytesToHex(packBytes.subarray(packBytes.length - 20));
  const actual_checksum = await sha1hex(content);

  if (actual_checksum !== expected_checksum) {
    throw new Error(`Pack ${packBaseName} calculated checksum ${actual_checksum} mismatch stored ${expected_checksum} checksum.`);
  }
}

export async function readPackedObject(pack, offset, self_oid) {
  let i = offset
  let c = pack[i++]

  const typeNum = (c >> 4) & 7
  const type = packType(typeNum)

  let size = c & 0x0f
  let shift = 4

  while (c & 0x80) {
    c = pack[i++]
    size |= (c & 0x7f) << shift
    shift += 7
  }

  let baseOid = null
  let baseOffset = null
  
  if(type == 'OFS_DELTA') {
    c = pack[i++];
    let val = c & 0x7f;
    while (c & 0x80) {
      val += 1;
      c = pack[i++];
      val = (val << 7) + (c & 0x7f);
    }
    baseOffset = offset - val;
  }
  
  if(type == 'REF_DELTA') {
    baseOid = pack.slice(i, i + 20);
    i += 20;
  }
  
  // Now i points to start of compressed data
  const compressedStart = i
  // Use streaming decompression to find exact boundary
  const decompressed = decompressPackedObject(pack, compressedStart, size)
  if(!type.match(/DELTA/)) {
    return { type, body: decompressed }
  }
  
  let pos = { pos: 0 };
  const baseSize = readVarInt(decompressed, pos);
  const resultSize = readVarInt(decompressed, pos);
  const instructions = decompressed.subarray(pos.pos);
  
  let base;
  if(type == 'OFS_DELTA') {
    base = await readPackedObject(pack, baseOffset)
  }
  else {
    base = await readObject(state.repoUrl, bytesToHex(baseOid))
  }
  const result = applyDelta(base.body, instructions, resultSize);

  return { type: base.type, body: result };
}

function applyDelta(base, instructions, resultSize) {
  const out = new Uint8Array(resultSize);
  let outPos = 0;
  let p = 0;

  while (p < instructions.length) {
    const op = instructions[p++];

    // INSERT
    if ((op & 0x80) === 0) {
      const len = op;
      out.set(instructions.subarray(p, p + len), outPos);
      p += len;
      outPos += len;
      continue;
    }

    // COPY
    let cpOff = 0;
    let cpSize = 0;

    if (op & 0x01) cpOff |= instructions[p++] << 0;
    if (op & 0x02) cpOff |= instructions[p++] << 8;
    if (op & 0x04) cpOff |= instructions[p++] << 16;
    if (op & 0x08) cpOff |= instructions[p++] << 24;

    if (op & 0x10) cpSize |= instructions[p++] << 0;
    if (op & 0x20) cpSize |= instructions[p++] << 8;
    if (op & 0x40) cpSize |= instructions[p++] << 16;
    if (cpSize === 0) cpSize = 0x10000;

    out.set(base.subarray(cpOff, cpOff + cpSize), outPos);
    outPos += cpSize;
  }

  if (outPos !== resultSize) {
    throw new Error(`Delta size mismatch: expected ${resultSize}, got ${outPos}`);
  }

  return out;
}

function packType(t) {
  return {
    1: 'commit',
    2: 'tree',
    3: 'blob',
    4: 'tag',
    6: 'OFS_DELTA',
    7: 'REF_DELTA',
  }[t]
}

function decompressPackedObject(pack, start, expectedSize) {
  const b1 = pack[start]
  const b2 = pack[start + 1]
  
  if(debug_pack_decompress) {
    console.log('=== DECOMPRESSION DEBUG ===')
    console.log(`Start offset: ${start}`)
    console.log(`Expected size: ${expectedSize}`)
    console.log(`First bytes: ${Array.from(pack.slice(start, start + 20)).map(b => b.toString(16).padStart(2,'0')).join(' ')}`)
  }
  
  // For 78 9c, skip the 2-byte zlib header and use raw deflate
  // This avoids pako's header validation entirely
  const isZlib = (b1 === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b2))
  
  if (isZlib) {
    if(debug_pack_decompress) console.log('Detected zlib wrapper - stripping header and using raw deflate')
    // Skip 2-byte zlib header, decompress the raw deflate stream
    return decompressPackedObjectRaw(pack, start + 2, expectedSize)
  } else {
    if(debug_pack_decompress) console.log('Using raw deflate from start')
    return decompressPackedObjectRaw(pack, start, expectedSize)
  }
}

function decompressPackedObjectRaw(pack, start, expectedSize) {
  // Binary search for the right amount of compressed data
  let lo = Math.floor(expectedSize * 0.3)
  let hi = Math.min(pack.length - start, expectedSize * 5)
  let bestResult = null
  
  if(debug_pack_decompress) console.log(`Binary searching between ${lo} and ${hi} bytes`)
  
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    
    try {
      // Use raw deflate (no zlib wrapper)
      const inflator = new pako.Inflate({ raw: true })
      const chunk = pack.subarray(start, start + mid)
      inflator.push(chunk, true)
      
      if (inflator.err) {
        if(debug_pack_decompress) console.log(`${mid} bytes: error - ${inflator.msg}`)
        lo = mid + 1
        continue
      }
      
      const result = inflator.result
      if(debug_pack_decompress) console.log(`${mid} bytes: decompressed ${result.length} bytes`)
      
      if (result.length >= expectedSize) {
        bestResult = result
        hi = mid - 1  // Try smaller
      } else {
        lo = mid + 1  // Need more
      }
    } catch (err) {
      if(debug_pack_decompress) console.log(`${mid} bytes: exception - ${err.message}`)
      lo = mid + 1
    }
  }
  
  if (bestResult && bestResult.length >= expectedSize) {
    if(debug_pack_decompress) console.log(`Success! Using ${bestResult.length} decompressed bytes`)
    return bestResult.subarray(0, expectedSize)
  }
  
  throw new Error(`Could not decompress: best result was ${bestResult ? bestResult.length : undefined} bytes, needed ${expectedSize}`)
}
