import { describe, expect, it, vi } from 'vitest';

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile: mockExecFile }));

import { openExternalUrl, resolveBrowserCommand } from '../../src/utils/browser';

describe('browser utility', () => {
  it.each([
    ['darwin', { args: ['https://example.com'], command: 'open' }],
    ['linux', { args: ['https://example.com'], command: 'xdg-open' }],
    ['win32', { args: ['/c', 'start', '', 'https://example.com'], command: 'cmd' }],
    ['aix', null],
  ] as const)('resolves %s browser command', (platform, expected) => {
    expect(resolveBrowserCommand('https://example.com', platform)).toEqual(expected);
  });

  it('reports whether the browser process opened', async () => {
    mockExecFile.mockImplementationOnce((_command, _args, callback) => callback(null));
    await expect(openExternalUrl('https://example.com')).resolves.toBe(true);

    mockExecFile.mockImplementationOnce((_command, _args, callback) => callback(new Error('no')));
    await expect(openExternalUrl('https://example.com')).resolves.toBe(false);
  });
});
