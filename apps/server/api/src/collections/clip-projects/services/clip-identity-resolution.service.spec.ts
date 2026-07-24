import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';

describe('ClipIdentityResolutionService', () => {
  const organizationId = 'org-1';
  const brandId = 'brand-1';
  const prisma = {
    brand: {
      findFirst: vi.fn(),
    },
    organizationSetting: {
      findUnique: vi.fn(),
    },
  };
  const service = new ClipIdentityResolutionService(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: {
        heygenAvatarId: 'brand-avatar-1',
        heygenVoiceId: 'brand-voice-1',
      },
      id: brandId,
    });
    prisma.organizationSetting.findUnique.mockResolvedValue(null);
  });

  it('resolves selected brand defaults inside the caller organization', async () => {
    const identity = await service.resolve({ brandId, organizationId });

    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      select: {
        agentConfig: true,
        id: true,
      },
      where: {
        id: brandId,
        isDeleted: false,
        organizationId,
      },
    });
    expect(identity).toEqual({
      avatarId: 'brand-avatar-1',
      avatarProvider: 'heygen',
      isComplete: true,
      label: 'Brand clip defaults',
      missing: [],
      source: 'brand',
      useIdentity: true,
      voiceId: 'brand-voice-1',
      voiceProvider: 'heygen',
    });
  });

  it('combines a brand avatar with the organization HeyGen voice fallback', async () => {
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: {
        heygenAvatarId: 'brand-avatar-2',
      },
      id: brandId,
    });
    prisma.organizationSetting.findUnique.mockResolvedValue({
      defaultVoiceId: null,
      defaultVoiceProvider: null,
      defaultVoiceRef: {
        externalVoiceId: 'org-voice-2',
        provider: 'heygen',
        source: 'catalog',
      },
    });

    const identity = await service.resolve({ brandId, organizationId });

    expect(identity).toEqual(
      expect.objectContaining({
        avatarId: 'brand-avatar-2',
        isComplete: true,
        source: 'brand',
        voiceId: 'org-voice-2',
      }),
    );
  });

  it('lets explicit values override saved defaults', async () => {
    const identity = await service.resolve({
      avatarId: 'explicit-avatar',
      brandId,
      organizationId,
      voiceId: 'explicit-voice',
    });

    expect(identity).toEqual(
      expect.objectContaining({
        avatarId: 'explicit-avatar',
        source: 'explicit',
        voiceId: 'explicit-voice',
      }),
    );
  });

  it('rejects a brand outside the caller organization', async () => {
    prisma.brand.findFirst.mockResolvedValue(null);

    await expect(
      service.resolve({ brandId, organizationId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('surfaces missing identity fields without raw provider IDs', async () => {
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: {},
      id: brandId,
    });

    const identity = await service.resolve({ brandId, organizationId });

    expect(identity).toEqual({
      avatarId: undefined,
      avatarProvider: undefined,
      isComplete: false,
      label: 'Missing avatar and voice defaults',
      missing: ['avatar', 'voice'],
      source: 'missing',
      useIdentity: true,
      voiceId: undefined,
      voiceProvider: undefined,
    });
  });
});
