import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PersonasController, PersonasContentController],
  exports: [PersonasCoreModule],
  imports: [PersonasCoreModule, PersonaContentModule, PostsModule],
})
export class PersonasModule {}
