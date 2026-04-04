import { ConfigModule } from '@api/config/config.module';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [FilesClientService],
  imports: [
    ConfigModule,
    HttpModule.register({
      maxRedirects: 5,
      timeout: 30000,
    }),
  ],
  providers: [FilesClientService],
})
export class FilesClientModule {}
