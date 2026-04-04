import { ConfigModule } from '@api/config/config.module';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [FalService],
  imports: [ConfigModule, HttpModule, LoggerModule],
  providers: [FalService],
})
export class FalModule {}
