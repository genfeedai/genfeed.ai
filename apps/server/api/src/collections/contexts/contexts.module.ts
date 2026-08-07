/**
 * Contexts Module
 * Brand knowledge storage and semantic retrieval for direct context injection.
 */
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { RouterModule } from '@api/services/router/router.module';
import { ConfigModule } from '@libs/config/config.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContextsController],
  exports: [ContextsService],
  imports: [
    forwardRef(() => ByokModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RouterModule),
  ],
  providers: [ContextsService],
})
export class ContextsModule {}
