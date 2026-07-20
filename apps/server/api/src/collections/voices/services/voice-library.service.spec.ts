import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { VoiceProvider } from '@genfeedai/enums';
import { HttpStatus } from '@nestjs/common';

vi.mock('@api/helpers/utils/sort/sort.util', () => ({
  handleQuerySort: vi.fn(() => ({ createdAt: -1 })),
}));

describe('VoiceLibraryService', () => {
  const brandId = 'brand-1';
  const organizationId = 'org-1';
  const user = {
    id: 'user-1',
    publicMetadata: {
      brand: brandId,
      organization: organizationId,
      user: 'canonical-user-1',
    },
  } as User;
  let voicesService: { findAll: ReturnType<typeof vi.fn> };
  let service: VoiceLibraryService;

  beforeEach(() => {
    voicesService = { findAll: vi.fn().mockResolvedValue({ docs: [] }) };
    service = new VoiceLibraryService(
      voicesService as unknown as VoicesService,
    );
  });

  it('builds the tenant-scoped cloned/generated voice query', async () => {
    await service.findAll(user, {
      isActive: true,
      providers: [VoiceProvider.ELEVENLABS],
      search: ' narrator ',
    } as VoicesQueryDto);

    expect(voicesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: -1 },
        where: expect.objectContaining({
          AND: [
            {
              OR: expect.arrayContaining([
                { label: { contains: 'narrator', mode: 'insensitive' } },
              ]),
            },
          ],
          OR: [{ isCloned: true }, { externalVoiceCatalogId: { not: null } }],
          brandId,
          category: 'VOICE',
          isDeleted: false,
          isVoiceActive: { not: false },
          organizationId,
          voiceProvider: { in: [VoiceProvider.ELEVENLABS] },
        }),
      }),
      expect.any(Object),
    );
  });

  it('ignores query attempts to override tenant scope', async () => {
    await service.findAll(user, {
      brand: 'attacker-brand',
      organization: 'attacker-org',
    } as unknown as VoicesQueryDto);

    const query = voicesService.findAll.mock.calls[0]?.[0];
    expect(query.where).toMatchObject({ brandId, organizationId });
  });

  it('scopes cloned voices by organizationId', async () => {
    await service.findCloned(user, {} as VoicesQueryDto);

    expect(voicesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category: 'VOICE',
          isCloned: true,
          isDeleted: false,
          organizationId,
        },
      }),
      expect.any(Object),
    );
  });

  it('keeps the established library failure response', async () => {
    voicesService.findAll.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.findAll(user, {} as VoicesQueryDto),
    ).rejects.toMatchObject({
      message: 'Failed to find voices',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });
});
