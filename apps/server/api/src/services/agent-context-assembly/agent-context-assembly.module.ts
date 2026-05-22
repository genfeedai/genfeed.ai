import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { PatternMatcherModule } from '@api/services/pattern-matcher/pattern-matcher.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [AgentContextAssemblyService],
  imports: [
    BrandsModule,
    BrandMemoryModule,
    ContextsModule,
    PatternMatcherModule,
    CredentialsCoreModule,
    OrganizationSettingsModule,
    LoggerModule,
  ],
  providers: [AgentContextAssemblyService],
})
export class AgentContextAssemblyModule {}
