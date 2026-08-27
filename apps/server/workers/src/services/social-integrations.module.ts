import { Injectable, Module } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerLinkedInTrend,
  type ServerLinkedInTrendResolver,
  type ServerYoutubeUploader,
} from '@server/server.dependencies';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Injectable()
class WorkerLinkedInTrendResolver implements ServerLinkedInTrendResolver {
  resolve(): Promise<ServerLinkedInTrend[]> {
    return Promise.resolve([]);
  }
}

@Injectable()
class WorkerYoutubeUploader implements ServerYoutubeUploader {
  uploadVideo(): Promise<string> {
    throw new Error(
      'YouTube upload stays in the API adapter. Workers refresh tokens and read video status only.',
    );
  }
}

@Module({
  imports: [WorkersDomainModule],
  providers: [
    WorkerLinkedInTrendResolver,
    WorkerYoutubeUploader,
    {
      provide: SERVER_TOKENS.linkedInTrends,
      useExisting: WorkerLinkedInTrendResolver,
    },
    {
      provide: SERVER_TOKENS.youtubeUploads,
      useExisting: WorkerYoutubeUploader,
    },
  ],
})
export class SocialIntegrationsModule {}
