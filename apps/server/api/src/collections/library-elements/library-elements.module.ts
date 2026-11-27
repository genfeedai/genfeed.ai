import { LibraryElementsController } from '@api/collections/library-elements/controllers/library-elements.controller';
import { LibraryElementsService } from '@api/collections/library-elements/services/library-elements.service';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [LibraryElementsController],
  exports: [LibraryElementsService],
  imports: [PersonasCoreModule],
  providers: [LibraryElementsService],
})
export class LibraryElementsModule {}
