import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';
import { ApiKeyHelperService } from '@server/services/api-key/api-key-helper.service';

@Module({
  exports: [ApiKeyHelperService],
  imports: [ConfigModule],
  providers: [ApiKeyHelperService],
})
export class ApiKeyHelperModule {}
