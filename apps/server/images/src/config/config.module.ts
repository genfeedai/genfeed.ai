import { ConfigService } from '@images/config/config.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  exports: [ConfigService],
  providers: [
    {
      provide: ConfigService,
      useValue: new ConfigService(),
    },
  ],
})
export class ConfigModule {}
