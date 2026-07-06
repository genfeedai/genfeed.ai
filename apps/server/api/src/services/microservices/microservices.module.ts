import { MicroservicesService } from '@api/services/microservices/microservices.service';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [MicroservicesService],
  imports: [ConfigModule, HttpModule],
  providers: [MicroservicesService],
})
export class MicroservicesModule {}
