import { BrandRemixPersonaResolutionService } from '@api/collections/content-runs/services/brand-remix-persona-resolution.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BrandRemixAdPlatform,
  type BrandRemixDraft,
  BrandRemixOrganicPlatform,
  type BrandRemixTarget,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { CredentialPlatform, PersonaStatus } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const defaultIdentity = {
  avatarAssetId: 'brand-avatar',
  speechVoiceId: 'brand-voice',
};
const target: BrandRemixTarget = {
  kind: 'organic',
  platform: BrandRemixOrganicPlatform.INSTAGRAM,
};
const input = {
  brandId: 'brand-1',
  credentialId: 'credential-1',
  defaultIdentity,
  organizationId: 'org-1',
  target,
};
const persona = {
  avatarIngredientId: 'persona-avatar',
  id: 'persona-1',
  voiceIngredientId: 'persona-voice',
};

const platformCases: [BrandRemixTarget, CredentialPlatform][] = [
  [
    { kind: 'organic', platform: BrandRemixOrganicPlatform.INSTAGRAM },
    CredentialPlatform.INSTAGRAM,
  ],
  [
    { kind: 'organic', platform: BrandRemixOrganicPlatform.YOUTUBE },
    CredentialPlatform.YOUTUBE,
  ],
  [
    { kind: 'organic', platform: BrandRemixOrganicPlatform.TIKTOK },
    CredentialPlatform.TIKTOK,
  ],
  [
    { kind: 'organic', platform: BrandRemixOrganicPlatform.X },
    CredentialPlatform.TWITTER,
  ],
  [
    { kind: 'paid', platform: BrandRemixAdPlatform.X },
    CredentialPlatform.X_ADS,
  ],
  [
    { kind: 'paid', platform: BrandRemixAdPlatform.META },
    CredentialPlatform.FACEBOOK,
  ],
  [
    { kind: 'paid', platform: BrandRemixAdPlatform.GOOGLE },
    CredentialPlatform.GOOGLE_ADS,
  ],
  [
    { kind: 'paid', platform: BrandRemixAdPlatform.TIKTOK },
    CredentialPlatform.TIKTOK,
  ],
];

describe('BrandRemixPersonaResolutionService', () => {
  const prisma = {
    credential: { findFirst: vi.fn() },
    persona: { findMany: vi.fn() },
  };
  let resolver: BrandRemixPersonaResolutionService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.credential.findFirst.mockResolvedValue({ id: 'credential-1' });
    prisma.persona.findMany.mockResolvedValue([]);
    resolver = new BrandRemixPersonaResolutionService(
      prisma as unknown as PrismaService,
    );
  });

  it('uses brand defaults without querying when there is no destination', async () => {
    await expect(
      resolver.resolve({ ...input, credentialId: undefined }),
    ).resolves.toEqual({
      identity: defaultIdentity,
      source: 'brand_default',
    });
    expect(prisma.credential.findFirst).not.toHaveBeenCalled();
    expect(prisma.persona.findMany).not.toHaveBeenCalled();
  });

  it.each<BrandRemixDraft['identity']>([
    {},
    { avatarAssetId: 'explicit-avatar', speechVoiceId: 'explicit-voice' },
  ])(
    'honors explicit identity %j after validating the destination without looking up personas',
    async (explicitIdentity) => {
      await expect(
        resolver.resolve({ ...input, explicitIdentity }),
      ).resolves.toEqual({
        identity: explicitIdentity,
        source: 'explicit',
      });
      expect(prisma.credential.findFirst).toHaveBeenCalledOnce();
      expect(prisma.persona.findMany).not.toHaveBeenCalled();
    },
  );

  it('honors explicit identity without a destination', async () => {
    await expect(
      resolver.resolve({
        ...input,
        credentialId: undefined,
        explicitIdentity: {},
      }),
    ).resolves.toEqual({
      identity: {},
      source: 'explicit',
    });
    expect(prisma.credential.findFirst).not.toHaveBeenCalled();
    expect(prisma.persona.findMany).not.toHaveBeenCalled();
  });

  it.each(platformCases)(
    'validates scoped connected credentials for %j',
    async (destination, platform) => {
      await resolver.resolve({ ...input, target: destination });
      expect(prisma.credential.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          brandId: 'brand-1',
          id: 'credential-1',
          isConnected: true,
          isDeleted: false,
          organizationId: 'org-1',
          platform,
        },
      });
    },
  );

  it.each([
    { isConnected: false },
    { isDeleted: true },
    { organizationId: 'other-org' },
    { brandId: 'other-brand' },
    { platform: CredentialPlatform.YOUTUBE },
  ])(
    'rejects unavailable destinations even with explicit identity: %j',
    async (override) => {
      const credential = {
        brandId: 'brand-1',
        id: 'credential-1',
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-1',
        platform: CredentialPlatform.INSTAGRAM,
        ...override,
      };
      prisma.credential.findFirst.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            Object.entries(where).every(
              ([key, value]) =>
                credential[key as keyof typeof credential] === value,
            )
              ? credential
              : null,
          ),
      );
      await expect(
        resolver.resolve({ ...input, explicitIdentity: {} }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.persona.findMany).not.toHaveBeenCalled();
    },
  );

  it('uses brand defaults only when no active account persona matches the exact tenant filters', async () => {
    await expect(resolver.resolve(input)).resolves.toEqual({
      identity: defaultIdentity,
      source: 'brand_default',
    });
    expect(prisma.persona.findMany).toHaveBeenCalledWith({
      select: { avatarIngredientId: true, id: true, voiceIngredientId: true },
      take: 2,
      where: {
        brandId: 'brand-1',
        credentials: { some: { id: 'credential-1' } },
        isDeleted: false,
        organizationId: 'org-1',
        status: PersonaStatus.ACTIVE,
      },
    });
  });

  it('returns the complete avatar and voice pair from one persona', async () => {
    prisma.persona.findMany.mockResolvedValue([persona]);
    await expect(resolver.resolve(input)).resolves.toEqual({
      identity: {
        avatarAssetId: 'persona-avatar',
        speechVoiceId: 'persona-voice',
      },
      personaId: 'persona-1',
      source: 'account_persona',
    });
  });

  it.each([
    { avatarIngredientId: null, voiceIngredientId: 'persona-voice' },
    { avatarIngredientId: 'persona-avatar', voiceIngredientId: null },
    { avatarIngredientId: null, voiceIngredientId: null },
  ])(
    'blocks incomplete persona %j without filling from brand defaults',
    async (identity) => {
      prisma.persona.findMany.mockResolvedValue([{ ...persona, ...identity }]);
      await expect(resolver.resolve(input)).rejects.toThrow(
        'needs both an avatar and a voice',
      );
    },
  );

  it('blocks multiple complete personas instead of selecting the first', async () => {
    prisma.persona.findMany.mockResolvedValue([
      persona,
      { ...persona, id: 'persona-2' },
    ]);
    await expect(resolver.resolve(input)).rejects.toThrow(
      'multiple active personas',
    );
  });

  it('never combines an avatar and voice from separate personas', async () => {
    prisma.persona.findMany.mockResolvedValue([
      { ...persona, voiceIngredientId: null },
      { ...persona, avatarIngredientId: null, id: 'persona-2' },
    ]);
    await expect(resolver.resolve(input)).rejects.toThrow(
      'multiple active personas',
    );
  });
});
