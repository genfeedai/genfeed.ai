import { ConfigModule } from '@files/config/config.module';
import { FileRuntimeSettingsService } from '@files/services/runtime-settings/file-runtime-settings.service';
import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [FileRuntimeSettingsService],
  exports: [FileRuntimeSettingsService, ConfigModule, HttpModule],
  imports: [ConfigModule, HttpModule],
})
export class SharedModule {}
