import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { RouterController } from '@api/services/router/router.controller';
import { RouterService } from '@api/services/router/router.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [RouterController],
  exports: [RouterService],
  imports: [LoggerModule, ModelsModule, OrganizationSettingsModule],
  providers: [RouterService],
})
export class RouterModule {}
