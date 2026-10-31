import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  loadLocalVoice: vi.fn(),
  refineText: vi.fn(),
  generateReplyVariants: vi.fn(),
  refresh: vi.fn(),
  runNativeHostAction: vi.fn(),
  session: {} as Record<string, unknown>,
  settings: undefined as Record<string, unknown> | undefined,
}));
vi.mock('~services/auth.service', () => ({
  authService: { getToken: mocks.getToken },
}));
vi.mock('~services/workspace.service', () => ({
  assertWorkspace: vi.fn(),
  requireWorkspace: async () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  }),
}));
vi.mock('~services/agent-tools.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~services/agent-tools.service')>()),
  AgentToolsService: class {
    refineText = mocks.refineText;
    generateReplyVariants = mocks.generateReplyVariants;
  },
}));
vi.mock('~services/brand-voice-snapshot.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('~services/brand-voice-snapshot.service')
  >()),
  loadLocalVoice: mocks.loadLocalVoice,
  refreshLocalVoiceCache: mocks.refresh,
}));
vi.mock('~services/native-host.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~services/native-host.service')>()),
  runNativeHostAction: mocks.runNativeHostAction,
}));

import { AgentActionError } from '~services/agent-tools.service';
import { VoiceUnavailableError } from '~services/brand-voice-snapshot.service';
import { HttpRequestError } from '~services/http-request-error';
import { NativeHostError } from '~services/native-host.service';
import {
  ActionRoutingError,
  routeReplyVariants,
  routeTextAction,
} from '~services/text-action-router.service';

const KEY = '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c';
const request = {
  mode: 'rewrite',
  platform: 'twitter',
  requestKey: KEY,
  text: 'Teh launch is live',
} as const;
const CLOUD_RESULT = {
  hasBrandVoice: true,
  isReplayed: false,
  maxCharacters: 280,
  mode: 'rewrite',
  platform: 'twitter',
  text: 'The launch is live',
};
const LOCAL_RESULT = { ...CLOUD_RESULT, text: 'The launch is live (local)' };
const VOICE = {
  savedAt: null,
  snapshot: { brandId: 'brand-1' },
  source: 'live',
};

function hostAnswers(result: unknown = LOCAL_RESULT) {
  mocks.runNativeHostAction.mockResolvedValue({
    action: 'refine_text',
    providerId: 'claude-cli',
    requestId: KEY,
    result,
    type: 'generated',
    version: 1,
  });
}

function configure(providerId: string | null) {
  mocks.settings = providerId ? { localFallbackProviderId: providerId } : {};
}

function http(status: number) {
  return new HttpRequestError(`HTTP ${status}`, 'http', status);
}

async function settle<T>(work: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(10_000);
  return work;
}

describe('cloud-first text action routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.session = {};
    mocks.settings = {};
    mocks.getToken.mockReset().mockResolvedValue('token');
    mocks.refineText.mockReset().mockResolvedValue(CLOUD_RESULT);
    mocks.generateReplyVariants.mockReset();
    mocks.loadLocalVoice.mockReset().mockResolvedValue(VOICE);
    mocks.refresh.mockReset().mockResolvedValue(undefined);
    mocks.runNativeHostAction.mockReset();
    hostAnswers();
    vi.mocked(chrome.storage.local.get).mockImplementation((async (
      key: string,
    ) => ({
      [key]: mocks.settings,
    })) as never);
    vi.mocked(chrome.storage.session.get).mockImplementation((async (
      key: string,
    ) => ({
      [key]: mocks.session[key],
    })) as never);
    vi.mocked(chrome.storage.session.set).mockImplementation((async (
      items: Record<string, unknown>,
    ) => {
      Object.assign(mocks.session, items);
    }) as never);
    vi.mocked(chrome.storage.session.remove).mockImplementation((async (
      key: string,
    ) => {
      delete mocks.session[key];
    }) as never);
  });

  afterEach(() => vi.useRealTimers());

  it('uses Genfeed cloud first and never touches the host when it succeeds', async () => {
    configure('claude-cli');

    const outcome = await routeTextAction({ ...request });

    expect(outcome).toEqual({ result: CLOUD_RESULT });
    expect(mocks.refineText).toHaveBeenCalledTimes(1);
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
    expect(mocks.loadLocalVoice).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not keep a voice copy fresh when no fallback is configured', async () => {
    await routeTextAction({ ...request });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ['an exhausted request limit', http(429), 'reached its request limit'],
    [
      'a credit limit',
      new AgentActionError('No credits', 'insufficient_credits'),
      'has no credits left',
    ],
    ['a payment requirement', http(402), 'has no credits left'],
    [
      'a provider outage',
      new AgentActionError('Down', 'provider_unavailable'),
      'was unavailable',
    ],
  ])(
    'falls back after %s, with a visible routing notice',
    async (_label, failure, phrase) => {
      configure('claude-cli');
      mocks.refineText.mockRejectedValue(failure);

      const outcome = await routeTextAction({ ...request });

      expect(outcome.result).toEqual(LOCAL_RESULT);
      expect(outcome.routing).toMatchObject({
        hasBrandVoice: true,
        providerId: 'claude-cli',
        providerLabel: 'Claude Code',
        voiceSource: 'live',
      });
      expect(outcome.routing?.notice).toContain(phrase);
      expect(outcome.routing?.notice).toContain('Claude Code');
      expect(mocks.refineText).toHaveBeenCalledTimes(1);
      expect(mocks.runNativeHostAction).toHaveBeenCalledExactlyOnceWith({
        action: {
          action: 'refine_text',
          mode: 'rewrite',
          platform: 'twitter',
          text: 'Teh launch is live',
        },
        providerId: 'claude-cli',
        voice: VOICE.snapshot,
      });
    },
  );

  it('says when the voice came from a saved copy or was absent', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    mocks.loadLocalVoice.mockResolvedValueOnce({
      savedAt: '2026-10-11T08:00:00.000Z',
      snapshot: VOICE.snapshot,
      source: 'cached',
    });
    const cached = await routeTextAction({ ...request });
    expect(cached.routing?.notice).toContain('as saved on 2026-10-11');

    mocks.loadLocalVoice.mockResolvedValueOnce({
      savedAt: null,
      snapshot: null,
      source: 'none',
    });
    const none = await routeTextAction({ ...request });
    expect(none.routing).toMatchObject({
      hasBrandVoice: false,
      voiceSource: 'none',
    });
    expect(none.routing?.notice).toContain(
      'no approved brand voice was applied',
    );
  });

  it('keeps the plain cloud error when no fallback provider is configured', async () => {
    mocks.refineText.mockRejectedValue(
      new AgentActionError('No credits', 'insufficient_credits'),
    );

    await expect(routeTextAction({ ...request })).rejects.toThrow('No credits');
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an expired sign-in',
      new HttpRequestError('Sign in', 'unauthorized', 401),
    ],
    ['an authorization failure', http(403)],
    ['a workspace error', new Error('Your workspace changed. Retry.')],
  ])('never falls back after %s', async (_label, failure) => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(failure);

    await expect(routeTextAction({ ...request })).rejects.toBe(failure);
    expect(mocks.refineText).toHaveBeenCalledTimes(1);
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid input', http(400)],
    ['a refused output', new AgentActionError('Too long', 'limit_exceeded')],
    ['an unapplied voice', new AgentActionError('Voice', 'blocked')],
  ])('does not fall back after %s', async (_label, failure) => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(failure);

    await expect(routeTextAction({ ...request })).rejects.toBe(failure);
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
  });

  it('reconciles an uncertain outcome with the same key and returns the cloud result', async () => {
    configure('claude-cli');
    mocks.refineText
      .mockRejectedValueOnce(new HttpRequestError('slow', 'timeout', null))
      .mockResolvedValueOnce({ ...CLOUD_RESULT, isReplayed: true });

    const outcome = await settle(routeTextAction({ ...request }));

    expect(outcome).toEqual({ result: { ...CLOUD_RESULT, isReplayed: true } });
    expect(mocks.refineText).toHaveBeenCalledTimes(2);
    expect(
      mocks.refineText.mock.calls.map((call) => call[0].requestKey),
    ).toEqual([KEY, KEY]);
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
  });

  it('never hands an unconfirmed outcome to another provider', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(503));

    const failure = await settle(
      routeTextAction({ ...request }).catch((e) => e),
    );

    expect(failure).toBeInstanceOf(ActionRoutingError);
    expect(failure.recovery).toEqual({
      canOpenProviderSettings: false,
      canRetry: true,
      kind: 'cloud_unconfirmed',
      retryTarget: 'cloud',
    });
    expect(mocks.refineText).toHaveBeenCalledTimes(3);
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
  });

  it('falls back once reconciliation turns the outcome into a confirmed failure', async () => {
    configure('claude-cli');
    mocks.refineText
      .mockRejectedValueOnce(new HttpRequestError('offline', 'network', null))
      .mockRejectedValueOnce(
        new AgentActionError('Down', 'provider_unavailable'),
      );

    const outcome = await settle(routeTextAction({ ...request }));

    expect(outcome.routing?.reason).toBe('service_unavailable');
    expect(mocks.refineText).toHaveBeenCalledTimes(2);
    expect(mocks.runNativeHostAction).toHaveBeenCalledTimes(1);
  });

  it('keeps the request and offers a local-only retry when the host is unreachable', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    mocks.runNativeHostAction.mockRejectedValue(
      new NativeHostError('Bridge not reachable', 'unreachable'),
    );

    const failure = await routeTextAction({ ...request }).catch((e) => e);

    expect(failure).toBeInstanceOf(ActionRoutingError);
    expect(failure.message).toBe('Bridge not reachable');
    expect(failure.recovery).toEqual({
      canOpenProviderSettings: true,
      canRetry: true,
      kind: 'host_unreachable',
      retryTarget: 'local',
    });
    expect(Object.keys(mocks.session)).toHaveLength(1);
  });

  it('retries the host only, never Genfeed, with the same key', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    mocks.runNativeHostAction.mockRejectedValueOnce(
      new NativeHostError('Bridge not reachable', 'unreachable'),
    );
    await routeTextAction({ ...request }).catch(() => undefined);
    mocks.refineText.mockClear();
    hostAnswers();

    const outcome = await routeTextAction({ ...request, retry: true });

    expect(outcome.routing?.reason).toBe('quota_exceeded');
    expect(outcome.result).toEqual(LOCAL_RESULT);
    expect(mocks.refineText).not.toHaveBeenCalled();
    expect(mocks.session).toEqual({});
  });

  it('does not retry the host for another workspace', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    mocks.runNativeHostAction.mockRejectedValueOnce(
      new NativeHostError('Bridge not reachable', 'unreachable'),
    );
    await routeTextAction({ ...request }).catch(() => undefined);
    const key = Object.keys(mocks.session)[0];
    mocks.session[key] = {
      ...(mocks.session[key] as object),
      scope: { brandId: 'brand-2', organizationId: 'org-1', userId: 'user-1' },
    };
    mocks.refineText.mockClear().mockResolvedValue(CLOUD_RESULT);

    const outcome = await routeTextAction({ ...request, retry: true });

    expect(outcome).toEqual({ result: CLOUD_RESULT });
    expect(mocks.refineText).toHaveBeenCalledTimes(1);
  });

  it('retries against Genfeed when only the cloud outcome was unconfirmed', async () => {
    configure('claude-cli');
    mocks.refineText.mockResolvedValue({ ...CLOUD_RESULT, isReplayed: true });

    const outcome = await routeTextAction({ ...request, retry: true });

    expect(outcome.routing).toBeUndefined();
    expect(mocks.refineText).toHaveBeenCalledTimes(1);
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
  });

  it('offers a retry that changes nothing when the host fails for good', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    mocks.runNativeHostAction.mockRejectedValue(
      new NativeHostError(
        'Claude Code was not found.',
        'failed',
        'provider_unavailable',
      ),
    );

    const failure = await routeTextAction({ ...request }).catch((e) => e);
    expect(failure.recovery).toMatchObject({
      canRetry: true,
      kind: 'host_failed',
      retryTarget: 'local',
    });

    mocks.runNativeHostAction.mockRejectedValue(
      new NativeHostError(
        'Not configured',
        'failed',
        'provider_not_configured',
      ),
    );
    const notConfigured = await routeTextAction({
      ...request,
      requestKey: crypto.randomUUID(),
    }).catch((e) => e);
    expect(notConfigured.recovery).toMatchObject({
      canOpenProviderSettings: true,
      canRetry: false,
      retryTarget: null,
    });
  });

  it('stops, with a local-only retry, when the brand voice cannot be loaded', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    mocks.loadLocalVoice.mockRejectedValue(new VoiceUnavailableError());

    const failure = await routeTextAction({ ...request }).catch((e) => e);

    expect(failure).toBeInstanceOf(ActionRoutingError);
    expect(failure.recovery).toMatchObject({
      canRetry: true,
      kind: 'host_failed',
      retryTarget: 'local',
    });
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
  });

  it('surfaces a sign-in problem found while loading the voice and forgets the retry', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    const denied = http(403);
    mocks.loadLocalVoice.mockRejectedValue(denied);

    await expect(routeTextAction({ ...request })).rejects.toBe(denied);
    expect(mocks.session).toEqual({});
    expect(mocks.runNativeHostAction).not.toHaveBeenCalled();
  });

  it('asks for a provider when a retry finds none configured', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    mocks.runNativeHostAction.mockRejectedValueOnce(
      new NativeHostError('Bridge not reachable', 'unreachable'),
    );
    await routeTextAction({ ...request }).catch(() => undefined);
    configure(null);

    const failure = await routeTextAction({ ...request, retry: true }).catch(
      (e) => e,
    );

    expect(failure.recovery).toMatchObject({
      canOpenProviderSettings: true,
      canRetry: false,
    });
    expect(mocks.refineText).toHaveBeenCalledTimes(1);
  });

  it('routes reply options the same way, with the tone, post and default option count', async () => {
    configure('codex-cli');
    mocks.generateReplyVariants.mockRejectedValue(http(429));
    mocks.runNativeHostAction.mockResolvedValue({
      action: 'generate_reply_variants',
      providerId: 'codex-cli',
      requestId: KEY,
      result: {
        hasBrandVoice: true,
        isReplayed: false,
        maxCharacters: 280,
        platform: 'twitter',
        tone: 'agree',
        variants: ['Agreed'],
      },
      type: 'generated',
      version: 1,
    });

    const outcome = await routeReplyVariants({
      platform: 'twitter',
      postAuthor: '@ada',
      postContent: 'We shipped.',
      requestKey: KEY,
      tone: 'agree',
    });

    expect(outcome.result.variants).toEqual(['Agreed']);
    expect(outcome.routing?.providerLabel).toBe('Codex CLI');
    expect(mocks.runNativeHostAction).toHaveBeenCalledExactlyOnceWith({
      action: {
        action: 'generate_reply_variants',
        platform: 'twitter',
        postAuthor: '@ada',
        postContent: 'We shipped.',
        tone: 'agree',
        variants: 3,
      },
      providerId: 'codex-cli',
      voice: VOICE.snapshot,
    });
  });

  it('rejects a host answer for the wrong action', async () => {
    configure('claude-cli');
    mocks.refineText.mockRejectedValue(http(429));
    mocks.runNativeHostAction.mockResolvedValue({
      action: 'generate_reply_variants',
      providerId: 'claude-cli',
      requestId: KEY,
      result: {},
      type: 'generated',
      version: 1,
    });

    const failure = await routeTextAction({ ...request }).catch((e) => e);
    expect(failure).toBeInstanceOf(ActionRoutingError);
    expect(failure.recovery.kind).toBe('host_failed');
  });
});
