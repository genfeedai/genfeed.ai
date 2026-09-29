import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeOpenTaskComposerRequest,
  dispatchOpenTaskComposer,
  OPEN_TASK_COMPOSER_EVENT,
} from './task-composer-events';

describe('task composer events', () => {
  afterEach(() => {
    consumeOpenTaskComposerRequest();
  });

  it('holds a request until the workspace page consumes it', () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_TASK_COMPOSER_EVENT, listener);

    dispatchOpenTaskComposer();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(consumeOpenTaskComposerRequest()).toBe(true);
    // Consumed once: a later mount does not open the composer again.
    expect(consumeOpenTaskComposerRequest()).toBe(false);
    window.removeEventListener(OPEN_TASK_COMPOSER_EVENT, listener);
  });
});
