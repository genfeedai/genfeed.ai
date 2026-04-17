import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [PersonasController, PersonasContentController],
  exports: [PersonasService],
  imports: [
    forwardRef(() => PersonaContentModule),
    forwardRef(() => PostsModule),
  ],
  providers: [PersonasService],
})
export class PersonasModule {}
