import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { VoiceProvider } from '@genfeedai/contracts';

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
      avatarProvider: VoiceProvider.HEYGEN,
      isComplete: true,
      label: 'Brand clip defaults',
      missing: [],
      source: 'brand',
      useIdentity: true,
      voiceId: 'brand-voice-1',
      voiceProvider: VoiceProvider.HEYGEN,
    });
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
});
