import { ConfigModule } from '@files/config/config.module';
import { S3Service } from '@files/services/s3/s3.service';
import { YoutubeService } from '@files/services/youtube/youtube.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [YoutubeService],
  imports: [ConfigModule],
  providers: [YoutubeService, S3Service],
})
export class YoutubeModule {}
