/**
 * `@client/png-codec/crc32` — CRC-32 (IEEE 802.3, reflected polynomial
 * 0xEDB88320), the checksum used by both the PNG chunk encoder and the ZIP
 * writer. Pure, dependency-free and DOM-free, so it runs identically in the
 * browser and under vitest (node).
 *
 * The single home for what were three code-identical copies —
 * `plugin-src/{forge,studio,icon-composer}/client/lib/crc32.ts` — none of which
 * carried a test. `@client/*` is inlined into each plugin's own federated
 * bundle at build time, so the plugins still ship independently; they just stop
 * maintaining three copies of a checksum that must not drift.
 */

let TABLE: Uint32Array | null = null;

function table(): Uint32Array {
  if (TABLE) return TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  TABLE = t;
  return t;
}

/**
 * CRC-32 of `bytes`. `seed` lets a checksum be continued across buffers: pass
 * the previous `crc32` result to keep accumulating; default 0 starts fresh.
 */
export function crc32(bytes: Uint8Array, seed = 0): number {
  const t = table();
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = (t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}
