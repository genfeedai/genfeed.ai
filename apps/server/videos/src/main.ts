import { bootstrap } from '@libs/bootstrap';
import '@videos/instrument';

bootstrap({ app: 'videos' });

import { runService } from '@libs/bootstrap/run-service';
import { AppModule } from '@videos/app.module';
import { ConfigService } from '@videos/config/config.service';

void runService({
  configService: ConfigService,
  module: AppModule,
  serviceName: 'videos',
  shell: {
    redirectPaths: ['/', '/docs'],
    redirectTarget: '/v1/health',
  },
});
