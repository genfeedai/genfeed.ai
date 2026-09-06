import { LocalhostOnlyGuard } from '@api/endpoints/system/guards/localhost-only.guard';
import { ReleasesService } from '@api/endpoints/system/releases.service';
import { SystemController } from '@api/endpoints/system/system.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SystemController],
  providers: [LocalhostOnlyGuard, ReleasesService],
})
export class SystemModule {}
