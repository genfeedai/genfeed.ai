import { PersonasService } from '@server/collections/personas/services/personas.service';
import { Module } from '@nestjs/common';

/** Persona persistence only. Content generation stays on PersonaContentModule. */
@Module({
  exports: [PersonasService],
  providers: [PersonasService],
})
export class PersonasCoreModule {}
