import { HealthController } from '@libs/health/health.controller';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
