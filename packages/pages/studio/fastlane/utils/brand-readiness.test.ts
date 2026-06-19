import type { IBrand, ICredential } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import { isBrandReadyForFastlane } from './brand-readiness';

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

function makeCredential(platform: string): ICredential {
  return {
    id: `cred-${platform}`,
    platform: platform as ICredential['platform'],
    isConnected: true,
    externalId: 'ext-1',
    externalHandle: 'handle',
    brand: 'brand-1',
    user: {} as ICredential['user'],
    organization: {} as ICredential['organization'],
    isDeleted: false,
    createdAt: '',
    updatedAt: '',
    token: '',
  };
}

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
    isDarkroomEnabled: false,
    isActive: true,
    isSelected: true,
    scope: 'brand' as IBrand['scope'],
    user: {} as IBrand['user'],
    organization: {} as IBrand['organization'],
    credentials: [],
    links: [],
    references: [{ id: 'ref-1' } as IBrand['references'][0]],
    agentConfig: {
      voice: { tone: 'professional' },
    },
    isDeleted: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const shortFormCred = makeCredential('tiktok');

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('isBrandReadyForFastlane', () => {
  it('returns not-ready for null brand', () => {
    const result = isBrandReadyForFastlane(null, [shortFormCred]);
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain('No brand selected');
  });

  it('returns not-ready when social credential is missing but voice + reference are set', () => {
    const brand = makeBrand();
    const result = isBrandReadyForFastlane(brand, []); // no credentials
    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes('tiktok'))).toBe(
      true,
    );
  });

  it('returns ready for fully-configured brand', () => {
    const brand = makeBrand();
    const result = isBrandReadyForFastlane(brand, [shortFormCred]);
    expect(result.ready).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('accepts uppercase platform value (case-insensitive check)', () => {
    const brand = makeBrand();
    const upperCaseCred = makeCredential('INSTAGRAM');
    const result = isBrandReadyForFastlane(brand, [upperCaseCred]);
    expect(result.ready).toBe(true);
  });

  it('requires avatar + voice when avatar format is requested', () => {
    const brand = makeBrand({
      agentConfig: {
        voice: { tone: 'casual' },
        // no defaultAvatarIngredientId, no defaultVoiceId
      },
    });
    const result = isBrandReadyForFastlane(brand, [shortFormCred], ['avatar']);
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
    const result = isBrandReadyForFastlane(brand, [shortFormCred], ['avatar']);
    expect(result.ready).toBe(true);
  });

  it('treats defaultAvatarPhotoUrl as a valid avatar substitute', () => {
    const brand = makeBrand({
      agentConfig: {
        voice: { tone: 'casual' },
        defaultAvatarPhotoUrl: 'https://example.com/avatar.jpg',
        defaultVoiceId: 'voice-1',
      },
    });
    const result = isBrandReadyForFastlane(brand, [shortFormCred], ['avatar']);
    expect(result.ready).toBe(true);
  });

  it('returns not-ready when voice tone is missing', () => {
    const brand = makeBrand({
      agentConfig: {
        voice: { tone: '' },
      },
    });
    const result = isBrandReadyForFastlane(brand, [shortFormCred]);
    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes('tone'))).toBe(
      true,
    );
  });

  it('returns not-ready when no reference images', () => {
    const brand = makeBrand({ references: [] });
    const result = isBrandReadyForFastlane(brand, [shortFormCred]);
    expect(result.ready).toBe(false);
    expect(
      result.reasons.some((r) => r.toLowerCase().includes('reference')),
    ).toBe(true);
  });
});
