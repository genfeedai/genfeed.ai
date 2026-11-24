import { parseEnv } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCancellation } from '../src/lifecycle.js';
import { configureEnvironment } from '../src/wizard.js';

afterEach(() => vi.unstubAllEnvs());

describe('setup wizard --yes', () => {
  it.each([
    ['SIGINT', 130],
    ['SIGHUP', 129],
    ['SIGTERM', 143],
  ] as const)(
    'rejects cancelled setup with its %s exit code before prompting or generating secrets',
    async (signal, exitCode) => {
      const cancellation = createCancellation();
      cancellation.interrupt(signal);
      await expect(
        configureEnvironment('', true, cancellation),
      ).rejects.toMatchObject({ exitCode });
    },
  );
  it('writes secrets and consistent domain config without logging secrets', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-offline-fixture');
    vi.stubEnv('SELFHOSTED_DOMAIN', 'studio.example.com');
    const output = vi.spyOn(process.stdout, 'write');
    const setup = await configureEnvironment(
      'GENFEED_IMAGE_TAG=0.2.15\nOPENROUTER_API_KEY=\nBETTER_AUTH_URL=http://localhost:3010\n',
      true,
    );
    const parsed = parseEnv(setup.content);
    expect(parsed.OPENROUTER_API_KEY).toBe('sk-or-offline-fixture');
    expect(parsed.BETTER_AUTH_URL).toBe(setup.appUrl);
    expect(parsed.BETTER_AUTH_TRUSTED_ORIGINS).toBe(setup.appUrl);
    expect(parsed.GENFEED_IMAGE_TAG).toBe('0.2.15');
    expect(parsed.TOKEN_ENCRYPTION_KEY).toHaveLength(32);
    expect(parsed.BETTER_AUTH_SECRET?.length).toBeGreaterThanOrEqual(32);
    expect(output).not.toHaveBeenCalled();
    output.mockRestore();
  });

  it('fails non-interactively without a configured key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(configureEnvironment('', true)).rejects.toThrow(
      'OPENROUTER_API_KEY',
    );
  });
});

describe('setup wizard interactive prompt', () => {
  it('masks input before the hidden prompt is shown', async () => {
    const events: string[] = [];
    vi.resetModules();
    vi.doMock('node:readline/promises', () => ({
      createInterface: () => {
        events.push('reader');
        return {
          once: () => undefined,
          question: async () => 'sk-or-offline-fixture',
          close: () => undefined,
        };
      },
    }));
    const { configureEnvironment: configure } = await import(
      '../src/wizard.js'
    );
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('SELFHOSTED_DOMAIN', '');
    const hadTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    });
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        events.push(`write:${String(chunk).trim()}`);
        return true;
      });
    try {
      await configure('', false);
    } finally {
      output.mockRestore();
      if (hadTty) Object.defineProperty(process.stdin, 'isTTY', hadTty);
      else Reflect.deleteProperty(process.stdin, 'isTTY');
      vi.doUnmock('node:readline/promises');
    }
    expect(events.indexOf('reader')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('reader')).toBeLessThan(
      events.indexOf('write:OpenRouter API key (hidden):'),
    );
  });
});
