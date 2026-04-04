import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AccessBootstrapCacheService, RequestContextCacheService],
  providers: [AccessBootstrapCacheService, RequestContextCacheService],
})
export class CommonModule {}
