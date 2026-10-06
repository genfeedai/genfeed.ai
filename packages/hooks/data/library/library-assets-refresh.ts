import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import type { ILibraryAssetsRefreshDetail } from '@genfeedai/contracts/interfaces';

function readLibraryAssetsRefreshDetail(
  event: Event,
): ILibraryAssetsRefreshDetail | undefined {
  if (!(event instanceof CustomEvent)) {
    return undefined;
  }

  const detail: unknown = event.detail;
  if (
    typeof detail !== 'object' ||
    detail === null ||
    !('isListRefresh' in detail) ||
    typeof detail.isListRefresh !== 'boolean'
  ) {
    return undefined;
  }

  return { isListRefresh: detail.isListRefresh };
}

export function dispatchLibraryAssetsRefresh(
  detail: ILibraryAssetsRefreshDetail,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ILibraryAssetsRefreshDetail>(LIBRARY_ASSETS_REFRESH_EVENT, {
      detail,
    }),
  );
}

/** True unless the sender already reloaded the asset list. */
export function libraryAssetsRefreshIncludesList(event: Event): boolean {
  return readLibraryAssetsRefreshDetail(event)?.isListRefresh !== false;
}
