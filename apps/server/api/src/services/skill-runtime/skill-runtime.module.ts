import { SkillsModule } from '@api/collections/skills/skills.module';
import { Module } from '@nestjs/common';
import { SkillRuntimeService } from '@server/services/skill-runtime/skill-runtime.service';

@Module({
  exports: [SkillRuntimeService],
  imports: [SkillsModule],
  providers: [SkillRuntimeService],
})
export class SkillRuntimeModule {}
