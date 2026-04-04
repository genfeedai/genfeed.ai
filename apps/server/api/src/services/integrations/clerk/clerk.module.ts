import { ClerkClientProvider } from '@api/providers/clerk.provider';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(ClerkService, {
  additionalProviders: [ClerkClientProvider],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ClerkModule {}
