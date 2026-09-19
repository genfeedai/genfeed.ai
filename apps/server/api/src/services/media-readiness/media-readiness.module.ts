import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Deterministic pre-publish media readiness gate (#4878).
 *
 * Depends on the runtime-agnostic `@libs/prisma` client so the api and the
 * workers runtime (which consumes api as a library) both resolve the same
 * token. Both runtimes register their Prisma module globally.
 */
@Module({
  exports: [MediaReadinessService],
  imports: [FilesClientModule, LoggerModule],
  providers: [MediaReadinessService],
})
export class MediaReadinessModule {}
