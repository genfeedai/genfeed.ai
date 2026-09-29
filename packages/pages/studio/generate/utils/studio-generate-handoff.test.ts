import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildStudioSettingsPatchFromHandoff,
  resolveHandoffIdentityNotice,
  resolveHandoffModelKey,
  studioHandoffReferenceRole,
} from './studio-generate-handoff';

function handoff(
  overrides: Partial<AgentStudioHandoffPayload> = {},
): AgentStudioHandoffPayload {
  return {
    brandId: 'brand-1',
    modelKey: 'provider/model-x',
    prompt: 'A futuristic city at sunset',
    type: 'image',
    ...overrides,
  };
}

describe('buildStudioSettingsPatchFromHandoff', () => {
  it('maps resolution when present', () => {
    const patch = buildStudioSettingsPatchFromHandoff(
      handoff({ resolution: '4k' }),
    );
    expect(patch.resolution).toBe('4k');
  });
});

describe('resolveHandoffModelKey', () => {
  const models = [{ key: 'provider/model-x' }, { key: 'provider/model-y' }];

  it('keeps a model key present in the org allowlist', () => {
    expect(resolveHandoffModelKey('provider/model-x', models)).toEqual({
      isFallback: false,
      modelKey: 'provider/model-x',
    });
  });
});

describe('resolveHandoffIdentityNotice', () => {
  it('does not require an avatar on a voice-only handoff', () => {
    expect(
      resolveHandoffIdentityNotice(
        handoff({ type: 'voice', voiceId: 'voice-1' }),
      ),
    ).toBeNull();
    expect(resolveHandoffIdentityNotice(handoff({ type: 'voice' }))).toContain(
      'voice',
    );
  });
});

describe('studioHandoffReferenceRole', () => {
  it('treats every other type as a plain reference', () => {
    expect(studioHandoffReferenceRole('image')).toBe('reference');
    expect(studioHandoffReferenceRole('music')).toBe('reference');
    expect(studioHandoffReferenceRole('avatar')).toBe('reference');
    expect(studioHandoffReferenceRole('voice')).toBe('reference');
  });
});
