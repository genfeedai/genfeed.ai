import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ApiKeyHelperService],
  imports: [ConfigModule],
  providers: [ApiKeyHelperService],
})
export class ApiKeyHelperModule {}
