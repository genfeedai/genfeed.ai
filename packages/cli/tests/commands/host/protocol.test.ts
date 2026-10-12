import {
  nativeHostRequestSchema,
  nativeHostResponseSchema,
  nativeHostVoiceSnapshotV1Schema,
} from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import { NATIVE_HOST_PROVIDER_IDS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  detectRequest,
  REQUEST_ID,
  refineRequest,
  repliesRequest,
  voiceSnapshot,
} from './fixtures';

describe('native host request contract', () => {
  it('accepts detect, refine and reply requests', () => {
    expect(nativeHostRequestSchema.safeParse(detectRequest()).success).toBe(true);
    expect(nativeHostRequestSchema.safeParse(refineRequest()).success).toBe(true);
    expect(
      nativeHostRequestSchema.safeParse(repliesRequest({ voice: voiceSnapshot() })).success
    ).toBe(true);
  });

  it.each(NATIVE_HOST_PROVIDER_IDS)('accepts provider %s', (providerId) => {
    expect(nativeHostRequestSchema.safeParse(refineRequest({ providerId })).success).toBe(true);
  });

  it.each([
    ['an unknown provider', refineRequest({ providerId: 'rm-rf' })],
    ['a wrong version', refineRequest({ version: 2 })],
    ['a non-uuid request id', refineRequest({ requestId: 'abc' })],
    ['an unknown top-level field', { ...refineRequest(), extra: true }],
    ['an unknown action', refineRequest({ action: { action: 'delete', platform: 'twitter' } })],
    [
      'an unknown mode',
      refineRequest({
        action: { action: 'refine_text', mode: 'translate', platform: 'twitter', text: 'hi' },
      }),
    ],
    [
      'blank text',
      refineRequest({
        action: { action: 'refine_text', mode: 'rewrite', platform: 'twitter', text: '   ' },
      }),
    ],
    [
      'text over the cloud limit',
      refineRequest({
        action: {
          action: 'refine_text',
          mode: 'rewrite',
          platform: 'twitter',
          text: 'x'.repeat(10_001),
        },
      }),
    ],
    [
      'an unknown tone',
      repliesRequest({
        action: {
          action: 'generate_reply_variants',
          platform: 'twitter',
          postContent: 'hi',
          tone: 'rude',
          variants: 1,
        },
      }),
    ],
    [
      'too many variants',
      repliesRequest({
        action: {
          action: 'generate_reply_variants',
          platform: 'twitter',
          postContent: 'hi',
          tone: 'agree',
          variants: 6,
        },
      }),
    ],
    ['a missing voice field', (({ voice: _voice, ...rest }) => rest)(refineRequest())],
  ])('rejects %s', (_label, request) => {
    expect(nativeHostRequestSchema.safeParse(request).success).toBe(false);
  });

  it('bounds the voice snapshot', () => {
    const tooLong = {
      ...voiceSnapshot(),
      voice: { ...voiceSnapshot().voice, guidelines: 'x'.repeat(3_001) },
    };
    expect(nativeHostVoiceSnapshotV1Schema.safeParse(tooLong).success).toBe(false);
    const tooMany = {
      ...voiceSnapshot(),
      voice: { ...voiceSnapshot().voice, values: Array.from({ length: 13 }, (_, i) => `v${i}`) },
    };
    expect(nativeHostVoiceSnapshotV1Schema.safeParse(tooMany).success).toBe(false);
    expect(
      nativeHostVoiceSnapshotV1Schema.safeParse({ ...voiceSnapshot(), apiKey: 'sk-live' }).success
    ).toBe(false);
  });
});

describe('native host response contract', () => {
  const base = { requestId: REQUEST_ID, version: 1 } as const;

  it('accepts every response kind', () => {
    const responses = [
      {
        ...base,
        hostVersion: '0.6.0',
        providers: [{ id: 'claude-cli', isAvailable: true, kind: 'cli', label: 'Claude Code' }],
        type: 'detected',
      },
      {
        ...base,
        action: 'refine_text',
        providerId: 'claude-cli',
        result: {
          hasBrandVoice: false,
          isReplayed: false,
          maxCharacters: 280,
          mode: 'rewrite',
          platform: 'twitter',
          text: 'The launch is live',
          voiceHint: 'hint',
        },
        type: 'generated',
      },
      {
        ...base,
        action: 'generate_reply_variants',
        providerId: 'codex-cli',
        result: {
          hasBrandVoice: true,
          isReplayed: false,
          maxCharacters: 280,
          platform: 'twitter',
          tone: 'agree',
          variants: ['one', 'two'],
        },
        type: 'generated',
      },
      {
        code: 'provider_failed',
        message: 'It failed',
        requestId: null,
        type: 'failed',
        version: 1,
      },
    ];
    for (const response of responses) {
      expect(nativeHostResponseSchema.safeParse(response).success).toBe(true);
    }
  });

  it('never lets a response carry a key or an unknown field', () => {
    const detected = {
      ...base,
      hostVersion: '0.6.0',
      providers: [
        { apiKey: 'sk-live', id: 'openai-api', isAvailable: true, kind: 'api', label: 'OpenAI' },
      ],
      type: 'detected',
    };
    expect(nativeHostResponseSchema.safeParse(detected).success).toBe(false);
  });
});
