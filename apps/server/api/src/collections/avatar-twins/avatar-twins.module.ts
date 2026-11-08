import { AvatarTwinsController } from '@api/collections/avatar-twins/controllers/avatar-twins.controller';
import { AvatarTwinsService } from '@api/collections/avatar-twins/services/avatar-twins.service';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AvatarTwinsController],
  exports: [AvatarTwinsService],
  imports: [HeyGenModule],
  providers: [AvatarTwinsService],
})
export class AvatarTwinsModule {}
