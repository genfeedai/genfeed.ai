'use client';

import { type Dispatch, type SetStateAction, useState } from 'react';

/**
 * State that starts from `source` and resets to it whenever `source` changes
 * (compared with `Object.is`). Local edits stay until the next change.
 *
 * The reset happens while rendering, so there is no frame that shows the stale
 * value, and no effect is needed to copy a prop into state.
 */
export function useSyncedState<T>(source: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(source);
  const [lastSource, setLastSource] = useState<T>(source);

  if (!Object.is(lastSource, source)) {
    setLastSource(source);
    setValue(source);
  }

  return [value, setValue];
}
