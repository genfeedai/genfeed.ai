import { SkillsModule } from '@api/collections/skills/skills.module';
import { forwardRef, Module } from '@nestjs/common';
import { SkillRuntimeService } from './skill-runtime.service';

@Module({
  exports: [SkillRuntimeService],
  imports: [forwardRef(() => SkillsModule)],
  providers: [SkillRuntimeService],
})
export class SkillRuntimeModule {}
