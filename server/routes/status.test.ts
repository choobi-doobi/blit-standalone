import { describe, expect, it } from 'vitest';
import { pluginStatus } from './status';

describe('pluginStatus', () => {
  it('reports this plugin and the supplied time', () => {
    expect(pluginStatus(new Date('2026-01-02T03:04:05.000Z'))).toEqual({
      module: 'blit',
      status: 'operational',
      timestamp: '2026-01-02T03:04:05.000Z',
    });
  });
});
