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

  it('initializes Next.js error reporting without performance tracing by default', () => {
    initSentry();

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0 }),
    );
  });

  it('passes an opted-in trace sample rate through', () => {
    initSentry({ tracesSampleRate: 0.05 });

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.05 }),
    );
  });
});
