import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { PersonaPhotoProcessor } from '@api/services/workflow-executor/processors/persona-photo.processor';
import { PersonaVideoProcessor } from '@api/services/workflow-executor/processors/persona-video.processor';
import { SoundOverlayProcessor } from '@api/services/workflow-executor/processors/sound-overlay.processor';
import { TrendInspirationProcessor } from '@api/services/workflow-executor/processors/trend-inspiration.processor';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    PersonaPhotoProcessor,
    PersonaVideoProcessor,
    SoundOverlayProcessor,
    TrendInspirationProcessor,
  ],
  imports: [
    FilesClientModule,
    forwardRef(() => CreditsModule),
    ModelsModule,
    NotificationsModule,
    forwardRef(() => OrganizationsModule),
    PersonaContentModule,
    ReplicateModule,
    forwardRef(() => SettingsModule),
    forwardRef(() => TrendsModule),
  ],
  providers: [
    PersonaPhotoProcessor,
    PersonaVideoProcessor,
    SoundOverlayProcessor,
    TrendInspirationProcessor,
  ],
})
export class WorkflowExecutorModule {}
