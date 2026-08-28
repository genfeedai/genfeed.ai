import {
  type AvatarVideoProviderName,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
  type SupportedAvatarVideoProviderName,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AvatarVideoProvider } from '@server/services/avatar-video/avatar-video-provider.interface';
import { ArgilAvatarProvider } from '@server/services/avatar-video/providers/argil-avatar.provider';
import { DidAvatarProvider } from '@server/services/avatar-video/providers/did-avatar.provider';
import { GenfeedaiAvatarProvider } from '@server/services/avatar-video/providers/genfeedai-avatar.provider';
import { HeygenAvatarProvider } from '@server/services/avatar-video/providers/heygen-avatar.provider';
import { MusetalkAvatarProvider } from '@server/services/avatar-video/providers/musetalk-avatar.provider';
import { TavusAvatarProvider } from '@server/services/avatar-video/providers/tavus-avatar.provider';

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
    private readonly argilProvider: ArgilAvatarProvider,
    private readonly genfeedaiProvider: GenfeedaiAvatarProvider,
    private readonly heygenProvider: HeygenAvatarProvider,
    private readonly didProvider: DidAvatarProvider,
    private readonly tavusProvider: TavusAvatarProvider,
    private readonly musetalkProvider: MusetalkAvatarProvider,
    private readonly logger: LoggerService,
  ) {
    this.providers = {
      argil: this.argilProvider,
      genfeedai: this.genfeedaiProvider,
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
