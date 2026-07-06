import { PreflightController } from '@api/services/preflight/preflight.controller';
import { PreflightService } from '@api/services/preflight/preflight.service';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PreflightController],
  exports: [PreflightService],
  imports: [ConfigModule],
  providers: [PreflightService],
})
export class PreflightModule {}
