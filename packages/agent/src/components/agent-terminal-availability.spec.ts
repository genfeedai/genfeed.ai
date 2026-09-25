import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAgentCliTerminalAvailable } from './agent-terminal-availability';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Agent CLI terminal deployment contract', () => {
  it.each(['1', 'true', ' TRUE '])(
    'is unavailable for cloud flag %s',
    (cloudFlag) => {
      vi.stubEnv('GENFEED_CLOUD', cloudFlag);

      expect(isAgentCliTerminalAvailable()).toBe(false);
    },
  );

  it('is available for self-hosted deployments', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);

    expect(isAgentCliTerminalAvailable()).toBe(true);
  });

  it('is available in Genfeed Desktop even when the API is Genfeed Cloud', () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    vi.stubGlobal('genfeedDesktop', { terminal: {} });

    expect(isAgentCliTerminalAvailable()).toBe(true);
  });
});
