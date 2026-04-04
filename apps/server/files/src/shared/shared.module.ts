import { ConfigModule } from '@files/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  exports: [ConfigModule, HttpModule],
  imports: [ConfigModule, HttpModule],
})
export class SharedModule {}
