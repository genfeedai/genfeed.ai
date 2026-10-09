import { GENERATION_ENTRY_HEADER } from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import { getGenerationEntryHeaders } from '@services/core/generation-entry-headers';
import { afterEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => vi.fn(() => false));
vi.mock('@services/core/desktop-runtime.service', () => ({
  isDesktopRuntimeShell: desktop,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  desktop.mockReturnValue(false);
});
describe('generation entry renderer header', () => {
  it('distinguishes the renderer shell for each call', () => {
    vi.stubGlobal('window', {});
    expect(getGenerationEntryHeaders()).toEqual({
      [GENERATION_ENTRY_HEADER]: 'web',
    });
    desktop.mockReturnValue(true);
    expect(getGenerationEntryHeaders()).toEqual({
      [GENERATION_ENTRY_HEADER]: 'desktop',
    });
  });
  it('does not guess web for server-side calls', () => {
    vi.stubGlobal('window', undefined);
    expect(getGenerationEntryHeaders()).toEqual({});
  });
});
