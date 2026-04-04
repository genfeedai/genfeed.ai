import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentDraftsModule } from '@api/collections/content-drafts/content-drafts.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { ContentGatewayController } from '@api/services/content-gateway/content-gateway.controller';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { SkillExecutorModule } from '@api/services/skill-executor/skill-executor.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContentGatewayController],
  exports: [ContentGatewayService],
  imports: [
    BrandsModule,
    ContentDraftsModule,
    SkillsModule,
    SkillExecutorModule,
  ],
  providers: [ContentGatewayService],
})
export class ContentGatewayModule {}
