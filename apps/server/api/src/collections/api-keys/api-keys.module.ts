/**
 * Api Keys Module
 * API key management: generate keys, revoke access, key scoping,
and usage monitoring.
 */
import { ApiKeysController } from '@api/collections/api-keys/controllers/api-keys.controller';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ApiKeysController],
  exports: [ApiKeysService],
  imports: [],
  providers: [ApiKeysService],
})
export class ApiKeysModule {}
