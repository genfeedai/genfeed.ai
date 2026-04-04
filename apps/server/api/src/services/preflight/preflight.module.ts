import { ConfigModule } from '@api/config/config.module';
import { PreflightController } from '@api/services/preflight/preflight.controller';
import { PreflightService } from '@api/services/preflight/preflight.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PreflightController],
  exports: [PreflightService],
  imports: [ConfigModule],
  providers: [PreflightService],
})
export class PreflightModule {}
