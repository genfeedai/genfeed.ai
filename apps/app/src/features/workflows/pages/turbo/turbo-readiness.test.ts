import type { IBrand } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { isBrandReadyForTurbo } from './turbo-readiness';

function makeBrand(overrides: Partial<IBrand> = {}): IBrand {
  return {
    id: 'brand-1',
    label: 'Test Brand',
    description: '',
    slug: 'test-brand',
    fontFamily: '',
    primaryColor: '',
    secondaryColor: '',
    backgroundColor: '',
    isVerified: false,
    isDefault: false,
    isFleetEnabled: false,
    isActive: true,
    scope: 'brand' as IBrand['scope'],
    user: {} as IBrand['user'],
    organization: {} as IBrand['organization'],
    credentials: [],
    links: [],
    references: [{ id: 'ref-1' } as NonNullable<IBrand['references']>[0]],
    agentConfig: {
      voice: { tone: 'professional' },
    },
    isDeleted: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('isBrandReadyForTurbo', () => {
  it('returns not-ready for null brand', () => {
    const result = isBrandReadyForTurbo(null);
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain('No brand selected');
  });

  it('is ready for a brand with no references, voice tone or accounts', () => {
    const brand = makeBrand({ agentConfig: {}, references: [] });
    expect(isBrandReadyForTurbo(brand, ['image', 'video']).ready).toBe(true);
    expect(isBrandReadyForTurbo(brand).ready).toBe(true);
  });

  it('requires avatar + voice when avatar format is requested', () => {
    const brand = makeBrand({
      agentConfig: {
        voice: { tone: 'casual' },
        // no defaultAvatarIngredientId, no defaultVoiceId
      },
    });
    const result = isBrandReadyForTurbo(brand, ['avatar']);
    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes('avatar'))).toBe(
      true,
    );
    expect(result.reasons.some((r) => r.toLowerCase().includes('voice'))).toBe(
      true,
    );
  });

  it('is ready for avatar format when avatar and voice are configured', () => {
    const brand = makeBrand({
      agentConfig: {
        voice: { tone: 'casual' },
        defaultAvatarIngredientId: 'avatar-1',
        defaultVoiceId: 'voice-1',
      },
    });
    expect(isBrandReadyForTurbo(brand, ['avatar']).ready).toBe(true);
  });

  it('does NOT accept defaultAvatarPhotoUrl alone for avatar format (needs an ingredient id)', () => {
    const brand = makeBrand({
      agentConfig: {
        voice: { tone: 'casual' },
        defaultAvatarPhotoUrl: 'https://example.com/avatar.jpg',
        defaultVoiceId: 'voice-1',
      },
    });
    const result = isBrandReadyForTurbo(brand, ['avatar']);
    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes('avatar'))).toBe(
      true,
    );
  });
});
