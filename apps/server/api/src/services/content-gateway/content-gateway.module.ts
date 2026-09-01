import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { ContentGatewayController } from '@api/services/content-gateway/content-gateway.controller';
import { SkillWorkflowModule } from '@api/services/skill-executor/skill-executor.module';
import { Module } from '@nestjs/common';
import { ContentGatewayService } from '@server/services/content-gateway/content-gateway.service';

@Module({
  controllers: [ContentGatewayController],
  exports: [ContentGatewayService],
  imports: [BrandsCoreModule, PostsModule, SkillsModule, SkillWorkflowModule],
  providers: [ContentGatewayService],
})
export class ContentGatewayModule {}
