import {
  resolveVideoCapabilityReferences,
  resolveVideoIdentityReferencePlan,
} from '@api/services/generation-brief/resolve-video-identity-reference-plan';
import { MINIMAX_H3_MODEL_KEY } from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { ClipChainIdentityReference } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const identityReferences: ClipChainIdentityReference[] = [
  { assetId: 'character-1', role: 'character' },
  { assetId: 'product-1', role: 'product' },
  { assetId: 'room-1', role: 'subject' },
];

describe('resolveVideoCapabilityReferences', () => {
  it('resolves the standalone and family profiles by model key', () => {
    expect(
      resolveVideoCapabilityReferences(MINIMAX_H3_MODEL_KEY)?.roles,
    ).toContain('character');
    expect(
      resolveVideoCapabilityReferences(
        MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      )?.nativeFields,
    ).toContain('reference_images');
    expect(resolveVideoCapabilityReferences('unregistered/model')).toBe(
      undefined,
    );
  });
});

describe('resolveVideoIdentityReferencePlan', () => {
  it('keeps the last-frame start image and every identity still when the model has a multi-image field', () => {
    const plan = resolveVideoIdentityReferencePlan({
      firstFrameAssetId: 'last-frame-from-segment-1',
      identityReferences,
      modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    });

    expect(plan.references).toEqual([
      { assetId: 'last-frame-from-segment-1', role: 'first_frame' },
      ...identityReferences,
    ]);
    expect(plan.endFrameId).toBeUndefined();
    expect(plan.identityLock).toEqual({
      omittedFrameRoles: [],
      omittedReferences: [],
      references: identityReferences,
    });
  });

  it('keeps an authored end frame alongside identity stills when the profile supports interpolation', () => {
    const plan = resolveVideoIdentityReferencePlan({
      firstFrameAssetId: 'opening-1',
      identityReferences,
      lastFrameAssetId: 'end-1',
      modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    });

    expect(plan.endFrameId).toBe('end-1');
    expect(plan.identityLock.omittedFrameRoles).toEqual([]);
  });

  it('drops the frame handoff and keeps the character still when the model only has a start-frame slot', () => {
    const plan = resolveVideoIdentityReferencePlan({
      firstFrameAssetId: 'last-frame-from-segment-1',
      identityReferences,
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
    });

    // The character sheet becomes the opening still — never the previous
    // clip's last frame — and the omitted handoff is recorded.
    expect(plan.references).toEqual([
      { assetId: 'character-1', role: 'subject' },
    ]);
    expect(plan.identityLock.omittedFrameRoles).toEqual(['first_frame']);
    expect(plan.identityLock.references).toEqual([identityReferences[0]]);
    expect(plan.identityLock.omittedReferences).toEqual(
      identityReferences.slice(1),
    );
    expect(plan.identityLock.reason).toContain('identity stills win');
  });

  it('records nothing omitted on a single-slot model when there is no frame handoff', () => {
    const plan = resolveVideoIdentityReferencePlan({
      identityReferences: [identityReferences[0]],
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
    });

    expect(plan.identityLock.omittedFrameRoles).toEqual([]);
    expect(plan.identityLock.omittedReferences).toEqual([]);
  });

  it('fails closed for a model without image references', () => {
    expect(() =>
      resolveVideoIdentityReferencePlan({
        identityReferences,
        modelKey: 'unregistered/model',
      }),
    ).toThrow('cannot honor identity references');
    // Veo 3 is registered but text-only: no start frame, no identity field.
    expect(() =>
      resolveVideoIdentityReferencePlan({
        identityReferences,
        modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      }),
    ).toThrow('cannot honor an identity lock');
    expect(() =>
      resolveVideoIdentityReferencePlan({
        identityReferences: [],
        modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      }),
    ).toThrow('requires identity refs');
  });
});
