import type { IDesktopBootstrap } from '@genfeedai/desktop-contracts';
import { describe, expect, it } from 'vitest';
import { getDesktopEntrySurface } from './App';

const bootstrap = (
  overrides: Pick<IDesktopBootstrap, 'isOfflineMode' | 'session'>,
): IDesktopBootstrap =>
  ({
    ...overrides,
  }) as IDesktopBootstrap;

describe('desktop entry surface', () => {
  it('shows shared auth only before an account-less choice or valid session', () => {
    expect(
      getDesktopEntrySurface(
        bootstrap({ isOfflineMode: false, session: null }),
        true,
      ),
    ).toBe('auth');
  });

  it('routes first-time and returning account-less users into the workspace', () => {
    const accountless = bootstrap({ isOfflineMode: true, session: null });

    expect(getDesktopEntrySurface(accountless, true)).toBe('workspace');
    expect(getDesktopEntrySurface(accountless, true)).toBe('workspace');
  });

  it('routes connected users into the same workspace surface', () => {
    expect(
      getDesktopEntrySurface(
        bootstrap({
          isOfflineMode: false,
          session: {
            issuedAt: '2026-07-18T08:00:00.000Z',
            token: 'token',
            userId: 'cloud-user-1',
          },
        }),
        true,
      ),
    ).toBe('workspace');
  });
});
