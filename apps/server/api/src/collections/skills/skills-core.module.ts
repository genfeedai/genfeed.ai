import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { ByokModule } from '@api/services/byok/byok.module';
import { Module } from '@nestjs/common';

/** Skill catalog persistence and policy without the HTTP controller surface. */
@Module({
  exports: [SkillLibraryService, SkillsService],
  imports: [ByokModule],
  providers: [SkillLibraryService, SkillsService],
})
export class SkillsCoreModule {}
