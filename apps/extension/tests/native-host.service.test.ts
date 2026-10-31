import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectNativeHost,
  NativeHostError,
  runNativeHostAction,
} from '~services/native-host.service';

const send = vi.fn();
const action = {
  action: 'refine_text',
  mode: 'rewrite',
  platform: 'twitter',
  text: 'Draft',
} as const;

function sentRequest(): Record<string, unknown> {
  return send.mock.calls[0][1] as Record<string, unknown>;
}

function echoRequestId(
  build: (requestId: string) => Record<string, unknown>,
): void {
  send.mockImplementation(
    async (_host: string, request: { requestId: string }) =>
      build(request.requestId),
  );
}

describe('native host client', () => {
  beforeEach(() => {
    send.mockReset();
    Object.assign(chrome.runtime, { sendNativeMessage: send });
  });

  it('asks the registered host to detect providers and sends nothing else', async () => {
    echoRequestId((requestId) => ({
      hostVersion: '0.6.0',
      providers: [
        {
          id: 'claude-cli',
          isAvailable: true,
          kind: 'cli',
          label: 'Claude Code',
        },
      ],
      requestId,
      type: 'detected',
      version: 1,
    }));

    await expect(detectNativeHost()).resolves.toEqual({
      hostVersion: '0.6.0',
      providers: [
        {
          id: 'claude-cli',
          isAvailable: true,
          kind: 'cli',
          label: 'Claude Code',
        },
      ],
    });
    expect(send).toHaveBeenCalledExactlyOnceWith('ai.genfeed.host', {
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'detect',
      version: 1,
    });
  });

  it('sends the action, provider and voice, and returns the generated result', async () => {
    echoRequestId((requestId) => ({
      action: 'refine_text',
      providerId: 'claude-cli',
      requestId,
      result: {
        hasBrandVoice: false,
        isReplayed: false,
        maxCharacters: 280,
        mode: 'rewrite',
        platform: 'twitter',
        text: 'Edited',
      },
      type: 'generated',
      version: 1,
    }));

    const response = await runNativeHostAction({
      action,
      providerId: 'claude-cli',
      voice: null,
    });

    expect(response.result).toMatchObject({ text: 'Edited' });
    expect(sentRequest()).toMatchObject({
      action,
      providerId: 'claude-cli',
      type: 'generate',
      version: 1,
      voice: null,
    });
  });

  it('reports a missing or exited host as unreachable', async () => {
    send.mockRejectedValue(
      new Error('Specified native messaging host not found.'),
    );

    await expect(detectNativeHost()).rejects.toMatchObject({
      kind: 'unreachable',
      message: expect.stringContaining('gf host install'),
    });
  });

  it.each([
    ['origin_not_allowed', 'unreachable'],
    ['unsupported_version', 'unreachable'],
    ['provider_failed', 'failed'],
    ['provider_unavailable', 'failed'],
    ['output_rejected', 'failed'],
  ] as const)('maps a %s answer to a %s error', async (code, kind) => {
    send.mockResolvedValue({
      code,
      message: 'Stopped.',
      requestId: null,
      type: 'failed',
      version: 1,
    });

    await expect(
      runNativeHostAction({ action, providerId: 'claude-cli', voice: null }),
    ).rejects.toMatchObject({ code, kind, message: 'Stopped.' });
  });

  it('rejects an answer that does not match the protocol', async () => {
    send.mockResolvedValue({ type: 'generated', text: 'free text' });

    await expect(
      runNativeHostAction({ action, providerId: 'claude-cli', voice: null }),
    ).rejects.toMatchObject({ kind: 'failed' });
  });

  it('rejects an answer for another request, provider or action', async () => {
    echoRequestId(() => ({
      action: 'refine_text',
      providerId: 'claude-cli',
      requestId: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
      result: {
        hasBrandVoice: false,
        isReplayed: false,
        maxCharacters: 280,
        mode: 'rewrite',
        platform: 'twitter',
        text: 'Edited',
      },
      type: 'generated',
      version: 1,
    }));
    await expect(
      runNativeHostAction({ action, providerId: 'claude-cli', voice: null }),
    ).rejects.toThrow('different request');

    echoRequestId((requestId) => ({
      action: 'refine_text',
      providerId: 'codex-cli',
      requestId,
      result: {
        hasBrandVoice: false,
        isReplayed: false,
        maxCharacters: 280,
        mode: 'rewrite',
        platform: 'twitter',
        text: 'Edited',
      },
      type: 'generated',
      version: 1,
    }));
    await expect(
      runNativeHostAction({ action, providerId: 'claude-cli', voice: null }),
    ).rejects.toThrow('Unexpected answer');
  });

  it('stops waiting when the host never answers', async () => {
    vi.useFakeTimers();
    try {
      send.mockReturnValue(new Promise(() => undefined));
      const pending = runNativeHostAction({
        action,
        providerId: 'claude-cli',
        voice: null,
      });
      const assertion = expect(pending).rejects.toMatchObject({
        code: 'provider_timeout',
        kind: 'failed',
      });
      await vi.advanceTimersByTimeAsync(100_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('is a typed error callers can tell apart', () => {
    expect(
      new NativeHostError('x', 'failed', 'provider_failed'),
    ).toBeInstanceOf(Error);
  });
});
