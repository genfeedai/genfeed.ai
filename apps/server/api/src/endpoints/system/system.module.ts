import { LocalhostOnlyGuard } from '@api/endpoints/system/guards/localhost-only.guard';
import { SystemController } from '@api/endpoints/system/system.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SystemController],
  providers: [LocalhostOnlyGuard],
})
export class SystemModule {}
