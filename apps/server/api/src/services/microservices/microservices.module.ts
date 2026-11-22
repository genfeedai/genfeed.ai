import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [MicroservicesService],
  imports: [
    ConfigModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
  ],
  providers: [MicroservicesService],
})
export class MicroservicesModule {}
