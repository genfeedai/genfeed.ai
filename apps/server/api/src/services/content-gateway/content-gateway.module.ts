import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { ContentGatewayController } from '@api/services/content-gateway/content-gateway.controller';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { SkillExecutorModule } from '@api/services/skill-executor/skill-executor.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContentGatewayController],
  exports: [ContentGatewayService],
  imports: [
    BrandsCoreModule,
    forwardRef(() => PostsModule),
    forwardRef(() => SkillsModule),
    forwardRef(() => SkillExecutorModule),
  ],
  providers: [ContentGatewayService],
})
export class ContentGatewayModule {}
