import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@slack/config/config.service';

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
