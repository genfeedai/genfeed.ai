import { AutonomousProducerInstallService } from '@api/collections/workflows/autonomous-producers/autonomous-producer-install.service';
import { Module } from '@nestjs/common';

/**
 * A leaf module: the catalog is resolved lazily through its DI token, so the
 * brand and campaign modules can install producers without importing the
 * workflows module (which already imports them).
 */
@Module({
  exports: [AutonomousProducerInstallService],
  providers: [AutonomousProducerInstallService],
})
export class AutonomousProducerInstallModule {}
