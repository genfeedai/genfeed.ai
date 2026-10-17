import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import type { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VoiceProvider } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ExternalVoiceCatalogService.syncFromProviders', () => {
  const now = new Date('2026-10-17T00:00:00Z');

  let prisma: {
    externalVoice: {
      updateMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
  let heygen: { getVoices: ReturnType<typeof vi.fn> };
  let service: ExternalVoiceCatalogService;

  beforeEach(() => {
    prisma = {
      externalVoice: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({ createdAt: now, updatedAt: now }),
      },
    };
    heygen = { getVoices: vi.fn() };
    service = new ExternalVoiceCatalogService(
      prisma as unknown as PrismaService,
      { log: vi.fn() } as unknown as LoggerService,
      { getVoices: vi.fn() } as unknown as ElevenLabsService,
      heygen as unknown as HeyGenService,
    );
  });

  it('deactivates HeyGen voices missing from the fetched catalog', async () => {
    heygen.getVoices.mockResolvedValue([
      { gender: 'female', index: 0, name: 'Ava', preview: '', voiceId: 'v1' },
      { gender: 'male', index: 1, name: 'Ben', preview: '', voiceId: 'v2' },
    ]);

    await service.syncFromProviders([VoiceProvider.HEYGEN]);

    expect(prisma.externalVoice.updateMany).toHaveBeenCalledWith({
      data: { isActive: false },
      where: {
        externalId: { notIn: ['v1', 'v2'] },
        externalProvider: VoiceProvider.HEYGEN,
        isActive: true,
      },
    });
  });

  it('keeps the existing catalog when HeyGen returns no voices', async () => {
    heygen.getVoices.mockResolvedValue([]);

    await service.syncFromProviders([VoiceProvider.HEYGEN]);

    expect(prisma.externalVoice.updateMany).not.toHaveBeenCalled();
  });
});
