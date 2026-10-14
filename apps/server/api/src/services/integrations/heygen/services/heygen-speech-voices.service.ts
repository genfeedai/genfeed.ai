import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import type { ResolvedHeyGenConnection } from '@api/services/integrations/heygen/heygen-identity.types';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { ApiKeyCategory, ByokProvider } from '@genfeedai/contracts';
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
    private readonly apiKeyHelperService: ApiKeyHelperService,
  ) {}

  /**
   * Voices the workspace can speak with: `ACTIVE` private clones from its own
   * HeyGen key, plus HeyGen's public HeyGen Voice voices read with the key
   * that would speak them (the workspace key when connected, otherwise the
   * platform key). The platform key's private clones belong to Genfeed's own
   * workspace and are never listed.
   */
  async getSpeechVoices(
    organizationId: string,
  ): Promise<HeyGenSpeechVoiceCatalog> {
    // Lookup failure is not absence: let a storage error surface.
    const credential = await this.byokService.lookupApiKeyWithIdentity(
      organizationId,
      ByokProvider.HEYGEN,
    );
    const apiKey =
      credential?.apiKey ??
      this.apiKeyHelperService.getApiKey(ApiKeyCategory.HEYGEN);
    if (!apiKey) return { voices: [], hasPersonalConnection: false };
    const sources: Promise<HeyGenSpeechVoice[]>[] = [
      ...(credential ? [this.readSpeechVoices(apiKey, 'private')] : []),
      this.readSpeechVoices(apiKey, 'public'),
    ];
    const results = await Promise.allSettled(sources);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure && results.every((result) => result.status === 'rejected'))
      throw failure.reason;
    return {
      voices: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
      hasPersonalConnection: Boolean(credential),
    };
  }

  /**
   * The connection that speaks `voiceId` for this workspace and pays for it.
   * A workspace key reaches its own clones and HeyGen enforces ownership. The
   * platform key also reaches Genfeed's private clones, so on the platform key
   * only an `ACTIVE` public HeyGen Voice voice is accepted.
   */
  async resolveSpeechConnection(
    organizationId: string,
    voiceId: string,
  ): Promise<ResolvedHeyGenConnection> {
    const connection =
      await this.heygenService.resolveOrganizationConnection(organizationId);
    if (connection.binding.kind === 'byok') return connection;
    const publicVoices = await this.readSpeechVoices(
      connection.apiKey,
      'public',
    );
    if (!publicVoices.some((voice) => voice.voiceId === voiceId))
      throw new BadRequestException(
        'This HeyGen voice needs your own HeyGen connection. Connect HeyGen or pick a public HeyGen Voice voice.',
      );
    return connection;
  }

  private async readSpeechVoices(
    apiKey: string,
    ownership: 'private' | 'public',
  ): Promise<HeyGenSpeechVoice[]> {
    const items = await this.heygenService.getCatalog(
      '/models/audio/voices',
      apiKey,
      100,
      { type: ownership },
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
              ownership,
            },
          ]
        : [];
    });
  }
}
