/**
 * PNG building blocks: chunk framing, CRC and scanline filtering. Deflate is the
 * caller's (zlib on the server, `CompressionStream` in the browser).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, payload, CRC of type+payload. */
export function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * RGBA rows with PNG's per-row filter byte in front of each.
 *
 * Filter 0 (None) throughout. The adaptive filters buy real savings on
 * photographs; on flat pixel art the runs deflate away anyway, and choosing a
 * filter per row is where a hand-written encoder gets its bugs.
 */
export function filterScanlines(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Uint8Array {
  const stride = w * 4;
  const out = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y += 1) {
    // Explicit, though a fresh Uint8Array is already zero: the filter byte being
    // 0 is a decision (filter None), not an accident of allocation.
    out[y * (stride + 1)] = 0;
    out.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  return out;
}
