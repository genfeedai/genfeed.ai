import type { IDesktopBootstrap } from '@genfeedai/desktop-contracts';

export type DesktopEntrySurface = 'auth' | 'loading' | 'workspace';

export function getDesktopEntrySurface(
  bootstrap: Pick<IDesktopBootstrap, 'isOfflineMode' | 'session'>,
  isBootstrapLoaded: boolean,
): DesktopEntrySurface {
  if (!isBootstrapLoaded) {
    return 'loading';
  }

  return bootstrap.session === null && !bootstrap.isOfflineMode
    ? 'auth'
    : 'workspace';
}
