import { describe, expect, it } from 'vitest';

import { chunk, crc32, filterScanlines } from './png';

describe('crc32', () => {
  it('matches the known CRC of the IEND chunk', () => {
    // IEND is empty, so its CRC is a fixed, published value. If the table or the
    // final xor is wrong, this is where it shows.
    expect(crc32(new Uint8Array([0x49, 0x45, 0x4e, 0x44]))).toBe(0xae426082);
  });

  it('matches the known CRC of "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('chunk', () => {
  it('frames a payload as length, type, data, CRC', () => {
    const out = chunk('IEND', new Uint8Array(0));
    expect(out.length).toBe(12);
    expect(new DataView(out.buffer).getUint32(0)).toBe(0);
    expect(String.fromCharCode(...out.subarray(4, 8))).toBe('IEND');
    expect(new DataView(out.buffer).getUint32(8)).toBe(0xae426082);
  });
});

describe('filterScanlines', () => {
  it('puts a filter byte in front of every row and changes nothing else', () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4).fill(9);
    const out = filterScanlines(rgba, 2, 2);
    expect(out.length).toBe((2 * 4 + 1) * 2);
    expect(out[0]).toBe(0);
    expect(out[9]).toBe(0);
    expect([...out.subarray(1, 9)]).toEqual(Array(8).fill(9));
  });

  it('keeps the rows in order', () => {
    const rgba = new Uint8ClampedArray([1, 1, 1, 1, 2, 2, 2, 2]); // 1x2
    const out = filterScanlines(rgba, 1, 2);
    expect([...out]).toEqual([0, 1, 1, 1, 1, 0, 2, 2, 2, 2]);
  });
});
