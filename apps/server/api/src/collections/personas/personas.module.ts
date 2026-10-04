import { CharacterImageInspectionController } from '@api/collections/personas/controllers/character-image-inspection.controller';
import { PersonaGrantsController } from '@api/collections/personas/controllers/persona-grants.controller';
import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { CharacterImageInspectionService } from '@api/collections/personas/services/character-image-inspection.service';
import { CharacterOwnershipService } from '@api/collections/personas/services/character-ownership.service';
import { PersonaGrantsService } from '@api/collections/personas/services/persona-grants.service';
import { PostsModule } from '@api/collections/posts/posts.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    PersonaGrantsController,
    PersonasController,
    PersonasContentController,
    CharacterImageInspectionController,
  ],
  exports: [PersonasCoreModule],
  imports: [
    PersonasCoreModule,
    PersonaContentModule,
    PostsModule,
    OpenRouterModule,
  ],
  providers: [
    CharacterImageInspectionService,
    CharacterOwnershipService,
    PersonaGrantsService,
  ],
})
export class PersonasModule {}
