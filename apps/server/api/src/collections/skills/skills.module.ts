import { BrandsModule } from '@api/collections/brands/brands.module';
import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { ByokModule } from '@api/services/byok/byok.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [SkillsController],
  exports: [SkillsService],
  imports: [forwardRef(() => BrandsModule), ByokModule],
  providers: [SkillsService],
})
export class SkillsModule {}
