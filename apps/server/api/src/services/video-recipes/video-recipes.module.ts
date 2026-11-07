import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { RouterModule } from '@api/services/router/router.module';
import { VideoRecipeRoutingService } from '@api/services/video-recipes/video-recipe-routing.service';
import { VideoRecipesController } from '@api/services/video-recipes/video-recipes.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [VideoRecipesController],
  exports: [VideoRecipeRoutingService],
  imports: [ModelsModule, OrganizationSettingsModule, RouterModule],
  providers: [VideoRecipeRoutingService],
})
export class VideoRecipesModule {}
