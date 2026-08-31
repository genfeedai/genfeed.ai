import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  setTags: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentry);

import { initSentry } from './sentry.config.base';

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes Next.js error reporting without performance tracing', () => {
    initSentry();

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0 }),
    );
  });
});
