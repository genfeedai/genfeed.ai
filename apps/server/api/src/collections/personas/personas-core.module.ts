import { PersonaGrantReadService } from '@api/collections/personas/services/persona-grant-read.service';
import { PersonaReferencesService } from '@api/collections/personas/services/persona-references.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { Module } from '@nestjs/common';

/** Persona persistence only. Content generation stays on PersonaContentModule. */
@Module({
  exports: [PersonaGrantReadService, PersonaReferencesService, PersonasService],
  providers: [
    PersonaGrantReadService,
    PersonaReferencesService,
    PersonasService,
  ],
})
export class PersonasCoreModule {}
