import { CharacterImageInspectionController } from '@api/collections/personas/controllers/character-image-inspection.controller';
import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { CharacterImageInspectionService } from '@api/collections/personas/services/character-image-inspection.service';
import { PostsModule } from '@api/collections/posts/posts.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
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
  providers: [CharacterImageInspectionService],
})
export class PersonasModule {}
