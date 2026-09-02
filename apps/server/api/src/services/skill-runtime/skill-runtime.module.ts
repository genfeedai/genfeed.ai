import { SkillsModule } from '@api/collections/skills/skills.module';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [SkillRuntimeService],
  imports: [SkillsModule],
  providers: [SkillRuntimeService],
})
export class SkillRuntimeModule {}
