import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';

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
