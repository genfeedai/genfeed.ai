import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { ByokModule } from '@api/services/byok/byok.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SkillsController],
  exports: [SkillsService],
  imports: [BrandsCoreModule, ByokModule],
  providers: [SkillsService],
})
export class SkillsModule {}
