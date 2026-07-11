import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

@Module({
  exports: [FilesClientService],
  imports: [
    forwardRef(() => ConfigModule),
    HttpModule.register({
      maxRedirects: 5,
      timeout: 30000,
    }),
  ],
  providers: [FilesClientService],
})
export class FilesClientModule {}
