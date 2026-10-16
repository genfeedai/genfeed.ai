import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VoiceProvider } from '@genfeedai/contracts';
import type {
  HeyGenCatalogVoice,
  HeyGenGender,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

function readStoredGender(providerData: unknown): HeyGenGender | null {
  if (!providerData || typeof providerData !== 'object') return null;
  const gender = (providerData as { gender?: unknown }).gender;
  return gender === 'male' || gender === 'female' ? gender : null;
}

/**
 * Stock avatar-video voices. HeyGen's public catalogue is 300+ voices behind
 * paged requests, so the playground reads the copy the voice-catalog cron
 * already stores; only a workspace's own voices are read live.
 */
@Injectable()
export class HeyGenVoiceCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly heygenService: HeyGenService,
  ) {}

  async getVoices(organizationId: string): Promise<HeyGenCatalogVoice[]> {
    const [stored, personal] = await Promise.all([
      this.readStoredPublicVoices(organizationId),
      this.heygenService.getPersonalVoices(organizationId),
    ]);
    // Before the first sync the table is empty; read the live catalogue once.
    const publicVoices =
      stored.length > 0
        ? stored
        : await this.heygenService.getPublicVoices(organizationId);
    return [...publicVoices, ...personal].map((voice, index) => ({
      ...voice,
      index,
    }));
  }

  private async readStoredPublicVoices(
    organizationId: string,
  ): Promise<HeyGenCatalogVoice[]> {
    const rows = await this.prisma.externalVoice.findMany({
      orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
      where: {
        externalProvider: VoiceProvider.HEYGEN,
        isActive: true,
        isDefaultSelectable: true,
      },
    });
    return rows.map(
      (row, index): HeyGenCatalogVoice => ({
        connection: {
          kind: 'platform',
          organizationId,
          provider: 'heygen',
        },
        gender: readStoredGender(row.providerData),
        index,
        name: row.name,
        ownership: 'public',
        preview: row.sampleAudioUrl ?? '',
        voiceId: row.externalId,
      }),
    );
  }
}
