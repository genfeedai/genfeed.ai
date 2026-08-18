import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import { ArgilAvatarProvider } from '@api/services/avatar-video/providers/argil-avatar.provider';
import { DidAvatarProvider } from '@api/services/avatar-video/providers/did-avatar.provider';
import { HeygenAvatarProvider } from '@api/services/avatar-video/providers/heygen-avatar.provider';
import { MusetalkAvatarProvider } from '@api/services/avatar-video/providers/musetalk-avatar.provider';
import { TavusAvatarProvider } from '@api/services/avatar-video/providers/tavus-avatar.provider';
import { ByokModule } from '@api/services/byok/byok.module';
import { ArgilModule } from '@api/services/integrations/argil/argil.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [ArgilAvatarProvider, AvatarVideoService, HeygenAvatarProvider],
  imports: [
    ArgilModule,
    HeyGenModule,
    ByokModule,
    HttpModule,
    LoggerModule,
    ApiKeyHelperModule,
  ],
  providers: [
    ArgilAvatarProvider,
    AvatarVideoService,
    HeygenAvatarProvider,
    DidAvatarProvider,
    TavusAvatarProvider,
    MusetalkAvatarProvider,
  ],
})
export class AvatarVideoModule {}
