import { ByokService } from '@api/services/byok/byok.service';
import type { ResolvedHeyGenConnection } from '@api/services/integrations/heygen/heygen-identity.types';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { ByokProvider } from '@genfeedai/contracts';
import type {
  HeyGenSpeechVoice,
  HeyGenSpeechVoiceCatalog,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';

const speechVoiceSchema = z.object({
  voice_id: z.string().trim().min(1),
  name: z.string(),
  mode: z.string().nullish(),
  language: z.string().nullish(),
  status: z.string(),
});

/**
 * HeyGen Voice (`heygen-voice-1`) voices from `GET /v3/models/audio/voices`.
 * This is a different surface from the stock `/v3/voices` catalog that avatar
 * video speaks with.
 */
@Injectable()
export class HeyGenSpeechVoicesService {
  constructor(
    private readonly heygenService: HeyGenService,
    private readonly byokService: ByokService,
  ) {}

  /**
   * `ACTIVE` HeyGen Voice clones from the workspace's own HeyGen key. The
   * endpoint lists only the key owner's voices and has no public catalogue, so
   * without a personal connection nothing is listed: the platform key's clones
   * belong to Genfeed's own workspace and must never reach a customer.
   */
  async getSpeechVoices(
    organizationId: string,
  ): Promise<HeyGenSpeechVoiceCatalog> {
    // Lookup failure is not absence: let a storage error surface.
    const credential = await this.byokService.lookupApiKeyWithIdentity(
      organizationId,
      ByokProvider.HEYGEN,
    );
    if (!credential) return { voices: [], hasPersonalConnection: false };
    return {
      voices: await this.readSpeechVoices(credential.apiKey),
      hasPersonalConnection: true,
    };
  }

  /**
   * The connection that speaks `voiceId` for this workspace and pays for it.
   * Only the workspace's own key qualifies, and HeyGen enforces ownership. The
   * platform key also reaches Genfeed's private clones, so it never speaks.
   */
  async resolveSpeechConnection(
    organizationId: string,
    _voiceId: string,
  ): Promise<ResolvedHeyGenConnection> {
    const connection =
      await this.heygenService.resolveOrganizationConnection(organizationId);
    if (connection.binding.kind !== 'byok')
      throw new BadRequestException(
        'HeyGen Voice speaks with your own voice clones. Connect your HeyGen account to use one.',
      );
    return connection;
  }

  private async readSpeechVoices(apiKey: string): Promise<HeyGenSpeechVoice[]> {
    const items = await this.heygenService.getCatalog(
      '/models/audio/voices',
      apiKey,
      100,
    );
    return items.flatMap((item) => {
      const voice = speechVoiceSchema.parse(item);
      return voice.status === 'ACTIVE'
        ? [
            {
              voiceId: voice.voice_id,
              name: voice.name,
              mode: voice.mode ?? null,
              language: voice.language ?? null,
              ownership: 'private',
            },
          ]
        : [];
    });
  }
}
