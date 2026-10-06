import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

import {
  dispatchLibraryAssetsRefresh,
  libraryAssetsRefreshIncludesList,
} from './library-assets-refresh';

describe('library assets refresh', () => {
  it('reloads the list for a plain event and for an explicit list refresh', () => {
    expect(
      libraryAssetsRefreshIncludesList(new Event(LIBRARY_ASSETS_REFRESH_EVENT)),
    ).toBe(true);
    expect(
      libraryAssetsRefreshIncludesList(
        new CustomEvent(LIBRARY_ASSETS_REFRESH_EVENT, {
          detail: { isListRefresh: true },
        }),
      ),
    ).toBe(true);
  });

  it('skips the list when the sender already reloaded it', () => {
    expect(
      libraryAssetsRefreshIncludesList(
        new CustomEvent(LIBRARY_ASSETS_REFRESH_EVENT, {
          detail: { isListRefresh: false },
        }),
      ),
    ).toBe(false);
    expect(
      libraryAssetsRefreshIncludesList(
        new CustomEvent(LIBRARY_ASSETS_REFRESH_EVENT, {
          detail: { unrelated: true },
        }),
      ),
    ).toBe(true);
  });

  it('dispatches the detail the summary and the list both receive', () => {
    const received: Event[] = [];
    const record = (event: Event) => {
      received.push(event);
    };
    window.addEventListener(LIBRARY_ASSETS_REFRESH_EVENT, record);

    dispatchLibraryAssetsRefresh({ isListRefresh: false });

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(CustomEvent);
    expect((received[0] as CustomEvent).detail).toEqual({
      isListRefresh: false,
    });
    window.removeEventListener(LIBRARY_ASSETS_REFRESH_EVENT, record);
  });
});
