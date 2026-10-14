import { SelfHostedSeedService } from '@api/seeds/self-hosted-seed.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [LoggerModule],
  providers: [SelfHostedSeedService],
})
export class SelfHostedSeedModule {}
