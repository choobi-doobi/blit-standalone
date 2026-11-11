import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloads: Array<{ blob: Blob; name: string }> = [];
vi.mock('../sdk/download', () => ({
  downloadBlob: (blob: Blob, name: string) => downloads.push({ blob, name }),
}));

import { frames, solid } from './blit/pattern';
import { exportAnimation } from './exportImage';

describe('exportAnimation', () => {
  beforeEach(() => {
    downloads.length = 0;
  });

  it('exports all 256 frames at 512x512 without shrinking the sprite or cycle', async () => {
    await exportAnimation(frames(solid('#ff0000'), solid('#0000ff')),
      { w: 512, h: 512, frame: 0, fps: 12, cycle: 256 }, 'Compact Ch4', 2);
    expect(downloads).toHaveLength(1);
    const { blob, name } = downloads[0];
    expect(name).toBe('compact-ch4-loop-256f.gif');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[6] | bytes[7] << 8, bytes[8] | bytes[9] << 8]).toEqual([512, 512]);
    // Walk actual GIF blocks; counting byte values would also count compressed data.
    let at = 13 + (bytes[10] & 0x80 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0);
    let count = 0;
    while (bytes[at] !== 0x3b) {
      if (bytes[at] === 0x21) at += 2;
      else {
        expect(bytes[at]).toBe(0x2c);
        count += 1;
        const packed = bytes[at + 9];
        at += 10 + (packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0);
        at += 1; // LZW minimum code size
      }
      while (bytes[at] !== 0) at += 1 + bytes[at];
      at += 1;
    }
    expect(count).toBe(256);
  }, 30_000);

  it('downloads the loop as an animated GIF, not a PNG', async () => {
    const pat = frames(solid('#ff0000'), solid('#0000ff'));
    await exportAnimation(pat, { w: 4, h: 3, frame: 0, fps: 10, cycle: 2 }, 'My Loop', 1);

    expect(downloads).toHaveLength(1);
    const { blob, name } = downloads[0];
    expect(name).toBe('my-loop-loop-2f.gif');
    expect(blob.type).toBe('image/gif');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
  });
});
