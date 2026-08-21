import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import { SkillsCoreModule } from '@api/collections/skills/skills-core.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SkillsController],
  exports: [SkillsCoreModule],
  imports: [SkillsCoreModule],
})
export class SkillsModule {}
