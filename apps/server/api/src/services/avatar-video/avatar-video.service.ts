import type { AvatarVideoProvider } from '@api/services/avatar-video/avatar-video-provider.interface';
import { DidAvatarProvider } from '@api/services/avatar-video/providers/did-avatar.provider';
import { HeygenAvatarProvider } from '@api/services/avatar-video/providers/heygen-avatar.provider';
import { MusetalkAvatarProvider } from '@api/services/avatar-video/providers/musetalk-avatar.provider';
import { TavusAvatarProvider } from '@api/services/avatar-video/providers/tavus-avatar.provider';
import {
  type AvatarVideoProviderName,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
  type SupportedAvatarVideoProviderName,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Factory / router for avatar video generation providers.
 *
 * Resolves the requested provider name to its concrete implementation.
 * Defaults to HeyGen when an unknown name is supplied.
 */
@Injectable()
export class AvatarVideoService {
  private readonly providers: Record<
    AvatarVideoProviderName,
    AvatarVideoProvider
  >;

  constructor(
    private readonly heygenProvider: HeygenAvatarProvider,
    private readonly didProvider: DidAvatarProvider,
    private readonly tavusProvider: TavusAvatarProvider,
    private readonly musetalkProvider: MusetalkAvatarProvider,
    private readonly logger: LoggerService,
  ) {
    this.providers = {
      did: this.didProvider,
      heygen: this.heygenProvider,
      musetalk: this.musetalkProvider,
      tavus: this.tavusProvider,
    };
  }

  getProvider(name: AvatarVideoProviderName = 'heygen'): AvatarVideoProvider {
    if (!isSupportedAvatarVideoProviderName(name)) {
      this.logger.warn(
        `AvatarVideoService unavailable provider "${name}" requested`,
      );
      throw new BadRequestException(
        `Avatar video provider "${name}" is not available. Supported providers: ${SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES.join(
          ', ',
        )}.`,
      );
    }

    const provider = this.providers[name];

    if (!provider) {
      this.logger.warn(
        `AvatarVideoService unknown provider "${name}", falling back to heygen`,
      );
      return this.heygenProvider;
    }

    return provider;
  }

  getSupportedProviders(): SupportedAvatarVideoProviderName[] {
    return [...SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES];
  }
}
