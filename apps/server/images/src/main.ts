import '@images/instrument';
import { bootstrap } from '@libs/bootstrap';

bootstrap({ app: 'images' });

import { AppModule } from '@images/app.module';
import { ConfigService } from '@images/config/config.service';
import { runService } from '@libs/bootstrap/run-service';

void runService({
  configService: ConfigService,
  module: AppModule,
  serviceName: 'images',
});
