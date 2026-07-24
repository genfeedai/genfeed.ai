import { bootstrap } from '@libs/bootstrap';
import '@voices/instrument';

bootstrap({ app: 'voices' });

import { runService } from '@libs/bootstrap/run-service';
import { AppModule } from '@voices/app.module';
import { ConfigService } from '@voices/config/config.service';

void runService({
  configService: ConfigService,
  module: AppModule,
  serviceName: 'voices',
  shell: {
    redirectPaths: ['/', '/docs'],
    redirectTarget: '/v1/health',
  },
});
