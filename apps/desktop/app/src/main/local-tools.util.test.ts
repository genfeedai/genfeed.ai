import { describe, expect, it } from 'bun:test';
import { detectDesktopLocalTools } from './local-tools.util';

describe('detectDesktopLocalTools', () => {
  it('reports Claude, Codex, and Grok when those CLIs are on PATH', () => {
    const readiness = detectDesktopLocalTools((command) =>
      ['claude', 'codex', 'grok'].includes(command),
    );

    expect(readiness).toEqual({
      anyDetected: true,
      claude: true,
      codex: true,
      detected: ['claude', 'codex', 'grok'],
      grok: true,
    });
  });

  it('reports an empty local-tool set when no CLI is installed', () => {
    expect(detectDesktopLocalTools(() => false)).toEqual({
      anyDetected: false,
      claude: false,
      codex: false,
      detected: [],
      grok: false,
    });
  });
});
