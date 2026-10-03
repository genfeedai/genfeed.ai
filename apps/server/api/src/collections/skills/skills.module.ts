import { SkillLibraryController } from '@api/collections/skills/controllers/skill-library.controller';
import { SkillPackageImportController } from '@api/collections/skills/controllers/skill-package-import.controller';
import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import { SkillsCoreModule } from '@api/collections/skills/skills-core.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    SkillLibraryController,
    SkillPackageImportController,
    SkillsController,
  ],
  exports: [SkillsCoreModule],
  imports: [SkillsCoreModule],
})
export class SkillsModule {}
