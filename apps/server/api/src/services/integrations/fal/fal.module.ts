import { FalService } from '@api/services/integrations/fal/fal.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [FalService],
  imports: [ConfigModule, HttpModule, LoggerModule],
  providers: [FalService],
})
export class FalModule {}
