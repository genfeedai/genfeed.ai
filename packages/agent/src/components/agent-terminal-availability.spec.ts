import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAgentCliTerminalAvailable } from './agent-terminal-availability';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Agent CLI terminal deployment contract', () => {
  it('is available in Genfeed Desktop even when the API is Genfeed Cloud', () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    vi.stubGlobal('genfeedDesktop', { terminal: {} });

    expect(isAgentCliTerminalAvailable()).toBe(true);
  });
});
