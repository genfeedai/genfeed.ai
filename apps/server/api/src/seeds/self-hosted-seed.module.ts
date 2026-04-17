/**
 * Self-Hosted Seed Module
 * Provides SelfHostedSeedService, which creates the default workspace on first boot
 * when running in self-hosted mode (no Clerk).
 */

import { SelfHostedSeedService } from '@api/seeds/self-hosted-seed.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [LoggerModule],
  providers: [SelfHostedSeedService],
})
export class SelfHostedSeedModule {}
