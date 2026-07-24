import { bootstrap } from '@libs/bootstrap';
import '@slack/instrument';

bootstrap({ app: 'slack' });

import { runService } from '@libs/bootstrap/run-service';
import { AppModule } from '@slack/app.module';
import { ConfigService } from '@slack/config/config.service';

void runService({
  configService: ConfigService,
  module: AppModule,
  serviceName: 'slack',
});
