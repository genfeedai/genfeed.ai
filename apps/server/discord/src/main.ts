import { bootstrap } from '@libs/bootstrap';
import '@discord/instrument';

bootstrap({ app: 'discord' });

import { AppModule } from '@discord/app.module';
import { ConfigService } from '@discord/config/config.service';
import { runService } from '@libs/bootstrap/run-service';

void runService({
  configService: ConfigService,
  module: AppModule,
  serviceName: 'discord',
});
