import { SkillsService } from '@api/collections/skills/services/skills.service';
import { ByokModule } from '@api/services/byok/byok.module';
import { Module } from '@nestjs/common';

/** Skill catalog persistence and policy without the HTTP controller surface. */
@Module({
  exports: [SkillsService],
  imports: [ByokModule],
  providers: [SkillsService],
})
export class SkillsCoreModule {}
