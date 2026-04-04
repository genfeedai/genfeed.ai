import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { PatternMatcherModule } from '@api/services/pattern-matcher/pattern-matcher.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [AgentContextAssemblyService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => BrandMemoryModule),
    forwardRef(() => ContextsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => PatternMatcherModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => OrganizationSettingsModule),
    LoggerModule,
  ],
  providers: [AgentContextAssemblyService],
})
export class AgentContextAssemblyModule {}
