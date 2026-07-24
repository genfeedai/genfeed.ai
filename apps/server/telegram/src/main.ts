import { bootstrap } from '@libs/bootstrap';
import '@telegram/instrument';

bootstrap({ app: 'telegram' });

import { runService } from '@libs/bootstrap/run-service';
import { AppModule } from '@telegram/app.module';
import { ConfigService } from '@telegram/config/config.service';

void runService({
  configService: ConfigService,
  module: AppModule,
  serviceName: 'telegram',
  shell: {
    redirectPaths: ['/', '/docs'],
    redirectTarget: '/v1/health',
  },
});
