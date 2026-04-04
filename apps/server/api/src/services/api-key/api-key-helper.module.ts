import { ConfigModule } from '@api/config/config.module';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [ApiKeyHelperService],
  imports: [ConfigModule],
  providers: [ApiKeyHelperService],
})
export class ApiKeyHelperModule {}
